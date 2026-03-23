from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
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
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting PartyParadise API — {settings.ENV} environment")
    yield
    print("Shutting down PartyParadise API")


app = FastAPI(
    title="PartyParadise API",
    version="1.0.0",
    description="Backend API for PartyParadise event management system",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENV != "production" else None,
    redoc_url="/redoc" if settings.ENV != "production" else None,
)

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


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}
