from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.accounting import ExpenseCategory, JournalEntry
from app.models.auth import AuditLog
from app.models.inventory import InventoryItem
from app.models.invoicing import Invoice, Payment

TODAY = date.today().isoformat()


@pytest.fixture
def client_id(api, admin_headers):
    return api.post(
        "/clients",
        json={"first_name": "Ama", "last_name": "Mensah", "email": "ama@example.com"},
        headers=admin_headers,
    ).json()["id"]


def create_invoice(api, headers, client_id, **overrides):
    body = {
        "client_id": client_id,
        "items": [{"description": "Hall", "quantity": 2, "unit_price": "100", "total_price": "200"}],
        **overrides,
    }
    return api.post("/invoicing/invoices", json=body, headers=headers)


@pytest.fixture
def invoice_id(api, admin_headers, client_id):
    invoice_id = create_invoice(api, admin_headers, client_id).json()["id"]
    assert api.patch(f"/invoicing/invoices/{invoice_id}/send", headers=admin_headers).status_code == 200
    return invoice_id


def pay(api, headers, invoice_id, **overrides):
    body = {"amount": "50.00", "method": "cash", "paid_at": TODAY, **overrides}
    return api.post(f"/invoicing/invoices/{invoice_id}/payments", json=body, headers=headers)


# --- Staff payments ---

def test_partial_then_full_payment_keeps_totals_and_ledger_in_step(api, db, admin_headers, invoice_id):
    assert pay(api, admin_headers, invoice_id, amount="50.00").status_code == 201
    invoice = db.get(Invoice, invoice_id)
    assert (invoice.status, invoice.amount_paid) == ("partial", Decimal("50.00"))

    assert pay(api, admin_headers, invoice_id, amount="150.00").status_code == 201
    db.refresh(invoice)
    assert (invoice.status, invoice.amount_paid) == ("paid", Decimal("200.00"))

    payments = db.query(Payment).filter(Payment.invoice_id == invoice_id).all()
    assert {p.source for p in payments} == {"staff"}
    assert db.query(JournalEntry).filter(
        JournalEntry.source_id.in_([p.id for p in payments]),
        JournalEntry.type == "income",
    ).count() == 2


@pytest.mark.parametrize(
    "overrides, status",
    [
        ({"amount": "-5"}, 422),
        ({"amount": "0"}, 422),
        ({"amount": "200.01"}, 422),
        ({"method": "chicken"}, 422),
        ({"paid_at": (date.today() + timedelta(days=1)).isoformat()}, 422),
    ],
)
def test_bad_payments_are_refused(api, db, admin_headers, invoice_id, overrides, status):
    assert pay(api, admin_headers, invoice_id, **overrides).status_code == status
    assert db.query(Payment).count() == 0


def test_draft_invoice_cannot_take_a_staff_payment(api, db, admin_headers, client_id):
    draft = create_invoice(api, admin_headers, client_id).json()["id"]

    assert pay(api, admin_headers, draft).status_code == 400


def test_paid_invoice_cannot_take_another_payment(api, admin_headers, invoice_id):
    pay(api, admin_headers, invoice_id, amount="200.00")

    assert pay(api, admin_headers, invoice_id, amount="1.00").status_code == 400


def test_failed_ledger_write_leaves_no_payment(api, db, admin_headers, invoice_id):
    db.execute(text("ALTER TABLE journal_entries ADD CONSTRAINT test_block CHECK (amount < 0) NOT VALID"))
    db.flush()

    assert pay(api, admin_headers, invoice_id).status_code == 422

    assert db.query(Payment).count() == 0
    assert db.get(Invoice, invoice_id).amount_paid == Decimal("0")


# --- Sending ---

def test_resending_a_paid_invoice_is_refused(api, db, admin_headers, invoice_id):
    pay(api, admin_headers, invoice_id, amount="200.00")

    assert api.patch(f"/invoicing/invoices/{invoice_id}/send", headers=admin_headers).status_code == 400
    assert db.get(Invoice, invoice_id).status == "paid"


def test_resending_a_part_paid_invoice_keeps_its_status(api, db, admin_headers, invoice_id):
    pay(api, admin_headers, invoice_id)

    assert api.patch(f"/invoicing/invoices/{invoice_id}/send", headers=admin_headers).status_code == 200
    assert db.get(Invoice, invoice_id).status == "partial"


# --- Invoice totals ---

def test_line_totals_are_calculated_by_the_server(api, admin_headers, client_id):
    response = create_invoice(
        api,
        admin_headers,
        client_id,
        items=[{"description": "Hall", "quantity": 3, "unit_price": "10.50"}],
    )

    assert response.status_code == 201
    assert response.json()["total_amount"] == 31.5


@pytest.mark.parametrize(
    "overrides",
    [
        {"items": [{"description": "Hall", "quantity": 2, "unit_price": "100", "total_price": "1"}]},
        {"items": [{"description": "Hall", "quantity": 0, "unit_price": "100"}]},
        {"items": [{"description": "Hall", "quantity": 1, "unit_price": "-1"}]},
        {"items": []},
        {"discount_amount": "-1"},
        {"tax_amount": "-1"},
        {"discount_amount": "201"},
    ],
)
def test_bad_invoices_are_refused(api, admin_headers, client_id, overrides):
    assert create_invoice(api, admin_headers, client_id, **overrides).status_code == 422


# --- Expenses ---

@pytest.fixture
def category_id(db):
    category = ExpenseCategory(name="Test Category", type="operating")
    db.add(category)
    db.commit()
    return str(category.id)


def create_expense(api, headers, category_id, amount="50.00"):
    return api.post(
        "/accounting/expenses",
        json={
            "category_id": category_id,
            "description": "Chairs",
            "amount": amount,
            "payment_method": "cash",
            "expense_date": TODAY,
        },
        headers=headers,
    )


@pytest.mark.parametrize("amount", ["-5", "0"])
def test_bad_expense_amounts_are_refused(api, admin_headers, category_id, amount):
    assert create_expense(api, admin_headers, category_id, amount).status_code == 422


def test_voiding_by_update_matches_voiding_by_delete(api, db, admin_headers, category_id):
    expense = create_expense(api, admin_headers, category_id).json()

    response = api.patch(
        f"/accounting/expenses/{expense['id']}",
        json={"status": "voided"},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "voided"
    assert db.query(JournalEntry).filter(JournalEntry.source_id == expense["id"]).count() == 0
    assert db.query(AuditLog).filter(AuditLog.entity_id == expense["id"]).one().changes["amount"] == 50.0


# --- Shop sales ---

@pytest.fixture
def stock_item(db):
    item = InventoryItem(name="Balloons", category="decor", unit="pack", quantity_in_stock=10, unit_price=Decimal("9.00"))
    db.add(item)
    db.commit()
    return str(item.id)


def sell(api, headers, item_id, **overrides):
    return api.post(
        "/inventory/shop-sales",
        json={"items": [{"item_id": item_id, "quantity": 2}], "notes": "Birthday order", **overrides},
        headers=headers,
    )


def test_shop_sale_writes_a_ledger_entry(api, db, admin_headers, stock_item):
    assert sell(api, admin_headers, stock_item).status_code == 201

    payment = db.query(Payment).one()
    assert payment.source == "shop"
    journal = db.query(JournalEntry).filter(JournalEntry.source_id == payment.id).one()
    assert (journal.type, journal.amount) == ("income", Decimal("18.00"))


def test_shop_sale_refuses_unknown_payment_method(api, admin_headers, stock_item):
    assert sell(api, admin_headers, stock_item, payment_method="chicken").status_code == 422


def test_invoice_notes_hide_shop_sale_metadata(api, admin_headers, stock_item):
    sell(api, admin_headers, stock_item)

    invoice = api.get("/invoicing/invoices", headers=admin_headers).json()["items"][0]

    assert invoice["notes"] == "Birthday order"


# --- Database rules ---

def test_database_refuses_invalid_invoice_state(db, api, admin_headers, invoice_id):
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.execute(text("UPDATE invoices SET amount_paid = -1 WHERE id = :id"), {"id": invoice_id})


def test_database_refuses_duplicate_provider_ref(db, api, admin_headers, invoice_id):
    pay(api, admin_headers, invoice_id, amount="10.00", provider_ref="ref-1")

    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.execute(
                text(
                    "INSERT INTO payments (id, invoice_id, amount, method, paid_at, provider_ref) "
                    "VALUES (gen_random_uuid(), :id, 1, 'cash', now(), 'ref-1')"
                ),
                {"id": invoice_id},
            )
