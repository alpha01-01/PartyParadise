import re

import pytest

from app.main import app
from app.models.contracts import ContractTemplate
from app.routers.contracts import _fill_template

MONEY_KEY = re.compile(r"amount|total|price|salary|balance|subtotal|tax|discount|rate|cost|revenue", re.I)


@pytest.fixture
def seeded(api, db, admin_headers):
    client_id = api.post(
        "/clients",
        json={"first_name": "Ama", "last_name": "Mensah", "email": "ama@example.com", "phone": "0241234567"},
        headers=admin_headers,
    ).json()["id"]
    booking_id = api.post(
        "/bookings",
        json={
            "client_id": client_id,
            "service_type": "decor",
            "event_date": "2027-06-01",
            "venue_name": "Labadi Hall",
            "services": [
                {"service": "balloon_arch", "description": "Gold and white", "price": "1500.50"},
                {"service": "table_decor", "price": "499.50"},
            ],
        },
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
    return {"client_id": client_id, "booking_id": booking_id, "invoice_id": invoice_id}


def required_query(operation):
    samples = {"string": "2027-06", "integer": 2027}
    query = {}
    for parameter in operation.get("parameters", []):
        if parameter["in"] == "query" and parameter.get("required"):
            schema = parameter["schema"]
            is_date = schema.get("format") == "date" or parameter["name"] == "week"
            query[parameter["name"]] = "2027-06-01" if is_date else samples[schema["type"]]
    return query


# --- Contracts ---

def test_templates_are_listed(api, admin_headers):
    response = api.get("/contracts/templates", headers=admin_headers)

    assert response.status_code == 200
    assert len(response.json()) >= 3


def test_every_seeded_template_fills_completely(api, db, admin_headers, seeded):
    for template in db.query(ContractTemplate).all():
        response = api.post(
            "/contracts",
            json={"booking_id": seeded["booking_id"], "template_id": str(template.id)},
            headers=admin_headers,
        )
        assert response.status_code == 201, template.name
        body = response.json()["body"]
        assert "{{" not in body
        assert "Ama Mensah" in body
        assert "01 June 2027" in body
        assert "Labadi Hall" in body
        assert "GHS 2,000.00" in body
        assert "GHS 1,000.00" in body
        assert "Balloon Arch: Gold and white" in body


def test_unknown_placeholder_stops_the_contract():
    with pytest.raises(Exception) as error:
        _fill_template("Hello {{client_name}} {{mystery}}", {"client_name": "Ama"})

    assert error.value.status_code == 422
    assert "mystery" in error.value.detail


def test_placeholders_match_any_case_and_spacing():
    assert _fill_template("{{CLIENT_NAME}} {{ client_name }}", {"client_name": "Ama"}) == "Ama Ama"


# --- Routes ---

def test_literal_paths_are_not_shadowed_by_id_routes():
    routes = [(route.path, method) for route in app.routes for method in getattr(route, "methods", [])]

    for index, (path, method) in enumerate(routes):
        pattern = re.sub(r"\{\w+\}", "[^/]+", path)
        for later, later_method in routes[index + 1:]:
            if "{" in path and "{" not in later and method == later_method:
                assert not re.fullmatch(pattern, later), f"{later} is hidden by {path}"


def test_list_routes_work_and_money_is_numeric(api, admin_headers, seeded):
    failures = []
    money_as_text = []

    def walk(value, where):
        if isinstance(value, dict):
            for key, item in value.items():
                if isinstance(item, str) and MONEY_KEY.search(key) and re.fullmatch(r"-?\d+\.\d+", item):
                    money_as_text.append(f"{where}: {key}")
                walk(item, where)
        elif isinstance(value, list):
            for item in value:
                walk(item, where)

    for path, methods in app.openapi()["paths"].items():
        if "get" not in methods or "{" in path or path.startswith("/portal"):
            continue
        response = api.get(path, params=required_query(methods["get"]), headers=admin_headers)
        if response.status_code >= 400:
            failures.append(f"{path} {response.status_code}")
        elif "json" in response.headers.get("content-type", ""):
            walk(response.json(), path)

    for path in [f"/bookings/{seeded['booking_id']}", f"/invoicing/invoices/{seeded['invoice_id']}"]:
        response = api.get(path, headers=admin_headers)
        assert response.status_code == 200, path
        walk(response.json(), path)

    assert not failures, failures
    assert not money_as_text, money_as_text
