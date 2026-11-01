from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi.routing import APIRoute
from sqlalchemy import text

from app.database import Base
from app.main import app
from app.models import *  # noqa: F401,F403
from conftest import API_ROOT, alembic


def script_directory():
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    return ScriptDirectory.from_config(config)


def test_migrations_have_a_single_head():
    assert len(script_directory().get_heads()) == 1


def test_upgrade_from_empty_reaches_head(engine):
    with engine.connect() as connection:
        version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    assert version == script_directory().get_current_head()


def test_models_match_migrations(engine):
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        assert compare_metadata(context, Base.metadata) == []


def test_latest_migrations_can_be_rolled_back(database_url, engine):
    alembic(database_url, "downgrade", "009")
    alembic(database_url, "upgrade", "head")
    with engine.connect() as connection:
        columns = connection.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_logs'")
        ).scalars().all()
    assert {"entity_type", "entity_id", "changes"} <= set(columns)


def test_fresh_database_has_role_permissions(db):
    counts = dict(
        db.execute(
            text(
                "SELECT r.name, count(*) FROM role_permissions rp "
                "JOIN roles r ON r.id = rp.role_id GROUP BY r.name"
            )
        ).all()
    )
    assert counts == {"admin": 28, "manager": 25, "staff": 9}


def test_every_permission_used_by_a_route_is_seeded(db):
    def permissions(dependant):
        found = {getattr(dependant.call, "permission", None)}
        for child in dependant.dependencies:
            found |= permissions(child)
        return found

    used = set()
    for route in app.routes:
        if isinstance(route, APIRoute):
            used |= permissions(route.dependant)
    used.discard(None)

    seeded = set(db.execute(text("SELECT name FROM permissions")).scalars())
    assert used and used <= seeded
