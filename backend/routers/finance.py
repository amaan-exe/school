"""Finance & accounting router (Phase-3).

ADDITIVE module. The legacy flat `fees` table and every `/api/fees/*` endpoint
are untouched â€” this router lives beside them and only reads/writes the new
Phase-3 tables (fee_heads, fee_structures, invoices, payments, ...).

Guard model
-----------
* ``admin``, ``accountant``            -> full read/write on finance.
* ``principal``, ``vice_principal``    -> read all finance + approve/reject
  expenses. No raw payment writes.
* ``staff`` with ``fees:write``        -> may record payments; may NOT edit
  fee structures, invoices, or expenses.
* ``student`` / ``parent``             -> read-only, scoped to own (resp.
  linked children) invoices/payments/fines/scholarships.
* ``receptionist``                     -> read-only front-desk view; the
  staff-role scoping helper resolves "no restriction" for this role, so they
  see all finance rows but can never write.
* ``teacher``, ``librarian``, ``transport_manager`` -> 403 on finance entirely
  (they must never see money data).

Student scoping uses ``auth.resolve_student_ids`` which returns ``None`` for
admin/staff (meaning "all") and a concrete list otherwise.
"""

from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import (
    AcademicYear, ClassSection, Discount, Expense, ExpenseCategory, FeeHead,
    FeeStructure, FeeStructureItem, Fine, Income, Invoice, InvoiceItem,
    Payment, Refund, Scholarship, Student, StudentScholarship, User,
)
from schemas import (
    DiscountCreate, DiscountResponse, DiscountUpdate,
    ExpenseCategoryCreate, ExpenseCategoryResponse, ExpenseCategoryUpdate,
    ExpenseCreate, ExpenseResponse, ExpenseUpdate,
    FeeHeadCreate, FeeHeadResponse, FeeHeadUpdate,
    FeeStructureCreate, FeeStructureItemCreate, FeeStructureItemResponse,
    FeeStructureItemUpdate, FeeStructureResponse, FeeStructureUpdate,
    FineCreate, FineResponse, FineUpdate,
    FinanceSummaryResponse, IncomeCreate, IncomeResponse, IncomeStatementResponse,
    InvoiceCancelRequest, InvoiceCreate, InvoiceItemCreate, InvoiceItemResponse,
    InvoiceItemUpdate, InvoiceResponse,
    OutstandingStudentResponse,
    PaymentConfirmWebhookRequest, PaymentCreate, PaymentRefundRequest, PaymentResponse,
    RefundResponse, ScholarshipCreate, ScholarshipResponse, ScholarshipUpdate,
    StudentScholarshipCreate, StudentScholarshipResponse,
)
from auth import get_current_user, require_role, resolve_student_ids

router = APIRouter()

# â”€â”€ Role sets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

FULL_ACCESS_ROLES = {"admin", "accountant"}                 # full read/write
FINANCE_READ_ROLES = {"admin", "accountant", "principal", "vice_principal"}
FINANCE_BILLING_ROLES = {"admin", "accountant"}             # invoices, invoice items
FINANCE_PAYMENT_ROLES = {"admin", "accountant"}            # + staff w/ fees:write
SCOPED_READ_ROLES = {"student", "parent", "receptionist"}   # own scope, read-only
# Hard block: these roles must never touch the finance module at all.
BLOCKED_ROLES = {"teacher", "librarian", "transport_manager"}

# Invoice statuses that are excluded from financial totals.
EXCLUDED_INVOICE_STATUSES = ("cancelled", "draft")
# Payment statuses that count as real money in.
COLLECTED_PAYMENT_STATUSES = ("successful",)
# Payment statuses that reserve (but do not yet settle) an amount on an invoice.
RESERVED_PAYMENT_STATUSES = ("initiated", "pending")

MONEY_EPSILON = 0.01  # floating-point tolerance for money comparisons


# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _audit(db: Session, user: User, action: str, entity_id=None, meta: str = None) -> None:
    """Best-effort audit insert via the shared engagement helper (never raises)."""
    try:
        from routers.engagement import log_audit
        log_audit(db, user.id, action, "finance", entity_id, meta=meta)
    except Exception:
        pass


def _block_blocked(user: User) -> None:
    """403 for roles that may never see finance data."""
    if user.role in BLOCKED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user.role}' has no access to finance data.",
        )


def _staff_can(db: Session, user: User, module: str, action: str = "read") -> bool:
    """Check a staff module permission (admin bypass handled by callers)."""
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


def _scoped_ids(db: Session, user: User) -> Optional[list]:
    """Resolve the student IDs a user may read.

    Returns ``None`` for unrestricted roles (admin, accountant, principal,
    vice_principal, staff-with-fees:read, receptionist) or a concrete list of
    student IDs otherwise.

    Raises:
        HTTPException: 403 when the role is blocked or lacks permission.
    """
    _block_blocked(user)
    if user.role in FINANCE_READ_ROLES:
        return None
    if user.role == "staff":
        if not (_staff_can(db, user, "fees", "read") or _staff_can(db, user, "finance", "read")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for module 'fees'.",
            )
        return None
    if user.role in SCOPED_READ_ROLES:
        if user.role == "student" and user.student_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No student profile linked to this user",
            )
        # receptionist resolves to None (unrestricted front-desk read).
        return resolve_student_ids(user, db) or []
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Role '{user.role}' has no access to finance data.",
    )


def _require_roles(user: User, roles: set, what: str) -> None:
    """403 unless the caller's role is in ``roles``."""
    _block_blocked(user)
    if user.role not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions. Required role(s): {', '.join(sorted(roles))}",
        )


def _require_payment_write(db: Session, user: User) -> None:
    """Allow admin/accountant, or staff holding the `fees:write` permission."""
    _block_blocked(user)
    if user.role in FINANCE_PAYMENT_ROLES:
        return
    if user.role == "staff" and (_staff_can(db, user, "fees", "write")
                                 or _staff_can(db, user, "finance", "write")):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Insufficient permissions for module 'fees' (write).",
    )


def _apply_student_filter(query, column, scoped: Optional[list], student_id: Optional[int],
                          user: User) -> None:
    """Apply role scoping + optional explicit student_id filter.

    Raises:
        HTTPException: 403 when a scoped user asks for someone else's student.
    """
    if scoped is not None:
        if student_id is not None and student_id not in scoped:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to this student's records is forbidden",
            )
        if student_id is not None:
            return query.filter(column == student_id)
        return query.filter(column.in_(scoped)) if scoped else query.filter(False)
    if student_id is not None:
        return query.filter(column == student_id)
    return query


def _assert_owned(obj_student_id: int, scoped: Optional[list]) -> None:
    """Raise 403 when a scoped user touches an object outside their scope."""
    if scoped is not None and obj_student_id not in scoped:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this student's records is forbidden",
        )


def _next_sequence(db: Session, model, column, year: int, prefix: str) -> str:
    """Generate a zero-padded sequence number scoped to the calendar year.

    Probes upward from the current row count for the year until it finds an
    unused number, so concurrent inserts cannot collide. Collisions are also
    caught by the caller's unique constraint and reported as HTTP 400.
    """
    pattern = f"{prefix}-{year}-%"
    used = {(r[0] or "") for r in db.query(column).filter(column.like(pattern)).all()}
    start = (db.query(func.count(model.id)).filter(column.like(pattern)).scalar() or 0) + 1
    n = int(start)
    for _ in range(10_000):
        candidate = f"{prefix}-{year}-{n:04d}"
        n += 1
        if candidate not in used:
            return candidate
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Could not allocate an identifier")


def _serialize_invoice(invoice: Invoice) -> dict:
    """Serialize an Invoice with the router-computed `balance` field."""
    items = list(invoice.items or [])
    data = {
        "id": invoice.id,
        "invoice_no": invoice.invoice_no,
        "student_id": invoice.student_id,
        "academic_year_id": invoice.academic_year_id,
        "class_section_id": invoice.class_section_id,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "status": invoice.status,
        "total_amount": round(float(invoice.total_amount or 0.0), 2),
        "discount_amount": round(float(invoice.discount_amount or 0.0), 2),
        "paid_amount": round(float(invoice.paid_amount or 0.0), 2),
        "balance": round(float(invoice.total_amount or 0.0)
                         - float(invoice.discount_amount or 0.0)
                         - float(invoice.paid_amount or 0.0), 2),
        "notes": invoice.notes,
        "created_by": invoice.created_by,
        "created_at": invoice.created_at,
        "items": [
            {
                "id": i.id,
                "invoice_id": i.invoice_id,
                "fee_head_id": i.fee_head_id,
                "description": i.description,
                "amount": i.amount,
                "quantity": i.quantity,
            }
            for i in items
        ],
    }
    return data


def _net_collected(db: Session, invoice_id: Optional[int]) -> float:
    """Net settled money on an invoice: successful payments minus completed refunds.

    NOTE: the session is created with ``autoflush=False``, so callers MUST
    ``db.flush()`` pending status/amount changes before asking for the total.
    """
    if invoice_id is None:
        return 0.0
    paid = (
        db.query(func.coalesce(func.sum(Payment.amount), 0.0))
        .filter(Payment.invoice_id == invoice_id,
                Payment.status.in_(COLLECTED_PAYMENT_STATUSES))
        .scalar()
    ) or 0.0
    refunded = (
        db.query(func.coalesce(func.sum(Refund.amount), 0.0))
        .select_from(Refund)
        .join(Payment, Payment.id == Refund.payment_id)
        .filter(Payment.invoice_id == invoice_id, Refund.status == "completed")
        .scalar()
    ) or 0.0
    return round(float(paid) - float(refunded), 2)


def _recalculate_invoice(db: Session, invoice: Invoice) -> None:
    """Recompute an invoice's paid_amount + status from its payment rows.

    `successful` payments settle money; `initiated`/`pending` do not (gateway
    webhooks are authoritative). Completed refunds claw money back.
    Draft/cancelled invoices keep their status.
    """
    invoice.paid_amount = _net_collected(db, invoice.id)
    if invoice.status in ("draft", "cancelled"):
        return
    total = round(float(invoice.total_amount or 0.0) - float(invoice.discount_amount or 0.0), 2)
    if invoice.paid_amount <= 0:
        invoice.status = "issued"
    elif invoice.paid_amount + MONEY_EPSILON >= total:
        invoice.paid_amount = total
        invoice.status = "paid"
    else:
        invoice.status = "partially_paid"


def _write_income(db: Session, user: User, amount: float, source: str, source_ref: str,
                  received_on: date, mode: Optional[str], note: Optional[str]) -> Income:
    """Insert an Income ledger row (amount may be negative for reversals)."""
    row = Income(source=source, source_ref=source_ref, amount=round(float(amount), 2),
                 received_on=received_on or date.today(), mode=mode, note=note,
                 created_by=user.id if user else None)
    db.add(row)
    return row


# â”€â”€ Fee heads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/fee-heads/", response_model=List[FeeHeadResponse], summary="List fee heads")
def list_fee_heads(
    include_inactive: bool = Query(False, description="Include soft-deleted heads"),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the fee-head catalogue. Any authenticated role that can read finance."""
    _block_blocked(current_user)
    if current_user.role not in FINANCE_READ_ROLES and current_user.role not in SCOPED_READ_ROLES \
            and current_user.role != "staff":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Role '{current_user.role}' has no access to finance data.")
    query = db.query(FeeHead)
    if not include_inactive:
        query = query.filter(FeeHead.is_active == True)  # noqa: E712
    return query.order_by(FeeHead.name).offset(skip).limit(limit).all()


@router.post("/fee-heads/", response_model=FeeHeadResponse, status_code=status.HTTP_201_CREATED,
             summary="Create a fee head (admin)")
def create_fee_head(
    payload: FeeHeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a fee head. Admin only."""
    exists = db.query(FeeHead).filter(FeeHead.name == payload.name).first()
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Fee head '{payload.name}' already exists")
    head = FeeHead(**payload.model_dump())
    db.add(head)
    db.commit()
    db.refresh(head)
    _audit(db, current_user, "fee_head.create", head.id)
    return head


@router.put("/fee-heads/{head_id}", response_model=FeeHeadResponse, summary="Update a fee head (admin)")
def update_fee_head(
    head_id: int,
    payload: FeeHeadUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a fee head. Admin only."""
    head = db.query(FeeHead).filter(FeeHead.id == head_id).first()
    if head is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee head {head_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(head, field, value)
    db.commit()
    db.refresh(head)
    _audit(db, current_user, "fee_head.update", head.id)
    return head


@router.delete("/fee-heads/{head_id}", response_model=FeeHeadResponse, summary="Delete a fee head (admin)")
def delete_fee_head(
    head_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a fee head. Soft-deletes (is_active=False) when it is referenced."""
    head = db.query(FeeHead).filter(FeeHead.id == head_id).first()
    if head is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee head {head_id} not found")
    referenced = (
        db.query(func.count(FeeStructureItem.id))
        .filter(FeeStructureItem.fee_head_id == head_id).scalar() or 0
    ) + (
        db.query(func.count(InvoiceItem.id))
        .filter(InvoiceItem.fee_head_id == head_id).scalar() or 0
    )
    if referenced > 0:
        head.is_active = False
        db.commit()
        db.refresh(head)
        _audit(db, current_user, "fee_head.soft_delete", head.id,
               meta=f'{{"referenced_by": {referenced}}}')
        return head
    db.delete(head)
    db.commit()
    _audit(db, current_user, "fee_head.delete", head_id)
    return {"id": head_id, "name": "", "is_active": False}


# â”€â”€ Fee structures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/fee-structures/", response_model=List[FeeStructureResponse],
            summary="List fee structures")
def list_fee_structures(
    academic_year_id: Optional[int] = Query(None),
    grade_id: Optional[int] = Query(None),
    class_section_id: Optional[int] = Query(None),
    include_inactive: bool = Query(False),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List fee structures with their items. Any authenticated finance reader."""
    _scoped_ids(db, current_user)
    query = db.query(FeeStructure)
    if academic_year_id is not None:
        query = query.filter(FeeStructure.academic_year_id == academic_year_id)
    if grade_id is not None:
        query = query.filter(FeeStructure.grade_id == grade_id)
    if class_section_id is not None:
        query = query.filter(FeeStructure.class_section_id == class_section_id)
    if not include_inactive:
        query = query.filter(FeeStructure.is_active == True)  # noqa: E712
    return query.order_by(FeeStructure.id).offset(skip).limit(limit).all()


@router.post("/fee-structures/", response_model=FeeStructureResponse,
             status_code=status.HTTP_201_CREATED, summary="Create a fee structure with items (admin)")
def create_fee_structure(
    payload: FeeStructureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a fee structure and its nested items in ONE transaction."""
    data = payload.model_dump(exclude={"items"})
    structure = FeeStructure(**data)
    db.add(structure)
    try:
        db.flush()
        for item in payload.items:
            db.add(_build_structure_item(db, structure.id, item))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Duplicate (fee_head_id, periodicity) combination in items")
    db.refresh(structure)
    _audit(db, current_user, "fee_structure.create", structure.id,
           meta=f'{{"items": {len(payload.items)}}}')
    return structure


def _build_structure_item(db: Session, structure_id: int, item: FeeStructureItemCreate) -> FeeStructureItem:
    """Validate + construct a FeeStructureItem row (not yet added)."""
    head = db.query(FeeHead).filter(FeeHead.id == item.fee_head_id).first()
    if head is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee head {item.fee_head_id} not found")
    return FeeStructureItem(
        fee_structure_id=structure_id, fee_head_id=item.fee_head_id,
        amount=float(item.amount), periodicity=item.periodicity,
        due_date=item.due_date, is_mandatory=bool(item.is_mandatory),
    )


@router.get("/fee-structures/{structure_id}", response_model=FeeStructureResponse,
            summary="Get a fee structure")
def get_fee_structure(
    structure_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one fee structure with its items."""
    _scoped_ids(db, current_user)
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee structure {structure_id} not found")
    return structure


@router.put("/fee-structures/{structure_id}", response_model=FeeStructureResponse,
            summary="Update a fee structure (admin)")
def update_fee_structure(
    structure_id: int,
    payload: FeeStructureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a fee structure header. Admin only."""
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee structure {structure_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(structure, field, value)
    db.commit()
    db.refresh(structure)
    _audit(db, current_user, "fee_structure.update", structure.id)
    return structure


@router.delete("/fee-structures/{structure_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete a fee structure (admin)")
def delete_fee_structure(
    structure_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a fee structure (cascades its items). Admin only."""
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee structure {structure_id} not found")
    db.delete(structure)
    db.commit()
    _audit(db, current_user, "fee_structure.delete", structure_id)


@router.get("/fee-structures/{structure_id}/items/", response_model=List[FeeStructureItemResponse],
            summary="List a fee structure's items")
def list_fee_structure_items(
    structure_id: int,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the fee-head lines belonging to a fee structure."""
    _scoped_ids(db, current_user)
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee structure {structure_id} not found")
    return (db.query(FeeStructureItem)
            .filter(FeeStructureItem.fee_structure_id == structure_id)
            .order_by(FeeStructureItem.id).offset(skip).limit(limit).all())


@router.post("/fee-structures/{structure_id}/items/", response_model=FeeStructureItemResponse,
             status_code=status.HTTP_201_CREATED, summary="Add an item to a fee structure (admin)")
def create_fee_structure_item(
    structure_id: int,
    payload: FeeStructureItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Append one fee-head line to a fee structure. Admin only."""
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee structure {structure_id} not found")
    db.add(_build_structure_item(db, structure.id, payload))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Duplicate (fee_head_id, periodicity) for this fee structure")
    db.refresh(structure)
    item = structure.items[-1]
    _audit(db, current_user, "fee_structure_item.create", item.id)
    return item


@router.put("/fee-structure-items/{item_id}", response_model=FeeStructureItemResponse,
            summary="Update a fee-structure item (admin)")
def update_fee_structure_item(
    item_id: int,
    payload: FeeStructureItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update one fee-structure line. Admin only."""
    item = db.query(FeeStructureItem).filter(FeeStructureItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee structure item {item_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Duplicate (fee_head_id, periodicity) for this fee structure")
    db.refresh(item)
    _audit(db, current_user, "fee_structure_item.update", item.id)
    return item


@router.delete("/fee-structure-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete a fee-structure item (admin)")
def delete_fee_structure_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete one fee-structure line. Admin only."""
    item = db.query(FeeStructureItem).filter(FeeStructureItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Fee structure item {item_id} not found")
    db.delete(item)
    db.commit()
    _audit(db, current_user, "fee_structure_item.delete", item_id)


# â”€â”€ Discounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/discounts/", response_model=List[DiscountResponse], summary="List discounts")
def list_discounts(
    include_inactive: bool = Query(False),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List discount rules."""
    _scoped_ids(db, current_user)
    query = db.query(Discount)
    if not include_inactive:
        query = query.filter(Discount.is_active == True)  # noqa: E712
    return query.order_by(Discount.id).offset(skip).limit(limit).all()


@router.post("/discounts/", response_model=DiscountResponse, status_code=status.HTTP_201_CREATED,
             summary="Create a discount (admin)")
def create_discount(
    payload: DiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a discount rule. Admin only."""
    row = Discount(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "discount.create", row.id)
    return row


@router.put("/discounts/{discount_id}", response_model=DiscountResponse,
            summary="Update a discount (admin)")
def update_discount(
    discount_id: int,
    payload: DiscountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a discount rule. Admin only."""
    row = db.query(Discount).filter(Discount.id == discount_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Discount {discount_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "discount.update", row.id)
    return row


@router.delete("/discounts/{discount_id}", response_model=DiscountResponse,
               summary="Delete a discount (admin)")
def delete_discount(
    discount_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a discount rule; soft-deletes when referenced by an invoice."""
    row = db.query(Discount).filter(Discount.id == discount_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Discount {discount_id} not found")
    in_use = (db.query(func.count(Invoice.id))
              .filter(Invoice.discount_id == discount_id).scalar() or 0)
    if in_use > 0:
        row.is_active = False
    else:
        db.delete(row)
    db.commit()
    if in_use > 0:
        db.refresh(row)
    _audit(db, current_user, "discount.delete", discount_id, meta=f'{{"referenced_by": {in_use}}}')
    if in_use > 0:
        return row
    return {"id": discount_id, "name": "", "type": "fixed", "value": 0.0, "is_active": False}


# â”€â”€ Scholarships â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/scholarships/", response_model=List[ScholarshipResponse], summary="List scholarships")
def list_scholarships(
    include_inactive: bool = Query(False),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List scholarship schemes."""
    _scoped_ids(db, current_user)
    query = db.query(Scholarship)
    if not include_inactive:
        query = query.filter(Scholarship.is_active == True)  # noqa: E712
    return query.order_by(Scholarship.id).offset(skip).limit(limit).all()


@router.post("/scholarships/", response_model=ScholarshipResponse,
             status_code=status.HTTP_201_CREATED, summary="Create a scholarship (admin)")
def create_scholarship(
    payload: ScholarshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a scholarship scheme. Admin only."""
    row = Scholarship(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "scholarship.create", row.id)
    return row


@router.put("/scholarships/{scholarship_id}", response_model=ScholarshipResponse,
            summary="Update a scholarship (admin)")
def update_scholarship(
    scholarship_id: int,
    payload: ScholarshipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a scholarship scheme. Admin only."""
    row = db.query(Scholarship).filter(Scholarship.id == scholarship_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Scholarship {scholarship_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "scholarship.update", row.id)
    return row


@router.delete("/scholarships/{scholarship_id}", response_model=ScholarshipResponse,
               summary="Delete a scholarship (admin)")
def delete_scholarship(
    scholarship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a scholarship scheme; soft-deletes when it has recipients."""
    row = db.query(Scholarship).filter(Scholarship.id == scholarship_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Scholarship {scholarship_id} not found")
    recipients = (db.query(func.count(StudentScholarship.id))
                  .filter(StudentScholarship.scholarship_id == scholarship_id).scalar() or 0)
    if recipients > 0:
        row.is_active = False
        db.commit()
        db.refresh(row)
        _audit(db, current_user, "scholarship.soft_delete", row.id)
        return row
    db.delete(row)
    db.commit()
    _audit(db, current_user, "scholarship.delete", scholarship_id)
    return {"id": scholarship_id, "name": "", "is_active": False}


@router.get("/student-scholarships/", response_model=List[StudentScholarshipResponse],
            summary="List student scholarships (scoped)")
def list_student_scholarships(
    student_id: Optional[int] = Query(None),
    scholarship_id: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List scholarship awards scoped to the caller."""
    scoped = _scoped_ids(db, current_user)
    query = db.query(StudentScholarship)
    if scholarship_id is not None:
        query = query.filter(StudentScholarship.scholarship_id == scholarship_id)
    query = _apply_student_filter(query, StudentScholarship.student_id, scoped, student_id, current_user)
    return query.order_by(StudentScholarship.id).offset(skip).limit(limit).all()


@router.post("/student-scholarships/", response_model=StudentScholarshipResponse,
             status_code=status.HTTP_201_CREATED, summary="Award a scholarship (admin)")
def create_student_scholarship(
    payload: StudentScholarshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Award a scholarship to a student. Admin only."""
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student {payload.student_id} not found")
    scholarship = db.query(Scholarship).filter(Scholarship.id == payload.scholarship_id).first()
    if scholarship is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Scholarship {payload.scholarship_id} not found")
    if (scholarship.max_recipients is not None and scholarship.max_recipients > 0):
        awarded = (db.query(func.count(StudentScholarship.id))
                   .filter(StudentScholarship.scholarship_id == scholarship.id).scalar() or 0)
        if awarded >= scholarship.max_recipients:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Scholarship has reached max_recipients")
    row = StudentScholarship(
        student_id=payload.student_id, scholarship_id=payload.scholarship_id,
        academic_year_id=payload.academic_year_id, amount=float(payload.amount),
        granted_on=payload.granted_on or date.today(), granted_by=current_user.id,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Scholarship already awarded to this student for the year")
    db.refresh(row)
    _audit(db, current_user, "student_scholarship.create", row.id)
    return row


@router.delete("/student-scholarships/{award_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Revoke a scholarship award (admin)")
def delete_student_scholarship(
    award_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Revoke a scholarship award. Admin only."""
    row = db.query(StudentScholarship).filter(StudentScholarship.id == award_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student scholarship {award_id} not found")
    db.delete(row)
    db.commit()
    _audit(db, current_user, "student_scholarship.delete", award_id)


# â”€â”€ Invoices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/invoices/", response_model=List[InvoiceResponse], summary="List invoices (scoped)")
def list_invoices(
    student_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    academic_year_id: Optional[int] = Query(None),
    class_section_id: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List invoices with their items and a server-computed balance."""
    scoped = _scoped_ids(db, current_user)
    query = db.query(Invoice)
    query = _apply_student_filter(query, Invoice.student_id, scoped, student_id, current_user)
    if status is not None:
        query = query.filter(Invoice.status == status)
    if academic_year_id is not None:
        query = query.filter(Invoice.academic_year_id == academic_year_id)
    if class_section_id is not None:
        query = query.filter(Invoice.class_section_id == class_section_id)
    rows = query.order_by(Invoice.id.desc()).offset(skip).limit(limit).all()
    return [_serialize_invoice(i) for i in rows]


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse, summary="Get an invoice (scoped)")
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one invoice. 404 if missing, 403 if outside the caller's scope."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice {invoice_id} not found")
    scoped = _scoped_ids(db, current_user)
    _assert_owned(invoice.student_id, scoped)
    return _serialize_invoice(invoice)


@router.post("/invoices/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED,
             summary="Create an invoice (admin/accountant)")
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an invoice, snapshot its items and apply an optional discount."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "invoice management")
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student {payload.student_id} not found")
    if not payload.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="An invoice must contain at least one item")

    gross = 0.0
    for item in payload.items:
        if item.fee_head_id is not None:
            head = db.query(FeeHead).filter(FeeHead.id == item.fee_head_id).first()
            if head is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                    detail=f"Fee head {item.fee_head_id} not found")
        gross += float(item.amount) * int(item.quantity)
    gross = round(gross, 2)

    discount_amount = 0.0
    discount = None
    if payload.discount_id is not None:
        discount = db.query(Discount).filter(Discount.id == payload.discount_id).first()
        if discount is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Discount {payload.discount_id} not found")
        if not discount.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Discount {payload.discount_id} is inactive")
        if discount.type == "percentage":
            discount_amount = round(gross * float(discount.value) / 100.0, 2)
        else:
            discount_amount = round(min(float(discount.value), gross), 2)

    issue_date = payload.issue_date or date.today()
    invoice_no = _next_sequence(db, Invoice, Invoice.invoice_no, issue_date.year, "INV")
    invoice = Invoice(
        invoice_no=invoice_no, student_id=payload.student_id,
        academic_year_id=payload.academic_year_id or student.academic_year_id,
        class_section_id=payload.class_section_id or student.class_section_id,
        issue_date=issue_date, due_date=payload.due_date, status=payload.status,
        total_amount=gross, discount_amount=discount_amount, paid_amount=0.0,
        discount_id=payload.discount_id, notes=payload.notes, created_by=current_user.id,
    )
    db.add(invoice)
    try:
        db.flush()
        for item in payload.items:
            db.add(InvoiceItem(
                invoice_id=invoice.id, fee_head_id=item.fee_head_id,
                description=item.description,
                amount=float(item.amount), quantity=int(item.quantity),
            ))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Could not allocate a unique invoice number; retry")
    db.refresh(invoice)
    _audit(db, current_user, "invoice.create", invoice.id,
           meta=f'{{"invoice_no": "{invoice_no}", "total": {gross}}}')
    return _serialize_invoice(invoice)


@router.post("/invoices/{invoice_id}/cancel", response_model=InvoiceResponse,
             summary="Cancel an invoice (admin)")
def cancel_invoice(
    invoice_id: int,
    payload: Optional[InvoiceCancelRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Cancel an invoice. Admin only. Refuses invoices that already collected money."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice {invoice_id} not found")
    if invoice.status == "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A fully paid invoice cannot be cancelled")
    if invoice.status == "cancelled":
        return _serialize_invoice(invoice)
    invoice.status = "cancelled"
    note = (payload.reason if payload else None) or "cancelled"
    invoice.notes = f"{invoice.notes or ''}\n[system] {note}".strip()
    db.commit()
    db.refresh(invoice)
    _audit(db, current_user, "invoice.cancel", invoice.id, meta=f'{{"reason": "{note}"}}')
    return _serialize_invoice(invoice)


@router.get("/invoices/{invoice_id}/items/", response_model=List[InvoiceItemResponse],
            summary="List an invoice's items")
def list_invoice_items(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the lines on an invoice (scoped)."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice {invoice_id} not found")
    scoped = _scoped_ids(db, current_user)
    _assert_owned(invoice.student_id, scoped)
    return (db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice_id)
            .order_by(InvoiceItem.id).all())


@router.post("/invoices/{invoice_id}/items/", response_model=InvoiceItemResponse,
             status_code=status.HTTP_201_CREATED, summary="Add an invoice item (admin/accountant)")
def create_invoice_item(
    invoice_id: int,
    payload: InvoiceItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a line to a draft/issued invoice and re-total it. Admin/accountant only."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "invoice management")
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice {invoice_id} not found")
    if invoice.status in ("paid", "cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot add items to a {invoice.status} invoice")
    if payload.fee_head_id is not None:
        head = db.query(FeeHead).filter(FeeHead.id == payload.fee_head_id).first()
        if head is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Fee head {payload.fee_head_id} not found")
    item = InvoiceItem(invoice_id=invoice.id, fee_head_id=payload.fee_head_id,
                       description=payload.description, amount=float(payload.amount),
                       quantity=int(payload.quantity))
    db.add(item)
    invoice.total_amount = round(float(invoice.total_amount or 0.0)
                                 + float(payload.amount) * int(payload.quantity), 2)
    db.commit()
    db.refresh(item)
    _audit(db, current_user, "invoice_item.create", item.id)
    return item


@router.put("/invoice-items/{item_id}", response_model=InvoiceItemResponse,
            summary="Update an invoice item (admin/accountant)")
def update_invoice_item(
    item_id: int,
    payload: InvoiceItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an invoice line and re-total its invoice. Admin/accountant only."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "invoice management")
    item = db.query(InvoiceItem).filter(InvoiceItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice item {item_id} not found")
    invoice = db.query(Invoice).filter(Invoice.id == item.invoice_id).first()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice {item.invoice_id} not found")
    if invoice.status in ("paid", "cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot edit items on a {invoice.status} invoice")
    old_value = float(item.amount) * int(item.quantity)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    new_value = float(item.amount) * int(item.quantity)
    invoice.total_amount = round(float(invoice.total_amount or 0.0) - old_value + new_value, 2)
    db.commit()
    db.refresh(item)
    _audit(db, current_user, "invoice_item.update", item.id)
    return item


@router.delete("/invoice-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete an invoice item (admin/accountant)")
def delete_invoice_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an invoice line and re-total its invoice. Admin/accountant only."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "invoice management")
    item = db.query(InvoiceItem).filter(InvoiceItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice item {item_id} not found")
    invoice = db.query(Invoice).filter(Invoice.id == item.invoice_id).first()
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice {item.invoice_id} not found")
    if invoice.status in ("paid", "cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot delete items on a {invoice.status} invoice")
    invoice.total_amount = round(
        float(invoice.total_amount or 0.0) - float(item.amount) * int(item.quantity), 2)
    db.delete(item)
    db.commit()
    _audit(db, current_user, "invoice_item.delete", item_id)


# â”€â”€ Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/payments/", response_model=List[PaymentResponse], summary="List payments (scoped)")
def list_payments(
    student_id: Optional[int] = Query(None),
    invoice_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List payments scoped to the caller."""
    scoped = _scoped_ids(db, current_user)
    query = db.query(Payment)
    query = _apply_student_filter(query, Payment.student_id, scoped, student_id, current_user)
    if invoice_id is not None:
        query = query.filter(Payment.invoice_id == invoice_id)
    if status is not None:
        query = query.filter(Payment.status == status)
    return query.order_by(Payment.id.desc()).offset(skip).limit(limit).all()


@router.post("/payments/", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED,
             summary="Record a payment (admin/accountant or staff with fees:write)")
def create_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a payment, update the invoice and write the income ledger row.

    Amounts must be > 0 and may never exceed the invoice's remaining balance
    (successful + reserved payments included).
    """
    _require_payment_write(db, current_user)

    amount = round(float(payload.amount), 2)
    if not (amount > 0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Payment amount must be greater than 0")

    invoice = None
    student_id = payload.student_id
    if payload.invoice_id is not None:
        invoice = db.query(Invoice).filter(Invoice.id == payload.invoice_id).first()
        if invoice is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Invoice {payload.invoice_id} not found")
        if invoice.status == "cancelled":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Cannot pay a cancelled invoice")
        student_id = invoice.student_id
    if student_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="student_id is required when invoice_id is not supplied")
    student = db.query(Student).filter(Student.id == student_id).first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student {student_id} not found")

    paid_on = payload.paid_on or date.today()
    receipt_no = None
    if payload.status in COLLECTED_PAYMENT_STATUSES:
        receipt_no = _next_sequence(db, Payment, Payment.receipt_no, paid_on.year, "RCP")

    payment = Payment(
        invoice_id=invoice.id if invoice else None, student_id=student_id, amount=amount,
        method=payload.method, reference_no=payload.reference_no, paid_on=paid_on,
        status=payload.status, receipt_no=receipt_no, note=payload.note,
        provider=payload.provider, created_by=current_user.id,
    )
    db.add(payment)

    if invoice is not None and payload.status in COLLECTED_PAYMENT_STATUSES:
        total = round(float(invoice.total_amount or 0.0)
                      - float(invoice.discount_amount or 0.0), 2)
        collected = (db.query(func.coalesce(func.sum(Payment.amount), 0.0))
                     .filter(Payment.invoice_id == invoice.id,
                             Payment.status.in_(COLLECTED_PAYMENT_STATUSES)).scalar() or 0.0)
        reserved = (db.query(func.coalesce(func.sum(Payment.amount), 0.0))
                    .filter(Payment.invoice_id == invoice.id,
                            Payment.status.in_(RESERVED_PAYMENT_STATUSES)).scalar() or 0.0)
        available = round(total - float(collected) - float(reserved), 2)
        if amount - available > MONEY_EPSILON:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(f"Payment of {amount} exceeds the available invoice balance of {available}"),
            )

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Duplicate receipt number; retry")

    if invoice is not None:
        _recalculate_invoice(db, invoice)
    if payload.status in COLLECTED_PAYMENT_STATUSES:
        _write_income(db, current_user, amount, "fees",
                      f"payment:{payment.id}" if payment.id else "payment:new",
                      paid_on, payload.method, f"Receipt {receipt_no} for invoice "
                      f"{invoice.invoice_no if invoice else '-'}")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Duplicate receipt number; retry")
    db.refresh(payment)
    _audit(db, current_user, "payment.create", payment.id,
           meta=f'{{"amount": {amount}, "status": "{payload.status}"}}')
    return payment


@router.get("/payments/{payment_id}", response_model=PaymentResponse, summary="Get a payment (scoped)")
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one payment. 404 if missing, 403 if outside the caller's scope."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Payment {payment_id} not found")
    scoped = _scoped_ids(db, current_user)
    _assert_owned(payment.student_id, scoped)
    return payment


@router.post("/payments/{payment_id}/confirm-webhook", response_model=PaymentResponse,
             summary="Gateway webhook: confirm a payment (idempotent)")
def confirm_payment_webhook(
    payment_id: int,
    payload: Optional[PaymentConfirmWebhookRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Authoritative gateway transition to `successful`. Idempotent.

    Accepts an optional body: ``{provider, reference_no, status}``. Repeat calls
    return the same payment without double-counting it.
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Payment {payment_id} not found")
    _require_payment_write(db, current_user)
    target = (payload.status if payload and payload.status else "successful")

    if payload is not None:
        if payload.provider:
            payment.provider = payload.provider
        if payload.reference_no:
            payment.reference_no = payload.reference_no

    if target == "successful":
        if payment.status == "successful":
            _audit(db, current_user, "payment.confirm_webhook.noop", payment.id)
            return payment  # idempotent
        if payment.status == "refunded":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="A refunded payment cannot be confirmed")
        invoice = None
        if payment.invoice_id is not None:
            invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
            if invoice is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                    detail=f"Invoice {payment.invoice_id} not found")
            if invoice.status == "cancelled":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                    detail="Cannot confirm a payment against a cancelled invoice")
            total = round(float(invoice.total_amount or 0.0)
                          - float(invoice.discount_amount or 0.0), 2)
            collected = (
                db.query(func.coalesce(func.sum(Payment.amount), 0.0))
                .filter(Payment.invoice_id == invoice.id,
                        Payment.status.in_(COLLECTED_PAYMENT_STATUSES),
                        Payment.id != payment.id).scalar() or 0.0)
            if round(float(collected) + float(payment.amount), 2) - total > MONEY_EPSILON:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Confirming this payment would exceed the invoice balance")
        payment.status = "successful"
        if not payment.receipt_no:
            payment.receipt_no = _next_sequence(db, Payment, Payment.receipt_no,
                                                (payment.paid_on or date.today()).year, "RCP")
        # autoflush is off on this session: flush before the SUM reads the new status.
        db.flush()
        if invoice is not None:
            _recalculate_invoice(db, invoice)
        _write_income(db, current_user, payment.amount, "fees", f"payment:{payment.id}",
                      payment.paid_on or date.today(), payment.method,
                      f"Receipt {payment.receipt_no} (gateway confirmed)")
        db.commit()
        db.refresh(payment)
        _audit(db, current_user, "payment.confirm_webhook", payment.id)
        return payment

    if target in ("pending", "initiated"):
        if payment.status == "successful":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="A successful payment cannot move back to pending")
        payment.status = target
        db.flush()
        if payment.invoice_id is not None:
            invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
            if invoice is not None:
                _recalculate_invoice(db, invoice)
        db.commit()
        db.refresh(payment)
        _audit(db, current_user, "payment.webhook.pending", payment.id)
        return payment

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Use /payments/{id}/fail or /payments/{id}/refund for 'failed'/'refunded'",
    )


# Alias kept so both documented paths work.
@router.post("/payments/{payment_id}/confirm", response_model=PaymentResponse,
             summary="Alias of /payments/{id}/confirm-webhook")
def confirm_payment_alias(
    payment_id: int,
    payload: Optional[PaymentConfirmWebhookRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alias of :func:`confirm_payment_webhook` (idempotent gateway confirm)."""
    return confirm_payment_webhook(payment_id, payload, db, current_user)


@router.post("/payments/{payment_id}/fail", response_model=PaymentResponse,
             summary="Mark a payment failed (admin/accountant)")
def fail_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a payment `failed`; releases any reserved amount on its invoice."""
    _require_roles(current_user, FINANCE_PAYMENT_ROLES, "payment management")
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Payment {payment_id} not found")
    if payment.status == "refunded":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A refunded payment cannot be failed")
    payment.status = "failed"
    db.flush()  # autoflush is off; recalculate below must see the new status
    if payment.invoice_id is not None:
        invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
        if invoice is not None:
            _recalculate_invoice(db, invoice)
    db.commit()
    db.refresh(payment)
    _audit(db, current_user, "payment.fail", payment.id)
    return payment


@router.post("/payments/{payment_id}/refund", response_model=RefundResponse,
             status_code=status.HTTP_201_CREATED, summary="Refund a payment (admin/accountant)")
def refund_payment(
    payment_id: int,
    payload: Optional[PaymentRefundRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Refund a successful payment: writes a Refund row + an Income reversal."""
    _require_roles(current_user, FINANCE_PAYMENT_ROLES, "payment management")
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Payment {payment_id} not found")
    if payment.status == "refunded":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Payment has already been refunded")

    already = (
        db.query(func.coalesce(func.sum(Refund.amount), 0.0))
        .filter(Refund.payment_id == payment.id,
                Refund.status == "completed").scalar() or 0.0)
    amount = round(float(payload.amount), 2) if payload and payload.amount else round(
        float(payment.amount) - float(already), 2)
    if not (amount > 0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Refund amount must be greater than 0")
    if round(float(already) + amount, 2) - float(payment.amount) > MONEY_EPSILON:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Refund would exceed the original payment amount")

    refund = Refund(payment_id=payment.id, amount=amount, reason=(payload.reason if payload else None),
                    refunded_on=date.today(),
                    status=(payload.status if payload else "completed"),
                    processed_by=current_user.id)
    db.add(refund)
    db.flush()

    if refund.status == "completed":
        total_refunded = round(float(already) + amount, 2)
        if total_refunded + MONEY_EPSILON >= float(payment.amount):
            payment.status = "refunded"
        _write_income(db, current_user, -amount, "refund", f"refund:{refund.id}",
                      refund.refunded_on, payment.method,
                      f"Refund of payment #{payment.id} ({payment.receipt_no or '-'})")
        db.flush()  # autoflush is off; the recalculate below must see the refund row
        if payment.invoice_id is not None:
            invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
            if invoice is not None:
                _recalculate_invoice(db, invoice)
    db.commit()
    db.refresh(refund)
    _audit(db, current_user, "payment.refund", payment.id, meta=f'{{"refund_id": {refund.id}}}')
    return refund


# â”€â”€ Fines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/fines/", response_model=List[FineResponse], summary="List fines (scoped)")
def list_fines(
    student_id: Optional[int] = Query(None),
    is_waived: Optional[bool] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List fines scoped to the caller."""
    scoped = _scoped_ids(db, current_user)
    query = db.query(Fine)
    query = _apply_student_filter(query, Fine.student_id, scoped, student_id, current_user)
    if is_waived is not None:
        query = query.filter(Fine.is_waived == is_waived)
    return query.order_by(Fine.id.desc()).offset(skip).limit(limit).all()


@router.post("/fines/", response_model=FineResponse, status_code=status.HTTP_201_CREATED,
             summary="Levy a fine (admin/accountant)")
def create_fine(
    payload: FineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Levy a fine on a student. Admin/accountant only."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "fine management")
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student {payload.student_id} not found")
    if payload.invoice_id is not None and db.query(Invoice).filter(
            Invoice.id == payload.invoice_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Invoice {payload.invoice_id} not found")
    row = Fine(student_id=payload.student_id, invoice_id=payload.invoice_id,
               amount=round(float(payload.amount), 2), reason=payload.reason,
               levied_on=payload.levied_on or date.today(), is_waived=False)
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "fine.create", row.id, meta=f'{{"amount": {row.amount}}}')
    return row


@router.put("/fines/{fine_id}", response_model=FineResponse, summary="Update a fine (admin/accountant)")
def update_fine(
    fine_id: int,
    payload: FineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a fine. Admin/accountant only. Waived fines are immutable."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "fine management")
    row = db.query(Fine).filter(Fine.id == fine_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Fine {fine_id} not found")
    if row.is_waived:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A waived fine cannot be edited")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "fine.update", row.id)
    return row


@router.post("/fines/{fine_id}/waive", response_model=FineResponse, summary="Waive a fine (admin)")
def waive_fine(
    fine_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Waive a fine. Admin only. Idempotent."""
    row = db.query(Fine).filter(Fine.id == fine_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Fine {fine_id} not found")
    if row.is_waived:
        return row
    row.is_waived = True
    row.waived_by = current_user.id
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "fine.waive", row.id)
    return row


# â”€â”€ Expenses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/expense-categories/", response_model=List[ExpenseCategoryResponse],
            summary="List expense categories")
def list_expense_categories(
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List expense categories."""
    _scoped_ids(db, current_user)
    return (db.query(ExpenseCategory).order_by(ExpenseCategory.name)
            .offset(skip).limit(limit).all())


@router.post("/expense-categories/", response_model=ExpenseCategoryResponse,
             status_code=status.HTTP_201_CREATED, summary="Create an expense category (admin)")
def create_expense_category(
    payload: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create an expense category. Admin only."""
    if db.query(ExpenseCategory).filter(ExpenseCategory.name == payload.name).first() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Expense category '{payload.name}' already exists")
    row = ExpenseCategory(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "expense_category.create", row.id)
    return row


@router.put("/expense-categories/{category_id}", response_model=ExpenseCategoryResponse,
            summary="Update an expense category (admin)")
def update_expense_category(
    category_id: int,
    payload: ExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update an expense category. Admin only."""
    row = db.query(ExpenseCategory).filter(ExpenseCategory.id == category_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense category {category_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "expense_category.update", row.id)
    return row


@router.delete("/expense-categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete an expense category (admin)")
def delete_expense_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete an expense category; refuses when expenses reference it."""
    row = db.query(ExpenseCategory).filter(ExpenseCategory.id == category_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense category {category_id} not found")
    used = (db.query(func.count(Expense.id))
            .filter(Expense.category_id == category_id).scalar() or 0)
    if used > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Category is referenced by {used} expense(s)")
    db.delete(row)
    db.commit()
    _audit(db, current_user, "expense_category.delete", category_id)


@router.get("/expenses/", response_model=List[ExpenseResponse],
            summary="List expenses (admin/accountant/principal)")
def list_expenses(
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List expenses. Admin/accountant/principal (+ vice_principal) only."""
    _require_roles(current_user, FINANCE_READ_ROLES, "expense read access")
    query = db.query(Expense)
    if category_id is not None:
        query = query.filter(Expense.category_id == category_id)
    if status is not None:
        query = query.filter(Expense.status == status)
    if start_date is not None:
        query = query.filter(Expense.expense_date >= start_date)
    if end_date is not None:
        query = query.filter(Expense.expense_date <= end_date)
    return query.order_by(Expense.expense_date.desc(), Expense.id.desc()).offset(skip).limit(limit).all()


@router.post("/expenses/", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED,
             summary="Record an expense (admin/accountant)")
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record an expense. Admin/accountant only. Defaults to status 'pending'."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "expense management")
    if db.query(ExpenseCategory).filter(
            ExpenseCategory.id == payload.category_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense category {payload.category_id} not found")
    row = Expense(**payload.model_dump())
    row.created_by = current_user.id
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "expense.create", row.id, meta=f'{{"amount": {row.amount}}}')
    return row


@router.put("/expenses/{expense_id}", response_model=ExpenseResponse,
            summary="Update an expense (admin/accountant)")
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an expense. Admin/accountant only. Rejected expenses are immutable."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "expense management")
    row = db.query(Expense).filter(Expense.id == expense_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense {expense_id} not found")
    if row.status == "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A paid expense cannot be edited")
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and db.query(ExpenseCategory).filter(
            ExpenseCategory.id == data["category_id"]).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense category {data['category_id']} not found")
    for field, value in data.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "expense.update", row.id)
    return row


@router.post("/expenses/{expense_id}/approve", response_model=ExpenseResponse,
             summary="Approve an expense (admin/principal)")
def approve_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a pending expense. Admin/principal/vice_principal only."""
    _require_roles(current_user, {"admin", "principal", "vice_principal"}, "expense approval")
    row = db.query(Expense).filter(Expense.id == expense_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense {expense_id} not found")
    if row.status == "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A paid expense cannot be re-approved")
    row.status = "approved"
    row.approved_by = current_user.id
    row.approved_on = date.today()
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "expense.approve", row.id)
    return row


@router.post("/expenses/{expense_id}/reject", response_model=ExpenseResponse,
             summary="Reject an expense (admin/principal)")
def reject_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject a pending/approved expense. Admin/principal/vice_principal only."""
    _require_roles(current_user, {"admin", "principal", "vice_principal"}, "expense approval")
    row = db.query(Expense).filter(Expense.id == expense_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense {expense_id} not found")
    if row.status == "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A paid expense cannot be rejected")
    row.status = "rejected"
    row.approved_by = current_user.id
    row.approved_on = date.today()
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "expense.reject", row.id)
    return row


@router.post("/expenses/{expense_id}/mark-paid", response_model=ExpenseResponse,
             summary="Mark an expense paid (admin/accountant)")
def mark_expense_paid(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an approved expense as paid. Admin/accountant only."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "expense management")
    row = db.query(Expense).filter(Expense.id == expense_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Expense {expense_id} not found")
    if row.status == "rejected":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A rejected expense cannot be marked paid")
    if row.status == "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Expense must be approved before it can be paid")
    if row.status == "paid":
        return row  # idempotent
    row.status = "paid"
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "expense.mark_paid", row.id)
    return row


# â”€â”€ Income â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/incomes/", response_model=List[IncomeResponse],
            summary="List income rows (admin/accountant/principal)")
def list_incomes(
    source: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List income ledger rows."""
    _require_roles(current_user, FINANCE_READ_ROLES, "income read access")
    query = db.query(Income)
    if source is not None:
        query = query.filter(Income.source == source)
    if start_date is not None:
        query = query.filter(Income.received_on >= start_date)
    if end_date is not None:
        query = query.filter(Income.received_on <= end_date)
    return query.order_by(Income.received_on.desc(), Income.id.desc()).offset(skip).limit(limit).all()


@router.post("/incomes/", response_model=IncomeResponse, status_code=status.HTTP_201_CREATED,
             summary="Record income (admin/accountant)")
def create_income(
    payload: IncomeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a non-fee income (admission/donation/other). Admin/accountant only."""
    _require_roles(current_user, FINANCE_BILLING_ROLES, "income management")
    row = Income(**payload.model_dump())
    row.received_on = payload.received_on or date.today()
    row.created_by = current_user.id
    db.add(row)
    db.commit()
    db.refresh(row)
    _audit(db, current_user, "income.create", row.id, meta=f'{{"amount": {row.amount}}}')
    return row


# â”€â”€ Reporting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _sum(query) -> float:
    """Zero-safe scalar sum (never None, never raises on an empty table)."""
    try:
        return round(float(query.scalar() or 0.0), 2)
    except Exception:
        return 0.0


def _today_bounds() -> tuple:
    today = date.today()
    month_start = today.replace(day=1)
    return today, month_start


@router.get("/finance/summary/", response_model=FinanceSummaryResponse,
            summary="Finance dashboard summary (admin/accountant/principal)")
def finance_summary(
    academic_year_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate finance numbers. Safe on an EMPTY database (all zeros)."""
    _require_roles(current_user, FINANCE_READ_ROLES, "finance reporting")

    billable = [Invoice.status.notin_(EXCLUDED_INVOICE_STATUSES)]
    if academic_year_id is not None:
        billable.append(Invoice.academic_year_id == academic_year_id)

    net_billed = _sum(
        db.query(func.coalesce(
            func.sum(Invoice.total_amount - Invoice.discount_amount), 0.0)).filter(*billable))
    total_billed = _sum(
        db.query(func.coalesce(func.sum(Invoice.total_amount), 0.0)).filter(*billable))
    # Net collected: successful payments minus completed refunds.
    gross_collected = _sum(
        db.query(func.coalesce(func.sum(Payment.amount), 0.0))
        .filter(Payment.status.in_(COLLECTED_PAYMENT_STATUSES)))
    refunds_total = _sum(
        db.query(func.coalesce(func.sum(Refund.amount), 0.0))
        .filter(Refund.status == "completed"))
    collected = round(gross_collected - refunds_total, 2)
    # Outstanding is measured against the NET payable (discounts genuinely reduce
    # what is owed), so it can legitimately differ from total_billed - collected.
    outstanding = round(max(net_billed - collected, 0.0), 2)

    today, month_start = _today_bounds()
    overdue_invoices = (
        db.query(Invoice)
        .filter(Invoice.status.notin_(EXCLUDED_INVOICE_STATUSES),
                Invoice.due_date.isnot(None),
                Invoice.due_date < today)
        .all()
    )
    overdue = 0.0
    for inv in overdue_invoices:
        if inv.academic_year_id is not None and academic_year_id is not None \
                and inv.academic_year_id != academic_year_id:
            continue
        bal = round(float(inv.total_amount or 0.0) - float(inv.discount_amount or 0.0)
                    - float(inv.paid_amount or 0.0), 2)
        overdue += max(bal, 0.0)
    overdue = round(overdue, 2)

    today_collection = _sum(
        db.query(func.coalesce(func.sum(Payment.amount), 0.0))
        .filter(Payment.status.in_(COLLECTED_PAYMENT_STATUSES), Payment.paid_on == today))
    month_collection = _sum(
        db.query(func.coalesce(func.sum(Payment.amount), 0.0))
        .filter(Payment.status.in_(COLLECTED_PAYMENT_STATUSES),
                Payment.paid_on >= month_start, Payment.paid_on <= today))

    # Zero-safe outstanding rows straight from the DB (no Python post-pass).
    outstanding_rows = (
        db.query(Invoice.student_id,
                 func.coalesce(func.sum(
                     Invoice.total_amount - Invoice.discount_amount - Invoice.paid_amount), 0.0))
        .filter(*billable)
        .group_by(Invoice.student_id)
        .having(func.coalesce(func.sum(
            Invoice.total_amount - Invoice.discount_amount - Invoice.paid_amount), 0.0) > 0)
        .all()
    )
    outstanding_students = {r[0]: round(float(r[1] or 0.0), 2) for r in outstanding_rows}

    by_fee_head_rows = (
        db.query(FeeHead.id, FeeHead.name,
                 func.coalesce(func.sum(InvoiceItem.amount * InvoiceItem.quantity), 0.0))
        .select_from(InvoiceItem)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .outerjoin(FeeHead, FeeHead.id == InvoiceItem.fee_head_id)
        .filter(Invoice.status.notin_(EXCLUDED_INVOICE_STATUSES))
        .group_by(FeeHead.id, FeeHead.name)
        .all()
    )
    by_fee_head = [
        {"fee_head_id": r[0], "fee_head": r[1] or "Uncategorised", "amount": round(float(r[2] or 0.0), 2)}
        for r in by_fee_head_rows
    ]

    expense_total = _sum(
        db.query(func.coalesce(func.sum(Expense.amount), 0.0))
        .filter(Expense.status.in_(("approved", "paid"))))
    expense_rows = (
        db.query(ExpenseCategory.id, ExpenseCategory.name, func.sum(Expense.amount))
        .select_from(Expense)
        .join(ExpenseCategory, ExpenseCategory.id == Expense.category_id)
        .filter(Expense.status.in_(("approved", "paid")))
        .group_by(ExpenseCategory.id, ExpenseCategory.name)
        .all()
    )
    expense_by_category = [
        {"category_id": r[0], "category": r[1], "amount": round(float(r[2] or 0.0), 2)}
        for r in expense_rows
    ]
    income_rows = (
        db.query(Income.source, func.sum(Income.amount))
        .group_by(Income.source).all()
    )
    income_by_source = [
        {"source": r[0], "amount": round(float(r[1] or 0.0), 2)} for r in income_rows
    ]

    return FinanceSummaryResponse(
        total_billed=total_billed,
        net_billed=net_billed,
        collected=collected,
        outstanding=outstanding,
        outstanding_by_student=outstanding_students,
        overdue=overdue,
        today_collection=today_collection,
        month_collection=month_collection,
        by_fee_head=by_fee_head,
        expenses_total=expense_total,
        expense_by_category=expense_by_category,
        income_by_source=income_by_source,
    )


@router.get("/finance/income-statement/", response_model=IncomeStatementResponse,
            summary="Income statement over a date range (admin/principal)")
def income_statement(
    start_date: Optional[date] = Query(None, description="Inclusive start date"),
    end_date: Optional[date] = Query(None, description="Inclusive end date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Income statement for a date range (defaults to all time)."""
    _require_roles(current_user, {"admin", "principal", "accountant"}, "income statement")

    income_q = db.query(Income.source, func.sum(Income.amount)).group_by(Income.source)
    if start_date is not None:
        income_q = income_q.filter(Income.received_on >= start_date)
    if end_date is not None:
        income_q = income_q.filter(Income.received_on <= end_date)
    income_by_source = [{"source": r[0], "amount": round(float(r[1] or 0.0), 2)}
                        for r in income_q.all()]

    expense_q = (
        db.query(ExpenseCategory.name, func.sum(Expense.amount))
        .select_from(Expense)
        .join(ExpenseCategory, ExpenseCategory.id == Expense.category_id)
        .filter(Expense.status.in_(("approved", "paid")))
        .group_by(ExpenseCategory.name)
    )
    if start_date is not None:
        expense_q = expense_q.filter(Expense.expense_date >= start_date)
    if end_date is not None:
        expense_q = expense_q.filter(Expense.expense_date <= end_date)
    expense_by_category = [{"category": r[0], "amount": round(float(r[1] or 0.0), 2)}
                           for r in expense_q.all()]

    total_income = sum(r["amount"] for r in income_by_source)
    total_expense = sum(r["amount"] for r in expense_by_category)
    return IncomeStatementResponse(
        start_date=start_date, end_date=end_date,
        income_by_source=income_by_source, expense_by_category=expense_by_category,
        net_surplus=round(total_income - total_expense, 2),
    )


@router.get("/finance/outstanding/", response_model=List[OutstandingStudentResponse],
            summary="Per-student outstanding list (admin/accountant/principal)")
def outstanding_report(
    academic_year_id: Optional[int] = Query(None),
    overdue_only: bool = Query(False, description="Only rows with a past-due balance"),
    limit: int = Query(200, ge=1, le=1000),
    skip: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-student outstanding balances with days-overdue. Zero-safe when empty."""
    _require_roles(current_user, FINANCE_READ_ROLES, "finance reporting")
    today = date.today()

    q = db.query(Invoice).filter(Invoice.status.notin_(EXCLUDED_INVOICE_STATUSES))
    if academic_year_id is not None:
        q = q.filter(Invoice.academic_year_id == academic_year_id)
    invoices = q.all()

    buckets: dict = {}
    for inv in invoices:
        billed = round(float(inv.total_amount or 0.0) - float(inv.discount_amount or 0.0), 2)
        paid = round(float(inv.paid_amount or 0.0), 2)
        bal = round(billed - paid, 2)
        if bal <= MONEY_EPSILON:
            continue
        entry = buckets.setdefault(inv.student_id, {
            "total_billed": 0.0, "total_paid": 0.0, "outstanding": 0.0,
            "overdue_amount": 0.0, "days_overdue": 0, "invoice_count": 0,
        })
        entry["total_billed"] = round(entry["total_billed"] + billed, 2)
        entry["total_paid"] = round(entry["total_paid"] + paid, 2)
        entry["outstanding"] = round(entry["outstanding"] + bal, 2)
        entry["invoice_count"] += 1
        if inv.due_date is not None and inv.due_date < today:
            entry["overdue_amount"] = round(entry["overdue_amount"] + bal, 2)
            days = (today - inv.due_date).days
            entry["days_overdue"] = max(entry["days_overdue"], days)

    student_ids = list(buckets.keys())
    names: dict = {}
    if student_ids:
        for sid, nm, gr in db.query(Student.id, Student.name, Student.grade).filter(
                Student.id.in_(student_ids)).all():
            names[sid] = (nm, gr)

    rows = []
    for sid, entry in buckets.items():
        if overdue_only and entry["overdue_amount"] <= 0:
            continue
        nm, gr = names.get(sid, (None, None))
        rows.append({
            "student_id": sid, "student_name": nm, "grade": gr,
            "total_billed": entry["total_billed"], "total_paid": entry["total_paid"],
            "outstanding": entry["outstanding"], "overdue_amount": entry["overdue_amount"],
            "days_overdue": entry["days_overdue"], "invoice_count": entry["invoice_count"],
        })
    rows.sort(key=lambda r: (-r["outstanding"], r["student_id"]))
    return rows[skip:skip + limit]

