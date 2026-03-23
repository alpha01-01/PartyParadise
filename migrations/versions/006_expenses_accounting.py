"""006 expenses and accounting

Revision ID: 006
Revises: 005
Create Date: 2025-01-01 00:05:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- expense_categories ---
    op.create_table(
        "expense_categories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )

    # --- expenses ---
    op.create_table(
        "expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recorded_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("booking_id", UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("supplier_id", UUID(as_uuid=True), sa.ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reference", sa.String(20), nullable=True),
        sa.Column("description", sa.String(250), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="confirmed"),
        sa.Column("expense_date", sa.Date, nullable=False),
        sa.Column("receipt_url", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- account_periods ---
    op.create_table(
        "account_periods",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("label", sa.String(50), nullable=False, unique=True),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("total_income", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_expenses", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("net_profit", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("closed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # --- journal_entries ---
    op.create_table(
        "journal_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("period_id", UUID(as_uuid=True), sa.ForeignKey("account_periods.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reference", sa.String(50), nullable=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("description", sa.String(250), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("source_type", sa.String(30), nullable=True),
        sa.Column("source_id", UUID(as_uuid=True), nullable=True),
        sa.Column("entry_date", sa.Date, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- bank_accounts ---
    op.create_table(
        "bank_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("bank_name", sa.String(100), nullable=True),
        sa.Column("account_number", sa.String(50), nullable=True),
        sa.Column("account_type", sa.String(30), nullable=False),
        sa.Column("current_balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(5), nullable=False, server_default="GHS"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )

    # --- bank_transactions ---
    op.create_table(
        "bank_transactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("journal_entry_id", UUID(as_uuid=True), sa.ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("type", sa.String(10), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(250), nullable=False),
        sa.Column("transaction_date", sa.Date, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- indexes ---
    op.create_index("idx_expenses_booking_id", "expenses", ["booking_id"])
    op.create_index("idx_expenses_category_id", "expenses", ["category_id"])
    op.create_index("idx_expenses_expense_date", "expenses", ["expense_date"])
    op.create_index("idx_journal_entries_period_id", "journal_entries", ["period_id"])
    op.create_index("idx_journal_entries_entry_date", "journal_entries", ["entry_date"])
    op.create_index("idx_journal_entries_type", "journal_entries", ["type"])
    op.create_index("idx_bank_transactions_account_id", "bank_transactions", ["account_id"])

    # --- seed expense categories ---
    op.execute("""
        INSERT INTO expense_categories (id, name, type, color) VALUES
        (gen_random_uuid(), 'Stock & Supplies', 'operational', '#8B5CF6'),
        (gen_random_uuid(), 'Transport', 'operational', '#F59E0B'),
        (gen_random_uuid(), 'Staff Wages', 'operational', '#10B981'),
        (gen_random_uuid(), 'Equipment Maintenance', 'capital', '#3B82F6'),
        (gen_random_uuid(), 'Marketing', 'admin', '#EC4899'),
        (gen_random_uuid(), 'Utilities', 'admin', '#6B7280'),
        (gen_random_uuid(), 'Rent', 'admin', '#EF4444'),
        (gen_random_uuid(), 'Miscellaneous', 'admin', '#9CA3AF')
    """)


def downgrade() -> None:
    op.drop_table("bank_transactions")
    op.drop_table("bank_accounts")
    op.drop_table("journal_entries")
    op.drop_table("account_periods")
    op.drop_table("expenses")
    op.drop_table("expense_categories")
