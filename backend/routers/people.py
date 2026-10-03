"""People router: staff profiles/permissions, teacher assignments, parent links."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import ParentStudentLink, StaffPermission, StaffProfile, TeacherAssignment, User, Student, Teacher
from schemas import (
    ParentStudentLinkCreate, ParentStudentLinkUpdate, ParentStudentLinkResponse,
    StaffPermissionCreate, StaffPermissionUpdate, StaffPermissionResponse,
    StaffProfileCreate, StaffProfileUpdate, StaffProfileResponse,
    TeacherAssignmentCreate, TeacherAssignmentUpdate, TeacherAssignmentResponse,
)
from auth import get_current_user, require_role

router = APIRouter()


# ─── Staff Profiles (admin only) ──────────────────────────────────────────────

@router.get("/staff/", response_model=List[StaffProfileResponse], summary="List staff profiles (admin)")
def list_staff(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """List all staff profiles. Admin only.

    Args:
        skip: Records to skip. limit: Max records.
        db: Database session. current_user: Admin user.

    Returns:
        List of staff profiles.
    """
    return db.query(StaffProfile).offset(skip).limit(limit).all()


@router.post("/staff/", response_model=StaffProfileResponse, status_code=status.HTTP_201_CREATED, summary="Create staff profile (admin)")
def create_staff_profile(
    payload: StaffProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a staff profile linked to a staff-role user. Admin only.

    Args:
        payload: Profile data including user_id.
        db: Database session. current_user: Admin user.

    Returns:
        The new staff profile.
    """
    user = db.query(User).filter(User.id == payload.user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"User with id {payload.user_id} not found")
    db_profile = StaffProfile(**payload.model_dump())
    db.add(db_profile)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Staff profile already exists for this user")
    db.refresh(db_profile)
    return db_profile


@router.get("/staff/permissions/", response_model=List[StaffPermissionResponse], summary="List staff permissions (admin)")
def list_staff_permissions(
    staff_profile_id: int = Query(None, description="Filter by staff profile ID"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """List staff permissions, optionally filtered by profile. Admin only."""
    query = db.query(StaffPermission)
    if staff_profile_id is not None:
        query = query.filter(StaffPermission.staff_profile_id == staff_profile_id)
    return query.offset(skip).limit(limit).all()


@router.post("/staff/permissions/", response_model=StaffPermissionResponse, status_code=status.HTTP_201_CREATED, summary="Grant staff permission (admin)")
def create_staff_permission(
    payload: StaffPermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Grant a module permission to a staff profile. Admin only."""
    profile = db.query(StaffProfile).filter(StaffProfile.id == payload.staff_profile_id).first()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Staff profile with id {payload.staff_profile_id} not found")
    db_perm = StaffPermission(**payload.model_dump())
    db.add(db_perm)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Permission already exists for this profile and module")
    db.refresh(db_perm)
    return db_perm


@router.put("/staff/permissions/{perm_id}", response_model=StaffPermissionResponse, summary="Update staff permission (admin)")
def update_staff_permission(
    perm_id: int,
    payload: StaffPermissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a staff permission grant. Admin only."""
    perm = db.query(StaffPermission).filter(StaffPermission.id == perm_id).first()
    if perm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Permission with id {perm_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(perm, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Permission already exists for this profile and module")
    db.refresh(perm)
    return perm


@router.delete("/staff/permissions/{perm_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke staff permission (admin)")
def delete_staff_permission(
    perm_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Revoke a staff permission. Admin only."""
    perm = db.query(StaffPermission).filter(StaffPermission.id == perm_id).first()
    if perm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Permission with id {perm_id} not found")
    db.delete(perm)
    db.commit()


@router.get("/staff/{profile_id}", response_model=StaffProfileResponse, summary="Get staff profile (admin)")
def get_staff_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Get a staff profile by ID. Admin only."""
    profile = db.query(StaffProfile).filter(StaffProfile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Staff profile with id {profile_id} not found")
    return profile


@router.put("/staff/{profile_id}", response_model=StaffProfileResponse, summary="Update staff profile (admin)")
def update_staff_profile(
    profile_id: int,
    payload: StaffProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a staff profile. Admin only."""
    profile = db.query(StaffProfile).filter(StaffProfile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Staff profile with id {profile_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/staff/{profile_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete staff profile (admin)")
def delete_staff_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a staff profile. Admin only."""
    profile = db.query(StaffProfile).filter(StaffProfile.id == profile_id).first()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Staff profile with id {profile_id} not found")
    db.delete(profile)
    db.commit()


# ─── Teacher Assignments ──────────────────────────────────────────────────────

@router.get("/teacher-assignments/", response_model=List[TeacherAssignmentResponse], summary="List teacher assignments")
def list_teacher_assignments(
    teacher_id: int = Query(None, description="Filter by teacher ID"),
    mine: bool = Query(False, description="Return only the caller's own teacher assignments"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List teacher assignments. Admins see all; teachers see only their own.

    Args:
        teacher_id: Optional filter. mine: Restrict to the caller's own assignments.
        db: Session. current_user: Auth user.

    Returns:
        List of teacher assignments.
    """
    query = db.query(TeacherAssignment)
    if mine:
        # `?mine=true` (sent by the frontend) scopes strictly to the caller.
        if current_user.teacher_id is None:
            return []
        query = query.filter(TeacherAssignment.teacher_id == current_user.teacher_id)
    elif current_user.role == "teacher":
        if current_user.teacher_id is None:
            return []
        query = query.filter(TeacherAssignment.teacher_id == current_user.teacher_id)
    elif teacher_id is not None:
        query = query.filter(TeacherAssignment.teacher_id == teacher_id)
    elif current_user.role not in ("admin", "staff", "principal", "vice_principal",
                                   "accountant", "librarian", "receptionist",
                                   "transport_manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Insufficient permissions.")
    return query.offset(skip).limit(limit).all()


@router.post("/teacher-assignments/", response_model=TeacherAssignmentResponse, status_code=status.HTTP_201_CREATED, summary="Create teacher assignment (admin)")
def create_teacher_assignment(
    payload: TeacherAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Assign a teacher to a class section + subject. Admin only."""
    if db.query(Teacher).filter(Teacher.id == payload.teacher_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Teacher with id {payload.teacher_id} not found")
    db_item = TeacherAssignment(**payload.model_dump())
    db.add(db_item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Duplicate teacher assignment")
    db.refresh(db_item)
    return db_item


@router.put("/teacher-assignments/{assignment_id}", response_model=TeacherAssignmentResponse, summary="Update teacher assignment (admin)")
def update_teacher_assignment(
    assignment_id: int,
    payload: TeacherAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a teacher assignment. Admin only."""
    db_item = db.query(TeacherAssignment).filter(TeacherAssignment.id == assignment_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Teacher assignment with id {assignment_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_item, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Duplicate teacher assignment")
    db.refresh(db_item)
    return db_item


@router.delete("/teacher-assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete teacher assignment (admin)")
def delete_teacher_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a teacher assignment. Admin only."""
    db_item = db.query(TeacherAssignment).filter(TeacherAssignment.id == assignment_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Teacher assignment with id {assignment_id} not found")
    db.delete(db_item)
    db.commit()


# ─── Parent Links ─────────────────────────────────────────────────────────────

@router.get("/parent-links/", response_model=List[ParentStudentLinkResponse], summary="List parent-student links")
def list_parent_links(
    parent_user_id: int = Query(None, description="Filter by parent user ID"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List parent-student links. Admins see all; parents see only their own.

    Args:
        parent_user_id: Optional filter. db: Session. current_user: Auth user.

    Returns:
        List of parent-student links.
    """
    query = db.query(ParentStudentLink)
    if current_user.role == "parent":
        query = query.filter(ParentStudentLink.parent_user_id == current_user.id)
    elif current_user.role == "admin":
        if parent_user_id is not None:
            query = query.filter(ParentStudentLink.parent_user_id == parent_user_id)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Insufficient permissions.")
    return query.offset(skip).limit(limit).all()


@router.post("/parent-links/", response_model=ParentStudentLinkResponse, status_code=status.HTTP_201_CREATED, summary="Create parent link (admin)")
def create_parent_link(
    payload: ParentStudentLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Link a parent user to a student. Admin only."""
    if db.query(User).filter(User.id == payload.parent_user_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"User with id {payload.parent_user_id} not found")
    if db.query(Student).filter(Student.id == payload.student_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Student with id {payload.student_id} not found")
    db_item = ParentStudentLink(**payload.model_dump())
    db.add(db_item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Link already exists for this parent and student")
    db.refresh(db_item)
    return db_item


@router.put("/parent-links/{link_id}", response_model=ParentStudentLinkResponse, summary="Update parent link (admin)")
def update_parent_link(
    link_id: int,
    payload: ParentStudentLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a parent-student link. Admin only."""
    db_item = db.query(ParentStudentLink).filter(ParentStudentLink.id == link_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Parent link with id {link_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_item, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Link already exists for this parent and student")
    db.refresh(db_item)
    return db_item


@router.delete("/parent-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete parent link (admin)")
def delete_parent_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a parent-student link. Admin only."""
    db_item = db.query(ParentStudentLink).filter(ParentStudentLink.id == link_id).first()
    if db_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Parent link with id {link_id} not found")
    db.delete(db_item)
    db.commit()
