from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Integer, Numeric, Date, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.database import Base
import uuid


class StaffProfile(Base):
    __tablename__ = "staff_profiles"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id           = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    role_title        = Column(String(100), nullable=False)
    employment_type   = Column(String(20), nullable=False)
    phone             = Column(String(20), nullable=True)
    emergency_contact = Column(String(100), nullable=True)
    emergency_phone   = Column(String(20), nullable=True)
    base_salary       = Column(Numeric(12, 2), nullable=True)
    daily_rate        = Column(Numeric(12, 2), nullable=True)
    hired_at          = Column(Date, nullable=True)
    is_active         = Column(Boolean, nullable=False, default=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user              = relationship("User", back_populates="staff_profile")
    shifts            = relationship("Shift", back_populates="staff", cascade="all, delete-orphan")
    attendance        = relationship("Attendance", back_populates="staff")
    payroll_entries   = relationship("PayrollEntry", back_populates="staff")
    leave_requests    = relationship("LeaveRequest", back_populates="staff", cascade="all, delete-orphan")


class Shift(Base):
    __tablename__ = "shifts"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id    = Column(UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False)
    booking_id  = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    type        = Column(String(30), nullable=False)
    shift_date  = Column(Date, nullable=False)
    start_time  = Column(Time, nullable=False)
    end_time    = Column(Time, nullable=True)
    location    = Column(String(200), nullable=True)
    status      = Column(String(20), nullable=False, default="scheduled")
    notes       = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    staff       = relationship("StaffProfile", back_populates="shifts")
    booking     = relationship("Booking", back_populates="shifts")
    assigner    = relationship("User")
    attendance  = relationship("Attendance", back_populates="shift", uselist=False, cascade="all, delete-orphan")


class Attendance(Base):
    __tablename__ = "attendance"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shift_id     = Column(UUID(as_uuid=True), ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, unique=True)
    staff_id     = Column(UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False)
    clock_in     = Column(Time, nullable=True)
    clock_out    = Column(Time, nullable=True)
    hours_worked = Column(Numeric(4, 2), nullable=True)
    status       = Column(String(20), nullable=False, default="present")
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    shift        = relationship("Shift", back_populates="attendance")
    staff        = relationship("StaffProfile", back_populates="attendance")


class PayrollPeriod(Base):
    __tablename__ = "payroll_periods"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    label      = Column(String(50), nullable=False, unique=True)
    start_date = Column(Date, nullable=False)
    end_date   = Column(Date, nullable=False)
    status     = Column(String(20), nullable=False, default="open")
    closed_at  = Column(DateTime(timezone=True), nullable=True)

    entries    = relationship("PayrollEntry", back_populates="period", cascade="all, delete-orphan")


class PayrollEntry(Base):
    __tablename__ = "payroll_entries"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id      = Column(UUID(as_uuid=True), ForeignKey("payroll_periods.id", ondelete="RESTRICT"), nullable=False)
    staff_id       = Column(UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False)
    base_amount    = Column(Numeric(12, 2), nullable=False)
    bonus_amount   = Column(Numeric(12, 2), nullable=False, default=0)
    deductions     = Column(Numeric(12, 2), nullable=False, default=0)
    net_pay        = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30), nullable=False)
    payment_status = Column(String(20), nullable=False, default="pending")
    paid_at        = Column(Date, nullable=True)
    notes          = Column(Text, nullable=True)

    period         = relationship("PayrollPeriod", back_populates="entries")
    staff          = relationship("StaffProfile", back_populates="payroll_entries")


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id       = Column(UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False)
    reviewed_by    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    type           = Column(String(20), nullable=False)
    start_date     = Column(Date, nullable=False)
    end_date       = Column(Date, nullable=False)
    days_requested = Column(Integer, nullable=False)
    status         = Column(String(20), nullable=False, default="pending")
    reason         = Column(Text, nullable=True)
    review_notes   = Column(Text, nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    staff          = relationship("StaffProfile", back_populates="leave_requests")
    reviewer       = relationship("User")
