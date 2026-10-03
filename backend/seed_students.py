"""Seed 30 students per class section (Grades 1-5, sections A/B).

Idempotent: tops up each section to 30 students. Creates matching
User accounts (role=student, default password 'student123') so the
student portal works for every seeded student.

Usage: cd backend && python seed_students.py
"""
import random
from datetime import date

from database import SessionLocal
from models import AcademicYear, ClassSection, Student, User
from auth import get_password_hash

FIRST_NAMES = [
    "Aarav", "Aisha", "Arjun", "Ananya", "Aditya", "Diya", "Ishaan", "Kavya",
    "Krishna", "Meera", "Nikhil", "Priya", "Rahul", "Riya", "Rohan", "Sanya",
    "Sharma", "Vikram", "Zara", "Aman", "Fatima", "Imran", "Neha", "Pooja",
    "Raj", "Simran", "Tarun", "Uma", "Varun", "Yash", "Kabir", "Myra",
    "Advait", "Navya", "Reyansh", "Sara", "Vivaan", "Anika", "Dev", "Ira",
]
LAST_NAMES = [
    "Sharma", "Verma", "Khan", "Patel", "Singh", "Gupta", "Mehta", "Iyer",
    "Nair", "Reddy", "Das", "Kulkarni", "Joshi", "Chopra", "Malhotra", "Agarwal",
    "Bose", "Choudhury", "Pillai", "Rao", "Sheikh", "Yadav", "Mishra", "Pandey",
]

GRADES = ["1", "2", "3", "4", "5"]
SECTIONS = ["A", "B"]
PER_SECTION = 30
DEFAULT_PASSWORD = "student123"
TARGET_YEAR = "2026-27"

random.seed(42)


def main():
    db = SessionLocal()
    try:
        year = db.query(AcademicYear).filter(AcademicYear.name == TARGET_YEAR).first()
        if year is None:
            year = AcademicYear(name=TARGET_YEAR, start_date=date(2026, 4, 1),
                                end_date=date(2027, 3, 31), is_current=True)
            db.add(year)
            db.commit()
            db.refresh(year)
            print(f"Created academic year {TARGET_YEAR}")

        # Ensure sections exist
        sections = []
        for grade in GRADES:
            for section in SECTIONS:
                cs = db.query(ClassSection).filter(
                    ClassSection.grade == grade,
                    ClassSection.section == section,
                    ClassSection.academic_year_id == year.id,
                ).first()
                if cs is None:
                    cs = ClassSection(grade=grade, section=section,
                                      class_name=f"{grade}-{section}",
                                      academic_year_id=year.id)
                    db.add(cs)
                    db.commit()
                    db.refresh(cs)
                    print(f"Created section {cs.class_name}")
                sections.append(cs)

        pwd_hash = get_password_hash(DEFAULT_PASSWORD)
        # Next admission number
        existing_adm = [s.admission_no for s in db.query(Student).all()
                        if s.admission_no and s.admission_no.startswith("BL-")]
        seq = max([int(a.rsplit("-", 1)[-1]) for a in existing_adm] or [0])

        created_students = 0
        created_users = 0
        for cs in sections:
            have = db.query(Student).filter(
                Student.class_section_id == cs.id).count()
            need = PER_SECTION - have
            if need <= 0:
                print(f"{cs.class_name}: already has {have}, skipping")
                continue
            used_names = set()
            for _ in range(need):
                seq += 1
                name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
                while name in used_names:
                    name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
                used_names.add(name)
                email = (f"{name.lower().replace(' ', '.')}.{cs.grade}{cs.section}"
                         f".{seq}@babyland.com")
                age = 5 + int(cs.grade)  # approx age by grade
                student = Student(
                    name=name,
                    email=email,
                    phone=f"98{random.randint(10000000, 99999999)}",
                    grade=cs.grade,
                    date_of_birth=date(2026 - age, random.randint(1, 12),
                                       random.randint(1, 28)),
                    address=f"{random.randint(1, 200)} School Road, Springfield",
                    enrollment_date=date(2026, 4, 1),
                    class_section_id=cs.id,
                    academic_year_id=year.id,
                    admission_no=f"BL-2026-{seq:04d}",
                    is_active=True,
                )
                db.add(student)
                db.commit()
                db.refresh(student)
                created_students += 1
                if not db.query(User).filter(User.email == email).first():
                    db.add(User(name=name, email=email, password_hash=pwd_hash,
                                role="student", student_id=student.id))
                    db.commit()
                    created_users += 1
            print(f"{cs.class_name}: topped up to {PER_SECTION}")

        total = db.query(Student).count()
        total_users = db.query(User).filter(User.role == "student").count()
        print(f"Done. students created={created_students}, "
              f"users created={created_users}, total students={total}, "
              f"total student users={total_users}")
        print(f"Student portal password for all seeded students: {DEFAULT_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
