from datetime import date

import pytest

from app.models.accounting import ExpenseCategory
from app.models.auth import AuditLog
from app.utils.security import hash_password


@pytest.fixture
def client_id(api, admin_headers):
    response = api.post(
        "/clients",
        json={"first_name": "Ama", "last_name": "Mensah", "email": "ama@example.com"},
        headers=admin_headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture
def booking_id(api, admin_headers, client_id):
    response = api.post(
        "/bookings",
        json={
            "client_id": client_id,
            "service_type": "rentals",
            "event_date": "2027-06-01",
            "venue_name": "Old Hall",
        },
        headers=admin_headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


def audit_rows(db, entity_type):
    return db.query(AuditLog).filter(AuditLog.entity_type == entity_type).all()


def test_login_records_ip_in_audit_log(api, db, make_user):
    user = make_user("staff", password_hash=hash_password("Password123"))

    response = api.post("/auth/login", json={"email": user.email, "password": "Password123"})

    assert response.status_code == 200
    row = db.query(AuditLog).filter(AuditLog.user_id == user.id).one()
    assert row.action == "auth.login"
    assert row.extra_data == {"ip": "127.0.0.1"}


def test_booking_edit_saves_and_records_changes(api, db, admin_headers, booking_id):
    response = api.patch(
        f"/bookings/{booking_id}",
        json={"venue_name": "New Hall", "event_date": "2027-07-01"},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["venue_name"] == "New Hall"

    row = audit_rows(db, "booking")[0]
    assert row.action == "edit"
    assert row.entity_id == booking_id
    assert row.changes["before"] == {"venue_name": "Old Hall", "event_date": "2027-06-01"}
    assert row.changes["after"] == {"venue_name": "New Hall", "event_date": "2027-07-01"}


def test_booking_note_edit_is_reachable_and_recorded(api, db, admin_headers, booking_id):
    note = api.post(
        f"/bookings/{booking_id}/notes",
        json={"note": "First"},
        headers=admin_headers,
    ).json()

    response = api.patch(
        f"/bookings/{booking_id}/notes/{note['id']}",
        json={"note": "Second", "is_internal": False},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["note"] == "Second"

    row = audit_rows(db, "booking_note")[0]
    assert row.changes["before"]["note"] == "First"
    assert row.extra_data == {"booking_id": booking_id}


def test_invoice_delete_is_recorded(api, db, admin_headers, client_id):
    invoice = api.post(
        "/invoicing/invoices",
        json={
            "client_id": client_id,
            "items": [{"description": "Hall", "quantity": 1, "unit_price": "100", "total_price": "100"}],
        },
        headers=admin_headers,
    ).json()

    response = api.delete(f"/invoicing/invoices/{invoice['id']}", headers=admin_headers)

    assert response.status_code == 200
    assert [row.action for row in audit_rows(db, "invoice")] == ["delete"]


def test_expense_void_is_recorded(api, db, admin_headers):
    category = ExpenseCategory(name="Test Category", type="operating")
    db.add(category)
    db.commit()
    expense = api.post(
        "/accounting/expenses",
        json={
            "category_id": str(category.id),
            "description": "Chairs",
            "amount": "50.00",
            "payment_method": "cash",
            "expense_date": date(2027, 1, 1).isoformat(),
        },
        headers=admin_headers,
    ).json()

    response = api.delete(f"/accounting/expenses/{expense['id']}", headers=admin_headers)

    assert response.status_code == 204
    assert [row.action for row in audit_rows(db, "expense")] == ["void"]


def test_admin_can_list_and_filter_audit_log(api, admin_headers, booking_id):
    api.patch(f"/bookings/{booking_id}", json={"guest_count": 80}, headers=admin_headers)

    response = api.get(
        "/audit-logs/",
        params={"entity_type": "booking", "entity_id": booking_id},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert [row["action"] for row in response.json()] == ["edit"]
