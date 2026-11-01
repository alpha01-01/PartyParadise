import logging
import re
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.schemas.types import Money
from app.dependencies import require_permission
from app.utils.audit import record_audit
from app.utils.security import create_contract_signing_token, decode_token

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── Schemas ──────────────────────────────────────────────────

class CreateContractRequest(BaseModel):
    booking_id: UUID
    template_id: Optional[UUID] = None
    special_terms: Optional[str] = None
    deposit_amount: Optional[Money] = None


class ContractResponse(BaseModel):
    id: UUID
    booking_id: UUID
    client_id: UUID
    reference: str
    status: str
    client_name: str
    event_date: date
    venue: Optional[str]
    total_amount: Money
    deposit_amount: Optional[Money]
    signed_at: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}


class SignContractRequest(BaseModel):
    signature_data: str = Field(..., min_length=1, max_length=200_000)  # typed name or base64 PNG from canvas


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
        # A template for this service wins over a generic one
        template = (
            db.query(ContractTemplate)
            .filter(
                ContractTemplate.is_active == True,
                (ContractTemplate.service_type == booking.service_type) |
                (ContractTemplate.service_type == None)
            )
            .order_by(ContractTemplate.service_type.is_(None), ContractTemplate.name.asc())
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
    service_type = booking.service_type.replace("_", " ").title()
    body = _fill_template(template.body, {
        "client_name":         client_name,
        "client_phone":        client.phone or "",
        "event_date":          booking.event_date.strftime("%d %B %Y"),
        "venue":               booking.venue_name or "To be confirmed",
        "service_type":        service_type,
        "service_description": _describe_services(services, service_type),
        "total_amount":        f"GHS {total:,.2f}",
        "deposit_amount":      f"GHS {deposit:,.2f}",
        "business_name":       "PartyParadise",
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
    if contract.status not in ("draft", "sent"):
        raise HTTPException(status_code=400, detail=f"Cannot send contract with status '{contract.status}'")

    contract.status = "sent"
    contract.sent_at = datetime.now(timezone.utc)
    db.commit()

    signing_url = f"{settings.WEB_URL}/contracts/sign/{create_contract_signing_token(str(contract.id))}"

    # Email the signing link to the client, with the PDF when it can be generated
    email_sent = False
    try:
        from app.models.clients import Client
        from app.services.email import send_contract_email
        from app.services.pdf import generate_contract_pdf
        client = db.query(Client).filter(Client.id == contract.client_id).first()
        if client and client.email:
            try:
                pdf_bytes = generate_contract_pdf(contract)
            except Exception:
                logger.exception("Could not generate PDF for contract %s", contract.reference)
                pdf_bytes = None
            email_sent = send_contract_email(contract, client, signing_url=signing_url, pdf_bytes=pdf_bytes)
    except Exception as exc:
        logger.exception("Failed to send contract email: %s", exc)

    return {
        "message": "Contract sent",
        "reference": contract.reference,
        "signing_url": signing_url,
        "status": contract.status,
        "email_sent": email_sent,
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
    The token is a signed, expiring link issued when the contract is sent.
    """
    from app.models.contracts import Contract

    contract_id = _contract_id_from_token(token)

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

    contract_id = _contract_id_from_token(token)

    contract = db.query(Contract).filter(
        Contract.id == contract_id,
        Contract.status == "sent",
    ).with_for_update().first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found or already signed")

    contract.status = "signed"
    contract.signature_data = data.signature_data
    contract.signed_at = datetime.now(timezone.utc)
    contract.signed_ip = request.client.host if request.client else None
    record_audit(
        db,
        user_id=None,
        action="sign",
        module="contracts",
        entity_type="contract",
        entity_id=contract.id,
        extra={"ip": contract.signed_ip},
    )

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


# ─── Template helper ──────────────────────────────────────────

def _contract_id_from_token(token: str) -> UUID:
    payload = decode_token(token)
    if not payload or payload.get("type") != "contract_sign":
        raise HTTPException(status_code=404, detail="This signing link is invalid or has expired")
    return UUID(payload["sub"])


def _fill_template(body: str, values: dict) -> str:
    """
    Replace {{key}} placeholders in the template body, ignoring case.
    A contract must never reach a client with a raw placeholder in it.
    """
    unknown = set()

    def replace(match):
        key = match.group(1).lower()
        if key not in values:
            unknown.add(match.group(1))
            return match.group(0)
        return values[key]

    filled = re.sub(r"\{\{\s*(\w+)\s*\}\}", replace, body)
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Template has unknown placeholders: {', '.join(sorted(unknown))}",
        )
    return filled


def _describe_services(services, service_type: str) -> str:
    lines = [
        f"- {s.service.replace('_', ' ').title()}" + (f": {s.description}" if s.description else "")
        for s in services
    ]
    return "\n".join(lines) or service_type
