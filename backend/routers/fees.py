"""Fees router (Phase-2 hardening).

Reads scoped (student own, parent children, teacher assigned; mismatched ->
403). Writes + pay: admin or staff with fees perm. Audit on pay kept.
"""

from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Fee, Student, User
from schemas import FeeCreate, FeeUpdate, FeeResponse, FeeMarkPaidRequest
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


def _audit(db: Session, user: User, action: str, entity_id=None, meta: str = None):
    try:
        from routers.engagement import log_audit
        log_audit(db, user.id, action, "fees", entity_id, meta=meta)
    except Exception:
        pass


def _scoped_ids(user: User, db: Session):
    """None = full access (admin / staff-with-fees:read); else scoped list.

    Student with no linked profile -> 403 (mismatched scope, not empty 200).
    """
    if user.role == "admin":
        return None
    if user.role == "staff":
        if not _staff_can(db, user, "fees", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Insufficient permissions for module 'fees'.")
        return None
    if user.role == "student" and user.student_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No student profile linked to this user")
    return resolve_student_ids(user, db) or []


@router.get("/", response_model=List[FeeResponse], summary="Get all fees")
def get_fees(
    skip: int = 0,
    limit: int = 100,
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    paid: Optional[bool] = Query(None, description="Filter by payment status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve fees scoped by role (mismatched scope -> 403)."""
    scoped = _scoped_ids(current_user, db)
    query = db.query(Fee)

    if scoped is not None:
        if student_id is not None and student_id not in scoped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student's records is forbidden")
        if student_id is not None:
            query = query.filter(Fee.student_id == student_id)
        else:
            query = query.filter(Fee.student_id.in_(scoped)) if scoped else query.filter(False)
    else:
        if student_id is not None:
            query = query.filter(Fee.student_id == student_id)
    if paid is not None:
        query = query.filter(Fee.paid == paid)

    fees = query.offset(skip).limit(limit).all()
    return fees


@router.get("/{fee_id}", response_model=FeeResponse, summary="Get fee by ID")
def get_fee(
    fee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a specific fee (scoped; mismatched -> 403)."""
    fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if fee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fee record with id {fee_id} not found",
        )
    scoped = _scoped_ids(current_user, db)
    if scoped is not None and fee.student_id not in scoped:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access to this student's records is forbidden")
    return fee


def _require_write(db: Session, user: User):
    if user.role == "admin":
        return
    if _staff_can(db, user, "fees", "write"):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Insufficient permissions for module 'fees'.")


@router.post("/", response_model=FeeResponse, status_code=status.HTTP_201_CREATED, summary="Create a new fee")
def create_fee(
    fee: FeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a fee. Admin or staff with fees:write."""
    _require_write(db, current_user)
    student = db.query(Student).filter(Student.id == fee.student_id).first()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {fee.student_id} not found",
        )

    db_fee = Fee(**fee.model_dump())
    db.add(db_fee)
    db.commit()
    db.refresh(db_fee)
    _audit(db, current_user, "fee.create", db_fee.id)
    return db_fee


@router.put("/{fee_id}", response_model=FeeResponse, summary="Update a fee")
def update_fee(
    fee_id: int,
    fee_update: FeeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a fee. Admin or staff with fees:write."""
    _require_write(db, current_user)
    db_fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if db_fee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fee record with id {fee_id} not found",
        )

    update_data = fee_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_fee, field, value)

    db.commit()
    db.refresh(db_fee)
    _audit(db, current_user, "fee.update", db_fee.id)
    return db_fee


@router.post("/{fee_id}/pay", response_model=FeeResponse, summary="Mark fee as paid")
def mark_fee_paid(
    fee_id: int,
    payment: Optional[FeeMarkPaidRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a fee as paid. Admin or staff with fees:write."""
    _require_write(db, current_user)
    db_fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if db_fee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fee record with id {fee_id} not found",
        )

    db_fee.paid = True
    if payment and payment.paid_date:
        db_fee.paid_date = payment.paid_date
    else:
        db_fee.paid_date = date.today()

    db.commit()
    db.refresh(db_fee)
    _audit(db, current_user, "fee.mark_paid", db_fee.id)
    return db_fee


@router.delete("/{fee_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a fee")
def delete_fee(
    fee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a fee. Admin or staff with fees:write/delete."""
    if current_user.role == "admin":
        pass
    elif _staff_can(db, current_user, "fees", "delete") or _staff_can(db, current_user, "fees", "write"):
        pass
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Insufficient permissions for module 'fees'.")
    db_fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if db_fee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Fee record with id {fee_id} not found",
        )

    db.delete(db_fee)
    db.commit()
    _audit(db, current_user, "fee.delete", fee_id)
