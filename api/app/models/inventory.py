from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Integer, Numeric, Date, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.database import Base
import uuid


class Supplier(Base):
    __tablename__ = "suppliers"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name         = Column(String(150), nullable=False)
    contact_name = Column(String(100), nullable=True)
    phone        = Column(String(20), nullable=True)
    email        = Column(String(255), nullable=True)
    category     = Column(String(50), nullable=True)
    notes        = Column(Text, nullable=True)

    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")
    expenses        = relationship("Expense", back_populates="supplier")


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        CheckConstraint("quantity_in_stock >= 0 AND reorder_level >= 0", name="ck_inventory_items_quantities"),
        Index("idx_inventory_items_category", "category"),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name              = Column(String(150), nullable=False)
    sku               = Column(String(50), nullable=True, unique=True)
    category          = Column(String(50), nullable=False)
    unit              = Column(String(20), nullable=False)
    quantity_in_stock = Column(Integer, nullable=False, default=0)
    reorder_level     = Column(Integer, nullable=False, default=0)
    unit_cost         = Column(Numeric(12, 2), nullable=True)
    unit_price        = Column(Numeric(12, 2), nullable=True)
    location          = Column(String(100), nullable=True)
    is_active         = Column(Boolean, nullable=False, default=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at        = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    transactions      = relationship("InventoryTransaction", back_populates="item")
    order_items       = relationship("PurchaseOrderItem", back_populates="item")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"
    __table_args__ = (
        Index("idx_inventory_transactions_booking_id", "booking_id"),
        Index("idx_inventory_transactions_user_id", "user_id"),
        Index("idx_inventory_transactions_item_id", "item_id"),
    )

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id    = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True)
    type       = Column(String(30), nullable=False)
    quantity   = Column(Integer, nullable=False)
    reason     = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    item       = relationship("InventoryItem", back_populates="transactions")
    user       = relationship("User")
    booking    = relationship("Booking", back_populates="inventory_txns")


class Equipment(Base):
    __tablename__ = "equipment"
    __table_args__ = (
        Index("idx_equipment_status", "status"),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(150), nullable=False)
    category        = Column(String(50), nullable=False)
    serial_number   = Column(String(100), nullable=True, unique=True)
    status          = Column(String(30), nullable=False, default="available")
    condition       = Column(String(20), nullable=False, default="good")
    purchase_cost   = Column(Numeric(12, 2), nullable=True)
    purchased_at    = Column(Date, nullable=True)
    last_serviced_at= Column(Date, nullable=True)
    notes           = Column(Text, nullable=True)
    is_active       = Column(Boolean, nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    bookings        = relationship("BookingEquipment", back_populates="equipment")
    maintenance     = relationship("EquipmentMaintenance", back_populates="equipment", cascade="all, delete-orphan")


class EquipmentMaintenance(Base):
    __tablename__ = "equipment_maintenance"
    __table_args__ = (
        Index("idx_equipment_maintenance_equipment_id", "equipment_id"),
        Index("idx_equipment_maintenance_user_id", "user_id"),
    )

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    equipment_id   = Column(UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    type           = Column(String(30), nullable=False)
    description    = Column(Text, nullable=False)
    cost           = Column(Numeric(12, 2), nullable=True)
    serviced_at    = Column(Date, nullable=False)
    next_service_at= Column(Date, nullable=True)

    equipment      = relationship("Equipment", back_populates="maintenance")
    user           = relationship("User")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    __table_args__ = (
        Index("idx_purchase_orders_created_by", "created_by"),
        Index("idx_purchase_orders_supplier_id", "supplier_id"),
    )

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id  = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False)
    created_by   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reference    = Column(String(20), nullable=False, unique=True)
    status       = Column(String(20), nullable=False, default="draft")
    total_amount = Column(Numeric(12, 2), nullable=True)
    expected_at  = Column(Date, nullable=True)
    received_at  = Column(Date, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    supplier     = relationship("Supplier", back_populates="purchase_orders")
    creator      = relationship("User")
    items        = relationship("PurchaseOrderItem", back_populates="order", cascade="all, delete-orphan")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    __table_args__ = (
        Index("idx_purchase_order_items_item_id", "item_id"),
        Index("idx_purchase_order_items_order_id", "order_id"),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id          = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    item_id           = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False)
    quantity_ordered  = Column(Integer, nullable=False)
    quantity_received = Column(Integer, nullable=False, default=0)
    unit_cost         = Column(Numeric(12, 2), nullable=False)

    order             = relationship("PurchaseOrder", back_populates="items")
    item              = relationship("InventoryItem", back_populates="order_items")
