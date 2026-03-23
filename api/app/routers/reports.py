from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date
from uuid import UUID
from decimal import Decimal

from app.database import get_db
from app.dependencies import require_permission

router = APIRouter()


@router.get("/dashboard")
def dashboard_summary(
    db: Session = Depends(get_db),
    _=Depends(require_permission("reports:read")),
):
    """High-level numbers for the dashboard home screen."""
    from app.models.bookings import Booking
    from app.models.invoicing import Invoice, Payment
    from app.models.clients import Client
    from datetime import date as today

    today_date = today.today()
    month_start = today_date.replace(day=1)

    # Bookings this month
    bookings_this_month = (
        db.query(func.count(Booking.id))
        .filter(
            extract("year", Booking.event_date) == today_date.year,
            extract("month", Booking.event_date) == today_date.month,
        )
        .scalar()
    )

    # Upcoming bookings (next 30 days)
    from datetime import timedelta
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
            extract("year", Payment.paid_at) == today_date.year,
            extract("month", Payment.paid_at) == today_date.month,
            Payment.status == "confirmed",
        )
        .scalar()
    ) or Decimal("0")

    # Outstanding invoices
    outstanding = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.status.in_(["sent", "partial"]))
        .scalar()
    )

    # Overdue invoices
    overdue = (
        db.query(func.count(Invoice.id))
        .filter(
            Invoice.status.in_(["sent", "partial"]),
            Invoice.due_date < today_date,
        )
        .scalar()
    )

    # New leads this month
    new_leads = (
        db.query(func.count(Client.id))
        .filter(
            Client.status == "lead",
            extract("year", Client.created_at) == today_date.year,
            extract("month", Client.created_at) == today_date.month,
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

    results = []
    for month in range(1, 13):
        income = (
            db.query(func.sum(Payment.amount))
            .filter(
                extract("year", Payment.paid_at) == year,
                extract("month", Payment.paid_at) == month,
                Payment.status == "confirmed",
            )
            .scalar()
        ) or Decimal("0")

        expenses = (
            db.query(func.sum(Expense.amount))
            .filter(
                extract("year", Expense.expense_date) == year,
                extract("month", Expense.expense_date) == month,
                Expense.status == "confirmed",
            )
            .scalar()
        ) or Decimal("0")

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
        .filter(Expense.booking_id == booking_id)
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
        .filter(Expense.booking_id != None)
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
                func.cast(Attendance.status == "present", func.Integer)
            ).label("present"),
            func.sum(
                func.cast(Attendance.status == "absent", func.Integer)
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
