from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Numeric, Date, Index, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.database import Base
import uuid


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name      = Column(String(100), nullable=False, unique=True)
    type      = Column(String(20), nullable=False)
    color     = Column(String(7), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    expenses  = relationship("Expense", back_populates="category")


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        Index("idx_expenses_recorded_by", "recorded_by"),
        Index("idx_expenses_supplier_id", "supplier_id"),
        UniqueConstraint("reference", name="uq_expenses_reference"),
        CheckConstraint("amount > 0", name="ck_expenses_amount"),
        CheckConstraint("status IN ('pending', 'confirmed', 'voided')", name="ck_expenses_status"),
        Index("idx_expenses_booking_id", "booking_id"),
        Index("idx_expenses_category_id", "category_id"),
        Index("idx_expenses_expense_date", "expense_date"),
    )

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id    = Column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False)
    recorded_by    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    booking_id     = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True)
    supplier_id    = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    reference      = Column(String(20), nullable=True)
    description    = Column(String(250), nullable=False)
    amount         = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30), nullable=False)
    status         = Column(String(20), nullable=False, default="confirmed")
    expense_date   = Column(Date, nullable=False)
    receipt_url    = Column(Text, nullable=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    category       = relationship("ExpenseCategory", back_populates="expenses")
    recorder       = relationship("User")
    booking        = relationship("Booking", back_populates="expenses")
    supplier       = relationship("Supplier", back_populates="expenses")


class AccountPeriod(Base):
    __tablename__ = "account_periods"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    label          = Column(String(50), nullable=False, unique=True)
    start_date     = Column(Date, nullable=False)
    end_date       = Column(Date, nullable=False)
    status         = Column(String(20), nullable=False, default="open")
    total_income   = Column(Numeric(12, 2), nullable=False, default=0)
    total_expenses = Column(Numeric(12, 2), nullable=False, default=0)
    net_profit     = Column(Numeric(12, 2), nullable=False, default=0)
    closed_at      = Column(DateTime(timezone=True), nullable=True)

    journal_entries= relationship("JournalEntry", back_populates="period")


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        Index("idx_journal_entries_created_by", "created_by"),
        CheckConstraint("amount >= 0", name="ck_journal_entries_amount"),
        CheckConstraint("type IN ('income', 'expense')", name="ck_journal_entries_type"),
        Index("idx_journal_entries_entry_date", "entry_date"),
        Index("idx_journal_entries_period_id", "period_id"),
        Index("idx_journal_entries_type", "type"),
    )

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id    = Column(UUID(as_uuid=True), ForeignKey("account_periods.id", ondelete="SET NULL"), nullable=True)
    created_by   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)  # NULL for webhook payments
    reference    = Column(String(50), nullable=True)
    type         = Column(String(20), nullable=False)
    description  = Column(String(250), nullable=False)
    amount       = Column(Numeric(12, 2), nullable=False)
    source_type  = Column(String(30), nullable=True)
    source_id    = Column(UUID(as_uuid=True), nullable=True)
    entry_date   = Column(Date, nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    period       = relationship("AccountPeriod", back_populates="journal_entries")
    creator      = relationship("User")
    bank_transaction = relationship("BankTransaction", back_populates="journal_entry", uselist=False)


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(100), nullable=False)
    bank_name       = Column(String(100), nullable=True)
    account_number  = Column(String(50), nullable=True)
    account_type    = Column(String(30), nullable=False)
    current_balance = Column(Numeric(12, 2), nullable=False, default=0)
    currency        = Column(String(5), nullable=False, default="GHS")
    is_active       = Column(Boolean, nullable=False, default=True)

    transactions    = relationship("BankTransaction", back_populates="account", cascade="all, delete-orphan")


class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    __table_args__ = (
        Index("idx_bank_transactions_journal_entry_id", "journal_entry_id"),
        Index("idx_bank_transactions_account_id", "account_id"),
    )

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id       = Column(UUID(as_uuid=True), ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False)
    journal_entry_id = Column(UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True)
    type             = Column(String(10), nullable=False)
    amount           = Column(Numeric(12, 2), nullable=False)
    balance_after    = Column(Numeric(12, 2), nullable=False)
    description      = Column(String(250), nullable=False)
    transaction_date = Column(Date, nullable=False)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    account          = relationship("BankAccount", back_populates="transactions")
    journal_entry    = relationship("JournalEntry", back_populates="bank_transaction")
