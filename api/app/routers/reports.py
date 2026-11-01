from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import case, func, extract
from datetime import date, timedelta
from typing import Literal
from uuid import UUID
from decimal import Decimal

from app.database import get_db
from app.dependencies import require_permission

router = APIRouter()


def _period_range(period: str, today: date) -> tuple[date, date]:
    """The first day of a dashboard period, and the first day after it."""
    month_start = today.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)
    if period == "last_month":
        return (month_start - timedelta(days=1)).replace(day=1), month_start
    if period == "this_quarter":
        first_month = 3 * ((today.month - 1) // 3) + 1
        start = date(today.year, first_month, 1)
        end = date(today.year + 1, 1, 1) if first_month == 10 else date(today.year, first_month + 3, 1)
        return start, end
    if period == "this_year":
        return date(today.year, 1, 1), date(today.year + 1, 1, 1)
    return month_start, next_month


@router.get("/dashboard")
def dashboard_summary(
    period: Literal["this_month", "last_month", "this_quarter", "this_year"] = Query("this_month"),
    db: Session = Depends(get_db),
    _=Depends(require_permission("reports:read")),
):
    """High-level numbers for the dashboard home screen."""
    from app.models.bookings import Booking
    from app.models.invoicing import Invoice, Payment
    from app.models.clients import Client
    from datetime import date as today

    today_date = today.today()
    range_start, range_end = _period_range(period, today_date)

    # Bookings in the period
    bookings_this_month = (
        db.query(func.count(Booking.id))
        .filter(Booking.event_date >= range_start, Booking.event_date < range_end)
        .scalar()
    )

    # Upcoming bookings (next 30 days)
    upcoming = (
        db.query(func.count(Booking.id))
        .filter(
            Booking.event_date >= today_date,
            Booking.event_date <= today_date + timedelta(days=30),
            Booking.status.in_(["confirmed", "in_progress"]),
        )
        .scalar()
    )

    # Revenue this month
    revenue_this_month = (
        db.query(func.sum(Payment.amount))
        .filter(
            Payment.paid_at >= range_start,
            Payment.paid_at < range_end,
            Payment.status == "confirmed",
        )
        .scalar()
    ) or Decimal("0")

    # Outstanding invoices
    outstanding = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.status.in_(["sent", "partial", "overdue"]))
        .scalar()
    )

    # Overdue invoices
    overdue = (
        db.query(func.count(Invoice.id))
        .filter(
            Invoice.status.in_(["sent", "partial", "overdue"]),
            Invoice.due_date < today_date,
        )
        .scalar()
    )

    # New leads this month
    new_leads = (
        db.query(func.count(Client.id))
        .filter(
            Client.status == "lead",
            Client.created_at >= range_start,
            Client.created_at < range_end,
        )
        .scalar()
    )

    return {
        "bookings_this_month": bookings_this_month,
        "upcoming_bookings": upcoming,
        "revenue_this_month": float(revenue_this_month),
        "outstanding_invoices": outstanding,
        "overdue_invoices": overdue,
        "new_leads_this_month": new_leads,
    }


@router.get("/pnl")
def profit_and_loss(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _=Depends(require_permission("reports:read")),
):
    """Monthly P&L for a given year."""
    from app.models.invoicing import Payment
    from app.models.accounting import Expense

    year_start, year_end = date(year, 1, 1), date(year + 1, 1, 1)

    income_by_month = dict(
        db.query(extract("month", Payment.paid_at), func.sum(Payment.amount))
        .filter(
            Payment.paid_at >= year_start,
            Payment.paid_at < year_end,
            Payment.status == "confirmed",
        )
        .group_by(extract("month", Payment.paid_at))
        .all()
    )
    expenses_by_month = dict(
        db.query(extract("month", Expense.expense_date), func.sum(Expense.amount))
        .filter(
            Expense.expense_date >= year_start,
            Expense.expense_date < year_end,
            Expense.status == "confirmed",
        )
        .group_by(extract("month", Expense.expense_date))
        .all()
    )

    results = []
    for month in range(1, 13):
        income = income_by_month.get(month, Decimal("0"))
        expenses = expenses_by_month.get(month, Decimal("0"))

        results.append({
            "month": month,
            "month_label": date(year, month, 1).strftime("%B"),
            "income": float(income),
            "expenses": float(expenses),
            "net_profit": float(income - expenses),
            "margin_pct": round(float((income - expenses) / income * 100), 2) if income > 0 else 0,
        })

    return {
        "year": year,
        "total_income": sum(r["income"] for r in results),
        "total_expenses": sum(r["expenses"] for r in results),
        "net_profit": sum(r["net_profit"] for r in results),
        "months": results,
    }


@router.get("/bookings/{booking_id}/profitability")
def booking_profitability(
    booking_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("reports:read")),
):
    """Income vs expenses for a single booking."""
    from app.models.bookings import Booking
    from app.models.invoicing import Invoice, Payment
    from app.models.accounting import Expense

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    income = (
        db.query(func.sum(Payment.amount))
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .filter(
            Invoice.booking_id == booking_id,
            Payment.status == "confirmed",
        )
        .scalar()
    ) or Decimal("0")

    expenses = (
        db.query(func.sum(Expense.amount))
        .filter(
            Expense.booking_id == booking_id,
            Expense.status == "confirmed",
        )
        .scalar()
    ) or Decimal("0")

    return {
        "booking_reference": booking.reference,
        "event_date": booking.event_date,
        "income": float(income),
        "expenses": float(expenses),
        "net_profit": float(income - expenses),
        "margin_pct": round(float((income - expenses) / income * 100), 2) if income > 0 else 0,
    }


@router.get("/bookings/profitability/top")
def top_booking_profitability(
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
    _=Depends(require_permission("reports:read")),
):
    """Top bookings by profitability (net profit)."""
    from app.models.bookings import Booking
    from app.models.clients import Client
    from app.models.invoicing import Invoice, Payment
    from app.models.accounting import Expense

    income_sub = (
        db.query(
            Invoice.booking_id.label("booking_id"),
            func.coalesce(func.sum(Payment.amount), 0).label("income"),
        )
        .join(Payment, Payment.invoice_id == Invoice.id)
        .filter(Payment.status == "confirmed")
        .group_by(Invoice.booking_id)
        .subquery()
    )

    expense_sub = (
        db.query(
            Expense.booking_id.label("booking_id"),
            func.coalesce(func.sum(Expense.amount), 0).label("expenses"),
        )
        .filter(
            Expense.booking_id != None,
            Expense.status == "confirmed",
        )
        .group_by(Expense.booking_id)
        .subquery()
    )

    rows = (
        db.query(
            Booking.id,
            Booking.reference,
            Booking.event_date,
            Client.first_name,
            Client.last_name,
            func.coalesce(income_sub.c.income, 0).label("income"),
            func.coalesce(expense_sub.c.expenses, 0).label("expenses"),
        )
        .join(Client, Client.id == Booking.client_id)
        .outerjoin(income_sub, income_sub.c.booking_id == Booking.id)
        .outerjoin(expense_sub, expense_sub.c.booking_id == Booking.id)
        .order_by(
            (func.coalesce(income_sub.c.income, 0) - func.coalesce(expense_sub.c.expenses, 0)).desc()
        )
        .limit(limit)
        .all()
    )

    result = []
    for r in rows:
        income = float(r.income or 0)
        expenses = float(r.expenses or 0)
        net = income - expenses
        margin = round((net / income * 100), 2) if income > 0 else 0
        result.append({
            "booking_id": r.id,
            "booking_reference": r.reference,
            "event_date": r.event_date,
            "client_name": f"{r.first_name} {r.last_name}",
            "income": income,
            "expenses": expenses,
            "net_profit": net,
            "margin_pct": margin,
        })

    return result


@router.get("/inventory/low-stock")
def low_stock_report(
    db: Session = Depends(get_db),
    _=Depends(require_permission("inventory:read")),
):
    """Items at or below their reorder level."""
    from app.models.inventory import InventoryItem

    items = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.quantity_in_stock <= InventoryItem.reorder_level,
            InventoryItem.is_active == True,
        )
        .order_by((InventoryItem.quantity_in_stock - InventoryItem.reorder_level).asc())
        .all()
    )

    return [
        {
            "id": item.id,
            "name": item.name,
            "sku": item.sku,
            "category": item.category,
            "quantity_in_stock": item.quantity_in_stock,
            "reorder_level": item.reorder_level,
            "deficit": item.reorder_level - item.quantity_in_stock,
        }
        for item in items
    ]


@router.get("/staff/attendance")
def staff_attendance_report(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    _=Depends(require_permission("reports:read")),
):
    """Attendance summary per staff member over a date range."""
    from app.models.staff import StaffProfile, Shift, Attendance
    from app.models.auth import User

    results = (
        db.query(
            User.full_name,
            func.count(Shift.id).label("total_shifts"),
            func.sum(
                case((Attendance.status == "present", 1), else_=0)
            ).label("present"),
            func.sum(
                case((Attendance.status == "absent", 1), else_=0)
            ).label("absent"),
        )
        .join(StaffProfile, StaffProfile.user_id == User.id)
        .join(Shift, Shift.staff_id == StaffProfile.id)
        .outerjoin(Attendance, Attendance.shift_id == Shift.id)
        .filter(
            Shift.shift_date >= from_date,
            Shift.shift_date <= to_date,
        )
        .group_by(User.full_name)
        .all()
    )

    return [
        {
            "staff_name": r.full_name,
            "total_shifts": r.total_shifts,
            "present": r.present or 0,
            "absent": r.absent or 0,
            "attendance_rate_pct": round((r.present or 0) / r.total_shifts * 100, 1) if r.total_shifts > 0 else 0,
        }
        for r in results
    ]
