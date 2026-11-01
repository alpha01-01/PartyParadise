"""
app/routers/webhooks.py

Internal endpoint called by the Next.js Paystack webhook handler.
Every request must carry a valid HMAC signature from the webhook relay.
Requests are rejected while INTERNAL_WEBHOOK_SECRET is not configured.

Flow:
  Paystack  →  Next.js /api/webhooks/paystack  →  POST /invoices/{id}/payments (here)
  This file handles:
    1. Idempotency check (reject duplicate webhook deliveries)
    2. Recording the Payment row
    3. Updating invoice.amount_paid and invoice.status
    4. Writing a JournalEntry on the income side
    5. Sending a PortalNotification to the client
    All in a single atomic DB transaction.
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import time
import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.types import Money
from app.services.payments import get_invoice_for_update, record_invoice_payment
from app.services.paystack import confirm_charge
from app.models import (
    Invoice,
    Payment,
    JournalEntry,
    AccountPeriod,
    PortalNotification,
    ClientPortalAccount,
)
from app.config import settings
from app.utils.references import generate_reference

router = APIRouter(tags=["webhooks-internal"])


# ─── Request schema ───────────────────────────────────────────
class WebhookPaymentIn(BaseModel):
    amount:       Money     = Field(..., gt=0, description="Amount in GHS")
    method:       str         = Field(..., description="PaymentMethod enum value")
    paid_at:      date        = Field(..., description="ISO date YYYY-MM-DD")
    provider_ref: Optional[str] = None
    notes:        Optional[str] = None


# ─── Internal HMAC verification ───────────────────────────────
def _verify_internal_sig(
    invoice_id: str,
    amount: Money,
    timestamp: str,
    signature: str,
) -> bool:
    """
    Validates the HMAC-SHA256 written by Next.js before forwarding to us.
    Prevents arbitrary callers from recording payments directly.
    """
    secret = settings.INTERNAL_WEBHOOK_SECRET
    if not secret:
        return False  # Fail closed: never accept unsigned payments

    # Reject requests older than 30 seconds
    try:
        ts_ms = int(timestamp)
        if abs(time.time() * 1000 - ts_ms) > 30_000:
            return False
    except (ValueError, TypeError):
        return False

    expected = _hmac.new(
        secret.encode(),
        f"{timestamp}.{invoice_id}.{amount:.2f}".encode(),  # relay signs toFixed(2)
        hashlib.sha256,
    ).hexdigest()

    return _hmac.compare_digest(expected.encode(), signature.encode())


# ─── Endpoint ─────────────────────────────────────────────────
@router.post(
    "/invoices/{invoice_id}/payments",
    status_code=status.HTTP_201_CREATED,
    summary="Record Paystack payment (internal webhook relay)",
)
def record_webhook_payment(
    invoice_id: str = Path(...),
    payload: WebhookPaymentIn = ...,
    x_source: str               = Header(default="", alias="X-Source"),
    x_internal_timestamp: str   = Header(default="", alias="X-Internal-Timestamp"),
    x_internal_signature: str   = Header(default="", alias="X-Internal-Signature"),
    db: Session                 = Depends(get_db),
):
    # 1. Gate: only our own webhook relay is allowed
    if x_source != "paystack-webhook":
        raise HTTPException(status_code=403, detail="Forbidden")

    # 2. Verify internal HMAC
    if not _verify_internal_sig(
        invoice_id,
        payload.amount,
        x_internal_timestamp,
        x_internal_signature,
    ):
        raise HTTPException(status_code=401, detail="Invalid internal signature")

    # 3. Row lock prevents concurrent double-recording
    invoice: Optional[Invoice] = get_invoice_for_update(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # 4. Paystack's own record must agree with what the relay told us
    if not payload.provider_ref:
        raise HTTPException(status_code=422, detail="provider_ref is required")
    confirm_charge(payload.provider_ref, payload.amount, invoice_id)

    # 5. Payment, invoice totals, ledger and client notification
    try:
        payment = record_invoice_payment(
            db,
            invoice,
            amount=payload.amount,
            method=payload.method,
            paid_at=payload.paid_at,
            source="webhook",
            provider_ref=payload.provider_ref,
            notes=payload.notes,
        )
        db.commit()
    except IntegrityError:
        # The same event arrived for another invoice at the same moment
        db.rollback()
        raise HTTPException(status_code=409, detail="Payment already recorded")
    db.refresh(payment)
    remaining = invoice.total_amount - invoice.amount_paid

    return {
        "payment_id":     str(payment.id),
        "payment_ref":    payment.reference,
        "invoice_id":     str(invoice.id),
        "invoice_ref":    invoice.reference,
        "invoice_status": invoice.status,
        "amount_paid":    float(invoice.amount_paid),
        "amount_due":     float(remaining) if remaining > 0 else 0.0,
    }
