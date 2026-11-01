import hashlib
import hmac
import json
import shutil
import subprocess
import time
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.accounting import JournalEntry
from app.models.invoicing import Invoice, Payment
from app.routers import webhooks
from conftest import API_ROOT

SECRET = "test-internal-secret"
SIGNING_MODULE = API_ROOT.parent / "web" / "lib" / "internalSignature.ts"


@pytest.fixture(autouse=True)
def webhook_secret():
    with patch.object(webhooks.settings, "INTERNAL_WEBHOOK_SECRET", SECRET):
        yield


@pytest.fixture(autouse=True)
def paystack_confirms():
    with patch("app.routers.webhooks.confirm_charge") as confirm:
        yield confirm


@pytest.fixture
def invoice_id(api, admin_headers):
    client = api.post(
        "/clients",
        json={"first_name": "Ama", "last_name": "Mensah", "email": "ama@example.com"},
        headers=admin_headers,
    ).json()
    invoice = api.post(
        "/invoicing/invoices",
        json={
            "client_id": client["id"],
            "items": [{"description": "Hall", "quantity": 1, "unit_price": "1500", "total_price": "1500"}],
        },
        headers=admin_headers,
    ).json()
    assert api.patch(f"/invoicing/invoices/{invoice['id']}/send", headers=admin_headers).status_code == 200
    return invoice["id"]


def signed_headers(invoice_id: str, amount: str, secret: str = SECRET) -> dict:
    timestamp = str(int(time.time() * 1000))
    signature = hmac.new(
        secret.encode(),
        f"{timestamp}.{invoice_id}.{amount}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return {
        "X-Source": "paystack-webhook",
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Signature": signature,
    }


def post_payment(api, invoice_id, amount="1500.00", headers=None, provider_ref="ref-1"):
    return api.post(
        f"/invoices/{invoice_id}/payments",
        json={
            "amount": amount,
            "method": "paystack",
            "paid_at": date.today().isoformat(),
            "provider_ref": provider_ref,
        },
        headers=signed_headers(invoice_id, amount) if headers is None else headers,
    )


def test_wrong_secret_is_refused_and_records_nothing(api, db, invoice_id):
    response = post_payment(
        api,
        invoice_id,
        headers=signed_headers(invoice_id, "1500.00", secret="wrong"),
    )

    assert response.status_code == 401
    assert db.query(Payment).count() == 0


def test_signature_for_another_amount_is_refused(api, invoice_id):
    response = post_payment(api, invoice_id, amount="1.00", headers=signed_headers(invoice_id, "1500.00"))

    assert response.status_code == 401


def test_unknown_invoice_is_404(api):
    invoice_id = "11111111-1111-1111-1111-111111111111"

    assert post_payment(api, invoice_id).status_code == 404


def test_signed_payment_is_recorded(api, db, invoice_id):
    assert post_payment(api, invoice_id).status_code == 201

    invoice = db.get(Invoice, invoice_id)
    assert invoice.amount_paid == Decimal("1500.00")
    assert invoice.status == "paid"

    payment = db.query(Payment).one()
    assert payment.received_by is None
    assert payment.source == "webhook"
    journal = db.query(JournalEntry).filter(JournalEntry.source_id == payment.id).one()
    assert journal.created_by is None
    assert journal.amount == Decimal("1500.00")


def test_duplicate_delivery_records_one_payment(api, db, invoice_id):
    assert post_payment(api, invoice_id, amount="100.00").status_code == 201
    assert post_payment(api, invoice_id, amount="100.00").status_code == 409

    assert db.query(Payment).count() == 1


def test_repeat_customer_second_charge_is_recorded(api, db, invoice_id):
    assert post_payment(api, invoice_id, amount="100.00", provider_ref="ref-1").status_code == 201
    assert post_payment(api, invoice_id, amount="100.00", provider_ref="ref-2").status_code == 201

    assert db.get(Invoice, invoice_id).amount_paid == Decimal("200.00")


def test_overpayment_is_refused(api, db, invoice_id):
    assert post_payment(api, invoice_id, amount="1500.01").status_code == 422
    assert db.query(Payment).count() == 0


def test_relay_uses_the_unique_transaction_reference():
    relay = (API_ROOT.parent / "web" / "app" / "api" / "webhooks" / "paystack" / "route.ts").read_text(encoding="utf-8")

    assert "provider_ref: data.reference" in relay


def test_node_and_python_signatures_match():
    """Runs the signing code the Next.js relay really uses, not a copy of it."""
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed")

    script = (
        f"import {{ pesewasToAmount, signInternalPayment }} from {json.dumps(SIGNING_MODULE.as_uri())};\n"
        "const amount = pesewasToAmount(150050);\n"
        "const signature = signInternalPayment('secret', '1700000000000', 'invoice-1', amount);\n"
        "console.log(JSON.stringify({ amount, signature }));\n"
    )
    result = subprocess.run(
        [node, "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
    )
    if "ERR_UNKNOWN_FILE_EXTENSION" in result.stderr:
        pytest.skip("this Node version cannot load TypeScript directly")
    assert result.returncode == 0, result.stderr

    output = json.loads(result.stdout)
    assert output["amount"] == "1500.50"

    expected = hmac.new(
        b"secret",
        f"1700000000000.invoice-1.{Decimal('1500.50'):.2f}".encode(),
        hashlib.sha256,
    ).hexdigest()
    assert output["signature"] == expected
