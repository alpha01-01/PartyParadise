from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.dependencies import require_permission

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────

class CreateContractRequest(BaseModel):
    booking_id: UUID
    template_id: Optional[UUID] = None
    special_terms: Optional[str] = None
    deposit_amount: Optional[Decimal] = None


class ContractResponse(BaseModel):
    id: UUID
    booking_id: UUID
    client_id: UUID
    reference: str
    status: str
    client_name: str
    event_date: date
    venue: Optional[str]
    total_amount: Decimal
    deposit_amount: Optional[Decimal]
    signed_at: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}


class SignContractRequest(BaseModel):
    signature_data: str     # typed name or base64 PNG from canvas


# ─── Routes ───────────────────────────────────────────────────

@router.get("")
def list_contracts(
    status: str = Query(None),
    client_id: UUID = Query(None),
    booking_id: UUID = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission("contracts:read")),
):
    from app.models.contracts import Contract
    from app.utils.pagination import paginate

    query = db.query(Contract)

    if status:
        query = query.filter(Contract.status == status)
    if client_id:
        query = query.filter(Contract.client_id == client_id)
    if booking_id:
        query = query.filter(Contract.booking_id == booking_id)

    result = paginate(query.order_by(Contract.created_at.desc()), page, page_size)
    return result


@router.get("/{contract_id}")
def get_contract(
    contract_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("contracts:read")),
):
    from app.models.contracts import Contract

    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


@router.post("", status_code=201)
def create_contract(
    data: CreateContractRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("contracts:create")),
):
    """
    Generate a contract from a booking.
    Pulls client info, event details, and services from the booking.
    Fills template body with those values.
    """
    from app.models.bookings import Booking, BookingService
    from app.models.clients import Client
    from app.models.contracts import Contract, ContractTemplate
    from app.utils.references import generate_reference

    booking = db.query(Booking).filter(Booking.id == data.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    client = db.query(Client).filter(Client.id == booking.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Get template — use service_type-specific or first active
    template = None
    if data.template_id:
        template = db.query(ContractTemplate).filter(ContractTemplate.id == data.template_id).first()
    if not template:
        template = (
            db.query(ContractTemplate)
            .filter(
                ContractTemplate.is_active == True,
                (ContractTemplate.service_type == booking.service_type) |
                (ContractTemplate.service_type == None)
            )
            .first()
        )

    if not template:
        raise HTTPException(status_code=404, detail="No contract template found")

    # Calculate total from booking services
    services = db.query(BookingService).filter(BookingService.booking_id == booking.id).all()
    total = sum(s.price for s in services)
    deposit = data.deposit_amount or (total * Decimal("0.5"))

    # Fill template placeholders
    client_name = f"{client.first_name} {client.last_name}"
    body = _fill_template(template.body, {
        "CLIENT_NAME":    client_name,
        "CLIENT_PHONE":   client.phone or "",
        "EVENT_DATE":     str(booking.event_date),
        "VENUE":          booking.venue_name or "",
        "SERVICE_TYPE":   booking.service_type.replace("_", " ").title(),
        "TOTAL_AMOUNT":   f"GHS {total:,.2f}",
        "DEPOSIT_AMOUNT": f"GHS {deposit:,.2f}",
        "BUSINESS_NAME":  "PartyParadise",
    })

    if data.special_terms:
        body += f"\n\nSPECIAL TERMS\n{data.special_terms}"

    contract = Contract(
        booking_id=data.booking_id,
        client_id=booking.client_id,
        template_id=template.id,
        created_by=current_user.id,
        reference=generate_reference("CT", Contract, db),
        status="draft",
        body=body,
        client_name=client_name,
        client_phone=client.phone,
        event_date=booking.event_date,
        venue=booking.venue_name,
        total_amount=total,
        deposit_amount=deposit,
        special_terms=data.special_terms,
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


@router.patch("/{contract_id}/send")
def send_contract(
    contract_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("contracts:update")),
):
    """
    Mark contract as sent and return the signing URL.
    TODO: send actual email/WhatsApp with the link.
    """
    from app.models.contracts import Contract
    from app.config import settings
    from datetime import datetime, timezone

    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    if contract.status not in ("draft",):
        raise HTTPException(status_code=400, detail=f"Cannot send contract with status '{contract.status}'")

    contract.status = "sent"
    contract.sent_at = datetime.now(timezone.utc)
    db.commit()

    signing_url = f"{settings.WEB_URL}/contracts/sign/{contract.id}"

    # Email the signing link to the client
    try:
        from app.models.clients import Client
        from app.services.email import send_contract_email
        from app.services.pdf import generate_contract_pdf
        client = db.query(Client).filter(Client.id == contract.client_id).first()
        if client and client.email:
            pdf_bytes = generate_contract_pdf(contract)
            send_contract_email(contract, client, signing_url=signing_url, pdf_bytes=pdf_bytes)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Failed to send contract email: %s", exc)

    return {
        "message": "Contract sent",
        "reference": contract.reference,
        "signing_url": signing_url,
        "status": contract.status,
    }


# ─── Public signing endpoints (no auth) ───────────────────────

@router.get("/sign/{token}")
def get_contract_for_signing(
    token: str,
    db: Session = Depends(get_db),
    # NOTE: No require_permission here — this is a public endpoint
):
    """
    Public: return contract data for client to review before signing.
    Token is the contract UUID (simple for now; can use signed JWT token later).
    """
    from app.models.contracts import Contract

    try:
        contract_id = UUID(token)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid signing link")

    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    # Return different status info depending on contract state
    if contract.status == "signed":
        return {
            "reference": contract.reference,
            "client_name": contract.client_name,
            "event_date": str(contract.event_date),
            "venue": contract.venue,
            "total_amount": float(contract.total_amount),
            "deposit_amount": float(contract.deposit_amount) if contract.deposit_amount else None,
            "body": contract.body,
            "status": "signed",
            "signed_at": contract.signed_at.isoformat() if contract.signed_at else None,
        }

    if contract.status == "expired":
        return {"status": "expired", "reference": contract.reference}

    if contract.status not in ("sent",):
        raise HTTPException(status_code=404, detail="Contract not found")

    return {
        "reference": contract.reference,
        "client_name": contract.client_name,
        "event_date": str(contract.event_date),
        "venue": contract.venue,
        "total_amount": float(contract.total_amount),
        "deposit_amount": float(contract.deposit_amount) if contract.deposit_amount else None,
        "body": contract.body,
        "status": "sent",
    }


@router.post("/sign/{token}")
def sign_contract(
    token: str,
    data: SignContractRequest,
    request: Request,
    db: Session = Depends(get_db),
    # NOTE: No require_permission — public endpoint
):
    from app.models.contracts import Contract
    from app.models.portal import ClientPortalAccount, PortalNotification
    from datetime import datetime, timezone

    try:
        contract_id = UUID(token)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid signing link")

    contract = db.query(Contract).filter(
        Contract.id == contract_id,
        Contract.status == "sent",
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found or already signed")

    contract.status = "signed"
    contract.signature_data = data.signature_data
    contract.signed_at = datetime.now(timezone.utc)
    contract.signed_ip = request.client.host if request.client else None

    # Notify client portal if they have an account
    portal_account = (
        db.query(ClientPortalAccount)
        .filter_by(client_id=contract.client_id, is_active=True)
        .first()
    )
    if portal_account:
        db.add(PortalNotification(
            portal_account_id=portal_account.id,
            type="contract_signed",
            title="Contract Signed",
            message=f"Your contract {contract.reference} has been signed successfully.",
            action_url=f"/portal/contracts/{contract.id}",
        ))

    db.commit()

    # Notify staff that contract was signed
    try:
        from app.models.auth import User
        from app.services.email import send_contract_signed_notification
        creator = db.query(User).filter(User.id == contract.created_by).first()
        if creator and creator.email:
            send_contract_signed_notification(contract, creator.email, creator.full_name)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Failed to send signed notification: %s", exc)

    return {
        "message": "Contract signed successfully",
        "reference": contract.reference,
        "signed_at": contract.signed_at.isoformat(),
    }


# ─── Templates ────────────────────────────────────────────────

@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
    _=Depends(require_permission("contracts:read")),
):
    from app.models.contracts import ContractTemplate
    return (
        db.query(ContractTemplate)
        .filter(ContractTemplate.is_active == True)
        .order_by(ContractTemplate.name.asc())
        .all()
    )


# ─── Template helper ──────────────────────────────────────────

def _fill_template(body: str, values: dict) -> str:
    """Replace {{KEY}} placeholders in the template body."""
    for key, value in values.items():
        body = body.replace(f"{{{{{key}}}}}", value)
    return body
