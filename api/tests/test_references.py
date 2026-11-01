import threading
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.accounting import Expense
from app.models.bookings import Booking
from app.models.invoicing import Payment
from app.utils.references import generate_reference


def year():
    return date.today().year


def test_numbers_increase_within_a_prefix(db):
    assert generate_reference("AAA", Booking, db) == f"AAA-{year()}-0001"
    assert generate_reference("AAA", Booking, db) == f"AAA-{year()}-0002"
    assert generate_reference("BBB", Booking, db) == f"BBB-{year()}-0001"


def test_counter_continues_from_existing_references(db):
    client = db.execute(
        text("INSERT INTO clients (id, first_name, last_name) VALUES (gen_random_uuid(), 'A', 'B') RETURNING id")
    ).scalar()
    user = db.execute(
        text(
            "INSERT INTO users (id, full_name, email, password_hash) "
            "VALUES (gen_random_uuid(), 'A', 'refs@example.com', 'x') RETURNING id"
        )
    ).scalar()
    db.add(Booking(
        client_id=client,
        created_by=user,
        reference=f"CCC-{year()}-0041",
        service_type="decor",
        event_date=date(2027, 1, 1),
    ))
    db.flush()

    assert generate_reference("CCC", Booking, db) == f"CCC-{year()}-0042"


def test_rolled_back_transaction_does_not_use_up_a_number(db):
    nested = db.begin_nested()
    generate_reference("DDD", Expense, db)
    nested.rollback()

    assert generate_reference("DDD", Expense, db) == f"DDD-{year()}-0001"


def test_simultaneous_requests_get_different_numbers(engine):
    results = []
    barrier = threading.Barrier(8)

    def work():
        barrier.wait()
        with Session(engine) as session:
            results.append(generate_reference("CONC", Payment, session))
            session.commit()

    threads = [threading.Thread(target=work) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(set(results)) == 8
