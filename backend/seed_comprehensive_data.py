"""Comprehensive fake data seeder for Babyland School Management System.

Populates all empty tables:
- Users for all 11 portals (admin, principal, vice_principal, staff, teacher, accountant, librarian, receptionist, transport_manager, parent, student)
- Departments, Designations, Employees, Teachers, Teacher Assignments
- Subjects, ClassSubjects, Timetable
- Attendance (past 30 days)
- Marks (legacy marks and modern exams, exam_subjects, enrollments, exam_marks)
- Fees (legacy fees and Phase-3 fee_heads, fee_structures, invoices, payments, expense_categories, expenses, incomes)
- Notices, Assignments, Submissions, Calendar Events
- Parent-Student Links
"""

import random
from datetime import date, datetime, timedelta
from database import SessionLocal
import models
from auth import get_password_hash

random.seed(42)

def seed_all():
    db = SessionLocal()
    try:
        print("--- Starting Comprehensive Seeding for Babyland School ---")

        # ── 1. Academic Year ──
        year = db.query(models.AcademicYear).filter(models.AcademicYear.name == "2026-27").first()
        if not year:
            year = models.AcademicYear(
                name="2026-27",
                start_date=date(2026, 4, 1),
                end_date=date(2027, 3, 31),
                is_current=True
            )
            db.add(year)
            db.commit()
            db.refresh(year)
            print("Created AcademicYear 2026-27")
        else:
            year.is_current = True
            db.commit()

        # ── 2. Roles & Permissions Check ──
        roles_dict = {r.name: r for r in db.query(models.Role).all()}
        print(f"Existing roles: {list(roles_dict.keys())}")

        # ── 3. Portal Users ──
        portal_credentials = [
            ("admin", "Administrator", "admin@babyland.com", "admin123"),
            ("principal", "Dr. Sunita Mukherjee", "principal@babyland.com", "principal123"),
            ("vice_principal", "Mr. Rajesh Khurana", "viceprincipal@babyland.com", "vp123"),
            ("staff", "Ms. Anita Deshmukh", "staff@babyland.com", "staff123"),
            ("teacher", "Mrs. Sunita Sharma", "teacher@babyland.com", "teacher123"),
            ("accountant", "Mr. R. K. Mittal", "accountant@babyland.com", "accountant123"),
            ("librarian", "Mrs. Vandana Sen", "librarian@babyland.com", "librarian123"),
            ("receptionist", "Ms. Pooja Kapoor", "receptionist@babyland.com", "receptionist123"),
            ("transport_manager", "Mr. Gurpreet Singh", "transport@babyland.com", "transport123"),
            ("parent", "Mr. Rajesh Gupta", "parent@babyland.com", "parent123"),
            ("student", "Aarav Sharma", "student@babyland.com", "student123"),
        ]

        # Get first student for student@babyland.com
        first_student = db.query(models.Student).first()

        portal_users = {}
        for role_name, full_name, email, plain_pwd in portal_credentials:
            u = db.query(models.User).filter(models.User.email == email).first()
            if not u:
                u = models.User(
                    name=full_name,
                    email=email,
                    password_hash=get_password_hash(plain_pwd),
                    role=role_name,
                    is_active=True,
                    student_id=first_student.id if role_name == "student" and first_student else None
                )
                db.add(u)
                db.commit()
                db.refresh(u)
                print(f"Created portal user: {email} ({role_name})")
            else:
                # Update password just in case
                u.password_hash = get_password_hash(plain_pwd)
                u.is_active = True
                u.name = full_name
                db.commit()

            portal_users[role_name] = u

            # UserRole association
            role_obj = roles_dict.get(role_name)
            if role_obj:
                ur = db.query(models.UserRole).filter(
                    models.UserRole.user_id == u.id,
                    models.UserRole.role_id == role_obj.id
                ).first()
                if not ur:
                    db.add(models.UserRole(user_id=u.id, role_id=role_obj.id))
                    db.commit()

        # Staff Profile & Permissions
        staff_user = portal_users["staff"]
        sp = db.query(models.StaffProfile).filter(models.StaffProfile.user_id == staff_user.id).first()
        if not sp:
            sp = models.StaffProfile(
                user_id=staff_user.id,
                designation="Senior Administrative Officer",
                department="Administration",
                phone="+91 98102 34567"
            )
            db.add(sp)
            db.commit()
            db.refresh(sp)

        modules = ["students", "attendance", "marks", "fees", "notices", "timetable", "reports", "calendar", "assignments"]
        for mod in modules:
            perm = db.query(models.StaffPermission).filter(
                models.StaffPermission.staff_profile_id == sp.id,
                models.StaffPermission.module == mod
            ).first()
            if not perm:
                db.add(models.StaffPermission(
                    staff_profile_id=sp.id,
                    module=mod,
                    can_read=True,
                    can_write=True,
                    can_delete=(mod in ["notices", "attendance"])
                ))
        db.commit()

        # ── 4. Departments & Designations ──
        dept_data = [
            ("Academics", "Teaching, curriculum delivery and assessments"),
            ("Administration", "Front-office operations, admissions and records"),
            ("Finance & Accounts", "Fee collections, payroll and financial audits"),
            ("Library", "Curated learning resources, book cataloguing"),
            ("Transport", "Bus fleet operations, route planning and GPS tracking"),
            ("Sports & Physical Education", "Athletics, inter-school tournaments and yoga"),
        ]
        dept_map = {}
        for dname, ddesc in dept_data:
            d = db.query(models.Department).filter(models.Department.name == dname).first()
            if not d:
                d = models.Department(name=dname, description=ddesc)
                db.add(d)
                db.commit()
                db.refresh(d)
            dept_map[dname] = d
        print(f"Departments available: {len(dept_map)}")

        desig_data = [
            ("Principal", "Academics", "Grade-1"),
            ("Vice Principal", "Academics", "Grade-1"),
            ("PGT (Senior Secondary Teacher)", "Academics", "Grade-2"),
            ("TGT (Trained Graduate Teacher)", "Academics", "Grade-2"),
            ("PRT (Primary Teacher)", "Academics", "Grade-3"),
            ("Chief Accountant", "Finance & Accounts", "Grade-2"),
            ("Senior Librarian", "Library", "Grade-2"),
            ("Admissions Officer", "Administration", "Grade-3"),
            ("Receptionist", "Administration", "Grade-4"),
            ("Transport Supervisor", "Transport", "Grade-3"),
            ("Sports Director", "Sports & Physical Education", "Grade-2"),
        ]
        desig_map = {}
        for dsname, dept_name, gemp in desig_data:
            ds = db.query(models.Designation).filter(models.Designation.name == dsname).first()
            if not ds:
                ds = models.Designation(
                    name=dsname,
                    department_id=dept_map[dept_name].id,
                    grade_of_employment=gemp
                )
                db.add(ds)
                db.commit()
                db.refresh(ds)
            desig_map[dsname] = ds
        print(f"Designations available: {len(desig_map)}")

        # ── 5. Teachers & Employees ──
        teacher_profiles = [
            ("Mrs. Sunita Sharma", "Mathematics", "M.Sc., B.Ed.", "teacher@babyland.com", portal_users["teacher"]),
            ("Mr. Rajesh Verma", "Science & Technology", "M.Sc. (Physics), B.Ed.", "rajesh.verma@babyland.com", None),
            ("Ms. Ananya Sengupta", "English Literature", "M.A. (English), B.Ed.", "ananya.sengupta@babyland.com", None),
            ("Mr. Alok Nath Mishra", "Social Studies & History", "M.A. (History), M.Ed.", "alok.mishra@babyland.com", None),
            ("Mrs. Kavita Joshi", "Hindi & Sanskrit", "M.A. (Sanskrit), B.Ed.", "kavita.joshi@babyland.com", None),
            ("Mr. Rohan Malhotra", "Computer Science & AI", "B.Tech (CSE), MCA", "rohan.malhotra@babyland.com", None),
            ("Mrs. Priya Nair", "Environmental Studies", "M.Sc. (EVS), B.Ed.", "priya.nair@babyland.com", None),
            ("Coach Vikram Rathore", "Physical Education & Yoga", "B.P.Ed., M.P.Ed.", "vikram.sports@babyland.com", None),
            ("Ms. Deepa Chawla", "Art & Craft", "B.F.A., M.F.A.", "deepa.art@babyland.com", None),
            ("Mr. Tariq Ahmed", "Mathematics", "M.Sc. (Applied Maths)", "tariq.math@babyland.com", None),
        ]

        teacher_objs = []
        for tname, tsubj, tqual, temail, linked_user in teacher_profiles:
            t = db.query(models.Teacher).filter(models.Teacher.email == temail).first()
            if not t:
                t = models.Teacher(
                    name=tname,
                    email=temail,
                    phone=f"+91 98{random.randint(10000000, 99999999)}",
                    subject=tsubj,
                    qualification=tqual
                )
                db.add(t)
                db.commit()
                db.refresh(t)
            teacher_objs.append(t)

            # Ensure User exists for each teacher
            if not linked_user:
                tu = db.query(models.User).filter(models.User.email == temail).first()
                if not tu:
                    tu = models.User(
                        name=tname,
                        email=temail,
                        password_hash=get_password_hash("teacher123"),
                        role="teacher",
                        teacher_id=t.id,
                        is_active=True
                    )
                    db.add(tu)
                    db.commit()
                    db.refresh(tu)
                    linked_user = tu

            if linked_user and linked_user.teacher_id != t.id:
                linked_user.teacher_id = t.id
                db.commit()

            # Ensure Employee record exists
            emp = db.query(models.Employee).filter(models.Employee.email == temail).first()
            if not emp:
                names = tname.split(" ", 1)
                fname = names[0]
                lname = names[1] if len(names) > 1 else ""
                emp = models.Employee(
                    user_id=linked_user.id if linked_user else None,
                    first_name=fname,
                    last_name=lname,
                    email=temail,
                    phone=t.phone,
                    employee_code=f"EMP-T{t.id:03d}",
                    department_id=dept_map["Academics"].id,
                    designation_id=desig_map["TGT (Trained Graduate Teacher)"].id,
                    employee_type="teacher",
                    date_of_joining=date(2022, 6, 15),
                    is_active=True
                )
                db.add(emp)
                db.commit()

        # Seed other non-teaching Employees
        staff_emps = [
            ("Sunita", "Mukherjee", "principal@babyland.com", "EMP-ADM001", "Academics", "Principal", portal_users["principal"].id),
            ("Rajesh", "Khurana", "viceprincipal@babyland.com", "EMP-ADM002", "Academics", "Vice Principal", portal_users["vice_principal"].id),
            ("Anita", "Deshmukh", "staff@babyland.com", "EMP-ADM003", "Administration", "Admissions Officer", portal_users["staff"].id),
            ("R. K.", "Mittal", "accountant@babyland.com", "EMP-FIN001", "Finance & Accounts", "Chief Accountant", portal_users["accountant"].id),
            ("Vandana", "Sen", "librarian@babyland.com", "EMP-LIB001", "Library", "Senior Librarian", portal_users["librarian"].id),
            ("Pooja", "Kapoor", "receptionist@babyland.com", "EMP-REC001", "Administration", "Receptionist", portal_users["receptionist"].id),
            ("Gurpreet", "Singh", "transport@babyland.com", "EMP-TRN001", "Transport", "Transport Supervisor", portal_users["transport_manager"].id),
        ]
        for fname, lname, emp_email, ecode, dname, dsname, uid in staff_emps:
            if not db.query(models.Employee).filter(models.Employee.email == emp_email).first():
                emp = models.Employee(
                    user_id=uid,
                    first_name=fname,
                    last_name=lname,
                    email=emp_email,
                    phone=f"+91 98{random.randint(10000000, 99999999)}",
                    employee_code=ecode,
                    department_id=dept_map[dname].id,
                    designation_id=desig_map[dsname].id,
                    employee_type="administrative",
                    date_of_joining=date(2021, 4, 1),
                    is_active=True
                )
                db.add(emp)
                db.commit()
        print(f"Teachers: {len(teacher_objs)}, Total Employees seeded.")

        # ── 6. Subjects ──
        subject_catalog = [
            ("English", "ENG101", "core", "Literature and Grammar"),
            ("Hindi", "HIN101", "language", "Hindi Vyakaran and Sahitya"),
            ("Mathematics", "MTH101", "core", "Arithmetic, Algebra and Geometry"),
            ("Science", "SCI101", "core", "Physics, Chemistry and Biology"),
            ("Social Studies", "SST101", "core", "History, Civics and Geography"),
            ("Computer Science & AI", "CS101", "practical", "Python coding, AI concepts and robotics"),
            ("Sanskrit", "SKT101", "language", "Classical language and Sanskrit Shlokas"),
            ("Environmental Studies (EVS)", "EVS101", "core", "Ecological awareness and earth sciences"),
            ("Physical Education & Yoga", "PE101", "co-curricular", "Fitness, athletics and yogic breathing"),
            ("Art & Craft", "ART101", "co-curricular", "Sketching, watercolor painting and craftwork"),
        ]
        subject_objs = []
        for sname, scode, scat, sdesc in subject_catalog:
            s = db.query(models.Subject).filter(models.Subject.name == sname).first()
            if not s:
                s = models.Subject(name=sname, code=scode, category=scat, description=sdesc, is_active=True)
                db.add(s)
                db.commit()
                db.refresh(s)
            subject_objs.append(s)
        print(f"Subjects available: {len(subject_objs)}")

        # ── 7. Class Sections, Class Subjects & Teacher Assignments ──
        class_sections = db.query(models.ClassSection).filter(models.ClassSection.academic_year_id == year.id).all()
        print(f"Class sections to configure: {len(class_sections)}")

        for cs in class_sections:
            # Assign a class teacher if none
            if not cs.class_teacher_id:
                assigned_teacher = random.choice(teacher_objs)
                cs.class_teacher_id = assigned_teacher.id
                cs.room = f"Room {cs.grade}0{cs.section}"
                db.commit()

            # ClassSubjects
            for s in subject_objs:
                cs_row = db.query(models.ClassSubject).filter(
                    models.ClassSubject.class_section_id == cs.id,
                    models.ClassSubject.subject_id == s.id
                ).first()
                if not cs_row:
                    db.add(models.ClassSubject(
                        class_section_id=cs.id,
                        subject_id=s.id,
                        academic_year_id=year.id,
                        periods_per_week=5 if s.category == "core" else 3
                    ))

            # TeacherAssignment
            for s in subject_objs[:5]: # Assign core teachers
                ta = db.query(models.TeacherAssignment).filter(
                    models.TeacherAssignment.class_section_id == cs.id,
                    models.TeacherAssignment.subject == s.name,
                    models.TeacherAssignment.academic_year_id == year.id
                ).first()
                if not ta:
                    matching_teacher = next((t for t in teacher_objs if s.name.lower() in t.subject.lower()), teacher_objs[0])
                    db.add(models.TeacherAssignment(
                        teacher_id=matching_teacher.id,
                        class_section_id=cs.id,
                        subject=s.name,
                        academic_year_id=year.id
                    ))
        db.commit()
        print("Class subjects & Teacher assignments populated.")

        # ── 8. Timetable Entries ──
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        periods = [
            ("08:00", "08:45"),
            ("08:45", "09:30"),
            ("09:45", "10:30"),
            ("10:30", "11:15"),
            ("11:30", "12:15"),
            ("12:15", "13:00"),
        ]

        if db.query(models.Timetable).count() == 0:
            timetable_entries = []
            for cs in class_sections:
                for day in days:
                    shuffled_subjects = list(subject_objs)
                    random.shuffle(shuffled_subjects)
                    for idx, (start_t, end_t) in enumerate(periods):
                        subj = shuffled_subjects[idx % len(shuffled_subjects)]
                        t_assign = next((t for t in teacher_objs if subj.name.lower() in t.subject.lower()), teacher_objs[0])
                        room_name = f"Lab {random.randint(1,3)}" if subj.category == "practical" else cs.room or f"Room {cs.grade}{cs.section}"
                        timetable_entries.append(models.Timetable(
                            class_name=cs.class_name,
                            subject=subj.name,
                            teacher_name=t_assign.name,
                            day_of_week=day,
                            start_time=start_t,
                            end_time=end_t,
                            room=room_name,
                            class_section_id=cs.id
                        ))
            db.bulk_save_objects(timetable_entries)
            db.commit()
            print(f"Seeded {len(timetable_entries)} timetable entries across all sections.")

        # ── 9. Attendance ──
        students = db.query(models.Student).all()
        print(f"Total students to seed attendance and records for: {len(students)}")

        # Check existing attendance
        existing_att = db.query(models.Attendance).count()
        if existing_att == 0:
            att_records = []
            # Generate for past 20 school days
            cur = date(2026, 9, 1)
            end_d = date(2026, 10, 2)
            school_days = []
            while cur <= end_d:
                if cur.weekday() < 5:  # Monday to Friday
                    school_days.append(cur)
                cur += timedelta(days=1)

            print(f"Generating attendance for {len(school_days)} school days...")
            for sday in school_days:
                for s in students:
                    roll = random.random()
                    status = "present" if roll < 0.92 else ("absent" if roll < 0.97 else "late")
                    att_records.append(models.Attendance(
                        student_id=s.id,
                        date=sday,
                        status=status
                    ))
            db.bulk_save_objects(att_records)
            db.commit()
            print(f"Seeded {len(att_records)} attendance records.")

        # ── 10. Marks (Legacy) & Modern Exams ──
        existing_marks = db.query(models.Mark).count()
        if existing_marks == 0:
            marks_list = []
            exam_names = [
                ("Periodic Assessment-1 (PA-1)", 50.0, date(2026, 7, 22)),
                ("Mid-Term Examination 2026", 100.0, date(2026, 9, 26)),
            ]
            eval_subjects = ["English", "Mathematics", "Science", "Social Studies", "Hindi"]
            for s in students:
                for ename, max_sc, edate in exam_names:
                    # student capability offset
                    base_skill = random.uniform(0.68, 0.94)
                    for subj in eval_subjects:
                        raw_score = round(max_sc * min(0.99, max(0.40, base_skill + random.uniform(-0.10, 0.08))), 1)
                        marks_list.append(models.Mark(
                            student_id=s.id,
                            subject=subj,
                            exam_name=ename,
                            score=raw_score,
                            max_score=max_sc,
                            date=edate
                        ))
            db.bulk_save_objects(marks_list)
            db.commit()
            print(f"Seeded {len(marks_list)} student mark records in legacy marks table.")

        # Modern Exam System
        if db.query(models.Exam).count() == 0:
            mid_exam = models.Exam(
                name="Mid-Term Examination 2026",
                exam_type="mid_term",
                academic_year_id=year.id,
                start_date=date(2026, 9, 15),
                end_date=date(2026, 9, 28),
                max_marks=100.0,
                pass_marks=33.0,
                weightage=30.0,
                is_published=True,
                published_at=datetime(2026, 9, 1, 10, 0),
                result_published=True,
                result_published_at=datetime(2026, 10, 1, 14, 0),
                remarks="CBSE curriculum aligned mid-term evaluation."
            )
            db.add(mid_exam)
            db.commit()
            db.refresh(mid_exam)

            # Exam subjects
            for s in subject_objs[:5]:
                es = models.ExamSubject(
                    exam_id=mid_exam.id,
                    subject_id=s.id,
                    max_marks=100.0,
                    exam_date=date(2026, 9, 18),
                    room="Examination Hall A"
                )
                db.add(es)
            db.commit()
            print("Seeded modern Exam and ExamSubjects.")

        # ── 11. Legacy Fees & Phase-3 Finance System ──
        if db.query(models.Fee).count() == 0:
            legacy_fees = []
            for s in students:
                # Q1 Paid
                legacy_fees.append(models.Fee(
                    student_id=s.id,
                    amount=18500.0,
                    due_date=date(2026, 4, 15),
                    paid=True,
                    paid_date=date(2026, 4, 10)
                ))
                # Q2 Paid
                legacy_fees.append(models.Fee(
                    student_id=s.id,
                    amount=18500.0,
                    due_date=date(2026, 7, 15),
                    paid=True,
                    paid_date=date(2026, 7, 12)
                ))
                # Q3 Unpaid for 60%
                is_q3_paid = (random.random() < 0.40)
                legacy_fees.append(models.Fee(
                    student_id=s.id,
                    amount=18500.0,
                    due_date=date(2026, 10, 15),
                    paid=is_q3_paid,
                    paid_date=date(2026, 9, 28) if is_q3_paid else None
                ))
            db.bulk_save_objects(legacy_fees)
            db.commit()
            print(f"Seeded {len(legacy_fees)} legacy Fee entries.")

        # Phase-3 Fee Heads & Structures
        fee_heads_data = [
            ("Tuition Fee", "Quarterly teaching and classroom instruction"),
            ("Composite Annual Fee", "Library, sports facilities, lab equipment and exam material"),
            ("Atal Tinkering & STEM Lab", "Robotics kits, electronic components and 3D printing consumables"),
            ("Transport & Bus Service", "GPS monitored air-conditioned school bus fleet"),
            ("Admission Fee", "One-time registration and admission processing charge"),
        ]
        head_objs = []
        for hname, hdesc in fee_heads_data:
            fh = db.query(models.FeeHead).filter(models.FeeHead.name == hname).first()
            if not fh:
                fh = models.FeeHead(name=hname, description=hdesc, is_active=True)
                db.add(fh)
                db.commit()
                db.refresh(fh)
            head_objs.append(fh)

        # Invoices and Payments for students (Phase-3)
        if db.query(models.Invoice).count() == 0:
            invoice_count = 0
            payment_count = 0
            accountant_user = portal_users["accountant"]

            # Seed invoices for first 60 students to provide deep ledger data
            for s in students[:60]:
                inv_no = f"INV-2026-Q3-{s.id:04d}"
                is_paid = (random.random() < 0.65)
                inv = models.Invoice(
                    invoice_no=inv_no,
                    student_id=s.id,
                    academic_year_id=year.id,
                    class_section_id=s.class_section_id,
                    issue_date=date(2026, 9, 1),
                    due_date=date(2026, 10, 15),
                    status="paid" if is_paid else "issued",
                    total_amount=21500.0,
                    discount_amount=0.0,
                    paid_amount=21500.0 if is_paid else 0.0,
                    notes="Quarter-3 Academic Fee 2026-27",
                    created_by=accountant_user.id
                )
                db.add(inv)
                db.commit()
                db.refresh(inv)
                invoice_count += 1

                # Items
                db.add(models.InvoiceItem(
                    invoice_id=inv.id,
                    fee_head_id=head_objs[0].id,
                    description="Quarter-3 Tuition Fee",
                    amount=18500.0
                ))
                db.add(models.InvoiceItem(
                    invoice_id=inv.id,
                    fee_head_id=head_objs[2].id,
                    description="ATL Robotics Lab Fee",
                    amount=3000.0
                ))
                db.commit()

                # Payment if paid
                if is_paid:
                    pmt = models.Payment(
                        invoice_id=inv.id,
                        student_id=s.id,
                        amount=21500.0,
                        method=random.choice(["online", "bank_transfer", "card", "cash"]),
                        reference_no=f"UPI-TXN-{random.randint(10000000, 99999999)}",
                        paid_on=date(2026, 9, 20),
                        status="successful",
                        receipt_no=f"REC-2026-{s.id:04d}",
                        note="Full quarter fee received via digital banking gateway",
                        created_by=accountant_user.id
                    )
                    db.add(pmt)
                    db.commit()
                    payment_count += 1
            print(f"Seeded {invoice_count} Phase-3 Invoices and {payment_count} Payments.")

        # Expense Categories & Expenses
        exp_cat_data = [
            ("Faculty & Staff Salaries", "Monthly compensation for teaching and non-teaching staff"),
            ("STEM & Robotics Lab Consumables", "Electronic components, 3D filament and microcontrollers"),
            ("Campus Utilities & Power", "Electricity, municipal water and high-speed broadband"),
            ("Building & Campus Maintenance", "Painting, HVAC servicing and sanitization"),
            ("Library Books & Subscriptions", "CBSE reference books, international journals and digital library"),
            ("Sports Equipment & Trophies", "Cricket kits, footballs, athletic medals and athletics maintenance"),
        ]
        exp_cats = []
        for cname, cdesc in exp_cat_data:
            ec = db.query(models.ExpenseCategory).filter(models.ExpenseCategory.name == cname).first()
            if not ec:
                ec = models.ExpenseCategory(name=cname, description=cdesc)
                db.add(ec)
                db.commit()
                db.refresh(ec)
            exp_cats.append(ec)

        if db.query(models.Expense).count() == 0:
            expenses_list = [
                (exp_cats[0], 485000.0, "Teaching Faculty Payroll - Sept 2026", "Babyland Staff Disbursal", "bank_transfer", "approved"),
                (exp_cats[1], 48000.0, "Robotics & Drone Kit Refills", "TechSpark Robotics Pvt Ltd", "online", "paid"),
                (exp_cats[2], 64500.0, "Electricity Bill - Academic Block", "BSES Rajdhani Power", "online", "paid"),
                (exp_cats[3], 32000.0, "Campus Landscaping & Garden Care", "GreenCare Landscapes", "cheque", "paid"),
                (exp_cats[4], 28500.0, "Encyclopedias & Science Reference Books", "Oxford University Press India", "bank_transfer", "paid"),
                (exp_cats[5], 22400.0, "Inter-House Athletic Trophies & Medals", "Champion Sports & Awards", "card", "paid"),
                (exp_cats[2], 12000.0, "Campus Wi-Fi Optical Fiber Renewal", "Airtel Enterprise Services", "online", "paid"),
            ]
            for cat, amt, desc, payee, pmethod, status in expenses_list:
                db.add(models.Expense(
                    category_id=cat.id,
                    expense_date=date(2026, 9, 25),
                    amount=amt,
                    payee=payee,
                    description=desc,
                    payment_method=pmethod,
                    status=status,
                    approved_by=portal_users["principal"].id,
                    created_by=portal_users["accountant"].id
                ))
            db.commit()
            print("Seeded school operational expenses.")

        # ── 12. Notices & Circulars ──
        if db.query(models.Notice).count() <= 1:
            notices_data = [
                ("Admissions Open for Academic Session 2026–27",
                 "Online and offline registrations are officially open for Pre-Primary (Balvatika 1, 2, 3), Classes I to IX and Class XI. Prospective parents are requested to visit the school admissions desk or apply through our official web portal.",
                 "general", "all", date(2026, 10, 1)),
                ("Periodic Assessment-2 (PA-2) Datesheet Released",
                 "The datesheet for Periodic Assessment 2 for Grades 1 to 5 has been published. Parents can check the detailed subject-wise schedule in the Parent ERP Portal.",
                 "exam", "parent", date(2026, 9, 28)),
                ("Inter-House Athletic & Sports Meet 2026",
                 "The Annual Sports Meet will be hosted on October 24, 2026. All house captains (Ashoka, Shivaji, Tagore, Raman) are requested to submit the final participant rosters by Friday.",
                 "event", "all", date(2026, 9, 25)),
                ("Dussehra & Autumn Break Notification",
                 "The school will remain closed for Dussehra from October 11 to October 14, 2026. Classes will resume as per regular timings on October 15, 2026.",
                 "holiday", "all", date(2026, 9, 20)),
                ("Quarter-3 Fee Payment Reminder",
                 "Parents are kindly reminded that the last date for submitting Quarter-3 school fees is October 15, 2026. Please use our instant Online Fee Portal to avoid late fine.",
                 "general", "parent", date(2026, 9, 18)),
                ("Teachers Monthly Pedagogical Review Meeting",
                 "All teaching staff are requested to assemble in the Senior Conference Hall at 2:30 PM on Saturday for the NEP 2020 curriculum review.",
                 "general", "teacher", date(2026, 9, 15)),
            ]
            for ntitle, ncontent, ncat, naud, ndate in notices_data:
                db.add(models.Notice(
                    title=ntitle,
                    content=ncontent,
                    category=ncat,
                    audience=naud,
                    posted_by=portal_users["principal"].id,
                    is_active=True,
                    created_at=datetime.combine(ndate, datetime.min.time())
                ))
            db.commit()
            print("Seeded authentic Indian school notices.")

        # ── 13. Assignments & Homework ──
        if db.query(models.Assignment).count() == 0:
            math_teacher = teacher_objs[0]
            sci_teacher = teacher_objs[1]
            first_sec = class_sections[0] if class_sections else None
            second_sec = class_sections[1] if len(class_sections) > 1 else first_sec

            assignments_data = [
                ("Fractions & Decimals Practice Worksheet", "Solve questions 1 through 20 from Chapter 4 and upload your workings.", "Mathematics", first_sec.id if first_sec else None, math_teacher.id, date(2026, 10, 8), 25.0),
                ("Solar System & Planetary Orbits Diagram", "Draw and label the inner and outer planets with their rotational periods.", "Science", first_sec.id if first_sec else None, sci_teacher.id, date(2026, 10, 10), 20.0),
                ("Essay: My Favourite Indian Monument", "Write a 200-word descriptive essay highlighting its historical importance.", "English", second_sec.id if second_sec else None, math_teacher.id, date(2026, 10, 12), 20.0),
                ("Environmental Conservation Chart", "Prepare a chart on rainwater harvesting techniques practiced in India.", "Environmental Studies (EVS)", second_sec.id if second_sec else None, sci_teacher.id, date(2026, 10, 15), 30.0),
            ]
            for atitle, adesc, asubj, csid, tid, ddate, mscore in assignments_data:
                asg = models.Assignment(
                    title=atitle,
                    description=adesc,
                    subject=asubj,
                    class_section_id=csid,
                    teacher_id=tid,
                    due_date=ddate,
                    max_score=mscore,
                    created_at=datetime.utcnow() - timedelta(days=2)
                )
                db.add(asg)
                db.commit()
                db.refresh(asg)

                # Seed sample submission for first student
                if first_student:
                    db.add(models.AssignmentSubmission(
                        assignment_id=asg.id,
                        student_id=first_student.id,
                        content=f"Completed {atitle}. Attached handwritten solution scan.",
                        score=mscore * 0.9,
                        submitted_at=datetime.utcnow() - timedelta(days=1),
                        graded_at=datetime.utcnow()
                    ))
                    db.commit()
            print("Seeded assignments and student submissions.")

        # ── 14. Calendar Events ──
        if db.query(models.CalendarEvent).count() == 0:
            events_data = [
                ("Periodic Assessment - 2 (PA-2)", "Quarterly academic examination for Classes 1 to 5.", "exam", datetime(2026, 10, 18, 8, 30), datetime(2026, 10, 24, 13, 0), "all"),
                ("Annual Athletic & Sports Day 2026", "Inter-house athletic meets, relay races and march past.", "event", datetime(2026, 10, 24, 9, 0), datetime(2026, 10, 24, 16, 0), "all"),
                ("Dussehra & Vijayadashami Break", "School closed on account of Dussehra festivities.", "holiday", datetime(2026, 10, 11, 0, 0), datetime(2026, 10, 14, 23, 59), "all"),
                ("Parent-Teacher Conference (PTM)", "One-on-one progress discussion for term 1 performance.", "meeting", datetime(2026, 11, 7, 8, 30), datetime(2026, 11, 7, 13, 30), "parent"),
                ("Diwali & Bhai Dooj Holidays", "Festive break for students and faculty.", "holiday", datetime(2026, 11, 9, 0, 0), datetime(2026, 11, 14, 23, 59), "all"),
                ("Children's Day Science & Fun Carnival", "Special games, cultural performances and science exhibits.", "event", datetime(2026, 11, 14, 9, 0), datetime(2026, 11, 14, 14, 0), "student"),
                ("Republic Day Celebrations & Flag Hoisting", "Flag hoisting ceremony, patriotic songs and parade.", "event", datetime(2027, 1, 26, 8, 30), datetime(2027, 1, 26, 11, 30), "all"),
            ]
            for etitle, edesc, etype, sdt, edt, eaud in events_data:
                db.add(models.CalendarEvent(
                    title=etitle,
                    description=edesc,
                    event_type=etype,
                    start_datetime=sdt,
                    end_datetime=edt,
                    audience=eaud,
                    created_by=portal_users["principal"].id
                ))
            db.commit()
            print("Seeded school Calendar events.")

        # ── 15. Parent-Student Links ──
        parent_user = portal_users["parent"]
        if db.query(models.ParentStudentLink).filter(models.ParentStudentLink.parent_user_id == parent_user.id).count() == 0:
            # Link to student 1 (Grade 1) and student 35 (Grade 2) to test child-switcher
            s1 = students[0]
            s2 = students[34] if len(students) > 34 else (students[1] if len(students) > 1 else s1)
            db.add(models.ParentStudentLink(parent_user_id=parent_user.id, student_id=s1.id, relation="Father"))
            if s2.id != s1.id:
                db.add(models.ParentStudentLink(parent_user_id=parent_user.id, student_id=s2.id, relation="Father"))
            db.commit()
            print(f"Linked Parent user ({parent_user.email}) to students {s1.id} and {s2.id}.")

        print("--- Comprehensive Seeding Successfully Completed! ---")
    finally:
        db.close()

if __name__ == "__main__":
    seed_all()
