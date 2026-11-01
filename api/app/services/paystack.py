"""
Paystack's REST API: starting a charge, and confirming one before it is recorded.
"""
import logging
from decimal import Decimal

import httpx
from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger(__name__)

CURRENCY = "GHS"
TIMEOUT_SECONDS = 15


class PaystackError(Exception):
    pass


def to_pesewas(amount: Decimal) -> int:
    return int((amount * 100).to_integral_value())


def _request(method: str, path: str, **kwargs) -> dict:
    if not settings.PAYSTACK_SECRET_KEY:
        raise PaystackError("PAYSTACK_SECRET_KEY is not set")
    try:
        response = httpx.request(
            method,
            f"{settings.PAYSTACK_API_URL}{path}",
            headers={"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"},
            timeout=TIMEOUT_SECONDS,
            **kwargs,
        )
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise PaystackError(f"Could not reach Paystack: {exc}") from exc

    if response.status_code >= 400 or not body.get("status"):
        raise PaystackError(body.get("message") or f"Paystack returned {response.status_code}")
    return body["data"]


def initialize_transaction(
    *,
    email: str,
    amount: Decimal,
    reference: str,
    invoice_id: str,
    callback_url: str,
) -> str:
    """Start a charge and return the page the client pays on."""
    data = _request(
        "POST",
        "/transaction/initialize",
        json={
            "email": email,
            "amount": to_pesewas(amount),
            "currency": CURRENCY,
            "reference": reference,
            "callback_url": callback_url,
            "metadata": {"invoice_id": invoice_id},
        },
    )
    return data["authorization_url"]


def confirm_charge(reference: str, amount: Decimal, invoice_id: str) -> None:
    """Ask Paystack directly that this charge happened as the webhook claims."""
    try:
        data = _request("GET", f"/transaction/verify/{reference}")
    except PaystackError as exc:
        logger.error("Could not verify Paystack charge %s: %s", reference, exc)
        raise HTTPException(status_code=502, detail="Could not verify the payment with Paystack")

    metadata = data.get("metadata") or {}
    problems = [
        name
        for name, ok in (
            ("status", data.get("status") == "success"),
            ("currency", data.get("currency") == CURRENCY),
            ("amount", data.get("amount") == to_pesewas(amount)),
            ("invoice", metadata.get("invoice_id") == invoice_id),
        )
        if not ok
    ]
    if problems:
        logger.error("Paystack charge %s failed checks: %s", reference, ", ".join(problems))
        raise HTTPException(status_code=422, detail="Payment does not match Paystack's record")
