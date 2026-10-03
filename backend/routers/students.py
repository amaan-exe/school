"""Student router with CRUD endpoints (Phase-2 authorization hardening)."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import Student, User
from schemas import StudentCreate, StudentUpdate, StudentResponse
from auth import get_current_user, resolve_student_ids

router = APIRouter()


def _staff_can(db: Session, user: User, module: str, action: str = "read") -> bool:
    """Mirror require_permission(module, action) for mixed-role endpoints."""
    if user.role != "staff":
        return False
    from models import StaffPermission, StaffProfile
    column = {"read": "can_read", "write": "can_write", "delete": "can_delete"}.get(action, "can_read")
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    if profile is None:
        return False
    perm = (
        db.query(StaffPermission)
        .filter(StaffPermission.staff_profile_id == profile.id,
                StaffPermission.module == module)
        .first()
    )
    return bool(perm is not None and getattr(perm, column, False))


def _audit(db: Session, user: User, action: str, entity_id=None):
    try:
        from routers.engagement import log_audit
        log_audit(db, user.id, action, "students", entity_id)
    except Exception:
        pass


@router.get("/", response_model=List[StudentResponse], summary="Get all students")
def get_students(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve students scoped by role.

    Admin / staff (with students:read) see all; teachers see assigned-section
    students; students see [own] (403 if unlinked); parents see linked children.
    """
    if current_user.role == "admin":
        return db.query(Student).offset(skip).limit(limit).all()
    if current_user.role == "staff":
        if not _staff_can(db, current_user, "students", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Insufficient permissions for module 'students'.")
        return db.query(Student).offset(skip).limit(limit).all()
    if current_user.role == "teacher":
        ids = resolve_student_ids(current_user, db) or []
        if not ids:
            return []
        return db.query(Student).filter(Student.id.in_(ids)).offset(skip).limit(limit).all()
    if current_user.role == "student":
        if current_user.student_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="No student profile linked to this user")
        own = db.query(Student).filter(Student.id == current_user.student_id).first()
        if own is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="No student profile linked to this user")
        return [own]
    if current_user.role == "parent":
        ids = resolve_student_ids(current_user, db) or []
        if not ids:
            return []
        return db.query(Student).filter(Student.id.in_(ids)).offset(skip).limit(limit).all()
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")


@router.get("/{student_id}", response_model=StudentResponse, summary="Get student by ID")
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a specific student (scoped; mismatched scope -> 403)."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )
    if current_user.role == "admin":
        return student
    if current_user.role == "staff":
        if not _staff_can(db, current_user, "students", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Insufficient permissions for module 'students'.")
        return student
    if current_user.role == "teacher":
        ids = resolve_student_ids(current_user, db) or []
        if student_id not in ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student is forbidden")
        return student
    if current_user.role == "student":
        if current_user.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student is forbidden")
        return student
    if current_user.role == "parent":
        ids = resolve_student_ids(current_user, db) or []
        if student_id not in ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student is forbidden")
        return student
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")


def _require_write(db: Session, user: User):
    if user.role == "admin":
        return
    if _staff_can(db, user, "students", "write"):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Insufficient permissions for module 'students'.")


@router.post("/", response_model=StudentResponse, status_code=status.HTTP_201_CREATED, summary="Create a new student")
def create_student(
    student: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new student record. Admin or staff with students:write."""
    _require_write(db, current_user)
    db_student = Student(**student.model_dump())
    db.add(db_student)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student email or admission number already exists",
        )
    db.refresh(db_student)
    _audit(db, current_user, "student.create", db_student.id)
    return db_student


@router.put("/{student_id}", response_model=StudentResponse, summary="Update a student")
def update_student(
    student_id: int,
    student_update: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing student. Admin or staff with students:write."""
    _require_write(db, current_user)
    db_student = db.query(Student).filter(Student.id == student_id).first()
    if db_student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )

    update_data = student_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_student, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student email or admission number already exists",
        )
    db.refresh(db_student)
    _audit(db, current_user, "student.update", db_student.id)
    return db_student


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a student")
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a student record. Admin or staff with students:write/delete."""
    if current_user.role == "admin":
        pass
    elif _staff_can(db, current_user, "students", "delete") or _staff_can(db, current_user, "students", "write"):
        pass
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Insufficient permissions for module 'students'.")
    db_student = db.query(Student).filter(Student.id == student_id).first()
    if db_student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )

    db.delete(db_student)
    db.commit()
    _audit(db, current_user, "student.delete", student_id)
