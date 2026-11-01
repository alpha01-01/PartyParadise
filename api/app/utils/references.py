from datetime import date
from sqlalchemy import text
from sqlalchemy.orm import Session


def _highest_existing(stem: str, model, session: Session) -> int:
    references = (
        session.query(model.reference)
        .filter(model.reference.like(f"{stem}%"))
        .all()
    )

    max_sequence = 0
    for (reference,) in references:
        if not reference or not reference.startswith(stem):
            continue
        suffix = reference[len(stem):]
        if suffix.isdigit():
            max_sequence = max(max_sequence, int(suffix))
    return max_sequence


def generate_reference(prefix: str, model, session: Session) -> str:
    """
    Generate a human-readable reference like BK-2025-0042.
    prefix: "BK", "INV", "QT", "CT", "PO", "EXP", "PAY"
    model: the SQLAlchemy model to inspect existing references for the year

    The counter row stays locked until the caller's transaction ends, so two
    simultaneous requests can never get the same number.
    """
    year = date.today().year
    stem = f"{prefix}-{year}-"

    value = session.execute(
        text("UPDATE reference_counters SET value = value + 1 WHERE stem = :stem RETURNING value"),
        {"stem": stem},
    ).scalar()

    if value is None:
        value = session.execute(
            text(
                "INSERT INTO reference_counters (stem, value) VALUES (:stem, :first) "
                "ON CONFLICT (stem) DO UPDATE SET value = reference_counters.value + 1 "
                "RETURNING value"
            ),
            {"stem": stem, "first": _highest_existing(stem, model, session) + 1},
        ).scalar()

    return f"{stem}{value:04d}"
