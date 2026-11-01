from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Integer, Numeric, Date, Index, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.database import Base
import uuid


class Quote(Base):
    __tablename__ = "quotes"
    __table_args__ = (
        Index("idx_quotes_client_id", "client_id"),
        Index("idx_quotes_created_by", "created_by"),
        Index("idx_quotes_booking_id", "booking_id"),
    )

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id   = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True)
    client_id    = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    created_by   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reference    = Column(String(20), nullable=False, unique=True)
    status       = Column(String(20), nullable=False, default="draft")
    total_amount = Column(Numeric(12, 2), nullable=False)
    issued_at    = Column(Date, nullable=True)
    expires_at   = Column(Date, nullable=True)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking      = relationship("Booking", back_populates="quotes")
    client       = relationship("Client")
    creator      = relationship("User")
    items        = relationship("QuoteItem", back_populates="quote", cascade="all, delete-orphan")


class QuoteItem(Base):
    __tablename__ = "quote_items"
    __table_args__ = (
        Index("idx_quote_items_quote_id", "quote_id"),
    )

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id    = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False)
    description = Column(String(200), nullable=False)
    quantity    = Column(Integer, nullable=False, default=1)
    unit_price  = Column(Numeric(12, 2), nullable=False)
    total_price = Column(Numeric(12, 2), nullable=False)

    quote       = relationship("Quote", back_populates="items")


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        Index("idx_invoices_created_by", "created_by"),
        CheckConstraint("status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled')", name="ck_invoices_status"),
        CheckConstraint(
            "subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 "
            "AND amount_paid >= 0 AND amount_paid <= total_amount",
            name="ck_invoices_amounts",
        ),
        Index("idx_invoices_booking_id", "booking_id"),
        Index("idx_invoices_client_id", "client_id"),
        Index("idx_invoices_due_date", "due_date"),
        Index("idx_invoices_status", "status"),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id      = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True)
    client_id       = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reference       = Column(String(20), nullable=False, unique=True)
    status          = Column(String(20), nullable=False, default="draft")
    subtotal        = Column(Numeric(12, 2), nullable=False)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0)
    tax_amount      = Column(Numeric(12, 2), nullable=False, default=0)
    total_amount    = Column(Numeric(12, 2), nullable=False)
    amount_paid     = Column(Numeric(12, 2), nullable=False, default=0)
    issued_at       = Column(Date, nullable=True)
    due_date        = Column(Date, nullable=True)
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # amount_due is always computed: total_amount - amount_paid
    @property
    def amount_due(self):
        return (self.total_amount or 0) - (self.amount_paid or 0)

    booking         = relationship("Booking", back_populates="invoices")
    client          = relationship("Client", back_populates="invoices")
    creator         = relationship("User")
    items           = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments        = relationship("Payment", back_populates="invoice")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    __table_args__ = (
        Index("idx_invoice_items_booking_service_id", "booking_service_id"),
        Index("idx_invoice_items_invoice_id", "invoice_id"),
        CheckConstraint("quantity > 0 AND unit_price >= 0 AND total_price >= 0", name="ck_invoice_items_amounts"),
    )


    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id         = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    booking_service_id = Column(UUID(as_uuid=True), ForeignKey("booking_services.id", ondelete="SET NULL"), nullable=True)
    description        = Column(String(200), nullable=False)
    quantity           = Column(Integer, nullable=False, default=1)
    unit_price         = Column(Numeric(12, 2), nullable=False)
    total_price        = Column(Numeric(12, 2), nullable=False)

    invoice            = relationship("Invoice", back_populates="items")
    booking_service    = relationship("BookingService", back_populates="invoice_items")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        Index("idx_payments_received_by", "received_by"),
        UniqueConstraint("provider_ref", name="uq_payments_provider_ref"),
        UniqueConstraint("reference", name="uq_payments_reference"),
        CheckConstraint("amount > 0", name="ck_payments_amount"),
        CheckConstraint("status IN ('pending', 'confirmed', 'failed', 'refunded')", name="ck_payments_status"),
        CheckConstraint("method IN ('momo_mtn', 'momo_vodafone', 'momo_airteltigo', 'bank_transfer', 'cash', 'paystack', 'cheque')", name="ck_payments_method"),
        CheckConstraint("source IN ('staff', 'webhook', 'shop')", name="ck_payments_source"),
        Index("idx_payments_invoice_id", "invoice_id"),
    )

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id   = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False)
    received_by  = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)  # NULL for webhook payments
    reference    = Column(String(50), nullable=True)
    amount       = Column(Numeric(12, 2), nullable=False)
    method       = Column(String(30), nullable=False)
    status       = Column(String(20), nullable=False, default="confirmed")
    source       = Column(String(20), nullable=False, default="staff", server_default="staff")
    provider_ref = Column(String(100), nullable=True)
    paid_at      = Column(Date, nullable=False)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice      = relationship("Invoice", back_populates="payments")
    receiver     = relationship("User")
