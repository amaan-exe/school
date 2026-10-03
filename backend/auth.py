"""JWT authentication utilities for the school management system."""

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User

# Configuration (SECRET_KEY env override keeps existing tokens working via fallback default)
SECRET_KEY = os.environ.get("SECRET_KEY", "babyland-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password.

    Args:
        plain_password: The plain text password to verify.
        hashed_password: The bcrypt hashed password.

    Returns:
        True if the password matches, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password: The plain text password to hash.

    Returns:
        The bcrypt hashed password.
    """
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Create a JWT access token.

    Args:
        data: The data to encode in the token (should include user id, email, role).
        expires_delta: Optional custom expiration time. Defaults to 24 hours.

    Returns:
        The encoded JWT token string.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> dict:
    """Verify and decode a JWT token.

    Args:
        token: The JWT token string to verify.

    Returns:
        The decoded token payload.

    Raises:
        HTTPException: If the token is invalid or expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")
        if user_id is None or email is None or role is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Get the current authenticated user from the JWT token.

    Args:
        token: The JWT token extracted from the Authorization header.
        db: Database session dependency.

    Returns:
        The authenticated User object.

    Raises:
        HTTPException: If the token is invalid, the user is not found, or inactive.
    """
    payload = verify_token(token)
    user_id: int = int(payload.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if getattr(user, "is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(roles: list[str]):
    """Dependency factory that checks if the current user has one of the allowed roles.

    Args:
        roles: List of allowed roles (e.g., ["admin", "teacher"]).

    Returns:
        A dependency function that validates the user's role.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role(s): {', '.join(roles)}",
            )
        return current_user
    return role_checker


#: Alias kept for readability at call sites that gate on "any of these roles".
require_any_role = require_role


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency factory that restricts an endpoint to admins."""
    return require_role(["admin"])(current_user)


def get_user_roles(user: User, db: Session) -> list:
    """Return every role name held by a user, primary role first.

    Args:
        user: The authenticated user.
        db: Database session.

    Returns:
        List of role names (de-duplicated, `user.role` always first).
    """
    # Delayed import to avoid circulars at module load.
    from models import Role, UserRole

    roles: list = []
    if getattr(user, "role", None):
        roles.append(user.role)
    rows = (
        db.query(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user.id)
        .all()
    )
    for (name,) in rows:
        if name and name not in roles:
            roles.append(name)
    return roles


def _legacy_role_defaults() -> dict:
    """Role-name fallback grants mirroring the existing hand-written guards.

    These keep pre-existing behaviour intact for users that have no RolePermission
    rows yet (e.g. before run_phase3_migration has ever executed).
    """
    mods = {
        "dashboard", "students", "teachers", "staff", "users", "classes", "subjects",
        "attendance", "marks", "exams", "assignments", "timetable", "calendar",
        "notices", "fees", "finance", "invoices", "library", "inventory",
        "transport", "hr", "reports", "audit", "website", "crm",
    }
    R, W, D, X = "read", "write", "delete", "export"

    def grant(role, reads=(), writes=(), deletes=(), exports=()):
        perms = set()
        for m in reads:
            perms.add((m, R))
        for m in writes:
            perms.update({(m, R), (m, W)})
        for m in deletes:
            perms.update({(m, R), (m, W), (m, D)})
        for m in exports:
            perms.update({(m, R), (m, X)})
        return perms

    return {
        # staff: reads almost everything, writes students/notices/fees (the three
        # modules the existing local _staff_can guards special-case).
        "staff": grant("staff", reads=mods - {"fees", "finance", "invoices"},
                       writes=("students", "notices", "fees"),
                       exports=("students", "fees", "reports")),
        # teacher: academics read + writes on the teaching workflow.
        "teacher": grant("teacher",
                         reads=("students", "classes", "subjects", "attendance", "marks",
                                "assignments", "timetable", "calendar", "notices", "reports"),
                         writes=("attendance", "marks", "assignments", "timetable", "calendar", "notices")),
        "student": grant("student", reads=("dashboard", "students", "classes", "subjects",
                                           "attendance", "marks", "assignments", "timetable",
                                           "calendar", "notices", "fees")),
        "parent": grant("parent", reads=("dashboard", "students", "classes", "subjects",
                                         "attendance", "marks", "assignments", "timetable",
                                         "calendar", "notices", "fees")),
    }


def get_user_permissions(user: User, db: Session) -> set:
    """Resolve the effective (module, action) grants for a user.

    Resolution order (union of all sources, admin short-circuits to "*"):
      1. ``users.role == "admin"``  -> the sentinel ``{"*", "*"}`` (allow-all).
      2. UserRole -> Role -> RolePermission rows (the new RBAC catalogue).
      3. StaffPermission rows for existing staff profiles (legacy per-module grants).
      4. Role-name defaults for the original 5 roles, so behaviour is preserved
         even when the seed has not produced RolePermission rows yet.

    Args:
        user: The authenticated user.
        db: Database session.

    Returns:
        Set of ``(module, action)`` tuples, or ``{("*", "*")}`` for admins.
    """
    if getattr(user, "role", None) == "admin":
        return {("*", "*")}

    # Delayed import to avoid circulars at module load.
    from models import Permission, Role, RolePermission, StaffPermission, StaffProfile, UserRole

    perms: set = set()

    # 1. RBAC catalogue: roles held by the user (including the primary role).
    role_names = get_user_roles(user, db)
    if role_names:
        rows = (
            db.query(Permission.module, Permission.action)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .filter(Role.name.in_(role_names))
            .all()
        )
        perms.update({(module, action) for module, action in rows})

    # 2. Legacy staff module grants.
    if user.role == "staff":
        profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
        if profile is not None:
            for row in db.query(StaffPermission).filter(
                StaffPermission.staff_profile_id == profile.id
            ).all():
                if row.can_read:
                    perms.add((row.module, "read"))
                if row.can_write:
                    perms.add((row.module, "write"))
                if row.can_delete:
                    perms.add((row.module, "delete"))

    # 3. Role-name defaults for the original 5 roles. Unioned in so existing
    #    behaviour is preserved even before/without catalogue rows.
    defaults = _legacy_role_defaults()
    for name in role_names:
        perms.update(defaults.get(name, set()))

    return perms


def has_permission(user: User, db: Session, module: str, action: str = "read") -> bool:
    """Return True if the user may perform `action` on `module`."""
    perms = get_user_permissions(user, db)
    if ("*", "*") in perms:
        return True
    return (module, action) in perms


def require_permission(module: str, action: str = "read"):
    """Dependency factory enforcing module permissions via the RBAC catalogue.

    Phase-1 wiring: the check now goes through :func:`get_user_permissions`, which
    unions UserRole->RolePermission grants with legacy StaffPermission rows and the
    role-name defaults. Behaviour for admins, staff profiles, and the 403s handed to
    teacher/student/parent is preserved.

    Args:
        module: Module name (e.g. "students", "fees").
        action: One of "read", "write", "create", "delete", "export".

    Returns:
        A dependency function that validates the permission.
    """
    normalized = {"read": "read", "write": "write", "create": "create",
                  "delete": "delete", "export": "export"}.get(action, "read")

    def permission_checker(current_user: User = Depends(get_current_user),
                           db: Session = Depends(get_db)) -> User:
        if current_user.role == "admin":
            return current_user
        perms = get_user_permissions(current_user, db)
        if ("*", "*") in perms:
            return current_user
        if (module, normalized) in perms:
            return current_user
        # Staff profiles with an explicit denial keep the legacy message.
        if current_user.role != "staff":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions for module '{module}'.",
            )
        from models import StaffPermission, StaffProfile
        profile = db.query(StaffProfile).filter(StaffProfile.user_id == current_user.id).first()
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions for module '{module}'.",
            )
        column = {"read": "can_read", "write": "can_write", "delete": "can_delete"}.get(
            normalized, "can_read")
        perm = (
            db.query(StaffPermission)
            .filter(StaffPermission.staff_profile_id == profile.id,
                    StaffPermission.module == module)
            .first()
        )
        if perm is None or not bool(getattr(perm, column, False)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions for module '{module}'.",
            )
        return current_user

    return permission_checker


def require_module_permission(module: str, action: str = "read"):
    """Alias of :func:`require_permission` (kept for call-site readability)."""
    return require_permission(module, action)


def resolve_student_ids(user: User, db: Session) -> Optional[list]:
    """Resolve the student IDs visible to a user.

    Args:
        user: The authenticated user.
        db: Database session.

    Returns:
        List of student IDs for student/parent/teacher roles,
        or None meaning "all students" (admin/staff).
    """
    # Delayed imports to avoid circulars.
    from models import ParentStudentLink, Student, TeacherAssignment

    if user.role == "student":
        if user.student_id is not None:
            return [user.student_id]
        return []
    if user.role == "parent":
        links = (
            db.query(ParentStudentLink)
            .filter(ParentStudentLink.parent_user_id == user.id)
            .all()
        )
        ids = [link.student_id for link in links]
        if not ids and user.student_id is not None:
            ids = [user.student_id]
        return ids
    if user.role == "teacher":
        if user.teacher_id is None:
            return []
        rows = (
            db.query(TeacherAssignment.class_section_id)
            .filter(TeacherAssignment.teacher_id == user.teacher_id)
            .distinct()
            .all()
        )
        section_ids = [r[0] for r in rows if r[0] is not None]
        if not section_ids:
            return []
        students = (
            db.query(Student.id)
            .filter(Student.class_section_id.in_(section_ids))
            .all()
        )
        return [s[0] for s in students]
    # admin / staff see all
    return None
