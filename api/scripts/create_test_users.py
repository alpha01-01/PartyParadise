from pathlib import Path
import os
import secrets
import sys

from dotenv import load_dotenv

load_dotenv()

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.config import settings
from app.database import SessionLocal
from app.models.auth import Role, User, UserRole
from app.utils.security import hash_password


if settings.ENV == "production":
    raise SystemExit("Refusing to create test users in production.")

# Pass --reset-passwords to replace the password of users that already exist.
RESET_PASSWORDS = "--reset-passwords" in sys.argv

TEST_USERS = [
    {
        "full_name": "Mina Manager",
        "email": "manager@partyparadise.com",
        "role": "manager",
    },
    {
        "full_name": "Sam Staff",
        "email": "staff@partyparadise.com",
        "role": "staff",
    },
]


with SessionLocal() as db:
    roles = {role.name: role for role in db.query(Role).all()}
    issued = []

    for entry in TEST_USERS:
        role = roles.get(entry["role"])
        if not role:
            raise RuntimeError(f"Role not found: {entry['role']}")

        password = os.environ.get("TEST_USER_PASSWORD") or secrets.token_urlsafe(12)
        user = db.query(User).filter(User.email == entry["email"]).first()
        if not user:
            user = User(
                full_name=entry["full_name"],
                email=entry["email"],
                password_hash=hash_password(password),
                is_active=True,
            )
            db.add(user)
            db.flush()
            issued.append((entry["role"], entry["email"], password))
            print(f"Created user: {entry['email']}")
        else:
            user.full_name = entry["full_name"]
            user.is_active = True
            if RESET_PASSWORDS:
                user.password_hash = hash_password(password)
                issued.append((entry["role"], entry["email"], password))
            print(f"Updated user: {entry['email']}")

        existing = (
            db.query(UserRole)
            .filter(UserRole.user_id == user.id, UserRole.role_id == role.id)
            .first()
        )
        if not existing:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    db.commit()

print("Test users ready. Passwords are shown once:")
for role, email, password in issued:
    print(f"{role}: {email} / {password}")
