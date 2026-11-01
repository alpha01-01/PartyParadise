from datetime import date, timedelta

import pytest

TODAY = date.today()


@pytest.fixture
def client_id(api, admin_headers):
    return api.post(
        "/clients",
        json={"first_name": "Ama", "last_name": "Mensah", "email": "ama@example.com"},
        headers=admin_headers,
    ).json()["id"]


def make_booking(api, headers, client_id):
    return api.post(
        "/bookings",
        json={"client_id": client_id, "service_type": "decor", "event_date": (TODAY + timedelta(days=30)).isoformat()},
        headers=headers,
    ).json()["id"]


def test_adding_a_service_updates_the_booking(api, admin_headers, client_id):
    booking = make_booking(api, admin_headers, client_id)

    response = api.post(
        f"/bookings/{booking}/services",
        json={"service": "Balloon arch", "price": "150.00"},
        headers=admin_headers,
    )

    assert response.status_code == 201
    assert [service["service"] for service in response.json()["services"]] == ["Balloon arch"]


def test_service_price_cannot_be_negative(api, admin_headers, client_id):
    booking = make_booking(api, admin_headers, client_id)

    response = api.post(f"/bookings/{booking}/services", json={"service": "x", "price": "-1"}, headers=admin_headers)

    assert response.status_code == 422


def test_cancelled_booking_takes_no_new_services(api, admin_headers, client_id):
    booking = make_booking(api, admin_headers, client_id)
    api.patch(f"/bookings/{booking}/status", json={"status": "cancelled"}, headers=admin_headers)

    response = api.post(f"/bookings/{booking}/services", json={"service": "x", "price": "1"}, headers=admin_headers)

    assert response.status_code == 400


def test_uninvoiced_filter_leaves_out_invoiced_bookings(api, admin_headers, client_id):
    invoiced = make_booking(api, admin_headers, client_id)
    waiting = make_booking(api, admin_headers, client_id)
    api.post(f"/bookings/{invoiced}/services", json={"service": "x", "price": "10"}, headers=admin_headers)
    assert api.post(f"/invoicing/invoices/from-booking/{invoiced}", headers=admin_headers).status_code == 201

    body = api.get("/bookings", params={"uninvoiced": True}, headers=admin_headers).json()

    assert [row["id"] for row in body["items"]] == [waiting]


def pay(api, headers, client_id, amount, when):
    invoice = api.post(
        "/invoicing/invoices",
        json={"client_id": client_id, "items": [{"description": "x", "quantity": 1, "unit_price": amount}]},
        headers=headers,
    ).json()["id"]
    api.patch(f"/invoicing/invoices/{invoice}/send", headers=headers)
    response = api.post(
        f"/invoicing/invoices/{invoice}/payments",
        json={"amount": amount, "method": "cash", "paid_at": when.isoformat()},
        headers=headers,
    )
    assert response.status_code == 201


def test_dashboard_period_changes_the_figures(api, admin_headers, client_id):
    last_month = TODAY.replace(day=1) - timedelta(days=1)
    pay(api, admin_headers, client_id, "100.00", TODAY)
    pay(api, admin_headers, client_id, "40.00", last_month)

    def revenue(period):
        response = api.get("/reports/dashboard", params={"period": period}, headers=admin_headers)
        return response.json()["revenue_this_month"]

    assert revenue("this_month") == 100.0
    assert revenue("last_month") == 40.0
    assert revenue("this_year") == (140.0 if last_month.year == TODAY.year else 100.0)


def test_unknown_period_is_refused(api, admin_headers):
    assert api.get("/reports/dashboard", params={"period": "forever"}, headers=admin_headers).status_code == 422
