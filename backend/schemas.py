"""Pydantic schemas for request/response validation."""

from datetime import date as date_type, datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, EmailStr


# ─── Shared Role / Permission constants ──────────────────────────────────────

#: Canonical 10-role set (original admin|staff|teacher|student|parent still work).
ROLE_PATTERN = (
    "^(admin|principal|vice_principal|staff|teacher|accountant|librarian"
    "|receptionist|transport_manager|student|parent)$"
)

#: Modules covered by the permission catalogue.
PERMISSION_MODULES = (
    "dashboard", "students", "teachers", "staff", "users", "classes", "subjects",
    "attendance", "marks", "exams", "assignments", "timetable", "calendar",
    "notices", "fees", "finance", "invoices", "library", "inventory",
    "transport", "hr", "reports", "audit", "website", "crm",
)

#: Actions available per module (dashboard is read-only).
PERMISSION_ACTIONS = ("read", "write", "create", "delete", "export")


# ─── Student Schemas ──────────────────────────────────────────────────────────

class StudentBase(BaseModel):
    """Base schema with shared student attributes."""
    name: str = Field(..., min_length=1, max_length=100, description="Full name of the student")
    email: EmailStr = Field(..., description="Email address of the student")
    phone: Optional[str] = Field(None, max_length=20, description="Phone number")
    grade: str = Field(..., min_length=1, max_length=20, description="Class/grade level (e.g., '10', '12')")
    date_of_birth: Optional[date_type] = Field(None, description="Date of birth")
    address: Optional[str] = Field(None, max_length=255, description="Residential address")
    enrollment_date: Optional[date_type] = Field(None, description="Date of enrollment")
    class_section_id: Optional[int] = Field(None, description="Linked class section ID")
    academic_year_id: Optional[int] = Field(None, description="Linked academic year ID")
    admission_no: Optional[str] = Field(None, max_length=50, description="Admission number (unique)")
    is_active: bool = Field(True, description="Whether the student is active")


class StudentCreate(StudentBase):
    """Schema for creating a new student."""
    pass


class StudentUpdate(BaseModel):
    """Schema for updating an existing student (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    grade: Optional[str] = Field(None, min_length=1, max_length=20)
    date_of_birth: Optional[date_type] = None
    address: Optional[str] = Field(None, max_length=255)
    enrollment_date: Optional[date_type] = None
    class_section_id: Optional[int] = None
    academic_year_id: Optional[int] = None
    admission_no: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None


class StudentResponse(StudentBase):
    """Schema for student response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Teacher Schemas ──────────────────────────────────────────────────────────

class TeacherBase(BaseModel):
    """Base schema with shared teacher attributes."""
    name: str = Field(..., min_length=1, max_length=100, description="Full name of the teacher")
    email: EmailStr = Field(..., description="Email address of the teacher")
    phone: Optional[str] = Field(None, max_length=20, description="Phone number")
    subject: str = Field(..., min_length=1, max_length=100, description="Subject taught")
    qualification: Optional[str] = Field(None, max_length=200, description="Academic qualification")


class TeacherCreate(TeacherBase):
    """Schema for creating a new teacher."""
    pass


class TeacherUpdate(BaseModel):
    """Schema for updating an existing teacher (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    subject: Optional[str] = Field(None, min_length=1, max_length=100)
    qualification: Optional[str] = Field(None, max_length=200)


class TeacherResponse(TeacherBase):
    """Schema for teacher response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Attendance Schemas ───────────────────────────────────────────────────────

class AttendanceBase(BaseModel):
    """Base schema with shared attendance attributes."""
    student_id: int = Field(..., description="ID of the student")
    date: date_type = Field(..., description="Date of attendance record")
    status: str = Field(..., pattern="^(present|absent|late|holiday|half_day)$", description="Attendance status: present, absent, late, holiday, or half_day")


class AttendanceCreate(AttendanceBase):
    """Schema for creating a new attendance record."""
    pass


class AttendanceUpdate(BaseModel):
    """Schema for updating an existing attendance record."""
    date: Optional[date_type] = None
    status: Optional[str] = Field(None, pattern="^(present|absent|late|holiday|half_day)$")


class AttendanceResponse(AttendanceBase):
    """Schema for attendance response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Mark Schemas ─────────────────────────────────────────────────────────────

class MarkBase(BaseModel):
    """Base schema with shared mark attributes."""
    student_id: int = Field(..., description="ID of the student")
    subject: str = Field(..., min_length=1, max_length=100, description="Subject name")
    exam_name: str = Field(..., min_length=1, max_length=100, description="Name of the exam")
    score: float = Field(..., ge=0, description="Score obtained")
    max_score: float = Field(100.0, gt=0, description="Maximum possible score")
    date: Optional[date_type] = Field(None, description="Date of the exam")


class MarkCreate(MarkBase):
    """Schema for creating a new mark record."""
    pass


class MarkUpdate(BaseModel):
    """Schema for updating an existing mark record."""
    subject: Optional[str] = Field(None, min_length=1, max_length=100)
    exam_name: Optional[str] = Field(None, min_length=1, max_length=100)
    score: Optional[float] = Field(None, ge=0)
    max_score: Optional[float] = Field(None, gt=0)
    date: Optional[date_type] = None


class MarkResponse(MarkBase):
    """Schema for mark response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Fee Schemas ──────────────────────────────────────────────────────────────

class FeeBase(BaseModel):
    """Base schema with shared fee attributes."""
    student_id: int = Field(..., description="ID of the student")
    amount: float = Field(..., gt=0, description="Fee amount")
    due_date: date_type = Field(..., description="Due date for payment")
    paid: bool = Field(False, description="Whether the fee has been paid")
    paid_date: Optional[date_type] = Field(None, description="Date when fee was paid")


class FeeCreate(FeeBase):
    """Schema for creating a new fee record."""
    pass


class FeeUpdate(BaseModel):
    """Schema for updating an existing fee record."""
    amount: Optional[float] = Field(None, gt=0)
    due_date: Optional[date_type] = None
    paid: Optional[bool] = None
    paid_date: Optional[date_type] = None


class FeeResponse(FeeBase):
    """Schema for fee response data."""
    id: int

    model_config = {"from_attributes": True}


class FeeMarkPaidRequest(BaseModel):
    """Schema for marking a fee as paid."""
    paid_date: Optional[date_type] = Field(None, description="Date of payment (defaults to today)")


# ─── Timetable Schemas ────────────────────────────────────────────────────────

class TimetableBase(BaseModel):
    """Base schema with shared timetable attributes."""
    class_name: str = Field(..., min_length=1, max_length=50, description="Class name (e.g., '10-A')")
    subject: str = Field(..., min_length=1, max_length=100, description="Subject name")
    teacher_name: str = Field(..., min_length=1, max_length=100, description="Name of the teacher")
    day_of_week: str = Field(..., pattern="^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$", description="Day of the week")
    start_time: str = Field(..., pattern="^([01]\\d|2[0-3]):[0-5]\\d$", description="Start time in HH:MM format")
    end_time: str = Field(..., pattern="^([01]\\d|2[0-3]):[0-5]\\d$", description="End time in HH:MM format")
    room: Optional[str] = Field(None, max_length=50, description="Room number/name")
    class_section_id: Optional[int] = Field(None, description="Linked class section ID")


class TimetableCreate(TimetableBase):
    """Schema for creating a new timetable entry."""
    pass


class TimetableUpdate(BaseModel):
    """Schema for updating an existing timetable entry."""
    class_name: Optional[str] = Field(None, min_length=1, max_length=50)
    subject: Optional[str] = Field(None, min_length=1, max_length=100)
    teacher_name: Optional[str] = Field(None, min_length=1, max_length=100)
    day_of_week: Optional[str] = Field(None, pattern="^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$")
    start_time: Optional[str] = Field(None, pattern="^([01]\\d|2[0-3]):[0-5]\\d$")
    end_time: Optional[str] = Field(None, pattern="^([01]\\d|2[0-3]):[0-5]\\d$")
    room: Optional[str] = Field(None, max_length=50)
    class_section_id: Optional[int] = None


class TimetableResponse(TimetableBase):
    """Schema for timetable response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── User Schemas ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    """Schema for creating a new user."""
    name: str = Field(..., min_length=1, max_length=100, description="Full name of the user")
    email: EmailStr = Field(..., description="Email address of the user")
    password: str = Field(..., min_length=6, max_length=100, description="Password (min 6 characters)")
    role: str = Field(..., pattern=ROLE_PATTERN, description="User role: one of the 11 system roles (admin, principal, vice_principal, staff, teacher, accountant, librarian, receptionist, transport_manager, student, parent)")
    student_id: Optional[int] = Field(None, description="Linked student ID (for parent/student roles)")
    teacher_id: Optional[int] = Field(None, description="Linked teacher ID (for teacher role)")


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr = Field(..., description="Email address of the user")
    password: str = Field(..., description="Password")


class PortalLoginRequest(BaseModel):
    """Schema for portal-scoped login (role must match the portal)."""
    email: EmailStr = Field(..., description="Email address of the user")
    password: str = Field(..., description="Password")
    portal: str = Field(..., pattern=ROLE_PATTERN, description="Portal being logged into (must match the user's role)")


class UserResponse(BaseModel):
    """Schema for user response data (excludes password hash)."""
    id: int
    name: str
    email: EmailStr
    role: str
    is_active: bool = True
    created_at: Optional[datetime] = None
    student_id: Optional[int] = None
    teacher_id: Optional[int] = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Schema for updating an existing user (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    role: Optional[str] = Field(None, pattern=ROLE_PATTERN)
    student_id: Optional[int] = None
    teacher_id: Optional[int] = None
    is_active: Optional[bool] = None


class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str
    user: UserResponse


# ─── Notice Schemas ───────────────────────────────────────────────────────────

class NoticeCreate(BaseModel):
    """Schema for creating a new notice."""
    title: str = Field(..., min_length=1, max_length=200, description="Notice title")
    content: str = Field(..., min_length=1, description="Notice content/body")
    category: str = Field(..., pattern="^(general|event|exam|holiday|emergency)$", description="Notice category")
    expires_at: Optional[str] = Field(None, description="Optional expiration date (ISO format)")
    audience: str = Field("all", max_length=20, description="Target audience (e.g. all, teachers, parents, class)")
    class_section_id: Optional[int] = Field(None, description="Target class section (when audience is class-scoped)")


class NoticeUpdate(BaseModel):
    """Schema for updating an existing notice (all fields optional)."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=1)
    category: Optional[str] = Field(None, pattern="^(general|event|exam|holiday|emergency)$")
    expires_at: Optional[str] = None
    is_active: Optional[bool] = None
    audience: Optional[str] = Field(None, max_length=20)
    class_section_id: Optional[int] = None


class NoticeResponse(BaseModel):
    """Schema for notice response data."""
    id: int
    title: str
    content: str
    category: str
    posted_by: int
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active: bool
    audience: str = "all"
    class_section_id: Optional[int] = None

    model_config = {"from_attributes": True}


class NoticeReadResponse(BaseModel):
    """Schema for a notice-read receipt."""
    id: int
    notice_id: int
    user_id: int
    read_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Academic Year Schemas ────────────────────────────────────────────────────

class AcademicYearBase(BaseModel):
    """Base schema with shared academic-year attributes."""
    name: str = Field(..., min_length=1, max_length=20, description="Academic year name (e.g. '2026-27')")
    start_date: Optional[date_type] = Field(None, description="Start date of the academic year")
    end_date: Optional[date_type] = Field(None, description="End date of the academic year")
    is_current: bool = Field(False, description="Whether this is the current academic year")


class AcademicYearCreate(AcademicYearBase):
    """Schema for creating an academic year."""
    pass


class AcademicYearUpdate(BaseModel):
    """Schema for updating an academic year (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=20)
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None
    is_current: Optional[bool] = None


class AcademicYearResponse(AcademicYearBase):
    """Schema for academic-year response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Class Section Schemas ────────────────────────────────────────────────────

class ClassSectionBase(BaseModel):
    """Base schema with shared class-section attributes."""
    grade: str = Field(..., min_length=1, max_length=20, description="Grade level (e.g. '10')")
    section: str = Field("A", min_length=1, max_length=10, description="Section label (e.g. 'A')")
    class_name: str = Field(..., min_length=1, max_length=50, description="Display name (e.g. '10-A')")
    academic_year_id: Optional[int] = Field(None, description="Academic year ID")
    class_teacher_id: Optional[int] = Field(None, description="Class teacher (teachers.id)")
    room: Optional[str] = Field(None, max_length=50, description="Room number/name")


class ClassSectionCreate(ClassSectionBase):
    """Schema for creating a class section."""
    pass


class ClassSectionUpdate(BaseModel):
    """Schema for updating a class section (all fields optional)."""
    grade: Optional[str] = Field(None, min_length=1, max_length=20)
    section: Optional[str] = Field(None, min_length=1, max_length=10)
    class_name: Optional[str] = Field(None, min_length=1, max_length=50)
    academic_year_id: Optional[int] = None
    class_teacher_id: Optional[int] = None
    room: Optional[str] = Field(None, max_length=50)


class ClassSectionResponse(ClassSectionBase):
    """Schema for class-section response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Staff Schemas ────────────────────────────────────────────────────────────

class StaffProfileBase(BaseModel):
    """Base schema with shared staff-profile attributes."""
    designation: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)


class StaffProfileCreate(StaffProfileBase):
    """Schema for creating a staff profile (linked to a staff-role user)."""
    user_id: int = Field(..., description="User ID with role=staff")


class StaffProfileUpdate(BaseModel):
    """Schema for updating a staff profile."""
    designation: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)


class StaffProfileResponse(StaffProfileBase):
    """Schema for staff-profile response data."""
    id: int
    user_id: int

    model_config = {"from_attributes": True}


class StaffPermissionBase(BaseModel):
    """Base schema with shared staff-permission attributes."""
    module: str = Field(..., min_length=1, max_length=50)
    can_read: bool = Field(False)
    can_write: bool = Field(False)
    can_delete: bool = Field(False)


class StaffPermissionCreate(StaffPermissionBase):
    """Schema for granting a staff permission."""
    staff_profile_id: int = Field(..., description="Staff profile ID")


class StaffPermissionUpdate(BaseModel):
    """Schema for updating a staff permission."""
    module: Optional[str] = Field(None, min_length=1, max_length=50)
    can_read: Optional[bool] = None
    can_write: Optional[bool] = None
    can_delete: Optional[bool] = None


class StaffPermissionResponse(StaffPermissionBase):
    """Schema for staff-permission response data."""
    id: int
    staff_profile_id: int

    model_config = {"from_attributes": True}


# ─── People-link Schemas ──────────────────────────────────────────────────────

class TeacherAssignmentBase(BaseModel):
    """Base schema with shared teacher-assignment attributes."""
    teacher_id: int = Field(..., description="Teacher ID")
    class_section_id: int = Field(..., description="Class section ID")
    subject: str = Field(..., min_length=1, max_length=100)
    academic_year_id: Optional[int] = Field(None, description="Academic year ID")


class TeacherAssignmentCreate(TeacherAssignmentBase):
    """Schema for creating a teacher assignment."""
    pass


class TeacherAssignmentUpdate(BaseModel):
    """Schema for updating a teacher assignment."""
    teacher_id: Optional[int] = None
    class_section_id: Optional[int] = None
    subject: Optional[str] = Field(None, min_length=1, max_length=100)
    academic_year_id: Optional[int] = None


class TeacherAssignmentResponse(TeacherAssignmentBase):
    """Schema for teacher-assignment response data."""
    id: int

    model_config = {"from_attributes": True}


class ParentStudentLinkBase(BaseModel):
    """Base schema with shared parent-student-link attributes."""
    parent_user_id: int = Field(..., description="Parent user ID")
    student_id: int = Field(..., description="Student ID")
    relation: Optional[str] = Field(None, max_length=30, description="Relation (e.g. father, mother, guardian)")


class ParentStudentLinkCreate(ParentStudentLinkBase):
    """Schema for creating a parent-student link."""
    pass


class ParentStudentLinkUpdate(BaseModel):
    """Schema for updating a parent-student link."""
    parent_user_id: Optional[int] = None
    student_id: Optional[int] = None
    relation: Optional[str] = Field(None, max_length=30)


class ParentStudentLinkResponse(ParentStudentLinkBase):
    """Schema for parent-student-link response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Assignment Schemas ───────────────────────────────────────────────────────

class AssignmentBase(BaseModel):
    """Base schema with shared assignment attributes."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, description="Assignment details/instructions")
    subject: str = Field(..., min_length=1, max_length=100)
    class_section_id: Optional[int] = Field(None, description="Target class section ID")
    due_date: Optional[date_type] = Field(None, description="Due date")
    max_score: Optional[float] = Field(None, ge=0, description="Maximum score")


class AssignmentCreate(AssignmentBase):
    """Schema for creating an assignment."""
    teacher_id: Optional[int] = Field(None, description="Teacher ID (defaults to caller's linked teacher)")


class AssignmentUpdate(BaseModel):
    """Schema for updating an assignment."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    subject: Optional[str] = Field(None, min_length=1, max_length=100)
    class_section_id: Optional[int] = None
    due_date: Optional[date_type] = None
    max_score: Optional[float] = Field(None, ge=0)


class AssignmentResponse(AssignmentBase):
    """Schema for assignment response data."""
    id: int
    teacher_id: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AssignmentSubmissionBase(BaseModel):
    """Base schema with shared submission attributes."""
    content: Optional[str] = Field(None, description="Text answer/content")
    file_url: Optional[str] = Field(None, max_length=500, description="Attached file URL")


class AssignmentSubmissionCreate(AssignmentSubmissionBase):
    """Schema for submitting an assignment."""
    assignment_id: int = Field(..., description="Assignment ID")


class AssignmentGradeRequest(BaseModel):
    """Schema for grading a submission."""
    score: float = Field(..., ge=0, description="Score awarded")


class AssignmentSubmissionResponse(AssignmentSubmissionBase):
    """Schema for submission response data."""
    id: int
    assignment_id: int
    student_id: int
    score: Optional[float] = None
    submitted_at: Optional[datetime] = None
    graded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ─── Calendar Event Schemas ───────────────────────────────────────────────────

class CalendarEventBase(BaseModel):
    """Base schema with shared calendar-event attributes."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None)
    event_type: str = Field("general", min_length=1, max_length=50)
    start_datetime: datetime = Field(..., description="Event start (ISO datetime)")
    end_datetime: Optional[datetime] = Field(None, description="Event end (ISO datetime)")
    audience: str = Field("all", max_length=20)
    class_section_id: Optional[int] = Field(None)


class CalendarEventCreate(CalendarEventBase):
    """Schema for creating a calendar event."""
    pass


class CalendarEventUpdate(BaseModel):
    """Schema for updating a calendar event."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    event_type: Optional[str] = Field(None, min_length=1, max_length=50)
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    audience: Optional[str] = Field(None, max_length=20)
    class_section_id: Optional[int] = None


class CalendarEventResponse(CalendarEventBase):
    """Schema for calendar-event response data."""
    id: int
    created_by: Optional[int] = None

    model_config = {"from_attributes": True}


# ─── Audit Log Schemas ────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    """Schema for audit-log response data (read-only)."""
    id: int
    actor_user_id: Optional[int] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    timestamp: Optional[datetime] = None
    meta_json: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Sidebar / Permissions Schemas ────────────────────────────────────────────

class MyPermissionsResponse(BaseModel):
    """Sidebar-gating payload for the logged-in user.

    The original five keys (`role`, `permissions`, `children`, `class_sections`,
    `profile`) keep their exact meaning for backwards compatibility; Phase-1 adds
    `all_permissions` (module -> allowed actions) and `roles` (all held roles).
    """
    role: str
    permissions: List[str] = Field(default_factory=list)
    children: List[StudentResponse] = Field(default_factory=list)
    class_sections: List[ClassSectionResponse] = Field(default_factory=list)
    profile: Optional[StaffProfileResponse] = None
    all_permissions: Dict[str, List[str]] = Field(default_factory=dict)
    roles: List[str] = Field(default_factory=list)


# ─── RBAC Schemas (Role / Permission / RolePermission / UserRole) ────────────

class RoleBase(BaseModel):
    """Base schema with shared role attributes."""
    name: str = Field(..., min_length=1, max_length=50, description="Role name (e.g. 'librarian')")
    description: Optional[str] = Field(None, max_length=255)
    is_system: bool = Field(True, description="System roles cannot be deleted")


class RoleCreate(RoleBase):
    """Schema for creating a role."""
    pass


class RoleUpdate(BaseModel):
    """Schema for updating a role (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=255)
    is_system: Optional[bool] = None


class RoleResponse(RoleBase):
    """Schema for role response data."""
    id: int

    model_config = {"from_attributes": True}


class PermissionBase(BaseModel):
    """Base schema with shared permission attributes."""
    module: str = Field(..., min_length=1, max_length=50, description="Module name (e.g. 'students')")
    action: str = Field(..., pattern="^(read|write|create|delete|export)$", description="Action on the module")
    description: Optional[str] = Field(None, max_length=255)


class PermissionCreate(PermissionBase):
    """Schema for creating a permission."""
    pass


class PermissionUpdate(BaseModel):
    """Schema for updating a permission (all fields optional)."""
    module: Optional[str] = Field(None, min_length=1, max_length=50)
    action: Optional[str] = Field(None, pattern="^(read|write|create|delete|export)$")
    description: Optional[str] = Field(None, max_length=255)


class PermissionResponse(PermissionBase):
    """Schema for permission response data."""
    id: int

    model_config = {"from_attributes": True}


class RolePermissionCreate(BaseModel):
    """Schema for granting a permission to a role."""
    role_id: int = Field(..., description="Role ID")
    permission_id: int = Field(..., description="Permission ID")


class RolePermissionResponse(BaseModel):
    """Schema for role-permission response data."""
    id: int
    role_id: int
    permission_id: int

    model_config = {"from_attributes": True}


# ─── Grade Schemas ────────────────────────────────────────────────────────────

class GradeBase(BaseModel):
    """Base schema with shared grade attributes."""
    name: str = Field(..., min_length=1, max_length=20, description="Grade name (e.g. '1'..'12')")
    display_order: Optional[int] = Field(None, description="Sort order for grade lists")
    description: Optional[str] = Field(None, max_length=255)


class GradeCreate(GradeBase):
    """Schema for creating a grade."""
    pass


class GradeUpdate(BaseModel):
    """Schema for updating a grade (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=20)
    display_order: Optional[int] = None
    description: Optional[str] = Field(None, max_length=255)


class GradeResponse(GradeBase):
    """Schema for grade response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Subject / Class-Subject Schemas ─────────────────────────────────────────

SUBJECT_CATEGORY_PATTERN = "^(core|elective|language|practical|co-curricular)$"

class SubjectBase(BaseModel):
    """Base schema with shared subject attributes."""
    name: str = Field(..., min_length=1, max_length=100, description="Subject name (unique)")
    code: str = Field(..., min_length=1, max_length=20, description="Short subject code (unique)")
    category: Optional[str] = Field(None, pattern=SUBJECT_CATEGORY_PATTERN,
                                    description="core, elective, language, practical or co-curricular")
    description: Optional[str] = Field(None, max_length=255)
    is_active: bool = Field(True, description="Whether the subject is offered")


class SubjectCreate(SubjectBase):
    """Schema for creating a subject."""
    pass


class SubjectUpdate(BaseModel):
    """Schema for updating a subject (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    category: Optional[str] = Field(None, pattern=SUBJECT_CATEGORY_PATTERN)
    description: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class SubjectResponse(SubjectBase):
    """Schema for subject response data."""
    id: int

    model_config = {"from_attributes": True}


class ClassSubjectBase(BaseModel):
    """Base schema with shared class-subject attributes."""
    class_section_id: int = Field(..., description="Class section ID")
    subject_id: int = Field(..., description="Subject ID")
    academic_year_id: Optional[int] = Field(None, description="Academic year ID")
    periods_per_week: int = Field(0, ge=0, description="Periods allotted per week")


class ClassSubjectCreate(ClassSubjectBase):
    """Schema for creating a class-subject mapping."""
    pass


class ClassSubjectUpdate(BaseModel):
    """Schema for updating a class-subject mapping (all fields optional)."""
    class_section_id: Optional[int] = None
    subject_id: Optional[int] = None
    academic_year_id: Optional[int] = None
    periods_per_week: Optional[int] = Field(None, ge=0)


class ClassSubjectResponse(ClassSubjectBase):
    """Schema for class-subject response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Department / Designation Schemas ─────────────────────────────────────────

class DepartmentBase(BaseModel):
    """Base schema with shared department attributes."""
    name: str = Field(..., min_length=1, max_length=100, description="Department name (unique)")
    description: Optional[str] = Field(None, max_length=255)


class DepartmentCreate(DepartmentBase):
    """Schema for creating a department."""
    pass


class DepartmentUpdate(BaseModel):
    """Schema for updating a department (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)


class DepartmentResponse(DepartmentBase):
    """Schema for department response data."""
    id: int

    model_config = {"from_attributes": True}


class DesignationBase(BaseModel):
    """Base schema with shared designation attributes."""
    name: str = Field(..., min_length=1, max_length=100, description="Designation name (unique)")
    department_id: Optional[int] = Field(None, description="Owning department ID")
    grade_of_employment: Optional[str] = Field(None, max_length=20, description="Grade/band of employment")


class DesignationCreate(DesignationBase):
    """Schema for creating a designation."""
    pass


class DesignationUpdate(BaseModel):
    """Schema for updating a designation (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    department_id: Optional[int] = None
    grade_of_employment: Optional[str] = Field(None, max_length=20)


class DesignationResponse(DesignationBase):
    """Schema for designation response data."""
    id: int

    model_config = {"from_attributes": True}


# ─── Employee Schemas ─────────────────────────────────────────────────────────

EMPLOYEE_TYPE_PATTERN = "^(teacher|administrative|support|driver|security|other)$"

class EmployeeBase(BaseModel):
    """Base schema with shared employee attributes."""
    first_name: str = Field(..., min_length=1, max_length=100, description="First name")
    last_name: Optional[str] = Field(None, max_length=100, description="Last name")
    email: Optional[EmailStr] = Field(None, description="Email address (unique)")
    phone: Optional[str] = Field(None, max_length=20)
    employee_code: Optional[str] = Field(None, max_length=50, description="Unique employee code")
    department_id: Optional[int] = Field(None, description="Department ID")
    designation_id: Optional[int] = Field(None, description="Designation ID")
    employee_type: Optional[str] = Field(None, pattern=EMPLOYEE_TYPE_PATTERN)
    date_of_joining: Optional[date_type] = Field(None)
    date_of_birth: Optional[date_type] = Field(None)
    gender: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    is_active: bool = Field(True, description="Whether the employee is active")
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)


class EmployeeCreate(EmployeeBase):
    """Schema for creating an employee."""
    user_id: Optional[int] = Field(None, description="Optional linked user account (unique)")


class EmployeeUpdate(BaseModel):
    """Schema for updating an employee (all fields optional)."""
    user_id: Optional[int] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    employee_code: Optional[str] = Field(None, max_length=50)
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    employee_type: Optional[str] = Field(None, pattern=EMPLOYEE_TYPE_PATTERN)
    date_of_joining: Optional[date_type] = None
    date_of_birth: Optional[date_type] = None
    gender: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)


class EmployeeResponse(EmployeeBase):
    """Schema for employee response data."""
    id: int
    user_id: Optional[int] = None

    model_config = {"from_attributes": True}



# â”€â”€â”€ FINANCE Schemas (Phase-3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

PERIODICITY_PATTERN = "^(one-time|term|monthly|quarterly|annual)$"
PAYMENT_METHOD_PATTERN = "^(cash|cheque|card|bank_transfer|online|gateway)$"
PAYMENT_STATUS_PATTERN = "^(initiated|pending|successful|failed|refunded)$"
INVOICE_STATUS_PATTERN = "^(draft|issued|partially_paid|paid|overdue|cancelled)$"


# â”€â”€ Fee heads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class FeeHeadCreate(BaseModel):
    """Schema for creating a fee head."""
    name: str = Field(..., min_length=1, max_length=100, description="Fee head name (e.g. 'Tuition')")
    description: Optional[str] = Field(None, max_length=255)
    is_active: bool = Field(True)


class FeeHeadUpdate(BaseModel):
    """Schema for updating a fee head (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class FeeHeadResponse(BaseModel):
    """Schema for fee-head response data."""
    id: int
    name: str
    description: Optional[str] = None
    is_active: bool = True

    model_config = {"from_attributes": True}


# â”€â”€ Fee structures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class FeeStructureItemCreate(BaseModel):
    """One fee-head line supplied when creating/updating a fee structure."""
    fee_head_id: int = Field(..., description="Fee head ID")
    amount: float = Field(..., ge=0, description="Charge amount")
    periodicity: str = Field("one-time", pattern=PERIODICITY_PATTERN)
    due_date: Optional[date_type] = None
    is_mandatory: bool = Field(True)


class FeeStructureItemUpdate(BaseModel):
    """Schema for updating a fee-structure item (all fields optional)."""
    fee_head_id: Optional[int] = None
    amount: Optional[float] = Field(None, ge=0)
    periodicity: Optional[str] = Field(None, pattern=PERIODICITY_PATTERN)
    due_date: Optional[date_type] = None
    is_mandatory: Optional[bool] = None


class FeeStructureItemResponse(BaseModel):
    """Schema for fee-structure-item response data."""
    id: int
    fee_structure_id: int
    fee_head_id: int
    amount: float
    periodicity: str
    due_date: Optional[date_type] = None
    is_mandatory: bool = True

    model_config = {"from_attributes": True}


class FeeStructureCreate(BaseModel):
    """Schema for creating a fee structure with nested items."""
    name: str = Field(..., min_length=1, max_length=150)
    academic_year_id: Optional[int] = None
    grade_id: Optional[int] = Field(None, description="Grade ID (NULL = all grades)")
    class_section_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=255)
    is_active: bool = Field(True)
    items: List[FeeStructureItemCreate] = Field(default_factory=list,
                                               description="Nested fee-head lines written in one transaction")


class FeeStructureUpdate(BaseModel):
    """Schema for updating a fee structure (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    academic_year_id: Optional[int] = None
    grade_id: Optional[int] = None
    class_section_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class FeeStructureResponse(BaseModel):
    """Schema for fee-structure response data."""
    id: int
    name: str
    academic_year_id: Optional[int] = None
    grade_id: Optional[int] = None
    class_section_id: Optional[int] = None
    description: Optional[str] = None
    is_active: bool = True
    items: List[FeeStructureItemResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# â”€â”€ Discounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class DiscountCreate(BaseModel):
    """Schema for creating a discount."""
    name: str = Field(..., min_length=1, max_length=120)
    type: str = Field("fixed", pattern="^(percentage|fixed)$")
    value: float = Field(..., ge=0, description="Percent (0-100) or fixed amount")
    is_active: bool = Field(True)
    description: Optional[str] = Field(None, max_length=255)


class DiscountUpdate(BaseModel):
    """Schema for updating a discount (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    type: Optional[str] = Field(None, pattern="^(percentage|fixed)$")
    value: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None
    description: Optional[str] = Field(None, max_length=255)


class DiscountResponse(BaseModel):
    """Schema for discount response data."""
    id: int
    name: str
    type: str
    value: float
    is_active: bool = True
    description: Optional[str] = None

    model_config = {"from_attributes": True}


# â”€â”€ Scholarships â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class ScholarshipCreate(BaseModel):
    """Schema for creating a scholarship."""
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=255)
    amount: Optional[float] = Field(None, ge=0)
    percentage: Optional[float] = Field(None, ge=0, le=100)
    academic_year_id: Optional[int] = None
    max_recipients: Optional[int] = Field(None, ge=0)
    is_active: bool = Field(True)


class ScholarshipUpdate(BaseModel):
    """Schema for updating a scholarship (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=255)
    amount: Optional[float] = Field(None, ge=0)
    percentage: Optional[float] = Field(None, ge=0, le=100)
    academic_year_id: Optional[int] = None
    max_recipients: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class ScholarshipResponse(BaseModel):
    """Schema for scholarship response data."""
    id: int
    name: str
    description: Optional[str] = None
    amount: Optional[float] = None
    percentage: Optional[float] = None
    academic_year_id: Optional[int] = None
    max_recipients: Optional[int] = None
    is_active: bool = True

    model_config = {"from_attributes": True}


class StudentScholarshipCreate(BaseModel):
    """Schema for awarding a scholarship to a student."""
    student_id: int = Field(..., description="Student ID")
    scholarship_id: int = Field(..., description="Scholarship ID")
    academic_year_id: Optional[int] = None
    amount: float = Field(..., ge=0)
    granted_on: Optional[date_type] = None


class StudentScholarshipResponse(BaseModel):
    """Schema for student-scholarship response data."""
    id: int
    student_id: int
    scholarship_id: int
    academic_year_id: Optional[int] = None
    amount: float
    granted_on: Optional[date_type] = None
    granted_by: Optional[int] = None

    model_config = {"from_attributes": True}


# â”€â”€ Invoices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class InvoiceItemCreate(BaseModel):
    """Schema for creating an invoice line."""
    fee_head_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=255)
    amount: float = Field(..., ge=0)
    quantity: int = Field(1, ge=1)


class InvoiceItemUpdate(BaseModel):
    """Schema for updating an invoice line (all fields optional)."""
    fee_head_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=255)
    amount: Optional[float] = Field(None, ge=0)
    quantity: Optional[int] = Field(None, ge=1)


class InvoiceItemResponse(BaseModel):
    """Schema for invoice-line response data."""
    id: int
    invoice_id: int
    fee_head_id: Optional[int] = None
    description: Optional[str] = None
    amount: float
    quantity: int = 1

    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    """Schema for creating an invoice."""
    student_id: int = Field(..., description="Student being billed")
    academic_year_id: Optional[int] = None
    class_section_id: Optional[int] = None
    issue_date: Optional[date_type] = None
    due_date: Optional[date_type] = None
    status: str = Field("issued", pattern=INVOICE_STATUS_PATTERN)
    discount_id: Optional[int] = Field(None, description="Discount to apply (percentage or fixed)")
    notes: Optional[str] = None
    items: List[InvoiceItemCreate] = Field(default_factory=list,
                                           description="Invoice lines; amount*quantity are summed")


class InvoiceResponse(BaseModel):
    """Schema for invoice response data (balance is computed by the router)."""
    id: int
    invoice_no: str
    student_id: int
    academic_year_id: Optional[int] = None
    class_section_id: Optional[int] = None
    issue_date: Optional[date_type] = None
    due_date: Optional[date_type] = None
    status: str
    total_amount: float
    discount_amount: float
    paid_amount: float
    balance: float = Field(0.0, description="total_amount - paid_amount, computed server-side")
    notes: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    items: List[InvoiceItemResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class InvoiceCancelRequest(BaseModel):
    """Schema for cancelling an invoice."""
    reason: Optional[str] = Field(None, max_length=255, description="Optional cancellation reason")


# â”€â”€ Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class PaymentCreate(BaseModel):
    """Schema for recording a payment."""
    invoice_id: Optional[int] = Field(None, description="Invoice being paid (NULL = standalone)")
    student_id: Optional[int] = Field(None, description="Required when invoice_id is NULL")
    amount: float = Field(..., description="Payment amount; must be > 0 and within the invoice balance")
    method: str = Field("cash", pattern=PAYMENT_METHOD_PATTERN)
    reference_no: Optional[str] = Field(None, max_length=100)
    paid_on: Optional[date_type] = None
    status: str = Field("successful", pattern=PAYMENT_STATUS_PATTERN)
    note: Optional[str] = None
    provider: Optional[str] = Field(None, max_length=50)


class PaymentResponse(BaseModel):
    """Schema for payment response data."""
    id: int
    invoice_id: Optional[int] = None
    student_id: int
    amount: float
    method: str
    reference_no: Optional[str] = None
    paid_on: Optional[date_type] = None
    status: str
    receipt_no: Optional[str] = None
    note: Optional[str] = None
    provider: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaymentConfirmWebhookRequest(BaseModel):
    """Authoritative gateway webhook body (all fields optional)."""
    provider: Optional[str] = Field(None, max_length=50)
    reference_no: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = Field(None, pattern=PAYMENT_STATUS_PATTERN,
                                   description="Defaults to 'successful'")


class PaymentRefundRequest(BaseModel):
    """Schema for refunding a payment."""
    amount: Optional[float] = Field(None, gt=0, description="Defaults to the full payment amount")
    reason: Optional[str] = Field(None, max_length=255)
    status: str = Field("completed", pattern="^(pending|completed|rejected)$")


class RefundResponse(BaseModel):
    """Schema for refund response data."""
    id: int
    payment_id: int
    amount: float
    reason: Optional[str] = None
    refunded_on: Optional[date_type] = None
    status: str
    processed_by: Optional[int] = None

    model_config = {"from_attributes": True}


# â”€â”€ Fines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class FineCreate(BaseModel):
    """Schema for levying a fine."""
    student_id: int = Field(..., description="Student being fined")
    invoice_id: Optional[int] = None
    amount: float = Field(..., gt=0)
    reason: Optional[str] = Field(None, max_length=255)
    levied_on: Optional[date_type] = None


class FineUpdate(BaseModel):
    """Schema for updating a fine (all fields optional)."""
    amount: Optional[float] = Field(None, gt=0)
    reason: Optional[str] = Field(None, max_length=255)
    levied_on: Optional[date_type] = None


class FineResponse(BaseModel):
    """Schema for fine response data."""
    id: int
    student_id: int
    invoice_id: Optional[int] = None
    amount: float
    reason: Optional[str] = None
    levied_on: Optional[date_type] = None
    is_waived: bool = False
    waived_by: Optional[int] = None

    model_config = {"from_attributes": True}


# â”€â”€ Accounting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class ExpenseCategoryCreate(BaseModel):
    """Schema for creating an expense category."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)


class ExpenseCategoryUpdate(BaseModel):
    """Schema for updating an expense category (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)


class ExpenseCategoryResponse(BaseModel):
    """Schema for expense-category response data."""
    id: int
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    """Schema for recording an expense."""
    category_id: int = Field(..., description="Expense category ID")
    expense_date: Optional[date_type] = None
    amount: float = Field(..., gt=0)
    payee: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = Field(None, max_length=255)
    payment_method: Optional[str] = Field(None, pattern=PAYMENT_METHOD_PATTERN)
    reference_no: Optional[str] = Field(None, max_length=100)
    status: str = Field("pending", pattern="^(pending|approved|paid|rejected)$")


class ExpenseUpdate(BaseModel):
    """Schema for updating an expense (all fields optional)."""
    category_id: Optional[int] = None
    expense_date: Optional[date_type] = None
    amount: Optional[float] = Field(None, gt=0)
    payee: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = Field(None, max_length=255)
    payment_method: Optional[str] = Field(None, pattern=PAYMENT_METHOD_PATTERN)
    reference_no: Optional[str] = Field(None, max_length=100)


class ExpenseResponse(BaseModel):
    """Schema for expense response data."""
    id: int
    category_id: int
    expense_date: Optional[date_type] = None
    amount: float
    payee: Optional[str] = None
    description: Optional[str] = None
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    status: str
    approved_by: Optional[int] = None
    approved_on: Optional[date_type] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class IncomeCreate(BaseModel):
    """Schema for recording income."""
    source: str = Field("other", min_length=1, max_length=50,
                        description="fees/admission/donation/other")
    source_ref: Optional[str] = Field(None, max_length=80)
    amount: float = Field(..., gt=0)
    received_on: Optional[date_type] = None
    mode: Optional[str] = Field(None, pattern=PAYMENT_METHOD_PATTERN)
    note: Optional[str] = Field(None, max_length=255)


class IncomeResponse(BaseModel):
    """Schema for income response data."""
    id: int
    source: str
    source_ref: Optional[str] = None
    amount: float
    received_on: Optional[date_type] = None
    mode: Optional[str] = None
    note: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# â”€â”€ Finance reporting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class FinanceSummaryResponse(BaseModel):
    """Aggregate finance dashboard. All fields are zero-safe on an empty DB.

    `total_billed` is gross (before discounts); `net_billed` is what is actually
    payable. `collected` is successful payments minus completed refunds, so
    `outstanding` (= net_billed - collected, floored at 0) can legitimately
    differ from `total_billed - collected` when a discount is in play.
    """
    total_billed: float = 0.0
    net_billed: float = 0.0
    collected: float = 0.0
    outstanding: float = 0.0
    outstanding_by_student: dict = Field(default_factory=dict,
                                        description="student_id -> outstanding balance")
    overdue: float = 0.0
    today_collection: float = 0.0
    month_collection: float = 0.0
    by_fee_head: List[dict] = Field(default_factory=list)
    expenses_total: float = 0.0
    expense_by_category: List[dict] = Field(default_factory=list)
    income_by_source: List[dict] = Field(default_factory=list)


class IncomeStatementResponse(BaseModel):
    """Income statement over a date range."""
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None
    income_by_source: List[dict] = Field(default_factory=list)
    expense_by_category: List[dict] = Field(default_factory=list)
    net_surplus: float = 0.0


class OutstandingStudentResponse(BaseModel):
    """One row of the per-student outstanding list."""
    student_id: int
    student_name: Optional[str] = None
    grade: Optional[str] = None
    total_billed: float = 0.0
    total_paid: float = 0.0
    outstanding: float = 0.0
    overdue_amount: float = 0.0
    days_overdue: int = 0
    invoice_count: int = 0


# ─── Exams & Report Cards (Phase-2, additive) ──────────────────────────────

#: Allowed values for ``Exam.exam_type``.
EXAM_TYPE_PATTERN = ("^(unit_test|periodic_test|mid_term|final_exam"
                     "|practical|internal_assessment)$")

#: Allowed values for ``ReportCard.result``.
RESULT_PATTERN = "^(pass|fail|compartmental)$"


# ── Grade scales ───────────────────────────────────────────────────────────

class GradeScaleBase(BaseModel):
    """Base schema with shared grade-scale band attributes."""
    name: str = Field(..., min_length=1, max_length=100,
                      description="Scale name, e.g. 'Default CBSE' (unique)")
    description: Optional[str] = Field(None, max_length=255)
    is_default: bool = Field(False, description="Scale used when grading")
    min_percentage: float = Field(0.0, ge=0, le=100)
    max_percentage: float = Field(100.0, ge=0, le=100)
    letter_grade: str = Field(..., min_length=1, max_length=5, description="A+, A, B+, ... F")
    grade_point: float = Field(0.0, ge=0, le=10)


class GradeScaleCreate(GradeScaleBase):
    """Schema for creating a grade-scale band."""
    pass


class GradeScaleUpdate(BaseModel):
    """Schema for updating a grade-scale band (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    is_default: Optional[bool] = None
    min_percentage: Optional[float] = Field(None, ge=0, le=100)
    max_percentage: Optional[float] = Field(None, ge=0, le=100)
    letter_grade: Optional[str] = Field(None, min_length=1, max_length=5)
    grade_point: Optional[float] = Field(None, ge=0, le=10)


class GradeScaleResponse(GradeScaleBase):
    """Schema for grade-scale response data."""
    id: int

    model_config = {"from_attributes": True}


# ── Exams ──────────────────────────────────────────────────────────────────

class ExamBase(BaseModel):
    """Base schema with shared exam attributes."""
    name: str = Field(..., min_length=1, max_length=150, description="Exam name")
    exam_type: str = Field("unit_test", pattern=EXAM_TYPE_PATTERN,
                           description="unit_test/periodic_test/mid_term/final_exam/"
                                       "practical/internal_assessment")
    academic_year_id: Optional[int] = Field(None, description="Academic year ID")
    class_section_id: Optional[int] = Field(None,
                                            description="Class section ID; null = whole school")
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None
    max_marks: float = Field(100.0, gt=0, description="Default max marks per subject paper")
    pass_marks: float = Field(33.0, ge=0, description="Default pass marks per subject paper")
    weightage: float = Field(0.0, ge=0, le=100,
                             description="Percentage weight of this exam in the overall")
    remarks: Optional[str] = None


class ExamCreate(ExamBase):
    """Schema for creating an exam."""
    pass


class ExamUpdate(BaseModel):
    """Schema for updating an exam (all fields optional; publication flags excluded)."""
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    exam_type: Optional[str] = Field(None, pattern=EXAM_TYPE_PATTERN)
    academic_year_id: Optional[int] = None
    class_section_id: Optional[int] = None
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None
    max_marks: Optional[float] = Field(None, gt=0)
    pass_marks: Optional[float] = Field(None, ge=0)
    weightage: Optional[float] = Field(None, ge=0, le=100)
    remarks: Optional[str] = None


class ExamSubjectSummary(BaseModel):
    """Lightweight exam-subject row embedded in `ExamResponse.subjects`."""
    id: int
    subject_id: int
    subject_name: Optional[str] = None
    max_marks: Optional[float] = None
    exam_date: Optional[date_type] = None
    room: Optional[str] = None
    invigilator_id: Optional[int] = None

    model_config = {"from_attributes": True}


class ExamResponse(ExamBase):
    """Schema for exam response data.

    `subjects` and `student_count` are computed by the router and are only
    populated on endpoints that ask for them (GET /exams/, GET /exams/{id}).
    """
    id: int
    is_published: bool = False
    published_at: Optional[datetime] = None
    result_published: bool = False
    result_published_at: Optional[datetime] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    subjects: Optional[List[ExamSubjectSummary]] = None
    student_count: Optional[int] = None

    model_config = {"from_attributes": True}


# ── Exam subjects ──────────────────────────────────────────────────────────

class ExamSubjectBase(BaseModel):
    """Base schema with shared exam-subject attributes."""
    exam_id: int = Field(..., description="Exam ID")
    subject_id: int = Field(..., description="Subject ID")
    max_marks: Optional[float] = Field(None, gt=0, description="Overrides Exam.max_marks")
    exam_date: Optional[date_type] = None
    room: Optional[str] = Field(None, max_length=50)
    invigilator_id: Optional[int] = Field(None, description="Teacher ID")


class ExamSubjectCreate(ExamSubjectBase):
    """Schema for adding a subject paper to an exam."""
    pass


class ExamSubjectUpdate(BaseModel):
    """Schema for updating an exam-subject paper (all fields optional)."""
    exam_id: Optional[int] = None
    subject_id: Optional[int] = None
    max_marks: Optional[float] = Field(None, gt=0)
    exam_date: Optional[date_type] = None
    room: Optional[str] = Field(None, max_length=50)
    invigilator_id: Optional[int] = None


class ExamSubjectResponse(ExamSubjectBase):
    """Schema for exam-subject response data."""
    id: int
    subject_name: Optional[str] = Field(None, description="Resolved subject name")

    model_config = {"from_attributes": True}


# ── Exam enrollments ───────────────────────────────────────────────────────

class ExamEnrollmentBase(BaseModel):
    """Base schema with shared exam-enrollment attributes."""
    exam_id: int = Field(..., description="Exam ID")
    student_id: int = Field(..., description="Student ID")
    roll_no: Optional[str] = Field(None, max_length=20)
    is_absent: bool = Field(False)
    exempted: bool = Field(False)
    reexam: bool = Field(False)


class ExamEnrollmentCreate(ExamEnrollmentBase):
    """Schema for creating a single exam enrollment."""
    pass


class ExamEnrollmentUpdate(BaseModel):
    """Schema for updating an exam enrollment (all fields optional)."""
    exam_id: Optional[int] = None
    student_id: Optional[int] = None
    roll_no: Optional[str] = Field(None, max_length=20)
    is_absent: Optional[bool] = None
    exempted: Optional[bool] = None
    reexam: Optional[bool] = None


class ExamEnrollmentResponse(ExamEnrollmentBase):
    """Schema for exam-enrollment response data."""
    id: int
    student_name: Optional[str] = Field(None, description="Resolved student name")

    model_config = {"from_attributes": True}


class BulkEnrollRequest(BaseModel):
    """Bulk enrollment payload: `{exam_id, student_ids: [...]}`."""
    exam_id: int = Field(..., description="Exam to enroll into")
    student_ids: List[int] = Field(default_factory=list, description="Student IDs to enroll")


# ── Exam marks ─────────────────────────────────────────────────────────────

class ExamMarkBase(BaseModel):
    """Base schema with shared exam-mark attributes."""
    # NOTE: deliberately no `ge`/`le` here. A score outside
    # 0..exam_subject.max_marks must surface as a clean 400 from the router
    # (`_validate_score`) rather than a pydantic 422 validation error.
    score: Optional[float] = Field(None, description="0 <= score <= exam_subject.max_marks")
    is_absent: bool = Field(False)
    is_exempted: bool = Field(False)


class ExamMarkCreate(ExamMarkBase):
    """Schema for creating an exam mark row."""
    exam_subject_id: int = Field(..., description="ExamSubject ID")
    exam_enrollment_id: int = Field(..., description="ExamEnrollment ID")


class ExamMarkUpdate(BaseModel):
    """Schema for updating an exam mark (all fields optional)."""
    score: Optional[float] = Field(None)  # range checked by the router -> 400
    is_absent: Optional[bool] = None
    is_exempted: Optional[bool] = None


class ExamMarkResponse(ExamMarkBase):
    """Schema for exam-mark response data."""
    id: int
    exam_subject_id: int
    exam_enrollment_id: int
    exam_id: Optional[int] = Field(None, description="Convenience: parent exam ID")
    student_id: Optional[int] = Field(None, description="Convenience: resolved student ID")
    subject_id: Optional[int] = Field(None, description="Convenience: resolved subject ID")
    subject_name: Optional[str] = None
    max_marks: Optional[float] = None
    entered_by: Optional[int] = None
    entered_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BulkMarkItem(BaseModel):
    """One row inside a `BulkMarksRequest`."""
    student_id: int = Field(..., description="Student ID (must be enrolled in the exam)")
    subject_id: int = Field(..., description="Subject ID (must be a paper of the exam)")
    # Range-checked per row by the router so one bad row lands in `errors[]`
    # instead of rejecting the whole batch with a 422.
    score: Optional[float] = Field(None)
    is_absent: Optional[bool] = False
    is_exempted: Optional[bool] = False


class BulkMarksRequest(BaseModel):
    """Bulk upsert payload: `{exam_id, marks: [...]}`."""
    exam_id: int = Field(..., description="Exam the marks belong to")
    marks: List[BulkMarkItem] = Field(default_factory=list)


# ── Report cards ───────────────────────────────────────────────────────────

class ReportCardSubjectRow(BaseModel):
    """One subject row inside `ReportCardResponse.subjects` (computed)."""
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    score: Optional[float] = None
    max_marks: Optional[float] = None
    percentage: Optional[float] = None
    is_absent: bool = False
    is_exempted: bool = False
    is_pass: bool = True


class ReportCardBase(BaseModel):
    """Base schema with shared report-card attributes."""
    total_marks: float = Field(0.0, ge=0)
    max_total_marks: float = Field(0.0, ge=0)
    percentage: float = Field(0.0, ge=0, le=100)
    grade: Optional[str] = Field(None, max_length=5)
    grade_point: float = Field(0.0, ge=0, le=10)
    result: str = Field("pass", pattern=RESULT_PATTERN)
    rank: Optional[int] = None
    class_rank: Optional[int] = None
    attendance_percentage: Optional[float] = Field(None, ge=0, le=100)
    teacher_remarks: Optional[str] = None
    principal_remarks: Optional[str] = None


class ReportCardCreate(BaseModel):
    """Schema for manually creating a report card (admin/principal)."""
    student_id: int
    exam_id: int
    academic_year_id: Optional[int] = None
    class_section_id: Optional[int] = None
    total_marks: float = Field(0.0, ge=0)
    max_total_marks: float = Field(0.0, ge=0)
    percentage: float = Field(0.0, ge=0, le=100)
    grade: Optional[str] = Field(None, max_length=5)
    grade_point: float = Field(0.0, ge=0, le=10)
    result: str = Field("pass", pattern=RESULT_PATTERN)


class ReportCardUpdate(BaseModel):
    """Schema for updating a report card (remarks / editorial fields)."""
    rank: Optional[int] = None
    class_rank: Optional[int] = None
    attendance_percentage: Optional[float] = Field(None, ge=0, le=100)
    teacher_remarks: Optional[str] = None
    principal_remarks: Optional[str] = None
    result: Optional[str] = Field(None, pattern=RESULT_PATTERN)


class ReportCardResponse(ReportCardBase):
    """Schema for report-card response data.

    `subjects` (per-subject breakdown) is computed by the router from the
    exam_marks rows; it is not a mapped column.
    """
    id: int
    student_id: int
    exam_id: int
    academic_year_id: Optional[int] = None
    class_section_id: Optional[int] = None
    student_name: Optional[str] = Field(None, description="Resolved student name")
    exam_name: Optional[str] = Field(None, description="Resolved exam name")
    is_published: bool = False
    published_at: Optional[datetime] = None
    generated_by: Optional[int] = None
    created_at: Optional[datetime] = None
    subjects: Optional[List[ReportCardSubjectRow]] = None

    model_config = {"from_attributes": True}


class PublishBulkRequest(BaseModel):
    """Bulk report-card publication payload: `{exam_id}`."""
    exam_id: int = Field(..., description="Publish every report card for this exam")


class SubjectStatRow(BaseModel):
    """One subject row in the exam results sheet."""
    subject_id: Optional[int] = None
    subject: Optional[str] = None
    students_count: int = 0
    highest: float = 0.0
    lowest: float = 0.0
    average: float = 0.0
    pass_count: int = 0
    pass_percentage: float = 0.0
