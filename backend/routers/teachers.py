"""Teacher router with CRUD endpoints (Phase-2 hardening).

Reads: admin full; staff with users:read (choice: teachers are HR/user data,
so the 'users' module gates staff reads); teachers see list/colleagues;
students/parents get 403. Writes: admin only.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import Teacher, User
from schemas import TeacherCreate, TeacherUpdate, TeacherResponse
from auth import get_current_user

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
        log_audit(db, user.id, action, "teachers", entity_id)
    except Exception:
        pass


def _require_read(db: Session, user: User):
    if user.role == "admin":
        return
    if user.role == "teacher":
        return
    if user.role == "staff" and _staff_can(db, user, "users", "read"):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Insufficient permissions.")


def _require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Insufficient permissions. Required role(s): admin")


@router.get("/", response_model=List[TeacherResponse], summary="Get all teachers")
def get_teachers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve teachers (admin / staff-with-users:read / teacher)."""
    _require_read(db, current_user)
    teachers = db.query(Teacher).offset(skip).limit(limit).all()
    return teachers


@router.get("/{teacher_id}", response_model=TeacherResponse, summary="Get teacher by ID")
def get_teacher(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a specific teacher (same read gate as list)."""
    _require_read(db, current_user)
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if teacher is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Teacher with id {teacher_id} not found",
        )
    return teacher


@router.post("/", response_model=TeacherResponse, status_code=status.HTTP_201_CREATED, summary="Create a new teacher")
def create_teacher(
    teacher: TeacherCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new teacher record. Admin only."""
    _require_admin(current_user)
    db_teacher = Teacher(**teacher.model_dump())
    db.add(db_teacher)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher email already exists",
        )
    db.refresh(db_teacher)
    _audit(db, current_user, "teacher.create", db_teacher.id)
    return db_teacher


@router.put("/{teacher_id}", response_model=TeacherResponse, summary="Update a teacher")
def update_teacher(
    teacher_id: int,
    teacher_update: TeacherUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing teacher. Admin only."""
    _require_admin(current_user)
    db_teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if db_teacher is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Teacher with id {teacher_id} not found",
        )

    update_data = teacher_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_teacher, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher email already exists",
        )
    db.refresh(db_teacher)
    _audit(db, current_user, "teacher.update", db_teacher.id)
    return db_teacher


@router.delete("/{teacher_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a teacher")
def delete_teacher(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a teacher record. Admin only."""
    _require_admin(current_user)
    db_teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if db_teacher is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Teacher with id {teacher_id} not found",
        )

    db.delete(db_teacher)
    db.commit()
    _audit(db, current_user, "teacher.delete", teacher_id)
