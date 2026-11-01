from collections import defaultdict

from pathlib import Path
import sys

from dotenv import load_dotenv

load_dotenv()

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.database import SessionLocal
from app.models.auth import Permission, Role, RolePermission


PERMISSIONS = [
    "users:create",
    "users:read",
    "users:update",
    "clients:create",
    "clients:read",
    "clients:update",
    "bookings:create",
    "bookings:read",
    "bookings:update",
    "contracts:create",
    "contracts:read",
    "contracts:update",
    "inventory:create",
    "inventory:read",
    "inventory:update",
    "invoices:create",
    "invoices:read",
    "invoices:update",
    "invoices:delete",
    "accounting:create",
    "accounting:read",
    "accounting:update",
    "accounting:delete",
    "reports:read",
    "staff:create",
    "staff:read",
    "staff:update",
    "staff:manage",
]

ROLE_PERMISSION_NAMES = {
    "admin": PERMISSIONS,
    "manager": [
        "clients:create",
        "clients:read",
        "clients:update",
        "bookings:create",
        "bookings:read",
        "bookings:update",
        "contracts:create",
        "contracts:read",
        "contracts:update",
        "inventory:create",
        "inventory:read",
        "inventory:update",
        "invoices:create",
        "invoices:read",
        "invoices:update",
        "invoices:delete",
        "accounting:create",
        "accounting:read",
        "accounting:update",
        "accounting:delete",
        "reports:read",
        "staff:create",
        "staff:read",
        "staff:update",
        "staff:manage",
    ],
    "staff": [
        "clients:read",
        "bookings:read",
        "bookings:update",
        "contracts:read",
        "inventory:read",
        "inventory:update",
        "invoices:read",
        "staff:read",
        "staff:update",
    ],
}


def split_permission(name: str) -> tuple[str, str]:
    module, action = name.split(":", 1)
    return module, action


with SessionLocal() as db:
    roles = {role.name: role for role in db.query(Role).all()}
    missing_roles = [name for name in ROLE_PERMISSION_NAMES if name not in roles]
    if missing_roles:
        raise RuntimeError(f"Missing roles: {', '.join(missing_roles)}")

    permissions = {permission.name: permission for permission in db.query(Permission).all()}

    created_permissions = 0
    for permission_name in PERMISSIONS:
        if permission_name in permissions:
            continue
        module, action = split_permission(permission_name)
        permission = Permission(name=permission_name, module=module, action=action)
        db.add(permission)
        db.flush()
        permissions[permission_name] = permission
        created_permissions += 1

    existing_role_permissions = {
        (row.role_id, row.permission_id)
        for row in db.query(RolePermission).all()
    }

    created_links = 0
    for role_name, permission_names in ROLE_PERMISSION_NAMES.items():
        role = roles[role_name]
        for permission_name in permission_names:
            permission = permissions[permission_name]
            key = (role.id, permission.id)
            if key in existing_role_permissions:
                continue
            db.add(RolePermission(role_id=role.id, permission_id=permission.id))
            existing_role_permissions.add(key)
            created_links += 1

    db.commit()

    summary = defaultdict(int)
    for role_name, permission_names in ROLE_PERMISSION_NAMES.items():
        summary[role_name] = len(permission_names)

print(f"Seeded permissions. Created permissions: {created_permissions}, created role links: {created_links}")
for role_name, count in summary.items():
    print(f"{role_name}: {count} permissions")
