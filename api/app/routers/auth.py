from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, require_permission
from app.schemas.auth import (
    LoginRequest,
    RefreshTokenRequest,
    CreateUserRequest,
    UpdateUserRequest,
    ChangePasswordRequest,
    TokenResponse,
    UserResponse,
)
from app.services import auth as auth_service

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    result = auth_service.login(db, data, ip_address=ip)
    return TokenResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        user=UserResponse.from_orm_with_roles(result["user"]),
    )


@router.post("/refresh")
def refresh(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    result = auth_service.refresh_access_token(db, data.refresh_token)
    return {
        "access_token": result["access_token"],
        "user": UserResponse.from_orm_with_roles(result["user"]),
    }


@router.post("/logout")
def logout(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    auth_service.logout(db, data.refresh_token)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def me(current_user=Depends(CurrentUser)):
    return UserResponse.from_orm_with_roles(current_user)


@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    current_user=Depends(CurrentUser),
    db: Session = Depends(get_db),
):
    auth_service.change_password(db, current_user, data.current_password, data.new_password)
    return {"message": "Password changed successfully"}


# --- User management (admin only) ---

@router.get("/users", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _=Depends(require_permission("users:read")),
):
    from app.models.auth import User
    users = db.query(User).filter(User.is_active == True).all()
    return [UserResponse.from_orm_with_roles(u) for u in users]


@router.post("/users", response_model=UserResponse)
def create_user(
    data: CreateUserRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("users:create")),
):
    user = auth_service.create_user(db, data)
    return UserResponse.from_orm_with_roles(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    data: UpdateUserRequest,
    db: Session = Depends(get_db),
    _=Depends(require_permission("users:update")),
):
    from app.models.auth import User
    import uuid
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return UserResponse.from_orm_with_roles(user)
