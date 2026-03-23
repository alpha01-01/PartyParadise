# Module 03 — Bookings & Events

## Overview

This is the operational core of the system. A booking represents a confirmed or pending client engagement — whether that's a décor setup, a 360 photobooth rental, or both combined. Everything else (invoices, staff scheduling, equipment allocation) radiates outward from a booking.

---

## Tables

### `bookings`
The master record for every client engagement.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | Unique identifier |
| `client_id` | uuid | FK → clients.id, NOT NULL | Who the booking is for |
| `created_by` | uuid | FK → users.id, NOT NULL | Staff who created the booking |
| `reference` | varchar(20) | NOT NULL, UNIQUE | Human-readable ID e.g. `BK-2025-0042` |
| `service_type` | varchar(30) | NOT NULL | See service types below |
| `status` | varchar(30) | NOT NULL, DEFAULT `inquiry` | See pipeline stages below |
| `event_date` | date | NOT NULL | The date of the event |
| `start_time` | time | NULLABLE | Event start time |
| `end_time` | time | NULLABLE | Expected wrap-up time |
| `venue_name` | varchar(200) | NULLABLE | Name of the venue |
| `venue_address` | text | NULLABLE | Full address of the venue |
| `event_type` | varchar(50) | NULLABLE | `wedding`, `birthday`, `corporate`, `baby_shower`, `graduation`, `other` |
| `guest_count` | integer | NULLABLE | Approximate number of guests |
| `special_requests` | text | NULLABLE | Client's specific requirements |
| `created_at` | timestamptz | DEFAULT now() | - |
| `updated_at` | timestamptz | DEFAULT now() | - |

**Service types:**
- `decor` — décor setup and styling only
- `photobooth_360` — 360 photobooth service at the event
- `photobooth_rental` — equipment rented out to client (self-operated)
- `combo` — décor + photobooth together

**Booking status pipeline:**
- `inquiry` — client has expressed interest, no commitment yet
- `quoted` — quote has been sent to client
- `confirmed` — client has accepted and paid deposit
- `in_progress` — event day; setup or service is active
- `completed` — event done, final payment expected
- `cancelled` — booking was cancelled (record kept for history)

---

### `booking_services`
Line items describing exactly what services are included in a booking. A combo booking will have multiple rows here.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `booking_id` | uuid | FK → bookings.id | - |
| `service` | varchar(100) | NOT NULL | e.g. `Balloon arch`, `360 booth (4hrs)`, `Backdrop setup` |
| `description` | text | NULLABLE | Additional detail |
| `price` | numeric(12,2) | NOT NULL | Agreed price for this line item |
| `pricing_type` | varchar(20) | DEFAULT `fixed` | `fixed`, `hourly`, `per_item` |

> **Note:** This table also feeds into invoice generation. Invoices are built from booking service line items.

---

### `booking_equipment`
Tracks which physical equipment (360 booth units, props, décor items) is allocated to a booking. This is the bridge between bookings and the equipment/inventory module.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `booking_id` | uuid | FK → bookings.id | - |
| `equipment_id` | uuid | FK → equipment.id | The piece of gear being allocated |
| `quantity` | integer | NOT NULL, DEFAULT 1 | How many units |
| `status` | varchar(20) | DEFAULT `reserved` | `reserved`, `dispatched`, `returned`, `damaged` |

---

### `booking_staff`
Assigns crew members to a booking. One booking may need a setup team, a photobooth operator, and a driver.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `booking_id` | uuid | FK → bookings.id | - |
| `user_id` | uuid | FK → users.id | The staff member |
| `role` | varchar(50) | NOT NULL | `lead_decorator`, `assistant`, `booth_operator`, `driver` |
| `report_time` | time | NULLABLE | When they need to arrive at venue |
| `status` | varchar(20) | DEFAULT `assigned` | `assigned`, `confirmed`, `no_show` |

---

### `booking_notes`
Internal or client-facing notes attached to a booking. Keeps the full conversation and decision trail in one place.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `booking_id` | uuid | FK → bookings.id | - |
| `user_id` | uuid | FK → users.id | Who added the note |
| `note` | text | NOT NULL | The note content |
| `is_internal` | boolean | DEFAULT true | If false, visible to client in their portal |
| `created_at` | timestamptz | DEFAULT now() | - |

---

## Relationships

```
clients ──< bookings ──< booking_services
                    ──< booking_equipment >── equipment
                    ──< booking_staff >── users
                    ──< booking_notes >── users
users ──< bookings (created_by)
```

---

## Design Decisions

- **`service_type` on the booking + `booking_services` line items** — the top-level type gives a quick filter, while line items give the full breakdown for quoting and invoicing.
- **`reference` field** — auto-generate human-readable booking IDs (e.g. `BK-2025-0042`). Clients and staff refer to bookings by this, not by UUIDs.
- **Equipment allocation at booking level** — reserving equipment against a booking prevents double-allocation. The conflict check queries `booking_equipment` for overlapping dates.
- **`booking_notes.is_internal`** — lets staff leave candid operational notes without the client seeing them in the portal.
- **No hard delete on cancellations** — cancelled bookings are kept in history. This preserves invoice records, staff allocation history, and analytics.

---

## Critical Business Logic

### Double-booking prevention
Before confirming a booking, check that:
1. No other `confirmed` or `in_progress` booking exists for the same `event_date` that uses the same equipment.
2. No staff member assigned is already assigned to another booking on the same date and time window.

```sql
-- Check equipment conflict
SELECT b.reference
FROM bookings b
JOIN booking_equipment be ON be.booking_id = b.id
WHERE be.equipment_id = :equipment_id
  AND b.event_date = :event_date
  AND b.status IN ('confirmed', 'in_progress')
  AND b.id != :current_booking_id;
```

### Auto-generating booking references
```python
# Generate reference like BK-2025-0042
from datetime import date

def generate_reference(session) -> str:
    year = date.today().year
    count = session.query(Booking).filter(
        extract('year', Booking.created_at) == year
    ).count() + 1
    return f"BK-{year}-{count:04d}"
```

### Status transition rules
Only allow these transitions (enforce in service layer, not DB):
```
inquiry → quoted → confirmed → in_progress → completed
any status → cancelled
```

---

## FastAPI Notes

- `POST /bookings` — creates booking, runs conflict check, auto-generates reference
- `GET /bookings/calendar?month=2025-11` — returns bookings for calendar view
- `GET /bookings/{id}/summary` — full booking detail with client, services, staff, equipment
- `PATCH /bookings/{id}/status` — status transition with validation

---

## Indexes to Add

```sql
CREATE INDEX idx_bookings_event_date ON bookings(event_date);
CREATE INDEX idx_bookings_client_id ON bookings(client_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_booking_equipment_booking_id ON booking_equipment(booking_id);
CREATE INDEX idx_booking_staff_user_id ON booking_staff(user_id);
```

---

## Previous / Next

← [Module 02 — Clients & Leads](./02-clients-leads.md)
→ [Module 04 — Inventory & Equipment](./04-inventory-equipment.md)
