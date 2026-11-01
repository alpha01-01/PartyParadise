import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, settings
from app.database import get_db
from app.main import app
from app.routers.staff import LeaveRequestResponse, StaffProfileResponse
from app.utils.security import (
    create_access_token,
    create_portal_setup_token,
    create_refresh_token,
    password_token_matches,
)


class ExplodingDB:
    """Fails the test if a request gets past authentication to the database."""

    def query(self, *args, **kwargs):
        raise AssertionError("request reached the database")


@pytest.fixture
def client():
    def override_get_db():
        yield ExplodingDB()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- Password hashes ---

def make_user():
    return SimpleNamespace(
        id=uuid.uuid4(),
        full_name="Kofi Boateng",
        email="kofi@example.com",
        phone=None,
        avatar_url=None,
        is_active=True,
        password_hash="$2b$12$secret-hash",
    )


def make_profile():
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        role_title="Chef",
        employment_type="full_time",
        phone=None,
        emergency_contact=None,
        emergency_phone=None,
        base_salary=None,
        daily_rate=None,
        hired_at=None,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        user=make_user(),
    )


def test_staff_response_excludes_password_hash():
    body = StaffProfileResponse.model_validate(make_profile()).model_dump_json()
    assert "password_hash" not in body
    assert "kofi@example.com" in body


def test_leave_response_excludes_password_hash():
    leave = SimpleNamespace(
        id=uuid.uuid4(),
        staff_id=uuid.uuid4(),
        reviewed_by=None,
        type="annual",
        start_date=datetime(2026, 5, 1).date(),
        end_date=datetime(2026, 5, 2).date(),
        days_requested=2,
        status="pending",
        reason=None,
        review_notes=None,
        created_at=datetime.now(timezone.utc),
        staff=make_profile(),
    )
    body = LeaveRequestResponse.model_validate(leave).model_dump_json()
    assert "password_hash" not in body
    assert "Kofi Boateng" in body


# --- Token types ---

def test_staff_refresh_token_is_not_an_access_token(client):
    token = create_refresh_token(str(uuid.uuid4()), token_type="staff")
    assert client.get("/clients", headers=bearer(token)).status_code == 401


def test_portal_refresh_token_is_not_an_access_token():
    from app.dependencies import get_current_portal_account
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    token = create_refresh_token(str(uuid.uuid4()), token_type="client")
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    with pytest.raises(HTTPException) as error:
        get_current_portal_account(credentials, ExplodingDB())
    assert error.value.status_code == 401


def test_portal_setup_token_is_not_an_access_token(client):
    token = create_portal_setup_token(str(uuid.uuid4()), "hash")
    assert client.get("/clients", headers=bearer(token)).status_code == 401


# --- Portal setup links ---

@pytest.mark.parametrize("token", [str(uuid.uuid4()), "garbage"])
def test_portal_setup_rejects_bare_ids_and_garbage(client, token):
    response = client.post(f"/portal/auth/setup/{token}", json={"password": "Password1"})
    assert response.status_code == 400


def test_portal_setup_rejects_access_tokens(client):
    token = create_access_token(str(uuid.uuid4()), token_type="client")
    response = client.post(f"/portal/auth/setup/{token}", json={"password": "Password1"})
    assert response.status_code == 400


def test_portal_setup_rejects_expired_token(client):
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "type": "portal_setup",
            "pwf": "x",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    response = client.post(f"/portal/auth/setup/{token}", json={"password": "Password1"})
    assert response.status_code == 400


@pytest.mark.parametrize("password", ["x", "alllowercase1", "NoNumbersHere"])
def test_portal_setup_enforces_password_rules(client, password):
    response = client.post(f"/portal/auth/setup/anything", json={"password": password})
    assert response.status_code == 422


def test_portal_setup_token_is_single_use():
    token = create_portal_setup_token(str(uuid.uuid4()), "old-hash")
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert password_token_matches(payload, "old-hash") is True
    assert password_token_matches(payload, "new-hash") is False


# --- Audit log API ---

def test_audit_log_requires_authentication(client):
    assert client.get("/audit-logs/").status_code == 403


def test_audit_log_cannot_be_written_over_http(client):
    response = client.post(
        "/audit-logs/",
        json={"entity_type": "x", "entity_id": "1", "action": "y"},
    )
    assert response.status_code == 405


# --- Signing key ---

@pytest.mark.parametrize(
    "key",
    ["short", "change-me-in-production", "change-me-to-a-random-64-char-string"],
)
def test_weak_secret_keys_are_rejected(key):
    with pytest.raises(ValidationError):
        Settings(SECRET_KEY=key, _env_file=None)


def test_secret_key_is_required(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_internal_webhook_secret_can_be_configured():
    configured = Settings(
        SECRET_KEY="a" * 32,
        INTERNAL_WEBHOOK_SECRET="value",
        _env_file=None,
    )
    assert configured.INTERNAL_WEBHOOK_SECRET == "value"
