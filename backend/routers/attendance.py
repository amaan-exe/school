"""Attendance router (Phase-2 hardening).

Reads scoped via resolve_student_ids; mismatched scope -> 403.
Teacher writes only for assigned-section students; UNIQUE (student_id, date)
guard -> 400; status in {present,absent,late,holiday,half_day};
dates > today+1 rejected unless admin.
"""

from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import Attendance, Student, User
from schemas import AttendanceCreate, AttendanceUpdate, AttendanceResponse
from auth import get_current_user, resolve_student_ids

router = APIRouter()

VALID_STATUSES = {"present", "absent", "late", "holiday", "half_day"}


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
        log_audit(db, user.id, action, "attendance", entity_id)
    except Exception:
        pass


def _scoped_ids(user: User, db: Session):
    """Return None for full access (admin / staff-with-read), else id list."""
    if user.role == "admin":
        return None
    if user.role == "staff":
        if not _staff_can(db, user, "attendance", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Insufficient permissions for module 'attendance'.")
        return None
    return resolve_student_ids(user, db) or []


def _check_date_limit(record_date: date, user: User):
    if user.role != "admin" and record_date > date.today() + timedelta(days=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Attendance date cannot be more than 1 day in the future")


def _check_teacher_scope(db: Session, user: User, student_id: int):
    if user.role != "teacher":
        return
    allowed = resolve_student_ids(user, db) or []
    if student_id not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Student is not in your assigned class sections")


@router.get("/", response_model=List[AttendanceResponse], summary="Get attendance records")
def get_attendance(
    skip: int = 0,
    limit: int = 100,
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    attendance_date: Optional[date] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve attendance records scoped by role (mismatched scope -> 403)."""
    scoped = _scoped_ids(current_user, db)
    query = db.query(Attendance)

    if scoped is not None:
        # student/parent/teacher (no-read-staff already raised above)
        if student_id is not None and student_id not in scoped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student's records is forbidden")
        if student_id is not None:
            query = query.filter(Attendance.student_id == student_id)
        else:
            query = query.filter(Attendance.student_id.in_(scoped)) if scoped else query.filter(False)
    else:
        if student_id is not None:
            query = query.filter(Attendance.student_id == student_id)
    if attendance_date is not None:
        query = query.filter(Attendance.date == attendance_date)

    attendance_records = query.offset(skip).limit(limit).all()
    return attendance_records


@router.get("/{attendance_id}", response_model=AttendanceResponse, summary="Get attendance record by ID")
def get_attendance_record(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a specific attendance record (scoped; mismatched -> 403)."""
    record = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record with id {attendance_id} not found",
        )
    scoped = _scoped_ids(current_user, db)
    if scoped is not None and record.student_id not in scoped:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access to this student's records is forbidden")
    return record


def _require_write(db: Session, user: User):
    if user.role in ("admin", "teacher"):
        return
    if _staff_can(db, user, "attendance", "write"):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Insufficient permissions for module 'attendance'.")


@router.post("/", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED, summary="Mark attendance")
def create_attendance(
    attendance: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an attendance record (admin / assigned teacher / staff-write)."""
    _require_write(db, current_user)
    if attendance.status not in VALID_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid status. Must be one of {sorted(VALID_STATUSES)}")
    _check_date_limit(attendance.date, current_user)
    student = db.query(Student).filter(Student.id == attendance.student_id).first()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {attendance.student_id} not found",
        )
    _check_teacher_scope(db, current_user, attendance.student_id)
    dup = (db.query(Attendance)
           .filter(Attendance.student_id == attendance.student_id,
                   Attendance.date == attendance.date)
           .first())
    if dup is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Attendance already recorded for this student and date")

    db_attendance = Attendance(**attendance.model_dump())
    db.add(db_attendance)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Attendance already recorded for this student and date")
    db.refresh(db_attendance)
    _audit(db, current_user, "attendance.create", db_attendance.id)
    return db_attendance


@router.put("/{attendance_id}", response_model=AttendanceResponse, summary="Update attendance record")
def update_attendance(
    attendance_id: int,
    attendance_update: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an attendance record (admin / assigned teacher / staff-write)."""
    _require_write(db, current_user)
    db_attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if db_attendance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record with id {attendance_id} not found",
        )
    _check_teacher_scope(db, current_user, db_attendance.student_id)

    update_data = attendance_update.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid status. Must be one of {sorted(VALID_STATUSES)}")
    new_date = update_data.get("date", db_attendance.date)
    _check_date_limit(new_date, current_user)
    if new_date != db_attendance.date:
        dup = (db.query(Attendance)
               .filter(Attendance.student_id == db_attendance.student_id,
                       Attendance.date == new_date)
               .first())
        if dup is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Attendance already recorded for this student and date")
    for field, value in update_data.items():
        setattr(db_attendance, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Attendance already recorded for this student and date")
    db.refresh(db_attendance)
    _audit(db, current_user, "attendance.update", db_attendance.id)
    return db_attendance


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete attendance record")
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an attendance record (admin / assigned teacher / staff-write)."""
    if current_user.role in ("admin", "teacher"):
        pass
    elif _staff_can(db, current_user, "attendance", "delete") or _staff_can(db, current_user, "attendance", "write"):
        pass
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Insufficient permissions for module 'attendance'.")
    db_attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if db_attendance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record with id {attendance_id} not found",
        )
    _check_teacher_scope(db, current_user, db_attendance.student_id)

    db.delete(db_attendance)
    db.commit()
    _audit(db, current_user, "attendance.delete", attendance_id)
