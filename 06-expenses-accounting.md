# Module 06 — Expenses & Accounting

## Overview

This module handles the money-out side of the business and provides the financial reporting layer. It tracks every expense, organises finances into accounting periods, maintains a journal of all financial movements, and tracks bank account balances.

It is intentionally kept practical — not a full double-entry bookkeeping system, but structured enough to produce accurate P&L reports, monthly summaries, and per-booking profitability breakdowns.

---

## Tables

### `expense_categories`
User-configurable categories for classifying expenses.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `name` | varchar(100) | NOT NULL, UNIQUE | e.g. `Stock & Supplies`, `Transport`, `Staff Wages` |
| `type` | varchar(20) | NOT NULL | `operational`, `capital`, `admin`, `marketing` |
| `color` | varchar(7) | NULLABLE | Hex color for UI charts e.g. `#10B981` |
| `is_active` | boolean | DEFAULT true | - |

**Suggested seed categories:**
- `Stock & Supplies` — balloons, fabric, consumables
- `Transport` — fuel, vehicle hire, delivery costs
- `Staff Wages` — salaries, daily labour
- `Equipment Maintenance` — repairs, servicing
- `Marketing` — ads, printing, promotions
- `Utilities` — electricity, internet, water
- `Rent` — shop/storage space
- `Miscellaneous` — anything that doesn't fit elsewhere

---

### `expenses`
Every business expenditure — from buying balloon stock to paying for fuel on event day.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `category_id` | uuid | FK → expense_categories.id, NOT NULL | - |
| `recorded_by` | uuid | FK → users.id, NOT NULL | Staff who logged it |
| `booking_id` | uuid | FK → bookings.id, NULLABLE | If the expense is tied to a specific booking |
| `supplier_id` | uuid | FK → suppliers.id, NULLABLE | If purchased from a known supplier |
| `reference` | varchar(20) | NULLABLE | e.g. `EXP-2025-0019` |
| `description` | varchar(250) | NOT NULL | What the expense was for |
| `amount` | numeric(12,2) | NOT NULL | Amount spent |
| `payment_method` | varchar(30) | NOT NULL | `cash`, `momo_mtn`, `momo_vodafone`, `bank_transfer`, `card` |
| `status` | varchar(20) | DEFAULT `confirmed` | `confirmed`, `pending`, `reimbursable` |
| `expense_date` | date | NOT NULL | When it was incurred |
| `receipt_url` | text | NULLABLE | Link to uploaded photo of receipt |
| `notes` | text | NULLABLE | Any additional context |
| `created_at` | timestamptz | DEFAULT now() | - |

> **Tip:** Linking `booking_id` enables per-event profitability reports — income minus all expenses tied to that booking.

---

### `account_periods`
Monthly (or custom) accounting periods used to organise and close the books. Closing a period locks it from edits and captures the financial snapshot.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `label` | varchar(50) | NOT NULL, UNIQUE | e.g. `November 2025`, `Q4 2025` |
| `start_date` | date | NOT NULL | Period start |
| `end_date` | date | NOT NULL | Period end |
| `status` | varchar(20) | DEFAULT `open` | `open`, `closed` |
| `total_income` | numeric(12,2) | DEFAULT 0 | Computed on close — sum of payments received |
| `total_expenses` | numeric(12,2) | DEFAULT 0 | Computed on close — sum of expenses |
| `net_profit` | numeric(12,2) | DEFAULT 0 | `total_income - total_expenses` |
| `closed_at` | timestamptz | NULLABLE | When the period was closed |

---

### `journal_entries`
A running ledger of all financial events — income, expenses, adjustments. Every payment received and expense paid creates a journal entry. This is the source of truth for reporting.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `period_id` | uuid | FK → account_periods.id, NULLABLE | Which accounting period this falls in |
| `created_by` | uuid | FK → users.id, NOT NULL | - |
| `reference` | varchar(50) | NULLABLE | Human-readable reference |
| `type` | varchar(20) | NOT NULL | `income`, `expense`, `adjustment`, `refund` |
| `description` | varchar(250) | NOT NULL | What this entry represents |
| `amount` | numeric(12,2) | NOT NULL | Always positive — type determines direction |
| `source_type` | varchar(30) | NULLABLE | `payment`, `expense`, `purchase_order`, `manual` |
| `source_id` | uuid | NULLABLE | The ID of the originating record |
| `entry_date` | date | NOT NULL | Date of the financial event |
| `created_at` | timestamptz | DEFAULT now() | - |

> **Design note:** `source_type` + `source_id` form a polymorphic reference — they allow you to trace any journal entry back to its origin (a payment, an expense, a PO receipt) without foreign key constraints on multiple tables.

---

### `bank_accounts`
Represents each bank account or mobile money wallet the business operates.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `name` | varchar(100) | NOT NULL | e.g. `MTN MoMo – Business`, `GCB Current Account` |
| `bank_name` | varchar(100) | NULLABLE | Bank or provider name |
| `account_number` | varchar(50) | NULLABLE | Masked or partial for display |
| `account_type` | varchar(30) | NOT NULL | `current`, `savings`, `momo`, `cash_float` |
| `current_balance` | numeric(12,2) | DEFAULT 0 | Running balance — updated on each transaction |
| `currency` | varchar(5) | DEFAULT `GHS` | ISO currency code |
| `is_active` | boolean | DEFAULT true | - |

---

### `bank_transactions`
Every movement in and out of each account — receipts from clients, payments to suppliers, transfers between accounts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `account_id` | uuid | FK → bank_accounts.id, NOT NULL | Which account |
| `journal_entry_id` | uuid | FK → journal_entries.id, NULLABLE | Linked journal entry |
| `type` | varchar(10) | NOT NULL | `credit` (money in) or `debit` (money out) |
| `amount` | numeric(12,2) | NOT NULL | Always positive |
| `balance_after` | numeric(12,2) | NOT NULL | Account balance after this transaction |
| `description` | varchar(250) | NOT NULL | What it was for |
| `transaction_date` | date | NOT NULL | - |
| `created_at` | timestamptz | DEFAULT now() | - |

---

## Relationships

```
expense_categories ──< expenses >── bookings (optional)
expenses >── suppliers (optional)
account_periods ──< journal_entries
bank_accounts ──< bank_transactions >── journal_entries (optional)
payments (Module 05) → journal_entries (auto-created on payment)
expenses → journal_entries (auto-created on expense)
```

---

## Design Decisions

- **Journal entries are auto-created** — when a payment is recorded (Module 05) or an expense is logged, a corresponding journal entry is created automatically. This keeps the ledger complete without manual bookkeeping steps.
- **`account_periods` for monthly closing** — closing a period locks income/expense totals as a snapshot. Useful for month-end reviews and prevents retroactive edits to settled periods.
- **`booking_id` on expenses** — lets you calculate true per-event profitability: take total invoice amount for a booking, subtract all expenses linked to that `booking_id`.
- **`receipt_url`** — staff should photograph receipts and upload them. Stored in Supabase Storage or Cloudinary. Links stored here.
- **`bank_accounts` includes MoMo wallets** — in Ghana, MoMo is a real business account. Treat it as a first-class financial account with its own balance tracking.
- **`balance_after` on bank transactions** — storing running balance per transaction makes it easy to reconstruct the account history at any point in time without summing all transactions.

---

## Key Business Logic

### Auto-create journal entry on payment received
```python
def on_payment_created(session, payment):
    period = get_active_period(session, payment.paid_at)
    entry = JournalEntry(
        period_id=period.id if period else None,
        created_by=payment.received_by,
        type="income",
        description=f"Payment for invoice {payment.invoice.reference}",
        amount=payment.amount,
        source_type="payment",
        source_id=payment.id,
        entry_date=payment.paid_at,
    )
    session.add(entry)
```

### Auto-create journal entry on expense logged
```python
def on_expense_created(session, expense):
    period = get_active_period(session, expense.expense_date)
    entry = JournalEntry(
        period_id=period.id if period else None,
        created_by=expense.recorded_by,
        type="expense",
        description=expense.description,
        amount=expense.amount,
        source_type="expense",
        source_id=expense.id,
        entry_date=expense.expense_date,
    )
    session.add(entry)
```

### Monthly P&L summary query
```sql
SELECT
  ap.label,
  ap.total_income,
  ap.total_expenses,
  ap.net_profit,
  ROUND((ap.net_profit / NULLIF(ap.total_income, 0)) * 100, 2) AS profit_margin_pct
FROM account_periods ap
WHERE ap.status = 'closed'
ORDER BY ap.start_date DESC;
```

### Per-booking profitability
```sql
SELECT
  b.reference,
  COALESCE(SUM(p.amount), 0) AS total_income,
  COALESCE(SUM(e.amount), 0) AS total_expenses,
  COALESCE(SUM(p.amount), 0) - COALESCE(SUM(e.amount), 0) AS profit
FROM bookings b
LEFT JOIN invoices i ON i.booking_id = b.id
LEFT JOIN payments p ON p.invoice_id = i.id AND p.status = 'confirmed'
LEFT JOIN expenses e ON e.booking_id = b.id
WHERE b.id = :booking_id
GROUP BY b.reference;
```

### Close an accounting period
```python
def close_period(session, period_id):
    period = session.query(AccountPeriod).get(period_id)

    total_income = session.query(func.sum(JournalEntry.amount)).filter(
        JournalEntry.period_id == period_id,
        JournalEntry.type == "income"
    ).scalar() or 0

    total_expenses = session.query(func.sum(JournalEntry.amount)).filter(
        JournalEntry.period_id == period_id,
        JournalEntry.type == "expense"
    ).scalar() or 0

    period.total_income = total_income
    period.total_expenses = total_expenses
    period.net_profit = total_income - total_expenses
    period.status = "closed"
    period.closed_at = datetime.utcnow()
    session.commit()
```

---

## FastAPI Notes

- `GET /reports/pnl?year=2025` — profit & loss by month for a given year
- `GET /reports/booking/{id}/profitability` — income vs expenses for one booking
- `GET /expenses?category=Transport&month=2025-11` — filtered expense list
- `POST /account-periods/{id}/close` — close and lock a period
- `GET /bank-accounts` — list all accounts with current balances
- `GET /bank-accounts/{id}/transactions` — transaction history for an account

---

## Indexes to Add

```sql
CREATE INDEX idx_expenses_booking_id ON expenses(booking_id);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_journal_entries_period_id ON journal_entries(period_id);
CREATE INDEX idx_journal_entries_entry_date ON journal_entries(entry_date);
CREATE INDEX idx_journal_entries_type ON journal_entries(type);
CREATE INDEX idx_bank_transactions_account_id ON bank_transactions(account_id);
```

---

## Previous / Next

← [Module 05 — Invoicing & Payments](./05-invoicing-payments.md)
→ [Module 07 — Staff & Scheduling](./07-staff-scheduling.md)
