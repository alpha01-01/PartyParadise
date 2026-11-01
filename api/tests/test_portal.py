import json
from decimal import Decimal
from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException

from app.config import settings
from app.models.portal import ClientPortalAccount, PortalInquiry
from app.models.staff import StaffProfile
from app.services import paystack
from app.utils.security import create_portal_setup_token, hash_password

PASSWORD = "Client123"


def make_client(api, headers, email):
    return api.post(
        "/clients",
        json={"first_name": "Esi", "last_name": "Owusu", "email": email},
        headers=headers,
    ).json()["id"]


def portal_headers(api, db, headers, client_id):
    api.post(f"/portal/clients/{client_id}/invite", headers=headers)
    account = db.query(ClientPortalAccount).filter(ClientPortalAccount.client_id == client_id).one()
    account.password_hash = hash_password(PASSWORD)
    db.commit()
    token = api.post("/portal/auth/login", json={"email": account.email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_invoice(api, headers, client_id, send=True):
    invoice = api.post(
        "/invoicing/invoices",
        json={"client_id": client_id, "items": [{"description": "Hall", "quantity": 1, "unit_price": "250.50"}]},
        headers=headers,
    ).json()
    if send:
        api.patch(f"/invoicing/invoices/{invoice['id']}/send", headers=headers)
    return invoice["id"]


@pytest.fixture
def client_id(api, admin_headers):
    return make_client(api, admin_headers, "esi@example.com")


@pytest.fixture
def client_headers(api, db, admin_headers, client_id):
    return portal_headers(api, db, admin_headers, client_id)


# --- Invites ---

def test_invite_gives_a_link_and_never_a_password(api, admin_headers, client_id):
    body = api.post(f"/portal/clients/{client_id}/invite", headers=admin_headers).json()

    assert "temp_password" not in body
    assert body["delivery_status"] == "manual_share_required"

    token = body["setup_url"].rsplit("/", 1)[1]
    assert api.post(f"/portal/auth/setup/{token}", json={"password": PASSWORD}).status_code == 200
    assert api.post("/portal/auth/login", json={"email": "esi@example.com", "password": PASSWORD}).status_code == 200


def test_emailed_invite_does_not_expose_the_link(api, admin_headers, client_id):
    with patch("app.services.email._send", return_value=True) as send:
        body = api.post(f"/portal/clients/{client_id}/invite", headers=admin_headers).json()

    assert body["setup_url"] is None
    assert "/portal/setup/" in send.call_args.kwargs["text_body"]


def test_reinviting_keeps_the_current_password(api, db, admin_headers, client_id, client_headers):
    api.post(f"/portal/clients/{client_id}/invite", headers=admin_headers)

    assert api.post("/portal/auth/login", json={"email": "esi@example.com", "password": PASSWORD}).status_code == 200


def test_client_can_change_password(api, client_headers):
    wrong = api.post(
        "/portal/auth/change-password",
        json={"current_password": "Nope12345", "password": "Changed123"},
        headers=client_headers,
    )
    right = api.post(
        "/portal/auth/change-password",
        json={"current_password": PASSWORD, "password": "Changed123"},
        headers=client_headers,
    )

    assert wrong.status_code == 400
    assert right.status_code == 200
    assert api.post("/portal/auth/login", json={"email": "esi@example.com", "password": "Changed123"}).status_code == 200


# --- What a client can see ---

def test_drafts_are_hidden_from_clients(api, admin_headers, client_id, client_headers):
    draft = make_invoice(api, admin_headers, client_id, send=False)

    assert api.get("/portal/invoices", headers=client_headers).json() == []
    assert api.get(f"/portal/invoices/{draft}", headers=client_headers).status_code == 404


def test_invoice_detail_shows_items(api, admin_headers, client_id, client_headers):
    invoice = make_invoice(api, admin_headers, client_id)

    body = api.get(f"/portal/invoices/{invoice}", headers=client_headers).json()

    assert body["amount_due"] == 250.5
    assert [item["description"] for item in body["items"]] == ["Hall"]


def test_clients_cannot_reach_each_others_invoices(api, admin_headers, client_id, client_headers):
    other = make_client(api, admin_headers, "other@example.com")
    invoice = make_invoice(api, admin_headers, other)

    assert api.get(f"/portal/invoices/{invoice}", headers=client_headers).status_code == 404
    assert api.post(f"/portal/invoices/{invoice}/pay", json={}, headers=client_headers).status_code == 404


def test_sent_contract_offers_a_signing_link(api, admin_headers, client_id, client_headers):
    booking = api.post(
        "/bookings",
        json={"client_id": client_id, "service_type": "decor", "event_date": "2099-01-01"},
        headers=admin_headers,
    ).json()["id"]
    contract = api.post("/contracts", json={"booking_id": booking}, headers=admin_headers).json()

    assert api.get("/portal/contracts", headers=client_headers).json() == []

    api.patch(f"/contracts/{contract['id']}/send", headers=admin_headers)
    row = api.get("/portal/contracts", headers=client_headers).json()[0]

    assert api.get(row["sign_path"]).status_code == 200


def test_staff_can_read_client_enquiries(api, db, admin_headers, client_id, client_headers):
    api.post("/portal/inquiries", json={"subject": "Wedding", "message": "June"}, headers=client_headers)

    assert [row["subject"] for row in api.get("/portal/inquiries", headers=client_headers).json()] == ["Wedding"]

    staff_view = api.get("/portal/staff/inquiries", params={"client_id": client_id}, headers=admin_headers).json()
    assert [row["subject"] for row in staff_view] == ["Wedding"]


# --- Starting a payment ---

def test_pay_starts_a_paystack_charge(api, admin_headers, client_id, client_headers):
    invoice = make_invoice(api, admin_headers, client_id)

    with patch("app.services.paystack.initialize_transaction", return_value="https://pay.example/abc") as start:
        response = api.post(f"/portal/invoices/{invoice}/pay", json={}, headers=client_headers)

    assert response.json() == {"authorization_url": "https://pay.example/abc"}
    assert start.call_args.kwargs["amount"] == Decimal("250.50")
    assert start.call_args.kwargs["invoice_id"] == invoice
    assert start.call_args.kwargs["reference"].startswith("INV-")


def test_pay_cannot_exceed_the_balance(api, admin_headers, client_id, client_headers):
    invoice = make_invoice(api, admin_headers, client_id)

    response = api.post(f"/portal/invoices/{invoice}/pay", json={"amount": "250.51"}, headers=client_headers)

    assert response.status_code == 422


def test_pay_refuses_a_settled_invoice(api, admin_headers, client_id, client_headers):
    invoice = make_invoice(api, admin_headers, client_id)
    api.post(
        f"/invoicing/invoices/{invoice}/payments",
        json={"amount": "250.50", "method": "cash", "paid_at": "2026-01-01"},
        headers=admin_headers,
    )

    assert api.post(f"/portal/invoices/{invoice}/pay", json={}, headers=client_headers).status_code == 400


def test_pay_reports_when_paystack_is_not_set_up(api, admin_headers, client_id, client_headers):
    invoice = make_invoice(api, admin_headers, client_id)

    with patch.object(settings, "PAYSTACK_SECRET_KEY", ""):
        response = api.post(f"/portal/invoices/{invoice}/pay", json={}, headers=client_headers)

    assert response.status_code == 503


# --- Paystack API ---

def paystack_returns(payload, status=200):
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json=payload))
    real_request = httpx.request

    def request(method, url, **kwargs):
        with httpx.Client(transport=transport) as client:
            return client.request(method, url, **kwargs)

    assert real_request is not request
    return patch("app.services.paystack.httpx.request", request), patch.object(settings, "PAYSTACK_SECRET_KEY", "sk_test")


def good_charge(**overrides):
    data = {"status": "success", "currency": "GHS", "amount": 10050, "metadata": {"invoice_id": "inv-1"}, **overrides}
    return {"status": True, "data": data}


def test_initialize_sends_pesewas_and_returns_the_payment_page():
    seen = {}

    def handler(request):
        seen.update(json.loads(request.content))
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(200, json={"status": True, "data": {"authorization_url": "https://pay.example/x"}})

    def request(method, url, **kwargs):
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            return client.request(method, url, **kwargs)

    with patch("app.services.paystack.httpx.request", request), patch.object(settings, "PAYSTACK_SECRET_KEY", "sk_test"):
        url = paystack.initialize_transaction(
            email="a@example.com",
            amount=Decimal("100.50"),
            reference="ref",
            invoice_id="inv-1",
            callback_url="https://x",
        )

    assert url == "https://pay.example/x"
    assert seen["amount"] == 10050
    assert seen["currency"] == "GHS"
    assert seen["metadata"] == {"invoice_id": "inv-1"}
    assert seen["auth"] == "Bearer sk_test"


def test_matching_charge_is_confirmed():
    http, key = paystack_returns(good_charge())
    with http, key:
        paystack.confirm_charge("ref", Decimal("100.50"), "inv-1")


@pytest.mark.parametrize(
    "overrides",
    [
        {"status": "failed"},
        {"currency": "USD"},
        {"amount": 100},
        {"metadata": {"invoice_id": "inv-2"}},
        {"metadata": None},
    ],
)
def test_mismatched_charge_is_refused(overrides):
    http, key = paystack_returns(good_charge(**overrides))
    with http, key, pytest.raises(HTTPException) as error:
        paystack.confirm_charge("ref", Decimal("100.50"), "inv-1")

    assert error.value.status_code == 422


def test_unreachable_paystack_lets_the_relay_retry():
    http, key = paystack_returns({"status": False, "message": "down"}, status=500)
    with http, key, pytest.raises(HTTPException) as error:
        paystack.confirm_charge("ref", Decimal("100.50"), "inv-1")

    assert error.value.status_code == 502


# --- Pay visibility ---

def profile_for(db, user, salary="5000"):
    profile = StaffProfile(user_id=user.id, role_title="Crew", employment_type="full_time", base_salary=salary)
    db.add(profile)
    db.commit()
    return profile


def test_staff_see_their_own_pay_but_not_colleagues(api, db, make_user, auth_for):
    viewer = make_user("staff")
    own = profile_for(db, viewer)
    other = profile_for(db, make_user("staff"))
    headers = auth_for(viewer)

    rows = {row["id"]: row["base_salary"] for row in api.get("/staff", headers=headers).json()}

    assert rows == {str(own.id): 5000.0, str(other.id): None}
    assert api.get(f"/staff/{other.id}", headers=headers).json()["base_salary"] is None


def test_managers_see_all_pay(api, db, make_user, auth_for):
    profile_for(db, make_user("staff"))

    rows = api.get("/staff", headers=auth_for(make_user("manager"))).json()

    assert rows[0]["base_salary"] == 5000.0


def test_staff_can_save_contact_details_with_unchanged_role(api, db, make_user, auth_for):
    viewer = make_user("staff")
    target = profile_for(db, make_user("staff"))

    response = api.patch(
        f"/staff/{target.id}",
        json={"role_title": "Crew", "employment_type": "full_time", "phone": "024"},
        headers=auth_for(viewer),
    )

    assert response.status_code == 200
    assert response.json()["base_salary"] is None


def test_setup_token_helper_is_still_single_use(api, db, admin_headers, client_id):
    api.post(f"/portal/clients/{client_id}/invite", headers=admin_headers)
    account = db.query(ClientPortalAccount).one()
    token = create_portal_setup_token(str(account.id), account.password_hash)

    assert api.post(f"/portal/auth/setup/{token}", json={"password": PASSWORD}).status_code == 200
    assert api.post(f"/portal/auth/setup/{token}", json={"password": "Another123"}).status_code == 400
    assert db.query(PortalInquiry).count() == 0
