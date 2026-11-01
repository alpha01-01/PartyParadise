import logging

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import extract, func, or_
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal

from app.database import get_db
from app.schemas.types import Money
from app.dependencies import require_permission
from app.services.payments import get_invoice_for_update, record_invoice_payment
from app.utils.audit import record_audit
from app.utils.references import generate_reference
from app.utils.shop_sales import display_notes

router = APIRouter()
logger = logging.getLogger(__name__)

# ============================================================
# Schemas
# ============================================================

class InvoiceItemSchema(BaseModel):
    description: str
    quantity: int = Field(1, ge=1)
    unit_price: Money = Field(..., ge=0)
    total_price: Optional[Money] = None
    booking_service_id: Optional[UUID] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def line_total_must_match(self):
        expected = self.unit_price * self.quantity
        if self.total_price is not None and self.total_price != expected:
            raise ValueError(f"Line total for '{self.description}' should be {expected}")
        self.total_price = expected
        return self


class CreateInvoiceRequest(BaseModel):
    client_id: UUID
    booking_id: Optional[UUID] = None
    items: List[InvoiceItemSchema] = Field(..., min_length=1)
    discount_amount: Money = Field(Decimal("0"), ge=0)
    tax_amount: Money = Field(Decimal("0"), ge=0)
    due_date: Optional[date] = None
    notes: Optional[str] = None


class RecordPaymentRequest(BaseModel):
    amount: Money = Field(..., gt=0)
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
    subtotal: Money
    discount_amount: Money
    tax_amount: Money
    total_amount: Money
    amount_paid: Money
    amount_due: Money
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
            notes=display_notes(inv.notes),
        )


class PaymentResponse(BaseModel):
    id: UUID
    invoice_id: UUID
    amount: Money
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
    unit_price: Money
    total_price: Money
    booking_service_id: Optional[UUID] = None

    model_config = {"from_attributes": True}


class InvoiceDetailResponse(InvoiceResponse):
    items: List[InvoiceItemResponse] = []


# ============================================================
# Helpers
# ============================================================

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

def mark_overdue_invoices(db: Session) -> None:
    from app.models.invoicing import Invoice

    updated = (
        db.query(Invoice)
        .filter(Invoice.due_date < date.today(), Invoice.status.in_(["sent", "partial"]))
        .update({Invoice.status: "overdue"}, synchronize_session=False)
    )
    if updated:
        db.commit()


@router.get("/invoices/stats")
def invoice_stats(
    db: Session = Depends(get_db),
    _=Depends(require_permission("invoices:read")),
):
    """Totals across every invoice, not just the page on screen."""
    from app.models.invoicing import Invoice, Payment

    mark_overdue_invoices(db)

    def open_totals(*statuses):
        count, due = (
            db.query(func.count(Invoice.id), func.sum(Invoice.total_amount - Invoice.amount_paid))
            .filter(Invoice.status.in_(statuses))
            .one()
        )
        return count, float(due or 0)

    outstanding_count, outstanding = open_totals("sent", "partial", "overdue")
    overdue_count, overdue = open_totals("overdue")
    month_start = date.today().replace(day=1)
    collected = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.status == "confirmed", Payment.paid_at >= month_start)
        .scalar()
    )

    return {
        "outstanding": outstanding,
        "outstanding_count": outstanding_count,
        "overdue": overdue,
        "overdue_count": overdue_count,
        "collected_this_month": float(collected or 0),
        "drafts": db.query(Invoice).filter(Invoice.status == "draft").count(),
    }


@router.get("/invoices")
def list_invoices(
    status_filter: str = Query(None, alias="status"),
    client_id: UUID = Query(None),
    overdue: bool = Query(False),
    search: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission("invoices:read")),
):
    from app.models.invoicing import Invoice
    from app.utils.pagination import paginate
    from app.models.clients import Client
    from datetime import date as today_date

    mark_overdue_invoices(db)

    query = db.query(Invoice).options(selectinload(Invoice.client))
    if search:
        needle = f"%{search.strip()}%"
        query = query.join(Client, Client.id == Invoice.client_id).filter(
            or_(
                Invoice.reference.ilike(needle),
                (Client.first_name + " " + Client.last_name).ilike(needle),
            )
        )
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    if client_id:
        query = query.filter(Invoice.client_id == client_id)
    if overdue:
        query = query.filter(
            Invoice.due_date < today_date.today(),
            Invoice.status.in_(["sent", "partial", "overdue"]),
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
    if total < 0:
        raise HTTPException(status_code=422, detail="Discount cannot be more than the invoice total")

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
    import logging

    logger = logging.getLogger(__name__)

    try:
        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")

        existing_invoice = (
            db.query(Invoice)
            .filter(Invoice.booking_id == booking_id)
            .order_by(Invoice.created_at.desc())
            .first()
        )
        if existing_invoice:
            return InvoiceResponse.from_orm(existing_invoice)

        services = db.query(BookingService).filter(BookingService.booking_id == booking_id).all()
        if not services:
            raise HTTPException(status_code=400, detail="Booking has no services to invoice")

        subtotal = sum((s.price or Decimal("0")) for s in services)
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
                description=svc.service,
                quantity=1,
                unit_price=svc.price,
                total_price=svc.price,
            ))

        db.commit()
        db.refresh(invoice)
        return InvoiceResponse.from_orm(invoice)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to generate invoice from booking %s", booking_id)
        raise HTTPException(status_code=500, detail="Could not generate the invoice")


@router.delete("/invoices/{invoice_id}", status_code=200)
def delete_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("invoices:delete")),
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

    record_audit(
        db,
        user_id=current_user.id,
        action="delete",
        module="invoices",
        entity_type="invoice",
        entity_id=invoice.id,
    )
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
    if invoice.status in ("paid", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot send a {invoice.status} invoice")

    # Re-sending an open invoice repeats the email and keeps its payment state
    if invoice.status == "draft":
        invoice.status = "sent"
        invoice.issued_at = today_date.today()
        db.commit()

    notify_client_invoice(db, invoice)

    # Send email, with the PDF attached when it can be generated
    email_sent = False
    try:
        from app.models.clients import Client
        from app.models.invoicing import InvoiceItem, Payment as Pmt
        from app.services.pdf import generate_invoice_pdf
        from app.services.email import send_invoice_email
        client   = db.query(Client).filter(Client.id == invoice.client_id).first()
        items    = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice_id).all()
        payments = db.query(Pmt).filter(Pmt.invoice_id == invoice_id, Pmt.status == "confirmed").all()
        if client and client.email:
            try:
                pdf_bytes = generate_invoice_pdf(invoice, client, items, payments)
            except Exception:
                logger.exception("Could not generate PDF for invoice %s", invoice.reference)
                pdf_bytes = None
            email_sent = send_invoice_email(invoice, client, pdf_bytes=pdf_bytes)
    except Exception as exc:
        logger.exception("Failed to send invoice email: %s", exc)

    return {**InvoiceResponse.from_orm(invoice).model_dump(mode="json"), "email_sent": email_sent}


@router.post("/invoices/{invoice_id}/payments", status_code=201)
def record_payment(
    invoice_id: UUID,
    data: RecordPaymentRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("invoices:update")),
):
    invoice = get_invoice_for_update(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    payment = record_invoice_payment(
        db,
        invoice,
        amount=data.amount,
        method=data.method,
        paid_at=data.paid_at,
        source="staff",
        received_by=current_user.id,
        provider_ref=data.provider_ref,
        notes=data.notes,
    )
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
