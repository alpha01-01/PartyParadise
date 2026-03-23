from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date, time
from decimal import Decimal

from app.database import get_db
from app.dependencies import require_permission

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────

class CreateStaffRequest(BaseModel):
    # Creates both a User account and a StaffProfile
    first_name: str
    last_name: str
    email: str
    role_title: str
    employment_type: str = "full_time"
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    base_salary: Optional[Decimal] = None
    daily_rate: Optional[Decimal] = None
    hired_at: Optional[date] = None


class UpdateStaffRequest(BaseModel):
    role_title: Optional[str] = None
    employment_type: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    base_salary: Optional[Decimal] = None
    daily_rate: Optional[Decimal] = None
    is_active: Optional[bool] = None


class CreateShiftRequest(BaseModel):
    staff_id: UUID
    type: str = "event"           # event | prep | training | admin
    shift_date: date
    start_time: time
    end_time: Optional[time] = None
    booking_id: Optional[UUID] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class UpdateShiftRequest(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    status: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class ClockInRequest(BaseModel):
    clock_in: time
    notes: Optional[str] = None


class ClockOutRequest(BaseModel):
    clock_out: time
    notes: Optional[str] = None


class CreateLeaveRequest(BaseModel):
    staff_id: UUID
    type: str               # annual | sick | personal | unpaid
    start_date: date
    end_date: date
    reason: Optional[str] = None


class ReviewLeaveRequest(BaseModel):
    status: str             # approved | declined
    review_notes: Optional[str] = None


# ─── Staff profiles ───────────────────────────────────────────

@router.get("")
def list_staff(
    employment_type: str = Query(None),
    is_active: bool = Query(True),
    search: str = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:read")),
):
    from app.models.staff import StaffProfile
    from app.models.auth import User

    query = (
        db.query(StaffProfile)
        .join(User, User.id == StaffProfile.user_id)
        .filter(StaffProfile.is_active == is_active)
    )

    if employment_type:
        query = query.filter(StaffProfile.employment_type == employment_type)
    if search:
        query = query.filter(
            (User.full_name.ilike(f"%{search}%")) |
            (StaffProfile.role_title.ilike(f"%{search}%"))
        )

    return query.order_by(User.full_name.asc()).all()


@router.get("/{staff_id}")
def get_staff_member(
    staff_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:read")),
):
    from app.models.staff import StaffProfile

    profile = db.query(StaffProfile).filter(StaffProfile.id == staff_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return profile


@router.post("", status_code=201)
def create_staff(
    data: CreateStaffRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:create")),
):
    """
    Creates a User account + StaffProfile in one step.
    Sends a welcome email with a temporary password (TODO: email delivery).
    """
    from app.models.auth import User, Role, UserRole
    from app.models.staff import StaffProfile
    from app.utils.security import hash_password
    import secrets

    # Check email not already taken
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    temp_password = secrets.token_urlsafe(12)
    user = User(
        email=data.email,
        full_name=f"{data.first_name} {data.last_name}",
        password_hash=hash_password(temp_password),
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Assign staff role
    staff_role = db.query(Role).filter(Role.name == "staff").first()
    if staff_role:
        db.add(UserRole(user_id=user.id, role_id=staff_role.id))

    # Create profile
    profile = StaffProfile(
        user_id=user.id,
        role_title=data.role_title,
        employment_type=data.employment_type,
        phone=data.phone,
        emergency_contact=data.emergency_contact,
        emergency_phone=data.emergency_phone,
        base_salary=data.base_salary,
        daily_rate=data.daily_rate,
        hired_at=data.hired_at,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    # TODO: send welcome email with temp_password
    return profile


@router.patch("/{staff_id}")
def update_staff(
    staff_id: UUID,
    data: UpdateStaffRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:update")),
):
    from app.models.staff import StaffProfile

    profile = db.query(StaffProfile).filter(StaffProfile.id == staff_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Staff member not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile


# ─── Shifts ───────────────────────────────────────────────────

@router.get("/shifts/week")
def get_week_shifts(
    week: str = Query(..., description="ISO week start date YYYY-MM-DD (Monday)"),
    staff_id: UUID = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:read")),
):
    """Return all shifts for a given week (Mon–Sun)."""
    from app.models.staff import Shift
    from datetime import timedelta

    try:
        week_start = date.fromisoformat(week)
    except ValueError:
        raise HTTPException(status_code=400, detail="week must be YYYY-MM-DD")

    week_end = week_start + timedelta(days=6)

    query = db.query(Shift).filter(
        Shift.shift_date >= week_start,
        Shift.shift_date <= week_end,
    )
    if staff_id:
        query = query.filter(Shift.staff_id == staff_id)

    return query.order_by(Shift.shift_date.asc(), Shift.start_time.asc()).all()


@router.get("/{staff_id}/schedule")
def staff_schedule(
    staff_id: UUID,
    month: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:read")),
):
    from app.models.staff import Shift, StaffProfile
    from sqlalchemy import extract

    try:
        year, mo = map(int, month.split("-"))
    except ValueError:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")

    profile = db.query(StaffProfile).filter(StaffProfile.id == staff_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Staff not found")

    return (
        db.query(Shift)
        .filter(
            Shift.staff_id == staff_id,
            extract("year", Shift.shift_date) == year,
            extract("month", Shift.shift_date) == mo,
        )
        .order_by(Shift.shift_date.asc())
        .all()
    )


@router.post("/shifts", status_code=201)
def create_shift(
    data: CreateShiftRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:update")),
):
    from app.models.staff import Shift, StaffProfile

    # Verify staff exists
    profile = db.query(StaffProfile).filter(StaffProfile.id == data.staff_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # Basic conflict check: same staff, same date, overlapping time
    existing = db.query(Shift).filter(
        Shift.staff_id == data.staff_id,
        Shift.shift_date == data.shift_date,
        Shift.status.notin_(["cancelled"]),
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Staff already has a shift on {data.shift_date}. Check schedule before assigning."
        )

    shift = Shift(
        assigned_by=current_user.id,
        **data.model_dump(exclude_none=True),
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.patch("/shifts/{shift_id}")
def update_shift(
    shift_id: UUID,
    data: UpdateShiftRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:update")),
):
    from app.models.staff import Shift

    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(shift, field, value)

    db.commit()
    db.refresh(shift)
    return shift


# ─── Attendance ───────────────────────────────────────────────

@router.post("/shifts/{shift_id}/clock-in", status_code=201)
def clock_in(
    shift_id: UUID,
    data: ClockInRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:update")),
):
    from app.models.staff import Shift, Attendance, StaffProfile

    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    existing = db.query(Attendance).filter(Attendance.shift_id == shift_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already clocked in for this shift")

    attendance = Attendance(
        shift_id=shift_id,
        staff_id=shift.staff_id,
        clock_in=data.clock_in,
        status="present",
        notes=data.notes,
    )
    db.add(attendance)

    shift.status = "in_progress"
    db.commit()
    db.refresh(attendance)
    return attendance


@router.patch("/shifts/{shift_id}/clock-out")
def clock_out(
    shift_id: UUID,
    data: ClockOutRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:update")),
):
    from app.models.staff import Shift, Attendance
    from decimal import Decimal
    from datetime import datetime

    attendance = db.query(Attendance).filter(Attendance.shift_id == shift_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="No clock-in record found")
    if attendance.clock_out:
        raise HTTPException(status_code=400, detail="Already clocked out")

    attendance.clock_out = data.clock_out
    if attendance.clock_in:
        # Calculate hours worked
        t_in  = datetime.combine(date.today(), attendance.clock_in)
        t_out = datetime.combine(date.today(), data.clock_out)
        diff  = (t_out - t_in).total_seconds() / 3600
        attendance.hours_worked = Decimal(str(round(diff, 2)))

    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if shift:
        shift.status = "completed"

    if data.notes:
        attendance.notes = data.notes

    db.commit()
    db.refresh(attendance)
    return attendance


# ─── Leave requests ───────────────────────────────────────────

@router.get("/leave")
def list_leave_requests(
    status: str = Query(None),
    staff_id: UUID = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:read")),
):
    from app.models.staff import LeaveRequest

    query = db.query(LeaveRequest)
    if status:
        query = query.filter(LeaveRequest.status == status)
    if staff_id:
        query = query.filter(LeaveRequest.staff_id == staff_id)

    return query.order_by(LeaveRequest.created_at.desc()).all()


@router.post("/leave", status_code=201)
def create_leave_request(
    data: CreateLeaveRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:update")),
):
    from app.models.staff import LeaveRequest, StaffProfile
    from datetime import timedelta

    profile = db.query(StaffProfile).filter(StaffProfile.id == data.staff_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Staff member not found")

    days = (data.end_date - data.start_date).days + 1

    leave = LeaveRequest(
        days_requested=days,
        status="pending",
        **data.model_dump(exclude_none=True),
    )
    db.add(leave)
    db.commit()
    db.refresh(leave)
    return leave


@router.patch("/leave/{leave_id}")
def review_leave_request(
    leave_id: UUID,
    data: ReviewLeaveRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:update")),
):
    from app.models.staff import LeaveRequest

    if data.status not in ("approved", "declined"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'declined'")

    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave.status != "pending":
        raise HTTPException(status_code=400, detail="Leave request already reviewed")

    leave.status = data.status
    leave.reviewed_by = current_user.id
    leave.review_notes = data.review_notes

    db.commit()
    db.refresh(leave)
    return leave
