"""Phase-2 exams & report-cards verification round trip (dev-only, not API).

Run from the backend directory:  python _verify_exams.py

Leaves NO temp rows behind: every object created here is deleted in `finally`
(exam_marks -> exam_enrollments/report_cards -> exam_subjects -> exams ->
grade scales -> subjects -> teacher assignment -> user_roles -> users).
audit_logs intentionally grows (append-only, per spec).
"""
import sys
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

import main
from database import SessionLocal, engine
from models import (
    AcademicYear, ClassSection, ClassSubject, Exam, ExamEnrollment, ExamMark,
    ExamSubject, GradeScale, ReportCard, Student, Subject, Teacher,
    TeacherAssignment, User,
)

client = TestClient(main.app)
PASS, FAIL = [], []
db = SessionLocal()


def purge_residuals():
    """Delete any rows a previous aborted run may have left behind.

    Makes the script re-runnable: an interrupted run no longer poisons the next
    one with duplicate-name collisions.
    """
    for e in db.query(Exam).filter(Exam.name.like("ZZ%")).all():
        db.delete(e)
    db.flush()
    es_ids = [s.id for s in db.query(ExamSubject).all()] or [-1]
    for m in db.query(ExamMark).filter(ExamMark.exam_subject_id.in_(es_ids)).all():
        db.delete(m)
    for r in db.query(ReportCard).all():
        db.delete(r)
    for s in db.query(ExamSubject).all():
        db.delete(s)
    for e in db.query(ExamEnrollment).all():
        db.delete(e)
    for s in db.query(Subject).filter(Subject.code.like("ZZ%")).all():
        db.delete(s)
    for g in db.query(GradeScale).filter(GradeScale.name.like("ZZ Temp%")).all():
        db.delete(g)
    for t in db.query(TeacherAssignment).filter(
            TeacherAssignment.subject.like("ZZ%")).all():
        db.delete(t)
    from models import UserRole
    for u in db.query(User).filter(User.email.like("zz.temp.%")).all():
        for ur in db.query(UserRole).filter(UserRole.user_id == u.id).all():
            db.delete(ur)
        db.delete(u)
    db.commit()
    print(f"  (pre-flight purge done; exams={db.query(Exam).count()} "
          f"subjects={db.query(Subject).count()} users={db.query(User).count()})")


def check(label, cond, extra=""):
    (PASS if cond else FAIL).append(label)
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f"  {extra}" if extra else ""))


def section(name):
    print(f"\n=== {name} ===")


def hdr(token):
    return {"Authorization": f"Bearer {token}"}


ADMIN_T = client.post("/api/auth/login",
                      json={"email": "admin@babyland.com",
                            "password": "admin123"}).json()["access_token"]
ADMIN = hdr(ADMIN_T)


def table_counts():
    out = {}
    with engine.connect() as conn:
        for t in inspect(engine).get_table_names():
            if t.startswith("sqlite_"):
                continue
            out[t] = conn.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar()
    return out


purge_residuals()
# Baseline is captured AFTER the pre-flight purge so the before/after diff
# reflects only what THIS run created.
BEFORE = table_counts()
temp = {"users": [], "subjects": [], "grades": [], "exams": [],
        "teacher_assignments": []}
card_ids = []

try:
    # ── 1. Grade scale seed ──────────────────────────────────────────────────
    section("1. Default grade-scale seed (idempotent)")
    bands = (db.query(GradeScale)
             .filter(GradeScale.name == "Default CBSE")
             .order_by(GradeScale.min_percentage.desc()).all())
    check("7 default bands exist", len(bands) == 7, f"got {len(bands)}")
    expect = [("A+", 90.0, 100.0, 10.0), ("A", 80.0, 90.0, 9.0),
              ("B+", 70.0, 80.0, 8.0), ("B", 60.0, 70.0, 7.0),
              ("C", 50.0, 60.0, 6.0), ("D", 40.0, 50.0, 5.0),
              ("F", 0.0, 40.0, 0.0)]
    actual = [(b.letter_grade, b.min_percentage, b.max_percentage, b.grade_point)
              for b in bands]
    check("bands + points correct", actual == expect, f"got {actual}")
    check("all bands is_default", all(b.is_default for b in bands))

    from routers.exams import seed_default_grade_scales, _apply_grade_scale
    check("re-seed inserts 0", seed_default_grade_scales(db) == 0)
    check("re-seed idempotent (still 7)",
          db.query(GradeScale).filter(GradeScale.name == "Default CBSE").count() == 7)
    for pct, want in ((95.0, "A+"), (85.0, "A"), (75.0, "B+"), (65.0, "B"),
                      (55.0, "C"), (45.0, "D"), (20.0, "F"), (100.0, "A+"),
                      (40.0, "D")):
        got, _ = _apply_grade_scale(db, pct)
        check(f"_apply_grade_scale({pct}) == {want}", got == want, f"got {got}")

    r = client.get("/api/grade-scales/", headers=ADMIN)
    check("GET /api/grade-scales/ 200 + 7 rows",
          r.status_code == 200 and len(r.json()) == 7, f"status={r.status_code}")

    # ── 2. Legacy /api/marks/ untouched ─────────────────────────────────────
    section("2. Legacy /api/marks/ still works unchanged")
    r = client.get("/api/marks/", headers=ADMIN)
    check("GET /api/marks/ 200 + list",
          r.status_code == 200 and isinstance(r.json(), list),
          f"status={r.status_code}")
    check("marks row count still 0", db.query(__import__("models").Mark).count() == 0)

    # ── 3. Happy path ───────────────────────────────────────────────────────
    section("3. Happy path: exam -> subjects -> enroll -> marks -> publish -> cards")
    year = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    # two sections that each hold >= 2 students (section 1 holds only one)
    sec_a = (db.query(ClassSection)
             .filter(Student.class_section_id == ClassSection.id)
             .group_by(ClassSection.id)
             .having(text("COUNT(students.id) >= 2"))
             .order_by(ClassSection.id).first())
    sec_b = (db.query(ClassSection)
             .filter(Student.class_section_id == ClassSection.id)
             .group_by(ClassSection.id)
             .having(text("COUNT(students.id) >= 2"))
             .order_by(ClassSection.id).offset(1).first())
    assert sec_a is not None and sec_b is not None, "need 2 populated sections"
    s1 = db.query(Student).filter(Student.class_section_id == sec_a.id).order_by(Student.id).first()
    s2 = (db.query(Student).filter(Student.class_section_id == sec_a.id,
                                   Student.id != s1.id).order_by(Student.id).first())
    s3 = db.query(Student).filter(Student.class_section_id == sec_b.id).order_by(Student.id).first()
    assert s1 and s2 and s3
    print(f"  (using students {s1.id}/{s2.id} in section {sec_a.id}, "
          f"student {s3.id} in section {sec_b.id})")

    # two temp subjects
    subj_ids = []
    for name, code in (("ZZ Temp Maths", "ZZTM"), ("ZZ Temp Science", "ZZTS")):
        rr = client.post("/api/subjects/", headers=ADMIN,
                         json={"name": name, "code": code, "category": "core"})
        check(f"create subject {code} 201", rr.status_code == 201, rr.text[:160])
        sid = rr.json()["id"]
        subj_ids.append(sid)
        temp["subjects"].append(sid)

    r = client.post("/api/exams/", headers=ADMIN, json={
        "name": "ZZ Temp Mid Term", "exam_type": "mid_term",
        "academic_year_id": year.id, "class_section_id": sec_a.id,
        "start_date": str(date.today()), "end_date": str(date.today()),
        "max_marks": 100, "pass_marks": 33, "weightage": 25,
    })
    check("create exam 201", r.status_code == 201, r.text[:200])
    exam = r.json()
    exam_id = exam["id"]
    temp["exams"].append(exam_id)
    check("exam embeds subjects=[] + student_count=0",
          exam.get("subjects") == [] and exam.get("student_count") == 0)
    check("exam starts unpublished",
          exam["is_published"] is False and exam["result_published"] is False)

    es_ids = []
    for sid in subj_ids:
        rr = client.post("/api/exam-subjects/", headers=ADMIN, json={
            "exam_id": exam_id, "subject_id": sid, "max_marks": 100,
            "room": "R1", "invigilator_id": 1})
        check(f"exam-subject for {sid} 201", rr.status_code == 201, rr.text[:160])
        es_ids.append(rr.json()["id"])
    check("2 exam_subjects created", len(es_ids) == 2)

    # duplicate exam_subject -> 400
    rr = client.post("/api/exam-subjects/", headers=ADMIN, json={
        "exam_id": exam_id, "subject_id": subj_ids[0], "max_marks": 100})
    check("duplicate exam_subject -> 400", rr.status_code == 400,
          f"status={rr.status_code}")

    # bulk enroll students 1 and 2 (spec) - use s1/s2
    rr = client.post("/api/exam-enrollments/", headers=ADMIN,
                     json={"exam_id": exam_id, "student_ids": [s1.id, s2.id]})
    check("bulk enroll {created, skipped}",
          rr.status_code == 200 and rr.json()["created"] == 2 and rr.json()["skipped"] == 0,
          rr.text[:160])
    rr = client.post("/api/exam-enrollments/", headers=ADMIN,
                     json={"exam_id": exam_id, "student_ids": [s1.id, s2.id, s3.id]})
    check("re-enroll skips duplicates",
          rr.status_code == 200 and rr.json()["created"] == 1 and rr.json()["skipped"] == 2,
          rr.text[:160])
    enr = (db.query(ExamEnrollment).filter(ExamEnrollment.exam_id == exam_id).all())
    check("3 enrollments in exam", len(enr) == 3, f"got {len(enr)}")
    e_s1 = [e for e in enr if e.student_id == s1.id][0]
    e_s2 = [e for e in enr if e.student_id == s2.id][0]
    e_s3 = [e for e in enr if e.student_id == s3.id][0]
    check("student_count now 3",
          client.get(f"/api/exams/{exam_id}", headers=ADMIN).json()["student_count"] == 3)

    # bulk enter marks: s1 = 90/80, s2 = 45/40, s3 = unmarked (skipped)
    rr = client.post("/api/exam-marks/bulk", headers=ADMIN, json={
        "exam_id": exam_id,
        "marks": [
            {"student_id": s1.id, "subject_id": subj_ids[0], "score": 90},
            {"student_id": s1.id, "subject_id": subj_ids[1], "score": 80},
            {"student_id": s2.id, "subject_id": subj_ids[0], "score": 45},
            {"student_id": s2.id, "subject_id": subj_ids[1], "score": 40},
            {"student_id": s2.id, "subject_id": 999999, "score": 10},   # bad subject
            {"student_id": 999999, "subject_id": subj_ids[0], "score": 10},  # bad student
            {"student_id": s2.id, "subject_id": subj_ids[0], "score": 500},  # > max
            {"student_id": s2.id, "subject_id": subj_ids[0], "score": -5},   # negative
        ]})
    check("bulk marks {saved, skipped, errors}",
          rr.status_code == 200 and rr.json()["saved"] == 4
          and rr.json()["skipped"] == 4 and len(rr.json()["errors"]) == 4,
          rr.text[:260])
    errs = " | ".join(e["error"] for e in rr.json()["errors"])
    check("errors explain bad subject/student/score",
          "not part of this exam" in errs and "not enrolled" in errs
          and "exceeds max marks" in errs and ">= 0" in errs, errs)

    # upsert on repeat (same student/subject) updates rather than duplicating
    rr = client.post("/api/exam-marks/bulk", headers=ADMIN, json={
        "exam_id": exam_id,
        "marks": [{"student_id": s1.id, "subject_id": subj_ids[0], "score": 95}]})
    row_count = db.query(ExamMark).join(
        ExamSubject, ExamSubject.id == ExamMark.exam_subject_id).filter(
        ExamSubject.exam_id == exam_id).count()
    check("re-bulk upserts in place (saved=1, still 4 rows)",
          rr.status_code == 200 and rr.json()["saved"] == 1 and row_count == 4,
          f"saved={rr.json().get('saved')} rows={row_count}")
    m_chk = (db.query(ExamMark).join(ExamSubject, ExamSubject.id == ExamMark.exam_subject_id)
             .filter(ExamSubject.exam_id == exam_id,
                     ExamSubject.subject_id == subj_ids[0],
                     ExamMark.exam_enrollment_id == e_s1.id).first())
    check("re-bulk updated the score to 95", float(m_chk.score) == 95.0,
          f"got {m_chk.score}")

    # results before publish -> 400
    rr = client.post(f"/api/exams/{exam_id}/results", headers=ADMIN)
    check("results before is_published -> 400", rr.status_code == 400,
          f"status={rr.status_code}")

    # publish
    rr = client.post(f"/api/exams/{exam_id}/publish", headers=ADMIN)
    check("publish exam 200 + is_published",
          rr.status_code == 200 and rr.json()["is_published"] is True, rr.text[:160])

    # publish results
    rr = client.post(f"/api/exams/{exam_id}/results", headers=ADMIN)
    res = rr.json() if rr.status_code == 200 else {}
    check("publish results 200 + generated=2 skipped=1",
          rr.status_code == 200 and res.get("generated") == 2
          and res.get("skipped") == 1, rr.text[:200])
    check("published_at set", bool(res.get("published_at")), str(res.get("published_at")))

    # report cards
    c1 = db.query(ReportCard).filter(ReportCard.student_id == s1.id,
                                     ReportCard.exam_id == exam_id).first()
    c2 = db.query(ReportCard).filter(ReportCard.student_id == s2.id,
                                     ReportCard.exam_id == exam_id).first()
    card_ids.extend([c1.id, c2.id])
    # s1 = 95+80 = 175/200 = 87.5 -> A (9.0), pass
    check("s1 total 175/200, pct 87.5",
          (c1.total_marks, c1.max_total_marks, c1.percentage) == (175.0, 200.0, 87.5),
          f"got {(c1.total_marks, c1.max_total_marks, c1.percentage)}")
    check("s1 grade A / point 9.0",
          (c1.grade, c1.grade_point) == ("A", 9.0),
          f"got {(c1.grade, c1.grade_point)}")
    check("s1 result pass", c1.result == "pass", c1.result)
    # s2 = 45+40 = 85/200 = 42.5 -> D (5.0); pass_marks=33 -> both 45,40 >= 33
    check("s2 total 85/200, pct 42.5",
          (c2.total_marks, c2.max_total_marks, c2.percentage) == (85.0, 200.0, 42.5),
          f"got {(c2.total_marks, c2.max_total_marks, c2.percentage)}")
    check("s2 grade D / point 5.0",
          (c2.grade, c2.grade_point) == ("D", 5.0),
          f"got {(c2.grade, c2.grade_point)}")
    check("s2 result pass", c2.result == "pass", c2.result)

    rr = client.get(f"/api/report-cards/{c1.id}", headers=ADMIN)
    body = rr.json()
    check("GET report-card 200 + 2 subject rows",
          rr.status_code == 200 and len(body.get("subjects") or []) == 2,
          f"status={rr.status_code} body={str(body)[:200]}")
    check("embedded subject rows carry scores/max",
          {s["subject_id"] for s in body["subjects"]} == set(subj_ids)
          and all(s["is_pass"] for s in body["subjects"]))

    # rank
    rr = client.post(f"/api/report-cards/{c1.id}/rank", headers=ADMIN)
    check("recompute rank -> s1 rank 1, class_rank 1",
          rr.status_code == 200 and rr.json()["rank"] == 1
          and rr.json()["class_rank"] == 1, rr.text[:200])
    rr = client.post(f"/api/report-cards/{c2.id}/rank", headers=ADMIN)
    check("s2 rank 2", rr.json()["rank"] == 2 and rr.json()["class_rank"] == 2,
          f"got rank={rr.json()['rank']} class_rank={rr.json()['class_rank']}")

    # results-sheet
    rr = client.get(f"/api/exams/{exam_id}/results-sheet", headers=ADMIN)
    sheet = rr.json() if rr.status_code == 200 else []
    check("results-sheet 200 + 2 rows", rr.status_code == 200 and len(sheet) == 2,
          f"status={rr.status_code}")
    row0 = [s for s in sheet if s["subject_id"] == subj_ids[0]][0]
    check("subject0 stats 95/45 avg 70 pass 100%",
          (row0["highest"], row0["lowest"], row0["average"],
           row0["pass_count"], row0["pass_percentage"]) == (95.0, 45.0, 70.0, 2, 100.0),
          f"got {row0}")

    # publish-bulk
    rr = client.post("/api/report-cards/publish-bulk", headers=ADMIN,
                     json={"exam_id": exam_id})
    check("publish-bulk publishes 2",
          rr.status_code == 200 and rr.json()["published"] == 2
          and rr.json()["total"] == 2, rr.text[:160])
    db.expire_all()
    check("cards now is_published",
          all(db.query(ReportCard).filter(ReportCard.id == i).first().is_published
              for i in card_ids))

    # preview does not persist
    before_cards = db.query(ReportCard).filter(ReportCard.exam_id == exam_id).count()
    rr = client.get(f"/api/report-cards/preview/{s1.id}/{exam_id}", headers=ADMIN)
    after_cards = db.query(ReportCard).filter(ReportCard.exam_id == exam_id).count()
    check("preview 200, no new row",
          rr.status_code == 200 and before_cards == after_cards, rr.text[:160])
    check("preview matches stored card",
          rr.json()["percentage"] == 87.5 and rr.json()["grade"] == "A", rr.text[:200])

    # empty exam -> results-sheet zeros, never 500
    r2 = client.post("/api/exams/", headers=ADMIN, json={
        "name": "ZZ Temp Empty", "exam_type": "unit_test",
        "academic_year_id": year.id, "class_section_id": sec_b.id,
        "max_marks": 50, "pass_marks": 18})
    empty_id = r2.json()["id"]
    temp["exams"].append(empty_id)
    client.post(f"/api/exams/{empty_id}/publish", headers=ADMIN)
    rr = client.get(f"/api/exams/{empty_id}/results-sheet", headers=ADMIN)
    check("empty exam results-sheet 200 + [] (no 500, no div-by-zero)",
          rr.status_code == 200 and rr.json() == [], f"status={rr.status_code} {rr.text[:120]}")
    rr = client.post(f"/api/exams/{empty_id}/results", headers=ADMIN)
    check("empty exam results 200 generated=0 skipped=0",
          rr.status_code == 200 and rr.json()["generated"] == 0
          and rr.json()["skipped"] == 0, f"status={rr.status_code} {rr.text[:160]}")

    # exam with a subject but NO marks -> zero-filled row
    client.post("/api/exam-subjects/", headers=ADMIN,
                json={"exam_id": empty_id, "subject_id": subj_ids[0], "max_marks": 50})
    rr = client.get(f"/api/exams/{empty_id}/results-sheet", headers=ADMIN)
    row = rr.json()[0]
    check("subject with no marks -> all zeros",
          rr.status_code == 200 and (row["students_count"], row["highest"], row["lowest"],
                                     row["average"], row["pass_count"],
                                     row["pass_percentage"]) == (0, 0.0, 0.0, 0.0, 0, 0.0),
          f"got {row}")

    # ── 4. Validation ───────────────────────────────────────────────────────
    section("4. Validation / 400s / 404s")
    m1 = (db.query(ExamMark).join(ExamSubject, ExamSubject.id == ExamMark.exam_subject_id)
          .filter(ExamSubject.exam_id == exam_id,
                  ExamMark.exam_enrollment_id == e_s1.id).first())
    rr = client.put(f"/api/exam-marks/{m1.id}", headers=ADMIN, json={"score": 101})
    check("score > max_marks -> 400", rr.status_code == 400, f"status={rr.status_code}")
    rr = client.put(f"/api/exam-marks/{m1.id}", headers=ADMIN, json={"score": -1})
    check("negative score -> 400", rr.status_code == 400, f"status={rr.status_code}")
    rr = client.put(f"/api/exam-marks/{m1.id}", headers=ADMIN, json={"score": 95})
    check("valid score update 200", rr.status_code == 200, rr.text[:160])

    r3 = client.post("/api/exams/", headers=ADMIN, json={
        "name": "ZZ Temp Unpublished", "exam_type": "final_exam",
        "academic_year_id": year.id, "max_marks": 100})
    unpub_id = r3.json()["id"]
    temp["exams"].append(unpub_id)
    rr = client.post(f"/api/exams/{unpub_id}/results", headers=ADMIN)
    check("results before publish (2nd exam) -> 400", rr.status_code == 400,
          f"status={rr.status_code}")

    rr = client.get("/api/exams/999999", headers=ADMIN)
    check("GET /api/exams/999999 -> 404", rr.status_code == 404, f"status={rr.status_code}")
    rr = client.get("/api/report-cards/999999", headers=ADMIN)
    check("GET /api/report-cards/999999 -> 404", rr.status_code == 404, f"status={rr.status_code}")
    rr = client.delete(f"/api/exams/{exam_id}", headers=ADMIN)
    check("DELETE exam with marks -> 400",
          rr.status_code == 400 and "cannot be deleted" in rr.text, rr.text[:200])

    rr = client.post("/api/exams/", headers=ADMIN, json={
        "name": "ZZ Temp Bad Type", "exam_type": "nonsense"})
    check("bad exam_type -> 422 (regex)", rr.status_code == 422, f"status={rr.status_code}")

    # ── 5. Guards ───────────────────────────────────────────────────────────
    section("5. Role guards")
    # temp teacher (linked to existing teacher 1)
    rr = client.post("/api/auth/register", headers=ADMIN, json={
        "name": "ZZ Temp Teacher", "email": "zz.temp.teacher@babyland.com",
        "password": "Temp12345!", "role": "teacher", "teacher_id": 1})
    check("register temp teacher 201", rr.status_code == 201, rr.text[:200])
    teacher_user_id = rr.json()["id"]
    temp["users"].append(teacher_user_id)

    rr = client.post("/api/auth/register", headers=ADMIN, json={
        "name": "ZZ Temp Principal", "email": "zz.temp.principal@babyland.com",
        "password": "Temp12345!", "role": "principal"})
    check("register temp principal 201", rr.status_code == 201, rr.text[:200])
    principal_user_id = rr.json()["id"]
    temp["users"].append(principal_user_id)

    rr = client.post("/api/auth/register", headers=ADMIN, json={
        "name": "ZZ Temp Accountant", "email": "zz.temp.accountant@babyland.com",
        "password": "Temp12345!", "role": "accountant"})
    check("register temp accountant 201", rr.status_code == 201, rr.text[:200])
    accountant_user_id = rr.json()["id"]
    temp["users"].append(accountant_user_id)

    tt = client.post("/api/auth/login", json={"email": "zz.temp.teacher@babyland.com",
                                              "password": "Temp12345!"}).json()["access_token"]
    pt = client.post("/api/auth/login", json={"email": "zz.temp.principal@babyland.com",
                                              "password": "Temp12345!"}).json()["access_token"]
    at = client.post("/api/auth/login", json={"email": "zz.temp.accountant@babyland.com",
                                              "password": "Temp12345!"}).json()["access_token"]
    TEACHER, PRINCIPAL, ACCOUNTANT = hdr(tt), hdr(pt), hdr(at)

    # no assignment yet -> teacher cannot enter marks
    rr = client.post("/api/exam-marks/bulk", headers=TEACHER, json={
        "exam_id": exam_id,
        "marks": [{"student_id": s1.id, "subject_id": subj_ids[0], "score": 88}]})
    check("teacher WITHOUT assignment -> 403/skip",
          rr.status_code == 200 and rr.json()["saved"] == 0
          and "Not assigned" in rr.json()["errors"][0]["error"], rr.text[:200])
    rr = client.post("/api/exam-marks/bulk", headers=TEACHER, json={
        "exam_id": exam_id,
        "marks": [{"student_id": s1.id, "subject_id": subj_ids[0], "score": 500}]})
    check("teacher scope checked before score (403 not saved)",
          rr.json()["saved"] == 0 and rr.json()["errors"][0]["error"].startswith("Not assigned"),
          rr.text[:200])

    rr = client.post("/api/exams/", headers=TEACHER, json={
        "name": "ZZ Teacher Attempt", "exam_type": "unit_test"})
    check("teacher CANNOT create an exam -> 403", rr.status_code == 403,
          f"status={rr.status_code}")
    rr = client.post("/api/exams/", headers=PRINCIPAL, json={
        "name": "ZZ Principal Exam", "exam_type": "unit_test",
        "academic_year_id": year.id, "class_section_id": sec_a.id})
    check("principal CAN create an exam -> 201", rr.status_code == 201, rr.text[:200])
    if rr.status_code == 201:
        temp["exams"].append(rr.json()["id"])
    rr = client.post(f"/api/exams/{unpub_id}/publish", headers=PRINCIPAL)
    check("principal CAN publish -> 200", rr.status_code == 200, rr.text[:160])

    # TeacherAssignment: teacher 1 -> sec_a + "ZZ Temp Maths"
    rr = client.post("/api/teacher-assignments/", headers=ADMIN, json={
        "teacher_id": 1, "class_section_id": sec_a.id,
        "subject": "ZZ Temp Maths", "academic_year_id": year.id})
    check("create TeacherAssignment 201", rr.status_code == 201, rr.text[:200])
    ta_id = rr.json()["id"] if rr.status_code == 201 else None
    if ta_id:
        temp["teacher_assignments"].append(ta_id)

    # now allowed for the assigned subject in the assigned section
    m_subj0 = (db.query(ExamMark).join(ExamSubject, ExamSubject.id == ExamMark.exam_subject_id)
               .filter(ExamSubject.exam_id == exam_id,
                       ExamSubject.subject_id == subj_ids[0],
                       ExamMark.exam_enrollment_id == e_s1.id).first())
    rr = client.put(f"/api/exam-marks/{m_subj0.id}", headers=TEACHER, json={"score": 93})
    check("teacher CAN edit marks in assigned class+subject -> 200",
          rr.status_code == 200, f"status={rr.status_code} {rr.text[:160]}")
    # denied subject (second subject not assigned)
    m_subj1 = (db.query(ExamMark).join(ExamSubject, ExamSubject.id == ExamMark.exam_subject_id)
               .filter(ExamSubject.exam_id == exam_id,
                       ExamSubject.subject_id == subj_ids[1],
                       ExamMark.exam_enrollment_id == e_s1.id).first())
    rr = client.put(f"/api/exam-marks/{m_subj1.id}", headers=TEACHER, json={"score": 70})
    check("teacher DENIED unassigned subject -> 403", rr.status_code == 403,
          f"status={rr.status_code}")
    # denied SECTION: s3 lives in sec_b and the exam belongs to sec_b. Enroll s3
    # first so the scope check (not the enrollment check) is what rejects it.
    client.post("/api/exam-enrollments/", headers=ADMIN,
                json={"exam_id": empty_id, "student_ids": [s3.id]})
    rr = client.post("/api/exam-marks/bulk", headers=TEACHER, json={
        "exam_id": empty_id,
        "marks": [{"student_id": s3.id, "subject_id": subj_ids[0], "score": 30}]})
    check("teacher DENIED unassigned section -> 403/skip",
          rr.status_code == 200 and rr.json()["saved"] == 0
          and "Not assigned" in rr.json()["errors"][0]["error"], rr.text[:200])
    # score range still enforced for teacher
    rr = client.put(f"/api/exam-marks/{m_subj0.id}", headers=TEACHER, json={"score": 999})
    check("teacher score > max -> 400", rr.status_code == 400, f"status={rr.status_code}")

    # teacher read scoping
    rr = client.get("/api/exams/", headers=TEACHER)
    t_exams = [e["id"] for e in rr.json()] if rr.status_code == 200 else []
    check("teacher sees assigned-section exam", exam_id in t_exams, f"got {t_exams}")
    check("teacher cannot see other-section exam", empty_id not in t_exams,
          f"got {t_exams}")

    # accountant 403
    for path in ("/api/exams/", "/api/report-cards/", "/api/exam-marks/",
                 "/api/exam-subjects/", "/api/exam-enrollments/"):
        rr = client.get(path, headers=ACCOUNTANT)
        check(f"accountant GET {path} -> 403", rr.status_code == 403,
              f"status={rr.status_code}")
    rr = client.get("/api/grade-scales/", headers=ACCOUNTANT)
    check("accountant CAN read grade-scales (config metadata)", rr.status_code == 200,
          f"status={rr.status_code}")

    # grade scale writes admin-only
    rr = client.post("/api/grade-scales/", headers=PRINCIPAL, json={
        "name": "ZZ Temp Scale", "letter_grade": "E", "grade_point": 1,
        "min_percentage": 0, "max_percentage": 1})
    check("principal CANNOT create grade scale -> 403", rr.status_code == 403,
          f"status={rr.status_code}")
    rr = client.post("/api/grade-scales/", headers=ADMIN, json={
        "name": "ZZ Temp Scale", "letter_grade": "E", "grade_point": 1,
        "min_percentage": 0, "max_percentage": 1})
    check("admin CAN create grade scale -> 201", rr.status_code == 201, rr.text[:160])
    scale_id = rr.json()["id"] if rr.status_code == 201 else None
    if scale_id:
        rr = client.delete(f"/api/grade-scales/{scale_id}", headers=ADMIN)
        check("unreferenced grade scale DELETE 204", rr.status_code == 204,
              rr.text[:160])
        temp.setdefault("grades", []).append(scale_id)
    # referenced by report cards -> 400
    a_band = (db.query(GradeScale).filter(GradeScale.letter_grade == "A",
                                          GradeScale.name == "Default CBSE").first())
    if a_band is not None and db.query(ReportCard).filter(
            ReportCard.grade == a_band.letter_grade).count() > 0:
        rr = client.delete(f"/api/grade-scales/{a_band.id}", headers=ADMIN)
        check("referenced grade scale DELETE -> 400", rr.status_code == 400,
              f"status={rr.status_code}")

    # ── 6. Student / parent scoping ─────────────────────────────────────────
    section("6. Student + parent scoping")
    # a student user linked to s1 (existing student 1 must have a user; create one)
    rr = client.post("/api/auth/register", headers=ADMIN, json={
        "name": "ZZ Temp Student", "email": "zz.temp.student@babyland.com",
        "password": "Temp12345!", "role": "student", "student_id": s1.id})
    check("register temp student 201", rr.status_code == 201, rr.text[:200])
    student_user_id = rr.json()["id"]
    temp["users"].append(student_user_id)
    rr = client.post("/api/auth/register", headers=ADMIN, json={
        "name": "ZZ Temp Parent", "email": "zz.temp.parent@babyland.com",
        "password": "Temp12345!", "role": "parent", "student_id": s2.id})
    check("register temp parent 201", rr.status_code == 201, rr.text[:200])
    parent_user_id = rr.json()["id"]
    temp["users"].append(parent_user_id)

    st = client.post("/api/auth/login", json={"email": "zz.temp.student@babyland.com",
                                              "password": "Temp12345!"}).json()["access_token"]
    prt = client.post("/api/auth/login", json={"email": "zz.temp.parent@babyland.com",
                                               "password": "Temp12345!"}).json()["access_token"]
    STUDENT, PARENT = hdr(st), hdr(prt)

    mine = client.get("/api/exams/mine", headers=STUDENT)
    check("GET /api/exams/mine 200", mine.status_code == 200, f"status={mine.status_code}")
    mine_ids = [e["id"] for e in mine.json()] if mine.status_code == 200 else []
    check("/exams/mine returns ONLY the student's exams", mine_ids == [exam_id],
          f"got {mine_ids}")

    rr = client.get("/api/exams/", headers=STUDENT)
    check("student GET /api/exams/ scoped to published/relevant",
          rr.status_code == 200 and [e["id"] for e in rr.json()] == [exam_id],
          f"got {[e['id'] for e in rr.json()]}")
    rr = client.get("/api/exams/", headers=PARENT)
    check("parent GET /api/exams/ scoped to linked child",
          rr.status_code == 200 and [e["id"] for e in rr.json()] == [exam_id],
          f"got {[e['id'] for e in rr.json()]}")

    # student can read OWN published report card
    rr = client.get(f"/api/report-cards/{c1.id}", headers=STUDENT)
    check("student reads OWN published report card 200", rr.status_code == 200,
          f"status={rr.status_code} {rr.text[:140]}")
    # student CANNOT read another student's card
    rr = client.get(f"/api/report-cards/{c2.id}", headers=STUDENT)
    check("student CANNOT read another student's report card -> 403",
          rr.status_code == 403, f"status={rr.status_code}")
    # student CANNOT read a non-published card
    db.expire_all()
    c2.is_published = False
    db.commit()
    rr = client.get(f"/api/report-cards/{c2.id}", headers=STUDENT)
    check("student CANNOT read non-published report card -> 403",
          rr.status_code == 403, f"status={rr.status_code}")
    rr = client.get(f"/api/report-cards/{c2.id}", headers=PARENT)
    check("parent CANNOT read non-published child card -> 403",
          rr.status_code == 403, f"status={rr.status_code}")
    db.expire_all()
    c2.is_published = True
    db.commit()

    rr = client.get(f"/api/exams/{unpub_id}", headers=STUDENT)
    check("student GET unpublished exam -> 403", rr.status_code == 403,
          f"status={rr.status_code}")
    rr = client.post("/api/exams/", headers=STUDENT, json={"name": "x",
                                                           "exam_type": "unit_test"})
    check("student CANNOT create exam -> 403", rr.status_code == 403,
          f"status={rr.status_code}")
    rr = client.post("/api/exam-marks/bulk", headers=STUDENT, json={
        "exam_id": exam_id, "marks": [{"student_id": s1.id,
                                       "subject_id": subj_ids[0], "score": 10}]})
    check("student CANNOT enter marks -> 403", rr.status_code == 403,
          f"status={rr.status_code}")
    rr = client.post(f"/api/report-cards/{c1.id}/publish", headers=TEACHER)
    check("teacher CANNOT publish a report card -> 403", rr.status_code == 403,
          f"status={rr.status_code}")
    rr = client.post(f"/api/exams/{exam_id}/publish", headers=TEACHER)
    check("teacher CANNOT publish an exam -> 403", rr.status_code == 403,
          f"status={rr.status_code}")
    rr = client.post(f"/api/report-cards/{c1.id}/rank", headers=TEACHER)
    check("teacher CANNOT recompute rank -> 403", rr.status_code == 403,
          f"status={rr.status_code}")

    # teacher remarks scoped to own sections
    rr = client.put(f"/api/report-cards/{c1.id}", headers=TEACHER,
                    json={"teacher_remarks": "Good effort"})
    check("teacher CAN set remarks on own section -> 200", rr.status_code == 200,
          f"status={rr.status_code} {rr.text[:140]}")
    rr = client.post("/api/exam-enrollments/", headers=STUDENT,
                     json={"exam_id": exam_id, "student_ids": [s2.id]})
    check("student CANNOT bulk-enroll -> 403", rr.status_code == 403,
          f"status={rr.status_code}")

    # ── 7. Legacy marks still fine ──────────────────────────────────────────
    section("7. Legacy /api/marks/ unchanged after all writes")
    r = client.get("/api/marks/", headers=ADMIN)
    check("GET /api/marks/ still 200 + list",
          r.status_code == 200 and isinstance(r.json(), list), f"status={r.status_code}")
    check("marks row count still 0 (untouched)",
          db.query(__import__("models").Mark).count() == 0)
    r = client.get("/api/marks/1", headers=ADMIN)
    check("GET /api/marks/1 still 404 (no rows created)",
          r.status_code == 404, f"status={r.status_code}")

except Exception:
    import traceback
    traceback.print_exc()
    FAIL.append("EXCEPTION during verification")

finally:
    section("CLEANUP")
    db.rollback()
    # Everything is deleted via ORM objects (never Query.delete() on a join) so
    # the session cascades correctly. FK order: exam_marks -> report_cards /
    # exam_subjects / exam_enrollments -> exams -> subjects.
    exam_ids = list(temp["exams"]) or [-1]
    es_ids = [s.id for s in db.query(ExamSubject).filter(
        ExamSubject.exam_id.in_(exam_ids)).all()] or [-1]
    for m in db.query(ExamMark).filter(ExamMark.exam_subject_id.in_(es_ids)).all():
        db.delete(m)
    for r in db.query(ReportCard).filter(ReportCard.exam_id.in_(exam_ids)).all():
        db.delete(r)
    for s in db.query(ExamSubject).filter(ExamSubject.exam_id.in_(exam_ids)).all():
        db.delete(s)
    for e in db.query(ExamEnrollment).filter(ExamEnrollment.exam_id.in_(exam_ids)).all():
        db.delete(e)
    for e in db.query(Exam).filter(Exam.id.in_(exam_ids)).all():
        db.delete(e)
    db.commit()

    subject_ids = list(temp["subjects"]) or [-1]
    for s in db.query(ClassSubject).filter(
            ClassSubject.subject_id.in_(subject_ids)).all():
        db.delete(s)
    for s in db.query(Subject).filter(Subject.id.in_(subject_ids)).all():
        db.delete(s)
    for g in db.query(GradeScale).filter(
            GradeScale.name.like("ZZ Temp%")).all():
        db.delete(g)
    for t in db.query(TeacherAssignment).filter(
            TeacherAssignment.id.in_(temp["teacher_assignments"] or [-1])).all():
        db.delete(t)
    db.commit()

    for uid in temp["users"]:
        from models import ParentStudentLink, UserRole
        for pl in db.query(ParentStudentLink).filter(
                ParentStudentLink.parent_user_id == uid).all():
            db.delete(pl)
        for ur in db.query(UserRole).filter(UserRole.user_id == uid).all():
            db.delete(ur)
        u = db.query(User).filter(User.id == uid).first()
        if u is not None:
            db.delete(u)
    db.commit()
    db.close()

    AFTER = {}
    with engine.connect() as conn:
        for t in inspect(engine).get_table_names():
            if t.startswith("sqlite_"):
                continue
            AFTER[t] = conn.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar()

    print("\n===== BEFORE / AFTER row counts =====")
    keys = sorted(set(BEFORE) | set(AFTER))
    for k in keys:
        b, a = BEFORE.get(k, "<new>"), AFTER.get(k, "<gone>")
        flag = "" if b == a else ("   <-- CHANGED" if str(b) != str(a) else "")
        if b != a and k not in ("audit_logs",):
            print(f"!! {k:26s} {b} -> {a}{flag}")
        else:
            print(f"   {k:26s} {b} -> {a}{flag}")

    print(f"\n===== SUMMARY: {len(PASS)} PASS / {len(FAIL)} FAIL =====")
    if FAIL:
        print("FAILURES:")
        for f in FAIL:
            print(f"  - {f}")
    db2 = SessionLocal()
    print("\nSpot invariants:")
    print(f"  users={db2.query(User).count()} students={db2.query(Student).count()} "
          f"class_sections={db2.query(ClassSection).count()} "
          f"teachers={db2.query(Teacher).count()} "
          f"subjects={db2.query(Subject).count()} "
          f"exams={db2.query(Exam).count()} "
          f"exam_subjects={db2.query(ExamSubject).count()} "
          f"exam_enrollments={db2.query(ExamEnrollment).count()} "
          f"exam_marks={db2.query(ExamMark).count()} "
          f"report_cards={db2.query(ReportCard).count()} "
          f"grade_scales={db2.query(GradeScale).count()} "
          f"teacher_assignments={db2.query(TeacherAssignment).count()} "
          f"marks={db2.query(__import__('models').Mark).count()}")
    db2.close()
    sys.exit(1 if FAIL else 0)