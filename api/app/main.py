import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DataError, IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import SessionLocal, get_db
from app.routers import (
    auth,
    clients,
    bookings,
    inventory,
    invoicing,
    accounting,
    staff,
    contracts,
    reports,
    portal,
    webhooks,
    pdfs,
    audit_log,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("partyparadise")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}


def clear_expired_sessions() -> None:
    from app.models.auth import UserSession
    from app.models.portal import PortalSession

    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        db.query(UserSession).filter(UserSession.expires_at <= now).delete()
        db.query(PortalSession).filter(PortalSession.expires_at <= now).delete()
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting PartyParadise API (%s)", settings.ENV)
    try:
        clear_expired_sessions()
    except SQLAlchemyError:
        logger.exception("Could not clear expired sessions")
    yield
    logger.info("Shutting down PartyParadise API")


app = FastAPI(
    title="PartyParadise API",
    version="1.0.0",
    description="Backend API for PartyParadise event management system",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENV == "development" else None,
    redoc_url="/redoc" if settings.ENV == "development" else None,
    openapi_url="/openapi.json" if settings.ENV == "development" else None,
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers.update(SECURITY_HEADERS)
    logger.info(
        "%s %s %s %.0fms request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        (time.perf_counter() - started) * 1000,
        request_id,
    )
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Staff routes ──────────────────────────────────────────────
app.include_router(auth.router,       prefix="/auth",       tags=["Auth"])
app.include_router(clients.router,    prefix="/clients",    tags=["Clients"])
app.include_router(bookings.router,   prefix="/bookings",   tags=["Bookings"])
app.include_router(inventory.router,  prefix="/inventory",  tags=["Inventory"])
app.include_router(invoicing.router,  prefix="/invoicing",  tags=["Invoicing"])
app.include_router(accounting.router, prefix="/accounting", tags=["Accounting"])
app.include_router(staff.router,      prefix="/staff",      tags=["Staff"])
app.include_router(contracts.router,  prefix="/contracts",  tags=["Contracts"])
app.include_router(reports.router,    prefix="/reports",    tags=["Reports"])

# ── Client portal (separate prefix, separate auth) ────────────
app.include_router(portal.router,     prefix="/portal",     tags=["Portal"])

# ── Webhooks (no auth middleware — HMAC verified internally) ──
# Paystack hits /webhooks/paystack directly.
# DO NOT add require_permission() to this router.
app.include_router(webhooks.router,   tags=["Webhooks"])
app.include_router(pdfs.router,        prefix="/pdfs",    tags=["PDFs"])
app.include_router(audit_log.router,  prefix="/audit-logs", tags=["Audit Logs"])


@app.exception_handler(IntegrityError)
def handle_integrity_error(request: Request, exc: IntegrityError):
    code = getattr(exc.orig, "pgcode", None)
    if code == "23505":
        return JSONResponse(status_code=409, content={"detail": "That record already exists"})
    if code == "23503":
        return JSONResponse(status_code=409, content={"detail": "A linked record does not exist or is still in use"})
    return JSONResponse(status_code=422, content={"detail": "The submitted values are not valid"})


@app.exception_handler(DataError)
def handle_data_error(request: Request, exc: DataError):
    return JSONResponse(status_code=422, content={"detail": "A submitted value is too long or badly formatted"})


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Health check could not reach the database")
        return JSONResponse(status_code=503, content={"status": "unavailable", "version": "1.0.0"})
    return {"status": "ok", "version": "1.0.0"}
