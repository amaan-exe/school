"""SQLAlchemy ORM models for the school management system."""

from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Boolean, Float, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship

from database import Base


class Student(Base):
    """Represents a student enrolled in the school."""

    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, nullable=False, index=True)
    phone = Column(String(20), nullable=True)
    grade = Column(String(20), nullable=False)  # e.g., "10", "12"
    date_of_birth = Column(Date, nullable=True)
    address = Column(String(255), nullable=True)
    enrollment_date = Column(Date, nullable=False, default=date.today)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    admission_no = Column(String(50), unique=True, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    # Relationships
    attendance = relationship("Attendance", back_populates="student", cascade="all, delete-orphan")
    marks = relationship("Mark", back_populates="student", cascade="all, delete-orphan")
    fees = relationship("Fee", back_populates="student", cascade="all, delete-orphan")
    class_section = relationship("ClassSection", back_populates="students", foreign_keys=[class_section_id])
    academic_year = relationship("AcademicYear", foreign_keys=[academic_year_id])
    parent_links = relationship("ParentStudentLink", back_populates="student", cascade="all, delete-orphan")
    submissions = relationship("AssignmentSubmission", back_populates="student", cascade="all, delete-orphan")
    # Finance (Phase-3) relationships
    invoices = relationship("Invoice", back_populates="student", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="student", cascade="all, delete-orphan")
    fines = relationship("Fine", back_populates="student", cascade="all, delete-orphan")
    scholarships = relationship("StudentScholarship", back_populates="student", cascade="all, delete-orphan")


class Teacher(Base):
    """Represents a teacher working at the school."""

    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, nullable=False, index=True)
    phone = Column(String(20), nullable=True)
    subject = Column(String(100), nullable=False)
    qualification = Column(String(200), nullable=True)

    assignments = relationship("TeacherAssignment", back_populates="teacher", cascade="all, delete-orphan")
    given_assignments = relationship("Assignment", back_populates="teacher")


class Attendance(Base):
    """Represents a student's attendance record for a specific date."""

    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(String(10), nullable=False)  # present, absent, late, holiday, half_day

    __table_args__ = (UniqueConstraint("student_id", "date", name="uq_attendance_student_date"),)

    # Relationships
    student = relationship("Student", back_populates="attendance")


class Mark(Base):
    """Represents a student's mark/score for a specific exam."""

    __tablename__ = "marks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    subject = Column(String(100), nullable=False)
    exam_name = Column(String(100), nullable=False)
    score = Column(Float, nullable=False)
    max_score = Column(Float, nullable=False, default=100.0)
    date = Column(Date, nullable=False, default=date.today)

    # Relationships
    student = relationship("Student", back_populates="marks")


class Fee(Base):
    """Represents a fee record for a student."""

    __tablename__ = "fees"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Float, nullable=False)
    due_date = Column(Date, nullable=False)
    paid = Column(Boolean, nullable=False, default=False)
    paid_date = Column(Date, nullable=True)

    # Relationships
    student = relationship("Student", back_populates="fees")


class Timetable(Base):
    """Represents a timetable entry for a class."""

    __tablename__ = "timetable"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    class_name = Column(String(50), nullable=False, index=True)
    subject = Column(String(100), nullable=False)
    teacher_name = Column(String(100), nullable=False)
    day_of_week = Column(String(10), nullable=False)  # Monday, Tuesday, etc.
    start_time = Column(String(5), nullable=False)  # HH:MM format
    end_time = Column(String(5), nullable=False)  # HH:MM format
    room = Column(String(50), nullable=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True)

    class_section = relationship("ClassSection", back_populates="timetable_entries", foreign_keys=[class_section_id])


class User(Base):
    """Represents a user account in the system."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # admin, staff, teacher, student, parent
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Optional links
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)

    staff_profile = relationship("StaffProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    parent_links = relationship("ParentStudentLink", back_populates="parent", cascade="all, delete-orphan",
                                foreign_keys="ParentStudentLink.parent_user_id")
    notice_reads = relationship("NoticeRead", back_populates="user", cascade="all, delete-orphan")
    created_events = relationship("CalendarEvent", back_populates="creator", foreign_keys="CalendarEvent.created_by")
    # Finance (Phase-3) creator back-references
    created_invoices = relationship("Invoice", back_populates="creator", foreign_keys="Invoice.created_by")
    created_payments = relationship("Payment", back_populates="creator", foreign_keys="Payment.created_by")
    created_expenses = relationship("Expense", back_populates="creator", foreign_keys="Expense.created_by")
    created_incomes = relationship("Income", back_populates="creator", foreign_keys="Income.created_by")
    # Phase-1 RBAC: a user may hold MANY roles while `role` stays the primary role.
    user_roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    employee = relationship("Employee", back_populates="user", uselist=False, cascade="all, delete-orphan",
                            foreign_keys="Employee.user_id")


class Notice(Base):
    """Represents a notice or announcement posted in the system."""

    __tablename__ = "notices"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)  # general, event, exam, holiday, emergency
    posted_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    audience = Column(String(20), nullable=False, default="all")
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True)

    class_section = relationship("ClassSection", foreign_keys=[class_section_id])
    reads = relationship("NoticeRead", back_populates="notice", cascade="all, delete-orphan")


class AcademicYear(Base):
    """Represents an academic year (e.g. 2026-27)."""

    __tablename__ = "academic_years"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(20), nullable=False, unique=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_current = Column(Boolean, nullable=False, default=False)

    class_sections = relationship("ClassSection", back_populates="academic_year", cascade="all, delete-orphan")


class ClassSection(Base):
    """Represents a class section (e.g. grade 10, section A)."""

    __tablename__ = "class_sections"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    grade = Column(String(20), nullable=False)
    section = Column(String(10), nullable=False, default="A")
    class_name = Column(String(50), nullable=False, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    class_teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    room = Column(String(50), nullable=True)

    academic_year = relationship("AcademicYear", back_populates="class_sections", foreign_keys=[academic_year_id])
    class_teacher = relationship("Teacher", foreign_keys=[class_teacher_id])
    students = relationship("Student", back_populates="class_section", foreign_keys="Student.class_section_id")
    teacher_assignments = relationship("TeacherAssignment", back_populates="class_section", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="class_section", cascade="all, delete-orphan")
    timetable_entries = relationship("Timetable", back_populates="class_section", foreign_keys="Timetable.class_section_id")
    class_subjects = relationship("ClassSubject", back_populates="class_section", cascade="all, delete-orphan",
                                  foreign_keys="ClassSubject.class_section_id")


class StaffProfile(Base):
    """Extended profile for staff-role users."""

    __tablename__ = "staff_profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    designation = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)

    user = relationship("User", back_populates="staff_profile", foreign_keys=[user_id])
    permissions = relationship("StaffPermission", back_populates="staff_profile", cascade="all, delete-orphan")


class StaffPermission(Base):
    """Per-module permission grant for a staff profile."""

    __tablename__ = "staff_permissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    staff_profile_id = Column(Integer, ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False)
    module = Column(String(50), nullable=False)
    can_read = Column(Boolean, nullable=False, default=False)
    can_write = Column(Boolean, nullable=False, default=False)
    can_delete = Column(Boolean, nullable=False, default=False)

    __table_args__ = (UniqueConstraint("staff_profile_id", "module", name="uq_staff_profile_module"),)

    staff_profile = relationship("StaffProfile", back_populates="permissions")


class ParentStudentLink(Base):
    """Links a parent user to a student (ward)."""

    __tablename__ = "parent_student_links"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    parent_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    relation = Column(String(30), nullable=True)

    __table_args__ = (UniqueConstraint("parent_user_id", "student_id", name="uq_parent_student"),)

    parent = relationship("User", back_populates="parent_links", foreign_keys=[parent_user_id])
    student = relationship("Student", back_populates="parent_links", foreign_keys=[student_id])


class TeacherAssignment(Base):
    """Assigns a teacher to a class section + subject for an academic year."""

    __tablename__ = "teacher_assignments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False)
    class_section_id = Column(Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False)
    subject = Column(String(100), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint("teacher_id", "class_section_id", "subject", "academic_year_id",
                         name="uq_teacher_class_subject_year"),
    )

    teacher = relationship("Teacher", back_populates="assignments", foreign_keys=[teacher_id])
    class_section = relationship("ClassSection", back_populates="teacher_assignments", foreign_keys=[class_section_id])
    academic_year = relationship("AcademicYear", foreign_keys=[academic_year_id])


class NoticeRead(Base):
    """Tracks that a user has read a notice."""

    __tablename__ = "notice_reads"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    notice_id = Column(Integer, ForeignKey("notices.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    read_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("notice_id", "user_id", name="uq_notice_user"),)

    notice = relationship("Notice", back_populates="reads", foreign_keys=[notice_id])
    user = relationship("User", back_populates="notice_reads", foreign_keys=[user_id])


class Assignment(Base):
    """Homework/class assignment given by a teacher to a class section."""

    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    subject = Column(String(100), nullable=False)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    due_date = Column(Date, nullable=True)
    max_score = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    class_section = relationship("ClassSection", back_populates="assignments", foreign_keys=[class_section_id])
    teacher = relationship("Teacher", back_populates="given_assignments", foreign_keys=[teacher_id])
    submissions = relationship("AssignmentSubmission", back_populates="assignment", cascade="all, delete-orphan")


class AssignmentSubmission(Base):
    """A student's submission for an assignment, optionally graded."""

    __tablename__ = "assignment_submissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=True)
    file_url = Column(String(500), nullable=True)
    score = Column(Float, nullable=True)
    submitted_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    graded_at = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("assignment_id", "student_id", name="uq_assignment_student"),)

    assignment = relationship("Assignment", back_populates="submissions", foreign_keys=[assignment_id])
    student = relationship("Student", back_populates="submissions", foreign_keys=[student_id])


class CalendarEvent(Base):
    """A calendar event (holiday, exam, meeting, etc.)."""

    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    event_type = Column(String(50), nullable=False, default="general")
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=True)
    audience = Column(String(20), nullable=False, default="all")
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    class_section = relationship("ClassSection", foreign_keys=[class_section_id])
    creator = relationship("User", back_populates="created_events", foreign_keys=[created_by])


class AuditLog(Base):
    """Append-only audit record of mutating actions."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    meta_json = Column(Text, nullable=True)

    actor = relationship("User", foreign_keys=[actor_user_id])


# ═══════════════════════════════════════════════════════════════════════════════
# Phase-1 RBAC / Academic-Structure / HR models
# All of these are NEW TABLES → Base.metadata.create_all() covers them, so no
# ALTER TABLE migration is required.
# ═══════════════════════════════════════════════════════════════════════════════

#: The canonical 10-role set (widened from the original admin/staff/teacher/student/parent).
ROLES = (
    "admin", "principal", "vice_principal", "staff", "teacher",
    "accountant", "librarian", "receptionist", "transport_manager", "student", "parent",
)


class Role(Base):
    """A named role that owns a set of permissions."""

    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(50), nullable=False, unique=True, index=True)
    description = Column(String(255), nullable=True)
    is_system = Column(Boolean, nullable=False, default=True)

    role_permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    user_roles = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")


class Permission(Base):
    """A single (module, action) capability in the permission catalogue."""

    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    module = Column(String(50), nullable=False, index=True)
    action = Column(String(20), nullable=False)  # read, write, create, delete, export
    description = Column(String(255), nullable=True)

    __table_args__ = (UniqueConstraint("module", "action", name="uq_permission_module_action"),)

    role_permissions = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")


class RolePermission(Base):
    """Join row granting one Permission to one Role."""

    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),)

    role = relationship("Role", back_populates="role_permissions")
    permission = relationship("Permission", back_populates="role_permissions")


class UserRole(Base):
    """Assigns a Role to a User. `users.role` remains the PRIMARY role."""

    __tablename__ = "user_roles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_role"),)

    user = relationship("User", back_populates="user_roles")
    role = relationship("Role", back_populates="user_roles")


class Grade(Base):
    """A grade level (e.g. "1".."12")."""

    __tablename__ = "grades"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(20), nullable=False, unique=True, index=True)
    display_order = Column(Integer, nullable=True)
    description = Column(String(255), nullable=True)


class Subject(Base):
    """A teachable subject in the curriculum catalogue."""

    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    code = Column(String(20), nullable=False, unique=True, index=True)
    category = Column(String(30), nullable=True)  # core, elective, language, practical, co-curricular
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    class_subjects = relationship("ClassSubject", back_populates="subject", cascade="all, delete-orphan")


class ClassSubject(Base):
    """Subjects offered to a class section in a given academic year."""

    __tablename__ = "class_subjects"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    periods_per_week = Column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("class_section_id", "subject_id", name="uq_class_subject"),)

    class_section = relationship("ClassSection", back_populates="class_subjects")
    subject = relationship("Subject", back_populates="class_subjects")
    academic_year = relationship("AcademicYear")


class Department(Base):
    """An organisational department."""

    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(255), nullable=True)

    employees = relationship("Employee", back_populates="department")
    designations = relationship("Designation", back_populates="department")


class Designation(Base):
    """A job title, optionally owned by a department."""

    __tablename__ = "designations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    grade_of_employment = Column(String(20), nullable=True)

    department = relationship("Department", back_populates="designations")
    employees = relationship("Employee", back_populates="designation")


class Employee(Base):
    """HR record for a staff member (optionally linked to a login user)."""

    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, unique=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True, unique=True, index=True)
    phone = Column(String(20), nullable=True)
    employee_code = Column(String(50), nullable=True, unique=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    designation_id = Column(Integer, ForeignKey("designations.id"), nullable=True)
    employee_type = Column(String(30), nullable=True)  # teacher, administrative, support, driver, security, other
    date_of_joining = Column(Date, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(20), nullable=True)
    address = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    emergency_contact_name = Column(String(100), nullable=True)
    emergency_contact_phone = Column(String(20), nullable=True)

    user = relationship("User", back_populates="employee", foreign_keys=[user_id])
    department = relationship("Department", back_populates="employees")
    designation = relationship("Designation", back_populates="employees")



# â”€â”€â”€ FINANCE (Phase-3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Additive module living ALONGSIDE the legacy flat `fees` table. Nothing here
# touches or migrates `fees`; /api/fees/* keeps working exactly as before.


class FeeHead(Base):
    """A category a fee can be charged under (Tuition, Transport, ...)."""

    __tablename__ = "fee_heads"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    structure_items = relationship("FeeStructureItem", back_populates="fee_head")
    invoice_items = relationship("InvoiceItem", back_populates="fee_head")


class FeeStructure(Base):
    """A named bundle of fee-head charges for a year / grade / section.

    NOTE ON ``grade_id``: intentionally a PLAIN nullable Integer with NO ForeignKey
    constraint. The `grades` table is being introduced by a parallel workstream, so
    a hard FK would make `Base.metadata.create_all()` fail (or create the wrong
    table) depending on import ordering. A bare Integer keeps this module additive
    and order-independent; referential integrity is enforced in the router layer
    (validated against Grade when the table exists).
    """

    __tablename__ = "fee_structures"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    grade_id = Column(Integer, nullable=True, index=True)  # plain Integer, nullable (see class docstring)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True, index=True)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    __table_args__ = (
        Index("ix_fee_structures_year_grade", "academic_year_id", "grade_id"),
    )

    academic_year = relationship("AcademicYear", foreign_keys=[academic_year_id])
    class_section = relationship("ClassSection", foreign_keys=[class_section_id])
    items = relationship("FeeStructureItem", back_populates="fee_structure",
                         cascade="all, delete-orphan")


class FeeStructureItem(Base):
    """One fee-head line inside a FeeStructure."""

    __tablename__ = "fee_structure_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    fee_structure_id = Column(Integer, ForeignKey("fee_structures.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    fee_head_id = Column(Integer, ForeignKey("fee_heads.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False, default=0.0)
    periodicity = Column(String(20), nullable=False, default="one-time")  # one-time/term/monthly/quarterly/annual
    due_date = Column(Date, nullable=True)
    is_mandatory = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("fee_structure_id", "fee_head_id", "periodicity",
                         name="uq_fee_structure_item"),
        Index("ix_fee_structure_items_head", "fee_head_id"),
    )

    fee_structure = relationship("FeeStructure", back_populates="items")
    fee_head = relationship("FeeHead", back_populates="structure_items")


class Invoice(Base):
    """A bill raised against a student (snapshotted fee lines)."""

    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    invoice_no = Column(String(40), nullable=False, unique=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True, index=True)
    issue_date = Column(Date, nullable=False, default=date.today, index=True)
    due_date = Column(Date, nullable=True, index=True)
    # draft/issued/partially_paid/paid/overdue/cancelled
    status = Column(String(20), nullable=False, default="draft", index=True)
    total_amount = Column(Float, nullable=False, default=0.0)
    discount_amount = Column(Float, nullable=False, default=0.0)
    paid_amount = Column(Float, nullable=False, default=0.0)
    discount_id = Column(Integer, ForeignKey("discounts.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_invoices_student_status", "student_id", "status"),
    )

    student = relationship("Student", back_populates="invoices")
    academic_year = relationship("AcademicYear", foreign_keys=[academic_year_id])
    class_section = relationship("ClassSection", foreign_keys=[class_section_id])
    creator = relationship("User", back_populates="created_invoices", foreign_keys=[created_by])
    discount = relationship("Discount", foreign_keys=[discount_id])
    items = relationship("InvoiceItem", back_populates="invoice",
                         cascade="all, delete-orphan", order_by="InvoiceItem.id")
    payments = relationship("Payment", back_populates="invoice")


class InvoiceItem(Base):
    """A snapshot line on an invoice (fee head + description + amount)."""

    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    fee_head_id = Column(Integer, ForeignKey("fee_heads.id"), nullable=True, index=True)
    description = Column(String(255), nullable=True)
    amount = Column(Float, nullable=False, default=0.0)
    quantity = Column(Integer, nullable=False, default=1)

    invoice = relationship("Invoice", back_populates="items")
    fee_head = relationship("FeeHead", back_populates="invoice_items")


class Payment(Base):
    """A payment receipt against an invoice.

    Gateway webhooks are authoritative: a row may sit at `initiated`/`pending`
    and only becomes `successful` via POST /payments/{id}/confirm-webhook.
    """

    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    # cash/cheque/card/bank_transfer/online/gateway
    method = Column(String(20), nullable=False, default="cash")
    reference_no = Column(String(100), nullable=True, index=True)
    paid_on = Column(Date, nullable=False, default=date.today, index=True)
    # initiated/pending/successful/failed/refunded
    status = Column(String(20), nullable=False, default="successful", index=True)
    receipt_no = Column(String(40), nullable=True, unique=True, index=True)
    note = Column(Text, nullable=True)
    provider = Column(String(50), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_payments_student_status", "student_id", "status"),
    )

    invoice = relationship("Invoice", back_populates="payments")
    student = relationship("Student", back_populates="payments")
    creator = relationship("User", back_populates="created_payments", foreign_keys=[created_by])
    refunds = relationship("Refund", back_populates="payment", cascade="all, delete-orphan")


class Discount(Base):
    """A percentage or fixed-amount discount rule."""

    __tablename__ = "discounts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    # percentage / fixed
    type = Column(String(20), nullable=False, default="fixed")
    value = Column(Float, nullable=False, default=0.0)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    description = Column(String(255), nullable=True)


class Scholarship(Base):
    """A merit/means scholarship scheme."""

    __tablename__ = "scholarships"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    description = Column(String(255), nullable=True)
    amount = Column(Float, nullable=True)
    percentage = Column(Float, nullable=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    max_recipients = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    academic_year = relationship("AcademicYear", foreign_keys=[academic_year_id])
    recipients = relationship("StudentScholarship", back_populates="scholarship",
                              cascade="all, delete-orphan")


class StudentScholarship(Base):
    """A scholarship awarded to a student."""

    __tablename__ = "student_scholarships"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    scholarship_id = Column(Integer, ForeignKey("scholarships.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    amount = Column(Float, nullable=False, default=0.0)
    granted_on = Column(Date, nullable=False, default=date.today)
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint("student_id", "scholarship_id", "academic_year_id",
                         name="uq_student_scholarship"),
    )

    student = relationship("Student", back_populates="scholarships")
    scholarship = relationship("Scholarship", back_populates="recipients")
    academic_year = relationship("AcademicYear", foreign_keys=[academic_year_id])


class Fine(Base):
    """A penalty levied on a student."""

    __tablename__ = "fines"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True, index=True)
    amount = Column(Float, nullable=False, default=0.0)
    reason = Column(String(255), nullable=True)
    levied_on = Column(Date, nullable=False, default=date.today)
    is_waived = Column(Boolean, nullable=False, default=False, index=True)
    waived_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    student = relationship("Student", back_populates="fines")
    invoice = relationship("Invoice", foreign_keys=[invoice_id])


class Refund(Base):
    """A refund (full or partial) against a successful payment."""

    __tablename__ = "refunds"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    amount = Column(Float, nullable=False, default=0.0)
    reason = Column(String(255), nullable=True)
    refunded_on = Column(Date, nullable=False, default=date.today)
    # pending/completed/rejected
    status = Column(String(20), nullable=False, default="pending", index=True)
    processed_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    payment = relationship("Payment", back_populates="refunds")


# â”€â”€â”€ ACCOUNTING (Phase-3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


class ExpenseCategory(Base):
    """A spending category (Salaries, Utilities, ...)."""

    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(255), nullable=True)

    expenses = relationship("Expense", back_populates="category")


class Expense(Base):
    """An outgoing expenditure with an approval workflow."""

    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=False, index=True)
    expense_date = Column(Date, nullable=False, default=date.today, index=True)
    amount = Column(Float, nullable=False)
    payee = Column(String(150), nullable=True)
    description = Column(String(255), nullable=True)
    payment_method = Column(String(20), nullable=True)
    reference_no = Column(String(100), nullable=True)
    # pending/approved/paid/rejected
    status = Column(String(20), nullable=False, default="pending", index=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_on = Column(Date, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_expenses_date_status", "expense_date", "status"),
    )

    category = relationship("ExpenseCategory", back_populates="expenses")
    creator = relationship("User", back_populates="created_expenses", foreign_keys=[created_by])


class Income(Base):
    """A non-fee income source, or the fee ledger entry written on payment."""

    __tablename__ = "incomes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    source = Column(String(50), nullable=False, index=True)  # fees/admission/donation/other
    source_ref = Column(String(80), nullable=True, index=True)  # e.g. "payment:12"
    amount = Column(Float, nullable=False)
    received_on = Column(Date, nullable=False, default=date.today, index=True)
    mode = Column(String(20), nullable=True)
    note = Column(String(255), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_incomes_date_source", "received_on", "source"),
    )

    creator = relationship("User", back_populates="created_incomes", foreign_keys=[created_by])


# ── EXAMS & REPORT CARDS (Phase-2, additive) ───────────────────────────────
# Strictly additive module. It does NOT touch the legacy flat `marks` table or
# any /api/marks/* route: an ExamMark is keyed on (exam_subject, enrollment),
# never on the legacy Mark row.


class GradeScale(Base):
    """One percentage band -> letter grade / grade point mapping.

    Bands are grouped into named scales (e.g. "Default CBSE"): all 7 default
    bands share the scale name, and the scale whose ``is_default`` flag is set is
    used by :func:`routers.exams._apply_grade_scale`.

    NOTE: ``name`` is deliberately NOT uniquely-constrained on its own -- a scale
    is a *group* of bands, so a column-level unique index would cap every scale at
    a single band and make the 7-band default seed impossible. Uniqueness is
    enforced by the composite ``(name, min_percentage)`` below, which is what the
    idempotent seeder keys on.
    """

    __tablename__ = "grade_scales"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, index=True)
    description = Column(String(255), nullable=True)
    is_default = Column(Boolean, nullable=False, default=False, index=True)
    min_percentage = Column(Float, nullable=False, default=0.0)
    max_percentage = Column(Float, nullable=False, default=100.0)
    letter_grade = Column(String(5), nullable=False)
    grade_point = Column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint("name", "min_percentage", name="uq_grade_scale_band"),
    )


class Exam(Base):
    """An exam / test run, optionally scoped to a class section.

    ``class_section_id is None`` means "whole school". Result publication is a
    two-step flow: first ``is_published`` (schedule visible to teachers/students),
    then ``result_published`` (marks aggregated into ReportCard rows).
    """

    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    # unit_test/periodic_test/mid_term/final_exam/practical/internal_assessment
    exam_type = Column(String(30), nullable=False, default="unit_test", index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True, index=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    max_marks = Column(Float, nullable=False, default=100.0)
    pass_marks = Column(Float, nullable=False, default=33.0)
    # Percentage weight of this exam in the overall aggregate.
    weightage = Column(Float, nullable=False, default=0.0)
    is_published = Column(Boolean, nullable=False, default=False, index=True)
    published_at = Column(DateTime, nullable=True)
    result_published = Column(Boolean, nullable=False, default=False, index=True)
    result_published_at = Column(DateTime, nullable=True)
    remarks = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    academic_year = relationship("AcademicYear", foreign_keys=[academic_year_id])
    class_section = relationship("ClassSection", foreign_keys=[class_section_id])
    creator = relationship("User", foreign_keys=[created_by])
    subjects = relationship("ExamSubject", back_populates="exam",
                            cascade="all, delete-orphan", order_by="ExamSubject.id")
    enrollments = relationship("ExamEnrollment", back_populates="exam",
                               cascade="all, delete-orphan", order_by="ExamEnrollment.id")
    report_cards = relationship("ReportCard", back_populates="exam")


class ExamSubject(Base):
    """A subject-paper inside an exam."""

    __tablename__ = "exam_subjects"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False, index=True)
    max_marks = Column(Float, nullable=True)
    exam_date = Column(Date, nullable=True)
    room = Column(String(50), nullable=True)
    invigilator_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint("exam_id", "subject_id", name="uq_exam_subject"),
    )

    exam = relationship("Exam", back_populates="subjects")
    subject = relationship("Subject")
    invigilator = relationship("Teacher", foreign_keys=[invigilator_id])
    marks = relationship("ExamMark", back_populates="exam_subject",
                         cascade="all, delete-orphan", order_by="ExamMark.id")


class ExamEnrollment(Base):
    """Registration of one student into one exam (with roll number / flags)."""

    __tablename__ = "exam_enrollments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    roll_no = Column(String(20), nullable=True)
    is_absent = Column(Boolean, nullable=False, default=False)
    exempted = Column(Boolean, nullable=False, default=False)
    reexam = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", name="uq_exam_enrollment"),
        Index("ix_exam_enrollments_student", "student_id", "exam_id"),
    )

    exam = relationship("Exam", back_populates="enrollments")
    student = relationship("Student")
    marks = relationship("ExamMark", back_populates="exam_enrollment",
                         cascade="all, delete-orphan", order_by="ExamMark.id")


class ExamMark(Base):
    """A score for one (exam subject, enrolled student) pair.

    Deliberately separate from the legacy flat ``marks`` table so that
    /api/marks/* keeps working unchanged.
    """

    __tablename__ = "exam_marks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    exam_subject_id = Column(Integer, ForeignKey("exam_subjects.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    exam_enrollment_id = Column(Integer, ForeignKey("exam_enrollments.id", ondelete="CASCADE"),
                                nullable=False, index=True)
    score = Column(Float, nullable=True)
    is_absent = Column(Boolean, nullable=False, default=False)
    is_exempted = Column(Boolean, nullable=False, default=False)
    entered_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    entered_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("exam_subject_id", "exam_enrollment_id", name="uq_exam_mark"),
        Index("ix_exam_marks_subject_enrollment", "exam_subject_id", "exam_enrollment_id"),
    )

    exam_subject = relationship("ExamSubject", back_populates="marks")
    exam_enrollment = relationship("ExamEnrollment", back_populates="marks")
    entered_by_user = relationship("User", foreign_keys=[entered_by])


class ReportCard(Base):
    """Aggregated result of one student for one exam."""

    __tablename__ = "report_cards"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True, index=True)
    total_marks = Column(Float, nullable=False, default=0.0)
    max_total_marks = Column(Float, nullable=False, default=0.0)
    percentage = Column(Float, nullable=False, default=0.0)
    grade = Column(String(5), nullable=True)
    grade_point = Column(Float, nullable=False, default=0.0)
    # pass / fail / compartmental
    result = Column(String(20), nullable=False, default="pass", index=True)
    rank = Column(Integer, nullable=True)
    class_rank = Column(Integer, nullable=True)
    attendance_percentage = Column(Float, nullable=True)
    teacher_remarks = Column(Text, nullable=True)
    principal_remarks = Column(Text, nullable=True)
    is_published = Column(Boolean, nullable=False, default=False, index=True)
    published_at = Column(DateTime, nullable=True)
    generated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "exam_id", name="uq_report_card"),
        Index("ix_report_cards_exam_section", "exam_id", "class_section_id"),
    )

    student = relationship("Student")
    exam = relationship("Exam", back_populates="report_cards")
    academic_year = relationship("AcademicYear", foreign_keys=[academic_year_id])
    class_section = relationship("ClassSection", foreign_keys=[class_section_id])
    generator = relationship("User", foreign_keys=[generated_by])
