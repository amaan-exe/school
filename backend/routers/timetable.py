"""Timetable router (Phase-2 hardening).

Reads scoped by class: student/parent see only their class sections, teacher
only assigned sections (entries with NULL class_section_id are hidden from
scoped roles). Writes: admin or staff with timetable perm (conservative —
teachers do NOT get write access). Choice noted here per spec.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Timetable, User
from schemas import TimetableCreate, TimetableUpdate, TimetableResponse
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
        log_audit(db, user.id, action, "timetable", entity_id)
    except Exception:
        pass


def _allowed_sections(user: User, db: Session):
    """None = full access (admin / staff-with-read); else section-id list."""
    from models import Student, TeacherAssignment
    if user.role == "admin":
        return None
    if user.role == "staff":
        if not _staff_can(db, user, "timetable", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Insufficient permissions for module 'timetable'.")
        return None
    if user.role == "teacher":
        if user.teacher_id is None:
            return []
        rows = (db.query(TeacherAssignment.class_section_id)
                .filter(TeacherAssignment.teacher_id == user.teacher_id)
                .distinct().all())
        return [r[0] for r in rows if r[0] is not None]
    # student / parent
    ids = resolve_student_ids(user, db) or []
    if not ids:
        return []
    rows = (db.query(Student.class_section_id)
            .filter(Student.id.in_(ids)).distinct().all())
    return [r[0] for r in rows if r[0] is not None]


def _entry_visible(entry: Timetable, sections) -> bool:
    if sections is None:
        return True
    return entry.class_section_id is not None and entry.class_section_id in sections


@router.get("/", response_model=List[TimetableResponse], summary="Get all timetable entries")
def get_timetable(
    skip: int = 0,
    limit: int = 100,
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    day_of_week: Optional[str] = Query(None, description="Filter by day of the week"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve timetable entries scoped by class section for scoped roles."""
    sections = _allowed_sections(current_user, db)
    query = db.query(Timetable)

    if class_name is not None:
        query = query.filter(Timetable.class_name == class_name)
    if day_of_week is not None:
        query = query.filter(Timetable.day_of_week == day_of_week)
    if sections is not None:
        if not sections:
            return []
        query = query.filter(Timetable.class_section_id.in_(sections))

    entries = query.offset(skip).limit(limit).all()
    return entries


@router.get("/{entry_id}", response_model=TimetableResponse, summary="Get timetable entry by ID")
def get_timetable_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a timetable entry (scoped roles get 403 out-of-scope)."""
    entry = db.query(Timetable).filter(Timetable.id == entry_id).first()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable entry with id {entry_id} not found",
        )
    sections = _allowed_sections(current_user, db)
    if not _entry_visible(entry, sections):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access to this timetable entry is forbidden")
    return entry


def _require_write(db: Session, user: User):
    if user.role == "admin":
        return
    if _staff_can(db, user, "timetable", "write"):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Insufficient permissions for module 'timetable'.")


@router.post("/", response_model=TimetableResponse, status_code=status.HTTP_201_CREATED, summary="Create a new timetable entry")
def create_timetable_entry(
    entry: TimetableCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a timetable entry. Admin or staff with timetable:write."""
    _require_write(db, current_user)
    db_entry = Timetable(**entry.model_dump())
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    _audit(db, current_user, "timetable.create", db_entry.id)
    return db_entry


@router.put("/{entry_id}", response_model=TimetableResponse, summary="Update a timetable entry")
def update_timetable_entry(
    entry_id: int,
    entry_update: TimetableUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a timetable entry. Admin or staff with timetable:write."""
    _require_write(db, current_user)
    db_entry = db.query(Timetable).filter(Timetable.id == entry_id).first()
    if db_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable entry with id {entry_id} not found",
        )

    update_data = entry_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_entry, field, value)

    db.commit()
    db.refresh(db_entry)
    _audit(db, current_user, "timetable.update", db_entry.id)
    return db_entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a timetable entry")
def delete_timetable_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a timetable entry. Admin or staff with timetable:write/delete."""
    if current_user.role == "admin":
        pass
    elif _staff_can(db, current_user, "timetable", "delete") or _staff_can(db, current_user, "timetable", "write"):
        pass
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Insufficient permissions for module 'timetable'.")
    db_entry = db.query(Timetable).filter(Timetable.id == entry_id).first()
    if db_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable entry with id {entry_id} not found",
        )

    db.delete(db_entry)
    db.commit()
    _audit(db, current_user, "timetable.delete", entry_id)
