"""Marks router (Phase-2 hardening).

Reads scoped via resolve_student_ids (mismatched -> 403). Teacher writes only
for (subject, class_section) in own TeacherAssignments (student section inferred
via Student.class_section_id). score must satisfy 0<=score<=max_score (400).
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Mark, Student, TeacherAssignment, User
from schemas import MarkCreate, MarkUpdate, MarkResponse
from auth import get_current_user, resolve_student_ids

router = APIRouter()


def _staff_can(db: Session, user: User, module: str, action: str = "read") -> bool:
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
        log_audit(db, user.id, action, "marks", entity_id)
    except Exception:
        pass


def _scoped_ids(user: User, db: Session):
    if user.role == "admin":
        return None
    if user.role == "staff":
        if not _staff_can(db, user, "marks", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Insufficient permissions for module 'marks'.")
        return None
    return resolve_student_ids(user, db) or []


def _check_teacher_scope(db: Session, user: User, student: Student, subject: str):
    """Teacher must hold an assignment for (student's section, subject)."""
    if user.role != "teacher":
        return
    if user.teacher_id is None or student.class_section_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not assigned to this student's class/subject")
    ok = (
        db.query(TeacherAssignment)
        .filter(TeacherAssignment.teacher_id == user.teacher_id,
                TeacherAssignment.class_section_id == student.class_section_id,
                TeacherAssignment.subject == subject)
        .first()
    )
    if ok is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not assigned to this student's class/subject")


def _check_score(score: float, max_score: float):
    if score < 0 or score > max_score:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Score must satisfy 0 <= score <= max_score")


@router.get("/", response_model=List[MarkResponse], summary="Get all marks")
def get_marks(
    skip: int = 0,
    limit: int = 100,
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    subject: Optional[str] = Query(None, description="Filter by subject name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve marks scoped by role (mismatched scope -> 403)."""
    scoped = _scoped_ids(current_user, db)
    query = db.query(Mark)

    if scoped is not None:
        if student_id is not None and student_id not in scoped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student's records is forbidden")
        if student_id is not None:
            query = query.filter(Mark.student_id == student_id)
        else:
            query = query.filter(Mark.student_id.in_(scoped)) if scoped else query.filter(False)
    else:
        if student_id is not None:
            query = query.filter(Mark.student_id == student_id)
    if subject is not None:
        query = query.filter(Mark.subject == subject)

    marks = query.offset(skip).limit(limit).all()
    return marks


@router.get("/{mark_id}", response_model=MarkResponse, summary="Get mark by ID")
def get_mark(
    mark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a specific mark (scoped; mismatched -> 403)."""
    mark = db.query(Mark).filter(Mark.id == mark_id).first()
    if mark is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mark record with id {mark_id} not found",
        )
    scoped = _scoped_ids(current_user, db)
    if scoped is not None and mark.student_id not in scoped:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access to this student's records is forbidden")
    return mark


def _require_write(db: Session, user: User):
    if user.role in ("admin", "teacher"):
        return
    if _staff_can(db, user, "marks", "write"):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Insufficient permissions for module 'marks'.")


@router.post("/", response_model=MarkResponse, status_code=status.HTTP_201_CREATED, summary="Create a new mark")
def create_mark(
    mark: MarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a mark (admin / assigned-subject teacher / staff-write)."""
    _require_write(db, current_user)
    _check_score(mark.score, mark.max_score)
    student = db.query(Student).filter(Student.id == mark.student_id).first()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {mark.student_id} not found",
        )
    _check_teacher_scope(db, current_user, student, mark.subject)

    db_mark = Mark(**mark.model_dump())
    db.add(db_mark)
    db.commit()
    db.refresh(db_mark)
    _audit(db, current_user, "mark.create", db_mark.id)
    return db_mark


@router.put("/{mark_id}", response_model=MarkResponse, summary="Update a mark")
def update_mark(
    mark_id: int,
    mark_update: MarkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a mark (admin / assigned-subject teacher / staff-write)."""
    _require_write(db, current_user)
    db_mark = db.query(Mark).filter(Mark.id == mark_id).first()
    if db_mark is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mark record with id {mark_id} not found",
        )
    student = db.query(Student).filter(Student.id == db_mark.student_id).first()
    update_data = mark_update.model_dump(exclude_unset=True)
    eff_subject = update_data.get("subject", db_mark.subject)
    eff_score = update_data.get("score", db_mark.score)
    eff_max = update_data.get("max_score", db_mark.max_score)
    _check_score(eff_score, eff_max)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student with id {db_mark.student_id} not found")
    _check_teacher_scope(db, current_user, student, eff_subject)

    for field, value in update_data.items():
        setattr(db_mark, field, value)

    db.commit()
    db.refresh(db_mark)
    _audit(db, current_user, "mark.update", db_mark.id)
    return db_mark


@router.delete("/{mark_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a mark")
def delete_mark(
    mark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a mark (admin / assigned-subject teacher / staff-write)."""
    if current_user.role in ("admin", "teacher"):
        pass
    elif _staff_can(db, current_user, "marks", "delete") or _staff_can(db, current_user, "marks", "write"):
        pass
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Insufficient permissions for module 'marks'.")
    db_mark = db.query(Mark).filter(Mark.id == mark_id).first()
    if db_mark is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mark record with id {mark_id} not found",
        )
    student = db.query(Student).filter(Student.id == db_mark.student_id).first()
    if student is not None:
        _check_teacher_scope(db, current_user, student, db_mark.subject)

    db.delete(db_mark)
    db.commit()
    _audit(db, current_user, "mark.delete", mark_id)
