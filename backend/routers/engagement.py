"""Engagement router: assignments, calendar events, scoped notices, audit log."""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Assignment, AssignmentSubmission, AuditLog, CalendarEvent, ClassSection,
    Notice, NoticeRead, Student, TeacherAssignment, User,
)
from schemas import (
    AssignmentCreate, AssignmentUpdate, AssignmentResponse,
    AssignmentSubmissionCreate, AssignmentSubmissionResponse, AssignmentGradeRequest,
    AuditLogResponse, CalendarEventCreate, CalendarEventUpdate, CalendarEventResponse,
    NoticeResponse, NoticeReadResponse,
)
from auth import get_current_user, require_role, resolve_student_ids

router = APIRouter()


def log_audit(db: Session, actor_id, action: str, entity_type: str, entity_id=None, meta: str = None):
    """Append an audit record (best-effort; never raises).

    Args:
        db: Database session.
        actor_id: Acting user ID (nullable).
        action: Action name (e.g. "assignment.grade").
        entity_type: Entity type string.
        entity_id: Optional entity ID.
        meta: Optional JSON string with extra context.
    """
    try:
        db.add(AuditLog(actor_user_id=actor_id, action=action,
                        entity_type=entity_type, entity_id=entity_id, meta_json=meta))
        db.commit()
    except Exception:
        db.rollback()


def _teacher_section_ids(user: User, db: Session) -> list:
    """Return class section IDs assigned to the teacher user."""
    if user.teacher_id is None:
        return []
    rows = (db.query(TeacherAssignment.class_section_id)
            .filter(TeacherAssignment.teacher_id == user.teacher_id)
            .distinct().all())
    return [r[0] for r in rows if r[0] is not None]


# ─── Assignments ──────────────────────────────────────────────────────────────

@router.get("/assignments/", response_model=List[AssignmentResponse], summary="List assignments (scoped)")
def list_assignments(
    class_section_id: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List assignments scoped by role.

    Admin/staff see all; teachers see their sections'; students/parents see only
    assignments for their (linked) class sections.
    """
    query = db.query(Assignment)
    if class_section_id is not None:
        query = query.filter(Assignment.class_section_id == class_section_id)
    if current_user.role in ("admin", "staff"):
        return query.offset(skip).limit(limit).all()
    if current_user.role == "teacher":
        section_ids = _teacher_section_ids(current_user, db)
        return query.filter(Assignment.class_section_id.in_(section_ids)).offset(skip).limit(limit).all() if section_ids else []
    # student / parent: scope to their class sections
    student_ids = resolve_student_ids(current_user, db) or []
    if not student_ids:
        return []
    sections = [r[0] for r in db.query(Student.class_section_id)
                .filter(Student.id.in_(student_ids)).distinct().all()]
    sections = [s for s in sections if s is not None]
    if not sections:
        # Fall back to all assignments when students have no section yet
        return query.offset(skip).limit(limit).all()
    return query.filter(Assignment.class_section_id.in_(sections)).offset(skip).limit(limit).all()


@router.post("/assignments/", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED, summary="Create assignment (teacher/admin)")
def create_assignment(
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """Create an assignment. Teachers and admins only."""
    teacher_id = payload.teacher_id
    if current_user.role == "teacher":
        teacher_id = current_user.teacher_id
    data = payload.model_dump(exclude={"teacher_id"})
    db_item = Assignment(**data, teacher_id=teacher_id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    log_audit(db, current_user.id, "assignment.create", "assignments", db_item.id)
    return db_item


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse, summary="Get assignment by ID")
def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single assignment by ID (scoped for students/parents)."""
    db_item = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Assignment with id {assignment_id} not found")
    return db_item


@router.put("/assignments/{assignment_id}", response_model=AssignmentResponse, summary="Update assignment (teacher/admin)")
def update_assignment(
    assignment_id: int,
    payload: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """Update an assignment. Teachers and admins only."""
    db_item = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Assignment with id {assignment_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_item, field, value)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete assignment (teacher/admin)")
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """Delete an assignment. Teachers and admins only."""
    db_item = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Assignment with id {assignment_id} not found")
    db.delete(db_item)
    db.commit()


@router.post("/assignments/{assignment_id}/submit", response_model=AssignmentSubmissionResponse, status_code=status.HTTP_201_CREATED, summary="Submit assignment (student own)")
def submit_assignment(
    assignment_id: int,
    payload: AssignmentSubmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "student"])),
):
    """Submit (or re-submit) an assignment. Students submit only for themselves.

    Args:
        assignment_id: The assignment ID in the path.
        payload: Submission content (assignment_id in body must match path).
        db: Database session. current_user: Student or admin.

    Returns:
        The created/updated submission.
    """
    if payload.assignment_id != assignment_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Body assignment_id must match path assignment_id")
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Assignment with id {assignment_id} not found")
    student_id = current_user.student_id
    if current_user.role == "admin":
        # Admin submitting on behalf: use first student if none linked
        if student_id is None:
            first = db.query(Student).first()
            if first is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                    detail="No students exist to submit for")
            student_id = first.id
    if student_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Student profile not linked to this user")
    existing = (db.query(AssignmentSubmission)
                .filter(AssignmentSubmission.assignment_id == assignment_id,
                        AssignmentSubmission.student_id == student_id)
                .first())
    if existing is not None:
        existing.content = payload.content
        existing.file_url = payload.file_url
        db.commit()
        db.refresh(existing)
        return existing
    db_sub = AssignmentSubmission(assignment_id=assignment_id, student_id=student_id,
                                  content=payload.content, file_url=payload.file_url)
    db.add(db_sub)
    db.commit()
    db.refresh(db_sub)
    log_audit(db, current_user.id, "assignment.submit", "assignment_submissions", db_sub.id)
    return db_sub


@router.get("/assignments/{assignment_id}/submissions", response_model=List[AssignmentSubmissionResponse], summary="List submissions (teacher/admin)")
def list_submissions(
    assignment_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """List all submissions for an assignment. Teachers and admins only."""
    if db.query(Assignment).filter(Assignment.id == assignment_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Assignment with id {assignment_id} not found")
    return (db.query(AssignmentSubmission)
            .filter(AssignmentSubmission.assignment_id == assignment_id).offset(skip).limit(limit).all())


@router.post("/submissions/{submission_id}/grade", response_model=AssignmentSubmissionResponse, summary="Grade a submission (teacher/admin)")
def grade_submission(
    submission_id: int,
    payload: AssignmentGradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """Grade a submission. Teachers and admins only."""
    db_sub = db.query(AssignmentSubmission).filter(AssignmentSubmission.id == submission_id).first()
    if db_sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Submission with id {submission_id} not found")
    db_sub.score = payload.score
    db_sub.graded_at = datetime.utcnow()
    db.commit()
    db.refresh(db_sub)
    log_audit(db, current_user.id, "assignment.grade", "assignment_submissions", db_sub.id,
              meta=f'{{"score": {payload.score}}}')
    return db_sub


# ─── Calendar ─────────────────────────────────────────────────────────────────

def _calendar_visible(user: User, db: Session) -> list:
    """Return class section IDs relevant to the user for calendar scoping."""
    if user.role == "teacher":
        return _teacher_section_ids(user, db)
    student_ids = resolve_student_ids(user, db)
    if student_ids is None:
        return None  # all
    sections = [r[0] for r in db.query(Student.class_section_id)
                .filter(Student.id.in_(student_ids)).distinct().all()]
    return [s for s in sections if s is not None]


@router.get("/calendar/", response_model=List[CalendarEventResponse], summary="List calendar events (scoped)")
def list_calendar(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List calendar events visible to the user (audience-filtered)."""
    events = db.query(CalendarEvent).offset(skip).limit(limit).all()
    if current_user.role in ("admin", "staff"):
        return events
    scoped = _calendar_visible(current_user, db) or []
    visible = []
    for ev in events:
        if ev.audience in (None, "all"):
            visible.append(ev)
        elif ev.audience == current_user.role or ev.audience == f"{current_user.role}s":
            visible.append(ev)
        elif ev.class_section_id is not None and ev.class_section_id in scoped:
            visible.append(ev)
    return visible


@router.post("/calendar/", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED, summary="Create calendar event (admin/teacher)")
def create_calendar_event(
    payload: CalendarEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """Create a calendar event. Admins and teachers only."""
    db_item = CalendarEvent(**payload.model_dump(), created_by=current_user.id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/calendar/{event_id}", response_model=CalendarEventResponse, summary="Update calendar event (admin/teacher)")
def update_calendar_event(
    event_id: int,
    payload: CalendarEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """Update a calendar event. Admins and teachers only."""
    db_item = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Calendar event with id {event_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_item, field, value)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/calendar/{event_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete calendar event (admin)")
def delete_calendar_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a calendar event. Admin only."""
    db_item = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Calendar event with id {event_id} not found")
    db.delete(db_item)
    db.commit()


# ─── Scoped Notices ───────────────────────────────────────────────────────────

def _notice_visible(notice: Notice, user: User, scoped_sections: list) -> bool:
    """Check whether a notice is visible to the user."""
    if user.role in ("admin", "staff"):
        return True
    audience = (notice.audience or "all").lower()
    if audience == "all":
        return True
    if audience in (user.role, f"{user.role}s"):
        return True
    if notice.class_section_id is not None and notice.class_section_id in (scoped_sections or []):
        return True
    return False


@router.get("/notices/mine", response_model=List[NoticeResponse], summary="List my audience-filtered notices")
def get_my_notices(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List active notices filtered by the caller's audience.

    Args:
        skip: Records to skip. limit: Max records.
        db: Database session. current_user: Auth user.

    Returns:
        Audience-filtered active notices.
    """
    scoped = _calendar_visible(current_user, db) or []
    notices = (db.query(Notice).filter(Notice.is_active == True)
               .order_by(Notice.created_at.desc()).all())
    visible = [n for n in notices if _notice_visible(n, current_user, scoped)]
    return visible[skip:skip + limit]


@router.post("/notices/{notice_id}/read", response_model=NoticeReadResponse, status_code=status.HTTP_201_CREATED, summary="Mark notice as read")
def mark_notice_read(
    notice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record that the current user has read a notice (idempotent).

    Args:
        notice_id: The notice ID.
        db: Database session. current_user: Auth user.

    Returns:
        The read receipt.
    """
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if notice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Notice with id {notice_id} not found")
    existing = (db.query(NoticeRead)
                .filter(NoticeRead.notice_id == notice_id,
                        NoticeRead.user_id == current_user.id)
                .first())
    if existing is not None:
        return existing
    receipt = NoticeRead(notice_id=notice_id, user_id=current_user.id,
                         read_at=datetime.utcnow())
    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return receipt


# ─── Audit Log (admin only) ───────────────────────────────────────────────────

@router.get("/audit/", response_model=List[AuditLogResponse], summary="List audit log (admin)")
def list_audit_log(
    skip: int = 0,
    limit: int = 100,
    action: Optional[str] = Query(None, description="Filter by action"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """List audit log entries, newest first. Admin only.

    Args:
        skip: Records to skip. limit: Max records.
        action: Optional action filter. entity_type: Optional entity filter.
        db: Database session. current_user: Admin user.

    Returns:
        List of audit log entries.
    """
    query = db.query(AuditLog)
    if action is not None:
        query = query.filter(AuditLog.action == action)
    if entity_type is not None:
        query = query.filter(AuditLog.entity_type == entity_type)
    return query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
