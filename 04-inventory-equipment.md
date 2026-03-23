# Module 04 — Inventory & Equipment

## Overview

This module covers two distinct but related concerns:

1. **Inventory** — consumable or resalable stock: balloons, ribbon, fabric, candles, confetti, party supplies sold in the shop or used in décor setups.
2. **Equipment** — physical assets the business owns and deploys: 360 photobooth platform, LED ring, props, backdrops, lighting rigs. These are tracked individually, not by quantity.

Both connect to bookings (via `booking_equipment` in Module 03) and to purchasing (via suppliers and purchase orders).

---

## Tables

### `inventory_items`
Represents a type of stock item. Each row is a product category — quantity is tracked on this record and adjusted via transactions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `name` | varchar(150) | NOT NULL | e.g. `Chrome Balloon 12"`, `Organza Fabric (white)` |
| `sku` | varchar(50) | UNIQUE, NULLABLE | Internal stock-keeping code |
| `category` | varchar(50) | NOT NULL | e.g. `balloons`, `fabric`, `lighting`, `props`, `consumables` |
| `unit` | varchar(20) | NOT NULL | `piece`, `metre`, `pack`, `roll`, `box` |
| `quantity_in_stock` | integer | NOT NULL, DEFAULT 0 | Current available quantity |
| `reorder_level` | integer | DEFAULT 0 | Alert threshold — reorder when stock falls to this |
| `unit_cost` | numeric(12,2) | NULLABLE | What you pay per unit |
| `unit_price` | numeric(12,2) | NULLABLE | What you sell per unit (retail) |
| `location` | varchar(100) | NULLABLE | Physical storage location e.g. `Shelf A2`, `Storage Room` |
| `is_active` | boolean | DEFAULT true | Soft-disable discontinued items |
| `created_at` | timestamptz | DEFAULT now() | - |
| `updated_at` | timestamptz | DEFAULT now() | - |

**Item categories (suggested seed values):**
- `balloons` — latex, foil, chrome, bubble
- `fabric` — organza, satin, tulle
- `lighting` — fairy lights, LED strips, candles
- `props` — signs, frames, table decor
- `consumables` — tape, zip ties, cable, glue
- `packaging` — bags, boxes, wrapping

---

### `inventory_transactions`
Every change to stock quantity is recorded here. The `quantity_in_stock` on `inventory_items` is always the result of all transactions — never edited directly.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `item_id` | uuid | FK → inventory_items.id | Which item changed |
| `user_id` | uuid | FK → users.id | Who made the change |
| `booking_id` | uuid | FK → bookings.id, NULLABLE | If stock was used for a booking |
| `type` | varchar(30) | NOT NULL | See transaction types below |
| `quantity` | integer | NOT NULL | Positive = stock in, negative = stock out |
| `reason` | text | NULLABLE | Free-text explanation |
| `created_at` | timestamptz | DEFAULT now() | - |

**Transaction types:**
- `purchase` — stock received from supplier (positive)
- `usage` — used in a booking/event (negative)
- `sale` — sold over the counter (negative)
- `adjustment` — manual correction after stocktake (positive or negative)
- `damage` — written off as damaged/lost (negative)
- `return` — returned to stock from a booking (positive)

> **Rule:** `quantity_in_stock` is always updated via a trigger or service-layer function when a transaction is inserted — never updated directly. This preserves full audit history.

---

### `equipment`
Individual physical assets the business owns. Each piece of equipment has its own record — unlike inventory, these are tracked one-by-one, not by quantity.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `name` | varchar(150) | NOT NULL | e.g. `360 Photobooth Platform #1`, `LED Backdrop 8x8ft` |
| `category` | varchar(50) | NOT NULL | `photobooth`, `backdrop`, `lighting`, `props`, `transport` |
| `serial_number` | varchar(100) | UNIQUE, NULLABLE | Manufacturer serial if applicable |
| `status` | varchar(30) | NOT NULL, DEFAULT `available` | See statuses below |
| `condition` | varchar(20) | DEFAULT `good` | `excellent`, `good`, `fair`, `poor` |
| `purchase_cost` | numeric(12,2) | NULLABLE | What it cost to acquire |
| `purchased_at` | date | NULLABLE | Acquisition date |
| `last_serviced_at` | date | NULLABLE | Last maintenance date |
| `notes` | text | NULLABLE | Any notes about this specific unit |
| `is_active` | boolean | DEFAULT true | Retired/sold equipment is deactivated |
| `created_at` | timestamptz | DEFAULT now() | - |

**Equipment statuses:**
- `available` — ready to be allocated
- `reserved` — allocated to an upcoming booking
- `deployed` — currently out at an event
- `maintenance` — undergoing repair or service
- `retired` — no longer in use

---

### `equipment_maintenance`
Log of every service, repair, or inspection performed on a piece of equipment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `equipment_id` | uuid | FK → equipment.id | - |
| `user_id` | uuid | FK → users.id | Who logged it |
| `type` | varchar(30) | NOT NULL | `routine`, `repair`, `inspection`, `cleaning` |
| `description` | text | NOT NULL | What was done |
| `cost` | numeric(12,2) | NULLABLE | Cost of the service/repair |
| `serviced_at` | date | NOT NULL | When it was done |
| `next_service_at` | date | NULLABLE | Scheduled next service date |

---

### `suppliers`
Vendors you buy inventory from — balloon wholesalers, fabric suppliers, equipment parts dealers.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `name` | varchar(150) | NOT NULL | Supplier/company name |
| `contact_name` | varchar(100) | NULLABLE | Person to speak to |
| `phone` | varchar(20) | NULLABLE | - |
| `email` | varchar(255) | NULLABLE | - |
| `category` | varchar(50) | NULLABLE | What they supply e.g. `balloons`, `fabric`, `equipment` |
| `notes` | text | NULLABLE | Payment terms, delivery conditions, etc. |

---

### `purchase_orders`
Records of stock ordered from suppliers. Tracks what was ordered, expected delivery, and what was actually received.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `supplier_id` | uuid | FK → suppliers.id | - |
| `created_by` | uuid | FK → users.id | - |
| `reference` | varchar(20) | NOT NULL, UNIQUE | e.g. `PO-2025-0018` |
| `status` | varchar(20) | DEFAULT `draft` | `draft`, `sent`, `partial`, `received`, `cancelled` |
| `total_amount` | numeric(12,2) | NULLABLE | Total value of the order |
| `expected_at` | date | NULLABLE | Expected delivery date |
| `received_at` | date | NULLABLE | Actual receipt date |
| `created_at` | timestamptz | DEFAULT now() | - |

---

### `purchase_order_items`
Line items within a purchase order. On receipt, `quantity_received` is updated and triggers an inventory transaction.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK | - |
| `order_id` | uuid | FK → purchase_orders.id | - |
| `item_id` | uuid | FK → inventory_items.id | Which inventory item |
| `quantity_ordered` | integer | NOT NULL | How many were ordered |
| `quantity_received` | integer | DEFAULT 0 | How many actually arrived |
| `unit_cost` | numeric(12,2) | NOT NULL | Price per unit at time of order |

---

## Relationships

```
inventory_items ──< inventory_transactions >── bookings (optional)
inventory_items ──< purchase_order_items >── purchase_orders >── suppliers
equipment ──< equipment_maintenance
equipment ──< booking_equipment (Module 03)
```

---

## Design Decisions

- **Inventory and equipment are separate tables** — they behave differently. Inventory is quantity-based (how many balloons do we have?). Equipment is identity-based (where is photobooth unit #1 right now?).
- **Transactions, never direct edits** — stock levels are always the sum of all transactions. This gives a full audit trail and makes stocktakes easy to reconcile.
- **`reorder_level` alert** — when a transaction brings `quantity_in_stock` to or below `reorder_level`, the system should trigger a low-stock notification.
- **Purchase orders track partial receipts** — `quantity_received` may be less than `quantity_ordered`. Status `partial` handles this case.
- **Equipment maintenance log** — the 360 booth is a high-value asset. Tracking service history protects against unexpected breakdowns before events.

---

## Key Business Logic

### Stock update on transaction insert (trigger or service layer)
```python
def create_inventory_transaction(session, item_id, quantity, type, user_id, booking_id=None, reason=None):
    transaction = InventoryTransaction(
        item_id=item_id,
        user_id=user_id,
        booking_id=booking_id,
        type=type,
        quantity=quantity,
        reason=reason
    )
    session.add(transaction)

    # Update stock level atomically
    item = session.query(InventoryItem).filter_by(id=item_id).with_for_update().one()
    item.quantity_in_stock += quantity  # negative for outflows

    if item.quantity_in_stock <= item.reorder_level:
        trigger_low_stock_alert(item)

    session.commit()
```

### Low stock report query
```sql
SELECT name, sku, quantity_in_stock, reorder_level
FROM inventory_items
WHERE quantity_in_stock <= reorder_level
  AND is_active = true
ORDER BY (quantity_in_stock - reorder_level) ASC;
```

### Equipment availability check (before booking allocation)
```sql
SELECT e.name, e.status
FROM equipment e
JOIN booking_equipment be ON be.equipment_id = e.id
JOIN bookings b ON b.id = be.booking_id
WHERE e.id = :equipment_id
  AND b.event_date = :event_date
  AND b.status IN ('confirmed', 'in_progress');
```

---

## FastAPI Notes

- `GET /inventory?low_stock=true` — returns items at or below reorder level
- `POST /inventory/transactions` — creates transaction and updates stock atomically
- `GET /equipment?status=available&date=2025-11-15` — available equipment for a given date
- `POST /purchase-orders/{id}/receive` — marks items as received, triggers inventory transactions

---

## Indexes to Add

```sql
CREATE INDEX idx_inventory_items_category ON inventory_items(category);
CREATE INDEX idx_inventory_items_low_stock ON inventory_items(quantity_in_stock) WHERE quantity_in_stock <= reorder_level;
CREATE INDEX idx_inventory_transactions_item_id ON inventory_transactions(item_id);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
```

---

## Previous / Next

← [Module 03 — Bookings & Events](./03-bookings-events.md)
→ [Module 05 — Invoicing & Payments](./05-invoicing-payments.md)
