# Step 3 — API Layer

## Overview

The PartyParadise API is built with **FastAPI** using a strict layered architecture:

```
Request → Router → Service → Model → Database
```

- **Routers** handle HTTP — request parsing, response shaping, permission checks
- **Services** contain business logic — conflict checks, calculations, side effects
- **Models** are SQLAlchemy ORM classes — one file per module
- **Schemas** are Pydantic classes — request validation and response serialization

---

## Files Produced

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI app, CORS, router registration |
| `app/config.py` | Environment settings via pydantic-settings |
| `app/dependencies.py` | Auth dependencies, permission checker |
| `app/utils/security.py` | JWT creation/decoding, bcrypt |
| `app/utils/references.py` | BK-2025-0042 style reference generator |
| `app/utils/pagination.py` | Shared paginate() helper |
| `app/models/auth.py` | User, Role, Permission, Session, AuditLog |
| `app/models/clients.py` | Client, ClientAddress, Interaction, Tag |
| `app/schemas/auth.py` | Login, token, user request/response schemas |
| `app/services/auth.py` | Login, refresh, logout, create user |
| `app/routers/auth.py` | /auth/* endpoints |
| `app/routers/clients.py` | /clients/* endpoints |
| `app/routers/bookings.py` | /bookings/* endpoints |
| `app/routers/invoicing.py` | /invoicing/invoices/*, /invoicing/payments/* |
| `app/routers/reports.py` | /reports/* — P&L, profitability, dashboard |
| `app/routers/portal.py` | /portal/* — all client-facing endpoints |
| `app/routers/stubs.py` | inventory, accounting, staff, contracts routers |

---

## Auth Architecture

Two completely separate auth flows:

### Staff Auth
- JWT claim: `"type": "staff"`
- Dependency: `CurrentUser` — returns the `User` ORM object
- Permission gate: `Depends(require_permission("module:action"))`
- All routes under `/auth/`, `/bookings/`, `/clients/`, etc.

### Client Portal Auth
- JWT claim: `"type": "client"`
- Dependency: `CurrentPortalAccount` — returns `ClientPortalAccount` ORM object
- No permission system — clients only see their own data, filtered by `client_id`
- All routes under `/portal/`

A staff token cannot access portal routes and vice versa — enforced by checking the `type` claim in `decode_token()`.

---

## Permission Naming Convention

All permissions follow `module:action` format:

| Module | Permissions |
|---|---|
| users | `users:read`, `users:create`, `users:update` |
| clients | `clients:read`, `clients:create`, `clients:update` |
| bookings | `bookings:read`, `bookings:create`, `bookings:update` |
| invoices | `invoices:read`, `invoices:create`, `invoices:update` |
| inventory | `inventory:read`, `inventory:create`, `inventory:update` |
| accounting | `accounting:read`, `accounting:create` |
| staff | `staff:read`, `staff:create`, `staff:update` |
| contracts | `contracts:read`, `contracts:create`, `contracts:update` |
| reports | `reports:read` |

Seed these into the `permissions` table and assign them to roles via `role_permissions`.

---

## Key API Endpoints

### Auth
```
POST   /auth/login               → access + refresh token
POST   /auth/refresh             → new access token
POST   /auth/logout              → invalidate session
GET    /auth/me                  → current user profile
POST   /auth/change-password     → update password
GET    /auth/users               → list staff (admin)
POST   /auth/users               → create staff user (admin)
```

### Clients
```
GET    /clients                  → list with filters (status, tag, search)
POST   /clients                  → create client/lead
GET    /clients/{id}             → client detail
PATCH  /clients/{id}             → update client
POST   /clients/{id}/interactions → log a touchpoint
GET    /clients/{id}/timeline    → full history (bookings + interactions)
```

### Bookings
```
GET    /bookings                 → list with filters
GET    /bookings/calendar        → month view (?month=YYYY-MM)
POST   /bookings                 → create booking + services
GET    /bookings/{id}            → booking detail
PATCH  /bookings/{id}            → update booking details
PATCH  /bookings/{id}/status     → transition status
POST   /bookings/{id}/notes      → add note
POST   /bookings/{id}/staff      → assign crew member
POST   /bookings/{id}/equipment  → allocate equipment (conflict-checked)
```

### Invoicing
```
GET    /invoicing/invoices              → list invoices
POST   /invoicing/invoices              → create invoice manually
POST   /invoicing/invoices/from-booking/{id} → auto-generate from booking
PATCH  /invoicing/invoices/{id}/send   → mark sent + notify client
POST   /invoicing/invoices/{id}/payments → record payment + auto journal entry
GET    /invoicing/invoices/{id}/payments → payment history
```

### Reports
```
GET    /reports/dashboard                    → KPI summary for dashboard
GET    /reports/pnl?year=2025               → monthly P&L
GET    /reports/bookings/{id}/profitability → per-event profit
GET    /reports/inventory/low-stock         → items below reorder level
GET    /reports/staff/attendance            → attendance by date range
```

### Portal (client-facing — `/portal/` prefix)
```
POST   /portal/auth/login            → client login
POST   /portal/auth/setup/{token}    → set password from invite
GET    /portal/dashboard             → client dashboard summary
GET    /portal/bookings              → client's bookings
GET    /portal/invoices              → client's invoices
GET    /portal/contracts             → client's contracts
GET    /portal/documents             → shared documents
GET    /portal/notifications         → client notifications
PATCH  /portal/notifications/{id}/read → mark read
POST   /portal/inquiries             → submit new booking inquiry
GET    /contracts/sign/{token}       → public: view contract for signing
POST   /contracts/sign/{token}       → public: submit signature
```

---

## Architectural Rules (enforced)

1. **Routers never import from other routers** — cross-module data access goes through the service layer or direct model queries in the router.
2. **Business logic in services** — conflict checks, reference generation, status transitions, notification triggers all live in `services/`.
3. **Side effects are explicit** — journal entries, portal notifications, and status updates triggered by an action are written in the same transaction as the primary operation.
4. **All writes use `db.flush()` before referencing new IDs** — ensures the ID is available before creating child records in the same transaction.
5. **`with_for_update()`** on stock/balance updates — prevents race conditions when two requests modify the same inventory item or invoice simultaneously.
6. **Soft deletes only** — no `DELETE` endpoints. Use `is_active = False` or status transitions.

---

## Running the API

```bash
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

---

## Previous / Next

← [Step 2 — Database Migrations](./10-migrations.md)
→ [Step 4 — Frontend (Next.js)](./12-frontend.md)
