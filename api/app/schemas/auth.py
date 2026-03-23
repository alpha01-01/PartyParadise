from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime


# --- Request schemas ---

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class CreateUserRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    password: str
    role_names: List[str] = []

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# --- Response schemas ---

class RoleResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: UUID
    full_name: str
    email: str
    phone: Optional[str]
    avatar_url: Optional[str]
    is_active: bool
    created_at: datetime
    roles: List[RoleResponse] = []

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_roles(cls, user):
        roles = [RoleResponse.model_validate(ur.role) for ur in user.roles]
        return cls(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            phone=user.phone,
            avatar_url=user.avatar_url,
            is_active=user.is_active,
            created_at=user.created_at,
            roles=roles,
        )


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class PermissionResponse(BaseModel):
    id: UUID
    name: str
    module: str
    action: str

    model_config = {"from_attributes": True}
