"""013 operational rules

Separates staff management from everyday staff updates, adds a combo contract
template, and stops bad stock, booking and leave values at the database.

Revision ID: 013
Revises: 012
Create Date: 2026-11-01 00:03:00
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

CHECKS = [
    ("ck_inventory_items_quantities", "inventory_items", "quantity_in_stock >= 0 AND reorder_level >= 0"),
    ("ck_bookings_guest_count", "bookings", "guest_count IS NULL OR guest_count >= 0"),
    ("ck_booking_services_price", "booking_services", "price >= 0"),
    ("ck_attendance_hours", "attendance", "hours_worked IS NULL OR hours_worked >= 0"),
    ("ck_leave_requests_dates", "leave_requests", "end_date >= start_date AND days_requested > 0"),
]


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(sa.text(
        "INSERT INTO permissions (id, name, module, action) "
        "VALUES (gen_random_uuid(), 'staff:manage', 'staff', 'manage') "
        "ON CONFLICT (name) DO NOTHING"
    ))
    bind.execute(sa.text(
        "INSERT INTO role_permissions (id, role_id, permission_id) "
        "SELECT gen_random_uuid(), r.id, p.id FROM roles r, permissions p "
        "WHERE r.name IN ('admin', 'manager') AND p.name = 'staff:manage' "
        "AND NOT EXISTS ("
        "  SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id"
        ")"
    ))

    op.execute("""
        INSERT INTO contract_templates (id, name, service_type, body)
        SELECT gen_random_uuid(), 'Combined Services Agreement', 'combo',
        'SERVICE AGREEMENT

This agreement is between PartyParadise (the "Company") and {{client_name}} (the "Client").

Event Date: {{event_date}}
Venue: {{venue}}

SERVICES
{{service_description}}

EQUIPMENT & LIABILITY
The Client accepts responsibility for any damage to equipment caused by guests.

PAYMENT TERMS
Total Amount: {{total_amount}}
Deposit Required: {{deposit_amount}}

By signing this agreement, the Client confirms acceptance of all terms.

Client Name: ____________________
Signature: ____________________
Date: ____________________'
        WHERE NOT EXISTS (SELECT 1 FROM contract_templates WHERE service_type = 'combo')
    """)

    for name, table, condition in CHECKS:
        op.create_check_constraint(name, table, condition)


def downgrade() -> None:
    for name, table, _ in reversed(CHECKS):
        op.drop_constraint(name, table, type_="check")

    op.execute("DELETE FROM contract_templates WHERE name = 'Combined Services Agreement'")
    op.execute(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE name = 'staff:manage')"
    )
    op.execute("DELETE FROM permissions WHERE name = 'staff:manage'")
