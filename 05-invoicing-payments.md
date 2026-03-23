# Module 05 — Invoicing & Payments

## Overview

This module handles the full money-in flow of the business — from sending a quote to a client, converting it to an invoice, collecting deposits, and recording final payments. It connects directly to bookings (Module 03) and feeds into accounting (Module 06).

The typical flow is:
```
Booking confirmed → Quote sent → Client approves → Invoice generated → Deposit paid → Event → Balance paid
```

---

## Tables

### `quotes`
A price proposal sent to a client before they commit. A quote can be accepted (converting to an invoice) or rejected.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `booking_id` | uuid | FK → bookings.id, NULLABLE | The associated booking |
| `client_id` | uuid | FK → clients.id, NOT NULL | Who the quote is for |
| `created_by` | uuid | FK → users.id, NOT NULL | Staff who created it |
| `reference` | varchar(20) | NOT NULL, UNIQUE | e.g. `QT-2025-0031` |
| `status` | varchar(20) | DEFAULT `draft` | See statuses below |
| `total_amount` | numeric(12,2) | NOT NULL | Total quoted price |
| `issued_at` | date | NULLABLE | When it was sent to client |
| `expires_at` | date | NULLABLE | Quote validity deadline |
| `notes` | text | NULLABLE | Terms, conditions, or context for client |
| `created_at` | timestamptz | DEFAULT now() | - |

**Quote statuses:**
- `draft` — being prepared, not yet sent
- `sent` — delivered to client
- `accepted` — client approved; triggers invoice creation
- `rejected` — client declined
- `expired` — passed validity date without response

---

### `quote_items`
Line items within a quote. Mirrors what will become invoice items if accepted.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `quote_id` | uuid | FK → quotes.id | - |
| `description` | varchar(200) | NOT NULL | e.g. `360 Photobooth – 4 hours`, `Balloon arch setup` |
| `quantity` | integer | NOT NULL, DEFAULT 1 | - |
| `unit_price` | numeric(12,2) | NOT NULL | Price per unit |
| `total_price` | numeric(12,2) | NOT NULL | quantity × unit_price |

---

### `invoices`
The formal billing document issued to a client. Generated from a booking's services or converted from an accepted quote.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `booking_id` | uuid | FK → bookings.id, NULLABLE | Associated booking |
| `client_id` | uuid | FK → clients.id, NOT NULL | Who is being billed |
| `created_by` | uuid | FK → users.id, NOT NULL | Staff who created it |
| `reference` | varchar(20) | NOT NULL, UNIQUE | e.g. `INV-2025-0058` |
| `status` | varchar(20) | DEFAULT `draft` | See statuses below |
| `subtotal` | numeric(12,2) | NOT NULL | Sum of line items before adjustments |
| `discount_amount` | numeric(12,2) | DEFAULT 0 | Any discount applied |
| `tax_amount` | numeric(12,2) | DEFAULT 0 | Tax if applicable |
| `total_amount` | numeric(12,2) | NOT NULL | Final billed amount |
| `amount_paid` | numeric(12,2) | DEFAULT 0 | Sum of all payments received |
| `amount_due` | numeric(12,2) | GENERATED | total_amount - amount_paid |
| `issued_at` | date | NULLABLE | Date sent to client |
| `due_date` | date | NULLABLE | Payment deadline |
| `notes` | text | NULLABLE | Payment instructions, bank details, etc. |
| `created_at` | timestamptz | DEFAULT now() | - |
| `updated_at` | timestamptz | DEFAULT now() | - |

**Invoice statuses:**
- `draft` — not yet sent
- `sent` — delivered to client, awaiting payment
- `partial` — deposit received, balance outstanding
- `paid` — fully settled
- `overdue` — past due date with outstanding balance
- `cancelled` — voided invoice

> **Note:** `amount_due` should be computed as `total_amount - amount_paid` either as a generated column in PostgreSQL or always derived in the application layer — never stored as a standalone editable field.

---

### `invoice_items`
Line items on an invoice. Can be linked to `booking_services` (Module 03) for auto-population, or entered manually.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `invoice_id` | uuid | FK → invoices.id | - |
| `booking_service_id` | uuid | FK → booking_services.id, NULLABLE | Source line item if auto-generated |
| `description` | varchar(200) | NOT NULL | What is being charged |
| `quantity` | integer | NOT NULL, DEFAULT 1 | - |
| `unit_price` | numeric(12,2) | NOT NULL | - |
| `total_price` | numeric(12,2) | NOT NULL | quantity × unit_price |

---

### `payments`
Records every payment received against an invoice — whether deposit, part payment, or final balance.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `invoice_id` | uuid | FK → invoices.id, NOT NULL | Which invoice this payment is for |
| `received_by` | uuid | FK → users.id, NOT NULL | Staff who recorded it |
| `reference` | varchar(50) | NULLABLE | e.g. `PAY-2025-0088` |
| `amount` | numeric(12,2) | NOT NULL | Amount received |
| `method` | varchar(30) | NOT NULL | See payment methods below |
| `status` | varchar(20) | DEFAULT `confirmed` | `confirmed`, `pending`, `failed`, `refunded` |
| `provider_ref` | varchar(100) | NULLABLE | External transaction ID (Paystack, MTN MoMo, etc.) |
| `paid_at` | date | NOT NULL | Date payment was received |
| `notes` | text | NULLABLE | Any notes e.g. `client paid via bank transfer, ref #XYZ` |
| `created_at` | timestamptz | DEFAULT now() | - |

**Payment methods:**
- `momo_mtn` — MTN Mobile Money
- `momo_vodafone` — Vodafone Cash
- `momo_airteltigo` — AirtelTigo Money
- `bank_transfer` — Direct bank deposit
- `cash` — Physical cash
- `paystack` — Online via Paystack
- `cheque` — Business cheque

---

## Relationships

```
bookings ──< quotes ──< quote_items
bookings ──< invoices ──< invoice_items >── booking_services (optional)
invoices ──< payments
clients ──< invoices
clients ──< quotes
users ──< invoices, quotes, payments
```

---

## Design Decisions

- **Quotes and invoices are separate tables** — a quote is a proposal; an invoice is a legal billing document. Not every quote becomes an invoice, and some invoices are created directly without a prior quote.
- **`amount_paid` is maintained by summing payments** — when a payment is recorded, a trigger or service-layer function updates `invoices.amount_paid` and recalculates `amount_due`. This keeps the invoice status always in sync.
- **`booking_service_id` is nullable on invoice items** — allows manual invoices for things not tied to a booking (e.g. a retail sale or a custom charge).
- **Multiple payment methods** — Mobile Money is the dominant payment method in Ghana. All major networks are enumerated explicitly rather than using a free-text field.
- **`provider_ref`** — stores the external transaction ID from Paystack or MoMo. Critical for reconciliation and dispute resolution.

---

## Key Business Logic

### Auto-generate invoice from booking
```python
def create_invoice_from_booking(session, booking_id, created_by):
    booking = session.query(Booking).get(booking_id)
    services = session.query(BookingService).filter_by(booking_id=booking_id).all()

    subtotal = sum(s.price for s in services)
    invoice = Invoice(
        booking_id=booking_id,
        client_id=booking.client_id,
        created_by=created_by,
        reference=generate_reference("INV", session),
        status="draft",
        subtotal=subtotal,
        total_amount=subtotal,  # adjust for tax/discount as needed
        amount_paid=0,
    )
    session.add(invoice)
    session.flush()

    for service in services:
        item = InvoiceItem(
            invoice_id=invoice.id,
            booking_service_id=service.id,
            description=service.service,
            quantity=1,
            unit_price=service.price,
            total_price=service.price,
        )
        session.add(item)

    session.commit()
    return invoice
```

### Update invoice on payment received
```python
def record_payment(session, invoice_id, amount, method, received_by, paid_at, provider_ref=None):
    payment = Payment(
        invoice_id=invoice_id,
        received_by=received_by,
        amount=amount,
        method=method,
        status="confirmed",
        provider_ref=provider_ref,
        paid_at=paid_at,
    )
    session.add(payment)

    invoice = session.query(Invoice).filter_by(id=invoice_id).with_for_update().one()
    invoice.amount_paid += amount

    if invoice.amount_paid >= invoice.total_amount:
        invoice.status = "paid"
    elif invoice.amount_paid > 0:
        invoice.status = "partial"

    session.commit()
```

### Overdue invoice detection (scheduled job)
```sql
UPDATE invoices
SET status = 'overdue'
WHERE status IN ('sent', 'partial')
  AND due_date < CURRENT_DATE
  AND amount_due > 0;
```

---

## FastAPI Notes

- `POST /quotes` — create a quote
- `POST /quotes/{id}/convert` — accept quote, auto-create invoice from it
- `POST /invoices/from-booking/{booking_id}` — generate invoice from booking services
- `GET /invoices?status=overdue` — list overdue invoices
- `POST /invoices/{id}/payments` — record a payment, updates invoice status
- `GET /invoices/{id}/pdf` — render invoice as PDF for sharing with client

---

## Indexes to Add

```sql
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_booking_id ON invoices(booking_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_quotes_booking_id ON quotes(booking_id);
```

---

## Previous / Next

← [Module 04 — Inventory & Equipment](./04-inventory-equipment.md)
→ [Module 06 — Expenses & Accounting](./06-expenses-accounting.md)
