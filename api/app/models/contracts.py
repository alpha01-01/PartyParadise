from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Integer, Numeric, Date, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.database import Base
import uuid


class ContractTemplate(Base):
    __tablename__ = "contract_templates"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name         = Column(String(150), nullable=False)
    service_type = Column(String(30), nullable=True)
    body         = Column(Text, nullable=False)
    is_active    = Column(Boolean, nullable=False, default=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    contracts    = relationship("Contract", back_populates="template")


class Contract(Base):
    __tablename__ = "contracts"
    __table_args__ = (
        Index("idx_contracts_created_by", "created_by"),
        Index("idx_contracts_template_id", "template_id"),
        Index("idx_contracts_booking_id", "booking_id"),
        Index("idx_contracts_client_id", "client_id"),
        Index("idx_contracts_status", "status"),
    )

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id     = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="RESTRICT"), nullable=False)
    client_id      = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    template_id    = Column(UUID(as_uuid=True), ForeignKey("contract_templates.id", ondelete="SET NULL"), nullable=True)
    created_by     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reference      = Column(String(20), nullable=False, unique=True)
    status         = Column(String(20), nullable=False, default="draft")
    body           = Column(Text, nullable=False)
    client_name    = Column(String(150), nullable=False)
    client_phone   = Column(String(20), nullable=True)
    event_date     = Column(Date, nullable=False)
    venue          = Column(String(250), nullable=True)
    total_amount   = Column(Numeric(12, 2), nullable=False)
    deposit_amount = Column(Numeric(12, 2), nullable=True)
    special_terms  = Column(Text, nullable=True)
    sent_at        = Column(DateTime(timezone=True), nullable=True)
    signed_at      = Column(DateTime(timezone=True), nullable=True)
    signature_data = Column(Text, nullable=True)
    signed_ip      = Column(String(45), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    booking        = relationship("Booking", back_populates="contracts")
    client         = relationship("Client")
    template       = relationship("ContractTemplate", back_populates="contracts")
    creator        = relationship("User")


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("idx_documents_uploaded_by", "uploaded_by"),
        Index("idx_documents_booking_id", "booking_id"),
        Index("idx_documents_client_id", "client_id"),
    )

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id          = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True)
    client_id           = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    uploaded_by         = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    name                = Column(String(200), nullable=False)
    type                = Column(String(30), nullable=False)
    file_url            = Column(Text, nullable=False)
    mime_type           = Column(String(50), nullable=True)
    file_size           = Column(Integer, nullable=True)
    is_visible_to_client= Column(Boolean, nullable=False, default=False)
    created_at          = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking             = relationship("Booking")
    client              = relationship("Client")
    uploader            = relationship("User")
