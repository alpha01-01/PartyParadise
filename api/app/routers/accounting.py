from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Literal, Optional
from uuid import UUID
from datetime import date
from decimal import Decimal

from app.database import get_db
from app.schemas.types import Money
from app.dependencies import require_permission
from app.services.payments import ensure_period_open
from app.utils.audit import record_audit
from app.utils.references import generate_reference

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────

class CreateExpenseRequest(BaseModel):
    category_id: UUID
    description: str
    amount: Money = Field(..., gt=0)
    payment_method: str
    expense_date: date
    booking_id: Optional[UUID] = None
    supplier_id: Optional[UUID] = None
    receipt_url: Optional[str] = None
    notes: Optional[str] = None


class UpdateExpenseRequest(BaseModel):
    category_id: Optional[UUID] = None
    description: Optional[str] = None
    amount: Optional[Money] = Field(None, gt=0)
    payment_method: Optional[str] = None
    expense_date: Optional[date] = None
    booking_id: Optional[UUID] = None
    supplier_id: Optional[UUID] = None
    receipt_url: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["pending", "confirmed", "voided"]] = None


# ─── Expense categories ───────────────────────────────────────

@router.get("/categories")
def list_categories(
    db: Session = Depends(get_db),
    _=Depends(require_permission("accounting:read")),
):
    from app.models.accounting import ExpenseCategory
    return (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.is_active == True)
        .order_by(ExpenseCategory.name.asc())
        .all()
    )


# ─── Expenses ─────────────────────────────────────────────────

@router.get("/expenses")
def list_expenses(
    category_id: UUID = Query(None),
    booking_id: UUID = Query(None),
    from_date: date = Query(None),
    to_date: date = Query(None),
    search: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_permission("accounting:read")),
):
    from app.models.accounting import Expense
    from app.utils.pagination import paginate

    query = db.query(Expense).filter(Expense.status != "voided")

    if category_id:
        query = query.filter(Expense.category_id == category_id)
    if booking_id:
        query = query.filter(Expense.booking_id == booking_id)
    if from_date:
        query = query.filter(Expense.expense_date >= from_date)
    if to_date:
        query = query.filter(Expense.expense_date <= to_date)
    if search:
        query = query.filter(Expense.description.ilike(f"%{search}%"))

    return paginate(query.order_by(Expense.expense_date.desc()), page, page_size)


def _void_expense(db: Session, expense, user) -> None:
    """Voided expenses leave the ledger. The audit row keeps what was removed."""
    from app.models.accounting import JournalEntry

    expense.status = "voided"
    (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type == "expense",
            JournalEntry.source_id == expense.id,
        )
        .delete(synchronize_session=False)
    )
    record_audit(
        db,
        user_id=user.id,
        action="void",
        module="accounting",
        entity_type="expense",
        entity_id=expense.id,
        changes={"amount": expense.amount, "description": expense.description},
    )


@router.get("/expenses/{expense_id}")
def get_expense(
    expense_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("accounting:read")),
):
    from app.models.accounting import Expense

    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.post("/expenses", status_code=201)
def create_expense(
    data: CreateExpenseRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("accounting:create")),
):
    from app.models.accounting import Expense, JournalEntry

    period = ensure_period_open(db, data.expense_date)
    expense = Expense(
        recorded_by=current_user.id,
        reference=generate_reference("EXP", Expense, db),
        **data.model_dump(exclude_none=True),
    )
    db.add(expense)
    db.flush()

    # Auto-create journal entry for every confirmed expense
    db.add(JournalEntry(
        period_id=period.id if period else None,
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


@router.patch("/expenses/{expense_id}")
def update_expense(
    expense_id: UUID,
    data: UpdateExpenseRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("accounting:update")),
):
    from app.models.accounting import Expense, JournalEntry

    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.status == "voided":
        raise HTTPException(status_code=400, detail="Voided expenses cannot be edited")
    ensure_period_open(db, expense.expense_date)
    if data.expense_date:
        ensure_period_open(db, data.expense_date)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(expense, field, value)

    if data.status == "voided":
        _void_expense(db, expense, current_user)
        db.commit()
        db.refresh(expense)
        return expense

    journal = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.source_type == "expense",
            JournalEntry.source_id == expense.id,
        )
        .first()
    )
    if journal:
        journal.description = expense.description
        journal.amount = expense.amount
        journal.entry_date = expense.expense_date
    elif expense.status == "confirmed":
        db.add(JournalEntry(
            created_by=expense.recorded_by,
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


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("accounting:delete")),
):
    from app.models.accounting import Expense

    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    ensure_period_open(db, expense.expense_date)

    _void_expense(db, expense, current_user)
    db.commit()


# ─── Journal entries ──────────────────────────────────────────

@router.get("/journal")
def list_journal_entries(
    type: str = Query(None),
    from_date: date = Query(None),
    to_date: date = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_permission("accounting:read")),
):
    from app.models.accounting import JournalEntry
    from app.utils.pagination import paginate

    query = db.query(JournalEntry)
    if type:
        query = query.filter(JournalEntry.type == type)
    if from_date:
        query = query.filter(JournalEntry.entry_date >= from_date)
    if to_date:
        query = query.filter(JournalEntry.entry_date <= to_date)

    return paginate(query.order_by(JournalEntry.entry_date.desc()), page, page_size)


# ─── Bank accounts ────────────────────────────────────────────

@router.get("/bank-accounts")
def list_bank_accounts(
    db: Session = Depends(get_db),
    _=Depends(require_permission("accounting:read")),
):
    from app.models.accounting import BankAccount
    return (
        db.query(BankAccount)
        .filter(BankAccount.is_active == True)
        .order_by(BankAccount.name.asc())
        .all()
    )


@router.get("/bank-accounts/{account_id}/transactions")
def list_bank_transactions(
    account_id: UUID,
    from_date: date = Query(None),
    to_date: date = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_permission("accounting:read")),
):
    from app.models.accounting import BankTransaction, BankAccount
    from app.utils.pagination import paginate

    account = db.query(BankAccount).filter(BankAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Bank account not found")

    query = db.query(BankTransaction).filter(BankTransaction.account_id == account_id)
    if from_date:
        query = query.filter(BankTransaction.transaction_date >= from_date)
    if to_date:
        query = query.filter(BankTransaction.transaction_date <= to_date)

    return paginate(query.order_by(BankTransaction.transaction_date.desc()), page, page_size)
