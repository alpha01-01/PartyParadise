from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.dependencies import require_permission
from app.utils.references import generate_reference

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────

class CreateInventoryItemRequest(BaseModel):
    name: str
    sku: Optional[str] = None
    category: str
    unit: str
    reorder_level: int = 0
    unit_cost: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    location: Optional[str] = None


class UpdateInventoryItemRequest(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    reorder_level: Optional[int] = None
    unit_cost: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None


class InventoryTransactionRequest(BaseModel):
    item_id: UUID
    type: str   # purchase | usage | adjustment | damage | return
    quantity: int
    reason: Optional[str] = None
    booking_id: Optional[UUID] = None


class CreateEquipmentRequest(BaseModel):
    name: str
    category: str
    serial_number: Optional[str] = None
    status: str = "available"
    condition: str = "good"
    purchase_cost: Optional[Decimal] = None
    purchased_at: Optional[date] = None
    notes: Optional[str] = None


class LogMaintenanceRequest(BaseModel):
    type: str           # routine | repair | inspection | cleaning
    description: str
    cost: Optional[Decimal] = None
    serviced_at: date
    next_service_at: Optional[date] = None


# ─── Inventory items ──────────────────────────────────────────

@router.get("/items")
def list_items(
    category: str = Query(None),
    low_stock: bool = Query(False),
    search: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.inventory import InventoryItem
    from app.utils.pagination import paginate

    query = db.query(InventoryItem).filter(InventoryItem.is_active == True)
    if category:
        query = query.filter(InventoryItem.category == category)
    if low_stock:
        query = query.filter(
            InventoryItem.quantity_in_stock <= InventoryItem.reorder_level
        )
    if search:
        query = query.filter(InventoryItem.name.ilike(f"%{search}%"))

    result = paginate(query.order_by(InventoryItem.name.asc()), page, page_size)
    return result


@router.get("/items/{item_id}")
def get_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.inventory import InventoryItem

    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("/items", status_code=201)
def create_item(
    data: CreateInventoryItemRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:create")),
):
    from app.models.inventory import InventoryItem

    item = InventoryItem(**data.model_dump(exclude_none=True))
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}")
def update_item(
    item_id: UUID,
    data: UpdateInventoryItemRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:update")),
):
    from app.models.inventory import InventoryItem

    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


# ─── Inventory transactions ───────────────────────────────────

@router.get("/items/{item_id}/transactions")
def list_item_transactions(
    item_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.inventory import InventoryTransaction

    return (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.item_id == item_id)
        .order_by(InventoryTransaction.created_at.desc())
        .all()
    )


@router.post("/transactions", status_code=201)
def create_transaction(
    data: InventoryTransactionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("inventory:update")),
):
    from app.models.inventory import InventoryItem, InventoryTransaction

    item = (
        db.query(InventoryItem)
        .filter(InventoryItem.id == data.item_id)
        .with_for_update()   # lock row to prevent race conditions
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    new_qty = item.quantity_in_stock + data.quantity
    if new_qty < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock. Current: {item.quantity_in_stock}, requested: {abs(data.quantity)}"
        )

    txn = InventoryTransaction(
        item_id=data.item_id,
        user_id=current_user.id,
        booking_id=data.booking_id,
        type=data.type,
        quantity=data.quantity,
        reason=data.reason,
    )
    db.add(txn)
    item.quantity_in_stock = new_qty
    db.commit()
    db.refresh(txn)
    return txn


# ─── Equipment ────────────────────────────────────────────────

@router.get("/equipment")
def list_equipment(
    status_filter: str = Query(None, alias="status"),
    category: str = Query(None),
    available_on: date = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.inventory import Equipment
    from app.models.bookings import BookingEquipment, Booking

    query = db.query(Equipment).filter(Equipment.is_active == True)

    if status_filter:
        query = query.filter(Equipment.status == status_filter)
    if category:
        query = query.filter(Equipment.category == category)
    if available_on:
        # Exclude equipment reserved/deployed on this date
        booked_ids = (
            db.query(BookingEquipment.equipment_id)
            .join(Booking)
            .filter(
                Booking.event_date == available_on,
                Booking.status.in_(["confirmed", "in_progress"]),
                BookingEquipment.status.in_(["reserved", "deployed"]),
            )
            .subquery()
        )
        query = query.filter(~Equipment.id.in_(booked_ids))

    return query.order_by(Equipment.name.asc()).all()


@router.get("/equipment/{equipment_id}")
def get_equipment(
    equipment_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.inventory import Equipment

    eq = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return eq


@router.post("/equipment", status_code=201)
def create_equipment(
    data: CreateEquipmentRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:create")),
):
    from app.models.inventory import Equipment

    eq = Equipment(**data.model_dump(exclude_none=True))
    db.add(eq)
    db.commit()
    db.refresh(eq)
    return eq


@router.patch("/equipment/{equipment_id}")
def update_equipment(
    equipment_id: UUID,
    data: dict,
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:update")),
):
    from app.models.inventory import Equipment

    eq = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    allowed = {"name", "category", "status", "condition", "notes", "is_active"}
    for field, value in data.items():
        if field in allowed:
            setattr(eq, field, value)

    db.commit()
    db.refresh(eq)
    return eq


@router.get("/equipment/{equipment_id}/maintenance")
def list_maintenance(
    equipment_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.inventory import EquipmentMaintenance

    return (
        db.query(EquipmentMaintenance)
        .filter(EquipmentMaintenance.equipment_id == equipment_id)
        .order_by(EquipmentMaintenance.serviced_at.desc())
        .all()
    )


@router.post("/equipment/{equipment_id}/maintenance", status_code=201)
def log_maintenance(
    equipment_id: UUID,
    data: LogMaintenanceRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("inventory:update")),
):
    from app.models.inventory import Equipment, EquipmentMaintenance

    eq = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")

    record = EquipmentMaintenance(
        equipment_id=equipment_id,
        user_id=current_user.id,
        **data.model_dump(exclude_none=True),
    )
    db.add(record)

    # Update last_serviced_at on the equipment itself
    eq.last_serviced_at = data.serviced_at

    db.commit()
    db.refresh(record)
    return record


# ─── Suppliers ────────────────────────────────────────────────

@router.get("/suppliers")
def list_suppliers(
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.inventory import Supplier
    return db.query(Supplier).order_by(Supplier.name.asc()).all()
