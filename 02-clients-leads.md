# Module 02 — Clients & Leads

## Overview

This module manages everyone who contacts the business — from a first inquiry (lead) through to a repeat client. It is the CRM layer of the system. All bookings, invoices, and contracts reference a client record.

---

## Tables

### `clients`
A unified record for both leads and active clients. The `status` field tracks where they are in the pipeline.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | Unique identifier |
| `first_name` | varchar(100) | NOT NULL | - |
| `last_name` | varchar(100) | NOT NULL | - |
| `email` | varchar(255) | NULLABLE, UNIQUE | Primary contact email |
| `phone` | varchar(20) | NULLABLE | Call number |
| `whatsapp` | varchar(20) | NULLABLE | WhatsApp number (may differ from phone) |
| `source` | varchar(50) | NULLABLE | How they found you: `instagram`, `referral`, `walk_in`, `whatsapp`, `website` |
| `status` | varchar(30) | NOT NULL, DEFAULT `lead` | Pipeline stage — see below |
| `client_type` | varchar(30) | NULLABLE | `individual`, `corporate`, `planner` |
| `notes` | text | NULLABLE | Internal notes about the client |
| `assigned_to` | uuid | FK → users.id, NULLABLE | Staff member managing this client |
| `created_at` | timestamptz | DEFAULT now() | - |
| `updated_at` | timestamptz | DEFAULT now() | - |

**Status values:**
- `lead` — first contact made, not yet converted
- `prospect` — inquiry received, quote in progress
- `active` — has at least one confirmed booking
- `past` — completed booking(s), no current active booking
- `lost` — did not convert (with optional notes on why)

---

### `client_addresses`
Stores one or more addresses per client. Useful for event venue delivery or décor setup locations.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `client_id` | uuid | FK → clients.id | - |
| `label` | varchar(50) | NULLABLE | e.g. `Home`, `Office`, `Venue` |
| `street` | text | NULLABLE | Street address |
| `city` | varchar(100) | NULLABLE | - |
| `region` | varchar(100) | NULLABLE | e.g. `Greater Accra` |
| `is_default` | boolean | DEFAULT false | The primary address for this client |

---

### `interactions`
A log of every touchpoint with a client — calls, WhatsApp messages, in-person visits, emails.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `client_id` | uuid | FK → clients.id | - |
| `user_id` | uuid | FK → users.id | Staff who logged the interaction |
| `channel` | varchar(30) | NOT NULL | `whatsapp`, `call`, `email`, `in_person`, `instagram` |
| `direction` | varchar(10) | NOT NULL | `inbound` or `outbound` |
| `summary` | text | NOT NULL | What was discussed or agreed |
| `interacted_at` | timestamptz | DEFAULT now() | When it happened |

---

### `tags`
Flexible labels to categorize and filter clients.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `name` | varchar(50) | NOT NULL, UNIQUE | e.g. `VIP`, `Wedding`, `Corporate`, `Repeat` |
| `color` | varchar(7) | NULLABLE | Hex color for UI display e.g. `#F59E0B` |

---

### `client_tags`
Junction table — many-to-many between clients and tags.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `client_id` | uuid | FK → clients.id | - |
| `tag_id` | uuid | FK → tags.id | - |

---

## Relationships

```
clients ──< client_addresses
clients ──< interactions >── users
clients ──< client_tags >── tags
users ──< clients (assigned_to)
```

---

## Design Decisions

- **Leads and clients share one table** — using a `status` field avoids duplication and makes it easy to track the full journey from first contact to repeat client.
- **WhatsApp is a separate field** — in Ghana, WhatsApp is the primary business communication channel and the number often differs from the regular call number.
- **`source` field** — tracking how clients found you is critical for knowing which marketing efforts (Instagram, referrals) are working.
- **Interactions log** — every call, message, and meeting is recorded. This prevents "he said / she said" situations and helps any staff member pick up where another left off.
- **Tags are flexible** — avoid hardcoding client categories in the schema. Tags can be created and assigned freely from the UI.
- **`assigned_to`** — for accountability; one staff member owns each client relationship.

---

## FastAPI Notes

- When a new client is created with `status = lead`, fire a background task to notify the assigned staff member.
- On status change to `active`, automatically link to the first confirmed booking.
- Expose a `/clients/{id}/timeline` endpoint that returns interactions + bookings + invoices in chronological order — useful for a client detail view.

```python
# Example: list clients filtered by status and tag
GET /clients?status=prospect&tag=Wedding
```

---

## Indexes to Add

```sql
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_assigned_to ON clients(assigned_to);
CREATE INDEX idx_interactions_client_id ON interactions(client_id);
```

---

## Previous / Next

← [Module 01 — Auth & Users](./01-auth-users.md)
→ [Module 03 — Bookings & Events](./03-bookings-events.md)
