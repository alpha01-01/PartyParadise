"""012 money integrity

Lets webhooks record payments with no staff user, stops bad money values and
duplicate rows at the database, and adds a safe reference counter.

Revision ID: 012
Revises: 011
Create Date: 2026-11-01 00:02:00
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None

UNIQUES = [
    ("uq_payments_provider_ref", "payments", ["provider_ref"]),
    ("uq_payments_reference", "payments", ["reference"]),
    ("uq_expenses_reference", "expenses", ["reference"]),
    ("uq_user_roles_user_role", "user_roles", ["user_id", "role_id"]),
    ("uq_role_permissions_role_permission", "role_permissions", ["role_id", "permission_id"]),
    ("uq_client_tags_client_tag", "client_tags", ["client_id", "tag_id"]),
    ("uq_booking_staff_booking_user", "booking_staff", ["booking_id", "user_id"]),
]

METHODS = "('momo_mtn', 'momo_vodafone', 'momo_airteltigo', 'bank_transfer', 'cash', 'paystack', 'cheque')"

CHECKS = [
    ("ck_invoices_status", "invoices", "status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled')"),
    (
        "ck_invoices_amounts",
        "invoices",
        "subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 "
        "AND amount_paid >= 0 AND amount_paid <= total_amount",
    ),
    ("ck_invoice_items_amounts", "invoice_items", "quantity > 0 AND unit_price >= 0 AND total_price >= 0"),
    ("ck_payments_amount", "payments", "amount > 0"),
    ("ck_payments_status", "payments", "status IN ('pending', 'confirmed', 'failed', 'refunded')"),
    ("ck_payments_method", "payments", f"method IN {METHODS}"),
    ("ck_payments_source", "payments", "source IN ('staff', 'webhook', 'shop')"),
    ("ck_expenses_amount", "expenses", "amount > 0"),
    ("ck_expenses_status", "expenses", "status IN ('pending', 'confirmed', 'voided')"),
    ("ck_journal_entries_amount", "journal_entries", "amount >= 0"),
    ("ck_journal_entries_type", "journal_entries", "type IN ('income', 'expense')"),
]


def upgrade() -> None:
    op.alter_column("payments", "received_by", nullable=True)
    op.alter_column("journal_entries", "created_by", nullable=True)

    op.add_column(
        "payments",
        sa.Column("source", sa.String(20), nullable=False, server_default="staff"),
    )
    op.execute("UPDATE payments SET source = 'shop' WHERE notes LIKE 'Retail counter sale %'")

    op.create_table(
        "reference_counters",
        sa.Column("stem", sa.String(20), primary_key=True),
        sa.Column("value", sa.Integer, nullable=False),
    )

    # Shop sales never wrote a ledger entry
    op.execute("""
        INSERT INTO journal_entries
            (id, created_by, reference, type, description, amount, source_type, source_id, entry_date)
        SELECT
            gen_random_uuid(), p.received_by, 'JE-' || p.reference, 'income',
            COALESCE(p.notes, 'Payment ' || p.reference), p.amount, 'payment', p.id, p.paid_at
        FROM payments p
        WHERE p.status = 'confirmed'
          AND NOT EXISTS (
              SELECT 1 FROM journal_entries j
              WHERE j.source_type = 'payment' AND j.source_id = p.id
          )
    """)

    for name, table, columns in UNIQUES:
        op.create_unique_constraint(name, table, columns)
    for name, table, condition in CHECKS:
        op.create_check_constraint(name, table, condition)


def downgrade() -> None:
    for name, table, _ in reversed(CHECKS):
        op.drop_constraint(name, table, type_="check")
    for name, table, _ in reversed(UNIQUES):
        op.drop_constraint(name, table, type_="unique")

    op.drop_table("reference_counters")
    op.drop_column("payments", "source")

    # Webhook rows have no user, so these columns stay nullable
