# PartyParadise — Project Structure

## Overview

PartyParadise is a monorepo containing three packages:

| Package | Tech | Purpose |
|---|---|---|
| `apps/web` | Next.js 14 (App Router) | Internal staff dashboard |
| `apps/mobile` | Expo (React Native) | Staff mobile app + client portal app |
| `apps/api` | FastAPI (Python) | Backend API serving both web and mobile |
| `packages/ui` | React + Tailwind | Shared UI components (web + mobile) |
| `packages/types` | TypeScript | Shared types and interfaces |
| `packages/utils` | TypeScript | Shared utility functions |
| `docs/` | Markdown | Schema and architecture documentation |

---

## Full Directory Structure

```
partyparadise/
│
├── apps/
│   ├── web/                          # Next.js staff dashboard
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx                  # Dashboard home
│   │   │   │   ├── bookings/
│   │   │   │   │   ├── page.tsx              # Bookings list
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   └── page.tsx          # Booking detail
│   │   │   │   │   └── new/
│   │   │   │   │       └── page.tsx          # New booking form
│   │   │   │   ├── clients/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── new/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── invoices/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── inventory/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── equipment/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── staff/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── contracts/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── expenses/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── reports/
│   │   │   │       └── page.tsx
│   │   │   ├── portal/                       # Client portal (web)
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── login/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── setup/
│   │   │   │   │       └── [token]/
│   │   │   │   │           └── page.tsx
│   │   │   │   ├── (client)/
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── bookings/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── invoices/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── [id]/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── contracts/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── documents/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── inquiries/
│   │   │   │   │       └── new/
│   │   │   │   │           └── page.tsx
│   │   │   │   └── sign/
│   │   │   │       └── [token]/
│   │   │   │           └── page.tsx          # Public contract signing
│   │   │   ├── api/                          # Next.js API routes (proxies/webhooks only)
│   │   │   │   └── webhooks/
│   │   │   │       └── paystack/
│   │   │   │           └── route.ts
│   │   │   └── layout.tsx
│   │   ├── components/                       # Web-specific components
│   │   │   ├── bookings/
│   │   │   ├── clients/
│   │   │   ├── invoices/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── MobileNav.tsx
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── api.ts                        # Axios/fetch client pointing to FastAPI
│   │   │   ├── auth.ts                       # Auth helpers (JWT, session)
│   │   │   └── utils.ts
│   │   ├── hooks/                            # React hooks
│   │   ├── store/                            # Zustand global state
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── mobile/                               # Expo (React Native)
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   └── login.tsx
│   │   │   ├── (staff)/                      # Staff app tabs
│   │   │   │   ├── _layout.tsx               # Tab navigator
│   │   │   │   ├── index.tsx                 # Dashboard
│   │   │   │   ├── bookings/
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── clients/
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   └── [id].tsx
│   │   │   │   ├── schedule.tsx              # My shifts today
│   │   │   │   └── inventory.tsx
│   │   │   └── (portal)/                     # Client portal tabs
│   │   │       ├── _layout.tsx
│   │   │       ├── index.tsx                 # Client dashboard
│   │   │       ├── bookings.tsx
│   │   │       ├── invoices.tsx
│   │   │       └── documents.tsx
│   │   ├── components/                       # Mobile-specific components
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── auth.ts
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── assets/
│   │   ├── app.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                                  # FastAPI backend
│       ├── app/
│       │   ├── main.py                       # App entry point
│       │   ├── config.py                     # Settings (env vars)
│       │   ├── database.py                   # SQLAlchemy engine + session
│       │   ├── dependencies.py               # Shared FastAPI dependencies
│       │   │
│       │   ├── models/                       # SQLAlchemy ORM models
│       │   │   ├── __init__.py
│       │   │   ├── auth.py                   # User, Role, Permission, Session
│       │   │   ├── clients.py                # Client, Interaction, Tag
│       │   │   ├── bookings.py               # Booking, BookingService, etc.
│       │   │   ├── inventory.py              # InventoryItem, Equipment, etc.
│       │   │   ├── invoicing.py              # Quote, Invoice, Payment
│       │   │   ├── accounting.py             # Expense, JournalEntry, etc.
│       │   │   ├── staff.py                  # StaffProfile, Shift, Attendance
│       │   │   ├── contracts.py              # Contract, ContractTemplate
│       │   │   └── portal.py                 # ClientPortalAccount, etc.
│       │   │
│       │   ├── schemas/                      # Pydantic request/response schemas
│       │   │   ├── __init__.py
│       │   │   ├── auth.py
│       │   │   ├── clients.py
│       │   │   ├── bookings.py
│       │   │   ├── inventory.py
│       │   │   ├── invoicing.py
│       │   │   ├── accounting.py
│       │   │   ├── staff.py
│       │   │   ├── contracts.py
│       │   │   └── portal.py
│       │   │
│       │   ├── routers/                      # FastAPI route handlers
│       │   │   ├── __init__.py
│       │   │   ├── auth.py
│       │   │   ├── clients.py
│       │   │   ├── bookings.py
│       │   │   ├── inventory.py
│       │   │   ├── invoicing.py
│       │   │   ├── accounting.py
│       │   │   ├── staff.py
│       │   │   ├── contracts.py
│       │   │   ├── reports.py
│       │   │   └── portal.py
│       │   │
│       │   ├── services/                     # Business logic layer
│       │   │   ├── __init__.py
│       │   │   ├── auth.py
│       │   │   ├── bookings.py               # Conflict checks, ref generation
│       │   │   ├── invoicing.py              # Invoice generation, payment logic
│       │   │   ├── inventory.py              # Stock transaction logic
│       │   │   ├── contracts.py              # Token generation, signing
│       │   │   ├── notifications.py          # Portal notification triggers
│       │   │   └── payroll.py                # Payroll calculation
│       │   │
│       │   └── utils/
│       │       ├── __init__.py
│       │       ├── security.py               # JWT, password hashing
│       │       ├── references.py             # BK-YYYY-XXXX generator
│       │       ├── storage.py                # Supabase/Cloudinary file upload
│       │       └── pagination.py             # Shared pagination helpers
│       │
│       ├── alembic/                          # Database migrations
│       │   ├── env.py
│       │   ├── script.py.mako
│       │   └── versions/                     # Migration files go here
│       │
│       ├── tests/
│       │   ├── conftest.py
│       │   ├── test_auth.py
│       │   ├── test_bookings.py
│       │   └── test_invoicing.py
│       │
│       ├── alembic.ini
│       ├── requirements.txt
│       ├── requirements-dev.txt
│       ├── .env.example
│       └── Dockerfile
│
├── packages/
│   ├── ui/                                   # Shared React components
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── types/                                # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── api.ts                        # API response envelope types
│   │   │   ├── booking.ts
│   │   │   ├── client.ts
│   │   │   ├── invoice.ts
│   │   │   ├── staff.ts
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── utils/                                # Shared utility functions
│       ├── src/
│       │   ├── formatCurrency.ts             # GHS formatting
│       │   ├── formatDate.ts
│       │   ├── bookingStatus.ts              # Status label/color helpers
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── docs/                                     # Schema documentation (from Phase 1)
│   ├── 01-auth-users.md
│   ├── 02-clients-leads.md
│   ├── 03-bookings-events.md
│   ├── 04-inventory-equipment.md
│   ├── 05-invoicing-payments.md
│   ├── 06-expenses-accounting.md
│   ├── 07-staff-scheduling.md
│   ├── 08-contracts-documents.md
│   └── 09-client-portal.md
│
├── .github/
│   └── workflows/
│       ├── api-tests.yml                     # Run tests on push
│       └── deploy.yml                        # Deploy on merge to main
│
├── .gitignore
├── .env.example                              # Root env vars
├── turbo.json                                # Turborepo config
├── package.json                              # Root workspace config
└── README.md
```

---

## Monorepo Tool: Turborepo

PartyParadise uses **Turborepo** to manage the monorepo. It handles build caching, parallel task running, and dependency management across packages.

### `turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "outputs": ["coverage/**"]
    }
  }
}
```

### Root `package.json`
```json
{
  "name": "partyparadise",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "dev:web": "turbo run dev --filter=web",
    "dev:mobile": "turbo run dev --filter=mobile",
    "dev:api": "turbo run dev --filter=api",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
```

---

## Environment Variables

### Root `.env.example`
```env
# API
DATABASE_URL=postgresql://user:password@localhost:5432/partyparadise
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Payments
PAYSTACK_SECRET_KEY=sk_live_xxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxx

# App URLs
WEB_URL=http://localhost:3000
API_URL=http://localhost:8000
```

---

## Tech Stack Summary

| Concern | Tool |
|---|---|
| Monorepo | Turborepo |
| Web frontend | Next.js 14 (App Router) |
| Mobile app | Expo SDK 51+ (React Native) |
| Shared components | Custom `packages/ui` |
| Shared types | `packages/types` (TypeScript) |
| Backend API | FastAPI (Python 3.11+) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Database | PostgreSQL 15 |
| Auth | JWT (python-jose) + bcrypt |
| File storage | Supabase Storage |
| Payments | Paystack |
| State management | Zustand (web + mobile) |
| Styling | Tailwind CSS (web) + NativeWind (mobile) |
| API client | Axios with interceptors |
| Testing (API) | Pytest |
| CI/CD | GitHub Actions |

---

## Key Architectural Rules

1. **All business logic lives in `apps/api/app/services/`** — routers are thin, services are fat. Never put business logic in a route handler.
2. **Routers never touch the database directly** — they call services; services use the session.
3. **Pydantic schemas are not ORM models** — keep them separate. Use `.model_validate()` to convert between them.
4. **`packages/types` is the contract between frontend and backend** — when an API response shape changes, update the types package first.
5. **Portal routes are always prefixed `/portal/`** and use `ClientPortalAuth` — never `StaffAuth`.
6. **Never hardcode GHS amounts** — always use the `formatCurrency` util from `packages/utils`.

---

## Getting Started (Local Dev)

```bash
# 1. Clone the repo
git clone https://github.com/your-org/partyparadise.git
cd partyparadise

# 2. Install all dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your local values

# 4. Start the database (Docker)
docker run --name partyparadise-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=partyparadise \
  -p 5432:5432 -d postgres:15

# 5. Run API migrations
cd apps/api
pip install -r requirements.txt
alembic upgrade head

# 6. Start everything
cd ../..
npm run dev
```

---

## Next Step

→ [Step 2 — Database Migrations](./10-migrations.md)
