from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, model_validator
from typing import Optional
from uuid import UUID
from datetime import date, datetime, time
from decimal import Decimal

from app.database import get_db
from app.schemas.types import Money
from app.dependencies import has_permission, require_permission

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
    base_salary: Optional[Money] = None
    daily_rate: Optional[Money] = None
    hired_at: Optional[date] = None


class UpdateStaffRequest(BaseModel):
    role_title: Optional[str] = None
    employment_type: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    base_salary: Optional[Money] = None
    daily_rate: Optional[Money] = None
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
    clock_in: Optional[time] = None   # only managers may set this; otherwise server time
    notes: Optional[str] = None


class ClockOutRequest(BaseModel):
    clock_out: Optional[time] = None  # only managers may set this; otherwise server time
    notes: Optional[str] = None


class CreateLeaveRequest(BaseModel):
    staff_id: UUID
    type: str               # annual | sick | personal | unpaid
    start_date: date
    end_date: date
    reason: Optional[str] = None

    @model_validator(mode="after")
    def end_after_start(self):
        if self.end_date < self.start_date:
            raise ValueError("Leave cannot end before it starts")
        return self


class ReviewLeaveRequest(BaseModel):
    status: str             # approved | declined
    review_notes: Optional[str] = None


# Responses are declared explicitly so User columns such as password_hash
# can never be serialised from a loaded relationship.

class StaffUserResponse(BaseModel):
    id: UUID
    full_name: str
    email: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}


class StaffProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    role_title: str
    employment_type: str
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    base_salary: Optional[float] = None
    daily_rate: Optional[float] = None
    hired_at: Optional[date] = None
    is_active: bool
    created_at: datetime
    user: Optional[StaffUserResponse] = None

    model_config = {"from_attributes": True}


class LeaveStaffResponse(BaseModel):
    id: UUID
    user_id: UUID
    role_title: str
    user: Optional[StaffUserResponse] = None

    model_config = {"from_attributes": True}


class LeaveRequestResponse(BaseModel):
    id: UUID
    staff_id: UUID
    reviewed_by: Optional[UUID] = None
    type: str
    start_date: date
    end_date: date
    days_requested: int
    status: str
    reason: Optional[str] = None
    review_notes: Optional[str] = None
    created_at: datetime
    staff: Optional[LeaveStaffResponse] = None

    model_config = {"from_attributes": True}


class StaffCreatedResponse(StaffProfileResponse):
    invite_sent: bool = False
    setup_url: Optional[str] = None  # only when the invite could not be emailed


LIST_LIMIT = 500
MANAGED_FIELDS = {"role_title", "employment_type", "base_salary", "daily_rate", "is_active"}


def with_visible_pay(db: Session, user, profiles: list) -> list[StaffProfileResponse]:
    """Pay is for managers, and for each person's own record."""
    can_see_all = has_permission(db, user, "staff:manage")
    visible = []
    for profile in profiles:
        response = StaffProfileResponse.model_validate(profile)
        if not can_see_all and profile.user_id != user.id:
            response.base_salary = None
            response.daily_rate = None
        visible.append(response)
    return visible


def ensure_own_shift_or_manager(db: Session, user, shift) -> None:
    from app.models.staff import StaffProfile

    if has_permission(db, user, "staff:manage"):
        return
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    if not profile or profile.id != shift.staff_id:
        raise HTTPException(status_code=403, detail="You can only clock in or out of your own shifts")


def clock_time(db: Session, user, supplied: Optional[time]) -> time:
    """Times are server time unless a manager is correcting a record."""
    if supplied is not None and has_permission(db, user, "staff:manage"):
        return supplied
    return datetime.now().time().replace(microsecond=0)


# ─── Staff profiles ───────────────────────────────────────────

@router.get("", response_model=list[StaffProfileResponse])
def list_staff(
    employment_type: str = Query(None),
    is_active: bool = Query(True),
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:read")),
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

    return with_visible_pay(db, current_user, query.order_by(User.full_name.asc()).limit(LIST_LIMIT).all())


@router.post("", status_code=201, response_model=StaffCreatedResponse)
def create_staff(
    data: CreateStaffRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:create")),
):
    """
    Creates a User account + StaffProfile in one step, then invites the new
    member to choose a password. If the email cannot be sent, the link is
    returned so whoever created the account can pass it on.
    """
    from app.models.auth import User, Role, UserRole
    from app.models.staff import StaffProfile
    from app.config import settings
    from app.services.auth import get_user_by_email
    from app.services.email import send_staff_invite
    from app.utils.security import STAFF_INVITE_TOKEN_HOURS, create_password_reset_token, hash_password
    import secrets

    # Check email not already taken
    existing = get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    user = User(
        email=data.email.lower(),
        full_name=f"{data.first_name} {data.last_name}",
        password_hash=hash_password(secrets.token_urlsafe(32)),
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

    token = create_password_reset_token(str(user.id), user.password_hash, hours=STAFF_INVITE_TOKEN_HOURS)
    setup_url = f"{settings.WEB_URL}/login/reset/{token}"
    invite_sent = send_staff_invite(user, setup_url)

    return StaffCreatedResponse.model_validate(profile).model_copy(
        update={"invite_sent": invite_sent, "setup_url": None if invite_sent else setup_url}
    )


@router.patch("/{staff_id}", response_model=StaffProfileResponse)
def update_staff(
    staff_id: UUID,
    data: UpdateStaffRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:update")),
):
    from app.models.auth import UserSession
    from app.models.staff import StaffProfile

    profile = db.query(StaffProfile).filter(StaffProfile.id == staff_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Staff member not found")

    updates = data.model_dump(exclude_none=True)
    # The edit form sends every field, so only a real change needs a manager
    changed = {field for field in MANAGED_FIELDS & updates.keys() if updates[field] != getattr(profile, field)}
    if changed and not has_permission(db, current_user, "staff:manage"):
        raise HTTPException(status_code=403, detail="Only managers can change role, pay or status")

    for field, value in updates.items():
        setattr(profile, field, value)

    if updates.get("is_active") is False:
        profile.user.is_active = False
        db.query(UserSession).filter(UserSession.user_id == profile.user_id).delete()
    elif updates.get("is_active") is True:
        profile.user.is_active = True

    db.commit()
    db.refresh(profile)
    return with_visible_pay(db, current_user, [profile])[0]


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

    # A shift with no end time is treated as running to the end of the day
    new_end = data.end_time or time.max
    same_day = db.query(Shift).filter(
        Shift.staff_id == data.staff_id,
        Shift.shift_date == data.shift_date,
        Shift.status.notin_(["cancelled"]),
    ).all()
    if any(data.start_time < (shift.end_time or time.max) and shift.start_time < new_end for shift in same_day):
        raise HTTPException(
            status_code=409,
            detail=f"Staff already has an overlapping shift on {data.shift_date}. Check schedule before assigning."
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
    ensure_own_shift_or_manager(db, current_user, shift)

    existing = db.query(Attendance).filter(Attendance.shift_id == shift_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already clocked in for this shift")

    attendance = Attendance(
        shift_id=shift_id,
        staff_id=shift.staff_id,
        clock_in=clock_time(db, current_user, data.clock_in),
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
    current_user=Depends(require_permission("staff:update")),
):
    from app.models.staff import Shift, Attendance
    from decimal import Decimal

    attendance = db.query(Attendance).filter(Attendance.shift_id == shift_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="No clock-in record found")
    if attendance.clock_out:
        raise HTTPException(status_code=400, detail="Already clocked out")

    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    ensure_own_shift_or_manager(db, current_user, shift)

    clock_out = clock_time(db, current_user, data.clock_out)
    attendance.clock_out = clock_out
    if attendance.clock_in:
        # Calculate hours worked. Clocking out earlier in the day means the shift ran past midnight.
        t_in  = datetime.combine(date.today(), attendance.clock_in)
        t_out = datetime.combine(date.today(), clock_out)
        diff  = (t_out - t_in).total_seconds() / 3600
        if diff < 0:
            diff += 24
        attendance.hours_worked = Decimal(str(round(diff, 2)))

    if shift:
        shift.status = "completed"

    if data.notes:
        attendance.notes = data.notes

    db.commit()
    db.refresh(attendance)
    return attendance


# ─── Leave requests ───────────────────────────────────────────

@router.get("/leave", response_model=list[LeaveRequestResponse])
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

    return query.order_by(LeaveRequest.created_at.desc()).limit(LIST_LIMIT).all()


@router.post("/leave", status_code=201, response_model=LeaveRequestResponse)
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


@router.patch("/leave/{leave_id}", response_model=LeaveRequestResponse)
def review_leave_request(
    leave_id: UUID,
    data: ReviewLeaveRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:manage")),
):
    from app.models.staff import LeaveRequest, StaffProfile

    if data.status not in ("approved", "declined"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'declined'")

    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave.status != "pending":
        raise HTTPException(status_code=400, detail="Leave request already reviewed")
    own = db.query(StaffProfile).filter(StaffProfile.user_id == current_user.id).first()
    if own and own.id == leave.staff_id:
        raise HTTPException(status_code=403, detail="You cannot review your own leave request")

    leave.status = data.status
    leave.reviewed_by = current_user.id
    leave.review_notes = data.review_notes

    db.commit()
    db.refresh(leave)
    return leave


@router.get("/{staff_id}", response_model=StaffProfileResponse)
def get_staff_member(
    staff_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("staff:read")),
):
    from app.models.staff import StaffProfile

    profile = db.query(StaffProfile).filter(StaffProfile.id == staff_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return with_visible_pay(db, current_user, [profile])[0]
