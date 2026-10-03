"""Seed remaining finance, scholarship, exam marks, and discount data."""
import random
from datetime import date, datetime
from database import SessionLocal
import models

def seed_supplement():
    db = SessionLocal()
    try:
        print("Seeding supplement data...")
        year = db.query(models.AcademicYear).filter(models.AcademicYear.name == "2026-27").first()
        students = db.query(models.Student).all()
        admin_user = db.query(models.User).filter(models.User.role == "admin").first()
        accountant_user = db.query(models.User).filter(models.User.role == "accountant").first()
        principal_user = db.query(models.User).filter(models.User.role == "principal").first()

        # ── 1. FeeStructures & Items ──
        if db.query(models.FeeStructure).count() == 0:
            heads = db.query(models.FeeHead).all()
            tuition_head = next((h for h in heads if "Tuition" in h.name), heads[0])
            annual_head = next((h for h in heads if "Composite" in h.name), heads[1])
            lab_head = next((h for h in heads if "STEM" in h.name), heads[2])

            for grp, amt in [("Primary Wing (Grade 1-5)", 18500.0), ("Middle Wing (Grade 6-8)", 22000.0), ("Secondary Wing (Grade 9-10)", 25000.0)]:
                fs = models.FeeStructure(
                    name=grp,
                    academic_year_id=year.id,
                    description=f"Standard academic structure for {grp}",
                    is_active=True
                )
                db.add(fs)
                db.commit()
                db.refresh(fs)

                db.add(models.FeeStructureItem(fee_structure_id=fs.id, fee_head_id=tuition_head.id, amount=amt * 0.75, periodicity="quarterly"))
                db.add(models.FeeStructureItem(fee_structure_id=fs.id, fee_head_id=annual_head.id, amount=amt * 0.15, periodicity="quarterly"))
                db.add(models.FeeStructureItem(fee_structure_id=fs.id, fee_head_id=lab_head.id, amount=amt * 0.10, periodicity="quarterly"))
                db.commit()
            print("Seeded FeeStructures and FeeStructureItems.")

        # ── 2. Discounts & Scholarships ──
        if db.query(models.Discount).count() == 0:
            disc1 = models.Discount(name="Sibling Concession (10%)", type="percentage", value=10.0, description="For second child enrolled in school")
            disc2 = models.Discount(name="Defence / Paramilitary Ward Concession", type="fixed", value=2500.0, description="Honoring armed forces families")
            db.add_all([disc1, disc2])
            db.commit()
            print("Seeded Discounts.")

        if db.query(models.Scholarship).count() == 0:
            sch1 = models.Scholarship(
                name="Merit Excellence Scholarship",
                amount=15000.0,
                academic_year_id=year.id,
                description="Annual grant for top 5% academic performers",
                is_active=True
            )
            sch2 = models.Scholarship(
                name="National Sports Talent Grant",
                amount=10000.0,
                academic_year_id=year.id,
                description="Support for state & national level athletes",
                is_active=True
            )
            db.add_all([sch1, sch2])
            db.commit()
            db.refresh(sch1)
            db.refresh(sch2)

            # Assign to 5 students
            for s in students[:5]:
                db.add(models.StudentScholarship(
                    student_id=s.id,
                    scholarship_id=sch1.id,
                    academic_year_id=year.id,
                    amount=15000.0,
                    granted_on=date(2026, 4, 15),
                    granted_by=principal_user.id
                ))
            db.commit()
            print("Seeded Scholarships and StudentScholarships.")

        # ── 3. Fines ──
        if db.query(models.Fine).count() == 0:
            for s in students[60:65]:
                db.add(models.Fine(
                    student_id=s.id,
                    amount=500.0,
                    reason="Late library book return / damage",
                    levied_on=date(2026, 9, 20),
                    is_waived=False
                ))
            db.commit()
            print("Seeded Fines.")

        # ── 4. Incomes ──
        if db.query(models.Income).count() == 0:
            incomes = [
                ("admission", "ADMISSION_REG_2026", 45000.0, date(2026, 9, 10), "online", "New admissions registration fees collected"),
                ("donation", "ALUMNI_CONTRIB_01", 100000.0, date(2026, 9, 15), "bank_transfer", "Alumni contribution for Atal Tinkering Lab equipment"),
                ("other", "CANTEEN_LICENSE_Q3", 25000.0, date(2026, 9, 1), "cheque", "Quarterly school cafeteria license fee"),
            ]
            for src, ref, amt, rdate, mode, note in incomes:
                db.add(models.Income(
                    source=src,
                    source_ref=ref,
                    amount=amt,
                    received_on=rdate,
                    mode=mode,
                    note=note,
                    created_by=accountant_user.id
                ))
            db.commit()
            print("Seeded Incomes.")

        # ── 5. Modern Exam Enrollments and ExamMarks ──
        exam = db.query(models.Exam).first()
        if exam and db.query(models.ExamEnrollment).count() == 0:
            exam_subjects = db.query(models.ExamSubject).filter(models.ExamSubject.exam_id == exam.id).all()
            for idx, s in enumerate(students[:40]):
                enr = models.ExamEnrollment(
                    exam_id=exam.id,
                    student_id=s.id,
                    roll_no=f"ROLL-{idx+1:03d}",
                    is_absent=False
                )
                db.add(enr)
                db.commit()
                db.refresh(enr)

                # Marks for each subject
                for es in exam_subjects:
                    score = round(random.uniform(62.0, 96.0), 1)
                    db.add(models.ExamMark(
                        exam_subject_id=es.id,
                        exam_enrollment_id=enr.id,
                        score=score,
                        is_absent=False,
                        entered_by=principal_user.id
                    ))
            db.commit()
            print("Seeded ExamEnrollments and ExamMarks.")

        # ── 6. Notice Reads ──
        if db.query(models.NoticeRead).count() == 0:
            notices = db.query(models.Notice).all()
            student_user = db.query(models.User).filter(models.User.role == "student").first()
            if student_user and notices:
                for n in notices[:3]:
                    db.add(models.NoticeRead(notice_id=n.id, user_id=student_user.id, read_at=datetime.utcnow()))
            db.commit()
            print("Seeded NoticeReads.")

        print("Supplement seeding finished successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    seed_supplement()
