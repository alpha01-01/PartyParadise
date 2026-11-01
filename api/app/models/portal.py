from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Integer, Date, Index
from sqlalchemy.dialects.postgresql import UUID, INET
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.database import Base
import uuid


class ClientPortalAccount(Base):
    __tablename__ = "client_portal_accounts"
    __table_args__ = (
        Index("idx_portal_accounts_client_id", "client_id"),
    )

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id     = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True)
    email         = Column(String(255), nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    is_active     = Column(Boolean, nullable=False, default=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client        = relationship("Client", back_populates="portal_account")
    sessions      = relationship("PortalSession", back_populates="account", cascade="all, delete-orphan")
    notifications = relationship("PortalNotification", back_populates="account", cascade="all, delete-orphan")
    inquiries     = relationship("PortalInquiry", back_populates="account", cascade="all, delete-orphan")


class PortalSession(Base):
    __tablename__ = "portal_sessions"
    __table_args__ = (
        Index("idx_portal_sessions_portal_account_id", "portal_account_id"),
        Index("idx_portal_sessions_token_hash", "token_hash"),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portal_account_id = Column(UUID(as_uuid=True), ForeignKey("client_portal_accounts.id", ondelete="CASCADE"), nullable=False)
    token_hash        = Column(Text, nullable=False)
    device_info       = Column(Text, nullable=True)
    ip_address        = Column(INET, nullable=True)
    expires_at        = Column(DateTime(timezone=True), nullable=False)
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    account           = relationship("ClientPortalAccount", back_populates="sessions")


class PortalNotification(Base):
    __tablename__ = "portal_notifications"
    __table_args__ = (
        Index("idx_portal_notifications_account_id", "portal_account_id"),
        Index("idx_portal_notifications_is_read", "is_read"),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portal_account_id = Column(UUID(as_uuid=True), ForeignKey("client_portal_accounts.id", ondelete="CASCADE"), nullable=False)
    type              = Column(String(50), nullable=False)
    title             = Column(String(150), nullable=False)
    message           = Column(Text, nullable=False)
    action_url        = Column(String(250), nullable=True)
    is_read           = Column(Boolean, nullable=False, default=False)
    read_at           = Column(DateTime(timezone=True), nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    account           = relationship("ClientPortalAccount", back_populates="notifications")


class PortalInquiry(Base):
    __tablename__ = "portal_inquiries"
    __table_args__ = (
        Index("idx_portal_inquiries_portal_account_id", "portal_account_id"),
        Index("idx_portal_inquiries_client_id", "client_id"),
        Index("idx_portal_inquiries_status", "status"),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portal_account_id = Column(UUID(as_uuid=True), ForeignKey("client_portal_accounts.id", ondelete="CASCADE"), nullable=False)
    client_id         = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    subject           = Column(String(200), nullable=False)
    service_type      = Column(String(30), nullable=True)
    preferred_date    = Column(Date, nullable=True)
    venue             = Column(String(250), nullable=True)
    guest_count       = Column(Integer, nullable=True)
    message           = Column(Text, nullable=False)
    status            = Column(String(20), nullable=False, default="new")
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    account           = relationship("ClientPortalAccount", back_populates="inquiries")
    client            = relationship("Client")
