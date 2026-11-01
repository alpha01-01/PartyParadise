import html
import io
import zipfile
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import event, text

from app.models.accounting import AccountPeriod, ExpenseCategory
from app.models.auth import UserSession
from app.models.staff import Shift, StaffProfile
from app.routers.inventory import MAX_IMPORT_BYTES
from app.services import email
from app.utils.security import hash_password

TODAY = date.today()


# --- Login limits ---

def test_account_locks_after_repeated_bad_passwords(api, make_user):
    user = make_user("staff", password_hash=hash_password("Password123"))
    body = {"email": user.email, "password": "Wrong-password1"}

    for _ in range(5):
        assert api.post("/auth/login", json=body).status_code == 401

    assert api.post("/auth/login", json=body).status_code == 429
    assert api.post("/auth/login", json={"email": user.email, "password": "Password123"}).status_code == 429


def test_successful_login_clears_the_count(api, make_user):
    user = make_user("staff", password_hash=hash_password("Password123"))

    for _ in range(4):
        api.post("/auth/login", json={"email": user.email, "password": "Wrong-password1"})
    assert api.post("/auth/login", json={"email": user.email, "password": "Password123"}).status_code == 200
    assert api.post("/auth/login", json={"email": user.email, "password": "Wrong-password1"}).status_code == 401


def test_portal_login_is_limited_too(api):
    body = {"email": "nobody@example.com", "password": "Wrong-password1"}

    for _ in range(5):
        assert api.post("/portal/auth/login", json=body).status_code == 401

    assert api.post("/portal/auth/login", json=body).status_code == 429


def test_unknown_email_still_spends_bcrypt_time(api):
    with patch("app.utils.security.verify_password", return_value=False) as verify:
        api.post("/auth/login", json={"email": "nobody@example.com", "password": "Wrong-password1"})

    assert verify.call_count == 1


def test_password_reset_requests_are_limited(api):
    body = {"email": "nobody@example.com"}

    for _ in range(5):
        assert api.post("/auth/forgot-password", json=body).status_code == 200

    assert api.post("/auth/forgot-password", json=body).status_code == 429


# --- Passwords ---

@pytest.mark.parametrize("password", ["short1A", "alllowercase1", "NoNumbersHere"])
def test_staff_password_rules(api, admin_headers, password):
    response = api.post(
        "/auth/users",
        json={"full_name": "A", "email": "a@example.com", "password": password},
        headers=admin_headers,
    )

    assert response.status_code == 422


# --- Headers and health ---

def test_security_headers_and_request_id(api):
    response = api.get("/health")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Request-ID"]


def test_request_id_is_kept_from_the_caller(api):
    assert api.get("/health", headers={"X-Request-ID": "abc"}).headers["X-Request-ID"] == "abc"


def test_health_checks_the_database(api):
    assert api.get("/health").json()["status"] == "ok"


# --- Import limits ---

def upload(api, headers, content, name):
    return api.post(
        "/inventory/items/import",
        files={"file": (name, io.BytesIO(content), "text/plain")},
        headers=headers,
    )


def test_oversized_import_is_refused(api, admin_headers):
    assert upload(api, admin_headers, b"x" * (MAX_IMPORT_BYTES + 1), "items.csv").status_code == 413


def zip_of(entries):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def test_zip_bomb_is_refused(api, admin_headers):
    content = zip_of({"xl/workbook.xml": b"0" * (60 * 1024 * 1024)})

    assert upload(api, admin_headers, content, "items.xlsx").status_code == 413


def test_xml_entities_are_refused(api, admin_headers):
    content = zip_of({"xl/workbook.xml": b'<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>'})

    assert upload(api, admin_headers, content, "items.xlsx").status_code == 400


# --- Email ---

def test_names_are_escaped_in_html_email():
    client = SimpleNamespace(first_name="<script>x</script>", last_name="B", email="a@example.com")

    with patch("app.services.email._send", return_value=True) as send:
        email.send_portal_invite(client, setup_url="https://x")

    assert "<script>" not in send.call_args.kwargs["html_body"]
    assert html.escape("<script>") in send.call_args.kwargs["html_body"]


# --- Query counts ---

class QueryCounter:
    def __init__(self, engine):
        self.engine = engine
        self.count = 0

    def _count(self, *args):
        self.count += 1

    def __enter__(self):
        event.listen(self.engine, "before_cursor_execute", self._count)
        return self

    def __exit__(self, *args):
        event.remove(self.engine, "before_cursor_execute", self._count)


def test_invoice_list_does_not_query_per_row(api, engine, admin_headers):
    client = api.post("/clients", json={"first_name": "A", "last_name": "B", "email": "q@example.com"}, headers=admin_headers).json()["id"]
    body = {"client_id": client, "items": [{"description": "x", "quantity": 1, "unit_price": "1"}]}

    def queries():
        with QueryCounter(engine) as counter:
            assert api.get("/invoicing/invoices", headers=admin_headers).status_code == 200
        return counter.count

    api.post("/invoicing/invoices", json=body, headers=admin_headers)
    few = queries()
    for _ in range(5):
        api.post("/invoicing/invoices", json=body, headers=admin_headers)

    assert queries() == few


def test_pnl_is_two_queries(api, engine, admin_headers):
    with QueryCounter(engine) as counter:
        response = api.get("/reports/pnl", params={"year": TODAY.year}, headers=admin_headers)

    assert response.status_code == 200
    assert len(response.json()["months"] if isinstance(response.json(), dict) else response.json()) == 12
    assert counter.count <= 5


def test_client_list_leaves_out_history(api, admin_headers):
    client = api.post("/clients", json={"first_name": "A", "last_name": "B", "email": "h@example.com"}, headers=admin_headers).json()["id"]
    api.post(
        "/invoicing/invoices",
        json={"client_id": client, "items": [{"description": "x", "quantity": 1, "unit_price": "1"}]},
        headers=admin_headers,
    )

    row = api.get("/clients", headers=admin_headers).json()["items"][0]

    assert row["invoices"] == []
    assert len(api.get(f"/clients/{client}", headers=admin_headers).json()["invoices"]) == 1


# --- Dashboard ---

def test_dashboard_counts_overdue_invoices_as_outstanding(api, admin_headers):
    client = api.post("/clients", json={"first_name": "A", "last_name": "B", "email": "o@example.com"}, headers=admin_headers).json()["id"]
    invoice = api.post(
        "/invoicing/invoices",
        json={
            "client_id": client,
            "due_date": (TODAY - timedelta(days=3)).isoformat(),
            "items": [{"description": "x", "quantity": 1, "unit_price": "1"}],
        },
        headers=admin_headers,
    ).json()["id"]
    api.patch(f"/invoicing/invoices/{invoice}/send", headers=admin_headers)
    api.get("/invoicing/invoices", headers=admin_headers)

    summary = api.get("/reports/dashboard", headers=admin_headers).json()

    assert summary["outstanding_invoices"] == 1
    assert summary["overdue_invoices"] == 1


# --- Periods ---

@pytest.fixture
def closed_period(db):
    period = AccountPeriod(label="Closed", start_date=TODAY - timedelta(days=30), end_date=TODAY - timedelta(days=5), status="closed")
    category = ExpenseCategory(name="Test Category", type="operating")
    db.add_all([period, category])
    db.commit()
    return SimpleNamespace(period=period, category_id=str(category.id))


def expense(api, headers, category_id, when):
    return api.post(
        "/accounting/expenses",
        json={"category_id": category_id, "description": "Chairs", "amount": "5", "payment_method": "cash", "expense_date": when.isoformat()},
        headers=headers,
    )


def test_closed_period_refuses_new_entries(api, admin_headers, closed_period):
    assert expense(api, admin_headers, closed_period.category_id, TODAY - timedelta(days=10)).status_code == 400
    assert expense(api, admin_headers, closed_period.category_id, TODAY).status_code == 201


def test_closed_period_refuses_voiding(api, db, admin_headers, closed_period):
    created = expense(api, admin_headers, closed_period.category_id, TODAY - timedelta(days=2)).json()
    closed_period.period.end_date = TODAY
    db.commit()

    assert api.delete(f"/accounting/expenses/{created['id']}", headers=admin_headers).status_code == 400


# --- Sessions ---

def test_login_clears_that_users_expired_sessions(api, db, make_user):
    from datetime import datetime, timezone

    user = make_user("staff", password_hash=hash_password("Password123"))
    db.add(UserSession(user_id=user.id, token_hash="old", expires_at=datetime(2020, 1, 1, tzinfo=timezone.utc)))
    db.commit()

    api.post("/auth/login", json={"email": user.email, "password": "Password123"})

    assert db.query(UserSession).filter(UserSession.token_hash == "old").count() == 0


# --- Shifts ---

@pytest.fixture
def profile(db, make_user):
    row = StaffProfile(user_id=make_user("staff").id, role_title="Crew", employment_type="full_time")
    db.add(row)
    db.commit()
    return row


def shift(api, headers, profile, start, end=None):
    body = {"staff_id": str(profile.id), "shift_date": "2099-01-01", "start_time": start}
    if end:
        body["end_time"] = end
    return api.post("/staff/shifts", json=body, headers=headers)


def test_two_separate_shifts_on_one_day_are_allowed(api, admin_headers, profile):
    assert shift(api, admin_headers, profile, "08:00:00", "12:00:00").status_code == 201
    assert shift(api, admin_headers, profile, "13:00:00", "17:00:00").status_code == 201


def test_overlapping_shifts_are_refused(api, admin_headers, profile):
    assert shift(api, admin_headers, profile, "08:00:00", "12:00:00").status_code == 201
    assert shift(api, admin_headers, profile, "11:00:00", "14:00:00").status_code == 409
    assert shift(api, admin_headers, profile, "07:00:00").status_code == 409


# --- Database ---

def test_refresh_lookups_are_indexed(db):
    columns = db.execute(
        text("SELECT indexdef FROM pg_indexes WHERE tablename IN ('sessions', 'portal_sessions')")
    ).scalars().all()

    assert sum("token_hash" in definition for definition in columns) == 2


def test_every_foreign_key_is_indexed(db):
    missing = db.execute(text("""
        SELECT c.conrelid::regclass::text, a.attname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
          AND NOT EXISTS (
              SELECT 1 FROM pg_index i
              WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
          )
    """)).all()

    assert missing == []
