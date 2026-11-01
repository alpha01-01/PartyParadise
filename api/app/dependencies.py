from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from typing import Annotated
import uuid

from app.database import get_db
from app.utils.security import decode_token
from app.models.auth import User, UserRole, Role, RolePermission, Permission
from app.models.portal import ClientPortalAccount

bearer_scheme = HTTPBearer()


# --- DB Session ---

DbSession = Annotated[Session, Depends(get_db)]


# --- Staff Auth ---

def get_current_staff_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)

    if not payload or payload.get("type") != "staff" or payload.get("refresh"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == uuid.UUID(user_id), User.is_active == True).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


CurrentUser = Annotated[User, Depends(get_current_staff_user)]


def has_permission(db: Session, user: User, permission_name: str) -> bool:
    """Admins have full access. Everyone else needs it through one of their roles."""
    match = (
        db.query(Role.id)
        .join(UserRole, UserRole.role_id == Role.id)
        .outerjoin(RolePermission, RolePermission.role_id == Role.id)
        .outerjoin(
            Permission,
            and_(Permission.id == RolePermission.permission_id, Permission.name == permission_name),
        )
        .filter(
            UserRole.user_id == user.id,
            or_(Role.name == "admin", Permission.id.isnot(None)),
        )
        .first()
    )
    return match is not None


def require_permission(permission_name: str):
    """
    Dependency factory — use as:
    Depends(require_permission("bookings:create"))
    """
    def checker(
        current_user: User = Depends(get_current_staff_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_permission(db, current_user, permission_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission_name}",
            )

        return current_user

    checker.permission = permission_name
    return checker


# --- Client Portal Auth ---

def get_current_portal_account(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> ClientPortalAccount:
    token = credentials.credentials
    payload = decode_token(token)

    if not payload or payload.get("type") != "client" or payload.get("refresh"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired portal token",
        )

    account_id = payload.get("sub")
    account = (
        db.query(ClientPortalAccount)
        .filter(
            ClientPortalAccount.id == uuid.UUID(account_id),
            ClientPortalAccount.is_active == True,
        )
        .first()
    )

    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Portal account not found or inactive",
        )

    return account


CurrentPortalAccount = Annotated[ClientPortalAccount, Depends(get_current_portal_account)]
