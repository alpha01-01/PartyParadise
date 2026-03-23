# ============================================================
# routers/inventory.py
# ============================================================
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.dependencies import require_permission
from app.utils.references import generate_reference

router = APIRouter()


class CreateInventoryItemRequest(BaseModel):
    name: str
    sku: Optional[str] = None
    category: str
    unit: str
    reorder_level: int = 0
    unit_cost: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    location: Optional[str] = None


class InventoryTransactionRequest(BaseModel):
    item_id: UUID
    type: str
    quantity: int
    reason: Optional[str] = None
    booking_id: Optional[UUID] = None


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
        query = query.filter(InventoryItem.quantity_in_stock <= InventoryItem.reorder_level)
    if search:
        query = query.filter(InventoryItem.name.ilike(f"%{search}%"))

    result = paginate(query.order_by(InventoryItem.name.asc()), page, page_size)
    return result


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


@router.post("/transactions", status_code=201)
def create_transaction(
    data: InventoryTransactionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("inventory:update")),
):
    from app.models.inventory import InventoryItem, InventoryTransaction

    item = db.query(InventoryItem).filter(InventoryItem.id == data.item_id).with_for_update().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    new_qty = item.quantity_in_stock + data.quantity
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    transaction = InventoryTransaction(
        item_id=data.item_id,
        user_id=current_user.id,
        booking_id=data.booking_id,
        type=data.type,
        quantity=data.quantity,
        reason=data.reason,
    )
    db.add(transaction)
    item.quantity_in_stock = new_qty
    db.commit()
    db.refresh(transaction)
    return transaction


@router.get("/equipment")
def list_equipment(
    status_filter: str = Query(None, alias="status"),
    available_on: date = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.inventory import Equipment, BookingEquipment
    from app.models.bookings import Booking

    query = db.query(Equipment).filter(Equipment.is_active == True)
    if status_filter:
        query = query.filter(Equipment.status == status_filter)
    if available_on:
        # Exclude equipment booked on this date
        booked_ids = (
            db.query(BookingEquipment.equipment_id)
            .join(Booking)
            .filter(
                Booking.event_date == available_on,
                Booking.status.in_(["confirmed", "in_progress"]),
            )
            .subquery()
        )
        query = query.filter(~Equipment.id.in_(booked_ids))

    return query.order_by(Equipment.name.asc()).all()


# ============================================================
# routers/accounting.py
# ============================================================
from fastapi import APIRouter as _Router2
from app.database import get_db as _get_db2
from app.dependencies import require_permission as _rp2

accounting_router = _Router2()


class CreateExpenseRequest(BaseModel):
    category_id: UUID
    description: str
    amount: Decimal
    payment_method: str
    expense_date: date
    booking_id: Optional[UUID] = None
    supplier_id: Optional[UUID] = None
    receipt_url: Optional[str] = None
    notes: Optional[str] = None


@accounting_router.get("/expenses")
def list_expenses(
    category_id: UUID = Query(None),
    booking_id: UUID = Query(None),
    from_date: date = Query(None),
    to_date: date = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(_get_db2),
    _=Depends(_rp2("accounting:read")),
):
    from app.models.accounting import Expense
    from app.utils.pagination import paginate

    query = db.query(Expense)
    if category_id:
        query = query.filter(Expense.category_id == category_id)
    if booking_id:
        query = query.filter(Expense.booking_id == booking_id)
    if from_date:
        query = query.filter(Expense.expense_date >= from_date)
    if to_date:
        query = query.filter(Expense.expense_date <= to_date)

    return paginate(query.order_by(Expense.expense_date.desc()), page, page_size)


@accounting_router.post("/expenses", status_code=201)
def create_expense(
    data: CreateExpenseRequest,
    db: Session = Depends(_get_db2),
    current_user=Depends(_rp2("accounting:create")),
):
    from app.models.accounting import Expense, JournalEntry

    expense = Expense(
        recorded_by=current_user.id,
        **data.model_dump(exclude_none=True),
    )
    db.add(expense)
    db.flush()

    # Auto journal entry
    db.add(JournalEntry(
        created_by=current_user.id,
        type="expense",
        description=expense.description,
        amount=expense.amount,
        source_type="expense",
        source_id=expense.id,
        entry_date=expense.expense_date,
    ))
    db.commit()
    db.refresh(expense)
    return expense


@accounting_router.get("/bank-accounts")
def list_bank_accounts(
    db: Session = Depends(_get_db2),
    _=Depends(_rp2("accounting:read")),
):
    from app.models.accounting import BankAccount
    return db.query(BankAccount).filter(BankAccount.is_active == True).all()


# ============================================================
# routers/staff.py
# ============================================================
from fastapi import APIRouter as _Router3

staff_router = _Router3()


@staff_router.get("")
def list_staff(
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:read")),
):
    from app.models.staff import StaffProfile
    from app.models.auth import User
    return (
        db.query(StaffProfile)
        .join(User)
        .filter(StaffProfile.is_active == True)
        .all()
    )


@staff_router.get("/{staff_id}/schedule")
def staff_schedule(
    staff_id: UUID,
    month: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
    _=Depends(require_permission("staff:read")),
):
    from app.models.staff import Shift, StaffProfile
    from sqlalchemy import extract

    try:
        year, mo = map(int, month.split("-"))
    except ValueError:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")

    profile = db.query(StaffProfile).filter(StaffProfile.id == staff_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Staff not found")

    return (
        db.query(Shift)
        .filter(
            Shift.staff_id == staff_id,
            extract("year", Shift.shift_date) == year,
            extract("month", Shift.shift_date) == mo,
        )
        .order_by(Shift.shift_date.asc())
        .all()
    )


# ============================================================
# routers/contracts.py
# ============================================================
from fastapi import APIRouter as _Router4

contracts_router = _Router4()


@contracts_router.get("")
def list_contracts(
    status_filter: str = Query(None, alias="status"),
    client_id: UUID = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_permission("contracts:read")),
):
    from app.models.contracts import Contract
    query = db.query(Contract)
    if status_filter:
        query = query.filter(Contract.status == status_filter)
    if client_id:
        query = query.filter(Contract.client_id == client_id)
    return query.order_by(Contract.created_at.desc()).all()


@contracts_router.get("/sign/{token}")
def get_contract_for_signing(token: str, db: Session = Depends(get_db)):
    """Public endpoint — no auth required. Returns contract body for client to review."""
    from app.models.contracts import Contract
    # In production: validate token from signing_tokens table/cache
    # Simplified: token = contract_id
    try:
        contract_id = UUID(token)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid token")

    contract = db.query(Contract).filter(
        Contract.id == contract_id,
        Contract.status == "sent",
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found or already signed")

    return {
        "reference": contract.reference,
        "client_name": contract.client_name,
        "event_date": contract.event_date,
        "total_amount": float(contract.total_amount),
        "body": contract.body,
    }


@contracts_router.post("/sign/{token}")
def sign_contract(
    token: str,
    request: Request,
    signature_data: str = None,
    db: Session = Depends(get_db),
):
    from app.models.contracts import Contract
    from app.models.portal import ClientPortalAccount, PortalNotification
    from datetime import datetime, timezone

    try:
        contract_id = UUID(token)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid token")

    contract = db.query(Contract).filter(
        Contract.id == contract_id,
        Contract.status == "sent",
    ).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found or already signed")

    contract.status = "signed"
    contract.signature_data = signature_data
    contract.signed_at = datetime.now(timezone.utc)
    contract.signed_ip = request.client.host if request.client else None

    # Notify client
    account = db.query(ClientPortalAccount).filter_by(client_id=contract.client_id, is_active=True).first()
    if account:
        db.add(PortalNotification(
            portal_account_id=account.id,
            type="contract_signed",
            title="Contract Signed",
            message=f"Your contract {contract.reference} has been signed successfully.",
        ))

    db.commit()
    return {"message": "Contract signed successfully", "reference": contract.reference}
