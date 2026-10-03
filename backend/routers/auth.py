"""Authentication router with user management endpoints."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import User
from schemas import (
    UserCreate, UserLogin, UserResponse, UserUpdate, Token,
    PortalLoginRequest, MyPermissionsResponse, StudentResponse, ClassSectionResponse,
    StaffProfileResponse,
)
from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    require_role,
)

router = APIRouter()


def _issue_token(user: User) -> dict:
    """Create the standard {access_token, token_type, user} payload for a user."""
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
    }


def _log_audit(db: Session, actor_id, action: str, entity_type: str, entity_id=None, meta: str = None):
    """Best-effort audit insert (never breaks the main request)."""
    try:
        from models import AuditLog
        db.add(AuditLog(actor_user_id=actor_id, action=action,
                        entity_type=entity_type, entity_id=entity_id, meta_json=meta))
        db.commit()
    except Exception:
        db.rollback()


def _backfill_user_role(db: Session, user: User) -> None:
    """Link a user's primary `users.role` to the matching `roles` row (Phase-1).

    Best-effort and idempotent: keeps `user_roles` in sync for newly created
    accounts so permission resolution works for the widened role set.
    """
    try:
        from models import Role, UserRole
        role = db.query(Role).filter(Role.name == user.role).first()
        if role is None:
            return
        exists = (db.query(UserRole)
                  .filter(UserRole.user_id == user.id, UserRole.role_id == role.id)
                  .first())
        if exists is None:
            db.add(UserRole(user_id=user.id, role_id=role.id))
            db.commit()
    except Exception:
        db.rollback()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Register a new user (admin only)")
def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Register a new user account. Admin only.

    Note: This endpoint was open in the prototype; per the role-based spec it is
    now restricted to admins for creating staff/role accounts.

    Args:
        user_data: The user registration data.
        db: Database session dependency.
        current_user: The authenticated admin user.

    Returns:
        The newly created user.

    Raises:
        HTTPException: If the email is already registered.
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Hash the password
    hashed_password = get_password_hash(user_data.password)

    # Create user
    db_user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hashed_password,
        role=user_data.role,
        student_id=user_data.student_id,
        teacher_id=user_data.teacher_id,
    )
    db.add(db_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    db.refresh(db_user)
    _backfill_user_role(db, db_user)
    _log_audit(db, current_user.id, "user.register", "users", db_user.id)
    return db_user


@router.post("/login", response_model=Token, summary="Login and get access token")
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Authenticate a user and return a JWT access token.

    Args:
        user_data: The login credentials (email and password).
        db: Database session dependency.

    Returns:
        A JWT token and user information.

    Raises:
        HTTPException: If the credentials are invalid.
    """
    # Find user by email
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Inactive accounts cannot log in
    if getattr(user, "is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token (sub stays a STRING)
    return _issue_token(user)


@router.post("/portal/login", response_model=Token, summary="Portal-scoped login")
def portal_login(portal_data: PortalLoginRequest, db: Session = Depends(get_db)):
    """Authenticate against a specific portal (admin/staff/teacher/student/parent).

    The user's role must match the requested portal, otherwise 403 with a hint
    about which portal to use.

    Args:
        portal_data: Email, password, and portal name.
        db: Database session dependency.

    Returns:
        A JWT token and user information (same shape as /login).
    """
    user = db.query(User).filter(User.email == portal_data.email).first()
    if not user or not verify_password(portal_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if getattr(user, "is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.role != portal_data.portal:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Use the {user.role} portal",
        )
    payload = _issue_token(user)
    _log_audit(db, user.id, "auth.portal_login", "users", user.id,
               meta=f'{{"portal": "{portal_data.portal}"}}')
    return payload


@router.get("/me", response_model=UserResponse, summary="Get current user info")
def get_me(current_user: User = Depends(get_current_user)):
    """Get information about the currently authenticated user.

    Args:
        current_user: The authenticated user (from JWT token).

    Returns:
        The current user's information.
    """
    return current_user


@router.get("/me/permissions", response_model=MyPermissionsResponse, summary="Get sidebar-gating data")
def get_my_permissions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return role, module permissions, and scoped children/sections for sidebar gating.

    Args:
        current_user: The authenticated user (from JWT token).
        db: Database session dependency.

    Returns:
        Role plus permissions list and scoped children/class sections/profile,
        plus the Phase-1 `all_permissions` (module -> allowed actions) and `roles`
        (every role the caller holds, primary role first).
    """
    from models import ParentStudentLink, StaffPermission, StaffProfile, Student, TeacherAssignment, ClassSection
    from auth import get_user_permissions, get_user_roles

    permissions: list = []
    children: list = []
    class_sections: list = []
    profile = None

    if current_user.role == "admin":
        permissions = ["*"]
    elif current_user.role == "staff":
        profile = db.query(StaffProfile).filter(StaffProfile.user_id == current_user.id).first()
        if profile is not None:
            rows = db.query(StaffPermission).filter(StaffPermission.staff_profile_id == profile.id).all()
            for row in rows:
                if row.can_read:
                    permissions.append(f"{row.module}:read")
                if row.can_write:
                    permissions.append(f"{row.module}:write")
                if row.can_delete:
                    permissions.append(f"{row.module}:delete")
    elif current_user.role == "parent":
        links = db.query(ParentStudentLink).filter(
            ParentStudentLink.parent_user_id == current_user.id).all()
        student_ids = [link.student_id for link in links]
        if not student_ids and current_user.student_id is not None:
            student_ids = [current_user.student_id]
        if student_ids:
            children = db.query(Student).filter(Student.id.in_(student_ids)).all()
    elif current_user.role == "student":
        if current_user.student_id is not None:
            child = db.query(Student).filter(Student.id == current_user.student_id).first()
            if child is not None:
                children = [child]
    elif current_user.role == "teacher":
        if current_user.teacher_id is not None:
            section_ids = [
                r[0] for r in db.query(TeacherAssignment.class_section_id)
                .filter(TeacherAssignment.teacher_id == current_user.teacher_id)
                .distinct().all()
            ]
            if section_ids:
                class_sections = db.query(ClassSection).filter(ClassSection.id.in_(section_ids)).all()

    # ── Phase-1 additions (existing keys above are untouched) ──
    resolved = get_user_permissions(current_user, db)
    all_permissions: dict = {}
    if ("*", "*") in resolved:
        # Admins see the full catalogue, read-only for dashboard.
        from schemas import PERMISSION_ACTIONS, PERMISSION_MODULES
        for module in PERMISSION_MODULES:
            actions = list(PERMISSION_ACTIONS)
            if module == "dashboard":
                actions = ["read"]
            all_permissions[module] = actions
    else:
        for module, action in sorted(resolved):
            all_permissions.setdefault(module, []).append(action)
        for module in all_permissions:
            all_permissions[module].sort()

    roles = get_user_roles(current_user, db)

    return {
        "role": current_user.role,
        "permissions": permissions,
        "children": children,
        "class_sections": class_sections,
        "profile": profile,
        "all_permissions": all_permissions,
        "roles": roles,
    }


@router.get("/users", response_model=List[UserResponse], summary="List all users (admin only)")
def get_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Retrieve a list of all users. Admin only.

    Args:
        skip: Number of records to skip (for pagination).
        limit: Maximum number of records to return.
        db: Database session dependency.
        current_user: The authenticated admin user.

    Returns:
        List of user records.
    """
    users = db.query(User).offset(skip).limit(limit).all()
    return users


@router.put("/users/{user_id}", response_model=UserResponse, summary="Update a user (admin only)")
def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update an existing user's information. Admin only.

    Args:
        user_id: The unique identifier of the user to update.
        user_update: The updated user data.
        db: Database session dependency.
        current_user: The authenticated admin user.

    Returns:
        The updated user record.

    Raises:
        HTTPException: If the user is not found.
    """
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found",
        )

    update_data = user_update.model_dump(exclude_unset=True)

    # Hash password if it's being updated
    if "password" in update_data:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))

    for field, value in update_data.items():
        setattr(db_user, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    db.refresh(db_user)
    # Keep user_roles in sync when the primary role changes.
    _backfill_user_role(db, db_user)
    return db_user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a user (admin only)")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a user account. Admin only.

    Args:
        user_id: The unique identifier of the user to delete.
        db: Database session dependency.
        current_user: The authenticated admin user.

    Raises:
        HTTPException: If the user is not found.
    """
    db_user = db.query(User).filter(User.id == user_id).first()
    if db_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found",
        )

    db.delete(db_user)
    db.commit()
