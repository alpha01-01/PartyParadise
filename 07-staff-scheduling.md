# Module 07 — Staff & Scheduling

## Overview

This module manages the human side of operations — who works when, tracking attendance on event days, handling leave, and running payroll. It sits on top of the `users` table from Module 01, extending it with employment and scheduling detail.

For an event business, staff scheduling is critical: the wrong person missing on a wedding day can be catastrophic. This module ensures every booking has the right crew confirmed and accounted for.

---

## Tables

### `staff_profiles`
Extended employment information for users who are staff members. One-to-one with `users`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `user_id` | uuid | FK → users.id, UNIQUE, NOT NULL | Links to the login identity |
| `role_title` | varchar(100) | NOT NULL | e.g. `Lead Decorator`, `Booth Operator`, `Driver` |
| `employment_type` | varchar(20) | NOT NULL | `full_time`, `part_time`, `freelance`, `daily_labour` |
| `phone` | varchar(20) | NULLABLE | Direct contact number |
| `emergency_contact` | varchar(100) | NULLABLE | Name of emergency contact |
| `emergency_phone` | varchar(20) | NULLABLE | Emergency contact number |
| `base_salary` | numeric(12,2) | NULLABLE | Monthly salary for salaried staff |
| `daily_rate` | numeric(12,2) | NULLABLE | Day rate for daily labour / freelance |
| `hired_at` | date | NULLABLE | Start date |
| `is_active` | boolean | DEFAULT true | Deactivate without deleting |
| `created_at` | timestamptz | DEFAULT now() | - |

> **Note:** A staff member always has a `users` record (for login) and a `staff_profiles` record (for employment detail). Not all users are staff — admins or client portal users won't have a staff profile.

---

### `shifts`
A scheduled work assignment for a staff member. Can be tied to a booking (event day) or a general shop shift.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `staff_id` | uuid | FK → staff_profiles.id, NOT NULL | Who is scheduled |
| `booking_id` | uuid | FK → bookings.id, NULLABLE | If it's an event shift |
| `assigned_by` | uuid | FK → users.id, NOT NULL | Manager who created the shift |
| `type` | varchar(30) | NOT NULL | `event`, `shop`, `delivery`, `setup`, `teardown` |
| `shift_date` | date | NOT NULL | Date of the shift |
| `start_time` | time | NOT NULL | Shift start |
| `end_time` | time | NULLABLE | Expected end time |
| `location` | varchar(200) | NULLABLE | Where they need to be — venue name or address |
| `status` | varchar(20) | DEFAULT `scheduled` | See statuses below |
| `notes` | text | NULLABLE | Instructions for the staff member |
| `created_at` | timestamptz | DEFAULT now() | - |

**Shift statuses:**
- `scheduled` — assigned, not yet confirmed by staff
- `confirmed` — staff has acknowledged the shift
- `completed` — shift done
- `no_show` — staff did not appear
- `cancelled` — shift was cancelled

---

### `attendance`
Records actual clock-in / clock-out for each shift. One attendance record per shift.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `shift_id` | uuid | FK → shifts.id, UNIQUE, NOT NULL | One attendance per shift |
| `staff_id` | uuid | FK → staff_profiles.id, NOT NULL | Denormalised for easier queries |
| `clock_in` | time | NULLABLE | Actual arrival time |
| `clock_out` | time | NULLABLE | Actual departure time |
| `hours_worked` | numeric(4,2) | NULLABLE | Computed from clock_in/clock_out |
| `status` | varchar(20) | DEFAULT `present` | `present`, `late`, `absent`, `half_day` |
| `notes` | text | NULLABLE | Any remarks from the supervisor |
| `created_at` | timestamptz | DEFAULT now() | - |

---

### `payroll_periods`
Defines pay cycles — typically monthly. Closing a period locks it and triggers payroll processing.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `label` | varchar(50) | NOT NULL, UNIQUE | e.g. `November 2025` |
| `start_date` | date | NOT NULL | - |
| `end_date` | date | NOT NULL | - |
| `status` | varchar(20) | DEFAULT `open` | `open`, `processing`, `closed` |
| `closed_at` | timestamptz | NULLABLE | When payroll was finalised |

---

### `payroll_entries`
One record per staff member per pay period. Captures what was paid, any bonuses, and deductions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `period_id` | uuid | FK → payroll_periods.id, NOT NULL | - |
| `staff_id` | uuid | FK → staff_profiles.id, NOT NULL | - |
| `base_amount` | numeric(12,2) | NOT NULL | Base salary or calculated daily rate × days worked |
| `bonus_amount` | numeric(12,2) | DEFAULT 0 | Any bonus for the period |
| `deductions` | numeric(12,2) | DEFAULT 0 | Advances, SSNIT, etc. |
| `net_pay` | numeric(12,2) | NOT NULL | `base_amount + bonus_amount - deductions` |
| `payment_method` | varchar(30) | NOT NULL | `momo_mtn`, `bank_transfer`, `cash` |
| `payment_status` | varchar(20) | DEFAULT `pending` | `pending`, `paid` |
| `paid_at` | date | NULLABLE | When payment was made |
| `notes` | text | NULLABLE | Any remarks |

---

### `leave_requests`
Staff requests for time off — annual leave, sick leave, or personal reasons.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `staff_id` | uuid | FK → staff_profiles.id, NOT NULL | Who is requesting |
| `reviewed_by` | uuid | FK → users.id, NULLABLE | Manager who approved/rejected |
| `type` | varchar(20) | NOT NULL | `annual`, `sick`, `personal`, `unpaid` |
| `start_date` | date | NOT NULL | - |
| `end_date` | date | NOT NULL | - |
| `days_requested` | integer | NOT NULL | Calculated from date range |
| `status` | varchar(20) | DEFAULT `pending` | `pending`, `approved`, `rejected` |
| `reason` | text | NULLABLE | Staff's reason for the leave |
| `review_notes` | text | NULLABLE | Manager's notes on approval/rejection |
| `created_at` | timestamptz | DEFAULT now() | - |

---

## Relationships

```
users ──| staff_profiles ──< shifts >── bookings
shifts ──| attendance
staff_profiles ──< payroll_entries >── payroll_periods
staff_profiles ──< leave_requests
```

---

## Design Decisions

- **`staff_profiles` is separate from `users`** — keeps authentication clean. A user exists to log in; a staff profile exists for employment management. Not all system users are employees.
- **`shifts` linked to `bookings`** — event-day shifts are tied directly to a booking. This means you can always see who was assigned to any given event, and vice versa — see all upcoming shifts for a staff member.
- **`attendance` is one-to-one with shifts** — created either by the supervisor on event day, or via a self-check-in flow in the mobile app.
- **`daily_rate` for casual staff** — many event businesses use daily labour for setups. `daily_rate × days_worked` feeds into payroll for these staff types automatically.
- **Leave requests flag scheduling conflicts** — when a leave request is approved, check if that staff member has any confirmed shifts in that date range and flag them for reassignment.
- **Payroll entries link to Module 06** — when a payroll period is closed and entries are marked `paid`, corresponding expense journal entries should be created automatically (staff wages expense).

---

## Key Business Logic

### Staff conflict check before shift assignment
```python
def check_staff_conflict(session, staff_id, shift_date, start_time, end_time):
    conflict = session.query(Shift).filter(
        Shift.staff_id == staff_id,
        Shift.shift_date == shift_date,
        Shift.status.in_(["scheduled", "confirmed"]),
        # Time overlap check
        Shift.start_time < end_time,
        Shift.end_time > start_time,
    ).first()
    return conflict is not None
```

### Calculate hours worked on clock-out
```python
from datetime import datetime, date, time, timedelta

def calculate_hours(clock_in: time, clock_out: time) -> float:
    dummy = date.today()
    dt_in = datetime.combine(dummy, clock_in)
    dt_out = datetime.combine(dummy, clock_out)
    delta = dt_out - dt_in
    return round(delta.seconds / 3600, 2)
```

### Auto-generate payroll entries for a period
```python
def generate_payroll(session, period_id):
    period = session.query(PayrollPeriod).get(period_id)
    active_staff = session.query(StaffProfile).filter_by(is_active=True).all()

    for staff in active_staff:
        if staff.employment_type in ("daily_labour", "freelance"):
            # Count attended shifts in the period
            days = session.query(Attendance).join(Shift).filter(
                Shift.staff_id == staff.id,
                Shift.shift_date.between(period.start_date, period.end_date),
                Attendance.status.in_(["present", "late"])
            ).count()
            base = (staff.daily_rate or 0) * days
        else:
            base = staff.base_salary or 0

        entry = PayrollEntry(
            period_id=period_id,
            staff_id=staff.id,
            base_amount=base,
            net_pay=base,  # adjust for bonuses/deductions before closing
            payment_method="momo_mtn",  # default, can be edited per staff
            payment_status="pending",
        )
        session.add(entry)

    session.commit()
```

### Leave approval conflict check
```sql
SELECT s.shift_date, b.reference
FROM shifts s
LEFT JOIN bookings b ON b.id = s.booking_id
WHERE s.staff_id = :staff_id
  AND s.shift_date BETWEEN :start_date AND :end_date
  AND s.status IN ('scheduled', 'confirmed');
```

---

## FastAPI Notes

- `GET /staff` — list all active staff with role and employment type
- `GET /staff/{id}/schedule?month=2025-11` — all shifts for a staff member in a month
- `POST /shifts` — create shift with conflict check
- `POST /shifts/{id}/attendance` — log clock-in / clock-out
- `GET /payroll/periods/{id}/entries` — all payroll entries for a period
- `POST /payroll/periods/{id}/generate` — auto-generate entries from attendance
- `POST /leave-requests/{id}/review` — approve or reject with notes

---

## Indexes to Add

```sql
CREATE INDEX idx_shifts_staff_id ON shifts(staff_id);
CREATE INDEX idx_shifts_booking_id ON shifts(booking_id);
CREATE INDEX idx_shifts_shift_date ON shifts(shift_date);
CREATE INDEX idx_attendance_shift_id ON attendance(shift_id);
CREATE INDEX idx_attendance_staff_id ON attendance(staff_id);
CREATE INDEX idx_payroll_entries_period_id ON payroll_entries(period_id);
CREATE INDEX idx_payroll_entries_staff_id ON payroll_entries(staff_id);
CREATE INDEX idx_leave_requests_staff_id ON leave_requests(staff_id);
```

---

## Previous / Next

← [Module 06 — Expenses & Accounting](./06-expenses-accounting.md)
→ [Module 08 — Contracts & Documents](./08-contracts-documents.md)
