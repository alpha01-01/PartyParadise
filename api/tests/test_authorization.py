import re
import uuid

import pytest
from fastapi.routing import APIRoute
from sqlalchemy import text

from app.dependencies import get_current_portal_account, get_current_staff_user
from app.main import app
from app.utils.security import create_access_token

PUBLIC = {
    ("GET", "/health"),
    ("POST", "/auth/login"),
    ("POST", "/auth/refresh"),
    ("POST", "/auth/logout"),
    ("POST", "/auth/forgot-password"),
    ("POST", "/auth/reset-password"),
    ("POST", "/portal/auth/login"),
    ("POST", "/portal/auth/refresh"),
    ("POST", "/portal/auth/logout"),
    ("POST", "/portal/auth/setup/{token}"),
    # Protected by their own token or signature, tested elsewhere
    ("GET", "/contracts/sign/{token}"),
    ("POST", "/contracts/sign/{token}"),
    ("POST", "/invoices/{invoice_id}/payments"),
}

def dependency_calls(dependant):
    yield dependant.call
    for child in dependant.dependencies:
        yield from dependency_calls(child)


def required_permission(route):
    for call in dependency_calls(route.dependant):
        if getattr(call, "permission", None):
            return call.permission
    return None


def uses_portal_auth(route):
    return get_current_portal_account in dependency_calls(route.dependant)


def uses_staff_auth(route):
    return get_current_staff_user in dependency_calls(route.dependant)


ROUTES = [
    (method, route)
    for route in app.routes
    if isinstance(route, APIRoute)
    for method in sorted(route.methods)
]
PERMISSION_ROUTES = [(m, r) for m, r in ROUTES if required_permission(r)]
PROTECTED = [(m, r) for m, r in ROUTES if (m, r.path) not in PUBLIC]
PORTAL_ROUTES = [(m, r) for m, r in ROUTES if uses_portal_auth(r)]
STAFF_ROUTES = [(m, r) for m, r in ROUTES if uses_staff_auth(r)]


def params(routes):
    return [pytest.param(method, route, id=f"{method} {route.path}") for method, route in routes]


def request(api, method, route, headers=None):
    path = re.sub(r"\{\w+\}", lambda _: str(uuid.uuid4()), route.path)
    body = {"json": {}} if method in ("POST", "PATCH", "PUT") else {}
    return api.request(method, path, headers=headers, **body)


def test_every_route_has_a_known_access_rule():
    unclassified = [
        (method, route.path)
        for method, route in ROUTES
        if not uses_staff_auth(route)
        and not uses_portal_auth(route)
        and (method, route.path) not in PUBLIC
    ]
    assert unclassified == []


@pytest.mark.parametrize("method, route", params(PROTECTED))
def test_anonymous_is_refused(api, method, route):
    assert request(api, method, route).status_code in (401, 403)


@pytest.mark.parametrize("method, route", params(PORTAL_ROUTES))
def test_staff_token_is_refused_on_portal_routes(api, method, route):
    token = create_access_token(str(uuid.uuid4()), token_type="staff")
    response = request(api, method, route, {"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


@pytest.mark.parametrize("method, route", params(STAFF_ROUTES))
def test_client_token_is_refused_on_staff_routes(api, method, route):
    token = create_access_token(str(uuid.uuid4()), token_type="client")
    response = request(api, method, route, {"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


@pytest.mark.parametrize("method, route", params(PERMISSION_ROUTES))
@pytest.mark.parametrize("role", ["staff", "manager", "admin"])
def test_role_permissions_are_enforced(api, db, make_user, auth_for, role, method, route):
    permission = required_permission(route)
    role_has_it = db.execute(
        text(
            "SELECT count(*) FROM role_permissions rp "
            "JOIN roles r ON r.id = rp.role_id "
            "JOIN permissions p ON p.id = rp.permission_id "
            "WHERE r.name = :role AND p.name = :permission"
        ),
        {"role": role, "permission": permission},
    ).scalar()

    status = request(api, method, route, auth_for(make_user(role))).status_code

    if role_has_it:
        assert status not in (401, 403)
    else:
        assert status == 403
