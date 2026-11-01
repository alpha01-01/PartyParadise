import re

import pytest

from app.main import app


@pytest.fixture
def ids(api, admin_headers):
    client_id = api.post(
        "/clients",
        json={"first_name": "Ama", "last_name": "Mensah", "email": "ama@example.com"},
        headers=admin_headers,
    ).json()["id"]
    staff_id = api.post(
        "/staff",
        json={
            "first_name": "Kofi",
            "last_name": "Boateng",
            "email": "kofi@example.com",
            "role_title": "Chef",
            "base_salary": "5000",
        },
        headers=admin_headers,
    ).json()["id"]
    booking_id = api.post(
        "/bookings",
        json={"client_id": client_id, "service_type": "rentals", "event_date": "2027-06-01"},
        headers=admin_headers,
    ).json()["id"]
    invoice_id = api.post(
        "/invoicing/invoices",
        json={
            "client_id": client_id,
            "items": [{"description": "Hall", "quantity": 1, "unit_price": "100", "total_price": "100"}],
        },
        headers=admin_headers,
    ).json()["id"]
    leave = api.post(
        "/staff/leave",
        json={"staff_id": staff_id, "type": "annual", "start_date": "2027-05-01", "end_date": "2027-05-02"},
        headers=admin_headers,
    )
    assert leave.status_code == 201
    return {
        "client_id": client_id,
        "staff_id": staff_id,
        "booking_id": booking_id,
        "invoice_id": invoice_id,
    }


def test_no_get_route_exposes_password_hashes(api, admin_headers, ids):
    scanned = []
    for path, methods in app.openapi()["paths"].items():
        wanted = re.findall(r"\{(\w+)\}", path)
        if "get" not in methods or not set(wanted) <= set(ids):
            continue
        response = api.get(path.format(**ids), headers=admin_headers)
        scanned.append(path)
        assert "password_hash" not in response.text, path

    assert len(scanned) > 30
