from unittest.mock import patch

import pytest

from app.models.portal import ClientPortalAccount
from app.utils.security import create_access_token, create_portal_setup_token, hash_password

PASSWORD = "Password123"


@pytest.fixture
def user(make_user):
    return make_user("staff", password_hash=hash_password(PASSWORD))


def login(api, user, password=PASSWORD):
    return api.post("/auth/login", json={"email": user.email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_and_use_access_token(api, user):
    response = login(api, user)

    assert response.status_code == 200
    assert api.get("/clients", headers=bearer(response.json()["access_token"])).status_code == 200


def test_wrong_password_is_refused(api, user):
    assert login(api, user, "Wrong-password1").status_code == 401


def test_inactive_user_is_refused(api, db, user):
    user.is_active = False
    db.commit()

    assert login(api, user).status_code in (401, 403)


def test_refresh_issues_a_working_access_token(api, user):
    refresh_token = login(api, user).json()["refresh_token"]

    response = api.post("/auth/refresh", json={"refresh_token": refresh_token})

    assert response.status_code == 200
    assert api.get("/clients", headers=bearer(response.json()["access_token"])).status_code == 200


def test_refresh_token_cannot_be_used_as_access_token(api, user):
    refresh_token = login(api, user).json()["refresh_token"]

    assert api.get("/clients", headers=bearer(refresh_token)).status_code == 401


def test_logout_revokes_refresh_token(api, user):
    refresh_token = login(api, user).json()["refresh_token"]

    assert api.post("/auth/logout", json={"refresh_token": refresh_token}).status_code == 200
    assert api.post("/auth/refresh", json={"refresh_token": refresh_token}).status_code == 401


def test_me_returns_current_user(api, user):
    access_token = login(api, user).json()["access_token"]

    response = api.get("/auth/me", headers=bearer(access_token))

    assert response.status_code == 200
    assert response.json()["email"] == user.email


def test_change_password_revokes_existing_sessions(api, user):
    tokens = login(api, user).json()

    response = api.post(
        "/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "NewPassword456"},
        headers=bearer(tokens["access_token"]),
    )

    assert response.status_code == 200
    assert api.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    assert login(api, user, "NewPassword456").status_code == 200


@pytest.fixture
def portal_account(api, db, admin_headers):
    client = api.post(
        "/clients",
        json={"first_name": "Esi", "last_name": "Owusu", "email": "esi@example.com"},
        headers=admin_headers,
    ).json()
    assert api.post(f"/portal/clients/{client['id']}/invite", headers=admin_headers).status_code < 300
    return db.query(ClientPortalAccount).filter(ClientPortalAccount.client_id == client["id"]).one()


def set_up_portal_password(api, account, password="Client123"):
    token = create_portal_setup_token(str(account.id), account.password_hash)
    return api.post(f"/portal/auth/setup/{token}", json={"password": password})


def test_portal_setup_login_and_refresh(api, portal_account):
    assert set_up_portal_password(api, portal_account).status_code == 200

    tokens = api.post(
        "/portal/auth/login",
        json={"email": "esi@example.com", "password": "Client123"},
    )

    assert tokens.status_code == 200
    refreshed = api.post("/portal/auth/refresh", json={"refresh_token": tokens.json()["refresh_token"]})
    assert refreshed.status_code == 200


def test_portal_setup_link_works_once(api, portal_account):
    token = create_portal_setup_token(str(portal_account.id), portal_account.password_hash)

    assert api.post(f"/portal/auth/setup/{token}", json={"password": "Client123"}).status_code == 200
    assert api.post(f"/portal/auth/setup/{token}", json={"password": "Client456"}).status_code == 400


def test_portal_client_can_read_dashboard(api, portal_account):
    set_up_portal_password(api, portal_account)
    tokens = api.post(
        "/portal/auth/login",
        json={"email": "esi@example.com", "password": "Client123"},
    ).json()

    assert api.get("/portal/dashboard", headers=bearer(tokens["access_token"])).status_code == 200


def test_portal_data_routes_work(api, portal_account):
    set_up_portal_password(api, portal_account)
    tokens = api.post(
        "/portal/auth/login",
        json={"email": "esi@example.com", "password": "Client123"},
    ).json()
    headers = bearer(tokens["access_token"])

    for path in ["bookings", "invoices", "contracts", "documents", "notifications"]:
        assert api.get(f"/portal/{path}", headers=headers).status_code == 200, path


# --- Password reset ---

def reset_link(mock_send):
    return mock_send.call_args.args[1].rsplit("/", 1)[1]


def test_forgot_password_gives_the_same_answer_for_unknown_email(api, user):
    with patch("app.services.auth.send_password_reset", return_value=True) as send:
        known = api.post("/auth/forgot-password", json={"email": user.email})
        unknown = api.post("/auth/forgot-password", json={"email": "nobody@example.com"})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert send.call_count == 1


def test_password_reset_works_once_and_ends_sessions(api, user):
    refresh_token = login(api, user).json()["refresh_token"]
    with patch("app.services.auth.send_password_reset", return_value=True) as send:
        api.post("/auth/forgot-password", json={"email": user.email.upper()})
    token = reset_link(send)

    first = api.post("/auth/reset-password", json={"token": token, "new_password": "NewPassword456"})
    second = api.post("/auth/reset-password", json={"token": token, "new_password": "Another789Pass"})

    assert first.status_code == 200
    assert second.status_code == 400
    assert login(api, user).status_code == 401
    assert login(api, user, "NewPassword456").status_code == 200
    assert api.post("/auth/refresh", json={"refresh_token": refresh_token}).status_code == 401


def test_access_token_cannot_reset_a_password(api, user):
    token = create_access_token(str(user.id))

    response = api.post("/auth/reset-password", json={"token": token, "new_password": "NewPassword456"})

    assert response.status_code == 400


def test_new_staff_can_set_a_password_and_log_in(api, admin_headers):
    with patch("app.services.email._send", return_value=False):
        response = api.post(
            "/staff",
            json={
                "first_name": "Kofi",
                "last_name": "Boateng",
                "email": "Kofi.B@Example.com",
                "role_title": "Chef",
            },
            headers=admin_headers,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["invite_sent"] is False
    assert body["user"]["email"] == "kofi.b@example.com"

    token = body["setup_url"].rsplit("/", 1)[1]
    assert api.post("/auth/reset-password", json={"token": token, "new_password": "ChefPassword1"}).status_code == 200
    assert (
        api.post("/auth/login", json={"email": "kofi.b@example.com", "password": "ChefPassword1"}).status_code
        == 200
    )


def test_staff_invite_link_is_not_returned_when_emailed(api, admin_headers):
    with patch("app.services.email._send", return_value=True):
        body = api.post(
            "/staff",
            json={"first_name": "Abena", "last_name": "Asare", "email": "abena@example.com", "role_title": "Host"},
            headers=admin_headers,
        ).json()

    assert body["invite_sent"] is True
    assert body["setup_url"] is None


def test_mixed_case_email_already_stored_can_log_in(api, db, make_user):
    existing = make_user("staff", password_hash=hash_password(PASSWORD))
    existing.email = "Mixed.Case@Example.com"
    db.commit()

    response = api.post("/auth/login", json={"email": "mixed.case@example.com", "password": PASSWORD})

    assert response.status_code == 200
