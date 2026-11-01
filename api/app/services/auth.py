from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import logging
import uuid

from app.config import settings
from app.models.auth import User, Role, UserRole, UserSession, AuditLog
from app.schemas.auth import CreateUserRequest, LoginRequest
from app.services.email import send_password_reset
from app.utils import rate_limit
from app.utils.security import (
    hash_password,
    verify_login_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    decode_token,
    password_token_matches,
)

logger = logging.getLogger(__name__)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(func.lower(User.email) == email.lower()).first()


def get_user_by_id(db: Session, user_id: uuid.UUID) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, data: CreateUserRequest) -> User:
    if get_user_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        full_name=data.full_name,
        email=data.email.lower(),
        phone=data.phone,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.flush()

    for role_name in data.role_names:
        role = db.query(Role).filter(Role.name == role_name).first()
        if role:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    db.commit()
    db.refresh(user)
    return user


def login(db: Session, data: LoginRequest, ip_address: Optional[str] = None) -> dict:
    rate_limit.ensure_allowed("staff-login", data.email, ip_address)
    user = get_user_by_email(db, data.email)

    if not verify_login_password(data.password, user.password_hash if user else None):
        rate_limit.record_failure("staff-login", data.email, ip_address)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    rate_limit.clear_account("staff-login", data.email)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    access_token = create_access_token(str(user.id), token_type="staff")
    refresh_token = create_refresh_token(str(user.id), token_type="staff")

    # Expired sessions are only clutter, and this is a natural moment to clear them
    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.expires_at <= datetime.now(timezone.utc),
    ).delete()

    # Store hashed refresh token in sessions table
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    session = UserSession(
        user_id=user.id,
        token_hash=token_hash,
        ip_address=ip_address,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(session)

    # Audit log
    db.add(AuditLog(
        user_id=user.id,
        action="auth.login",
        module="auth",
        extra_data={"ip": ip_address},
    ))

    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }


def refresh_access_token(db: Session, refresh_token: str) -> dict:
    payload = decode_token(refresh_token)

    if not payload or not payload.get("refresh") or payload.get("type") != "staff":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    session = (
        db.query(UserSession)
        .filter(
            UserSession.token_hash == token_hash,
            UserSession.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or not found",
        )

    user = get_user_by_id(db, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")

    new_access_token = create_access_token(str(user.id), token_type="staff")
    return {"access_token": new_access_token, "user": user}


def logout(db: Session, refresh_token: str) -> None:
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    db.query(UserSession).filter(UserSession.token_hash == token_hash).delete()
    db.commit()


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    user.password_hash = hash_password(new_password)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()


def request_password_reset(db: Session, email: str, ip_address: Optional[str] = None) -> None:
    rate_limit.ensure_allowed("password-reset", email, ip_address)
    rate_limit.record_failure("password-reset", email, ip_address)

    user = get_user_by_email(db, email)
    if not user or not user.is_active:
        return

    token = create_password_reset_token(str(user.id), user.password_hash)
    reset_url = f"{settings.WEB_URL}/login/reset/{token}"
    if not send_password_reset(user, reset_url) and settings.ENV != "production":
        logger.warning("Email not sent. Password reset link for %s: %s", user.email, reset_url)


def reset_password(db: Session, token: str, new_password: str) -> None:
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired reset link",
    )

    payload = decode_token(token)
    if not payload or payload.get("type") != "password_reset":
        raise invalid

    user = db.query(User).filter(User.id == uuid.UUID(payload["sub"]), User.is_active == True).first()
    if not user or not password_token_matches(payload, user.password_hash):
        raise invalid

    user.password_hash = hash_password(new_password)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
