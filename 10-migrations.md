# Step 2 — Database Migrations

## Overview

PartyParadise uses **Alembic** for database migrations. Every schema change is versioned and reproducible. Migrations run in sequence — each one depends on the previous.

---

## Migration Files

| File | Module | Tables Created |
|---|---|---|
| `001_auth_users.py` | Auth & Users | users, roles, permissions, user_roles, role_permissions, sessions, audit_logs |
| `002_clients_leads.py` | Clients & Leads | clients, client_addresses, interactions, tags, client_tags |
| `003_bookings_events.py` | Bookings & Events | bookings, booking_services, booking_staff, booking_notes |
| `004_inventory_equipment.py` | Inventory & Equipment | suppliers, inventory_items, inventory_transactions, equipment, booking_equipment, equipment_maintenance, purchase_orders, purchase_order_items |
| `005_invoicing_payments.py` | Invoicing & Payments | quotes, quote_items, invoices, invoice_items, payments + invoice_balances view |
| `006_expenses_accounting.py` | Expenses & Accounting | expense_categories, expenses, account_periods, journal_entries, bank_accounts, bank_transactions |
| `007_staff_scheduling.py` | Staff & Scheduling | staff_profiles, shifts, attendance, payroll_periods, payroll_entries, leave_requests |
| `008_contracts_documents.py` | Contracts & Documents | contract_templates, contracts, documents |
| `009_client_portal.py` | Client Portal | client_portal_accounts, portal_sessions, portal_notifications, portal_inquiries |

> **Note:** `booking_equipment` is created in migration 004 (not 003) because it has a FK to `equipment`, which is also created in 004. Migration order always follows FK dependency order.

---

## Setup

### Install dependencies
```bash
cd apps/api
pip install -r requirements.txt
```

### `requirements.txt` (relevant entries)
```
fastapi==0.111.0
uvicorn==0.29.0
sqlalchemy==2.0.30
alembic==1.13.1
psycopg2-binary==2.9.9
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-dotenv==1.0.1
```

### Configure the database URL
```bash
cp .env.example .env
# Set DATABASE_URL in .env:
# DATABASE_URL=postgresql://user:password@localhost:5432/partyparadise
```

---

## Running Migrations

### Apply all migrations (fresh setup)
```bash
alembic upgrade head
```

### Apply to a specific version
```bash
alembic upgrade 005
```

### Check current version
```bash
alembic current
```

### View migration history
```bash
alembic history --verbose
```

### Roll back one migration
```bash
alembic downgrade -1
```

### Roll back to a specific version
```bash
alembic downgrade 003
```

### Roll back everything
```bash
alembic downgrade base
```

---

## Creating New Migrations

When you add or change a model, generate a new migration:

```bash
# Auto-generate from model changes
alembic revision --autogenerate -m "add column X to bookings"

# Create empty migration (for manual SQL)
alembic revision -m "seed permissions table"
```

> Always review auto-generated migrations before running them. Alembic doesn't always detect renames correctly.

---

## Seed Data Included

The following seed data is inserted automatically during migrations:

| Migration | Seed Data |
|---|---|
| 001 | Default roles: `admin`, `manager`, `staff` |
| 002 | Default tags: `VIP`, `Wedding`, `Corporate`, `Repeat Client` |
| 006 | Default expense categories: `Stock & Supplies`, `Transport`, `Staff Wages`, `Equipment Maintenance`, `Marketing`, `Utilities`, `Rent`, `Miscellaneous` |
| 008 | Contract templates for `decor`, `photobooth_360`, `photobooth_rental` |

---

## Views Created

### `invoice_balances`
Created in migration 005. A convenience view that always computes `amount_due`:

```sql
SELECT id, reference, total_amount, amount_paid,
       (total_amount - amount_paid) AS amount_due, status
FROM invoices;
```

Use this view in the API and frontend wherever you need `amount_due` — never compute it manually in application code.

---

## Key Design Rules

1. **Never edit a migration that has already been run in production.** Create a new migration instead.
2. **`downgrade()` must always be implemented.** Even if you never plan to roll back, it keeps the migration chain clean.
3. **FK ordering matters.** Tables must be created before tables that reference them. The migration order (001 → 009) follows this dependency chain.
4. **`ondelete` behaviour is explicit on every FK:**
   - `CASCADE` — child rows deleted when parent is deleted (e.g. booking_services when booking deleted)
   - `RESTRICT` — prevent deletion if child rows exist (e.g. can't delete a client who has invoices)
   - `SET NULL` — child FK set to null when parent deleted (e.g. booking_id on expense when booking deleted)
5. **All timestamps are `timezone=True`** — always store UTC, convert to local time in the frontend.

---

## Docker Setup (Local Dev)

```bash
# Start PostgreSQL
docker run --name partyparadise-db \
  -e POSTGRES_USER=partyparadise \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=partyparadise \
  -p 5432:5432 \
  -d postgres:15

# Run all migrations
cd apps/api
alembic upgrade head

# Verify tables exist
docker exec -it partyparadise-db psql -U partyparadise -c "\dt"
```

---

## CI/CD

Migrations are run automatically in the deploy pipeline before the new API version starts:

```yaml
# .github/workflows/deploy.yml (relevant step)
- name: Run migrations
  run: |
    cd apps/api
    alembic upgrade head
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## Previous / Next

← [Step 1 — Project Structure](./00-project-structure.md)
→ [Step 3 — API Layer](./11-api-layer.md)
