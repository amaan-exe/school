"""Reports router (Phase-2 hardening).

student: only own data (mismatched student_id/grade -> 403).
parent: only linked children (mismatched -> 403).
teacher: only assigned classes/subjects (mismatched -> 403).
staff: needs reports:read perm. admin: full. Response shapes unchanged.
"""

from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from database import get_db
from models import Student, Teacher, Attendance, Mark, Fee, User
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


def _teacher_subjects(db: Session, user: User) -> set:
    from models import TeacherAssignment
    if user.role != "teacher" or user.teacher_id is None:
        return set()
    rows = (db.query(TeacherAssignment.subject)
            .filter(TeacherAssignment.teacher_id == user.teacher_id)
            .distinct().all())
    return {r[0] for r in rows if r[0]}


def _teacher_grades(db: Session, user: User) -> set:
    from models import ClassSection, TeacherAssignment
    if user.role != "teacher" or user.teacher_id is None:
        return set()
    rows = (db.query(ClassSection.grade)
            .join(TeacherAssignment,
                  TeacherAssignment.class_section_id == ClassSection.id)
            .filter(TeacherAssignment.teacher_id == user.teacher_id)
            .distinct().all())
    return {r[0] for r in rows if r[0]}


def _scope_student_ids(user: User, db: Session):
    """Return None for full access; else scoped id list (may raise 403).

    Staff without reports:read -> 403. Unlinked student -> 403.
    """
    if user.role == "admin":
        return None
    if user.role == "staff":
        if not _staff_can(db, user, "reports", "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Insufficient permissions for module 'reports'.")
        return None
    if user.role == "student" and user.student_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No student profile linked to this user")
    ids = resolve_student_ids(user, db) or []
    return ids


def _check_grade_scope(user: User, db: Session, scoped, grade: Optional[str]):
    """403 when an explicit grade filter falls outside the caller's scope."""
    if grade is None or scoped is None:
        return
    if user.role == "student":
        own = db.query(Student).filter(Student.id == scoped[0]).first() if scoped else None
        if own is None or own.grade != grade:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Grade is outside your scope")
    elif user.role == "parent":
        if not scoped:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Grade is outside your scope")
        grades = {r[0] for r in db.query(Student.grade).filter(Student.id.in_(scoped)).all()}
        if grade not in grades:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Grade is outside your scope")
    elif user.role == "teacher":
        if grade not in _teacher_grades(db, user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Grade is outside your assigned classes")


@router.get("/attendance-summary", summary="Attendance summary report")
def attendance_summary(
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)"),
    grade: Optional[str] = Query(None, description="Filter by grade"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Attendance stats scoped by role (out-of-scope grade -> 403)."""
    scoped = _scope_student_ids(current_user, db)
    _check_grade_scope(current_user, db, scoped, grade)

    query = (
        db.query(
            Attendance.status,
            func.count(Attendance.id).label("count"),
        )
        .join(Student, Attendance.student_id == Student.id)
        .filter(Attendance.date >= start_date, Attendance.date <= end_date)
    )

    if grade:
        query = query.filter(Student.grade == grade)
    if scoped is not None:
        if not scoped:
            return {
                "period": {"start_date": str(start_date), "end_date": str(end_date)},
                "grade_filter": grade,
                "summary": {"present": 0, "absent": 0, "late": 0, "total": 0,
                            "present_percentage": 0, "absent_percentage": 0, "late_percentage": 0},
                "by_grade": {},
            }
        query = query.filter(Attendance.student_id.in_(scoped))

    results = query.group_by(Attendance.status).all()

    summary = {
        "present": 0,
        "absent": 0,
        "late": 0,
        "total": 0,
    }
    for status, count in results:
        summary[status] = count
        summary["total"] += count

    if summary["total"] > 0:
        summary["present_percentage"] = round(summary["present"] / summary["total"] * 100, 2)
        summary["absent_percentage"] = round(summary["absent"] / summary["total"] * 100, 2)
        summary["late_percentage"] = round(summary["late"] / summary["total"] * 100, 2)
    else:
        summary["present_percentage"] = 0
        summary["absent_percentage"] = 0
        summary["late_percentage"] = 0

    grade_query = (
        db.query(
            Student.grade,
            Attendance.status,
            func.count(Attendance.id).label("count"),
        )
        .join(Student, Attendance.student_id == Student.id)
        .filter(Attendance.date >= start_date, Attendance.date <= end_date)
    )
    if grade:
        grade_query = grade_query.filter(Student.grade == grade)
    if scoped is not None and scoped:
        grade_query = grade_query.filter(Attendance.student_id.in_(scoped))
    if scoped is not None and not scoped:
        by_grade = {}
    else:
        grade_rows = grade_query.group_by(Student.grade, Attendance.status).all()
        by_grade = {}
        for g, att_status, count in grade_rows:
            if g not in by_grade:
                by_grade[g] = {"present": 0, "absent": 0, "late": 0, "total": 0}
            by_grade[g][att_status] = count
            by_grade[g]["total"] += count

    return {
        "period": {"start_date": str(start_date), "end_date": str(end_date)},
        "grade_filter": grade,
        "summary": summary,
        "by_grade": by_grade,
    }


@router.get("/grade-summary", summary="Grade summary report")
def grade_summary(
    subject: Optional[str] = Query(None, description="Filter by subject"),
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    exam_name: Optional[str] = Query(None, description="Filter by exam name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark aggregates scoped by role (mismatched student_id/subject -> 403)."""
    scoped = _scope_student_ids(current_user, db)

    if scoped is not None:
        if current_user.role == "student":
            if student_id is not None and student_id != current_user.student_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail="Access to this student's records is forbidden")
            student_id = current_user.student_id
        elif current_user.role == "parent":
            if student_id is not None and student_id not in scoped:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail="Access to this student's records is forbidden")
            if student_id is None:
                if not scoped:
                    return {"filters": {"subject": subject, "student_id": None, "exam_name": exam_name},
                            "by_subject": {},
                            "overall": {"average_score": 0, "highest_score": 0, "lowest_score": 0}}
        elif current_user.role == "teacher":
            if student_id is not None and student_id not in scoped:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail="Access to this student's records is forbidden")
            if subject is not None and subject not in _teacher_subjects(db, current_user):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail="Subject is outside your assignments")

    query = (
        db.query(
            Mark.subject,
            Mark.exam_name,
            func.avg(Mark.score).label("average_score"),
            func.max(Mark.score).label("highest_score"),
            func.min(Mark.score).label("lowest_score"),
            func.count(Mark.id).label("total_students"),
        )
        .join(Student, Mark.student_id == Student.id)
    )

    if subject:
        query = query.filter(Mark.subject == subject)
    if student_id:
        query = query.filter(Mark.student_id == student_id)
    if exam_name:
        query = query.filter(Mark.exam_name == exam_name)
    if scoped is not None and student_id is None and scoped:
        query = query.filter(Mark.student_id.in_(scoped))
    if scoped is not None and student_id is None and not scoped and current_user.role in ("parent", "teacher"):
        query = query.filter(False)

    results = query.group_by(Mark.subject, Mark.exam_name).all()

    by_subject = {}
    for subj, exam, avg_score, high_score, low_count, total in results:
        if subj not in by_subject:
            by_subject[subj] = []
        by_subject[subj].append({
            "exam_name": exam,
            "average_score": round(avg_score, 2) if avg_score else 0,
            "highest_score": high_score,
            "lowest_score": low_count,
            "total_students": total,
        })

    overall_query = db.query(
        func.avg(Mark.score).label("overall_average"),
        func.max(Mark.score).label("overall_highest"),
        func.min(Mark.score).label("overall_lowest"),
    )

    if subject:
        overall_query = overall_query.filter(Mark.subject == subject)
    if student_id:
        overall_query = overall_query.filter(Mark.student_id == student_id)
    if exam_name:
        overall_query = overall_query.filter(Mark.exam_name == exam_name)
    if scoped is not None and student_id is None and scoped:
        overall_query = overall_query.filter(Mark.student_id.in_(scoped))
    if scoped is not None and student_id is None and not scoped and current_user.role in ("parent", "teacher"):
        overall_query = overall_query.filter(False)

    overall = overall_query.first()

    return {
        "filters": {"subject": subject, "student_id": student_id, "exam_name": exam_name},
        "by_subject": by_subject,
        "overall": {
            "average_score": round(overall.overall_average, 2) if overall.overall_average else 0,
            "highest_score": overall.overall_highest or 0,
            "lowest_score": overall.overall_lowest or 0,
        },
    }


@router.get("/fee-summary", summary="Fee collection summary report")
def fee_summary(
    grade: Optional[str] = Query(None, description="Filter by grade"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fee stats scoped by role (out-of-scope grade -> 403)."""
    scoped = _scope_student_ids(current_user, db)
    _check_grade_scope(current_user, db, scoped, grade)

    overall_query = db.query(
        func.count(Fee.id).label("total_fees"),
        func.sum(Fee.amount).label("total_amount"),
        func.sum(case((Fee.paid == True, Fee.amount), else_=0)).label("collected_amount"),
        func.sum(case((Fee.paid == False, Fee.amount), else_=0)).label("pending_amount"),
        func.count(case((Fee.paid == True, 1), else_=None)).label("paid_count"),
        func.count(case((Fee.paid == False, 1), else_=None)).label("pending_count"),
    )

    if grade or scoped is not None:
        overall_query = overall_query.join(Student, Fee.student_id == Student.id)
    if grade:
        overall_query = overall_query.filter(Student.grade == grade)
    if scoped is not None:
        if not scoped:
            empty_overall = {"total_fees": 0, "total_amount": 0, "collected_amount": 0,
                             "pending_amount": 0, "paid_count": 0, "pending_count": 0}
            return {"grade_filter": grade, "overall": empty_overall, "by_grade": {}, "pending_fees": []}
        overall_query = overall_query.filter(Fee.student_id.in_(scoped))

    overall = overall_query.first()

    grade_query = (
        db.query(
            Student.grade,
            func.count(Fee.id).label("total_fees"),
            func.sum(Fee.amount).label("total_amount"),
            func.sum(case((Fee.paid == True, Fee.amount), else_=0)).label("collected_amount"),
            func.sum(case((Fee.paid == False, Fee.amount), else_=0)).label("pending_amount"),
        )
        .join(Student, Fee.student_id == Student.id)
    )
    if grade:
        grade_query = grade_query.filter(Student.grade == grade)
    if scoped is not None and scoped:
        grade_query = grade_query.filter(Fee.student_id.in_(scoped))
    if scoped is not None and not scoped:
        grade_rows = []
    else:
        grade_rows = grade_query.group_by(Student.grade).all()

    by_grade = {}
    for g, total_fees, total_amount, collected, pending in grade_rows:
        by_grade[g] = {
            "total_fees": total_fees,
            "total_amount": round(total_amount, 2) if total_amount else 0,
            "collected_amount": round(collected, 2) if collected else 0,
            "pending_amount": round(pending, 2) if pending else 0,
        }

    pending_query = (
        db.query(Fee, Student)
        .join(Student, Fee.student_id == Student.id)
        .filter(Fee.paid == False)
    )

    if grade:
        pending_query = pending_query.filter(Student.grade == grade)
    if scoped is not None and scoped:
        pending_query = pending_query.filter(Fee.student_id.in_(scoped))
    if scoped is not None and not scoped:
        pending_fees = []
    else:
        pending_fees = pending_query.all()

    pending_list = []
    for fee, student in pending_fees:
        pending_list.append({
            "fee_id": fee.id,
            "student_id": student.id,
            "student_name": student.name,
            "grade": student.grade,
            "amount": fee.amount,
            "due_date": str(fee.due_date),
        })

    return {
        "grade_filter": grade,
        "overall": {
            "total_fees": overall.total_fees or 0,
            "total_amount": round(overall.total_amount, 2) if overall.total_amount else 0,
            "collected_amount": round(overall.collected_amount, 2) if overall.collected_amount else 0,
            "pending_amount": round(overall.pending_amount, 2) if overall.pending_amount else 0,
            "paid_count": overall.paid_count or 0,
            "pending_count": overall.pending_count or 0,
        },
        "by_grade": by_grade,
        "pending_fees": pending_list,
    }


@router.get("/student-performance/{student_id}", summary="Full student performance report")
def student_performance(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Performance report for one student (out-of-scope -> 403)."""
    scoped = _scope_student_ids(current_user, db)
    if scoped is not None and student_id not in scoped:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access to this student's records is forbidden")

    student = db.query(Student).filter(Student.id == student_id).first()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )

    attendance_stats = (
        db.query(
            Attendance.status,
            func.count(Attendance.id).label("count"),
        )
        .filter(Attendance.student_id == student_id)
        .group_by(Attendance.status)
        .all()
    )

    attendance_summary = {"present": 0, "absent": 0, "late": 0, "total": 0}
    for att_status, count in attendance_stats:
        attendance_summary[att_status] = count
        attendance_summary["total"] += count

    if attendance_summary["total"] > 0:
        attendance_summary["attendance_rate"] = round(
            (attendance_summary["present"] + attendance_summary["late"]) / attendance_summary["total"] * 100, 2
        )
    else:
        attendance_summary["attendance_rate"] = 0

    marks_by_subject = (
        db.query(
            Mark.subject,
            func.avg(Mark.score).label("average_score"),
            func.max(Mark.score).label("highest_score"),
            func.min(Mark.score).label("lowest_score"),
            func.count(Mark.id).label("exams_count"),
        )
        .filter(Mark.student_id == student_id)
        .group_by(Mark.subject)
        .all()
    )

    subjects = []
    for subj, avg_score, high_score, low_score, exams_count in marks_by_subject:
        subjects.append({
            "subject": subj,
            "average_score": round(avg_score, 2) if avg_score else 0,
            "highest_score": high_score,
            "lowest_score": low_score,
            "exams_count": exams_count,
        })

    all_marks = (
        db.query(Mark)
        .filter(Mark.student_id == student_id)
        .order_by(Mark.date.desc())
        .all()
    )

    marks_detail = []
    for mark in all_marks:
        marks_detail.append({
            "id": mark.id,
            "subject": mark.subject,
            "exam_name": mark.exam_name,
            "score": mark.score,
            "max_score": mark.max_score,
            "percentage": round(mark.score / mark.max_score * 100, 2) if mark.max_score else 0,
            "date": str(mark.date),
        })

    fee_stats = (
        db.query(
            func.count(Fee.id).label("total_fees"),
            func.sum(Fee.amount).label("total_amount"),
            func.sum(case((Fee.paid == True, Fee.amount), else_=0)).label("paid_amount"),
            func.sum(case((Fee.paid == False, Fee.amount), else_=0)).label("pending_amount"),
        )
        .filter(Fee.student_id == student_id)
        .first()
    )

    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "email": student.email,
            "grade": student.grade,
        },
        "attendance": attendance_summary,
        "marks_by_subject": subjects,
        "marks_detail": marks_detail,
        "fees": {
            "total_fees": fee_stats.total_fees or 0,
            "total_amount": round(fee_stats.total_amount, 2) if fee_stats.total_amount else 0,
            "paid_amount": round(fee_stats.paid_amount, 2) if fee_stats.paid_amount else 0,
            "pending_amount": round(fee_stats.pending_amount, 2) if fee_stats.pending_amount else 0,
        },
    }
