"""002 clients and leads

Revision ID: 002
Revises: 001
Create Date: 2025-01-01 00:01:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- clients ---
    op.create_table(
        "clients",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=True, unique=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("whatsapp", sa.String(20), nullable=True),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="lead"),
        sa.Column("client_type", sa.String(30), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("assigned_to", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- client_addresses ---
    op.create_table(
        "client_addresses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(50), nullable=True),
        sa.Column("street", sa.Text, nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default="false"),
    )

    # --- interactions ---
    op.create_table(
        "interactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("channel", sa.String(30), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("interacted_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- tags ---
    op.create_table(
        "tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("color", sa.String(7), nullable=True),
    )

    # --- client_tags ---
    op.create_table(
        "client_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tag_id", UUID(as_uuid=True), sa.ForeignKey("tags.id", ondelete="CASCADE"), nullable=False),
    )

    # --- indexes ---
    op.create_index("idx_clients_status", "clients", ["status"])
    op.create_index("idx_clients_assigned_to", "clients", ["assigned_to"])
    op.create_index("idx_interactions_client_id", "interactions", ["client_id"])

    # --- seed tags ---
    op.execute("""
        INSERT INTO tags (id, name, color) VALUES
        (gen_random_uuid(), 'VIP', '#F59E0B'),
        (gen_random_uuid(), 'Wedding', '#EC4899'),
        (gen_random_uuid(), 'Corporate', '#3B82F6'),
        (gen_random_uuid(), 'Repeat Client', '#10B981')
    """)


def downgrade() -> None:
    op.drop_table("client_tags")
    op.drop_table("tags")
    op.drop_table("interactions")
    op.drop_table("client_addresses")
    op.drop_table("clients")
