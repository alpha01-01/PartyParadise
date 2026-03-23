from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime
import secrets
import hashlib
from datetime import timedelta, timezone

from app.database import get_db
from app.dependencies import CurrentPortalAccount, require_permission
from app.utils.security import hash_password, verify_password, create_access_token, create_refresh_token

router = APIRouter()

# ============================================================
# Schemas
# ============================================================

class PortalLoginRequest(BaseModel):
    email: EmailStr
    password: str


class PortalSetupRequest(BaseModel):
    password: str


class PortalInquiryRequest(BaseModel):
    subject: str
    service_type: Optional[str] = None
    preferred_date: Optional[date] = None
    venue: Optional[str] = None
    guest_count: Optional[int] = None
    message: str


# ============================================================
# Auth routes
# ============================================================

@router.post("/auth/login")
def portal_login(data: PortalLoginRequest, request: Request, db: Session = Depends(get_db)):
    from app.models.portal import ClientPortalAccount, PortalSession
    from datetime import timezone as tz

    account = db.query(ClientPortalAccount).filter(
        ClientPortalAccount.email == data.email.lower(),
        ClientPortalAccount.is_active == True,
    ).first()

    if not account or not verify_password(data.password, account.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

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


@router.post("/auth/setup/{token}")
def portal_setup(token: str, data: PortalSetupRequest, db: Session = Depends(get_db)):
    """Client sets their password after receiving an invite link."""
    from app.models.portal import ClientPortalAccount

    # In production: look up token from a signing_tokens cache/table
    # For now: token is the account ID (simplified — use signed JWT in production)
    try:
        account_id = UUID(token)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invite token")

    account = db.query(ClientPortalAccount).filter(ClientPortalAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Invite not found")

    account.password_hash = hash_password(data.password)
    account.is_active = True
    db.commit()

    return {"message": "Account activated. You can now log in."}


# ============================================================
# Dashboard
# ============================================================

@router.get("/dashboard")
def portal_dashboard(
    account=Depends(CurrentPortalAccount),
    db: Session = Depends(get_db),
):
    from app.models.bookings import Booking
    from app.models.invoicing import Invoice
    from app.models.portal import PortalNotification
    from datetime import date as today_class

    today = today_class.today()

    upcoming_bookings = (
        db.query(Booking)
        .filter(Booking.client_id == account.client_id, Booking.event_date >= today)
        .order_by(Booking.event_date.asc())
        .limit(3)
        .all()
    )

    unpaid_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.client_id == account.client_id,
            Invoice.status.in_(["sent", "partial"]),
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
    account=Depends(CurrentPortalAccount),
    db: Session = Depends(get_db),
):
    from app.models.bookings import Booking

    bookings = (
        db.query(Booking)
        .filter(Booking.client_id == account.client_id)
        .order_by(Booking.event_date.desc())
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
    account=Depends(CurrentPortalAccount),
    db: Session = Depends(get_db),
):
    from app.models.invoicing import Invoice

    invoices = (
        db.query(Invoice)
        .filter(Invoice.client_id == account.client_id)
        .order_by(Invoice.created_at.desc())
        .all()
    )
    return [
        {
            "id": i.id, "reference": i.reference,
            "total_amount": float(i.total_amount),
            "amount_paid": float(i.amount_paid),
            "amount_due": float(i.total_amount - i.amount_paid),
            "status": i.status, "due_date": i.due_date,
        }
        for i in invoices
    ]


# ============================================================
# Contracts
# ============================================================

@router.get("/contracts")
def portal_contracts(
    account=Depends(CurrentPortalAccount),
    db: Session = Depends(get_db),
):
    from app.models.contracts import Contract

    contracts = (
        db.query(Contract)
        .filter(Contract.client_id == account.client_id)
        .order_by(Contract.created_at.desc())
        .all()
    )
    return [
        {
            "id": c.id, "reference": c.reference, "status": c.status,
            "event_date": c.event_date, "total_amount": float(c.total_amount),
            "sent_at": c.sent_at, "signed_at": c.signed_at,
        }
        for c in contracts
    ]


# ============================================================
# Documents
# ============================================================

@router.get("/documents")
def portal_documents(
    account=Depends(CurrentPortalAccount),
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
    account=Depends(CurrentPortalAccount),
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
    account=Depends(CurrentPortalAccount),
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

@router.post("/inquiries", status_code=201)
def submit_inquiry(
    data: PortalInquiryRequest,
    account=Depends(CurrentPortalAccount),
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

@router.post("/clients/{client_id}/invite", status_code=201)
def invite_client_to_portal(
    client_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("clients:update")),
):
    """
    Create a ClientPortalAccount for a client and send them a welcome email
    with a temporary password.

    If they already have an account, resend the invite with a new temp password.
    """
    from app.models.clients import Client
    from app.models.portal import ClientPortalAccount
    from app.utils.security import hash_password
    from app.services.email import send_portal_invite
    from app.config import settings
    import secrets

    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if not client.email:
        raise HTTPException(status_code=400, detail="Client has no email address on file")

    temp_password = secrets.token_urlsafe(10)
    password_hash = hash_password(temp_password)

    account = db.query(ClientPortalAccount).filter_by(client_id=client_id).first()
    if account:
        # Resend — update password hash
        account.password_hash = password_hash
        account.is_active = True
    else:
        account = ClientPortalAccount(
            client_id=client_id,
            email=client.email,
            password_hash=password_hash,
            is_active=True,
        )
        db.add(account)

    db.commit()

    # Send welcome email (non-blocking)
    try:
        portal_url = f"{settings.PORTAL_URL}/login"
        send_portal_invite(client, temp_password=temp_password, portal_url=portal_url)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Failed to send portal invite: %s", exc)

    return {"message": "Portal invite sent", "email": client.email}
