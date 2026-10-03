"""Notices router (Phase-2 hardening).

CRUD kept; GET / list now audience-filters server-side for student/parent
(without changing response shape); /notices/mine (engagement router) remains
the primary scoped feed.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Notice, User
from schemas import NoticeCreate, NoticeUpdate, NoticeResponse
from auth import get_current_user, require_role, resolve_student_ids

router = APIRouter()


def _audit(db: Session, user: User, action: str, entity_id=None):
    try:
        from routers.engagement import log_audit
        log_audit(db, user.id, action, "notices", entity_id)
    except Exception:
        pass


def _scoped_sections(user: User, db: Session) -> list:
    from models import Student
    ids = resolve_student_ids(user, db) or []
    if not ids:
        return []
    rows = (db.query(Student.class_section_id)
            .filter(Student.id.in_(ids)).distinct().all())
    return [r[0] for r in rows if r[0] is not None]


def _notice_visible(notice: Notice, user: User, sections: list) -> bool:
    if user.role in ("admin", "staff", "teacher"):
        return True
    audience = (notice.audience or "all").lower()
    if audience == "all":
        return True
    if audience in (user.role, f"{user.role}s"):
        return True
    if notice.class_section_id is not None and notice.class_section_id in (sections or []):
        return True
    return False


@router.get("/", response_model=List[NoticeResponse], summary="Get all notices")
def get_notices(
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = Query(None, description="Filter by category"),
    active_only: bool = Query(True, description="Show only active notices"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve notices; student/parent results are audience-filtered."""
    query = db.query(Notice)

    if category is not None:
        query = query.filter(Notice.category == category)
    if active_only:
        query = query.filter(Notice.is_active == True)

    notices = query.order_by(Notice.created_at.desc()).all()
    if current_user.role in ("student", "parent"):
        sections = _scoped_sections(current_user, db)
        notices = [n for n in notices if _notice_visible(n, current_user, sections)]
    return notices[skip:skip + limit]


@router.get("/{notice_id}", response_model=NoticeResponse, summary="Get notice by ID")
def get_notice(
    notice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a notice (student/parent get 403 when out-of-audience)."""
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if notice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notice with id {notice_id} not found",
        )
    if current_user.role in ("student", "parent"):
        sections = _scoped_sections(current_user, db)
        if not _notice_visible(notice, current_user, sections):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this notice is forbidden")
    return notice


@router.post("/", response_model=NoticeResponse, status_code=status.HTTP_201_CREATED, summary="Create a new notice")
def create_notice(
    notice: NoticeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """Create a new notice. Only admins and teachers can create notices."""
    expires_at = None
    if notice.expires_at:
        try:
            expires_at = datetime.fromisoformat(notice.expires_at)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid expires_at format. Use ISO format (YYYY-MM-DDTHH:MM:SS)",
            )

    db_notice = Notice(
        title=notice.title,
        content=notice.content,
        category=notice.category,
        posted_by=current_user.id,
        expires_at=expires_at,
        audience=notice.audience or "all",
        class_section_id=notice.class_section_id,
    )
    db.add(db_notice)
    db.commit()
    db.refresh(db_notice)
    _audit(db, current_user, "notice.create", db_notice.id)
    return db_notice


@router.put("/{notice_id}", response_model=NoticeResponse, summary="Update a notice")
def update_notice(
    notice_id: int,
    notice_update: NoticeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "teacher"])),
):
    """Update an existing notice. Only admins and teachers can update notices."""
    db_notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if db_notice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notice with id {notice_id} not found",
        )

    update_data = notice_update.model_dump(exclude_unset=True)

    if "expires_at" in update_data and update_data["expires_at"]:
        try:
            update_data["expires_at"] = datetime.fromisoformat(update_data["expires_at"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid expires_at format. Use ISO format (YYYY-MM-DDTHH:MM:SS)",
            )

    for field, value in update_data.items():
        setattr(db_notice, field, value)

    db.commit()
    db.refresh(db_notice)
    _audit(db, current_user, "notice.update", db_notice.id)
    return db_notice


@router.delete("/{notice_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a notice")
def delete_notice(
    notice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a notice. Only admins can delete notices."""
    db_notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if db_notice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notice with id {notice_id} not found",
        )

    db.delete(db_notice)
    db.commit()
    _audit(db, current_user, "notice.delete", notice_id)
