"""
app/routers/webhooks.py

Internal endpoint called by the Next.js Paystack webhook handler.
NOT public — only reachable from the webhook relay.

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
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
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
    amount:       Decimal     = Field(..., gt=0, description="Amount in GHS")
    method:       str         = Field(..., description="PaymentMethod enum value")
    paid_at:      str         = Field(..., description="ISO date YYYY-MM-DD")
    provider_ref: Optional[str] = None
    notes:        Optional[str] = None


# ─── Internal HMAC verification ───────────────────────────────
def _verify_internal_sig(
    invoice_id: str,
    amount: Decimal,
    timestamp: str,
    signature: str,
) -> bool:
    """
    Validates the HMAC-SHA256 written by Next.js before forwarding to us.
    Prevents arbitrary callers from recording payments directly.
    """
    secret = getattr(settings, "INTERNAL_WEBHOOK_SECRET", None)
    if not secret:
        return True  # Skip verification when not configured (local dev)

    # Reject requests older than 30 seconds
    try:
        ts_ms = int(timestamp)
        if abs(time.time() * 1000 - ts_ms) > 30_000:
            return False
    except (ValueError, TypeError):
        return False

    expected = _hmac.new(
        secret.encode(),
        f"{timestamp}.{invoice_id}.{float(amount)}".encode(),
        hashlib.sha256,
    ).hexdigest()

    return _hmac.compare_digest(expected, signature)


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

    # 2. Verify internal HMAC (when INTERNAL_WEBHOOK_SECRET is configured)
    if getattr(settings, "INTERNAL_WEBHOOK_SECRET", None):
        if not _verify_internal_sig(
            invoice_id,
            payload.amount,
            x_internal_timestamp,
            x_internal_signature,
        ):
            raise HTTPException(status_code=401, detail="Invalid internal signature")

    # 3. Load invoice — row-level lock prevents concurrent double-recording
    invoice: Optional[Invoice] = (
        db.query(Invoice)
        .filter(Invoice.id == invoice_id)
        .with_for_update()
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # 4. Idempotency — Paystack can send the same event multiple times
    if payload.provider_ref:
        duplicate = (
            db.query(Payment)
            .filter(Payment.provider_ref == payload.provider_ref)
            .first()
        )
        if duplicate:
            # 409 tells the Next.js relay: "already processed, stop retrying"
            raise HTTPException(
                status_code=409,
                detail=f"Payment provider_ref {payload.provider_ref!r} already exists",
            )

    # 5. Sanity-check amount
    amount_due = (invoice.total_amount or Decimal("0")) - (invoice.amount_paid or Decimal("0"))
    if payload.amount > amount_due:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Payment {payload.amount} exceeds outstanding balance {amount_due} "
                f"on invoice {invoice.reference}"
            ),
        )

    # ── Single atomic transaction from here ──────────────────

    # 6. Payment record
    payment = Payment(
        id           = uuid.uuid4(),
        invoice_id   = invoice.id,
        received_by  = None,           # system — no staff user involved
        reference    = generate_reference("PAY", Payment, db),
        amount       = payload.amount,
        method       = payload.method,
        status       = "confirmed",
        provider_ref = payload.provider_ref,
        paid_at      = payload.paid_at,
        notes        = payload.notes,
    )
    db.add(payment)

    # 7. Update invoice totals
    new_paid  = (invoice.amount_paid or Decimal("0")) + payload.amount
    remaining = invoice.total_amount - new_paid
    invoice.amount_paid = new_paid
    invoice.status = "paid" if remaining <= 0 else "partial"

    # 8. Journal entry (income side)
    open_period: Optional[AccountPeriod] = (
        db.query(AccountPeriod)
        .filter(AccountPeriod.status == "open")
        .order_by(AccountPeriod.start_date.desc())
        .first()
    )
    journal = JournalEntry(
        id          = uuid.uuid4(),
        period_id   = open_period.id if open_period else None,
        created_by  = None,
        reference   = f"JE-{payment.reference}",
        type        = "income",
        description = (
            f"Payment received — {invoice.reference} "
            f"via {payload.method.replace('_', ' ').title()}"
        ),
        amount      = payload.amount,
        source_type = "payment",
        source_id   = payment.id,
        entry_date  = payload.paid_at,
    )
    db.add(journal)

    # 9. Portal notification — let the client know their payment landed
    portal_account: Optional[ClientPortalAccount] = (
        db.query(ClientPortalAccount)
        .filter(ClientPortalAccount.client_id == invoice.client_id)
        .first()
    )
    if portal_account:
        amount_fmt = f"GHS {float(payload.amount):,.2f}"
        status_msg = (
            "Your balance is now fully settled."
            if invoice.status == "paid"
            else f"Outstanding balance: GHS {float(remaining):,.2f}."
        )
        db.add(PortalNotification(
            id                = uuid.uuid4(),
            portal_account_id = portal_account.id,
            type              = "payment_received",
            title             = "Payment received ✓",
            message           = (
                f"We've received your payment of {amount_fmt} "
                f"for invoice {invoice.reference}. {status_msg}"
            ),
            action_url        = f"/portal/invoices/{invoice.id}",
        ))

    # 10. Commit everything
    db.commit()
    db.refresh(payment)

    return {
        "payment_id":     str(payment.id),
        "payment_ref":    payment.reference,
        "invoice_id":     str(invoice.id),
        "invoice_ref":    invoice.reference,
        "invoice_status": invoice.status,
        "amount_paid":    float(invoice.amount_paid),
        "amount_due":     float(remaining) if remaining > 0 else 0.0,
    }
