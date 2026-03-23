from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import extract


def generate_reference(prefix: str, model, session: Session) -> str:
    """
    Generate a human-readable reference like BK-2025-0042.
    prefix: "BK", "INV", "QT", "CT", "PO", "EXP", "PAY"
    model: the SQLAlchemy model to count existing records for the year
    """
    year = date.today().year
    count = (
        session.query(model)
        .filter(extract("year", model.created_at) == year)
        .count()
    ) + 1
    return f"{prefix}-{year}-{count:04d}"
