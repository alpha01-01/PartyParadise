# Module 08 — Contracts & Documents

## Overview

This module handles service agreements between the business and clients, and general document storage for bookings. Contracts protect the business — covering deposits, cancellation terms, liability, and scope of service. Documents cover everything else: mood boards, inspiration photos, floor plans, insurance certificates.

The signing flow is lightweight and practical: contracts are sent via a link, clients sign digitally by typing their name and clicking agree, and the signed timestamp + IP is recorded as legal evidence.

---

## Tables

### `contract_templates`
Reusable contract templates for each service type. Staff select a template when creating a contract — it pre-fills the body, which can then be customised per booking.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `name` | varchar(150) | NOT NULL | e.g. `Standard Décor Agreement`, `360 Booth Rental Terms` |
| `service_type` | varchar(30) | NULLABLE | `decor`, `photobooth_360`, `photobooth_rental`, `combo` |
| `body` | text | NOT NULL | Full contract text with placeholder tokens |
| `is_active` | boolean | DEFAULT true | - |
| `created_at` | timestamptz | DEFAULT now() | - |
| `updated_at` | timestamptz | DEFAULT now() | - |

**Template placeholder tokens** (replaced at contract generation time):
- `{{client_name}}` — full name of client
- `{{event_date}}` — date of the event
- `{{venue}}` — venue name and address
- `{{service_description}}` — list of services
- `{{total_amount}}` — total contract value
- `{{deposit_amount}}` — deposit required
- `{{deposit_due_date}}` — when deposit is due
- `{{business_name}}` — your business name
- `{{cancellation_policy}}` — standard cancellation clause

---

### `contracts`
A generated, client-specific contract for a booking. Created from a template, customised if needed, then sent to the client for digital signature.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `booking_id` | uuid | FK → bookings.id, NOT NULL | The booking this contract covers |
| `client_id` | uuid | FK → clients.id, NOT NULL | Who is signing |
| `template_id` | uuid | FK → contract_templates.id, NULLABLE | Source template |
| `created_by` | uuid | FK → users.id, NOT NULL | Staff who generated it |
| `reference` | varchar(20) | NOT NULL, UNIQUE | e.g. `CT-2025-0014` |
| `status` | varchar(20) | DEFAULT `draft` | See statuses below |
| `body` | text | NOT NULL | Final contract text with tokens replaced |
| `client_name` | varchar(150) | NOT NULL | Captured at generation time |
| `client_phone` | varchar(20) | NULLABLE | Captured at generation time |
| `event_date` | date | NOT NULL | Captured at generation time |
| `venue` | varchar(250) | NULLABLE | Captured at generation time |
| `total_amount` | numeric(12,2) | NOT NULL | Contract value at signing time |
| `deposit_amount` | numeric(12,2) | NULLABLE | Deposit agreed in the contract |
| `special_terms` | text | NULLABLE | Any custom terms added for this booking |
| `sent_at` | timestamptz | NULLABLE | When the signing link was sent to client |
| `signed_at` | timestamptz | NULLABLE | When the client signed |
| `signature_data` | text | NULLABLE | Typed name or base64 signature image |
| `signed_ip` | varchar(45) | NULLABLE | Client's IP at time of signing |
| `created_at` | timestamptz | DEFAULT now() | - |
| `updated_at` | timestamptz | DEFAULT now() | - |

**Contract statuses:**
- `draft` — being prepared
- `sent` — signing link delivered to client
- `signed` — client has signed
- `expired` — link expired without signing
- `cancelled` — voided

> **Why capture client details directly on the contract?** Contracts are legal documents — they should be self-contained snapshots. If the client's name or phone changes later in the system, the contract must reflect what was true at signing time.

---

### `documents`
General file storage for any document associated with a booking or client — mood boards, venue floor plans, reference images, insurance docs, receipts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `booking_id` | uuid | FK → bookings.id, NULLABLE | Associated booking |
| `client_id` | uuid | FK → clients.id, NULLABLE | Associated client |
| `uploaded_by` | uuid | FK → users.id, NOT NULL | Who uploaded it |
| `name` | varchar(200) | NOT NULL | Display name e.g. `Venue Floor Plan` |
| `type` | varchar(30) | NOT NULL | See document types below |
| `file_url` | text | NOT NULL | URL in cloud storage (Supabase / Cloudinary) |
| `mime_type` | varchar(50) | NULLABLE | e.g. `application/pdf`, `image/jpeg` |
| `file_size` | integer | NULLABLE | Size in bytes |
| `is_visible_to_client` | boolean | DEFAULT false | If true, shows in client portal |
| `created_at` | timestamptz | DEFAULT now() | - |

**Document types:**
- `mood_board` — inspiration images from client
- `floor_plan` — venue layout
- `reference_image` — décor reference photos
- `signed_contract` — PDF of signed contract
- `receipt` — expense receipt photos
- `insurance` — event insurance certificate
- `other` — catch-all

---

## Relationships

```
contract_templates ──< contracts
contracts >── bookings
contracts >── clients
documents >── bookings (optional)
documents >── clients (optional)
```

---

## Design Decisions

- **Contract body is stored as final text** — once tokens are replaced and the contract is sent, the body is frozen. Changes to the template afterwards do not affect existing contracts.
- **Key booking details are copied onto the contract** — `client_name`, `event_date`, `venue`, `total_amount` are all snapshotted at contract creation. This makes the contract legally self-contained and independent of future data changes.
- **Digital signature via typed name + timestamp + IP** — lightweight but legally defensible for service agreements at this business scale. The combination of typed name, timestamp, and IP address provides sufficient evidence of consent. A more formal e-signature service (like DocuSign) can be integrated later if needed.
- **Signing link pattern** — generate a unique, time-limited token (e.g. a signed JWT or UUID stored in cache) and embed it in a URL sent to the client via WhatsApp or email. When the client opens the link, they see the contract, type their name, and click sign. No login required.
- **`is_visible_to_client` on documents** — staff can upload internal working files (detailed costings, supplier quotes) that stay hidden from the client portal, while sharing only the mood board and floor plan.

---

## Key Business Logic

### Generate contract from template
```python
def generate_contract(session, booking_id, template_id, created_by):
    booking = session.query(Booking).get(booking_id)
    client = session.query(Client).get(booking.client_id)
    template = session.query(ContractTemplate).get(template_id)

    # Replace tokens
    services = session.query(BookingService).filter_by(booking_id=booking_id).all()
    service_list = "\n".join([f"- {s.service}" for s in services])
    total = sum(s.price for s in services)

    body = template.body
    replacements = {
        "{{client_name}}": f"{client.first_name} {client.last_name}",
        "{{event_date}}": str(booking.event_date),
        "{{venue}}": booking.venue_name or "",
        "{{service_description}}": service_list,
        "{{total_amount}}": f"GHS {total:,.2f}",
        "{{business_name}}": "Your Business Name",
    }
    for token, value in replacements.items():
        body = body.replace(token, value)

    contract = Contract(
        booking_id=booking_id,
        client_id=booking.client_id,
        template_id=template_id,
        created_by=created_by,
        reference=generate_reference("CT", session),
        status="draft",
        body=body,
        client_name=f"{client.first_name} {client.last_name}",
        client_phone=client.phone,
        event_date=booking.event_date,
        venue=booking.venue_name,
        total_amount=total,
    )
    session.add(contract)
    session.commit()
    return contract
```

### Handle client signature
```python
from datetime import datetime

def sign_contract(session, contract_id, signature_data, client_ip):
    contract = session.query(Contract).filter_by(
        id=contract_id,
        status="sent"
    ).one_or_none()

    if not contract:
        raise ValueError("Contract not found or already signed")

    contract.status = "signed"
    contract.signature_data = signature_data
    contract.signed_at = datetime.utcnow()
    contract.signed_ip = client_ip
    session.commit()

    # Auto-update booking status if needed
    booking = session.query(Booking).get(contract.booking_id)
    if booking.status == "inquiry":
        booking.status = "confirmed"
        session.commit()
```

### Signing link generation
```python
import secrets
from datetime import datetime, timedelta

def generate_signing_link(contract_id: str, base_url: str) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=72)

    # Store token in cache or a signing_tokens table
    store_signing_token(token, contract_id, expires_at)

    return f"{base_url}/sign/{token}"
```

---

## FastAPI Notes

- `POST /contracts/generate` — create contract from template for a booking
- `POST /contracts/{id}/send` — generate signing link and send via WhatsApp/email
- `GET /contracts/sign/{token}` — public endpoint; returns contract body for client to review (no auth required)
- `POST /contracts/sign/{token}` — client submits signature; records name, IP, timestamp
- `GET /contracts/{id}/pdf` — render signed contract as downloadable PDF
- `POST /documents/upload` — upload file to cloud storage, create document record
- `GET /bookings/{id}/documents` — all documents for a booking

---

## Indexes to Add

```sql
CREATE INDEX idx_contracts_booking_id ON contracts(booking_id);
CREATE INDEX idx_contracts_client_id ON contracts(client_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_documents_booking_id ON documents(booking_id);
CREATE INDEX idx_documents_client_id ON documents(client_id);
```

---

## Previous / Next

← [Module 07 — Staff & Scheduling](./07-staff-scheduling.md)
→ [Module 09 — Client Portal](./09-client-portal.md)
