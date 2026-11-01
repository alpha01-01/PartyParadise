import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime
import secrets
import hashlib
from datetime import timedelta, timezone

from app.database import get_db
from app.schemas.types import Money
from app.utils import rate_limit
from app.dependencies import get_current_portal_account, require_permission
from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_contract_signing_token,
    create_portal_setup_token,
    create_refresh_token,
    decode_token,
    password_token_matches,
    validate_password_strength,
    verify_login_password,
)

router = APIRouter()
logger = logging.getLogger(__name__)

PAYABLE_STATUSES = ("sent", "partial", "overdue")
PORTAL_LIST_LIMIT = 200

# ============================================================
# Schemas
# ============================================================

class PortalLoginRequest(BaseModel):
    email: EmailStr
    password: str


class PortalSetupRequest(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_password_strength(v)


class PortalRefreshRequest(BaseModel):
    refresh_token: str


class PortalInquiryRequest(BaseModel):
    subject: str
    service_type: Optional[str] = None
    preferred_date: Optional[date] = None
    venue: Optional[str] = None
    guest_count: Optional[int] = None
    message: str


class PortalInviteResponse(BaseModel):
    message: str
    email: str
    portal_url: str
    delivery_status: str
    setup_url: Optional[str] = None  # only when the invite could not be emailed


class PortalChangePasswordRequest(PortalSetupRequest):
    current_password: str


class PortalPayRequest(BaseModel):
    amount: Optional[Money] = Field(None, gt=0)  # the full balance when left out


def _invoice_summary(invoice) -> dict:
    return {
        "id": invoice.id,
        "reference": invoice.reference,
        "total_amount": float(invoice.total_amount),
        "amount_paid": float(invoice.amount_paid),
        "amount_due": float(invoice.total_amount - invoice.amount_paid),
        "status": invoice.status,
        "due_date": invoice.due_date,
    }


def _client_invoice(db: Session, account, invoice_id: UUID):
    """An invoice this client may see. Anything else looks like it does not exist."""
    from app.models.invoicing import Invoice

    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.id == invoice_id,
            Invoice.client_id == account.client_id,
            Invoice.status != "draft",
        )
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


# ============================================================
# Auth routes
# ============================================================

@router.post("/auth/login")
def portal_login(data: PortalLoginRequest, request: Request, db: Session = Depends(get_db)):
    from app.models.portal import ClientPortalAccount, PortalSession
    from datetime import timezone as tz

    address = request.client.host if request.client else None
    rate_limit.ensure_allowed("portal-login", data.email, address)

    account = db.query(ClientPortalAccount).filter(
        func.lower(ClientPortalAccount.email) == data.email.lower(),
        ClientPortalAccount.is_active == True,
    ).first()

    if not verify_login_password(data.password, account.password_hash if account else None):
        rate_limit.record_failure("portal-login", data.email, address)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    rate_limit.clear_account("portal-login", data.email)

    access_token = create_access_token(str(account.id), token_type="client")
    refresh_token = create_refresh_token(str(account.id), token_type="client")

    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    db.add(PortalSession(
        portal_account_id=account.id,
        token_hash=token_hash,
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    ))

    account.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@router.post("/auth/logout")
def portal_logout(data: PortalRefreshRequest, db: Session = Depends(get_db)):
    from app.models.portal import PortalSession

    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    db.query(PortalSession).filter(PortalSession.token_hash == token_hash).delete()
    db.commit()
    return {"message": "Logged out successfully"}


@router.post("/auth/refresh")
def portal_refresh(data: PortalRefreshRequest, db: Session = Depends(get_db)):
    from app.models.portal import ClientPortalAccount, PortalSession

    payload = decode_token(data.refresh_token)
    if not payload or not payload.get("refresh") or payload.get("type") != "client":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    session = (
        db.query(PortalSession)
        .filter(
            PortalSession.token_hash == token_hash,
            PortalSession.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Portal session expired or not found")

    account = (
        db.query(ClientPortalAccount)
        .filter(
            ClientPortalAccount.id == session.portal_account_id,
            ClientPortalAccount.is_active == True,
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=401, detail="Portal account inactive")

    access_token = create_access_token(str(account.id), token_type="client")
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/auth/setup/{token}")
def portal_setup(token: str, data: PortalSetupRequest, db: Session = Depends(get_db)):
    """Client sets their password after receiving an invite link."""
    from app.models.portal import ClientPortalAccount

    invalid_link = HTTPException(status_code=400, detail="Invalid or expired invite link")

    payload = decode_token(token)
    if not payload or payload.get("type") != "portal_setup":
        raise invalid_link

    try:
        account_id = UUID(payload.get("sub"))
    except (TypeError, ValueError):
        raise invalid_link

    account = (
        db.query(ClientPortalAccount)
        .filter(
            ClientPortalAccount.id == account_id,
            ClientPortalAccount.is_active == True,
        )
        .first()
    )
    if not account or not password_token_matches(payload, account.password_hash):
        raise invalid_link

    account.password_hash = hash_password(data.password)
    db.commit()

    return {"message": "Account activated. You can now log in."}


@router.post("/auth/change-password")
def portal_change_password(
    data: PortalChangePasswordRequest,
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.portal import PortalSession

    if not verify_password(data.current_password, account.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    account.password_hash = hash_password(data.password)
    db.query(PortalSession).filter(PortalSession.portal_account_id == account.id).delete()
    db.commit()
    return {"message": "Password changed. Please sign in again."}


# ============================================================
# Dashboard
# ============================================================

@router.get("/dashboard")
def portal_dashboard(
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.bookings import Booking
    from app.models.invoicing import Invoice
    from app.models.portal import PortalNotification
    from datetime import date as today_class

    today = today_class.today()

    upcoming_bookings = (
        db.query(Booking)
        .filter(
            Booking.client_id == account.client_id,
            Booking.event_date >= today,
            Booking.status != "cancelled",
        )
        .order_by(Booking.event_date.asc())
        .limit(3)
        .all()
    )

    unpaid_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.client_id == account.client_id,
            Invoice.status.in_(PAYABLE_STATUSES),
        )
        .all()
    )

    unread_count = (
        db.query(PortalNotification)
        .filter(
            PortalNotification.portal_account_id == account.id,
            PortalNotification.is_read == False,
        )
        .count()
    )

    return {
        "upcoming_bookings": [
            {"id": b.id, "reference": b.reference, "event_date": b.event_date, "status": b.status}
            for b in upcoming_bookings
        ],
        "unpaid_invoices_count": len(unpaid_invoices),
        "unpaid_total": float(sum(i.total_amount - i.amount_paid for i in unpaid_invoices)),
        "unread_notifications": unread_count,
    }


# ============================================================
# Bookings
# ============================================================

@router.get("/bookings")
def portal_bookings(
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.bookings import Booking

    bookings = (
        db.query(Booking)
        .filter(Booking.client_id == account.client_id)
        .order_by(Booking.event_date.desc())
        .limit(PORTAL_LIST_LIMIT)
        .all()
    )
    return [
        {
            "id": b.id, "reference": b.reference,
            "service_type": b.service_type, "status": b.status,
            "event_date": b.event_date, "venue_name": b.venue_name,
        }
        for b in bookings
    ]


# ============================================================
# Invoices
# ============================================================

@router.get("/invoices")
def portal_invoices(
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.invoicing import Invoice

    invoices = (
        db.query(Invoice)
        .filter(Invoice.client_id == account.client_id, Invoice.status != "draft")
        .order_by(Invoice.created_at.desc())
        .limit(PORTAL_LIST_LIMIT)
        .all()
    )
    return [_invoice_summary(i) for i in invoices]


@router.get("/invoices/{invoice_id}")
def portal_invoice(
    invoice_id: UUID,
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    invoice = _client_invoice(db, account, invoice_id)
    return {
        **_invoice_summary(invoice),
        "items": [
            {
                "id": item.id,
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": float(item.unit_price),
                "total_price": float(item.total_price),
            }
            for item in invoice.items
        ],
        "payments": [
            {"id": p.id, "amount": float(p.amount), "method": p.method, "paid_at": p.paid_at}
            for p in invoice.payments
            if p.status == "confirmed"
        ],
    }


@router.post("/invoices/{invoice_id}/pay")
def start_invoice_payment(
    invoice_id: UUID,
    data: PortalPayRequest,
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    """Start a Paystack charge. The webhook records the payment once it completes."""
    from app.config import settings
    from app.services.paystack import PaystackError, initialize_transaction

    invoice = _client_invoice(db, account, invoice_id)
    amount_due = invoice.total_amount - invoice.amount_paid
    if invoice.status not in PAYABLE_STATUSES or amount_due <= 0:
        raise HTTPException(status_code=400, detail="This invoice has no balance to pay")

    amount = data.amount if data.amount is not None else amount_due
    if amount > amount_due:
        raise HTTPException(status_code=422, detail="Amount is more than the balance due")

    try:
        authorization_url = initialize_transaction(
            email=account.email,
            amount=amount,
            reference=f"{invoice.reference}-{secrets.token_hex(6)}",
            invoice_id=str(invoice.id),
            callback_url=f"{settings.PORTAL_URL}/invoices/{invoice.id}",
        )
    except PaystackError as exc:
        logger.error("Could not start Paystack charge for %s: %s", invoice.reference, exc)
        raise HTTPException(status_code=503, detail="Online payment is not available right now")

    return {"authorization_url": authorization_url}


# ============================================================
# Contracts
# ============================================================

@router.get("/contracts")
def portal_contracts(
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.contracts import Contract

    contracts = (
        db.query(Contract)
        .filter(Contract.client_id == account.client_id, Contract.status != "draft")
        .order_by(Contract.created_at.desc())
        .limit(PORTAL_LIST_LIMIT)
        .all()
    )
    return [
        {
            "id": c.id, "reference": c.reference, "status": c.status,
            "event_date": c.event_date, "total_amount": float(c.total_amount),
            "sent_at": c.sent_at, "signed_at": c.signed_at,
            "sign_path": (
                f"/contracts/sign/{create_contract_signing_token(str(c.id))}"
                if c.status == "sent"
                else None
            ),
        }
        for c in contracts
    ]


# ============================================================
# Documents
# ============================================================

@router.get("/documents")
def portal_documents(
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.contracts import Document

    docs = (
        db.query(Document)
        .filter(
            Document.client_id == account.client_id,
            Document.is_visible_to_client == True,
        )
        .order_by(Document.created_at.desc())
        .limit(PORTAL_LIST_LIMIT)
        .all()
    )
    return [
        {
            "id": d.id, "name": d.name, "type": d.type,
            "file_url": d.file_url, "mime_type": d.mime_type,
            "created_at": d.created_at,
        }
        for d in docs
    ]


# ============================================================
# Notifications
# ============================================================

@router.get("/notifications")
def portal_notifications(
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.portal import PortalNotification

    notifications = (
        db.query(PortalNotification)
        .filter(PortalNotification.portal_account_id == account.id)
        .order_by(PortalNotification.created_at.desc())
        .limit(50)
        .all()
    )
    return notifications


@router.patch("/notifications/{notification_id}/read")
def mark_read(
    notification_id: UUID,
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.portal import PortalNotification

    notif = db.query(PortalNotification).filter(
        PortalNotification.id == notification_id,
        PortalNotification.portal_account_id == account.id,
    ).first()

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    notif.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Marked as read"}


# ============================================================
# Inquiries
# ============================================================

@router.get("/inquiries")
def list_inquiries(
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.portal import PortalInquiry

    return (
        db.query(PortalInquiry)
        .filter(PortalInquiry.portal_account_id == account.id)
        .order_by(PortalInquiry.created_at.desc())
        .limit(50)
        .all()
    )


@router.post("/inquiries", status_code=201)
def submit_inquiry(
    data: PortalInquiryRequest,
    account=Depends(get_current_portal_account),
    db: Session = Depends(get_db),
):
    from app.models.portal import PortalInquiry

    inquiry = PortalInquiry(
        portal_account_id=account.id,
        client_id=account.client_id,
        subject=data.subject,
        service_type=data.service_type,
        preferred_date=data.preferred_date,
        venue=data.venue,
        guest_count=data.guest_count,
        message=data.message,
        status="new",
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)
    return {"id": inquiry.id, "status": inquiry.status, "message": "Inquiry submitted successfully"}


# ─── Staff: invite a client to the portal ─────────────────────

@router.post("/clients/{client_id}/invite", status_code=201, response_model=PortalInviteResponse)
def invite_client_to_portal(
    client_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("clients:update")),
):
    """
    Create a ClientPortalAccount and email a one-time link to choose a password.
    Inviting again sends a new link and leaves any current password working
    until the link is used.
    """
    from app.models.clients import Client
    from app.models.portal import ClientPortalAccount
    from app.services.email import send_portal_invite
    from app.config import settings

    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if not client.email:
        raise HTTPException(status_code=400, detail="Client has no email address on file")

    account = db.query(ClientPortalAccount).filter_by(client_id=client_id).first()
    if account:
        account.is_active = True
    else:
        account = ClientPortalAccount(
            client_id=client_id,
            email=client.email.lower(),
            password_hash=hash_password(secrets.token_urlsafe(32)),
            is_active=True,
        )
        db.add(account)

    db.commit()

    setup_url = f"{settings.WEB_URL}/portal/setup/{create_portal_setup_token(str(account.id), account.password_hash)}"
    portal_url = f"{settings.PORTAL_URL}/login"
    email_sent = False

    # Send invite (non-blocking)
    try:
        email_sent = send_portal_invite(client, setup_url=setup_url)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Failed to send portal invite: %s", exc)

    return PortalInviteResponse(
        message="Portal invite prepared",
        email=client.email,
        portal_url=portal_url,
        delivery_status="email_sent" if email_sent else "manual_share_required",
        setup_url=None if email_sent else setup_url,
    )


@router.get("/staff/inquiries")
def list_inquiries_for_staff(
    client_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    _=Depends(require_permission("clients:read")),
):
    from app.models.portal import PortalInquiry

    query = db.query(PortalInquiry)
    if client_id:
        query = query.filter(PortalInquiry.client_id == client_id)
    return query.order_by(PortalInquiry.created_at.desc()).limit(100).all()
