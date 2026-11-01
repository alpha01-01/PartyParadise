"""
The one path for putting money on an invoice, used by staff and webhooks.

Everything here joins the caller's transaction. Callers lock the invoice with
get_invoice_for_update, then commit once, so a payment can never exist without
its ledger entry.
"""
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import AccountPeriod, JournalEntry
from app.models.invoicing import Invoice, Payment
from app.models.portal import ClientPortalAccount, PortalNotification
from app.utils.references import generate_reference

PAYMENT_METHODS = (
    "momo_mtn",
    "momo_vodafone",
    "momo_airteltigo",
    "bank_transfer",
    "cash",
    "paystack",
    "cheque",
)


def validate_payment_method(method: str) -> None:
    if method not in PAYMENT_METHODS:
        raise HTTPException(status_code=422, detail=f"Unknown payment method '{method}'")


def get_invoice_for_update(db: Session, invoice_id) -> Optional[Invoice]:
    return db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()


def ensure_period_open(db: Session, entry_date: date) -> Optional[AccountPeriod]:
    """The accounting period for a date. Closed periods cannot change."""
    period = (
        db.query(AccountPeriod)
        .filter(AccountPeriod.start_date <= entry_date, AccountPeriod.end_date >= entry_date)
        .first()
    )
    if period and period.status != "open":
        raise HTTPException(status_code=400, detail=f"Accounting period {period.label} is closed")
    return period


def add_income_journal(
    db: Session,
    payment: Payment,
    description: str,
    created_by: Optional[UUID],
) -> None:
    period = ensure_period_open(db, payment.paid_at)
    db.add(JournalEntry(
        period_id=period.id if period else None,
        created_by=created_by,
        reference=f"JE-{payment.reference}",
        type="income",
        description=description,
        amount=payment.amount,
        source_type="payment",
        source_id=payment.id,
        entry_date=payment.paid_at,
    ))


def record_invoice_payment(
    db: Session,
    invoice: Invoice,
    *,
    amount: Decimal,
    method: str,
    paid_at: date,
    source: str,
    received_by: Optional[UUID] = None,
    provider_ref: Optional[str] = None,
    notes: Optional[str] = None,
) -> Payment:
    validate_payment_method(method)

    if paid_at > date.today():
        raise HTTPException(status_code=422, detail="Payment date cannot be in the future")

    # Money already taken online must still land on a draft invoice
    payable = ("sent", "partial", "overdue") + (("draft",) if source == "webhook" else ())
    if invoice.status not in payable:
        raise HTTPException(status_code=400, detail=f"Cannot record a payment on a {invoice.status} invoice")

    if provider_ref and db.query(Payment).filter(Payment.provider_ref == provider_ref).first():
        # 409 tells the Next.js relay: "already processed, stop retrying"
        raise HTTPException(status_code=409, detail=f"Payment provider_ref {provider_ref!r} already exists")

    amount_due = invoice.total_amount - invoice.amount_paid
    if amount > amount_due:
        raise HTTPException(
            status_code=422,
            detail=f"Payment {amount} exceeds outstanding balance {amount_due} on invoice {invoice.reference}",
        )

    payment = Payment(
        invoice_id=invoice.id,
        received_by=received_by,
        reference=generate_reference("PAY", Payment, db),
        amount=amount,
        method=method,
        status="confirmed",
        source=source,
        provider_ref=provider_ref,
        paid_at=paid_at,
        notes=notes,
    )
    db.add(payment)
    db.flush()

    total_paid = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.invoice_id == invoice.id, Payment.status == "confirmed")
        .scalar()
    ) or Decimal("0")
    invoice.amount_paid = total_paid
    invoice.status = "paid" if total_paid >= invoice.total_amount else "partial"

    add_income_journal(
        db,
        payment,
        f"Payment received - {invoice.reference} via {method.replace('_', ' ').title()}",
        received_by,
    )
    _notify_client(db, invoice, payment)
    return payment


def _notify_client(db: Session, invoice: Invoice, payment: Payment) -> None:
    account = (
        db.query(ClientPortalAccount)
        .filter_by(client_id=invoice.client_id, is_active=True)
        .first()
    )
    if not account:
        return

    balance = invoice.total_amount - invoice.amount_paid
    status_message = (
        "Your balance is now fully settled."
        if invoice.status == "paid"
        else f"Outstanding balance: GHS {balance:,.2f}."
    )
    db.add(PortalNotification(
        portal_account_id=account.id,
        type="payment_received",
        title="Payment received",
        message=(
            f"We've received your payment of GHS {payment.amount:,.2f} "
            f"for invoice {invoice.reference}. {status_message}"
        ),
        action_url=f"/portal/invoices/{invoice.id}",
    ))
