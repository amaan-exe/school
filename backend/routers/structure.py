"""Structure router: academic years and class sections."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import AcademicYear, ClassSection, User
from schemas import (
    AcademicYearCreate, AcademicYearUpdate, AcademicYearResponse,
    ClassSectionCreate, ClassSectionUpdate, ClassSectionResponse,
)
from auth import get_current_user, require_role

router = APIRouter()


# ─── Academic Years ───────────────────────────────────────────────────────────

@router.get("/academic-years/", response_model=List[AcademicYearResponse], summary="List academic years")
def list_academic_years(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all academic years. Any authenticated user.

    Args:
        skip: Number of records to skip.
        limit: Maximum number of records to return.
        db: Database session dependency.
        current_user: The authenticated user.

    Returns:
        List of academic year records.
    """
    return db.query(AcademicYear).offset(skip).limit(limit).all()


@router.get("/academic-years/{year_id}", response_model=AcademicYearResponse, summary="Get academic year by ID")
def get_academic_year(
    year_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single academic year by ID.

    Args:
        year_id: The academic year ID.
        db: Database session dependency.
        current_user: The authenticated user.

    Returns:
        The academic year record.

    Raises:
        HTTPException: If not found.
    """
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Academic year with id {year_id} not found")
    return year


@router.post("/academic-years/", response_model=AcademicYearResponse, status_code=status.HTTP_201_CREATED, summary="Create academic year (admin)")
def create_academic_year(
    payload: AcademicYearCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a new academic year. Admin only.

    Args:
        payload: The academic year data.
        db: Database session dependency.
        current_user: The authenticated admin user.

    Returns:
        The newly created academic year.
    """
    db_year = AcademicYear(**payload.model_dump())
    db.add(db_year)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Academic year name already exists")
    db.refresh(db_year)
    return db_year


@router.put("/academic-years/{year_id}", response_model=AcademicYearResponse, summary="Update academic year (admin)")
def update_academic_year(
    year_id: int,
    payload: AcademicYearUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update an academic year. Admin only.

    Args:
        year_id: The academic year ID.
        payload: Updated fields.
        db: Database session dependency.
        current_user: The authenticated admin user.

    Returns:
        The updated academic year.
    """
    db_year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if db_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Academic year with id {year_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_year, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Academic year name already exists")
    db.refresh(db_year)
    return db_year


@router.delete("/academic-years/{year_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete academic year (admin)")
def delete_academic_year(
    year_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete an academic year. Admin only.

    Args:
        year_id: The academic year ID.
        db: Database session dependency.
        current_user: The authenticated admin user.
    """
    db_year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if db_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Academic year with id {year_id} not found")
    db.delete(db_year)
    db.commit()


# ─── Class Sections ───────────────────────────────────────────────────────────

@router.get("/classes/", response_model=List[ClassSectionResponse], summary="List class sections")
def list_classes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all class sections. Any authenticated user.

    Args:
        skip: Number of records to skip.
        limit: Maximum number of records to return.
        db: Database session dependency.
        current_user: The authenticated user.

    Returns:
        List of class section records.
    """
    return db.query(ClassSection).offset(skip).limit(limit).all()


@router.get("/classes/{class_id}", response_model=ClassSectionResponse, summary="Get class section by ID")
def get_class_section(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single class section by ID.

    Args:
        class_id: The class section ID.
        db: Database session dependency.
        current_user: The authenticated user.

    Returns:
        The class section record.
    """
    cls = db.query(ClassSection).filter(ClassSection.id == class_id).first()
    if cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Class section with id {class_id} not found")
    return cls


@router.post("/classes/", response_model=ClassSectionResponse, status_code=status.HTTP_201_CREATED, summary="Create class section (admin)")
def create_class_section(
    payload: ClassSectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Create a new class section. Admin only.

    Args:
        payload: The class section data.
        db: Database session dependency.
        current_user: The authenticated admin user.

    Returns:
        The newly created class section.
    """
    db_cls = ClassSection(**payload.model_dump())
    db.add(db_cls)
    db.commit()
    db.refresh(db_cls)
    return db_cls


@router.put("/classes/{class_id}", response_model=ClassSectionResponse, summary="Update class section (admin)")
def update_class_section(
    class_id: int,
    payload: ClassSectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Update a class section. Admin only.

    Args:
        class_id: The class section ID.
        payload: Updated fields.
        db: Database session dependency.
        current_user: The authenticated admin user.

    Returns:
        The updated class section.
    """
    db_cls = db.query(ClassSection).filter(ClassSection.id == class_id).first()
    if db_cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Class section with id {class_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_cls, field, value)
    db.commit()
    db.refresh(db_cls)
    return db_cls


@router.delete("/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete class section (admin)")
def delete_class_section(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    """Delete a class section. Admin only.

    Args:
        class_id: The class section ID.
        db: Database session dependency.
        current_user: The authenticated admin user.
    """
    db_cls = db.query(ClassSection).filter(ClassSection.id == class_id).first()
    if db_cls is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Class section with id {class_id} not found")
    db.delete(db_cls)
    db.commit()
