from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import date
from decimal import Decimal
import csv
import io
import json
import zipfile
from xml.etree import ElementTree as ET

from app.database import get_db
from app.schemas.types import Money
from app.dependencies import has_permission, require_permission
from app.services.payments import add_income_journal, validate_payment_method
from app.utils.references import generate_reference
from app.utils.shop_sales import parse_shop_sale_meta

router = APIRouter()

LIST_LIMIT = 500
MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_UNZIPPED_BYTES = 50 * 1024 * 1024


# ─── Schemas ──────────────────────────────────────────────────

class CreateInventoryItemRequest(BaseModel):
    name: str
    sku: Optional[str] = None
    category: str
    unit: str
    reorder_level: int = Field(0, ge=0)
    initial_quantity: int = Field(0, ge=0)
    unit_cost: Optional[Money] = Field(None, ge=0)
    unit_price: Optional[Money] = Field(None, ge=0)
    location: Optional[str] = None


class UpdateInventoryItemRequest(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    reorder_level: Optional[int] = Field(None, ge=0)
    unit_cost: Optional[Money] = Field(None, ge=0)
    unit_price: Optional[Money] = Field(None, ge=0)
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
    purchase_cost: Optional[Money] = None
    purchased_at: Optional[date] = None
    notes: Optional[str] = None


class LogMaintenanceRequest(BaseModel):
    type: str           # routine | repair | inspection | cleaning
    description: str
    cost: Optional[Money] = None
    serviced_at: date
    next_service_at: Optional[date] = None


class ShopSaleItemRequest(BaseModel):
    item_id: UUID
    quantity: int
    unit_price: Optional[Money] = Field(None, ge=0)


class CreateShopSaleRequest(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    payment_method: str = "cash"
    paid_at: Optional[date] = None
    notes: Optional[str] = None
    items: list[ShopSaleItemRequest]


def _normalise_header(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


def _cell_to_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _optional_decimal(value: str, field: str) -> Optional[Decimal]:
    raw = _cell_to_text(value)
    if not raw:
        return None
    try:
        return Decimal(raw)
    except Exception as exc:
        raise ValueError(f"{field} must be a valid number") from exc


def _required_text(row: dict, field: str) -> str:
    value = _cell_to_text(row.get(field))
    if not value:
        raise ValueError(f"{field} is required")
    return value


def _non_negative_int(value: str, field: str, default: int = 0) -> int:
    raw = _cell_to_text(value)
    if not raw:
        return default
    try:
        parsed = int(Decimal(raw))
    except Exception as exc:
        raise ValueError(f"{field} must be a whole number") from exc
    if parsed < 0:
        raise ValueError(f"{field} must be 0 or greater")
    return parsed


def _parse_csv_rows(file_bytes: bytes) -> list[dict]:
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = file_bytes.decode("cp1252")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="Could not read the file. Save it as UTF-8 CSV") from exc

    try:
        rows = list(csv.DictReader(io.StringIO(text)))
    except csv.Error as exc:
        raise HTTPException(status_code=400, detail="Invalid CSV file") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Import file must include a header row")
    reader.fieldnames = [_normalise_header(name) for name in reader.fieldnames]
    # Cells beyond the header row land under a None key and are ignored
    return [
        {_normalise_header(key): value for key, value in row.items() if key is not None}
        for row in rows
    ]


def _parse_xlsx_rows(file_bytes: bytes) -> list[dict]:
    ns = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
    }

    def col_to_index(cell_ref: str) -> int:
        letters = "".join(ch for ch in cell_ref if ch.isalpha())
        index = 0
        for ch in letters:
            index = index * 26 + (ord(ch.upper()) - 64)
        return max(index - 1, 0)

    def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
        if "xl/sharedStrings.xml" not in archive.namelist():
            return []
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        values = []
        for item in root.findall("main:si", ns):
            parts = item.findall(".//main:t", ns)
            values.append("".join(part.text or "" for part in parts))
        return values

    def sheet_path(archive: zipfile.ZipFile) -> str:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        first_sheet = workbook.find("main:sheets/main:sheet", ns)
        if first_sheet is None:
            raise HTTPException(status_code=400, detail="Excel workbook has no sheets")
        rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        for rel in rels.findall("pkgrel:Relationship", ns):
            if rel.attrib.get("Id") == rel_id:
                target = rel.attrib.get("Target", "")
                return target if target.startswith("xl/") else f"xl/{target}"
        raise HTTPException(status_code=400, detail="Could not read worksheet from Excel file")

    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        if sum(entry.file_size for entry in archive.infolist()) > MAX_UNZIPPED_BYTES:
            raise HTTPException(status_code=413, detail="Excel file is too large once unzipped")
        for entry in archive.infolist():
            if entry.filename.endswith(".xml") and b"<!DOCTYPE" in archive.read(entry):
                raise HTTPException(status_code=400, detail="Invalid Excel file")

        strings = read_shared_strings(archive)
        sheet_xml = archive.read(sheet_path(archive))
        root = ET.fromstring(sheet_xml)
        rows = []
        parsed_rows: list[list[str]] = []

        for row in root.findall(".//main:sheetData/main:row", ns):
            values: list[str] = []
            for cell in row.findall("main:c", ns):
                index = col_to_index(cell.attrib.get("r", "A1"))
                while len(values) <= index:
                    values.append("")
                cell_type = cell.attrib.get("t")
                value_node = cell.find("main:v", ns)
                inline_node = cell.find("main:is/main:t", ns)
                raw = ""
                if cell_type == "s" and value_node is not None and value_node.text is not None:
                    shared_index = int(value_node.text)
                    raw = strings[shared_index] if 0 <= shared_index < len(strings) else ""
                elif inline_node is not None and inline_node.text is not None:
                    raw = inline_node.text
                elif value_node is not None and value_node.text is not None:
                    raw = value_node.text
                values[index] = raw.strip()
            parsed_rows.append(values)

        if not parsed_rows:
            raise HTTPException(status_code=400, detail="Excel file is empty")

        headers = [_normalise_header(value) for value in parsed_rows[0]]
        if not any(headers):
            raise HTTPException(status_code=400, detail="Import file must include a header row")

        for row_values in parsed_rows[1:]:
            row = {}
            for index, header in enumerate(headers):
                if header:
                    row[header] = row_values[index] if index < len(row_values) else ""
            rows.append(row)
        return rows


def _shop_sale_meta(customer_name: Optional[str], customer_phone: Optional[str], notes: Optional[str]) -> str:
    payload = {
        "type": "shop_sale",
        "customer_name": (customer_name or "").strip() or None,
        "customer_phone": (customer_phone or "").strip() or None,
        "notes": (notes or "").strip() or None,
    }
    return json.dumps(payload)


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
    current_user=Depends(require_permission("inventory:create")),
):
    from app.models.inventory import InventoryItem, InventoryTransaction

    payload = data.model_dump(exclude_none=True)
    initial_quantity = payload.pop("initial_quantity", 0)

    item = InventoryItem(
        quantity_in_stock=initial_quantity,
        **payload,
    )
    db.add(item)
    db.flush()

    if initial_quantity > 0:
        db.add(InventoryTransaction(
            item_id=item.id,
            user_id=current_user.id,
            type="purchase",
            quantity=initial_quantity,
            reason="Opening stock",
        ))

    db.commit()
    db.refresh(item)
    return item


@router.post("/items/import", status_code=201)
def import_items(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("inventory:create")),
):
    from app.models.inventory import InventoryItem, InventoryTransaction

    filename = file.filename or "inventory-import"
    file_bytes = file.file.read(MAX_IMPORT_BYTES + 1)
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Import file is empty")
    if len(file_bytes) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Import file is too large. The limit is 5 MB")

    lower_name = filename.lower()
    if lower_name.endswith(".csv"):
        rows = _parse_csv_rows(file_bytes)
    elif lower_name.endswith(".xlsx"):
        try:
            rows = _parse_xlsx_rows(file_bytes)
        except (zipfile.BadZipFile, KeyError, ValueError, IndexError, ET.ParseError) as exc:
            raise HTTPException(status_code=400, detail="Invalid Excel file") from exc
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload CSV or XLSX")

    imported = 0
    errors = []

    for index, row in enumerate(rows, start=2):
        if not any(_cell_to_text(value) for value in row.values()):
            continue

        try:
            name = _required_text(row, "name")
            category = _required_text(row, "category")
            unit = _required_text(row, "unit")
            sku = _cell_to_text(row.get("sku")) or None
            reorder_level = _non_negative_int(row.get("reorder_level"), "reorder_level")
            initial_quantity = _non_negative_int(
                row.get("initial_quantity", row.get("opening_stock")),
                "initial_quantity",
            )
            unit_cost = _optional_decimal(row.get("unit_cost"), "unit_cost")
            unit_price = _optional_decimal(row.get("unit_price"), "unit_price")
            location = _cell_to_text(row.get("location")) or None

            with db.begin_nested():
                if sku:
                    existing = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
                    if existing:
                        raise ValueError(f"sku '{sku}' already exists")

                item = InventoryItem(
                    name=name,
                    sku=sku,
                    category=category,
                    unit=unit,
                    reorder_level=reorder_level,
                    quantity_in_stock=initial_quantity,
                    unit_cost=unit_cost,
                    unit_price=unit_price,
                    location=location,
                )
                db.add(item)
                db.flush()

                if initial_quantity > 0:
                    db.add(InventoryTransaction(
                        item_id=item.id,
                        user_id=current_user.id,
                        type="purchase",
                        quantity=initial_quantity,
                        reason="Opening stock import",
                    ))

            imported += 1
        except ValueError as exc:
            errors.append({"row": index, "message": str(exc)})
        except (DataError, IntegrityError):
            errors.append({"row": index, "message": "A value is too long or duplicates an existing item"})

    if imported == 0 and errors:
        db.rollback()
        raise HTTPException(status_code=400, detail={
            "message": "No inventory items were imported",
            "errors": errors[:25],
        })

    db.commit()
    return {
        "filename": filename,
        "imported": imported,
        "failed": len(errors),
        "errors": errors[:25],
        "required_columns": ["name", "category", "unit"],
        "optional_columns": ["sku", "reorder_level", "initial_quantity", "opening_stock", "unit_cost", "unit_price", "location"],
    }


@router.get("/shop-sales")
def list_shop_sales(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    from app.models.invoicing import Invoice

    invoices = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.client),
            selectinload(Invoice.items),
            selectinload(Invoice.payments),
        )
        .filter(Invoice.reference.like("SALE-%"))
        .order_by(Invoice.created_at.desc())
        .limit(limit)
        .all()
    )

    results = []
    for invoice in invoices:
        meta = parse_shop_sale_meta(invoice.notes)
        client_name = None
        if getattr(invoice, "client", None):
            first = invoice.client.first_name or ""
            last = invoice.client.last_name or ""
            client_name = f"{first} {last}".strip() or None
        results.append({
            "id": str(invoice.id),
            "reference": invoice.reference,
            "status": invoice.status,
            "total_amount": float(invoice.total_amount or 0),
            "amount_paid": float(invoice.amount_paid or 0),
            "payment_method": invoice.payments[0].method if invoice.payments else None,
            "paid_at": str(invoice.payments[0].paid_at) if invoice.payments else None,
            "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
            "customer_name": meta.get("customer_name") or client_name or "Walk-in Customer",
            "customer_phone": meta.get("customer_phone"),
            "notes": meta.get("notes"),
            "item_count": sum(item.quantity for item in (invoice.items or [])),
        })
    return results


@router.post("/shop-sales", status_code=201)
def create_shop_sale(
    data: CreateShopSaleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("inventory:update")),
):
    from app.models.clients import Client
    from app.models.inventory import InventoryItem, InventoryTransaction
    from app.models.invoicing import Invoice, InvoiceItem, Payment

    if not data.items:
        raise HTTPException(status_code=400, detail="At least one shop item is required")
    validate_payment_method(data.payment_method)

    walk_in = (
        db.query(Client)
        .filter(
            Client.first_name == "Walk-in",
            Client.last_name == "Customer",
            Client.source == "shop",
        )
        .first()
    )
    if not walk_in:
        walk_in = Client(
            first_name="Walk-in",
            last_name="Customer",
            source="shop",
            status="active",
            client_type="individual",
        )
        db.add(walk_in)
        db.flush()

    subtotal = Decimal("0")
    line_items = []
    sold = {}  # item id -> quantity already on this sale

    for entry in data.items:
        if entry.quantity <= 0:
            raise HTTPException(status_code=400, detail="Sale quantities must be greater than zero")

        item = (
            db.query(InventoryItem)
            .filter(InventoryItem.id == entry.item_id, InventoryItem.is_active == True)
            .with_for_update()
            .first()
        )
        if not item:
            raise HTTPException(status_code=404, detail="One or more inventory items were not found")
        sold[item.id] = sold.get(item.id, 0) + entry.quantity
        if item.quantity_in_stock < sold[item.id]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {item.name}. Available: {item.quantity_in_stock}",
            )

        unit_price = entry.unit_price if entry.unit_price is not None else item.unit_price
        if unit_price is None:
            raise HTTPException(status_code=400, detail=f"{item.name} is missing a unit price")
        if unit_price != item.unit_price and not has_permission(db, current_user, "invoices:update"):
            raise HTTPException(status_code=403, detail="You cannot change the price of a shop item")

        total_price = unit_price * entry.quantity
        subtotal += total_price
        line_items.append((item, entry.quantity, unit_price, total_price))

    paid_at = data.paid_at or date.today()
    invoice = Invoice(
        client_id=walk_in.id,
        created_by=current_user.id,
        reference=generate_reference("SALE", Invoice, db),
        status="paid",
        subtotal=subtotal,
        discount_amount=Decimal("0"),
        tax_amount=Decimal("0"),
        total_amount=subtotal,
        amount_paid=subtotal,
        issued_at=paid_at,
        due_date=paid_at,
        notes=_shop_sale_meta(data.customer_name, data.customer_phone, data.notes),
    )
    db.add(invoice)
    db.flush()

    for item, quantity, unit_price, total_price in line_items:
        db.add(InvoiceItem(
            invoice_id=invoice.id,
            description=item.name,
            quantity=quantity,
            unit_price=unit_price,
            total_price=total_price,
        ))
        item.quantity_in_stock -= quantity
        db.add(InventoryTransaction(
            item_id=item.id,
            user_id=current_user.id,
            type="usage",
            quantity=-quantity,
            reason=f"Shop sale {invoice.reference}",
        ))

    payment = Payment(
        invoice_id=invoice.id,
        received_by=current_user.id,
        reference=generate_reference("PAY", Payment, db),
        amount=subtotal,
        method=data.payment_method,
        status="confirmed",
        source="shop",
        paid_at=paid_at,
        notes=f"Retail counter sale {invoice.reference}",
    )
    db.add(payment)
    db.flush()
    add_income_journal(db, payment, f"Shop sale {invoice.reference}", current_user.id)

    db.commit()
    db.refresh(invoice)
    meta = parse_shop_sale_meta(invoice.notes)
    return {
        "id": str(invoice.id),
        "reference": invoice.reference,
        "status": invoice.status,
        "total_amount": float(invoice.total_amount or 0),
        "amount_paid": float(invoice.amount_paid or 0),
        "payment_method": data.payment_method,
        "paid_at": str(paid_at),
        "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
        "customer_name": meta.get("customer_name") or "Walk-in Customer",
        "customer_phone": meta.get("customer_phone"),
        "notes": meta.get("notes"),
        "item_count": sum(item.quantity for item in invoice.items),
    }


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

    direction = {
        "purchase": 1,
        "return": 1,
        "usage": -1,
        "damage": -1,
        "adjustment": 1,   # signed: a stocktake can find more or less
    }.get(data.type)
    if direction is None:
        raise HTTPException(status_code=400, detail="Invalid transaction type")
    if data.quantity == 0 or (data.quantity < 0 and data.type != "adjustment"):
        raise HTTPException(status_code=422, detail="Quantity must be greater than zero")

    item = (
        db.query(InventoryItem)
        .filter(InventoryItem.id == data.item_id)
        .with_for_update()   # lock row to prevent race conditions
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    signed_quantity = direction * data.quantity
    new_qty = item.quantity_in_stock + signed_quantity
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
        quantity=signed_quantity,
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

    return query.order_by(Equipment.name.asc()).limit(LIST_LIMIT).all()


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
    return db.query(Supplier).order_by(Supplier.name.asc()).limit(LIST_LIMIT).all()
