"""007 staff and scheduling

Revision ID: 007
Revises: 006
Create Date: 2025-01-01 00:06:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- staff_profiles ---
    op.create_table(
        "staff_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("role_title", sa.String(100), nullable=False),
        sa.Column("employment_type", sa.String(20), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("emergency_contact", sa.String(100), nullable=True),
        sa.Column("emergency_phone", sa.String(20), nullable=True),
        sa.Column("base_salary", sa.Numeric(12, 2), nullable=True),
        sa.Column("daily_rate", sa.Numeric(12, 2), nullable=True),
        sa.Column("hired_at", sa.Date, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- shifts ---
    op.create_table(
        "shifts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("staff_id", UUID(as_uuid=True), sa.ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("booking_id", UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("shift_date", sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="scheduled"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- attendance ---
    op.create_table(
        "attendance",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("shift_id", UUID(as_uuid=True), sa.ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("staff_id", UUID(as_uuid=True), sa.ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("clock_in", sa.Time, nullable=True),
        sa.Column("clock_out", sa.Time, nullable=True),
        sa.Column("hours_worked", sa.Numeric(4, 2), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="present"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- payroll_periods ---
    op.create_table(
        "payroll_periods",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("label", sa.String(50), nullable=False, unique=True),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("closed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # --- payroll_entries ---
    op.create_table(
        "payroll_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("period_id", UUID(as_uuid=True), sa.ForeignKey("payroll_periods.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("staff_id", UUID(as_uuid=True), sa.ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("base_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("bonus_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("deductions", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("net_pay", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.String(30), nullable=False),
        sa.Column("payment_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("paid_at", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )

    # --- leave_requests ---
    op.create_table(
        "leave_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("staff_id", UUID(as_uuid=True), sa.ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reviewed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("days_requested", sa.Integer, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("review_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- indexes ---
    op.create_index("idx_shifts_staff_id", "shifts", ["staff_id"])
    op.create_index("idx_shifts_booking_id", "shifts", ["booking_id"])
    op.create_index("idx_shifts_shift_date", "shifts", ["shift_date"])
    op.create_index("idx_attendance_shift_id", "attendance", ["shift_id"])
    op.create_index("idx_attendance_staff_id", "attendance", ["staff_id"])
    op.create_index("idx_payroll_entries_period_id", "payroll_entries", ["period_id"])
    op.create_index("idx_payroll_entries_staff_id", "payroll_entries", ["staff_id"])
    op.create_index("idx_leave_requests_staff_id", "leave_requests", ["staff_id"])


def downgrade() -> None:
    op.drop_table("leave_requests")
    op.drop_table("payroll_entries")
    op.drop_table("payroll_periods")
    op.drop_table("attendance")
    op.drop_table("shifts")
    op.drop_table("staff_profiles")
