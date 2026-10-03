"""Exams & report cards router (Phase-2, ADDITIVE).

Mounted at /api. Collection routes keep trailing slashes.

This module is strictly additive:

* It NEVER reads or writes the legacy flat ``marks`` table, so ``/api/marks/*``
  and every ``Mark`` row keep working exactly as before.
* Every new table is created by ``Base.metadata.create_all()`` → no migration.
* Every mutation writes an ``audit_logs`` row via :func:`log_audit`.
* Every ``IntegrityError`` is translated into a 400 (never a 500).

Role model
----------
======================================  ==========================================
Read exams / report cards               admin, principal, vice_principal,
                                        teacher (own sections / own exams),
                                        student (own), parent (linked children),
                                        staff *only* with an ``exams:read`` grant.
                                        accountant / librarian / receptionist /
                                        transport_manager → 403.
Create / update exams                   admin, principal, vice_principal
                                        (teacher is NOT allowed).
Enter / edit marks                      admin, principal, vice_principal, teacher
                                        (teacher only for their TeacherAssignment
                                        class-section + subject, or exams they
                                        own / invigilate).
Publish exam, publish results, ranks    admin, principal only.
Grade scales                            any authenticated user may read;
                                        writes are admin only.
======================================  ==========================================
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import get_current_user, get_user_permissions, require_role, resolve_student_ids
from database import get_db
from models import (
    AcademicYear, ClassSection, Exam, ExamEnrollment, ExamMark, ExamSubject,
    GradeScale, ReportCard, Student, Subject, Teacher, TeacherAssignment, User,
)
from routers.engagement import log_audit
from schemas import (
    BulkEnrollRequest, BulkMarkItem, BulkMarksRequest,
    ExamCreate, ExamEnrollmentCreate, ExamEnrollmentResponse, ExamEnrollmentUpdate,
    ExamMarkCreate, ExamMarkResponse, ExamMarkUpdate,
    ExamResponse, ExamSubjectCreate, ExamSubjectResponse, ExamSubjectSummary,
    ExamSubjectUpdate, ExamUpdate, GradeScaleCreate, GradeScaleResponse,
    GradeScaleUpdate, PublishBulkRequest, ReportCardResponse, ReportCardSubjectRow,
    ReportCardUpdate, SubjectStatRow,
)

router = APIRouter()


# ─── Constants ──────────────────────────────────────────────────────────────

#: Roles that may read exams / report cards at all (staff is handled separately
#: because it needs an explicit ``exams:read`` grant).
EXAM_READ_ROLES = ("admin", "principal", "vice_principal", "teacher", "student", "parent")

#: Roles that may create / update exams.
EXAM_WRITE_ROLES = ("admin", "principal", "vice_principal")

#: Roles that may enter or edit marks.
MARK_WRITE_ROLES = ("admin", "principal", "vice_principal", "teacher")

#: Roles that may publish an exam, publish results, or recompute ranks.
PUBLISH_ROLES = ("admin", "principal")

#: The default grade bands seeded by :func:`seed_default_grade_scales`.
#: (letter, min_percentage, max_percentage, grade_point)
DEFAULT_GRADE_BANDS = (
    ("A+", 90.0, 100.0, 10.0),
    ("A", 80.0, 90.0, 9.0),
    ("B+", 70.0, 80.0, 8.0),
    ("B", 60.0, 70.0, 7.0),
    ("C", 50.0, 60.0, 6.0),
    ("D", 40.0, 50.0, 5.0),
    ("F", 0.0, 40.0, 0.0),
)

#: Name of the scale seeded by :func:`seed_default_grade_scales`.
DEFAULT_GRADE_SCALE_NAME = "Default CBSE"


# ─── Generic helpers ────────────────────────────────────────────────────────

def _integrity_detail(exc: IntegrityError, message: str) -> HTTPException:
    """Map a unique/constraint failure to a clean 400 (never a 500)."""
    raw = str(getattr(exc, "orig", exc)).lower()
    if "unique" in raw or "constraint" in raw:
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"{message} (database constraint: {getattr(exc, 'orig', exc)})",
    )


def _apply_updates(obj, payload) -> None:
    """Copy an Update model's explicitly-set fields onto an ORM row."""
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)


def _commit(db: Session, message: str) -> None:
    """Commit, converting any IntegrityError into a 400."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_detail(exc, message)


# ─── Scoping helpers ────────────────────────────────────────────────────────

def _can_read_exams(user: User, db: Session) -> bool:
    """Whether the user may read exams / report cards at all."""
    if user.role in EXAM_READ_ROLES:
        return True
    if user.role == "staff":
        perms = get_user_permissions(user, db)
        return ("*", "*") in perms or ("exams", "read") in perms
    # accountant, librarian, receptionist, transport_manager (and anything else)
    return False


def _require_exam_reader(user: User, db: Session) -> None:
    """Raise 403 when the user may not read exams / report cards."""
    if not _can_read_exams(user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to read exams or report cards.",
        )


def _student_ids_or_403(user: User, db: Session) -> Optional[list]:
    """Visible student IDs, or ``None`` for "all students"; 403 if none visible.

    Uses :func:`resolve_student_ids` so student / parent / teacher scoping stays
    identical to the rest of the backend.
    """
    if user.role in ("admin", "principal", "vice_principal"):
        return None
    if user.role == "staff" and _can_read_exams(user, db):
        return None
    ids = resolve_student_ids(user, db)
    if ids is None:
        return None
    return list(ids)


def _teacher_section_ids(user: User, db: Session) -> list:
    """Class section IDs the teacher user is assigned to."""
    if user.teacher_id is None:
        return []
    rows = (db.query(TeacherAssignment.class_section_id)
            .filter(TeacherAssignment.teacher_id == user.teacher_id)
            .distinct().all())
    return [r[0] for r in rows if r[0] is not None]


def _student_section_ids(user: User, db: Session) -> list:
    """Class section IDs of the students visible to the user."""
    ids = _student_ids_or_403(user, db)
    if ids is None:
        return []
    rows = (db.query(Student.class_section_id)
            .filter(Student.id.in_(ids)).distinct().all())
    return [r[0] for r in rows if r[0] is not None]


def _teacher_owns_exam_ids(user: User, db: Session) -> list:
    """Exam IDs the teacher owns (created) or invigilates."""
    if user.teacher_id is None:
        ids = [r[0] for r in db.query(Exam.id)
               .filter(Exam.created_by == user.id).all()]
    else:
        ids = [r[0] for r in db.query(ExamSubject.exam_id)
               .filter(ExamSubject.invigilator_id == user.teacher_id).distinct().all()]
        ids += [r[0] for r in db.query(Exam.id).filter(Exam.created_by == user.id).all()]
    return list({i for i in ids if i is not None})


def _visible_exam_ids(user: User, db: Session) -> list:
    """Exam IDs the caller may read.

    * teacher: exams in their assigned class sections + exams they own/invigilate.
    * student / parent: **published** exams they are enrolled in, or whose
      class_section_id matches one of their (children's) sections.
    * admin / principal / vice_principal / staff: ``None`` meaning "no filter".
    """
    if user.role in ("admin", "principal", "vice_principal"):
        return None
    if user.role == "staff" and _can_read_exams(user, db):
        return None
    if user.role == "teacher":
        return _teacher_exam_scope(user, db)
    # student / parent
    ids = _student_ids_or_403(user, db) or []
    if not ids:
        return []
    enrolled = [r[0] for r in db.query(ExamEnrollment.exam_id)
                .filter(ExamEnrollment.student_id.in_(ids)).distinct().all()]
    sections = [r[0] for r in db.query(Student.class_section_id)
                .filter(Student.id.in_(ids)).distinct().all()]
    sections = [s for s in sections if s is not None]
    scoped = set(enrolled)
    if sections:
        scoped.update(r[0] for r in db.query(Exam.id)
                      .filter(Exam.class_section_id.in_(sections)).all())
    return list(scoped)


def _teacher_exam_scope(user: User, db: Session) -> list:
    """Teacher exam scope: assigned sections OR owned / invigilated exams."""
    sections = _teacher_section_ids(user, db)
    found = set(_teacher_owns_exam_ids(user, db))
    if sections:
        found.update(r[0] for r in db.query(Exam.id)
                     .filter(Exam.class_section_id.in_(sections)).all())
    return list(found)


def _scope_exam_query(query, user: User, db: Session):
    """Apply role scoping to an Exam query.

    For students/parents the scope ALSO hides unpublished exams, so a list
    endpoint can never leak a draft the detail route would 403 on.
    """
    if user.role in ("admin", "principal", "vice_principal"):
        return query
    if user.role == "staff" and _can_read_exams(user, db):
        return query
    if user.role in ("student", "parent"):
        query = query.filter(Exam.is_published == True)  # noqa: E712
    allowed = _teacher_exam_scope(user, db) if user.role == "teacher" \
        else _visible_exam_ids(user, db)
    allowed = allowed or []
    if not allowed:
        return query.filter(False)
    return query.filter(Exam.id.in_(allowed))


def _exam_or_404(db: Session, exam_id: int) -> Exam:
    """Fetch an exam or raise 404."""
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam with id {exam_id} not found")
    return exam


def _exam_read_guard(exam: Exam, user: User, db: Session) -> None:
    """404 is handled by the caller; this raises 403 when out of scope.

    For students/parents a non-published exam reads as 403 as well, so that
    unpublished exams cannot be probed by id.
    """
    if user.role in ("admin", "principal", "vice_principal"):
        return
    if user.role == "staff" and _can_read_exams(user, db):
        return
    allowed = _teacher_exam_scope(user, db) if user.role == "teacher" \
        else _visible_exam_ids(user, db)
    if exam.id not in (allowed or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This exam is outside your scope")
    if user.role in ("student", "parent") and not exam.is_published:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This exam has not been published yet")


# ─── Grade scale seeding + lookup ───────────────────────────────────────────

def seed_default_grade_scales(db: Session) -> int:
    """Seed the default grade-scale bands. Idempotent; returns rows inserted.

    Idempotency key is the ``(name, min_percentage)`` unique constraint, so this
    is safe to call on every boot and after an admin has edited the bands
    (existing rows are never overwritten).
    """
    added = 0
    for letter, lo, hi, point in DEFAULT_GRADE_BANDS:
        exists = (db.query(GradeScale)
                  .filter(GradeScale.name == DEFAULT_GRADE_SCALE_NAME,
                          GradeScale.min_percentage == lo).first())
        if exists is not None:
            continue
        db.add(GradeScale(name=DEFAULT_GRADE_SCALE_NAME,
                          description="Default CBSE grading bands",
                          is_default=True,
                          min_percentage=lo, max_percentage=hi,
                          letter_grade=letter, grade_point=point))
        added += 1
    if added:
        db.commit()
    return added


def _default_bands(db: Session) -> list:
    """Return the active grading bands, ordered high -> low."""
    rows = (db.query(GradeScale)
            .filter(GradeScale.is_default == True)  # noqa: E712
            .order_by(GradeScale.min_percentage.desc()).all())
    if not rows:
        rows = (db.query(GradeScale)
                .filter(GradeScale.name == DEFAULT_GRADE_SCALE_NAME)
                .order_by(GradeScale.min_percentage.desc()).all())
    if not rows:
        # DB not seeded yet → fall back to the in-code defaults (never raise).
        return [{"letter_grade": l, "min_percentage": lo,
                 "max_percentage": hi, "grade_point": p}
                for (l, lo, hi, p) in DEFAULT_GRADE_BANDS]
    return rows


def _apply_grade_scale(db: Session, percentage: float,
                       academic_year_id: Optional[int] = None) -> tuple:
    """Map a percentage onto ``(letter_grade, grade_point)``.

    ``academic_year_id`` is accepted so callers can later support per-year
    scales; the default band set is global today. Never raises: an unseeded /
    empty table falls back to :data:`DEFAULT_GRADE_BANDS`.
    """
    try:
        pct = float(percentage or 0.0)
    except (TypeError, ValueError):
        pct = 0.0
    bands = _default_bands(db)
    for band in bands:
        lo = float(band.min_percentage)
        hi = float(band.max_percentage)
        if pct >= lo and (pct < hi or (pct == hi and hi >= 100.0)):
            return band.letter_grade, float(band.grade_point)
    # Below every band → lowest band; above every band → highest band.
    lowest = bands[-1]
    if pct < float(lowest.min_percentage):
        return lowest.letter_grade, float(lowest.grade_point)
    return bands[0].letter_grade, float(bands[0].grade_point)


# ─── Serialisation helpers ──────────────────────────────────────────────────

def _exam_subject_summary(db: Session, es: ExamSubject) -> dict:
    subject = db.query(Subject).filter(Subject.id == es.subject_id).first()
    return ExamSubjectSummary(
        id=es.id, subject_id=es.subject_id,
        subject_name=subject.name if subject else None,
        max_marks=es.max_marks, exam_date=es.exam_date,
        room=es.room, invigilator_id=es.invigilator_id,
    )


def _exam_response(db: Session, exam: Exam, embed: bool = True) -> dict:
    """Serialise an Exam, optionally embedding `subjects` and `student_count`."""
    data = {
        "id": exam.id,
        "name": exam.name,
        "exam_type": exam.exam_type,
        "academic_year_id": exam.academic_year_id,
        "class_section_id": exam.class_section_id,
        "start_date": exam.start_date,
        "end_date": exam.end_date,
        "max_marks": exam.max_marks,
        "pass_marks": exam.pass_marks,
        "weightage": exam.weightage,
        "remarks": exam.remarks,
        "is_published": bool(exam.is_published),
        "published_at": exam.published_at,
        "result_published": bool(exam.result_published),
        "result_published_at": exam.result_published_at,
        "created_by": exam.created_by,
        "created_at": exam.created_at,
    }
    if embed:
        subjects = (db.query(ExamSubject)
                    .filter(ExamSubject.exam_id == exam.id)
                    .order_by(ExamSubject.id).all())
        data["subjects"] = [_exam_subject_summary(db, s).model_dump() for s in subjects]
        data["student_count"] = db.query(ExamEnrollment).filter(
            ExamEnrollment.exam_id == exam.id).count()
    return data


def _subject_max_marks(exam: Exam, exam_subject: ExamSubject) -> float:
    """Effective max marks for one subject paper."""
    if exam_subject.max_marks is not None:
        return float(exam_subject.max_marks)
    return float(exam.max_marks or 0.0)


def _subject_pass_marks(exam: Exam, exam_subject: ExamSubject) -> float:
    """Subject pass marks, scaled from the exam-level pass/max ratio."""
    subject_max = _subject_max_marks(exam, exam_subject)
    exam_max = float(exam.max_marks or 0.0)
    if exam_max > 0:
        return float(exam.pass_marks or 0.0) * (subject_max / exam_max)
    return float(exam.pass_marks or 0.0)


def _compute_student_result(db: Session, exam: Exam,
                            enrollment: ExamEnrollment) -> dict:
    """Compute (but never persist) one student's result for one exam.

    Exempted papers are excluded from both the numerator and the denominator.
    Absent / unmarked papers count as failures when at least one other paper was
    marked, which is what CBSE-style rules expect.
    """
    subjects = (db.query(ExamSubject)
                .filter(ExamSubject.exam_id == exam.id)
                .order_by(ExamSubject.id).all())
    rows = []
    total = 0.0
    max_total = 0.0
    failed = 0
    graded_subjects = 0
    for es in subjects:
        subject_max = _subject_max_marks(exam, es)
        subject_pass = _subject_pass_marks(exam, es)
        subj = db.query(Subject).filter(Subject.id == es.subject_id).first()
        mark = (db.query(ExamMark)
                .filter(ExamMark.exam_subject_id == es.id,
                        ExamMark.exam_enrollment_id == enrollment.id).first())
        is_exempted = bool(enrollment.exempted or (mark is not None and mark.is_exempted))
        is_absent = bool(enrollment.is_absent or (mark is not None and mark.is_absent))
        score = None if mark is None else mark.score
        if is_exempted:
            counted = False
        else:
            counted = True
            if is_absent or score is None:
                failed += 1
            else:
                graded_subjects += 1
                total += float(score)
                max_total += subject_max
                if float(score) < subject_pass:
                    failed += 1
        rows.append({
            "subject_id": es.subject_id,
            "subject_name": subj.name if subj else None,
            "score": None if (is_absent or is_exempted or score is None) else float(score),
            "max_marks": subject_max,
            "percentage": (round(float(score) * 100.0 / subject_max, 2)
                           if (counted and not is_absent and score is not None
                               and subject_max > 0) else None),
            "is_absent": is_absent,
            "is_exempted": is_exempted,
            "is_pass": bool(counted and not is_absent and score is not None
                            and float(score) >= subject_pass),
        })
    percentage = round(total * 100.0 / max_total, 2) if max_total > 0 else 0.0
    letter, point = _apply_grade_scale(db, percentage, exam.academic_year_id)
    pass_ratio = (float(exam.pass_marks) * 100.0 / float(exam.max_marks)
                  if float(exam.max_marks or 0) > 0 else 33.0)
    if graded_subjects == 0:
        result = "fail"
    elif failed == 0:
        result = "pass"
    elif percentage >= pass_ratio:
        result = "compartmental"
    else:
        result = "fail"
    return {
        "total_marks": round(total, 2),
        "max_total_marks": round(max_total, 2),
        "percentage": percentage,
        "grade": letter,
        "grade_point": point,
        "result": result,
        "subjects": rows,
    }


def _report_card_subjects(db: Session, card: ReportCard) -> List[ReportCardSubjectRow]:
    """Rebuild the per-subject breakdown for an existing report card."""
    exam = db.query(Exam).filter(Exam.id == card.exam_id).first()
    if exam is None:
        return []
    enrollment = (db.query(ExamEnrollment)
                  .filter(ExamEnrollment.exam_id == card.exam_id,
                          ExamEnrollment.student_id == card.student_id).first())
    if enrollment is None:
        return []
    computed = _compute_student_result(db, exam, enrollment)
    return [ReportCardSubjectRow(**row) for row in computed["subjects"]]


def _report_card_response(db: Session, card: ReportCard,
                          embed_subjects: bool = True) -> dict:
    """Serialise a ReportCard, embedding the computed subject breakdown."""
    student = db.query(Student).filter(Student.id == card.student_id).first()
    exam = db.query(Exam).filter(Exam.id == card.exam_id).first()
    data = {
        "id": card.id,
        "student_id": card.student_id,
        "exam_id": card.exam_id,
        "academic_year_id": card.academic_year_id,
        "class_section_id": card.class_section_id,
        "student_name": student.name if student else None,
        "exam_name": exam.name if exam else None,
        "total_marks": card.total_marks,
        "max_total_marks": card.max_total_marks,
        "percentage": card.percentage,
        "grade": card.grade,
        "grade_point": card.grade_point,
        "result": card.result,
        "rank": card.rank,
        "class_rank": card.class_rank,
        "attendance_percentage": card.attendance_percentage,
        "teacher_remarks": card.teacher_remarks,
        "principal_remarks": card.principal_remarks,
        "is_published": bool(card.is_published),
        "published_at": card.published_at,
        "generated_by": card.generated_by,
        "created_at": card.created_at,
    }
    if embed_subjects:
        data["subjects"] = [r.model_dump() for r in _report_card_subjects(db, card)]
    return data


def _report_card_read_guard(card: ReportCard, user: User, db: Session) -> None:
    """403 when the caller may not read this report card."""
    if user.role in ("admin", "principal", "vice_principal"):
        return
    if user.role == "staff" and _can_read_exams(user, db):
        return
    visible = _student_ids_or_403(user, db) or []
    if card.student_id not in visible:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access to this student's report card is forbidden")
    if user.role in ("student", "parent") and not card.is_published:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="This report card has not been published yet")


# ─── Grade scales ───────────────────────────────────────────────────────────

@router.get("/grade-scales/", response_model=List[GradeScaleResponse],
            summary="List grade scales (any authenticated user)")
def list_grade_scales(
    is_default: Optional[bool] = Query(None, description="Filter by default flag"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List grade-scale bands ordered high → low. Configuration metadata."""
    query = db.query(GradeScale)
    if is_default is not None:
        query = query.filter(GradeScale.is_default == is_default)  # noqa: E712
    return (query.order_by(GradeScale.min_percentage.desc())
            .offset(skip).limit(limit).all())


@router.post("/grade-scales/", response_model=GradeScaleResponse,
             status_code=status.HTTP_201_CREATED, summary="Create grade scale (admin)")
def create_grade_scale(
    payload: GradeScaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a grade-scale band. Admin only. Duplicate (name, min) → 400."""
    if payload.max_percentage < payload.min_percentage:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="max_percentage must be >= min_percentage")
    obj = GradeScale(**payload.model_dump())
    db.add(obj)
    _commit(db, "A grade scale with this name and min_percentage already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "grade_scale.create", "grade_scales", obj.id)
    return obj


@router.get("/grade-scales/{scale_id}", response_model=GradeScaleResponse,
            summary="Get grade scale by ID")
def get_grade_scale(
    scale_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one grade-scale band. Any authenticated user."""
    obj = db.query(GradeScale).filter(GradeScale.id == scale_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Grade scale with id {scale_id} not found")
    return obj


@router.put("/grade-scales/{scale_id}", response_model=GradeScaleResponse,
            summary="Update grade scale (admin)")
def update_grade_scale(
    scale_id: int,
    payload: GradeScaleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a grade-scale band. Admin only."""
    obj = db.query(GradeScale).filter(GradeScale.id == scale_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Grade scale with id {scale_id} not found")
    _apply_updates(obj, payload)
    if obj.max_percentage is not None and obj.min_percentage is not None \
            and obj.max_percentage < obj.min_percentage:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="max_percentage must be >= min_percentage")
    _commit(db, "A grade scale with this name and min_percentage already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "grade_scale.update", "grade_scales", obj.id)
    return obj


@router.delete("/grade-scales/{scale_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete grade scale (admin)")
def delete_grade_scale(
    scale_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a grade-scale band. Admin only. 400 when it is in use."""
    obj = db.query(GradeScale).filter(GradeScale.id == scale_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Grade scale with id {scale_id} not found")
    in_use = (db.query(ReportCard)
              .filter(ReportCard.grade == obj.letter_grade).count())
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(f"Grade scale is referenced by {in_use} report card(s) "
                    "computed from it; deactivate or re-band instead of deleting"),
        )
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "grade_scale.delete", "grade_scales", scale_id)


# ─── Exams ──────────────────────────────────────────────────────────────────

@router.get("/exams/mine", response_model=List[ExamResponse],
            summary="My exams (student: enrolled / published / own section)")
def get_my_exams(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the exams relevant to the calling student.

    "Relevant" = published AND (enrolled OR class_section_id is one of the
    student's sections). Declared BEFORE ``/exams/{exam_id}`` so the literal
    ``mine`` segment is never captured as an exam id.

    Non-students get 403; staff/parents fall back to the scoped exam list.
    """
    if current_user.role == "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only students have a personal exam list")
    _require_exam_reader(current_user, db)
    if current_user.role not in ("student", "parent"):
        exams = _scope_exam_query(db.query(Exam), current_user, db).all()
        return [_exam_response(db, e) for e in exams[skip:skip + limit]]

    ids = _student_ids_or_403(current_user, db) or []
    if not ids:
        return []
    enrolled = [r[0] for r in db.query(ExamEnrollment.exam_id)
                .filter(ExamEnrollment.student_id.in_(ids)).distinct().all()]
    sections = [r[0] for r in db.query(Student.class_section_id)
                .filter(Student.id.in_(ids)).distinct().all()]
    sections = [s for s in sections if s is not None]

    query = db.query(Exam).filter(Exam.is_published == True)  # noqa: E712
    if enrolled or sections:
        query = query.filter(
            (Exam.id.in_(enrolled)) if enrolled else (Exam.id == -1)
            | ((Exam.class_section_id.in_(sections)) if sections else (Exam.id == -1))
        )
    else:
        return []
    exams = query.order_by(Exam.start_date.is_(None), Exam.start_date,
                           Exam.id).all()
    return [_exam_response(db, e) for e in exams[skip:skip + limit]]


@router.get("/exams/", response_model=List[ExamResponse], summary="List exams (scoped)")
def list_exams(
    academic_year_id: Optional[int] = Query(None, description="Filter by academic year"),
    class_section_id: Optional[int] = Query(None, description="Filter by class section"),
    exam_type: Optional[str] = Query(None, description="Filter by exam type"),
    is_published: Optional[bool] = Query(None, description="Filter by publication flag"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List exams with role scoping applied.

    Teachers only see exams in their assigned sections or exams they own /
    invigilate; students and parents only see relevant published exams;
    accountant / librarian / receptionist / transport_manager get 403.
    """
    _require_exam_reader(current_user, db)
    query = db.query(Exam)
    if academic_year_id is not None:
        query = query.filter(Exam.academic_year_id == academic_year_id)
    if class_section_id is not None:
        query = query.filter(Exam.class_section_id == class_section_id)
    if exam_type is not None:
        query = query.filter(Exam.exam_type == exam_type)
    if is_published is not None:
        query = query.filter(Exam.is_published == is_published)
    query = _scope_exam_query(query, current_user, db)
    exams = query.order_by(Exam.id.desc()).offset(skip).limit(limit).all()
    return [_exam_response(db, e) for e in exams]


@router.post("/exams/", response_model=ExamResponse,
             status_code=status.HTTP_201_CREATED,
             summary="Create exam (admin/principal/vice_principal)")
def create_exam(
    payload: ExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Create an exam. Teachers are NOT allowed."""
    if payload.class_section_id is not None and db.query(ClassSection).filter(
            ClassSection.id == payload.class_section_id).first() is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Class section {payload.class_section_id} does not exist")
    obj = Exam(**payload.model_dump(), created_by=current_user.id)
    db.add(obj)
    _commit(db, "Exam could not be created (duplicate or constraint violation)")
    db.refresh(obj)
    log_audit(db, current_user.id, "exam.create", "exams", obj.id,
              meta=f'{{"name": "{obj.name}"}}')
    return _exam_response(db, obj)


@router.get("/exams/{exam_id}", response_model=ExamResponse, summary="Get exam by ID")
def get_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one exam. 404 when missing, 403 when outside the caller's scope."""
    _require_exam_reader(current_user, db)
    exam = _exam_or_404(db, exam_id)
    _exam_read_guard(exam, current_user, db)
    return _exam_response(db, exam)


@router.put("/exams/{exam_id}", response_model=ExamResponse,
            summary="Update exam (admin/principal/vice_principal)")
def update_exam(
    exam_id: int,
    payload: ExamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Update exam metadata. Publication flags are NOT editable here."""
    exam = _exam_or_404(db, exam_id)
    _apply_updates(exam, payload)
    _commit(db, "Exam could not be updated (duplicate or constraint violation)")
    db.refresh(exam)
    log_audit(db, current_user.id, "exam.update", "exams", exam.id)
    return _exam_response(db, exam)


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete exam (admin only)")
def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete an exam. Admin only.

    Refuses (400) when any ExamMark rows exist — publish or re-open the exam
    instead, so historical scores are never silently destroyed.
    """
    exam = _exam_or_404(db, exam_id)
    mark_count = (db.query(ExamMark)
                  .join(ExamSubject, ExamSubject.id == ExamMark.exam_subject_id)
                  .filter(ExamSubject.exam_id == exam_id).count())
    if mark_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(f"Exam has {mark_count} mark row(s) and cannot be deleted; "
                    "publish it or remove the marks first"),
        )
    db.delete(exam)
    db.commit()
    log_audit(db, current_user.id, "exam.delete", "exams", exam_id)


@router.post("/exams/{exam_id}/publish", summary="Publish exam (admin/principal)")
def publish_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(PUBLISH_ROLES))),
):
    """Publish an exam's schedule (sets is_published + published_at)."""
    exam = _exam_or_404(db, exam_id)
    if not exam.is_published:
        exam.is_published = True
        exam.published_at = datetime.utcnow()
        db.commit()
        db.refresh(exam)
    log_audit(db, current_user.id, "exam.publish", "exams", exam.id)
    return {"exam_id": exam.id, "is_published": bool(exam.is_published),
            "published_at": exam.published_at,
            "result_published": bool(exam.result_published)}


@router.post("/exams/{exam_id}/results", summary="Publish results + generate report cards")
def publish_exam_results(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(PUBLISH_ROLES))),
):
    """Run the grade calculation and upsert one ReportCard per enrolled student.

    Requires ``is_published`` (400 otherwise). Enrollments with no marks at all
    are counted as ``skipped``. Returns ``{generated, skipped, published_at}``.
    """
    exam = _exam_or_404(db, exam_id)
    if not exam.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Publish the exam before publishing its results",
        )
    enrollments = (db.query(ExamEnrollment)
                   .filter(ExamEnrollment.exam_id == exam_id)
                   .order_by(ExamEnrollment.id).all())
    generated = 0
    skipped = 0
    for enrollment in enrollments:
        has_marks = (db.query(ExamMark)
                     .filter(ExamMark.exam_enrollment_id == enrollment.id).count())
        if enrollment.is_absent or not has_marks:
            skipped += 1
            continue
        computed = _compute_student_result(db, exam, enrollment)
        student = db.query(Student).filter(Student.id == enrollment.student_id).first()
        card = (db.query(ReportCard)
                .filter(ReportCard.student_id == enrollment.student_id,
                        ReportCard.exam_id == exam_id).first())
        if card is None:
            card = ReportCard(student_id=enrollment.student_id, exam_id=exam_id)
            db.add(card)
        card.academic_year_id = exam.academic_year_id
        card.class_section_id = student.class_section_id if student else exam.class_section_id
        card.total_marks = computed["total_marks"]
        card.max_total_marks = computed["max_total_marks"]
        card.percentage = computed["percentage"]
        card.grade = computed["grade"]
        card.grade_point = computed["grade_point"]
        card.result = computed["result"]
        card.generated_by = current_user.id
        generated += 1
    exam.result_published = True
    exam.result_published_at = datetime.utcnow()
    _commit(db, "Results could not be published (duplicate or constraint violation)")
    db.refresh(exam)
    log_audit(db, current_user.id, "exam.results.publish", "exams", exam.id,
              meta=f'{{"generated": {generated}, "skipped": {skipped}}}')
    return {"exam_id": exam.id, "generated": generated, "skipped": skipped,
            "published_at": exam.result_published_at}


@router.get("/exams/{exam_id}/results-sheet", response_model=List[SubjectStatRow],
            summary="Per-subject class statistics for an exam")
def exam_results_sheet(
    exam_id: int,
    class_section_id: Optional[int] = Query(None, description="Restrict to one section"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-subject highest / lowest / average / pass stats.

    Zero-safe: an exam with no subjects or no marks returns rows of zeros and
    never divides by zero or raises 500.
    """
    _require_exam_reader(current_user, db)
    exam = _exam_or_404(db, exam_id)
    _exam_read_guard(exam, current_user, db)

    subjects = (db.query(ExamSubject)
                .filter(ExamSubject.exam_id == exam_id)
                .order_by(ExamSubject.id).all())

    if current_user.role == "teacher":
        allowed_sections = _teacher_section_ids(current_user, db)
        owned = _teacher_owns_exam_ids(current_user, db)
        if exam.class_section_id not in allowed_sections and exam.id not in owned:
            allowed_sections = []
    else:
        allowed_sections = _student_section_ids(current_user, db)

    rows = []
    for es in subjects:
        subject = db.query(Subject).filter(Subject.id == es.subject_id).first()
        query = (db.query(ExamMark)
                 .filter(ExamMark.exam_subject_id == es.id))
        scoped_ids = _student_ids_or_403(current_user, db)
        if scoped_ids is not None:
            query = query.join(ExamEnrollment,
                               ExamEnrollment.id == ExamMark.exam_enrollment_id)
            query = query.filter(ExamEnrollment.student_id.in_(scoped_ids))
        if allowed_sections is not None and allowed_sections:
            if scoped_ids is not None:
                students = (db.query(Student.id)
                            .filter(Student.class_section_id.in_(allowed_sections)).all())
                allowed = [s[0] for s in students]
                query = query.filter(ExamEnrollment.student_id.in_(allowed or [-1]))
            elif class_section_id is not None:
                students = (db.query(Student.id)
                            .filter(Student.class_section_id == class_section_id).all())
                allowed = [s[0] for s in students]
                query = query.filter(ExamEnrollment.student_id.in_(allowed or [-1]))
        scored = [m for m in query.all() if m.score is not None and not m.is_exempted]
        pass_at = _subject_pass_marks(exam, es)
        count = len(scored)
        scores = [float(m.score) for m in scored]
        passed = [s for s in scores if s >= pass_at]
        rows.append(SubjectStatRow(
            subject_id=es.subject_id,
            subject=subject.name if subject else None,
            students_count=count,
            highest=round(max(scores), 2) if scores else 0.0,
            lowest=round(min(scores), 2) if scores else 0.0,
            average=round(sum(scores) / count, 2) if count else 0.0,
            pass_count=len(passed),
            pass_percentage=round(len(passed) * 100.0 / count, 2) if count else 0.0,
        ))
    return rows


# ─── Exam subjects ──────────────────────────────────────────────────────────

@router.get("/exam-subjects/", response_model=List[ExamSubjectResponse],
            summary="List exam subjects")
def list_exam_subjects(
    exam_id: Optional[int] = Query(None, description="Filter by exam"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List exam subject papers, scoped to exams the caller may read."""
    _require_exam_reader(current_user, db)
    query = db.query(ExamSubject)
    if exam_id is not None:
        query = query.filter(ExamSubject.exam_id == exam_id)
    allowed = _scope_exam_query(db.query(Exam), current_user, db)
    allowed_ids = [r[0] for r in allowed.with_entities(Exam.id).all()]
    if not allowed_ids:
        return []
    query = query.filter(ExamSubject.exam_id.in_(allowed_ids))
    out = []
    for es in query.order_by(ExamSubject.id).offset(skip).limit(limit).all():
        data = ExamSubjectResponse(
            id=es.id, exam_id=es.exam_id, subject_id=es.subject_id,
            max_marks=es.max_marks, exam_date=es.exam_date, room=es.room,
            invigilator_id=es.invigilator_id,
        )
        subject = db.query(Subject).filter(Subject.id == es.subject_id).first()
        data.subject_name = subject.name if subject else None
        out.append(data)
    return out


@router.post("/exam-subjects/", response_model=ExamSubjectResponse,
             status_code=status.HTTP_201_CREATED,
             summary="Add exam subject (admin/principal/vice_principal)")
def create_exam_subject(
    payload: ExamSubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Add a subject paper to an exam. Duplicate (exam, subject) → 400."""
    if db.query(Exam).filter(Exam.id == payload.exam_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam with id {payload.exam_id} not found")
    if db.query(Subject).filter(Subject.id == payload.subject_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Subject with id {payload.subject_id} not found")
    if payload.invigilator_id is not None and db.query(Teacher).filter(
            Teacher.id == payload.invigilator_id).first() is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invigilator {payload.invigilator_id} is not a teacher")
    obj = ExamSubject(**payload.model_dump())
    db.add(obj)
    _commit(db, "This subject is already part of the exam")
    db.refresh(obj)
    log_audit(db, current_user.id, "exam_subject.create", "exam_subjects", obj.id)
    subject = db.query(Subject).filter(Subject.id == obj.subject_id).first()
    return ExamSubjectResponse(
        id=obj.id, exam_id=obj.exam_id, subject_id=obj.subject_id,
        max_marks=obj.max_marks, exam_date=obj.exam_date, room=obj.room,
        invigilator_id=obj.invigilator_id,
        subject_name=subject.name if subject else None,
    )


@router.put("/exam-subjects/{exam_subject_id}", response_model=ExamSubjectResponse,
            summary="Update exam subject (admin/principal/vice_principal)")
def update_exam_subject(
    exam_subject_id: int,
    payload: ExamSubjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Update one exam subject paper."""
    obj = db.query(ExamSubject).filter(ExamSubject.id == exam_subject_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam subject with id {exam_subject_id} not found")
    _apply_updates(obj, payload)
    _commit(db, "This subject is already part of the exam")
    db.refresh(obj)
    log_audit(db, current_user.id, "exam_subject.update", "exam_subjects", obj.id)
    subject = db.query(Subject).filter(Subject.id == obj.subject_id).first()
    return ExamSubjectResponse(
        id=obj.id, exam_id=obj.exam_id, subject_id=obj.subject_id,
        max_marks=obj.max_marks, exam_date=obj.exam_date, room=obj.room,
        invigilator_id=obj.invigilator_id,
        subject_name=subject.name if subject else None,
    )


@router.delete("/exam-subjects/{exam_subject_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete exam subject (admin/principal/vice_principal)")
def delete_exam_subject(
    exam_subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Delete one exam subject paper. 400 when marks already reference it."""
    obj = db.query(ExamSubject).filter(ExamSubject.id == exam_subject_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam subject with id {exam_subject_id} not found")
    mark_count = db.query(ExamMark).filter(
        ExamMark.exam_subject_id == exam_subject_id).count()
    if mark_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Exam subject has {mark_count} mark row(s) and cannot be deleted",
        )
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "exam_subject.delete", "exam_subjects", exam_subject_id)


# ─── Exam enrollments ───────────────────────────────────────────────────────

@router.get("/exam-enrollments/", response_model=List[ExamEnrollmentResponse],
            summary="List exam enrollments (scoped)")
def list_exam_enrollments(
    exam_id: Optional[int] = Query(None, description="Filter by exam"),
    student_id: Optional[int] = Query(None, description="Filter by student"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List enrollments, scoped to the caller's students / exams."""
    _require_exam_reader(current_user, db)
    query = db.query(ExamEnrollment)
    scoped = _student_ids_or_403(current_user, db)
    if scoped is not None:
        if student_id is not None and student_id not in scoped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student's enrollments is forbidden")
        query = query.filter(ExamEnrollment.student_id.in_(scoped or [-1]))
    if exam_id is not None:
        query = query.filter(ExamEnrollment.exam_id == exam_id)
    if student_id is not None:
        query = query.filter(ExamEnrollment.student_id == student_id)
    out = []
    for row in (query.order_by(ExamEnrollment.id)
                .offset(skip).limit(limit).all()):
        data = ExamEnrollmentResponse(
            id=row.id, exam_id=row.exam_id, student_id=row.student_id,
            roll_no=row.roll_no, is_absent=bool(row.is_absent),
            exempted=bool(row.exempted), reexam=bool(row.reexam),
        )
        student = db.query(Student).filter(Student.id == row.student_id).first()
        data.student_name = student.name if student else None
        out.append(data)
    return out


@router.post("/exam-enrollments/", summary="Bulk-enroll students into an exam")
def bulk_enroll(
    payload: BulkEnrollRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Bulk-enroll students. Duplicate enrollments are skipped, not an error."""
    if db.query(Exam).filter(Exam.id == payload.exam_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam with id {payload.exam_id} not found")
    existing = {r[0] for r in db.query(ExamEnrollment.student_id)
                .filter(ExamEnrollment.exam_id == payload.exam_id).all()}
    created = 0
    skipped = 0
    for student_id in payload.student_ids:
        if student_id in existing:
            skipped += 1
            continue
        if db.query(Student).filter(Student.id == student_id).first() is None:
            skipped += 1
            continue
        db.add(ExamEnrollment(exam_id=payload.exam_id, student_id=student_id))
        existing.add(student_id)
        created += 1
    _commit(db, "Enrollment could not be created (duplicate or constraint violation)")
    log_audit(db, current_user.id, "exam_enrollment.bulk", "exam_enrollments",
              payload.exam_id, meta=f'{{"created": {created}, "skipped": {skipped}}}')
    return {"exam_id": payload.exam_id, "created": created, "skipped": skipped}


@router.post("/exam-enrollments/single", response_model=ExamEnrollmentResponse,
             status_code=status.HTTP_201_CREATED,
             summary="Enroll one student (admin/principal/vice_principal)")
def create_exam_enrollment(
    payload: ExamEnrollmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Create a single enrollment. Duplicate (exam, student) → 400."""
    if db.query(Exam).filter(Exam.id == payload.exam_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam with id {payload.exam_id} not found")
    if db.query(Student).filter(Student.id == payload.student_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student with id {payload.student_id} not found")
    obj = ExamEnrollment(**payload.model_dump())
    db.add(obj)
    _commit(db, "This student is already enrolled in the exam")
    db.refresh(obj)
    log_audit(db, current_user.id, "exam_enrollment.create", "exam_enrollments", obj.id)
    student = db.query(Student).filter(Student.id == obj.student_id).first()
    return ExamEnrollmentResponse(
        id=obj.id, exam_id=obj.exam_id, student_id=obj.student_id,
        roll_no=obj.roll_no, is_absent=bool(obj.is_absent),
        exempted=bool(obj.exempted), reexam=bool(obj.reexam),
        student_name=student.name if student else None,
    )


@router.put("/exam-enrollments/{enrollment_id}", response_model=ExamEnrollmentResponse,
            summary="Update exam enrollment (admin/principal/vice_principal)")
def update_exam_enrollment(
    enrollment_id: int,
    payload: ExamEnrollmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Update an enrollment (roll number / absent / exempted / reexam flags)."""
    obj = db.query(ExamEnrollment).filter(ExamEnrollment.id == enrollment_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam enrollment with id {enrollment_id} not found")
    _apply_updates(obj, payload)
    _commit(db, "This student is already enrolled in the exam")
    db.refresh(obj)
    log_audit(db, current_user.id, "exam_enrollment.update", "exam_enrollments", obj.id)
    student = db.query(Student).filter(Student.id == obj.student_id).first()
    return ExamEnrollmentResponse(
        id=obj.id, exam_id=obj.exam_id, student_id=obj.student_id,
        roll_no=obj.roll_no, is_absent=bool(obj.is_absent),
        exempted=bool(obj.exempted), reexam=bool(obj.reexam),
        student_name=student.name if student else None,
    )


@router.delete("/exam-enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete exam enrollment (admin/principal/vice_principal)")
def delete_exam_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES))),
):
    """Remove an enrollment (and, by cascade, its marks)."""
    obj = db.query(ExamEnrollment).filter(ExamEnrollment.id == enrollment_id).first()
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam enrollment with id {enrollment_id} not found")
    db.delete(obj)
    db.commit()
    log_audit(db, current_user.id, "exam_enrollment.delete", "exam_enrollments",
              enrollment_id)


# ─── Exam marks ─────────────────────────────────────────────────────────────

def _teacher_can_enter_mark(db: Session, user: User, exam: Exam,
                            exam_subject: ExamSubject,
                            enrollment: ExamEnrollment) -> bool:
    """Whether a teacher may enter marks for this (subject paper, student) pair.

    Strictly assignment-based: the teacher must hold a TeacherAssignment for
    (the student's section OR the exam's section) x (this subject's name).
    Owning or invigilating the exam is deliberately NOT sufficient -- that only
    widens READ scope, so an exam owner who does not teach the paper still gets
    403 on mark entry.
    """
    if user.role != "teacher":
        return True
    if user.teacher_id is None:
        return False
    student = db.query(Student).filter(Student.id == enrollment.student_id).first()
    section_ids = set()
    if exam.class_section_id is not None:
        section_ids.add(exam.class_section_id)
    if student is not None and student.class_section_id is not None:
        section_ids.add(student.class_section_id)
    if not section_ids:
        return False
    subject = db.query(Subject).filter(Subject.id == exam_subject.subject_id).first()
    if subject is None:
        return False
    ok = (db.query(TeacherAssignment)
          .filter(TeacherAssignment.teacher_id == user.teacher_id,
                  TeacherAssignment.class_section_id.in_(list(section_ids)),
                  TeacherAssignment.subject == subject.name).first())
    return ok is not None


def _require_mark_write(user: User) -> None:
    """403 for any role outside :data:`MARK_WRITE_ROLES`."""
    if user.role not in MARK_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to enter marks.",
        )


def _validate_score(score: Optional[float], exam_subject: ExamSubject,
                    exam: Exam) -> None:
    """400 when score is negative or above the paper's max marks."""
    if score is None:
        return
    maximum = _subject_max_marks(exam, exam_subject)
    if score < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="score must be >= 0")
    if maximum > 0 and score > maximum:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"score {score} exceeds max marks {maximum} for this subject",
        )


def _exam_mark_payload(db: Session, mark: ExamMark) -> dict:
    es = db.query(ExamSubject).filter(ExamSubject.id == mark.exam_subject_id).first()
    enrollment = db.query(ExamEnrollment).filter(
        ExamEnrollment.id == mark.exam_enrollment_id).first()
    subject = db.query(Subject).filter(
        Subject.id == es.subject_id).first() if es else None
    exam = db.query(Exam).filter(Exam.id == es.exam_id).first() if es else None
    return {
        "id": mark.id,
        "exam_subject_id": mark.exam_subject_id,
        "exam_enrollment_id": mark.exam_enrollment_id,
        "exam_id": es.exam_id if es else None,
        "student_id": enrollment.student_id if enrollment else None,
        "subject_id": es.subject_id if es else None,
        "subject_name": subject.name if subject else None,
        "max_marks": _subject_max_marks(exam, es) if (exam and es) else None,
        "score": mark.score,
        "is_absent": bool(mark.is_absent),
        "is_exempted": bool(mark.is_exempted),
        "entered_by": mark.entered_by,
        "entered_at": mark.entered_at,
    }


@router.get("/exam-marks/", response_model=List[ExamMarkResponse],
            summary="List exam marks (scoped)")
def list_exam_marks(
    exam_id: Optional[int] = Query(None, description="Filter by exam"),
    exam_subject_id: Optional[int] = Query(None, description="Filter by subject paper"),
    student_id: Optional[int] = Query(None, description="Filter by student"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List exam marks, scoped to the caller's students / exams."""
    _require_exam_reader(current_user, db)
    query = (db.query(ExamMark)
             .join(ExamSubject, ExamSubject.id == ExamMark.exam_subject_id)
             .join(ExamEnrollment, ExamEnrollment.id == ExamMark.exam_enrollment_id))
    allowed_exam_ids = [r[0] for r in
                        _scope_exam_query(db.query(Exam), current_user, db)
                        .with_entities(Exam.id).all()]
    if not allowed_exam_ids:
        return []
    query = query.filter(ExamSubject.exam_id.in_(allowed_exam_ids))
    if exam_id is not None:
        query = query.filter(ExamSubject.exam_id == exam_id)
    if exam_subject_id is not None:
        query = query.filter(ExamMark.exam_subject_id == exam_subject_id)
    scoped = _student_ids_or_403(current_user, db)
    if scoped is not None:
        if student_id is not None and student_id not in scoped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student's marks is forbidden")
        query = query.filter(ExamEnrollment.student_id.in_(scoped or [-1]))
    if student_id is not None:
        query = query.filter(ExamEnrollment.student_id == student_id)
    rows = query.order_by(ExamMark.id).offset(skip).limit(limit).all()
    return [_exam_mark_payload(db, m) for m in rows]


@router.post("/exam-marks/", response_model=ExamMarkResponse,
             status_code=status.HTTP_201_CREATED, summary="Create an exam mark")
def create_exam_mark(
    payload: ExamMarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create one mark row. Teachers only for their assigned subject/section."""
    _require_mark_write(current_user)
    exam_subject = db.query(ExamSubject).filter(
        ExamSubject.id == payload.exam_subject_id).first()
    if exam_subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam subject with id {payload.exam_subject_id} not found")
    enrollment = db.query(ExamEnrollment).filter(
        ExamEnrollment.id == payload.exam_enrollment_id).first()
    if enrollment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam enrollment with id {payload.exam_enrollment_id} not found")
    exam = db.query(Exam).filter(Exam.id == exam_subject.exam_id).first()
    if not _teacher_can_enter_mark(db, current_user, exam, exam_subject, enrollment):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not assigned to this class/subject for this exam")
    _validate_score(payload.score, exam_subject, exam)
    obj = ExamMark(exam_subject_id=payload.exam_subject_id,
                   exam_enrollment_id=payload.exam_enrollment_id,
                   score=payload.score, is_absent=payload.is_absent,
                   is_exempted=payload.is_exempted, entered_by=current_user.id)
    db.add(obj)
    _commit(db, "A mark row for this subject/student already exists")
    db.refresh(obj)
    log_audit(db, current_user.id, "exam_mark.create", "exam_marks", obj.id)
    return _exam_mark_payload(db, obj)


@router.post("/exam-marks/bulk", summary="Bulk upsert exam marks")
def bulk_upsert_exam_marks(
    payload: BulkMarksRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert many marks in one transaction.

    Body: ``{exam_id, marks: [{student_id, subject_id, score, is_absent, is_exempted}]}``.
    Returns ``{saved, skipped, errors}``; per-row problems land in ``errors``
    instead of aborting the batch.

    Marks may be corrected after results are published: re-run
    ``POST /exams/{id}/results`` to refresh the report cards.
    """
    _require_mark_write(current_user)
    exam = _exam_or_404(db, payload.exam_id)
    subjects = {s.subject_id: s for s in
                db.query(ExamSubject).filter(ExamSubject.exam_id == exam.id).all()}
    enrollments = {e.student_id: e for e in
                   db.query(ExamEnrollment).filter(ExamEnrollment.exam_id == exam.id).all()}
    existing = {}
    for row in db.query(ExamMark).join(
            ExamSubject, ExamSubject.id == ExamMark.exam_subject_id).filter(
            ExamSubject.exam_id == exam.id).all():
        existing[(row.exam_subject_id, row.exam_enrollment_id)] = row

    saved = 0
    skipped = 0
    errors = []
    for item in payload.marks:
        es = subjects.get(item.subject_id)
        enrollment = enrollments.get(item.student_id)
        if es is None:
            skipped += 1
            errors.append({"student_id": item.student_id,
                           "subject_id": item.subject_id,
                           "error": "Subject is not part of this exam"})
            continue
        if enrollment is None:
            skipped += 1
            errors.append({"student_id": item.student_id,
                           "subject_id": item.subject_id,
                           "error": "Student is not enrolled in this exam"})
            continue
        if not _teacher_can_enter_mark(db, current_user, exam, es, enrollment):
            skipped += 1
            errors.append({"student_id": item.student_id,
                           "subject_id": item.subject_id,
                           "error": "Not assigned to this class/subject for this exam"})
            continue
        maximum = _subject_max_marks(exam, es)
        if item.score is not None:
            if item.score < 0:
                skipped += 1
                errors.append({"student_id": item.student_id,
                               "subject_id": item.subject_id,
                               "error": "score must be >= 0"})
                continue
            if maximum > 0 and item.score > maximum:
                skipped += 1
                errors.append({"student_id": item.student_id,
                               "subject_id": item.subject_id,
                               "error": f"score {item.score} exceeds max marks {maximum}"})
                continue
        row = existing.get((es.id, enrollment.id))
        if row is None:
            row = ExamMark(exam_subject_id=es.id, exam_enrollment_id=enrollment.id)
            db.add(row)
            existing[(es.id, enrollment.id)] = row
        row.score = item.score
        row.is_absent = bool(item.is_absent)
        row.is_exempted = bool(item.is_exempted)
        row.entered_by = current_user.id
        row.entered_at = datetime.utcnow()
        saved += 1
    _commit(db, "Bulk mark entry failed (duplicate or constraint violation)")
    log_audit(db, current_user.id, "exam_mark.bulk", "exam_marks", exam.id,
              meta=f'{{"saved": {saved}, "skipped": {skipped}}}')
    return {"exam_id": exam.id, "saved": saved, "skipped": skipped, "errors": errors}


@router.get("/exam-marks/{exam_mark_id}", response_model=ExamMarkResponse,
            summary="Get exam mark by ID")
def get_exam_mark(
    exam_mark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one mark row. 404 when missing, 403 when out of scope."""
    _require_exam_reader(current_user, db)
    mark = db.query(ExamMark).filter(ExamMark.id == exam_mark_id).first()
    if mark is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam mark with id {exam_mark_id} not found")
    scoped = _student_ids_or_403(current_user, db)
    if scoped is not None:
        enrollment = db.query(ExamEnrollment).filter(
            ExamEnrollment.id == mark.exam_enrollment_id).first()
        if enrollment is None or enrollment.student_id not in scoped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student's marks is forbidden")
    return _exam_mark_payload(db, mark)


@router.put("/exam-marks/{exam_mark_id}", response_model=ExamMarkResponse,
            summary="Update exam mark")
def update_exam_mark(
    exam_mark_id: int,
    payload: ExamMarkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update one mark row. ``0 <= score <= max_marks`` else 400."""
    _require_mark_write(current_user)
    mark = db.query(ExamMark).filter(ExamMark.id == exam_mark_id).first()
    if mark is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam mark with id {exam_mark_id} not found")
    exam_subject = db.query(ExamSubject).filter(
        ExamSubject.id == mark.exam_subject_id).first()
    enrollment = db.query(ExamEnrollment).filter(
        ExamEnrollment.id == mark.exam_enrollment_id).first()
    if exam_subject is None or enrollment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Exam mark references a missing subject paper/enrollment")
    exam = db.query(Exam).filter(Exam.id == exam_subject.exam_id).first()
    if not _teacher_can_enter_mark(db, current_user, exam, exam_subject, enrollment):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not assigned to this class/subject for this exam")
    data = payload.model_dump(exclude_unset=True)
    effective_score = data.get("score", mark.score)
    _validate_score(effective_score, exam_subject, exam)
    for field, value in data.items():
        setattr(mark, field, value)
    mark.entered_by = current_user.id
    mark.entered_at = datetime.utcnow()
    db.commit()
    db.refresh(mark)
    log_audit(db, current_user.id, "exam_mark.update", "exam_marks", mark.id)
    return _exam_mark_payload(db, mark)


@router.delete("/exam-marks/{exam_mark_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete exam mark")
def delete_exam_mark(
    exam_mark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete one mark row."""
    _require_mark_write(current_user)
    mark = db.query(ExamMark).filter(ExamMark.id == exam_mark_id).first()
    if mark is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Exam mark with id {exam_mark_id} not found")
    exam_subject = db.query(ExamSubject).filter(
        ExamSubject.id == mark.exam_subject_id).first()
    enrollment = db.query(ExamEnrollment).filter(
        ExamEnrollment.id == mark.exam_enrollment_id).first()
    exam = db.query(Exam).filter(Exam.id == exam_subject.exam_id).first() if exam_subject else None
    if exam_subject is None or enrollment is None or exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Exam mark references a missing subject paper/enrollment")
    if not _teacher_can_enter_mark(db, current_user, exam, exam_subject, enrollment):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Not assigned to this class/subject for this exam")
    db.delete(mark)
    db.commit()
    log_audit(db, current_user.id, "exam_mark.delete", "exam_marks", exam_mark_id)


# ─── Report cards ───────────────────────────────────────────────────────────

@router.get("/report-cards/", response_model=List[ReportCardResponse],
            summary="List report cards (scoped)")
def list_report_cards(
    student_id: Optional[int] = Query(None, description="Filter by student"),
    exam_id: Optional[int] = Query(None, description="Filter by exam"),
    academic_year_id: Optional[int] = Query(None, description="Filter by academic year"),
    class_section_id: Optional[int] = Query(None, description="Filter by class section"),
    is_published: Optional[bool] = Query(None, description="Filter by publication flag"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List report cards. Students/parents see only their own published ones."""
    _require_exam_reader(current_user, db)
    query = db.query(ReportCard)
    scoped = _student_ids_or_403(current_user, db)
    if scoped is not None:
        if student_id is not None and student_id not in scoped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Access to this student's report card is forbidden")
        query = query.filter(ReportCard.student_id.in_(scoped or [-1]))
    if student_id is not None:
        query = query.filter(ReportCard.student_id == student_id)
    if exam_id is not None:
        query = query.filter(ReportCard.exam_id == exam_id)
    if academic_year_id is not None:
        query = query.filter(ReportCard.academic_year_id == academic_year_id)
    if class_section_id is not None:
        query = query.filter(ReportCard.class_section_id == class_section_id)
    if is_published is not None:
        query = query.filter(ReportCard.is_published == is_published)
    if current_user.role in ("student", "parent"):
        query = query.filter(ReportCard.is_published == True)  # noqa: E712
    rows = (query.order_by(ReportCard.id.desc())
            .offset(skip).limit(limit).all())
    return [_report_card_response(db, r) for r in rows]


@router.post("/report-cards/publish-bulk", summary="Publish all report cards of an exam")
def publish_report_cards_bulk(
    payload: PublishBulkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(PUBLISH_ROLES))),
):
    """Publish every report card of an exam. Admin/principal only."""
    exam = _exam_or_404(db, payload.exam_id)
    now = datetime.utcnow()
    cards = db.query(ReportCard).filter(ReportCard.exam_id == exam.id).all()
    published = 0
    for card in cards:
        if not card.is_published:
            card.is_published = True
            card.published_at = now
            published += 1
    db.commit()
    log_audit(db, current_user.id, "report_card.publish_bulk", "report_cards", exam.id,
              meta=f'{{"published": {published}, "total": {len(cards)}}}')
    return {"exam_id": exam.id, "published": published, "total": len(cards),
            "published_at": now}


@router.get("/report-cards/preview/{student_id}/{exam_id}",
            response_model=ReportCardResponse, summary="Preview a report card (no write)")
def preview_report_card(
    student_id: int,
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES) + ["teacher"])),
):
    """Compute a report card WITHOUT persisting it.

    Teachers may only preview students in their assigned class sections.
    """
    exam = _exam_or_404(db, exam_id)
    enrollment = (db.query(ExamEnrollment)
                  .filter(ExamEnrollment.exam_id == exam_id,
                          ExamEnrollment.student_id == student_id).first())
    if enrollment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student {student_id} is not enrolled in exam {exam_id}")
    if current_user.role == "teacher":
        visible = resolve_student_ids(current_user, db) or []
        if student_id not in visible:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Not assigned to this student's class")
    computed = _compute_student_result(db, exam, enrollment)
    student = db.query(Student).filter(Student.id == student_id).first()
    return {
        "id": 0,
        "student_id": student_id,
        "exam_id": exam_id,
        "academic_year_id": exam.academic_year_id,
        "class_section_id": student.class_section_id if student else exam.class_section_id,
        "student_name": student.name if student else None,
        "exam_name": exam.name,
        "total_marks": computed["total_marks"],
        "max_total_marks": computed["max_total_marks"],
        "percentage": computed["percentage"],
        "grade": computed["grade"],
        "grade_point": computed["grade_point"],
        "result": computed["result"],
        "rank": None,
        "class_rank": None,
        "attendance_percentage": None,
        "teacher_remarks": None,
        "principal_remarks": None,
        "is_published": False,
        "published_at": None,
        "generated_by": current_user.id,
        "created_at": None,
        "subjects": computed["subjects"],
    }


@router.get("/report-cards/{report_card_id}", response_model=ReportCardResponse,
            summary="Get report card by ID")
def get_report_card(
    report_card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one report card. 404 when missing, 403 when out of scope/unpublished."""
    _require_exam_reader(current_user, db)
    card = db.query(ReportCard).filter(ReportCard.id == report_card_id).first()
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Report card with id {report_card_id} not found")
    _report_card_read_guard(card, current_user, db)
    return _report_card_response(db, card)


@router.put("/report-cards/{report_card_id}", response_model=ReportCardResponse,
            summary="Update report card remarks (teacher/principal)")
def update_report_card(
    report_card_id: int,
    payload: ReportCardUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(EXAM_WRITE_ROLES) + ["teacher"])),
):
    """Update remarks / ranks. Teachers only for their own class sections."""
    card = db.query(ReportCard).filter(ReportCard.id == report_card_id).first()
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Report card with id {report_card_id} not found")
    if current_user.role == "teacher":
        student = db.query(Student).filter(Student.id == card.student_id).first()
        section = student.class_section_id if student else card.class_section_id
        if section is None or section not in _teacher_section_ids(current_user, db):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Not assigned to this student's class section")
    _apply_updates(card, payload)
    db.commit()
    db.refresh(card)
    log_audit(db, current_user.id, "report_card.update", "report_cards", card.id)
    return _report_card_response(db, card)


@router.post("/report-cards/{report_card_id}/publish", summary="Publish report card")
def publish_report_card(
    report_card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(PUBLISH_ROLES))),
):
    """Publish one report card. Admin/principal only."""
    card = db.query(ReportCard).filter(ReportCard.id == report_card_id).first()
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Report card with id {report_card_id} not found")
    if not card.is_published:
        card.is_published = True
        card.published_at = datetime.utcnow()
        db.commit()
        db.refresh(card)
    log_audit(db, current_user.id, "report_card.publish", "report_cards", card.id)
    return {"report_card_id": card.id, "is_published": bool(card.is_published),
            "published_at": card.published_at}


@router.post("/report-cards/{report_card_id}/rank",
             summary="Recompute ranks for a report card (admin/principal)")
def recompute_rank(
    report_card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(list(PUBLISH_ROLES))),
):
    """Recompute this card's rank across the exam.

    ``rank`` = position by percentage across the whole exam; ``class_rank`` =
    position within the student's own ``class_section_id``. Ties share a rank.
    """
    card = db.query(ReportCard).filter(ReportCard.id == report_card_id).first()
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Report card with id {report_card_id} not found")

    all_cards = (db.query(ReportCard)
                 .filter(ReportCard.exam_id == card.exam_id).all())
    exam_wide = sorted(all_cards, key=lambda c: (-float(c.percentage or 0.0), c.id))
    rank = 1
    last_pct = None
    for pos, other in enumerate(exam_wide, start=1):
        pct = float(other.percentage or 0.0)
        if last_pct is None or pct != last_pct:
            rank = pos
            last_pct = pct
        other.rank = rank
        other.class_rank = None

    section = card.class_section_id
    if section is not None:
        section_cards = sorted(
            (c for c in all_cards if c.class_section_id == section),
            key=lambda c: (-float(c.percentage or 0.0), c.id))
        crank = 1
        last_pct = None
        for pos, other in enumerate(section_cards, start=1):
            pct = float(other.percentage or 0.0)
            if last_pct is None or pct != last_pct:
                crank = pos
                last_pct = pct
            other.class_rank = crank
    db.commit()
    db.refresh(card)
    log_audit(db, current_user.id, "report_card.rank", "report_cards", card.id,
              meta=f'{{"rank": {card.rank}, "class_rank": {card.class_rank}}}')
    return _report_card_response(db, card)