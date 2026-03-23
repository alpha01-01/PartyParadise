from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Integer, Numeric, Date, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.database import Base
import uuid


class Booking(Base):
    __tablename__ = "bookings"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id       = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reference       = Column(String(20), nullable=False, unique=True)
    service_type    = Column(String(30), nullable=False)
    status          = Column(String(30), nullable=False, default="inquiry")
    event_date      = Column(Date, nullable=False)
    start_time      = Column(Time, nullable=True)
    end_time        = Column(Time, nullable=True)
    venue_name      = Column(String(200), nullable=True)
    venue_address   = Column(Text, nullable=True)
    event_type      = Column(String(50), nullable=True)
    guest_count     = Column(Integer, nullable=True)
    special_requests= Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    client          = relationship("Client", back_populates="bookings")
    services        = relationship("BookingService", back_populates="booking", cascade="all, delete-orphan")
    equipment       = relationship("BookingEquipment", back_populates="booking", cascade="all, delete-orphan")
    staff           = relationship("BookingStaff", back_populates="booking", cascade="all, delete-orphan")
    notes           = relationship("BookingNote", back_populates="booking", cascade="all, delete-orphan")
    invoices        = relationship("Invoice", back_populates="booking")
    quotes          = relationship("Quote", back_populates="booking")
    contracts       = relationship("Contract", back_populates="booking")
    shifts          = relationship("Shift", back_populates="booking")
    expenses        = relationship("Expense", back_populates="booking")
    inventory_txns  = relationship("InventoryTransaction", back_populates="booking")


class BookingService(Base):
    __tablename__ = "booking_services"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id   = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    service      = Column(String(100), nullable=False)
    description  = Column(Text, nullable=True)
    price        = Column(Numeric(12, 2), nullable=False)
    pricing_type = Column(String(20), nullable=False, default="fixed")

    booking      = relationship("Booking", back_populates="services")
    invoice_items= relationship("InvoiceItem", back_populates="booking_service")


class BookingEquipment(Base):
    __tablename__ = "booking_equipment"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id   = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    equipment_id = Column(UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="RESTRICT"), nullable=False)
    quantity     = Column(Integer, nullable=False, default=1)
    status       = Column(String(20), nullable=False, default="reserved")

    booking      = relationship("Booking", back_populates="equipment")
    equipment    = relationship("Equipment", back_populates="bookings")


class BookingStaff(Base):
    __tablename__ = "booking_staff"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id  = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    role        = Column(String(50), nullable=False)
    report_time = Column(Time, nullable=True)
    status      = Column(String(20), nullable=False, default="assigned")

    booking     = relationship("Booking", back_populates="staff")
    user        = relationship("User")


class BookingNote(Base):
    __tablename__ = "booking_notes"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id  = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note        = Column(Text, nullable=False)
    is_internal = Column(Boolean, nullable=False, default=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking     = relationship("Booking", back_populates="notes")
    user        = relationship("User")
