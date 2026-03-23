# Module 09 — Client Portal

## Overview

The client portal is the outward-facing layer of the system — a separate, simplified interface where clients can log in to track their bookings, view and pay invoices, sign contracts, download documents, and submit new inquiries. It reduces back-and-forth communication and gives clients a professional, self-service experience.

The portal shares the same database as the internal system but uses its own authentication layer (`client_portal_accounts`) — completely separate from staff logins.

---

## Tables

### `client_portal_accounts`
A login identity for a client in the portal. One-to-one with `clients`. Not every client needs a portal account — it is created on demand when the business invites a client or the client signs up.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `client_id` | uuid | FK → clients.id, UNIQUE, NOT NULL | The client this account belongs to |
| `email` | varchar(255) | NOT NULL, UNIQUE | Login email (mirrors clients.email) |
| `password_hash` | text | NOT NULL | bcrypt hashed password |
| `is_active` | boolean | DEFAULT true | Disable access without deleting |
| `last_login_at` | timestamptz | NULLABLE | Last successful login |
| `created_at` | timestamptz | DEFAULT now() | - |

> **Note:** Portal accounts are intentionally separate from `users`. A client logging in should never have access to internal system routes. Keep auth middleware and JWT claims clearly scoped: `"type": "staff"` vs `"type": "client"`.

---

### `portal_sessions`
Active sessions for logged-in clients. Same pattern as staff sessions in Module 01.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `portal_account_id` | uuid | FK → client_portal_accounts.id | - |
| `token_hash` | text | NOT NULL | Hashed refresh token |
| `device_info` | text | NULLABLE | Browser / device string |
| `ip_address` | inet | NULLABLE | Client IP at login |
| `expires_at` | timestamptz | NOT NULL | Session expiry |
| `created_at` | timestamptz | DEFAULT now() | - |

---

### `portal_notifications`
In-app notifications shown to the client when they log in — booking confirmations, invoice reminders, contract signing requests, payment receipts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `portal_account_id` | uuid | FK → client_portal_accounts.id | - |
| `type` | varchar(50) | NOT NULL | See notification types below |
| `title` | varchar(150) | NOT NULL | Short heading e.g. `Invoice Ready` |
| `message` | text | NOT NULL | Full notification body |
| `action_url` | varchar(250) | NULLABLE | Deep link into the portal e.g. `/portal/invoices/INV-2025-0058` |
| `is_read` | boolean | DEFAULT false | - |
| `read_at` | timestamptz | NULLABLE | When the client read it |
| `created_at` | timestamptz | DEFAULT now() | - |

**Notification types:**
- `booking_confirmed` — booking status updated to confirmed
- `invoice_issued` — new invoice available
- `invoice_reminder` — payment due soon or overdue
- `payment_received` — payment acknowledgement
- `contract_ready` — contract sent for signing
- `contract_signed` — confirmation after signing
- `document_shared` — new document visible in portal
- `general` — any custom message from staff

---

### `portal_inquiries`
New booking requests submitted directly through the portal by existing clients. These flow into the internal system as new bookings with `status = inquiry`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `portal_account_id` | uuid | FK → client_portal_accounts.id | - |
| `client_id` | uuid | FK → clients.id, NOT NULL | - |
| `subject` | varchar(200) | NOT NULL | Brief description of what they need |
| `service_type` | varchar(30) | NULLABLE | `decor`, `photobooth_360`, `photobooth_rental`, `combo` |
| `preferred_date` | date | NULLABLE | Client's requested event date |
| `venue` | varchar(250) | NULLABLE | Proposed venue |
| `guest_count` | integer | NULLABLE | Expected number of guests |
| `message` | text | NOT NULL | Full details from the client |
| `status` | varchar(20) | DEFAULT `new` | `new`, `reviewed`, `converted`, `declined` |
| `created_at` | timestamptz | DEFAULT now() | - |

> When a portal inquiry is reviewed and accepted, it is **converted** into a formal `bookings` record (Module 03) and linked to the client. The inquiry `status` is updated to `converted`.

---

## What Clients Can See in the Portal

The portal does not introduce new data — it is a **read layer** over existing modules, with a few write actions. Here is what is exposed:

### Bookings
- View all their bookings and current status
- See event details: date, venue, services, assigned team
- Track progress through the pipeline

**Query:**
```sql
SELECT b.reference, b.event_date, b.status, b.service_type, b.venue_name
FROM bookings b
WHERE b.client_id = :client_id
ORDER BY b.event_date DESC;
```

### Invoices
- View all invoices: amount, status, due date
- See line items and payment history
- Pay outstanding balance via Paystack (redirect to payment)

**Query:**
```sql
SELECT i.reference, i.total_amount, i.amount_paid, i.amount_due,
       i.status, i.due_date, i.issued_at
FROM invoices i
WHERE i.client_id = :client_id
ORDER BY i.created_at DESC;
```

### Contracts
- View contracts sent to them
- Sign pending contracts via the signing flow (Module 08)
- Download signed contracts as PDF

**Query:**
```sql
SELECT c.reference, c.status, c.event_date, c.total_amount,
       c.sent_at, c.signed_at
FROM contracts c
WHERE c.client_id = :client_id
ORDER BY c.created_at DESC;
```

### Documents
- View and download files shared with them (`is_visible_to_client = true`)
- Upload mood boards, reference images, or venue floor plans

**Query:**
```sql
SELECT d.name, d.type, d.file_url, d.created_at
FROM documents d
WHERE d.client_id = :client_id
  AND d.is_visible_to_client = true
ORDER BY d.created_at DESC;
```

### Notifications
- See all unread notifications on the dashboard
- Mark as read when viewed

### Submit New Inquiry
- Fill in a request form for a new booking
- Creates a `portal_inquiries` record for staff to review

---

## Relationships

```
clients ──| client_portal_accounts ──< portal_sessions
                                   ──< portal_notifications
                                   ──< portal_inquiries

Portal reads (no new tables):
client_portal_accounts.client_id → bookings, invoices, contracts, documents
```

---

## Design Decisions

- **Separate auth from staff** — client portal accounts use a completely different table and JWT claim type. Middleware enforces this separation so a client token can never reach an internal API route.
- **Portal is a read layer** — no new data structures are needed for most features. The portal reads from bookings, invoices, contracts, and documents already in the system, filtered by `client_id`.
- **`portal_inquiries` as a staging table** — new requests from the portal don't go directly into `bookings`. They sit in `portal_inquiries` for a staff member to review and convert. This prevents half-formed bookings appearing in the operational calendar.
- **Notifications are system-generated** — every significant internal action (invoice issued, contract sent, payment recorded) should trigger a notification record for the client. This is done via a service-layer event hook, not manually.
- **No real-time chat** — WhatsApp handles client communication. The portal is for self-service access to documents, invoices, and contracts — not a messaging system.

---

## Notification Triggers

These internal system events should automatically create a `portal_notifications` record if the client has a portal account:

| Trigger | Notification type | Message |
|---|---|---|
| Invoice status → `sent` | `invoice_issued` | Your invoice INV-2025-0058 is ready |
| Invoice status → `overdue` | `invoice_reminder` | Payment of GHS X is overdue |
| Payment recorded | `payment_received` | We received your payment of GHS X |
| Contract status → `sent` | `contract_ready` | Your service agreement is ready to sign |
| Contract status → `signed` | `contract_signed` | Your contract has been signed successfully |
| Booking status → `confirmed` | `booking_confirmed` | Your booking BK-2025-0042 is confirmed |
| Document `is_visible_to_client` → true | `document_shared` | A new document has been shared with you |

```python
def notify_client(session, client_id: str, type: str, title: str, message: str, action_url: str = None):
    account = session.query(ClientPortalAccount).filter_by(
        client_id=client_id, is_active=True
    ).one_or_none()

    if not account:
        return  # Client has no portal account, skip silently

    notification = PortalNotification(
        portal_account_id=account.id,
        type=type,
        title=title,
        message=message,
        action_url=action_url,
    )
    session.add(notification)
    session.commit()
```

---

## Portal Onboarding Flow

When a client is invited to the portal for the first time:

1. Staff clicks "Invite to Portal" on a client record
2. System creates a `client_portal_accounts` record with `is_active = false`
3. A time-limited invite link is generated and sent via WhatsApp or email
4. Client clicks the link, sets their password
5. Account is activated (`is_active = true`), first session created
6. Client lands on their dashboard showing their bookings, invoices, and notifications

```python
def invite_client_to_portal(session, client_id: str, base_url: str):
    client = session.query(Client).get(client_id)

    account = ClientPortalAccount(
        client_id=client_id,
        email=client.email,
        password_hash="",  # empty until they set it
        is_active=False,
    )
    session.add(account)
    session.flush()

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=48)
    store_invite_token(token, account.id, expires_at)

    invite_url = f"{base_url}/portal/setup/{token}"
    # Send via WhatsApp or email
    return invite_url
```

---

## FastAPI Notes

All portal routes are prefixed `/portal/` and protected by `ClientPortalAuth` middleware — never `StaffAuth`.

- `POST /portal/auth/login` — client login, returns JWT
- `GET /portal/dashboard` — summary: upcoming bookings, unpaid invoices, unread notifications
- `GET /portal/bookings` — all client bookings
- `GET /portal/invoices` — all invoices with payment status
- `POST /portal/invoices/{id}/pay` — redirect to Paystack for online payment
- `GET /portal/contracts` — all contracts
- `POST /portal/contracts/sign/{token}` — sign a contract (shared with Module 08 public endpoint)
- `GET /portal/documents` — visible documents
- `POST /portal/documents/upload` — client uploads a file (mood board etc.)
- `GET /portal/notifications` — list notifications
- `PATCH /portal/notifications/{id}/read` — mark as read
- `POST /portal/inquiries` — submit a new booking inquiry

---

## Indexes to Add

```sql
CREATE INDEX idx_portal_accounts_client_id ON client_portal_accounts(client_id);
CREATE INDEX idx_portal_notifications_account_id ON portal_notifications(portal_account_id);
CREATE INDEX idx_portal_notifications_is_read ON portal_notifications(is_read);
CREATE INDEX idx_portal_inquiries_client_id ON portal_inquiries(client_id);
CREATE INDEX idx_portal_inquiries_status ON portal_inquiries(status);
```

---

## Previous Module

← [Module 08 — Contracts & Documents](./08-contracts-documents.md)

---

## Schema Complete

All 9 modules are documented. See the full index below.

| Module | File | Tables |
|---|---|---|
| 01 — Auth & Users | `01-auth-users.md` | users, roles, permissions, user_roles, role_permissions, sessions, audit_logs |
| 02 — Clients & Leads | `02-clients-leads.md` | clients, client_addresses, interactions, tags, client_tags |
| 03 — Bookings & Events | `03-bookings-events.md` | bookings, booking_services, booking_equipment, booking_staff, booking_notes |
| 04 — Inventory & Equipment | `04-inventory-equipment.md` | inventory_items, inventory_transactions, equipment, equipment_maintenance, suppliers, purchase_orders, purchase_order_items |
| 05 — Invoicing & Payments | `05-invoicing-payments.md` | quotes, quote_items, invoices, invoice_items, payments |
| 06 — Expenses & Accounting | `06-expenses-accounting.md` | expense_categories, expenses, account_periods, journal_entries, bank_accounts, bank_transactions |
| 07 — Staff & Scheduling | `07-staff-scheduling.md` | staff_profiles, shifts, attendance, payroll_periods, payroll_entries, leave_requests |
| 08 — Contracts & Documents | `08-contracts-documents.md` | contract_templates, contracts, documents |
| 09 — Client Portal | `09-client-portal.md` | client_portal_accounts, portal_sessions, portal_notifications, portal_inquiries |
