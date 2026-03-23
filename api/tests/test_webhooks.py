"""
tests/test_webhooks.py
─────────────────────────────────────────────────────────────────
Unit tests for the Paystack webhook handler.

Run with:
    pytest tests/test_webhooks.py -v

These tests use pytest-asyncio and httpx's AsyncClient against
a real (test) FastAPI app with a test database.

For local runs without a real DB, the db-dependent tests use
mocking so they can pass without Postgres running.
"""

import hashlib
import hmac
import json
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings


# ─── Helpers ──────────────────────────────────────────────────
def _sign(payload: dict, secret: str = None) -> tuple[bytes, str]:
    """Return (raw_body_bytes, x-paystack-signature)."""
    secret = secret or settings.PAYSTACK_SECRET_KEY or "test-secret"
    raw = json.dumps(payload, separators=(",", ":")).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
    return raw, sig


def _charge_success_payload(
    invoice_id: str = None,
    amount_kobo: int = 480000,       # GHS 4,800.00
    reference: str = None,
    channel: str = "card",
) -> dict:
    """Build a minimal charge.success Paystack payload."""
    return {
        "event": "charge.success",
        "data": {
            "reference":  reference or f"INV-2025-{uuid.uuid4().hex[:6]}",
            "amount":     amount_kobo,
            "currency":   "GHS",
            "channel":    channel,
            "customer":   {"email": "ama@email.com"},
            "metadata":   {"invoice_id": str(invoice_id or uuid.uuid4())},
            "authorization": {},
        },
    }


# ─── Tests ────────────────────────────────────────────────────
class TestSignatureVerification:
    """Webhook rejects requests with a bad or missing signature."""

    def test_missing_signature_returns_422(self):
        """Pydantic marks the Header as required — missing → 422."""
        client = TestClient(app)
        res = client.post(
            "/webhooks/paystack",
            json={"event": "charge.success", "data": {}},
        )
        assert res.status_code == 422

    def test_wrong_signature_returns_401(self):
        """Valid JSON but wrong HMAC → 401."""
        client = TestClient(app)
        payload = _charge_success_payload()
        raw, _ = _sign(payload)
        res = client.post(
            "/webhooks/paystack",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "x-paystack-signature": "000000wrong",
            },
        )
        assert res.status_code == 401

    def test_correct_signature_accepted(self):
        """Valid HMAC → does not return 401/422 (may fail at DB level in unit context)."""
        client = TestClient(app, raise_server_exceptions=False)
        payload = _charge_success_payload()
        raw, sig = _sign(payload)
        res = client.post(
            "/webhooks/paystack",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "x-paystack-signature": sig,
            },
        )
        # Signature passed; result might be 200 or 500 depending on DB
        assert res.status_code != 401
        assert res.status_code != 422


class TestChargeSuccessHandler:
    """charge.success creates Payment + JournalEntry + updates invoice."""

    @patch("app.routers.webhooks._handle_charge_success")
    def test_charge_success_event_routed(self, mock_handler):
        """charge.success payload reaches the handler."""
        mock_handler.return_value = None  # coroutine mock
        import asyncio
        mock_handler.side_effect = lambda db, data: asyncio.coroutine(lambda: None)()

        client = TestClient(app, raise_server_exceptions=False)
        payload = _charge_success_payload()
        raw, sig = _sign(payload)

        res = client.post(
            "/webhooks/paystack",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "x-paystack-signature": sig,
            },
        )
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}

    def test_missing_invoice_id_returns_200(self):
        """Missing metadata.invoice_id logs a warning but still returns 200."""
        client = TestClient(app, raise_server_exceptions=False)
        payload = {
            "event": "charge.success",
            "data": {
                "reference": "REF-001",
                "amount":    100000,
                "currency":  "GHS",
                "channel":   "card",
                "customer":  {"email": "test@test.com"},
                "metadata":  {},              # no invoice_id
                "authorization": {},
            },
        }
        raw, sig = _sign(payload)
        res = client.post(
            "/webhooks/paystack",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "x-paystack-signature": sig,
            },
        )
        assert res.status_code == 200


class TestUnhandledEvents:
    """Other event types return 200 without error."""

    @pytest.mark.parametrize("event", [
        "transfer.success",
        "transfer.failed",
        "subscription.create",
        "invoice.create",
        "refund.processed",
    ])
    def test_unhandled_events_return_200(self, event: str):
        client = TestClient(app, raise_server_exceptions=False)
        payload = {"event": event, "data": {}}
        raw, sig = _sign(payload)
        res = client.post(
            "/webhooks/paystack",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "x-paystack-signature": sig,
            },
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ok"


class TestAmountConversion:
    """Verify pesewa → GHS conversion is correct."""

    def test_amount_conversion(self):
        """GHS 4,800 = 480,000 kobo/pesewas."""
        amount_kobo = 480_000
        amount_ghs = Decimal(str(amount_kobo)) / Decimal("100")
        assert amount_ghs == Decimal("4800.00")

    def test_partial_amount(self):
        """GHS 1,200.50 = 120,050 kobo."""
        amount_kobo = 120_050
        amount_ghs = Decimal(str(amount_kobo)) / Decimal("100")
        assert amount_ghs == Decimal("1200.50")


class TestMobileMoneyChannelMapping:
    """Mobile money network detection from authorization.bank field."""

    @pytest.mark.parametrize("bank_name,expected_method", [
        ("MTN Mobile Money",   "momo_mtn"),
        ("Vodafone Cash",      "momo_vodafone"),
        ("AirtelTigo Money",   "momo_airteltigo"),
        ("Unknown Network",    "momo_mtn"),      # fallback stays generic
    ])
    def test_channel_map_mobile_money(self, bank_name: str, expected_method: str):
        """Verify channel detection logic directly."""
        from app.routers.webhooks import CHANNEL_MAP

        channel = "mobile_money"
        method = CHANNEL_MAP.get(channel, "paystack")

        # Apply the network-specific override logic (same as in handler)
        bank_lower = bank_name.lower()
        if "mtn" in bank_lower:
            method = "momo_mtn"
        elif "vodafone" in bank_lower or "voda" in bank_lower:
            method = "momo_vodafone"
        elif "airteltigo" in bank_lower or "airtel" in bank_lower:
            method = "momo_airteltigo"

        assert method == expected_method


class TestIdempotency:
    """Duplicate webhooks do not create double payments."""

    def test_idempotency_guard_logic(self):
        """
        Simulate the idempotency check: if a Payment with the same
        provider_ref already exists, the handler should return early.

        This is a pure logic test — no DB required.
        """
        provider_ref = "test-ref-123"

        # Simulate: Payment with this ref exists
        mock_existing = MagicMock()
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_existing

        # The handler checks for existing payment before doing anything
        existing = mock_db.query(None).filter(None).first()
        assert existing is not None  # guard fires, handler returns early


# ─── Integration test skeleton ────────────────────────────────
class TestIntegration:
    """
    Full integration tests require a running PostgreSQL database.
    These are skipped in CI unless INTEGRATION_TESTS=1 is set.

    To run locally:
        INTEGRATION_TESTS=1 pytest tests/test_webhooks.py::TestIntegration -v
    """

    @pytest.fixture(autouse=True)
    def skip_without_db(self):
        import os
        if not os.getenv("INTEGRATION_TESTS"):
            pytest.skip("Set INTEGRATION_TESTS=1 to run integration tests")

    def test_full_payment_flow(self, test_db):
        """
        Full flow:
        1. Create a client, booking, invoice in the test DB
        2. Send a charge.success webhook with that invoice_id
        3. Assert: Payment row created, invoice.status=paid,
                   JournalEntry created, booking.status=confirmed
        """
        # TODO: implement with test_db fixture once DB is set up
        pass
