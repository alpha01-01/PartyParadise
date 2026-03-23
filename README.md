# PartyParadise â€” Event Management System

Full-stack event management platform for PartyParadise, Accra Ghana.
Manages bookings, clients, invoices, inventory, staff, and contracts.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI (Python 3.11), SQLAlchemy 2.0 |
| Database | PostgreSQL 15 |
| Auth | JWT (access + refresh tokens) |
| Payments | Paystack (MoMo, card, bank transfer) |
| Storage | Supabase Storage (receipts, PDFs) |
| Email | SendGrid |

---

## Project structure

```
partyparadise/
â”œâ”€â”€ api/                    FastAPI backend
â”‚   â”œâ”€â”€ app/
â”‚   â”‚   â”œâ”€â”€ main.py
â”‚   â”‚   â”œâ”€â”€ config.py
â”‚   â”‚   â”œâ”€â”€ models/         SQLAlchemy ORM (9 modules, 47 tables)
â”‚   â”‚   â”œâ”€â”€ routers/        API endpoints
â”‚   â”‚   â”œâ”€â”€ utils/
â”‚   â”‚   â””â”€â”€ services/
â”‚   â”œâ”€â”€ migrations/         Alembic migrations
â”‚   â”œâ”€â”€ tests/
â”‚   â”œâ”€â”€ requirements.txt
â”‚   â””â”€â”€ Dockerfile
â”œâ”€â”€ web/                    Next.js frontend
â”‚   â”œâ”€â”€ app/
â”‚   â”‚   â”œâ”€â”€ (auth)/         Login pages
â”‚   â”‚   â”œâ”€â”€ (dashboard)/    Staff dashboard
â”‚   â”‚   â”œâ”€â”€ contracts/      Public contract signing
â”‚   â”‚   â””â”€â”€ portal/         Client portal
â”‚   â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ hooks/
â”‚   â”œâ”€â”€ lib/                API client, auth store, types, utils
â”‚   â”œâ”€â”€ styles/
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ Dockerfile
â”œâ”€â”€ docker-compose.yml
â”œâ”€â”€ .env.example
â””â”€â”€ README.md
```

---

## Quick start (Docker)

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env and fill in your Paystack, Supabase, and SendGrid keys

# 2. Start the database
docker compose up db -d

# 3. Run migrations
cd api
pip install -r requirements.txt
alembic upgrade head
cd ..

# 4. Start everything
docker compose up
```

- Frontend: http://localhost:3000
- API docs:  http://localhost:8000/docs
- API:       http://localhost:8000

---

## Manual setup (without Docker)

### Backend

```bash
cd api

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp ../.env.example .env
# Edit .env â€” set DATABASE_URL to your Postgres instance

# Run migrations
alembic upgrade head

# Start API
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd web

# Install dependencies
npm install

# Set up environment
cp ../.env.example .env.local
# Edit .env.local â€” set NEXT_PUBLIC_API_URL=http://localhost:8000

# Start dev server
npm run dev
```

---

## Environment variables

See `.env.example` for the full list. Key ones:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Your Postgres connection string |
| `SECRET_KEY` | Any random 64-char string (`openssl rand -hex 32`) |
| `PAYSTACK_SECRET_KEY` | Paystack Dashboard â†’ Settings â†’ API Keys |
| `PAYSTACK_PUBLIC_KEY` | Paystack Dashboard â†’ Settings â†’ API Keys |
| `SUPABASE_URL` | Supabase Dashboard â†’ Settings â†’ API |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard â†’ Settings â†’ API |
| `SENDGRID_API_KEY` | SendGrid â†’ Settings â†’ API Keys |

---

## Default login

After running migrations (which seed default roles and an admin user):

```
Email:    admin@partyparadise.com
Password: changeme123
```

**Change this immediately in production.**

---

## Paystack webhook setup

1. Go to Paystack Dashboard â†’ Settings â†’ API Keys & Webhooks
2. Set webhook URL to: `https://yourdomain.com/webhooks/paystack`
3. Ensure `PAYSTACK_SECRET_KEY` in your `.env` matches your Paystack secret

When charging clients, pass `metadata.invoice_id` in the Paystack charge so the webhook can match the payment to the correct invoice.

---

## Database migrations

```bash
cd api

# Apply all migrations
alembic upgrade head

# Create a new migration after model changes
alembic revision --autogenerate -m "description"

# Roll back one step
alembic downgrade -1
```

---

## API documentation

FastAPI auto-generates interactive docs at:
- Swagger UI: http://localhost:8000/docs
- ReDoc:      http://localhost:8000/redoc

Available in development only (`ENV=development`).

---

## Running tests

```bash
cd api
pytest tests/ -v

# With integration tests (requires running Postgres)
INTEGRATION_TESTS=1 pytest tests/ -v
```

## Rollout Readiness

Use docs/desktop-rollout-readiness.md as the working checklist for internal desktop and laptop rollout readiness.

