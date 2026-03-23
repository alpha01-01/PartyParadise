"""003 bookings and events

Revision ID: 003
Revises: 002
Create Date: 2025-01-01 00:02:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- bookings ---
    op.create_table(
        "bookings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reference", sa.String(20), nullable=False, unique=True),
        sa.Column("service_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="inquiry"),
        sa.Column("event_date", sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=True),
        sa.Column("end_time", sa.Time, nullable=True),
        sa.Column("venue_name", sa.String(200), nullable=True),
        sa.Column("venue_address", sa.Text, nullable=True),
        sa.Column("event_type", sa.String(50), nullable=True),
        sa.Column("guest_count", sa.Integer, nullable=True),
        sa.Column("special_requests", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- booking_services ---
    op.create_table(
        "booking_services",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("booking_id", UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("pricing_type", sa.String(20), nullable=False, server_default="fixed"),
    )

    # --- booking_equipment (junction — references equipment added in migration 004) ---
    # We create this after equipment table in 004 to avoid FK ordering issues.
    # See 004_inventory_equipment.py for booking_equipment table.

    # --- booking_staff ---
    op.create_table(
        "booking_staff",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("booking_id", UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("report_time", sa.Time, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="assigned"),
    )

    # --- booking_notes ---
    op.create_table(
        "booking_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("booking_id", UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text, nullable=False),
        sa.Column("is_internal", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- indexes ---
    op.create_index("idx_bookings_event_date", "bookings", ["event_date"])
    op.create_index("idx_bookings_client_id", "bookings", ["client_id"])
    op.create_index("idx_bookings_status", "bookings", ["status"])
    op.create_index("idx_booking_staff_user_id", "booking_staff", ["user_id"])
    op.create_index("idx_booking_notes_booking_id", "booking_notes", ["booking_id"])


def downgrade() -> None:
    op.drop_table("booking_notes")
    op.drop_table("booking_staff")
    op.drop_table("booking_services")
    op.drop_table("bookings")
