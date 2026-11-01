from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import require_permission
from app.models.bookings import Booking
from app.models.clients import Client, ClientAddress, ClientTag, Interaction, Tag
from app.models.invoicing import Invoice
from app.utils.pagination import paginate


class ClientAddressSchema(BaseModel):
    id: UUID
    type: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, address: ClientAddress):
        return cls(
            id=address.id,
            type=address.label,
            city=address.city,
            region=address.region,
        )


class TagResponse(BaseModel):
    id: UUID
    name: str
    color: Optional[str]

    model_config = {"from_attributes": True}


class InteractionResponse(BaseModel):
    id: UUID
    channel: str
    direction: str
    summary: str
    interacted_at: datetime
    user_id: Optional[UUID]

    model_config = {"from_attributes": True}


class ClientBookingSummaryResponse(BaseModel):
    id: UUID
    reference: str
    event_type: Optional[str] = None
    service_type: Optional[str] = None
    event_date: datetime | str
    status: str
    total_amount: Optional[float] = None


class ClientInvoiceSummaryResponse(BaseModel):
    id: UUID
    reference: str
    amount_due: float


class ClientPortalAccountResponse(BaseModel):
    is_active: bool
    email: str
    last_login_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CreateClientRequest(BaseModel):
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    source: Optional[str] = None
    status: str = "lead"
    client_type: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[UUID] = None


class UpdateClientRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    client_type: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[UUID] = None


class CreateInteractionRequest(BaseModel):
    channel: str
    direction: str
    summary: str


class ClientResponse(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: Optional[str]
    phone: Optional[str]
    whatsapp: Optional[str]
    source: Optional[str]
    status: str
    client_type: Optional[str]
    notes: Optional[str]
    assigned_to: Optional[UUID]
    created_at: datetime
    tags: List[TagResponse] = []
    addresses: List[ClientAddressSchema] = []
    bookings: List[ClientBookingSummaryResponse] = []
    invoices: List[ClientInvoiceSummaryResponse] = []
    portal_account: Optional[ClientPortalAccountResponse] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, client: Client, include_history: bool = True):
        tags = [TagResponse.model_validate(link.tag) for link in (client.tags or []) if link.tag]
        bookings = [] if not include_history else [
            ClientBookingSummaryResponse(
                id=booking.id,
                reference=booking.reference,
                event_type=booking.event_type,
                service_type=booking.service_type,
                event_date=str(booking.event_date),
                status=booking.status,
                total_amount=float(sum((service.price or 0) for service in (booking.services or []))) if booking.services else None,
            )
            for booking in (client.bookings or [])
        ]
        invoices = [] if not include_history else [
            ClientInvoiceSummaryResponse(
                id=invoice.id,
                reference=invoice.reference,
                amount_due=float(invoice.amount_due or 0),
            )
            for invoice in (client.invoices or [])
        ]
        addresses = [ClientAddressSchema.from_orm(address) for address in (client.addresses or [])]
        portal_account = ClientPortalAccountResponse.model_validate(client.portal_account) if client.portal_account else None
        return cls(
            id=client.id,
            first_name=client.first_name,
            last_name=client.last_name,
            email=client.email,
            phone=client.phone,
            whatsapp=client.whatsapp,
            source=client.source,
            status=client.status,
            client_type=client.client_type,
            notes=client.notes,
            assigned_to=client.assigned_to,
            created_at=client.created_at,
            tags=tags,
            addresses=addresses,
            bookings=bookings,
            invoices=invoices,
            portal_account=portal_account,
        )


router = APIRouter()


def base_client_query(db: Session):
    return db.query(Client).options(
        selectinload(Client.tags).selectinload(ClientTag.tag),
        selectinload(Client.addresses),
        selectinload(Client.bookings).selectinload(Booking.services),
        selectinload(Client.invoices),
        selectinload(Client.portal_account),
    )


@router.get("")
def list_clients(
    status_filter: Optional[str] = Query(None, alias="status"),
    tag: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    assigned_to: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission("clients:read")),
):
    query = db.query(Client).options(
        selectinload(Client.tags).selectinload(ClientTag.tag),
        selectinload(Client.addresses),
        selectinload(Client.portal_account),
    )
    if status_filter:
        query = query.filter(Client.status == status_filter)
    if search:
        needle = f"%{search.strip()}%"
        query = query.filter(
            or_(
                (Client.first_name + " " + Client.last_name).ilike(needle),
                Client.email.ilike(needle),
                Client.phone.ilike(needle),
                Client.whatsapp.ilike(needle),
                Client.source.ilike(needle),
            )
        )
    if assigned_to:
        query = query.filter(Client.assigned_to == assigned_to)
    if tag:
        query = query.join(ClientTag).join(Tag).filter(Tag.name == tag)

    result = paginate(query.order_by(Client.created_at.desc()), page, page_size)
    result["items"] = [ClientResponse.from_orm(client, include_history=False) for client in result["items"]]
    return result


@router.post("", status_code=201)
def create_client(
    data: CreateClientRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("clients:create")),
):
    client = Client(**data.model_dump(exclude_none=True))
    db.add(client)
    db.commit()
    db.refresh(client)
    client = base_client_query(db).filter(Client.id == client.id).first()
    return ClientResponse.from_orm(client)


@router.get("/{client_id}")
def get_client(
    client_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("clients:read")),
):
    client = base_client_query(db).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientResponse.from_orm(client)


@router.patch("/{client_id}")
def update_client(
    client_id: UUID,
    data: UpdateClientRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("clients:update")),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(client, field, value)
    if data.email and client.portal_account:
        client.portal_account.email = data.email.lower()
    db.commit()
    client = base_client_query(db).filter(Client.id == client_id).first()
    return ClientResponse.from_orm(client)


@router.post("/{client_id}/interactions", status_code=201)
def add_interaction(
    client_id: UUID,
    data: CreateInteractionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("clients:update")),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    interaction = Interaction(client_id=client_id, user_id=current_user.id, **data.model_dump())
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return InteractionResponse.model_validate(interaction)


@router.get("/{client_id}/timeline")
def get_timeline(
    client_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("clients:read")),
):
    client = base_client_query(db).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    interactions = (
        db.query(Interaction)
        .filter(Interaction.client_id == client_id)
        .order_by(Interaction.interacted_at.desc())
        .all()
    )

    return {
        "client": ClientResponse.from_orm(client),
        "interactions": [InteractionResponse.model_validate(interaction) for interaction in interactions],
        "bookings": [
            {
                "id": booking.id,
                "reference": booking.reference,
                "event_type": booking.event_type,
                "service_type": booking.service_type,
                "event_date": booking.event_date,
                "status": booking.status,
            }
            for booking in client.bookings
        ],
    }
