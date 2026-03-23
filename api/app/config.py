from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path


class Settings(BaseSettings):
    # App
    ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/partyparadise"

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8081"]

    # Storage (Supabase)
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Payments (Paystack)
    PAYSTACK_SECRET_KEY: str = ""
    PAYSTACK_PUBLIC_KEY: str = ""

    # Email (SendGrid)
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "noreply@partyparadise.com"
    SENDGRID_FROM_NAME: str = "PartyParadise"
    SENDGRID_SANDBOX: bool = False  # set True locally to log without sending

    # Business info (used in PDFs and emails)
    BUSINESS_NAME: str = "PartyParadise"
    BUSINESS_EMAIL: str = "hello@partyparadise.com"
    BUSINESS_PHONE: str = "+233 XX XXX XXXX"
    BUSINESS_ADDRESS: str = "Accra, Ghana"
    WEB_URL: str = "http://localhost:3000"
    PORTAL_URL: str = "http://localhost:3000/portal"

    class Config:
        # Load .env from the api/ directory regardless of CWD
        env_file = str(Path(__file__).resolve().parent.parent / ".env")
        case_sensitive = True


settings = Settings()
