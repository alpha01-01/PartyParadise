# Module 01 — Auth & Users

## Overview

This module handles all authentication, authorization, and user management across the system. It underpins every other module — all actions are tied to a user, and all access is governed by roles and permissions.

---

## Tables

### `users`
The central identity record for every person who can log into the system.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | Unique identifier |
| `full_name` | varchar(150) | NOT NULL | Display name |
| `email` | varchar(255) | NOT NULL, UNIQUE | Login identifier |
| `phone` | varchar(20) | NULLABLE | Optional contact number |
| `password_hash` | text | NOT NULL | Hashed password (bcrypt) |
| `avatar_url` | text | NULLABLE | Profile photo URL |
| `is_active` | boolean | DEFAULT true | Soft disable access without deleting |
| `created_at` | timestamptz | DEFAULT now() | Record creation time |
| `updated_at` | timestamptz | DEFAULT now() | Last update time |

---

### `roles`
Named roles that group a set of permissions. Examples: `admin`, `staff`, `manager`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | Unique identifier |
| `name` | varchar(50) | NOT NULL, UNIQUE | Role name (e.g. admin, staff) |
| `description` | text | NULLABLE | What this role can do |
| `created_at` | timestamptz | DEFAULT now() | - |

**Seed roles:**
- `admin` — full access to all modules
- `manager` — access to reports, bookings, staff scheduling
- `staff` — limited to assigned jobs and inventory usage

---

### `permissions`
Granular actions that can be granted to roles.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | Unique identifier |
| `name` | varchar(100) | NOT NULL, UNIQUE | e.g. `bookings:create` |
| `module` | varchar(50) | NOT NULL | e.g. `bookings`, `inventory` |
| `action` | varchar(50) | NOT NULL | e.g. `create`, `read`, `update`, `delete` |

**Convention:** Permission names follow `module:action` format, e.g. `invoices:delete`, `inventory:update`.

---

### `user_roles`
Junction table — many-to-many between users and roles.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `user_id` | uuid | FK → users.id | - |
| `role_id` | uuid | FK → roles.id | - |
| `assigned_at` | timestamptz | DEFAULT now() | When the role was granted |

---

### `role_permissions`
Junction table — many-to-many between roles and permissions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `role_id` | uuid | FK → roles.id | - |
| `permission_id` | uuid | FK → permissions.id | - |

---

### `sessions`
Tracks active login sessions. Supports multi-device login and token invalidation.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `user_id` | uuid | FK → users.id | Who the session belongs to |
| `token_hash` | text | NOT NULL | Hashed JWT or refresh token |
| `device_info` | text | NULLABLE | Browser/device string |
| `ip_address` | inet | NULLABLE | Client IP at login |
| `expires_at` | timestamptz | NOT NULL | Session expiry |
| `created_at` | timestamptz | DEFAULT now() | - |

---

### `audit_logs`
Immutable log of all significant actions. Used for accountability and debugging.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `user_id` | uuid | FK → users.id, NULLABLE | Null for system-triggered events |
| `action` | varchar(100) | NOT NULL | e.g. `invoice.created`, `booking.cancelled` |
| `module` | varchar(50) | NOT NULL | Which part of the system |
| `metadata` | jsonb | NULLABLE | Any relevant context (IDs, values, changes) |
| `created_at` | timestamptz | DEFAULT now() | - |

---

## Relationships

```
users ──< user_roles >── roles ──< role_permissions >── permissions
users ──< sessions
users ──< audit_logs
```

---

## Design Decisions

- **RBAC (Role-Based Access Control)** is used over ABAC for simplicity. A user can have multiple roles.
- **Passwords** are never stored in plain text. Use `bcrypt` with a minimum cost factor of 12.
- **Sessions table** enables explicit logout (delete session) and multi-device management. Pair with short-lived JWTs + refresh tokens.
- **Soft deletes** via `is_active` — never delete a user record, as it may be referenced across bookings, invoices, and audit logs.
- **Audit logs are append-only** — no updates or deletes allowed on this table. Add a DB rule or trigger to enforce this.

---

## FastAPI Notes

- Use `Depends()` for permission checking on routes.
- Create a `get_current_user` dependency that decodes the JWT and returns the active user.
- Create a `require_permission(permission: str)` dependency that checks the user's roles against the permission registry.

```python
# Example usage on a route
@router.post("/invoices")
async def create_invoice(
    current_user: User = Depends(require_permission("invoices:create"))
):
    ...
```

---

## Next Module

→ [Module 02 — Clients & Leads](./02-clients-leads.md)
