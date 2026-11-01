from pathlib import Path
import os
import subprocess
import sys
import uuid


os.environ.setdefault("SECRET_KEY", "test-only-signing-key-not-used-anywhere-else")

API_ROOT = Path(__file__).resolve().parents[1]

if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app
from app.utils import rate_limit
from app.utils.security import create_access_token

# Real login sessions store the client IP in an INET column, and the
# TestClient default host "testclient" is not a valid address.
async def app_with_client_ip(scope, receive, send):
    scope["client"] = ("127.0.0.1", 50000)
    await app(scope, receive, send)


def alembic(url: str, *args: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=API_ROOT,
        env={**os.environ, "DATABASE_URL": url},
        check=True,
        capture_output=True,
    )


@pytest.fixture(autouse=True)
def clear_rate_limits():
    rate_limit.reset()


@pytest.fixture(scope="session")
def database_url():
    """
    TEST_DATABASE_URL points at a disposable database. It is wiped on every
    run, so anything without "test" in its name is refused.
    """
    url = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")
    if "test" not in (make_url(url).database or ""):
        pytest.fail('TEST_DATABASE_URL must name a database containing "test"')

    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()

    alembic(url, "upgrade", "head")
    return url


@pytest.fixture(scope="session")
def engine(database_url):
    engine = create_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine):
    """A session whose commits are all undone when the test ends."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def api(db):
    def override_get_db():
        try:
            yield db
        finally:
            # A request's uncommitted work ends with it, as db.close() does
            db.rollback()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app_with_client_ip, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db):
    from app.models.auth import Role, User, UserRole

    def _make_user(role: str, password_hash: str = "not-a-real-hash") -> User:
        user = User(
            full_name=f"{role.title()} Tester",
            email=f"{role}-{uuid.uuid4().hex[:8]}@example.com",
            password_hash=password_hash,
            is_active=True,
        )
        db.add(user)
        db.flush()
        role_id = db.query(Role.id).filter(Role.name == role).scalar()
        db.add(UserRole(user_id=user.id, role_id=role_id))
        db.commit()
        return user

    return _make_user


@pytest.fixture
def auth_for():
    def _auth_for(user) -> dict:
        return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}

    return _auth_for


@pytest.fixture
def admin_headers(make_user, auth_for):
    return auth_for(make_user("admin"))
