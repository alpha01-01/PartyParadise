from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import uuid
import hmac
import jwt
from jwt import InvalidTokenError
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_dummy_hash: Optional[str] = None

PORTAL_SETUP_TOKEN_HOURS = 48
PASSWORD_RESET_TOKEN_HOURS = 1
STAFF_INVITE_TOKEN_HOURS = 48
CONTRACT_SIGN_TOKEN_DAYS = 7


# --- Password ---

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# --- JWT ---

def validate_password_strength(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.isupper() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Password must include an uppercase letter and a number")
    return value


def verify_login_password(password: str, password_hash: Optional[str]) -> bool:
    """Spends the same bcrypt time for unknown accounts, so timing reveals nothing."""
    global _dummy_hash
    if password_hash is None:
        _dummy_hash = _dummy_hash or hash_password("timing-only-not-a-password")
        verify_password(password, _dummy_hash)
        return False
    return verify_password(password, password_hash)


def create_access_token(subject: str, token_type: str = "staff", extra: dict = {}) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "type": token_type,  # "staff" | "client"
        "exp": expire,
        **extra,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str, token_type: str = "staff") -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "type": token_type,
        "refresh": True,
        "jti": uuid.uuid4().hex,  # two logins in the same second must not share a token
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except InvalidTokenError:
        return None


# --- Portal invite links ---

def _password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()


def create_portal_setup_token(account_id: str, password_hash: str) -> str:
    """
    Signed invite token. It carries a fingerprint of the current password hash,
    so it stops working as soon as the password is set (single use).
    """
    expire = datetime.now(timezone.utc) + timedelta(hours=PORTAL_SETUP_TOKEN_HOURS)
    payload = {
        "sub": account_id,
        "type": "portal_setup",
        "pwf": _password_fingerprint(password_hash),
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_password_reset_token(user_id: str, password_hash: str, hours: int = PASSWORD_RESET_TOKEN_HOURS) -> str:
    """Single use for the same reason as the portal setup token."""
    expire = datetime.now(timezone.utc) + timedelta(hours=hours)
    payload = {
        "sub": user_id,
        "type": "password_reset",
        "pwf": _password_fingerprint(password_hash),
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_contract_signing_token(contract_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=CONTRACT_SIGN_TOKEN_DAYS)
    payload = {"sub": contract_id, "type": "contract_sign", "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def password_token_matches(payload: dict, password_hash: str) -> bool:
    return hmac.compare_digest(
        str(payload.get("pwf", "")),
        _password_fingerprint(password_hash),
    )
