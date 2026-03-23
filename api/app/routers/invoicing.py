from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal

from app.database import get_db
from app.dependencies import require_permission
from app.utils.references import generate_reference

router = APIRouter()

# ============================================================
# Schemas
# ============================================================

class InvoiceItemSchema(BaseModel):
    description: str
    quantity: int = 1
    unit_price: Decimal
    total_price: Decimal
    booking_service_id: Optional[UUID] = None

    model_config = {"from_attributes": True}


class CreateInvoiceRequest(BaseModel):
    client_id: UUID
    booking_id: Optional[UUID] = None
    items: List[InvoiceItemSchema]
    discount_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    due_date: Optional[date] = None
    notes: Optional[str] = None


class RecordPaymentRequest(BaseModel):
    amount: Decimal
    method: str
    paid_at: date
    provider_ref: Optional[str] = None
    notes: Optional[str] = None


class InvoiceResponse(BaseModel):
    id: UUID
    client_id: UUID
    booking_id: Optional[UUID]
    reference: str
    status: str
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    amount_due: Decimal
    issued_at: Optional[date]
    due_date: Optional[date]
    created_at: datetime
    client_name: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, inv):
        client_name = None
        if getattr(inv, "client", None):
            first = inv.client.first_name or ""
            last = inv.client.last_name or ""
            client_name = f"{first} {last}".strip() or None
        return cls(
            id=inv.id,
            client_id=inv.client_id,
            booking_id=inv.booking_id,
            reference=inv.reference,
            status=inv.status,
            subtotal=inv.subtotal,
            discount_amount=inv.discount_amount,
            tax_amount=inv.tax_amount,
            total_amount=inv.total_amount,
            amount_paid=inv.amount_paid,
            amount_due=inv.total_amount - inv.amount_paid,
            issued_at=inv.issued_at,
            due_date=inv.due_date,
            created_at=inv.created_at,
            client_name=client_name,
            notes=inv.notes,
        )


class PaymentResponse(BaseModel):
    id: UUID
    invoice_id: UUID
    amount: Decimal
    method: str
    status: str
    provider_ref: Optional[str]
    paid_at: date
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceItemResponse(BaseModel):
    id: UUID
    description: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    booking_service_id: Optional[UUID] = None

    model_config = {"from_attributes": True}


class InvoiceDetailResponse(InvoiceResponse):
    items: List[InvoiceItemResponse] = []


# ============================================================
# Helpers
# ============================================================

def update_invoice_after_payment(db: Session, invoice):
    """Recalculate amount_paid and update invoice status."""
    from app.models.invoicing import Payment
    from sqlalchemy import func

    total_paid = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.invoice_id == invoice.id, Payment.status == "confirmed")
        .scalar()
    ) or Decimal("0")

    invoice.amount_paid = total_paid

    if total_paid >= invoice.total_amount:
        invoice.status = "paid"
    elif total_paid > 0:
        invoice.status = "partial"

    db.commit()


def notify_client_invoice(db: Session, invoice):
    """Fire portal notification if client has a portal account."""
    from app.models.portal import ClientPortalAccount
    from app.models.portal import PortalNotification

    account = db.query(ClientPortalAccount).filter_by(client_id=invoice.client_id, is_active=True).first()
    if account:
        db.add(PortalNotification(
            portal_account_id=account.id,
            type="invoice_issued",
            title="Invoice Ready",
            message=f"Your invoice {invoice.reference} for GHS {invoice.total_amount:,.2f} is ready.",
            action_url=f"/portal/invoices/{invoice.id}",
        ))
        db.commit()


# ============================================================
# Routes
# ============================================================

@router.get("/invoices")
def list_invoices(
    status_filter: str = Query(None, alias="status"),
    client_id: UUID = Query(None),
    overdue: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission("invoices:read")),
):
    from app.models.invoicing import Invoice
    from app.utils.pagination import paginate
    from datetime import date as today_date

    query = db.query(Invoice)
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    if client_id:
        query = query.filter(Invoice.client_id == client_id)
    if overdue:
        query = query.filter(
            Invoice.due_date < today_date.today(),
            Invoice.status.in_(["sent", "partial"]),
        )

    result = paginate(query.order_by(Invoice.created_at.desc()), page, page_size)
    result["items"] = [InvoiceResponse.from_orm(i) for i in result["items"]]
    return result


@router.get("/invoices/{invoice_id}")
def get_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("invoices:read")),
):
    from app.models.invoicing import Invoice

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    base = InvoiceResponse.from_orm(invoice).model_dump()
    items = [InvoiceItemResponse.model_validate(i) for i in invoice.items]
    return InvoiceDetailResponse(**base, items=items)


@router.post("/invoices", status_code=201)
def create_invoice(
    data: CreateInvoiceRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("invoices:create")),
):
    from app.models.invoicing import Invoice, InvoiceItem

    subtotal = sum(item.total_price for item in data.items)
    total = subtotal - data.discount_amount + data.tax_amount

    invoice = Invoice(
        client_id=data.client_id,
        booking_id=data.booking_id,
        created_by=current_user.id,
        reference=generate_reference("INV", Invoice, db),
        status="draft",
        subtotal=subtotal,
        discount_amount=data.discount_amount,
        tax_amount=data.tax_amount,
        total_amount=total,
        amount_paid=Decimal("0"),
        due_date=data.due_date,
        notes=data.notes,
    )
    db.add(invoice)
    db.flush()

    for item in data.items:
        db.add(InvoiceItem(invoice_id=invoice.id, **item.model_dump()))

    db.commit()
    db.refresh(invoice)
    return InvoiceResponse.from_orm(invoice)


@router.post("/invoices/from-booking/{booking_id}", status_code=201)
def invoice_from_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("invoices:create")),
):
    """Auto-generate invoice from all booking_services on a booking."""
    from app.models.bookings import Booking, BookingService
    from app.models.invoicing import Invoice, InvoiceItem

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    services = db.query(BookingService).filter(BookingService.booking_id == booking_id).all()
    if not services:
        raise HTTPException(status_code=400, detail="Booking has no services to invoice")

    subtotal = sum(s.price for s in services)
    invoice = Invoice(
        client_id=booking.client_id,
        booking_id=booking_id,
        created_by=current_user.id,
        reference=generate_reference("INV", Invoice, db),
        status="draft",
        subtotal=subtotal,
        discount_amount=Decimal("0"),
        tax_amount=Decimal("0"),
        total_amount=subtotal,
        amount_paid=Decimal("0"),
    )
    db.add(invoice)
    db.flush()

    for svc in services:
        db.add(InvoiceItem(
            invoice_id=invoice.id,
            booking_service_id=svc.id,
            description=svc.service,
            quantity=1,
            unit_price=svc.price,
            total_price=svc.price,
        ))

    db.commit()
    db.refresh(invoice)
    return InvoiceResponse.from_orm(invoice)


@router.delete("/invoices/{invoice_id}", status_code=200)
def delete_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("invoices:delete")),
):
    from app.models.invoicing import Invoice, Payment

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.status not in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft or cancelled invoices can be deleted")

    payments = db.query(Payment).filter(Payment.invoice_id == invoice_id).count()
    if payments > 0:
        raise HTTPException(status_code=400, detail="Cannot delete invoice with payments")

    db.delete(invoice)
    db.commit()
    return {"message": "Invoice deleted"}


@router.patch("/invoices/{invoice_id}/send")
def send_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("invoices:update")),
):
    from app.models.invoicing import Invoice
    from datetime import date as today_date

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice.status = "sent"
    invoice.issued_at = today_date.today()
    db.commit()

    notify_client_invoice(db, invoice)

    # Send email with PDF attachment
    try:
        from app.models.clients import Client
        from app.models.invoicing import InvoiceItem, Payment as Pmt
        from app.services.pdf import generate_invoice_pdf
        from app.services.email import send_invoice_email
        client   = db.query(Client).filter(Client.id == invoice.client_id).first()
        items    = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice_id).all()
        payments = db.query(Pmt).filter(Pmt.invoice_id == invoice_id, Pmt.status == "confirmed").all()
        if client and client.email:
            pdf_bytes = generate_invoice_pdf(invoice, client, items, payments)
            send_invoice_email(invoice, client, pdf_bytes=pdf_bytes)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Failed to send invoice email: %s", exc)

    return InvoiceResponse.from_orm(invoice)


@router.post("/invoices/{invoice_id}/payments", status_code=201)
def record_payment(
    invoice_id: UUID,
    data: RecordPaymentRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("invoices:update")),
):
    from app.models.invoicing import Invoice, Payment
    from app.utils.references import generate_reference

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    payment = Payment(
        invoice_id=invoice_id,
        received_by=current_user.id,
        reference=generate_reference("PAY", Payment, db),
        amount=data.amount,
        method=data.method,
        status="confirmed",
        provider_ref=data.provider_ref,
        paid_at=data.paid_at,
        notes=data.notes,
    )
    db.add(payment)
    db.flush()

    update_invoice_after_payment(db, invoice)

    # Auto-create journal entry
    from app.models.accounting import JournalEntry
    db.add(JournalEntry(
        created_by=current_user.id,
        type="income",
        description=f"Payment for invoice {invoice.reference}",
        amount=data.amount,
        source_type="payment",
        source_id=payment.id,
        entry_date=data.paid_at,
    ))

    # Notify client
    from app.models.portal import ClientPortalAccount, PortalNotification
    account = db.query(ClientPortalAccount).filter_by(client_id=invoice.client_id, is_active=True).first()
    if account:
        db.add(PortalNotification(
            portal_account_id=account.id,
            type="payment_received",
            title="Payment Received",
            message=f"We received your payment of GHS {data.amount:,.2f} for {invoice.reference}.",
        ))

    db.commit()
    db.refresh(payment)

    # Send payment confirmation email
    try:
        from app.models.clients import Client
        from app.services.email import send_payment_confirmation
        client = db.query(Client).filter(Client.id == invoice.client_id).first()
        if client and client.email:
            send_payment_confirmation(payment, invoice, client)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Failed to send payment confirmation: %s", exc)

    return PaymentResponse.model_validate(payment)


@router.get("/invoices/{invoice_id}/payments")
def list_payments(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("invoices:read")),
):
    from app.models.invoicing import Payment
    payments = db.query(Payment).filter(Payment.invoice_id == invoice_id).all()
    return [PaymentResponse.model_validate(p) for p in payments]
