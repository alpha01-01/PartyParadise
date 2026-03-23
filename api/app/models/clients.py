from sqlalchemy import Column, String, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.database import Base
import uuid


class Client(Base):
    __tablename__ = "clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=True, unique=True)
    phone = Column(String(20), nullable=True)
    whatsapp = Column(String(20), nullable=True)
    source = Column(String(50), nullable=True)
    status = Column(String(30), nullable=False, default="lead")
    client_type = Column(String(30), nullable=True)
    notes = Column(Text, nullable=True)
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    addresses     = relationship("ClientAddress", back_populates="client", cascade="all, delete-orphan")
    interactions  = relationship("Interaction", back_populates="client", cascade="all, delete-orphan")
    tags          = relationship("ClientTag", back_populates="client", cascade="all, delete-orphan")
    bookings      = relationship("Booking", back_populates="client")
    invoices      = relationship("Invoice", back_populates="client")
    portal_account= relationship("ClientPortalAccount", back_populates="client", uselist=False)


class ClientAddress(Base):
    __tablename__ = "client_addresses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(50), nullable=True)
    street = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    region = Column(String(100), nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)

    client = relationship("Client", back_populates="addresses")


class Interaction(Base):
    __tablename__ = "interactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    channel = Column(String(30), nullable=False)
    direction = Column(String(10), nullable=False)
    summary = Column(Text, nullable=False)
    interacted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client = relationship("Client", back_populates="interactions")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), nullable=False, unique=True)
    color = Column(String(7), nullable=True)

    clients = relationship("ClientTag", back_populates="tag")


class ClientTag(Base):
    __tablename__ = "client_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

    client = relationship("Client", back_populates="tags")
    tag = relationship("Tag", back_populates="clients")
