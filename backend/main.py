"""Main FastAPI application for the school management system."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import engine, Base, SessionLocal
from routers import students, teachers, attendance, marks, fees, timetable, auth, notices, reports
from routers import structure, people, engagement, finance, academics
from routers import exams as exams_router
from auth import get_password_hash
from models import User

# Create all database tables on startup (covers brand-new tables; columns on
# existing tables are handled by run_phase1_migration below).
Base.metadata.create_all(bind=engine)


def run_phase1_migration():
    """One-shot, idempotent Phase-1 migration.

    Adds new nullable columns to existing tables (PRAGMA-guarded ALTER TABLE),
    then backfills: ensures a current AcademicYear, creates one ClassSection per
    distinct Student.grade, links students to their section, and defaults
    notices.audience to 'all'. Safe to re-run; never modifies existing values
    besides filling new NULL columns. Logs counts via print.
    """
    from models import AcademicYear, ClassSection, Notice, Student

    db = SessionLocal()
    try:
        # ── 1. Additive columns on existing tables ──
        def existing_columns(table: str) -> set:
            with engine.connect() as conn:
                rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            return {r[1] for r in rows}

        pending = {
            "users": [("is_active", "ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1")],
            "students": [
                ("class_section_id", "ALTER TABLE students ADD COLUMN class_section_id INTEGER REFERENCES class_sections(id)"),
                ("academic_year_id", "ALTER TABLE students ADD COLUMN academic_year_id INTEGER REFERENCES academic_years(id)"),
                ("admission_no", "ALTER TABLE students ADD COLUMN admission_no VARCHAR(50)"),
                ("is_active", "ALTER TABLE students ADD COLUMN is_active BOOLEAN DEFAULT 1"),
            ],
            "notices": [
                ("audience", "ALTER TABLE notices ADD COLUMN audience VARCHAR(20) DEFAULT 'all'"),
                ("class_section_id", "ALTER TABLE notices ADD COLUMN class_section_id INTEGER REFERENCES class_sections(id)"),
            ],
            "timetable": [
                ("class_section_id", "ALTER TABLE timetable ADD COLUMN class_section_id INTEGER REFERENCES class_sections(id)"),
            ],
        }
        added = 0
        with engine.begin() as conn:
            for table, cols in pending.items():
                have = existing_columns(table)
                for name, ddl in cols:
                    if name not in have:
                        conn.execute(text(ddl))
                        added += 1
        print(f"Phase-1 migration: {added} column(s) added.")

        # ── 2. Ensure current academic year ──
        year = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()  # noqa: E712
        if year is None:
            year = db.query(AcademicYear).filter(AcademicYear.name == "2026-27").first()
            if year is None:
                year = AcademicYear(name="2026-27", is_current=True)
                db.add(year)
                db.commit()
                db.refresh(year)
                print("Phase-1 migration: created AcademicYear 2026-27 (current).")
            else:
                year.is_current = True
                db.commit()
                print("Phase-1 migration: marked AcademicYear 2026-27 as current.")
        else:
            print(f"Phase-1 migration: current AcademicYear already '{year.name}'.")

        # ── 3. One ClassSection per distinct student grade ──
        grades = sorted({r[0] for r in db.query(Student.grade).distinct().all() if r[0]})
        sections_made = 0
        for grade in grades:
            exists = (
                db.query(ClassSection)
                .filter(ClassSection.grade == grade,
                        ClassSection.section == "A",
                        ClassSection.academic_year_id == year.id)
                .first()
            )
            if exists is None:
                exists = ClassSection(grade=grade, section="A", class_name=f"{grade}-A",
                                      academic_year_id=year.id)
                db.add(exists)
                db.commit()
                db.refresh(exists)
                sections_made += 1
        print(f"Phase-1 migration: {sections_made} ClassSection(s) created; {len(grades)} distinct grade(s).")

        # ── 4. Link students missing a section ──
        linked = 0
        unsectioned = db.query(Student).filter(Student.class_section_id.is_(None)).all()
        for student in unsectioned:
            section = (
                db.query(ClassSection)
                .filter(ClassSection.grade == student.grade,
                        ClassSection.academic_year_id == year.id)
                .first()
            )
            if section is not None:
                student.class_section_id = section.id
                if student.academic_year_id is None:
                    student.academic_year_id = year.id
                linked += 1
        db.commit()
        print(f"Phase-1 migration: {linked} student(s) linked to class sections.")

        # ── 5. Default notices audience ──
        nulled = (
            db.query(Notice)
            .filter(Notice.audience.is_(None))
            .update({"audience": "all"}, synchronize_session=False)
        )
        db.commit()
        print(f"Phase-1 migration: {nulled} notice(s) defaulted to audience='all'.")
    finally:
        db.close()


def run_phase2_migration():
    """Phase-2 hardening migration (idempotent, additive only)."""
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "uq_attendance_student_date ON attendance (student_id, date)"
            ))
        print("Phase-2 migration: attendance unique index ensured.")
    except Exception as exc:
        print(f"Phase-2 migration skipped: {exc}")


def run_phase3_migration():
    """Phase-3 foundation migration: RBAC + academic/HR catalogue backfill.

    Idempotent and insert-only: it never overwrites an existing permission, role,
    role-permission, user-role or grade row, so admin edits survive every boot.

    Seeds:
      1. the (module, action) permission catalogue,
      2. the 10 system roles and their role-permission grants,
      3. UserRole rows for every existing user (from users.role),
      4. Grade rows "1".."12".
    """
    from models import (
        Grade, Permission, Role, RolePermission, User, UserRole,
    )
    from schemas import PERMISSION_ACTIONS, PERMISSION_MODULES

    db = SessionLocal()
    try:
        # ── 1. Additive columns on existing tables (PRAGMA-guarded ALTER TABLE) ──
        #    New Phase-1 tables are created by Base.metadata.create_all() above, so
        #    no DDL is strictly required. This dict stays as the extension point and
        #    guarantees any future Phase-3 column addition is applied safely.
        def existing_columns(table: str) -> set:
            with engine.connect() as conn:
                rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            return {r[1] for r in rows}

        pending: dict = {
            "users": [],          # users.role is VARCHAR(20); longest new role is
                                 # "transport_manager" (17 chars) — fits, no rebuild.
            "grades": [],
            "roles": [],
        }
        added = 0
        with engine.begin() as conn:
            for table, cols in pending.items():
                have = existing_columns(table)
                for name, ddl in cols:
                    if name not in have:
                        conn.execute(text(ddl))
                        added += 1
        print(f"Phase-3 migration: {added} column(s) added.")

        # ── 2. Permission catalogue ──
        perms_added = 0
        for module in PERMISSION_MODULES:
            for action in PERMISSION_ACTIONS:
                # dashboard is read-only.
                if module == "dashboard" and action != "read":
                    continue
                exists = (
                    db.query(Permission)
                    .filter(Permission.module == module, Permission.action == action)
                    .first()
                )
                if exists is None:
                    db.add(Permission(
                        module=module,
                        action=action,
                        description=f"{action.capitalize()} access to {module}",
                    ))
                    perms_added += 1
        db.commit()
        total_perms = db.query(Permission).count()
        print(f"Phase-3 migration: {perms_added} permission(s) inserted; {total_perms} total.")

        # ── 3. System roles + role-permission grants ──
        R, W, C, D, X = "read", "write", "create", "delete", "export"
        all_modules = list(PERMISSION_MODULES)
        academic = ("classes", "subjects", "attendance", "marks", "exams",
                    "assignments", "timetable", "calendar", "notices", "students", "teachers")
        non_audit = [m for m in all_modules if m != "audit"]

        def build_grants(role: str) -> set:
            """Return the set of (module, action) tuples granted to a role."""
            out = set()
            if role == "admin":
                return {(m, a) for m in all_modules for a in PERMISSION_ACTIONS
                        if not (m == "dashboard" and a != "read")}
            if role == "principal":
                for m in non_audit:
                    out.add((m, R))
                    out.add((m, W))
                    out.add((m, X))
                for m in academic:
                    out.add((m, C))
                return out
            if role == "vice_principal":
                for m in all_modules:
                    out.add((m, R))
                for m in academic:
                    out.add((m, W))
                for m in ("notices", "calendar"):
                    out.add((m, X))
                return out
            if role == "staff":
                for m in all_modules:
                    if m in ("fees", "finance", "invoices", "audit"):
                        continue
                    out.add((m, R))
                for m in ("students", "notices", "fees"):
                    out.update({(m, R), (m, W)})
                out.update({("students", "export"), ("fees", "export"), ("reports", "export")})
                return out
            if role == "teacher":
                for m in ("students", "classes", "subjects", "attendance", "marks",
                          "assignments", "timetable", "notices", "reports"):
                    out.add((m, R))
                for m in ("attendance", "marks", "assignments"):
                    out.update({(m, R), (m, W)})
                return out
            if role == "accountant":
                for m in ("finance", "invoices", "fees"):
                    out.update({(m, R), (m, W), (m, X)})
                out.add(("students", R))
                return out
            if role == "librarian":
                out.update({("library", R), ("library", W), ("library", C),
                            ("inventory", R), ("inventory", W)})
                out.add(("students", R))
                return out
            if role == "receptionist":
                out.update({("students", R), ("students", C), ("students", W)})
                out.update({("notices", R), ("notices", W)})
                out.add(("dashboard", R))
                return out
            if role == "transport_manager":
                out.update({("transport", R), ("transport", W), ("transport", C)})
                out.add(("students", R))
                out.add(("dashboard", R))
                return out
            # student / parent: own-data read only
            for m in ("dashboard", "students", "classes", "subjects", "attendance",
                      "marks", "assignments", "timetable", "calendar", "notices", "fees"):
                out.add((m, R))
            return out

        role_defs = {
            "admin": "Full system access",
            "principal": "School-wide oversight: all read, most write",
            "vice_principal": "Academics oversight: read all, write on academics",
            "staff": "General staff: read most modules, write students/notices/fees",
            "teacher": "Teacher: academics read, write attendance/marks/assignments",
            "accountant": "Accounts: finance/invoices/fees read+write+export",
            "librarian": "Library: library and inventory read+write",
            "receptionist": "Front desk: students and notices",
            "transport_manager": "Transport module management",
            "student": "Student portal: own data read only",
            "parent": "Parent portal: own ward's data read only",
        }

        roles_added = 0
        grants_added = 0
        perm_index = {(m, a): p for m, a, p in
                      db.query(Permission.module, Permission.action, Permission.id).all()}

        for name, description in role_defs.items():
            role = db.query(Role).filter(Role.name == name).first()
            if role is None:
                role = Role(name=name, description=description, is_system=True)
                db.add(role)
                db.commit()
                db.refresh(role)
                roles_added += 1
            elif not role.description:
                # Backfill a missing description without touching admin edits.
                role.description = description
                db.commit()

            existing = {
                r[0] for r in
                db.query(RolePermission.permission_id)
                .filter(RolePermission.role_id == role.id).all()
            }
            for key in build_grants(name):
                perm_id = perm_index.get(key)
                if perm_id is None or perm_id in existing:
                    continue
                db.add(RolePermission(role_id=role.id, permission_id=perm_id))
                existing.add(perm_id)
                grants_added += 1
            db.commit()

        total_roles = db.query(Role).count()
        total_grants = db.query(RolePermission).count()
        print(f"Phase-3 migration: {roles_added} role(s) inserted, "
              f"{grants_added} role-permission(s) inserted; "
              f"{total_roles} roles / {total_grants} role-permissions total.")

        # ── 4. Backfill UserRole from the primary users.role ──
        links_added = 0
        for user in db.query(User).all():
            if not user.role:
                continue
            role = db.query(Role).filter(Role.name == user.role).first()
            if role is None:
                continue
            exists = (
                db.query(UserRole)
                .filter(UserRole.user_id == user.id, UserRole.role_id == role.id)
                .first()
            )
            if exists is None:
                db.add(UserRole(user_id=user.id, role_id=role.id))
                links_added += 1
        db.commit()
        total_links = db.query(UserRole).count()
        print(f"Phase-3 migration: {links_added} user-role(s) inserted; {total_links} total.")

        # ── 5. Grade catalogue "1".."12" ──
        grades_added = 0
        for order in range(1, 13):
            name = str(order)
            exists = db.query(Grade).filter(Grade.name == name).first()
            if exists is None:
                db.add(Grade(name=name, display_order=order,
                             description=f"Grade {name}"))
                grades_added += 1
        db.commit()
        total_grades = db.query(Grade).count()
        print(f"Phase-3 migration: {grades_added} grade(s) inserted; {total_grades} total.")
    finally:
        db.close()


def run_phase4_seed():
    """Phase-2 exams seed: default grade-scale bands. Idempotent, insert-only.

    Seeds the seven default CBSE bands (A+ >=90, A 80-90, B+ 70-80, B 60-70,
    C 50-60, D 40-50, F <40 with grade points 10/9/8/7/6/5/0) keyed on the
    ``(name, min_percentage)`` unique constraint, so re-running never duplicates
    a band and never overwrites an admin's edits.

    ``grade_scales`` is a NEW table, so create_all() above has already made it;
    no DDL is required here.
    """
    db = SessionLocal()
    try:
        added = exams_router.seed_default_grade_scales(db)
        from models import GradeScale
        total = db.query(GradeScale).count()
        print(f"Phase-4 exams seed: {added} grade-scale band(s) inserted; {total} total.")
    finally:
        db.close()


run_phase1_migration()
run_phase2_migration()
run_phase3_migration()
run_phase4_seed()

app = FastAPI(
    title="School Management System API",
    description="A prototype FastAPI backend for managing students, teachers, attendance, marks, fees, timetables, notices, and reports.",
    version="1.1.0",
)

# CORS middleware - allow localhost and production frontend
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
allowed_origins = [
    origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()
] if allowed_origins_env else ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX", r"https?://.*"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with /api prefix (existing prefixes unchanged)
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(engagement.router, prefix="/api", tags=["Engagement"])
app.include_router(students.router, prefix="/api/students", tags=["Students"])
app.include_router(teachers.router, prefix="/api/teachers", tags=["Teachers"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["Attendance"])
app.include_router(marks.router, prefix="/api/marks", tags=["Marks"])
app.include_router(fees.router, prefix="/api/fees", tags=["Fees"])
app.include_router(timetable.router, prefix="/api/timetable", tags=["Timetable"])
app.include_router(notices.router, prefix="/api/notices", tags=["Notices"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
# Phase-1 structure/people routers (trailing-slash collections inside router)
app.include_router(structure.router, prefix="/api", tags=["Structure"])
app.include_router(people.router, prefix="/api", tags=["People"])
# Phase-3 finance/accounting router (additive; legacy /api/fees/* is untouched)
app.include_router(finance.router, prefix="/api", tags=["Finance"])
# Phase-1 academics/HR/RBAC routers (trailing-slash collections inside router)
app.include_router(academics.router, prefix="/api", tags=["Academics"])
# Phase-2 exams/report-cards router (additive; legacy /api/marks/* is untouched).
# APPENDED LAST so no existing include order or route resolution changes.
app.include_router(exams_router.router, prefix="/api", tags=["Exams"])


@app.on_event("startup")
def create_default_admin():
    """Create a default admin user if no users exist in the database."""
    db = SessionLocal()
    try:
        user_count = db.query(User).count()
        if user_count == 0:
            admin_user = User(
                name="Administrator",
                email="admin@babyland.com",
                password_hash=get_password_hash("admin123"),
                role="admin",
            )
            db.add(admin_user)
            db.commit()
            print("Default admin user created: admin@babyland.com / admin123")
        # Link every user's primary role into the RBAC tables (idempotent) so a
        # freshly-seeded database also has user_roles rows.
        try:
            from models import Role, UserRole
            for user in db.query(User).all():
                if not user.role:
                    continue
                role = db.query(Role).filter(Role.name == user.role).first()
                if role is None:
                    continue
                link = (db.query(UserRole)
                        .filter(UserRole.user_id == user.id, UserRole.role_id == role.id)
                        .first())
                if link is None:
                    db.add(UserRole(user_id=user.id, role_id=role.id))
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"UserRole backfill skipped: {exc}")
    finally:
        db.close()


@app.get("/", tags=["Root"])
def read_root():
    """Root endpoint with API information."""
    return {
        "message": "Welcome to the School Management System API",
        "version": "1.1.0",
        "docs": "/docs",
        "endpoints": {
            "auth": "/api/auth",
            "students": "/api/students",
            "teachers": "/api/teachers",
            "attendance": "/api/attendance",
            "marks": "/api/marks",
            "fees": "/api/fees",
            "timetable": "/api/timetable",
            "notices": "/api/notices",
            "reports": "/api/reports",
            "academic-years": "/api/academic-years",
            "classes": "/api/classes",
            "staff": "/api/staff",
            "teacher-assignments": "/api/teacher-assignments",
            "parent-links": "/api/parent-links",
            "assignments": "/api/assignments",
            "calendar": "/api/calendar",
            "audit": "/api/audit",
            "finance": {
                "fee-heads": "/api/fee-heads/",
                "fee-structures": "/api/fee-structures/",
                "discounts": "/api/discounts/",
                "scholarships": "/api/scholarships/",
                "student-scholarships": "/api/student-scholarships/",
                "invoices": "/api/invoices/",
                "payments": "/api/payments/",
                "fines": "/api/fines/",
                "refunds": "(via POST /api/payments/{id}/refund)",
                "expense-categories": "/api/expense-categories/",
                "expenses": "/api/expenses/",
                "incomes": "/api/incomes/",
                "summary": "/api/finance/summary/",
                "income-statement": "/api/finance/income-statement/",
                "outstanding": "/api/finance/outstanding/",
            },
            "subjects": "/api/subjects",
            "grades": "/api/grades",
            "class-subjects": "/api/class-subjects",
            "departments": "/api/departments",
            "designations": "/api/designations",
            "employees": "/api/employees",
            "roles": "/api/roles",
            "role-permissions": "/api/role-permissions",
            "permissions": "/api/permissions",
            "exams": {
                "exams": "/api/exams/",
                "mine": "/api/exams/mine",
                "exam-subjects": "/api/exam-subjects/",
                "exam-enrollments": "/api/exam-enrollments/",
                "exam-marks": "/api/exam-marks/",
                "grade-scales": "/api/grade-scales/",
                "report-cards": "/api/report-cards/",
                "publish": "POST /api/exams/{id}/publish",
                "results": "POST /api/exams/{id}/results",
                "results-sheet": "/api/exams/{id}/results-sheet",
                "preview": "/api/report-cards/preview/{student_id}/{exam_id}",
            },
        },
    }


@app.get("/health", tags=["Root"])
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
