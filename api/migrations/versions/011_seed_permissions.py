"""011 seed permissions

Without these rows every non-admin role gets 403 on every route. Safe to run on
databases already seeded by scripts/seed_permissions.py.

Revision ID: 011
Revises: 010
Create Date: 2026-11-01 00:01:00
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None

ADMIN = [
    "users:create", "users:read", "users:update",
    "clients:create", "clients:read", "clients:update",
    "bookings:create", "bookings:read", "bookings:update",
    "contracts:create", "contracts:read", "contracts:update",
    "inventory:create", "inventory:read", "inventory:update",
    "invoices:create", "invoices:read", "invoices:update", "invoices:delete",
    "accounting:create", "accounting:read", "accounting:update", "accounting:delete",
    "reports:read",
    "staff:create", "staff:read", "staff:update",
]

ROLE_PERMISSIONS = {
    "admin": ADMIN,
    "manager": [name for name in ADMIN if not name.startswith("users:")],
    "staff": [
        "clients:read",
        "bookings:read", "bookings:update",
        "contracts:read",
        "inventory:read", "inventory:update",
        "invoices:read",
        "staff:read", "staff:update",
    ],
}


def upgrade() -> None:
    bind = op.get_bind()

    for name in ADMIN:
        module, action = name.split(":", 1)
        bind.execute(
            sa.text(
                "INSERT INTO permissions (id, name, module, action) "
                "VALUES (gen_random_uuid(), :name, :module, :action) "
                "ON CONFLICT (name) DO NOTHING"
            ),
            {"name": name, "module": module, "action": action},
        )

    for role, names in ROLE_PERMISSIONS.items():
        for name in names:
            bind.execute(
                sa.text(
                    "INSERT INTO role_permissions (id, role_id, permission_id) "
                    "SELECT gen_random_uuid(), r.id, p.id "
                    "FROM roles r, permissions p "
                    "WHERE r.name = :role AND p.name = :name "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM role_permissions rp "
                    "  WHERE rp.role_id = r.id AND rp.permission_id = p.id"
                    ")"
                ),
                {"role": role, "name": name},
            )


def downgrade() -> None:
    # Permissions are left in place: older code still relies on them, and
    # deleting them could remove links added by hand.
    pass
