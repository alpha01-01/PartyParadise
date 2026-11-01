# PartyParadise — Event Management System

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
├── api/                    FastAPI backend
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/         SQLAlchemy ORM (9 modules, 47 tables)
│   │   ├── routers/        API endpoints
│   │   ├── utils/
│   │   └── services/
│   ├── migrations/         Alembic migrations
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── web/                    Next.js frontend
│   ├── app/
│   │   ├── (auth)/         Login pages
│   │   ├── (dashboard)/    Staff dashboard
│   │   ├── contracts/      Public contract signing
│   │   └── portal/         Client portal
│   ├── components/
│   ├── hooks/
│   ├── lib/                API client, auth store, types, utils
│   ├── styles/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
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
docker compose run --rm api alembic upgrade head

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
pip install -r requirements-dev.txt

# Set up environment
cp ../.env.example .env
# Edit .env — set DATABASE_URL to your Postgres instance

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
# Edit .env.local — set NEXT_PUBLIC_API_URL=http://localhost:8000

# Start dev server
npm run dev
```

---

## Environment variables

See `.env.example` for the full list. Key ones:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Your Postgres connection string |
| `SECRET_KEY` | Required. Random string of at least 32 characters (`openssl rand -hex 32`) |
| `INTERNAL_WEBHOOK_SECRET` | Random string (`openssl rand -hex 32`). Set the same value for the API and web app, or Paystack payments are rejected |
| `PAYSTACK_SECRET_KEY` | Paystack Dashboard → Settings → API Keys |
| `PAYSTACK_PUBLIC_KEY` | Paystack Dashboard → Settings → API Keys |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API |
| `SENDGRID_API_KEY` | SendGrid → Settings → API Keys |

---

## First login

Migrations seed roles and permissions but not users. After migrating, run this from `api/`:

```bash
python scripts/create_admin.py
```

`create_admin.py` prints a one-time random password.

---

## Paystack webhook setup

1. Go to Paystack Dashboard → Settings → API Keys & Webhooks
2. Set webhook URL to: `https://yourdomain.com/api/webhooks/paystack`
3. Set `PAYSTACK_SECRET_KEY` for the API and web app, `INTERNAL_API_URL` for the web app, and the same `INTERNAL_WEBHOOK_SECRET` for both

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

# Include the database tests. This database is wiped on every run, so its name must contain "test".
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/partyparadise_test pytest tests/ -v
```

---

## Production

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The stack runs migrations before the API starts and binds to `127.0.0.1`, so put a TLS proxy in front of it. Set `ENV=production`; API docs only appear in development.

## Backups

```bash
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres partyparadise > backup.sql
```

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres partyparadise < backup.sql
```

Schedule the backup daily, keep copies off the server, and test a restore on a spare database.

## PDFs on Windows

PDF generation uses WeasyPrint, which needs the Pango libraries. Docker images include them. On Windows, install MSYS2 and its `mingw-w64-x86_64-pango` package, then add `C:\msys64\mingw64\bin` to `PATH`.

## Rollout Readiness

Use docs/desktop-rollout-readiness.md as the working checklist for internal desktop and laptop rollout readiness.

