from datetime import date, time, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import extract, or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import require_permission
from app.utils.references import generate_reference

router = APIRouter()


class BookingServiceSchema(BaseModel):
    id: Optional[UUID] = None
    booking_id: Optional[UUID] = None
    service: str
    description: Optional[str] = None
    price: Decimal
    pricing_type: str = "fixed"

    model_config = {"from_attributes": True}


class BookingStaffResponse(BaseModel):
    id: UUID
    user_id: UUID
    full_name: str
    user_name: str
    role: str
    report_time: Optional[time] = None
    status: str


class BookingNoteResponse(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    note: str
    is_internal: bool
    created_at: datetime
    user_name: Optional[str] = None


class BookingEquipmentResponse(BaseModel):
    id: UUID
    equipment_id: UUID
    equipment_name: str
    quantity: int
    status: str


class BookingInvoiceSummary(BaseModel):
    id: UUID
    reference: str
    total_amount: Decimal
    amount_paid: Decimal
    amount_due: Decimal
    due_date: Optional[date] = None


class BookingContractSummary(BaseModel):
    id: UUID
    reference: str
    status: str
    signed_at: Optional[datetime] = None


class CreateBookingRequest(BaseModel):
    client_id: UUID
    service_type: str
    event_date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    event_type: Optional[str] = None
    guest_count: Optional[int] = None
    special_requests: Optional[str] = None
    services: List[BookingServiceSchema] = []


class UpdateBookingRequest(BaseModel):
    event_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    event_type: Optional[str] = None
    guest_count: Optional[int] = None
    special_requests: Optional[str] = None


class UpdateStatusRequest(BaseModel):
    status: str
    note: Optional[str] = None


class BookingNoteRequest(BaseModel):
    note: str
    is_internal: bool = True


class AssignStaffRequest(BaseModel):
    user_id: UUID
    role: str
    report_time: Optional[time] = None


class AllocateEquipmentRequest(BaseModel):
    equipment_id: UUID
    quantity: int = 1


class BookingResponse(BaseModel):
    id: UUID
    client_id: UUID
    client_name: str
    client_phone: Optional[str] = None
    reference: str
    service_type: str
    status: str
    event_date: date
    start_time: Optional[time]
    end_time: Optional[time]
    venue_name: Optional[str]
    venue_address: Optional[str]
    event_type: Optional[str]
    guest_count: Optional[int]
    special_requests: Optional[str]
    created_at: datetime
    services: List[BookingServiceSchema] = []
    staff: List[BookingStaffResponse] = []
    equipment: List[BookingEquipmentResponse] = []
    notes: List[BookingNoteResponse] = []
    invoice: Optional[BookingInvoiceSummary] = None
    contract: Optional[BookingContractSummary] = None

    model_config = {"from_attributes": True}


VALID_TRANSITIONS = {
    "inquiry": ["quoted", "cancelled"],
    "quoted": ["confirmed", "cancelled"],
    "confirmed": ["in_progress", "cancelled"],
    "in_progress": ["completed"],
    "completed": [],
    "cancelled": [],
}


def _base_booking_query(db: Session):
    from app.models.bookings import Booking, BookingEquipment, BookingNote, BookingStaff

    return db.query(Booking).options(
        selectinload(Booking.client),
        selectinload(Booking.services),
        selectinload(Booking.staff).selectinload(BookingStaff.user),
        selectinload(Booking.notes).selectinload(BookingNote.user),
        selectinload(Booking.equipment).selectinload(BookingEquipment.equipment),
        selectinload(Booking.invoices),
        selectinload(Booking.contracts),
    )


def _booking_to_response(
    booking,
    *,
    include_services: bool = False,
    include_detail: bool = False,
) -> BookingResponse:
    client_name = ""
    client_phone = None
    if getattr(booking, "client", None):
        first = booking.client.first_name or ""
        last = booking.client.last_name or ""
        client_name = f"{first} {last}".strip()
        client_phone = booking.client.phone

    services = []
    if include_services:
        services = [BookingServiceSchema.model_validate(service) for service in getattr(booking, "services", [])]

    staff = []
    equipment = []
    notes = []
    invoice = None
    contract = None

    if include_detail:
        staff = [
            BookingStaffResponse(
                id=assignment.id,
                user_id=assignment.user_id,
                full_name=getattr(assignment.user, "full_name", "Staff"),
                user_name=getattr(assignment.user, "full_name", "Staff"),
                role=assignment.role,
                report_time=assignment.report_time,
                status=assignment.status,
            )
            for assignment in getattr(booking, "staff", [])
        ]
        equipment = [
            BookingEquipmentResponse(
                id=allocation.id,
                equipment_id=allocation.equipment_id,
                equipment_name=getattr(allocation.equipment, "name", "Equipment"),
                quantity=allocation.quantity,
                status=allocation.status,
            )
            for allocation in getattr(booking, "equipment", [])
        ]
        notes = [
            BookingNoteResponse(
                id=note.id,
                user_id=note.user_id,
                note=note.note,
                is_internal=note.is_internal,
                created_at=note.created_at,
                user_name=getattr(note.user, "full_name", None),
            )
            for note in sorted(getattr(booking, "notes", []), key=lambda row: row.created_at or datetime.min, reverse=True)
        ]

        invoices = sorted(
            getattr(booking, "invoices", []),
            key=lambda row: row.created_at or datetime.min,
            reverse=True,
        )
        if invoices:
            latest_invoice = invoices[0]
            amount_paid = latest_invoice.amount_paid or Decimal("0")
            total_amount = latest_invoice.total_amount or Decimal("0")
            invoice = BookingInvoiceSummary(
                id=latest_invoice.id,
                reference=latest_invoice.reference,
                total_amount=total_amount,
                amount_paid=amount_paid,
                amount_due=total_amount - amount_paid,
                due_date=latest_invoice.due_date,
            )

        contracts = sorted(
            getattr(booking, "contracts", []),
            key=lambda row: row.created_at or datetime.min,
            reverse=True,
        )
        if contracts:
            latest_contract = contracts[0]
            contract = BookingContractSummary(
                id=latest_contract.id,
                reference=latest_contract.reference,
                status=latest_contract.status,
                signed_at=latest_contract.signed_at,
            )

    return BookingResponse(
        id=booking.id,
        client_id=booking.client_id,
        client_name=client_name,
        client_phone=client_phone,
        reference=booking.reference,
        service_type=booking.service_type,
        status=booking.status,
        event_date=booking.event_date,
        start_time=booking.start_time,
        end_time=booking.end_time,
        venue_name=booking.venue_name,
        venue_address=booking.venue_address,
        event_type=booking.event_type,
        guest_count=booking.guest_count,
        special_requests=booking.special_requests,
        created_at=booking.created_at,
        services=services,
        staff=staff,
        equipment=equipment,
        notes=notes,
        invoice=invoice,
        contract=contract,
    )


def check_equipment_conflict(db: Session, equipment_id: UUID, event_date: date, exclude_booking_id: UUID = None) -> bool:
    from app.models.bookings import Booking
    from app.models.inventory import BookingEquipment

    query = (
        db.query(Booking)
        .join(BookingEquipment, BookingEquipment.booking_id == Booking.id)
        .filter(
            BookingEquipment.equipment_id == equipment_id,
            Booking.event_date == event_date,
            Booking.status.in_(["confirmed", "in_progress"]),
        )
    )
    if exclude_booking_id:
        query = query.filter(Booking.id != exclude_booking_id)
    return query.first() is not None


@router.get("")
def list_bookings(
    status_filter: str = Query(None, alias="status"),
    service_type: str = Query(None),
    search: str = Query(None),
    from_date: date = Query(None),
    to_date: date = Query(None),
    client_id: UUID = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission("bookings:read")),
):
    from app.models.bookings import Booking
    from app.models.clients import Client
    from app.utils.pagination import paginate

    query = _base_booking_query(db)
    if status_filter:
        query = query.filter(Booking.status == status_filter)
    if service_type:
        query = query.filter(Booking.service_type == service_type)
    if from_date:
        query = query.filter(Booking.event_date >= from_date)
    if to_date:
        query = query.filter(Booking.event_date <= to_date)
    if client_id:
        query = query.filter(Booking.client_id == client_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.join(Booking.client).filter(
            or_(
                Booking.reference.ilike(pattern),
                Client.first_name.ilike(pattern),
                Client.last_name.ilike(pattern),
                Client.email.ilike(pattern),
                Client.phone.ilike(pattern),
                Booking.event_type.ilike(pattern),
                Booking.venue_name.ilike(pattern),
            )
        )

    result = paginate(query.order_by(Booking.event_date.asc()), page, page_size)
    result["items"] = [
        _booking_to_response(booking, include_services=True)
        for booking in result["items"]
    ]
    return result


@router.get("/calendar")
def calendar_view(
    month: str = Query(..., description="Format: YYYY-MM"),
    db: Session = Depends(get_db),
    _=Depends(require_permission("bookings:read")),
):
    from app.models.bookings import Booking

    try:
        year, mo = map(int, month.split("-"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format") from exc

    bookings = (
        _base_booking_query(db)
        .filter(
            extract("year", Booking.event_date) == year,
            extract("month", Booking.event_date) == mo,
        )
        .order_by(Booking.event_date.asc())
        .all()
    )
    return [_booking_to_response(booking, include_services=True) for booking in bookings]


@router.post("", status_code=201)
def create_booking(
    data: CreateBookingRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("bookings:create")),
):
    from app.models.bookings import Booking, BookingService

    booking = Booking(
        client_id=data.client_id,
        created_by=current_user.id,
        reference=generate_reference("BK", Booking, db),
        service_type=data.service_type,
        status="inquiry",
        event_date=data.event_date,
        start_time=data.start_time,
        end_time=data.end_time,
        venue_name=data.venue_name,
        venue_address=data.venue_address,
        event_type=data.event_type,
        guest_count=data.guest_count,
        special_requests=data.special_requests,
    )
    db.add(booking)
    db.flush()

    for service in data.services:
        db.add(BookingService(booking_id=booking.id, **service.model_dump(exclude={"id", "booking_id"})))

    db.commit()
    booking = _base_booking_query(db).filter(Booking.id == booking.id).first()
    return _booking_to_response(booking, include_services=True, include_detail=True)


@router.get("/{booking_id}")
def get_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("bookings:read")),
):
    from app.models.bookings import Booking

    booking = _base_booking_query(db).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return _booking_to_response(booking, include_services=True, include_detail=True)


@router.patch("/{booking_id}")
def update_booking(
    booking_id: UUID,
    data: UpdateBookingRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("bookings:update")),
):
    from app.models.bookings import Booking

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(booking, field, value)
    db.commit()

    booking = _base_booking_query(db).filter(Booking.id == booking_id).first()
    return _booking_to_response(booking, include_services=True, include_detail=True)


@router.patch("/{booking_id}/status")
def update_status(
    booking_id: UUID,
    data: UpdateStatusRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("bookings:update")),
):
    from app.models.bookings import Booking, BookingNote

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    allowed = VALID_TRANSITIONS.get(booking.status, [])
    if data.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{booking.status}' to '{data.status}'",
        )

    booking.status = data.status

    if data.note:
        db.add(
            BookingNote(
                booking_id=booking.id,
                user_id=current_user.id,
                note=data.note,
                is_internal=True,
            )
        )

    db.commit()
    booking = _base_booking_query(db).filter(Booking.id == booking_id).first()
    return _booking_to_response(booking, include_services=True, include_detail=True)


@router.post("/{booking_id}/notes", status_code=201)
def add_note(
    booking_id: UUID,
    data: BookingNoteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("bookings:update")),
):
    from app.models.bookings import Booking, BookingNote

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    note = BookingNote(
        booking_id=booking_id,
        user_id=current_user.id,
        note=data.note,
        is_internal=data.is_internal,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return BookingNoteResponse(
        id=note.id,
        user_id=note.user_id,
        note=note.note,
        is_internal=note.is_internal,
        created_at=note.created_at,
        user_name=getattr(note.user, "full_name", None),
    )


@router.post("/{booking_id}/staff", status_code=201)
def assign_staff(
    booking_id: UUID,
    data: AssignStaffRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("bookings:update")),
):
    from app.models.bookings import Booking, BookingStaff

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    assignment = BookingStaff(
        booking_id=booking_id,
        user_id=data.user_id,
        role=data.role,
        report_time=data.report_time,
        status="assigned",
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.post("/{booking_id}/equipment", status_code=201)
def allocate_equipment(
    booking_id: UUID,
    data: AllocateEquipmentRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("bookings:update")),
):
    from app.models.bookings import Booking, BookingEquipment

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if check_equipment_conflict(db, data.equipment_id, booking.event_date, exclude_booking_id=booking_id):
        raise HTTPException(
            status_code=409,
            detail="This equipment is already allocated to another booking on the same date",
        )

    allocation = BookingEquipment(
        booking_id=booking_id,
        equipment_id=data.equipment_id,
        quantity=data.quantity,
        status="reserved",
    )
    db.add(allocation)
    db.commit()
    db.refresh(allocation)
    return allocation
