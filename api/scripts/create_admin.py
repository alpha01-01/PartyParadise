import secrets
from dotenv import load_dotenv

load_dotenv()

from app.database import SessionLocal
from app.models.auth import User, Role, UserRole
from app.utils.security import hash_password

email = "liza@partyparadise.com"
password = secrets.token_urlsafe(12)

with SessionLocal() as db:
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        print(f"User already exists: {email}")
        raise SystemExit(0)

    user = User(
        full_name="Liza Admin",
        email=email,
        phone=None,
        password_hash=hash_password(password),
        is_active=True,
    )
    db.add(user)
    db.flush()

    admin_role = db.query(Role).filter(Role.name == "admin").first()
    if not admin_role:
        raise RuntimeError("Admin role not found. Run migrations to seed roles.")

    db.add(UserRole(user_id=user.id, role_id=admin_role.id))
    db.commit()

print("Created admin user:", email)
print("Temporary password:", password)
