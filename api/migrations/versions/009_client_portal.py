"""009 client portal

Revision ID: 009
Revises: 008
Create Date: 2025-01-01 00:08:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, INET
import uuid

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- client_portal_accounts ---
    op.create_table(
        "client_portal_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("last_login_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- portal_sessions ---
    op.create_table(
        "portal_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("portal_account_id", UUID(as_uuid=True), sa.ForeignKey("client_portal_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.Text, nullable=False),
        sa.Column("device_info", sa.Text, nullable=True),
        sa.Column("ip_address", INET, nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- portal_notifications ---
    op.create_table(
        "portal_notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("portal_account_id", UUID(as_uuid=True), sa.ForeignKey("client_portal_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("action_url", sa.String(250), nullable=True),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("read_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- portal_inquiries ---
    op.create_table(
        "portal_inquiries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("portal_account_id", UUID(as_uuid=True), sa.ForeignKey("client_portal_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("service_type", sa.String(30), nullable=True),
        sa.Column("preferred_date", sa.Date, nullable=True),
        sa.Column("venue", sa.String(250), nullable=True),
        sa.Column("guest_count", sa.Integer, nullable=True),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- indexes ---
    op.create_index("idx_portal_accounts_client_id", "client_portal_accounts", ["client_id"])
    op.create_index("idx_portal_notifications_account_id", "portal_notifications", ["portal_account_id"])
    op.create_index("idx_portal_notifications_is_read", "portal_notifications", ["is_read"])
    op.create_index("idx_portal_inquiries_client_id", "portal_inquiries", ["client_id"])
    op.create_index("idx_portal_inquiries_status", "portal_inquiries", ["status"])


def downgrade() -> None:
    op.drop_table("portal_inquiries")
    op.drop_table("portal_notifications")
    op.drop_table("portal_sessions")
    op.drop_table("client_portal_accounts")
