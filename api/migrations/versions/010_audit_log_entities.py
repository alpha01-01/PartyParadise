"""010 audit log entities

Extends the existing audit_logs table so edits and deletions can record which
record changed and how. Existing rows are kept; the new columns stay NULL.

Revision ID: 010
Revises: 009
Create Date: 2026-11-01 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("entity_type", sa.String(50), nullable=True))
    op.add_column("audit_logs", sa.Column("entity_id", sa.String(64), nullable=True))
    op.add_column("audit_logs", sa.Column("changes", JSONB, nullable=True))

    op.create_index("idx_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"])
    op.create_index("idx_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("idx_audit_logs_entity", table_name="audit_logs")

    op.drop_column("audit_logs", "changes")
    op.drop_column("audit_logs", "entity_id")
    op.drop_column("audit_logs", "entity_type")
