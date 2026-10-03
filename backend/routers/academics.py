"""Academics & HR router: subjects, grades, class-subjects, departments,
designations, employees, roles and the permission catalogue.

Mounted at /api alongside the other Phase-1 routers. Collection routes keep
trailing slashes, every route requires an authenticated user, and writes are
admin-only (employees additionally allow staff read with an `hr`/`staff` grant).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from auth import get_current_user, get_user_permissions, require_role, resolve_student_ids
from database import get_db
from models import (
    AcademicYear, ClassSection, ClassSubject, Department, Designation, Employee,
    Grade, Permission, Role, RolePermission, Student, Subject, TeacherAssignment, User,
)
from routers.engagement import log_audit
from schemas import (
    ClassSubjectCreate, ClassSubjectResponse, ClassSubjectUpdate,
    DepartmentCreate, DepartmentResponse, DepartmentUpdate,
    DesignationCreate, DesignationResponse, DesignationUpdate,
    EmployeeCreate, EmployeeResponse, EmployeeUpdate,
    GradeCreate, GradeResponse, GradeUpdate,
    PermissionResponse,
    RoleCreate, RolePermissionCreate, RolePermissionResponse, RoleResponse, RoleUpdate,
    SubjectCreate, SubjectResponse, SubjectUpdate,
)

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _integrity_detail(exc: IntegrityError, message: str) -> HTTPException:
    """Map a SQLite unique-constraint failure to a clean 400 (never a 500)."""
    text = str(getattr(exc, "orig", exc)).lower()
    if "unique" in text or "constraint" in text:
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"{message} (database constraint: {getattr(exc, 'orig', exc)})",
    )


def _apply_updates(obj, payload) -> None:
    """Copy an Update model's explicitly-set fields onto an ORM row."""
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)


def _employee_read_guard(user: User, db: Session) -> bool:
    """Employees are readable by admins, or staff holding an `hr`/`staff` read grant."""
    if user.role == "admin":
        return True
    perms = get_user_permissions(user, db)
    if ("*", "*") in perms:
        return True
    if user.role == "staff" and (("hr", "read") in perms or ("staff", "read") in perms):
        return True
    return False


# ─── Subjects ────────────────────────────────────────────────────────────────

@router.get("/subjects/", response_model=List[SubjectResponse], summary="List subjects")
def list_subjects(
    category: Optional[str] = Query(None, description="Filter by category"),
    is_active: Optional[bool] = Query(None, description="Filter by active flag"),
    q: Optional[str] = Query(None, description="Search name/code"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List subjects. Any authenticated user."""
    query = db.query(Subject)
    if category is not None:
        query = query.filter(Subject.category == category)
    if is_active is not None:
        query = query.filter(Subject.is_active == is_active)  # noqa: E712
    if q:
        like = f"%{q}%"
        query = query.filter(Subject.name.ilike(like) | Subject.code.ilike(like))
    return query.order_by(Subject.name).offset(skip).limit(limit).all()


@router.post("/subjects/", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED,
             summary="Create subject (admin)")
def create_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a subject. Admin only.

    Raises:
        HTTPException: 400 if the name or code already exists.
    """
    obj = Subject(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A subject with this name or code already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "subject.create", "subjects", obj.id)
    return obj


@router.get("/subjects/{subject_id}", response_model=SubjectResponse, summary="Get subject by ID")
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single subject by ID. Any authenticated user."""
    obj = db.query(Subject).filter(Subject.id == subject_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Subject with id {subject_id} not found")
    return obj


@router.put("/subjects/{subject_id}", response_model=SubjectResponse, summary="Update subject (admin)")
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a subject. Admin only."""
    obj = db.query(Subject).filter(Subject.id == subject_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Subject with id {subject_id} not found")
    _apply_updates(obj, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A subject with this name or code already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "subject.update", "subjects", obj.id)
    return obj


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete subject (admin)")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a subject. Admin only."""
    obj = db.query(Subject).filter(Subject.id == subject_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Subject with id {subject_id} not found")
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "subject.delete", "subjects", subject_id)


# ─── Grades ──────────────────────────────────────────────────────────────────

@router.get("/grades/", response_model=List[GradeResponse], summary="List grades")
def list_grades(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List grades ordered by display order. Any authenticated user."""
    return (db.query(Grade)
            .order_by(Grade.display_order.is_(None), Grade.display_order, Grade.name)
            .offset(skip).limit(limit).all())


@router.post("/grades/", response_model=GradeResponse, status_code=status.HTTP_201_CREATED,
             summary="Create grade (admin)")
def create_grade(
    payload: GradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a grade. Admin only."""
    obj = Grade(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A grade with this name already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "grade.create", "grades", obj.id)
    return obj


@router.get("/grades/{grade_id}", response_model=GradeResponse, summary="Get grade by ID")
def get_grade(
    grade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a grade by ID. Any authenticated user."""
    obj = db.query(Grade).filter(Grade.id == grade_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Grade with id {grade_id} not found")
    return obj


@router.put("/grades/{grade_id}", response_model=GradeResponse, summary="Update grade (admin)")
def update_grade(
    grade_id: int,
    payload: GradeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a grade. Admin only."""
    obj = db.query(Grade).filter(Grade.id == grade_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Grade with id {grade_id} not found")
    _apply_updates(obj, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A grade with this name already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "grade.update", "grades", obj.id)
    return obj


@router.delete("/grades/{grade_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete grade (admin)")
def delete_grade(
    grade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a grade. Admin only."""
    obj = db.query(Grade).filter(Grade.id == grade_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Grade with id {grade_id} not found")
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "grade.delete", "grades", grade_id)


# ─── Class Subjects ──────────────────────────────────────────────────────────

@router.get("/class-subjects/", response_model=List[ClassSubjectResponse],
            summary="List class-subject mappings")
def list_class_subjects(
    class_section_id: Optional[int] = Query(None, description="Filter by class section"),
    subject_id: Optional[int] = Query(None, description="Filter by subject"),
    academic_year_id: Optional[int] = Query(None, description="Filter by academic year"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List class-subject mappings. Teachers are scoped to their own sections."""
    query = db.query(ClassSubject)
    if class_section_id is not None:
        query = query.filter(ClassSubject.class_section_id == class_section_id)
    if subject_id is not None:
        query = query.filter(ClassSubject.subject_id == subject_id)
    if academic_year_id is not None:
        query = query.filter(ClassSubject.academic_year_id == academic_year_id)

    if current_user.role == "teacher":
        if current_user.teacher_id is None:
            return []
        rows = (db.query(TeacherAssignment.class_section_id)
                .filter(TeacherAssignment.teacher_id == current_user.teacher_id)
                .distinct().all())
        section_ids = [r[0] for r in rows if r[0] is not None]
        if not section_ids:
            return []
        query = query.filter(ClassSubject.class_section_id.in_(section_ids))
    elif current_user.role in ("student", "parent"):
        student_ids = resolve_student_ids(current_user, db) or []
        if not student_ids:
            return []
        sections = [r[0] for r in db.query(Student.class_section_id)
                    .filter(Student.id.in_(student_ids)).all()]
        sections = [s for s in sections if s is not None]
        if not sections:
            return []
        query = query.filter(ClassSubject.class_section_id.in_(sections))

    return query.order_by(ClassSubject.class_section_id).offset(skip).limit(limit).all()


@router.post("/class-subjects/", response_model=ClassSubjectResponse,
             status_code=status.HTTP_201_CREATED, summary="Create class-subject mapping (admin)")
def create_class_subject(
    payload: ClassSubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Map a subject to a class section. Admin only."""
    if db.query(ClassSection).filter(ClassSection.id == payload.class_section_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Class section with id {payload.class_section_id} not found")
    if db.query(Subject).filter(Subject.id == payload.subject_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Subject with id {payload.subject_id} not found")
    if payload.academic_year_id is not None and \
            db.query(AcademicYear).filter(AcademicYear.id == payload.academic_year_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Academic year with id {payload.academic_year_id} not found")
    obj = ClassSubject(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "This subject is already mapped to that class section")
    db.refresh(obj)
    log_audit(db, current_user.id, "class_subject.create", "class_subjects", obj.id)
    return obj


@router.put("/class-subjects/{class_subject_id}", response_model=ClassSubjectResponse,
            summary="Update class-subject mapping (admin)")
def update_class_subject(
    class_subject_id: int,
    payload: ClassSubjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a class-subject mapping. Admin only."""
    obj = db.query(ClassSubject).filter(ClassSubject.id == class_subject_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Class subject with id {class_subject_id} not found")
    _apply_updates(obj, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "This subject is already mapped to that class section")
    db.refresh(obj)
    log_audit(db, current_user.id, "class_subject.update", "class_subjects", obj.id)
    return obj


@router.delete("/class-subjects/{class_subject_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete class-subject mapping (admin)")
def delete_class_subject(
    class_subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a class-subject mapping. Admin only."""
    obj = db.query(ClassSubject).filter(ClassSubject.id == class_subject_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Class subject with id {class_subject_id} not found")
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "class_subject.delete", "class_subjects", class_subject_id)


# ─── Departments (admin only) ────────────────────────────────────────────────

@router.get("/departments/", response_model=List[DepartmentResponse], summary="List departments (admin)")
def list_departments(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """List departments. Admin only."""
    return db.query(Department).order_by(Department.name).offset(skip).limit(limit).all()


@router.post("/departments/", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED,
             summary="Create department (admin)")
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a department. Admin only."""
    obj = Department(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A department with this name already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "department.create", "departments", obj.id)
    return obj


@router.get("/departments/{department_id}", response_model=DepartmentResponse,
            summary="Get department by ID (admin)")
def get_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Get a department by ID. Admin only."""
    obj = db.query(Department).filter(Department.id == department_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Department with id {department_id} not found")
    return obj


@router.put("/departments/{department_id}", response_model=DepartmentResponse,
            summary="Update department (admin)")
def update_department(
    department_id: int,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a department. Admin only."""
    obj = db.query(Department).filter(Department.id == department_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Department with id {department_id} not found")
    _apply_updates(obj, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A department with this name already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "department.update", "departments", obj.id)
    return obj


@router.delete("/departments/{department_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete department (admin)")
def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a department. Admin only."""
    obj = db.query(Department).filter(Department.id == department_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Department with id {department_id} not found")
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "department.delete", "departments", department_id)


# ─── Designations (admin only) ────────────────────────────────────────────────

@router.get("/designations/", response_model=List[DesignationResponse], summary="List designations (admin)")
def list_designations(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """List designations. Admin only."""
    query = db.query(Designation)
    if department_id is not None:
        query = query.filter(Designation.department_id == department_id)
    return query.order_by(Designation.name).offset(skip).limit(limit).all()


@router.post("/designations/", response_model=DesignationResponse, status_code=status.HTTP_201_CREATED,
             summary="Create designation (admin)")
def create_designation(
    payload: DesignationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a designation. Admin only."""
    if payload.department_id is not None and \
            db.query(Department).filter(Department.id == payload.department_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Department with id {payload.department_id} not found")
    obj = Designation(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A designation with this name already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "designation.create", "designations", obj.id)
    return obj


@router.get("/designations/{designation_id}", response_model=DesignationResponse,
            summary="Get designation by ID (admin)")
def get_designation(
    designation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Get a designation by ID. Admin only."""
    obj = db.query(Designation).filter(Designation.id == designation_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Designation with id {designation_id} not found")
    return obj


@router.put("/designations/{designation_id}", response_model=DesignationResponse,
            summary="Update designation (admin)")
def update_designation(
    designation_id: int,
    payload: DesignationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a designation. Admin only."""
    obj = db.query(Designation).filter(Designation.id == designation_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Designation with id {designation_id} not found")
    _apply_updates(obj, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A designation with this name already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "designation.update", "designations", obj.id)
    return obj


@router.delete("/designations/{designation_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete designation (admin)")
def delete_designation(
    designation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a designation. Admin only."""
    obj = db.query(Designation).filter(Designation.id == designation_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Designation with id {designation_id} not found")
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "designation.delete", "designations", designation_id)


# ─── Employees ───────────────────────────────────────────────────────────────

@router.get("/employees/", response_model=List[EmployeeResponse], summary="List employees")
def list_employees(
    skip: int = 0,
    limit: int = 100,
    department_id: Optional[int] = Query(None, description="Filter by department"),
    employee_type: Optional[str] = Query(None, description="Filter by employee type"),
    q: Optional[str] = Query(None, description="Search first/last name or email"),
    is_active: Optional[bool] = Query(None, description="Filter by active flag"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List employees. Admin, or staff holding an `hr`/`staff` read grant."""
    if not _employee_read_guard(current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view employees.",
        )
    query = db.query(Employee)
    if department_id is not None:
        query = query.filter(Employee.department_id == department_id)
    if employee_type is not None:
        query = query.filter(Employee.employee_type == employee_type)
    if is_active is not None:
        query = query.filter(Employee.is_active == is_active)  # noqa: E712
    if q:
        like = f"%{q}%"
        query = query.filter(
            Employee.first_name.ilike(like)
            | Employee.last_name.ilike(like)
            | Employee.email.ilike(like)
            | Employee.employee_code.ilike(like)
        )
    return (query.order_by(Employee.first_name, Employee.last_name)
            .offset(skip).limit(limit).all())


@router.post("/employees/", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED,
             summary="Create employee (admin)")
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create an HR employee record. Admin only."""
    data = payload.model_dump()
    user_id = data.pop("user_id", None)
    if user_id is not None and db.query(User).filter(User.id == user_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"User with id {user_id} not found")
    if data.get("department_id") is not None and \
            db.query(Department).filter(Department.id == data["department_id"]).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Department with id {data['department_id']} not found")
    if data.get("designation_id") is not None and \
            db.query(Designation).filter(Designation.id == data["designation_id"]).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Designation with id {data['designation_id']} not found")
    obj = Employee(user_id=user_id, **data)
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "Email, employee code or linked user already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "employee.create", "employees", obj.id)
    return obj


@router.get("/employees/{employee_id}", response_model=EmployeeResponse, summary="Get employee by ID")
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get an employee by ID. Admin, or staff holding an `hr`/`staff` read grant."""
    if not _employee_read_guard(current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view employees.",
        )
    obj = db.query(Employee).filter(Employee.id == employee_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Employee with id {employee_id} not found")
    return obj


@router.put("/employees/{employee_id}", response_model=EmployeeResponse, summary="Update employee (admin)")
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update an employee record. Admin only."""
    obj = db.query(Employee).filter(Employee.id == employee_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Employee with id {employee_id} not found")
    _apply_updates(obj, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "Email, employee code or linked user already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "employee.update", "employees", obj.id)
    return obj


@router.delete("/employees/{employee_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete employee (admin)")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete an employee record. Admin only."""
    obj = db.query(Employee).filter(Employee.id == employee_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Employee with id {employee_id} not found")
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "employee.delete", "employees", employee_id)


# ─── Roles (admin only) ──────────────────────────────────────────────────────

@router.get("/roles/", response_model=List[RoleResponse], summary="List roles (admin)")
def list_roles(
    is_system: Optional[bool] = Query(None, description="Filter by system flag"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """List roles. Admin only."""
    query = db.query(Role)
    if is_system is not None:
        query = query.filter(Role.is_system == is_system)  # noqa: E712
    return query.order_by(Role.name).offset(skip).limit(limit).all()


@router.post("/roles/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED,
             summary="Create role (admin)")
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a custom role. Admin only."""
    obj = Role(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A role with this name already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "role.create", "roles", obj.id)
    return obj


@router.get("/roles/{role_id}", response_model=RoleResponse, summary="Get role by ID (admin)")
def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Get a role by ID. Admin only."""
    obj = db.query(Role).filter(Role.id == role_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Role with id {role_id} not found")
    return obj


@router.put("/roles/{role_id}", response_model=RoleResponse, summary="Update role (admin)")
def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a role. Admin only. System roles may be edited, never deleted."""
    obj = db.query(Role).filter(Role.id == role_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Role with id {role_id} not found")
    _apply_updates(obj, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "A role with this name already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "role.update", "roles", obj.id)
    return obj


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete role (admin)")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a custom role. Admin only.

    Raises:
        HTTPException: 400 when the role is a system role (is_system=True).
    """
    obj = db.query(Role).filter(Role.id == role_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Role with id {role_id} not found")
    if bool(obj.is_system):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{obj.name}' is a system role and cannot be deleted. "
                   f"Revoke its permissions via role-permissions instead.",
        )
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "role.delete", "roles", role_id)


# ─── Role permissions (admin only) ────────────────────────────────────────────

@router.get("/role-permissions/", response_model=List[RolePermissionResponse],
            summary="List role-permission grants (admin)")
def list_role_permissions(
    role_id: Optional[int] = Query(None, description="Filter by role ID"),
    permission_id: Optional[int] = Query(None, description="Filter by permission ID"),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """List role-permission grants. Admin only."""
    query = db.query(RolePermission)
    if role_id is not None:
        query = query.filter(RolePermission.role_id == role_id)
    if permission_id is not None:
        query = query.filter(RolePermission.permission_id == permission_id)
    return query.offset(skip).limit(limit).all()


@router.post("/role-permissions/", response_model=RolePermissionResponse,
             status_code=status.HTTP_201_CREATED, summary="Grant permission to role (admin)")
def create_role_permission(
    payload: RolePermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Grant a permission to a role. Admin only."""
    if db.query(Role).filter(Role.id == payload.role_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Role with id {payload.role_id} not found")
    if db.query(Permission).filter(Permission.id == payload.permission_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Permission with id {payload.permission_id} not found")
    obj = RolePermission(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, "This permission is already granted to that role")
    db.refresh(obj)
    log_audit(db, current_user.id, "role_permission.create", "role_permissions", obj.id)
    return obj


@router.delete("/role-permissions/{role_permission_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Revoke permission from role (admin)")
def delete_role_permission(
    role_permission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Revoke a permission from a role. Admin only."""
    obj = db.query(RolePermission).filter(RolePermission.id == role_permission_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Role permission with id {role_permission_id} not found")
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "role_permission.delete", "role_permissions", role_permission_id)


# ─── Permission catalogue (metadata) ──────────────────────────────────────────

@router.get("/permissions/", response_model=List[PermissionResponse],
            summary="List the full permission catalogue")
def list_permissions(
    module: Optional[str] = Query(None, description="Filter by module"),
    action: Optional[str] = Query(None, description="Filter by action"),
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List every (module, action) permission. Any authenticated user (metadata)."""
    query = db.query(Permission)
    if module is not None:
        query = query.filter(Permission.module == module)
    if action is not None:
        query = query.filter(Permission.action == action)
    return query.order_by(Permission.module, Permission.action).offset(skip).limit(limit).all()
