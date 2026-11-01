import io
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text

from app.models.auth import UserSession
from app.models.contracts import Contract, ContractTemplate
from app.models.inventory import Equipment, InventoryItem
from app.models.invoicing import Invoice
from app.models.staff import Attendance, Shift, StaffProfile
from app.utils.security import create_access_token, create_refresh_token, hash_password

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
NEXT_YEAR = (date.today() + timedelta(days=365)).isoformat()


def make_client(api, headers, email="ama@example.com"):
    return api.post(
        "/clients",
        json={"first_name": "Ama", "last_name": "Mensah", "email": email},
        headers=headers,
    ).json()["id"]


def make_booking(api, headers, client_id, **overrides):
    body = {"client_id": client_id, "service_type": "decor", "event_date": NEXT_YEAR, **overrides}
    return api.post("/bookings", json=body, headers=headers)


@pytest.fixture
def client_id(api, admin_headers):
    return make_client(api, admin_headers)


# --- Stock ---

@pytest.fixture
def item(db):
    row = InventoryItem(name="Balloons", category="decor", unit="pack", quantity_in_stock=6, unit_price=Decimal("9.00"))
    db.add(row)
    db.commit()
    return row


def sell(api, headers, lines):
    return api.post("/inventory/shop-sales", json={"items": lines}, headers=headers)


def test_repeated_lines_cannot_oversell(api, db, admin_headers, item):
    line = {"item_id": str(item.id), "quantity": 5}

    assert sell(api, admin_headers, [line, line]).status_code == 400

    db.refresh(item)
    assert item.quantity_in_stock == 6


def test_shop_sale_price_cannot_be_negative(api, admin_headers, item):
    response = sell(api, admin_headers, [{"item_id": str(item.id), "quantity": 1, "unit_price": "-100"}])

    assert response.status_code == 422


def test_only_finance_roles_can_change_a_shop_price(api, make_user, auth_for, item):
    line = {"item_id": str(item.id), "quantity": 1, "unit_price": "1.00"}

    assert sell(api, auth_for(make_user("staff")), [line]).status_code == 403
    assert sell(api, auth_for(make_user("manager")), [line]).status_code == 201


def adjust(api, headers, item, quantity, type_="adjustment"):
    return api.post(
        "/inventory/transactions",
        json={"item_id": str(item.id), "type": type_, "quantity": quantity},
        headers=headers,
    )


def test_stocktake_can_add_or_remove_stock(api, db, admin_headers, item):
    assert adjust(api, admin_headers, item, 4).status_code == 201
    assert adjust(api, admin_headers, item, -2).status_code == 201

    db.refresh(item)
    assert item.quantity_in_stock == 8


@pytest.mark.parametrize("quantity, type_", [(0, "adjustment"), (-1, "usage"), (-1, "purchase")])
def test_bad_stock_movements_are_refused(api, admin_headers, item, quantity, type_):
    assert adjust(api, admin_headers, item, quantity, type_).status_code == 422


def test_stock_cannot_go_negative_in_the_database(db, item):
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.execute(text("UPDATE inventory_items SET quantity_in_stock = -1 WHERE id = :id"), {"id": item.id})


# --- Import ---

def upload(api, headers, content, name="items.csv"):
    return api.post(
        "/inventory/items/import",
        files={"file": (name, io.BytesIO(content), "text/plain")},
        headers=headers,
    )


def test_import_ignores_extra_cells(api, admin_headers):
    response = upload(api, admin_headers, b"name,category,unit\nChairs,decor,each,surplus\n")

    assert response.status_code == 201
    assert response.json()["imported"] == 1


def test_import_reads_non_utf8_files(api, admin_headers):
    response = upload(api, admin_headers, "name,category,unit\nCaf\xe9 tables,decor,each\n".encode("cp1252"))

    assert response.status_code == 201


def test_one_bad_row_does_not_lose_the_import(api, admin_headers):
    long_name = "x" * 500
    content = f"name,category,unit\nChairs,decor,each\n{long_name},decor,each\nTables,decor,each\n".encode()

    body = upload(api, admin_headers, content).json()

    assert body["imported"] == 2
    assert [error["row"] for error in body["errors"]] == [3]


def test_malformed_excel_is_a_clear_error(api, admin_headers):
    assert upload(api, admin_headers, b"not a workbook", "items.xlsx").status_code == 400


# --- Readable errors ---

def test_duplicate_client_email_is_a_conflict(api, admin_headers, client_id):
    response = api.post(
        "/clients",
        json={"first_name": "Other", "last_name": "Person", "email": "ama@example.com"},
        headers=admin_headers,
    )

    assert response.status_code == 409


def test_unknown_client_is_not_a_server_error(api, admin_headers):
    response = make_booking(api, admin_headers, str(uuid.uuid4()))

    assert response.status_code == 409


def test_malformed_user_id_is_a_validation_error(api, admin_headers):
    assert api.patch("/auth/users/not-a-uuid", json={}, headers=admin_headers).status_code == 422


# --- Invoices ---

def invoice(api, headers, client_id, due=None, reference_item="Hall"):
    created = api.post(
        "/invoicing/invoices",
        json={
            "client_id": client_id,
            "due_date": due,
            "items": [{"description": reference_item, "quantity": 1, "unit_price": "100"}],
        },
        headers=headers,
    ).json()
    api.patch(f"/invoicing/invoices/{created['id']}/send", headers=headers)
    return created


def test_past_due_invoices_become_overdue_and_stats_cover_all_pages(api, db, admin_headers, client_id):
    late = invoice(api, admin_headers, client_id, due=(date.today() - timedelta(days=2)).isoformat())
    invoice(api, admin_headers, client_id, due=NEXT_YEAR)

    stats = api.get("/invoicing/invoices/stats", headers=admin_headers).json()

    assert db.get(Invoice, late["id"]).status == "overdue"
    assert stats["overdue_count"] == 1
    assert stats["overdue"] == 100.0
    assert stats["outstanding_count"] == 2


def test_overdue_invoice_can_still_be_paid(api, admin_headers, client_id):
    late = invoice(api, admin_headers, client_id, due=(date.today() - timedelta(days=2)).isoformat())
    api.get("/invoicing/invoices", headers=admin_headers)

    response = api.post(
        f"/invoicing/invoices/{late['id']}/payments",
        json={"amount": "100.00", "method": "cash", "paid_at": date.today().isoformat()},
        headers=admin_headers,
    )

    assert response.status_code == 201


def test_invoice_search_matches_reference_and_client(api, admin_headers, client_id):
    created = invoice(api, admin_headers, client_id)
    other = make_client(api, admin_headers, "kofi@example.com")
    api.patch(f"/clients/{other}", json={"first_name": "Kofi"}, headers=admin_headers)
    invoice(api, admin_headers, other)

    by_reference = api.get("/invoicing/invoices", params={"search": created["reference"]}, headers=admin_headers)
    by_client = api.get("/invoicing/invoices", params={"search": "ama men"}, headers=admin_headers)

    assert [row["id"] for row in by_reference.json()["items"]] == [created["id"]]
    assert [row["id"] for row in by_client.json()["items"]] == [created["id"]]


def test_send_reports_when_no_email_was_delivered(api, admin_headers, client_id):
    created = api.post(
        "/invoicing/invoices",
        json={"client_id": client_id, "items": [{"description": "Hall", "quantity": 1, "unit_price": "100"}]},
        headers=admin_headers,
    ).json()

    body = api.patch(f"/invoicing/invoices/{created['id']}/send", headers=admin_headers).json()

    assert body["status"] == "sent"
    assert body["email_sent"] is False


# --- Clients ---

def test_clients_can_be_filtered_by_assignee(api, db, admin_headers, make_user, client_id):
    user = make_user("staff")
    db.execute(text("UPDATE clients SET assigned_to = :user WHERE id = :client"), {"user": user.id, "client": client_id})
    db.commit()
    make_client(api, admin_headers, "other@example.com")

    body = api.get("/clients", params={"assigned_to": str(user.id)}, headers=admin_headers).json()

    assert [row["id"] for row in body["items"]] == [client_id]


def test_mixed_case_portal_email_can_log_in_and_follows_client_edits(api, db, admin_headers):
    from app.models.portal import ClientPortalAccount

    client = make_client(api, admin_headers, "Esi.Owusu@Example.com")
    api.post(f"/portal/clients/{client}/invite", headers=admin_headers)
    account = db.query(ClientPortalAccount).filter(ClientPortalAccount.client_id == client).one()
    account.password_hash = hash_password("Client123")
    db.commit()

    assert api.post("/portal/auth/login", json={"email": "esi.owusu@example.com", "password": "Client123"}).status_code == 200

    api.patch(f"/clients/{client}", json={"email": "New.Address@Example.com"}, headers=admin_headers)

    assert api.post("/portal/auth/login", json={"email": "new.address@example.com", "password": "Client123"}).status_code == 200


# --- Bookings ---

def move(api, headers, booking_id, status):
    return api.patch(f"/bookings/{booking_id}/status", json={"status": status}, headers=headers)


def test_status_moves_follow_the_workflow(api, admin_headers, client_id):
    booking = make_booking(api, admin_headers, client_id).json()["id"]

    assert move(api, admin_headers, booking, "completed").status_code == 400
    for status in ("quoted", "confirmed", "in_progress", "completed"):
        assert move(api, admin_headers, booking, status).status_code == 200
    assert move(api, admin_headers, booking, "inquiry").status_code == 400


@pytest.mark.parametrize(
    "overrides",
    [
        {"event_date": (date.today() - timedelta(days=1)).isoformat()},
        {"guest_count": -1},
        {"start_time": "18:00:00", "end_time": "18:00:00"},
        {"services": [{"service": "decor", "price": "-1"}]},
    ],
)
def test_bad_bookings_are_refused(api, admin_headers, client_id, overrides):
    assert make_booking(api, admin_headers, client_id, **overrides).status_code == 422


def test_event_may_run_past_midnight(api, admin_headers, client_id):
    response = make_booking(api, admin_headers, client_id, start_time="20:00:00", end_time="01:00:00")

    assert response.status_code == 201


def test_duplicate_staff_assignment_is_a_conflict(api, admin_headers, make_user, client_id):
    booking = make_booking(api, admin_headers, client_id).json()["id"]
    body = {"user_id": str(make_user("staff").id), "role": "lead"}

    assert api.post(f"/bookings/{booking}/staff", json=body, headers=admin_headers).status_code == 201
    assert api.post(f"/bookings/{booking}/staff", json=body, headers=admin_headers).status_code == 409


@pytest.fixture
def booth(db):
    row = Equipment(name="360 Booth", category="booth")
    db.add(row)
    db.commit()
    return str(row.id)


def allocate(api, headers, booking, equipment):
    return api.post(f"/bookings/{booking}/equipment", json={"equipment_id": equipment}, headers=headers)


def test_equipment_conflicts_are_rechecked(api, admin_headers, client_id, booth):
    first = make_booking(api, admin_headers, client_id, event_date=NEXT_YEAR).json()["id"]
    second = make_booking(api, admin_headers, client_id, event_date=NEXT_YEAR).json()["id"]
    third = make_booking(api, admin_headers, client_id, event_date=TOMORROW).json()["id"]
    for booking in (first, second, third):
        assert allocate(api, admin_headers, booking, booth).status_code == 201

    assert move(api, admin_headers, first, "confirmed").status_code == 200
    assert move(api, admin_headers, second, "confirmed").status_code == 409

    assert move(api, admin_headers, third, "confirmed").status_code == 200
    moved = api.patch(f"/bookings/{third}", json={"event_date": NEXT_YEAR}, headers=admin_headers)
    assert moved.status_code == 409


def test_admin_can_edit_another_users_note(api, make_user, auth_for, admin_headers, client_id):
    booking = make_booking(api, admin_headers, client_id).json()["id"]
    author = auth_for(make_user("staff"))
    note = api.post(f"/bookings/{booking}/notes", json={"note": "First"}, headers=author).json()

    response = api.patch(f"/bookings/{booking}/notes/{note['id']}", json={"note": "Edited"}, headers=admin_headers)

    assert response.status_code == 200


# --- Contracts ---

@pytest.fixture
def sent_contract(api, db, admin_headers, client_id):
    booking = make_booking(api, admin_headers, client_id, venue_name="Hall").json()["id"]
    contract = api.post("/contracts", json={"booking_id": booking}, headers=admin_headers).json()
    sent = api.patch(f"/contracts/{contract['id']}/send", headers=admin_headers).json()
    return {"id": contract["id"], "token": sent["signing_url"].rsplit("/", 1)[1], "sent": sent}


def test_combo_booking_gets_a_contract_template(api, admin_headers, client_id):
    booking = make_booking(api, admin_headers, client_id, service_type="combo").json()["id"]

    assert api.post("/contracts", json={"booking_id": booking}, headers=admin_headers).status_code == 201


def test_service_template_beats_a_generic_one(api, db, admin_headers, client_id):
    db.add(ContractTemplate(name="AAA Generic", service_type=None, body="Generic {{client_name}}"))
    db.commit()
    booking = make_booking(api, admin_headers, client_id).json()["id"]

    body = api.post("/contracts", json={"booking_id": booking}, headers=admin_headers).json()["body"]

    assert not body.startswith("Generic")


def test_contract_id_alone_cannot_open_or_sign(api, sent_contract):
    assert api.get(f"/contracts/sign/{sent_contract['id']}").status_code == 404
    response = api.post(f"/contracts/sign/{sent_contract['id']}", json={"signature_data": "Ama"})
    assert response.status_code == 404


def test_signing_link_works_and_cannot_sign_twice(api, db, sent_contract):
    token = sent_contract["token"]

    assert api.get(f"/contracts/sign/{token}").status_code == 200
    assert api.post(f"/contracts/sign/{token}", json={"signature_data": "Ama"}).status_code == 200
    assert api.post(f"/contracts/sign/{token}", json={"signature_data": "Ama"}).status_code == 404
    assert db.get(Contract, sent_contract["id"]).status == "signed"


def test_oversized_signature_is_refused(api, sent_contract):
    response = api.post(
        f"/contracts/sign/{sent_contract['token']}",
        json={"signature_data": "x" * 200_001},
    )

    assert response.status_code == 422


def test_sign_page_escapes_the_contract_body():
    from conftest import API_ROOT

    page = (API_ROOT.parent / "web" / "app" / "contracts" / "sign" / "[token]" / "page.tsx").read_text(encoding="utf-8")

    assert '.replace(/</g, "&lt;")' in page


def test_contract_send_reports_delivery(sent_contract):
    assert sent_contract["sent"]["email_sent"] is False


# --- Staff ---

def add_staff(api, headers, email="kofi@example.com"):
    return api.post(
        "/staff",
        json={"first_name": "Kofi", "last_name": "B", "email": email, "role_title": "Chef", "base_salary": "100"},
        headers=headers,
    ).json()["id"]


def profile_for(db, user):
    profile = StaffProfile(user_id=user.id, role_title="Crew", employment_type="full_time")
    db.add(profile)
    db.commit()
    return profile


def add_shift(db, profile):
    shift = Shift(staff_id=profile.id, assigned_by=profile.user_id, type="event", shift_date=date.today(), start_time="09:00")
    db.add(shift)
    db.commit()
    return shift


def test_staff_cannot_change_pay_but_can_update_contact_details(api, make_user, auth_for, admin_headers):
    target = add_staff(api, admin_headers)
    headers = auth_for(make_user("staff"))

    assert api.patch(f"/staff/{target}", json={"base_salary": "999999"}, headers=headers).status_code == 403
    assert api.patch(f"/staff/{target}", json={"is_active": False}, headers=headers).status_code == 403
    assert api.patch(f"/staff/{target}", json={"phone": "024"}, headers=headers).status_code == 200


def test_staff_cannot_review_leave(api, make_user, auth_for, admin_headers):
    target = add_staff(api, admin_headers)
    leave = api.post(
        "/staff/leave",
        json={"staff_id": target, "type": "annual", "start_date": NEXT_YEAR, "end_date": NEXT_YEAR},
        headers=admin_headers,
    ).json()

    response = api.patch(f"/staff/leave/{leave['id']}", json={"status": "approved"}, headers=auth_for(make_user("staff")))

    assert response.status_code == 403


def test_managers_cannot_approve_their_own_leave(api, db, make_user, auth_for):
    manager = make_user("manager")
    profile = profile_for(db, manager)
    headers = auth_for(manager)
    leave = api.post(
        "/staff/leave",
        json={"staff_id": str(profile.id), "type": "annual", "start_date": NEXT_YEAR, "end_date": NEXT_YEAR},
        headers=headers,
    ).json()

    assert api.patch(f"/staff/leave/{leave['id']}", json={"status": "approved"}, headers=headers).status_code == 403


def test_leave_cannot_end_before_it_starts(api, admin_headers):
    target = add_staff(api, admin_headers)

    response = api.post(
        "/staff/leave",
        json={"staff_id": target, "type": "annual", "start_date": "2027-05-10", "end_date": "2027-05-01"},
        headers=admin_headers,
    )

    assert response.status_code == 422


def test_staff_can_only_clock_their_own_shifts(api, db, make_user, auth_for):
    owner = make_user("staff")
    shift = add_shift(db, profile_for(db, owner))

    other = auth_for(make_user("staff"))
    assert api.post(f"/staff/shifts/{shift.id}/clock-in", json={}, headers=other).status_code == 403
    assert api.post(f"/staff/shifts/{shift.id}/clock-in", json={}, headers=auth_for(owner)).status_code == 201


def test_staff_cannot_choose_their_own_clock_time(api, db, make_user, auth_for):
    owner = make_user("staff")
    shift = add_shift(db, profile_for(db, owner))

    api.post(f"/staff/shifts/{shift.id}/clock-in", json={"clock_in": "01:23:00"}, headers=auth_for(owner))

    assert str(db.query(Attendance).one().clock_in) != "01:23:00"


def test_overnight_shift_counts_positive_hours(api, db, make_user, auth_for, admin_headers):
    shift = add_shift(db, profile_for(db, make_user("staff")))

    api.post(f"/staff/shifts/{shift.id}/clock-in", json={"clock_in": "22:00:00"}, headers=admin_headers)
    api.patch(f"/staff/shifts/{shift.id}/clock-out", json={"clock_out": "02:00:00"}, headers=admin_headers)

    assert db.query(Attendance).one().hours_worked == Decimal("4.00")


# --- Sessions ---

def test_deactivating_a_user_ends_their_sessions(api, db, make_user, admin_headers):
    user = make_user("staff", password_hash=hash_password("Password123"))
    tokens = api.post("/auth/login", json={"email": user.email, "password": "Password123"}).json()

    assert api.patch(f"/auth/users/{user.id}", json={"is_active": False}, headers=admin_headers).status_code == 200

    assert db.query(UserSession).filter(UserSession.user_id == user.id).count() == 0
    assert api.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_deactivating_staff_blocks_their_login(api, db, make_user, admin_headers):
    user = make_user("staff", password_hash=hash_password("Password123"))
    profile = profile_for(db, user)

    assert api.patch(f"/staff/{profile.id}", json={"is_active": False}, headers=admin_headers).status_code == 200

    assert api.post("/auth/login", json={"email": user.email, "password": "Password123"}).status_code in (401, 403)


def test_portal_logout_ends_the_session(api, db, admin_headers):
    from app.models.portal import ClientPortalAccount

    client = make_client(api, admin_headers, "esi@example.com")
    api.post(f"/portal/clients/{client}/invite", headers=admin_headers)
    account = db.query(ClientPortalAccount).filter(ClientPortalAccount.client_id == client).one()
    account.password_hash = hash_password("Client123")
    db.commit()
    refresh = api.post("/portal/auth/login", json={"email": "esi@example.com", "password": "Client123"}).json()["refresh_token"]

    assert api.post("/portal/auth/logout", json={"refresh_token": refresh}).status_code == 200
    assert api.post("/portal/auth/refresh", json={"refresh_token": refresh}).status_code == 401


# --- Email ---

def test_sandbox_setting_stops_real_sends():
    from unittest.mock import patch

    from app.config import settings
    from app.services.email import _send

    with patch.object(settings, "SENDGRID_API_KEY", "key"), patch.object(settings, "SENDGRID_SANDBOX", True):
        with patch("sendgrid.SendGridAPIClient") as client:
            assert _send(to_email="a@example.com", to_name="A", subject="s", html_body="h", text_body="t") is True

    client.assert_not_called()
