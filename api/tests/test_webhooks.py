import hashlib
import hmac
import time
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.routers import webhooks


class QueryStub:
    def __init__(self, value):
        self.value = value

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self.value


class FakeDB:
    def __init__(
        self,
        *,
        invoice=None,
        duplicate_payment=None,
        open_period=None,
        portal_account=None,
    ):
        self.invoice = invoice
        self.duplicate_payment = duplicate_payment
        self.open_period = open_period
        self.portal_account = portal_account
        self.added = []
        self.committed = False
        self.refreshed = []

    def query(self, model):
        if model is webhooks.Invoice:
            return QueryStub(self.invoice)
        if model is webhooks.Payment:
            return QueryStub(self.duplicate_payment)
        if model is webhooks.AccountPeriod:
            return QueryStub(self.open_period)
        if model is webhooks.ClientPortalAccount:
            return QueryStub(self.portal_account)
        return QueryStub(None)

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.committed = True

    def refresh(self, value):
        self.refreshed.append(value)


def make_invoice(amount_paid: str = "0.00", total_amount: str = "4800.00"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        reference="INV-001",
        total_amount=Decimal(total_amount),
        amount_paid=Decimal(amount_paid),
        status="sent",
        client_id=uuid.uuid4(),
    )


def make_client(db: FakeDB):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def sign_internal(invoice_id: uuid.UUID, amount: Decimal, timestamp: str, secret: str) -> str:
    return hmac.new(
        secret.encode(),
        f"{timestamp}.{invoice_id}.{amount:.2f}".encode(),
        hashlib.sha256,
    ).hexdigest()


def signed_headers(invoice_id, amount: str, secret: str = "secret-key") -> dict:
    timestamp = str(int(time.time() * 1000))
    return {
        "X-Source": "paystack-webhook",
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Signature": sign_internal(invoice_id, Decimal(amount), timestamp, secret),
    }


def test_missing_source_header_returns_403():
    invoice = make_invoice()
    db = FakeDB(invoice=invoice)
    client = make_client(db)

    response = client.post(
        f"/invoices/{invoice.id}/payments",
        json={
            "amount": "100.00",
            "method": "paystack",
            "paid_at": "2026-03-29",
        },
    )

    app.dependency_overrides.clear()
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden"}


def test_invalid_internal_signature_returns_401():
    invoice = make_invoice()
    db = FakeDB(invoice=invoice)
    client = make_client(db)

    with patch.object(webhooks.settings, "INTERNAL_WEBHOOK_SECRET", "secret-key"):
        response = client.post(
            f"/invoices/{invoice.id}/payments",
            json={
                "amount": "100.00",
                "method": "paystack",
                "paid_at": "2026-03-29",
            },
            headers={
                "X-Source": "paystack-webhook",
                "X-Internal-Timestamp": str(int(time.time() * 1000)),
                "X-Internal-Signature": "bad-signature",
            },
        )

    app.dependency_overrides.clear()
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid internal signature"}


def test_payment_rejected_when_secret_not_configured():
    invoice = make_invoice()
    db = FakeDB(invoice=invoice)
    client = make_client(db)

    with patch.object(webhooks.settings, "INTERNAL_WEBHOOK_SECRET", ""):
        response = client.post(
            f"/invoices/{invoice.id}/payments",
            json={"amount": "100.00", "method": "paystack", "paid_at": "2026-03-29"},
            headers={"X-Source": "paystack-webhook"},
        )

    app.dependency_overrides.clear()
    assert response.status_code == 401
    assert db.committed is False


def test_signature_matches_relay_format_for_whole_amounts():
    """The relay signs (amount / 100).toFixed(2), so 1500 cedis is "1500.00"."""
    invoice_id = uuid.uuid4()
    timestamp = str(int(time.time() * 1000))
    relay_signature = hmac.new(
        b"secret-key",
        f"{timestamp}.{invoice_id}.1500.00".encode(),
        hashlib.sha256,
    ).hexdigest()

    with patch.object(webhooks.settings, "INTERNAL_WEBHOOK_SECRET", "secret-key"):
        assert webhooks._verify_internal_sig(invoice_id, Decimal("1500"), timestamp, relay_signature) is True


def test_verify_internal_sig_accepts_valid_and_rejects_stale():
    invoice_id = uuid.uuid4()
    amount = Decimal("250.00")
    fresh_timestamp = str(int(time.time() * 1000))
    stale_timestamp = str(int((time.time() - 60) * 1000))

    with patch.object(webhooks.settings, "INTERNAL_WEBHOOK_SECRET", "secret-key"):
        valid_sig = sign_internal(invoice_id, amount, fresh_timestamp, "secret-key")
        stale_sig = sign_internal(invoice_id, amount, stale_timestamp, "secret-key")

        assert webhooks._verify_internal_sig(invoice_id, amount, fresh_timestamp, valid_sig) is True
        assert webhooks._verify_internal_sig(invoice_id, amount, stale_timestamp, stale_sig) is False
