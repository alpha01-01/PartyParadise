# PartyParadise Codebase Audit

**Audit date:** 2026-11-01
**Audited state:** commit `2bd13e5` plus uncommitted working-tree changes (47 changed or untracked paths)
**Scope:** FastAPI backend, Next.js frontend and UI, PostgreSQL schema and migrations, configuration, dependencies, tests
**Purpose:** Living record. Update an item's status when it is fixed, and move it into [Fixes completed](#fixes-completed).

---

## Summary

**The application is not ready for production or for handling real client data.** It builds and looks polished, but core flows are broken. Phase 0 closed the most urgent security holes on 2026-11-01; see [Fixes completed](#fixes-completed).

The most important problems:

1. ~~**Staff-level accounts can read every user's password hash**, including admins' (SEC-01).~~ Fixed.
2. ~~**Anyone who knows a client's portal account ID can reset that password with no login** (SEC-02).~~ Fixed.
3. ~~**Paystack payments can never be recorded.** Every attempt fails at the database, after Paystack has already been told "received" (BUG-01).~~ Fixed.
4. ~~**The client portal does not work.** Login succeeds, then every data request fails (BUG-02).~~ Fixed.
5. **Editing a booking, editing a note, deleting an invoice and deleting an expense all fail** (BUG-03).
6. **Contracts go to clients with raw `{{client_name}}` placeholders.** Both contracts already sent from the dev database are affected (BUG-04).
7. **Migrations are broken.** Every Alembic command crashes, so a new install cannot be set up (DB-01).
8. **Finance totals are wrong on screen.** "Collected this month" rendered as `GHS 00.000.000.000.000.00...` (BUG-05).

Counts below are the original findings. Current status is in each row.

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Confirmed bugs | 5 | 18 | 18 | 1 | 42 |
| Security vulnerabilities | 3 | 9 | 8 | 2 | 22 |
| Database issues | 2 | 5 | 8 | 1 | 16 |
| Performance concerns | - | 2 | 6 | 2 | 10 |

### What is working

- `tsc` is clean, and `next build` succeeds with 25 pages generated.
- The API suite is 642 tests, all passing (see [Missing tests](#missing-tests)).
- Migrations 001-009 upgrade and downgrade cleanly on a fresh database.
- Passwords use bcrypt, queries go through the ORM (no SQL injection found), and money is stored as `Numeric(12,2)`.
- Staff and client tokens are correctly kept apart: a client token is rejected on staff routes.
- The Paystack signature check on the Next.js webhook rejects invalid signatures in code review.
- The dev data is consistent: no invoice total or `amount_paid` drift, no negative stock.
- Tested pages (Invoices, Staff) do not overflow horizontally at phone width (375px).

### How this was verified

| Label | Meaning |
|---|---|
| **Reproduced** | Observed against the running app, or measured with a tool |
| **Code** | Established by reading the code, not executed |

Testing used a temporary Postgres 18 instance on its own port, seeded through the project's migrations and scripts, plus an isolated production build of the frontend. **The dev database was only read, using read-only connections. The dev servers and repo code were not changed.** All temporary services and data were removed afterwards.

**Not covered:** Docker builds, live Paystack and SendGrid traffic, load or real concurrency testing, every UI page, PDF rendering output (the native libraries are missing on this machine; see BUG-41), and screen-reader testing. Race conditions below are from code reading. Dependency results are a snapshot from the audit date.

---

## Confirmed bugs

### Critical

| ID | Bug | Location | Evidence | Status |
|---|---|---|---|---|
| BUG-01 | **Paystack payments are never recorded.** The relay writes `received_by=None` and `created_by=None` into `NOT NULL` columns, so the database rejects it. Paystack has already received a 200, and after 3 retries the payment is lost. Tests miss this because they use a fake DB. | `api/app/routers/webhooks.py:156`, `:183`; `web/app/api/webhooks/paystack/route.ts:112` | Reproduced: `NotNullViolation` on `journal_entries.created_by`; `amount_paid` stayed 0 | **Fixed 2026-11-01** |
| BUG-02 | **Client portal and two staff auth routes are unusable.** `Depends(CurrentUser)` wraps an `Annotated` alias in `Depends` a second time. FastAPI then demands `args` and `kwargs` query parameters. This affects all 8 portal data routes, `/auth/me` and `/auth/change-password`. | `api/app/routers/portal.py:149` and 7 more; `api/app/routers/auth.py:47`, `:54` | Reproduced: 422 "Field required: args, kwargs" (500 if supplied) | **Fixed 2026-11-01** |
| BUG-03 | **Four core actions crash.** Two `AuditLog` classes both claim table `audit_logs`, and importing the second raises `InvalidRequestError`. Affects booking edit, booking note edit, invoice delete and expense delete. The booking edit page is live in the UI and always fails. Once that is fixed, `current_user` is also undefined at `bookings.py:534`. | `api/app/models/audit_log.py`; `api/app/models/auth.py:88`; `bookings.py:59`, `:523`; `invoicing.py:345`; `accounting.py:208` | Reproduced: 500 on each path; booking venue unchanged | **Fixed 2026-11-01** |
| BUG-04 | **Contract placeholders are never filled.** Templates use lowercase `{{client_name}}`; the code replaces uppercase `{{CLIENT_NAME}}`. `{{service_description}}` has no value at all. Clients are asked to sign a document with no name, date, venue or amount. | `api/app/routers/contracts.py:136`, `:356`; `api/migrations/versions/008_contracts_documents.py:86` | Reproduced. **2 of 2 dev contracts, both status `sent`, contain raw placeholders** | **Fixed 2026-11-01**. The 2 old dev contracts are test data |
| BUG-05 | **Money totals concatenate instead of add.** Pydantic `Decimal` fields reach the browser as strings (`"1.00"`), while TypeScript types them as `number`, so `s + i.amount_paid` joins text. | `web/app/(dashboard)/invoices/page.tsx:69-73`; `bookings/page.tsx:88`, `:116`, `:369`, `:632`; `contracts/new/page.tsx:36`; `invoices/new/page.tsx:110` | Reproduced on Invoices: `GHS 00.000.000.000.000.00...`. API returned `str`. Bookings lines share the same pattern (Code) | **Fixed 2026-11-01** |

### High: backend

| ID | Bug | Location | Evidence | Status |
|---|---|---|---|---|
| BUG-06 | Staff payment recording has no validation: negative amounts, overpayment, payments on drafts, unknown methods and future dates are all accepted. | `api/app/routers/invoicing.py:40`, `:397` | Reproduced: a GHS 100 draft became `paid` with `amount_paid` 950, method `chicken` | **Fixed 2026-11-01** |
| BUG-07 | Re-sending a paid invoice resets it to `sent`, and it does so for any status. | `invoicing.py:372` | Reproduced: `paid` -> `sent` | **Fixed 2026-11-01** |
| BUG-08 | Recording a payment is not atomic and has no row lock. `update_invoice_after_payment` commits before the journal entry and notification are written, so a failure leaves a payment with no ledger entry. | `invoicing.py:145`, `:407`, `:429` | Code | **Fixed 2026-11-01** |
| BUG-09 | Portal token refresh always crashes: `decode_token` is never imported. Every portal session ends at 30 minutes. | `api/app/routers/portal.py:13`, `:89` | Reproduced: 500 | **Fixed 2026-11-01** |
| BUG-13 | New staff can never log in. The temporary password is generated and discarded, no email is sent, and no reset exists. Email is also stored with its original case while login lowercases it. | `api/app/routers/staff.py:149`, `:154`, `:186` | Reproduced: stored `Kofi.B@Example.com` | **Fixed 2026-11-01**: email delivery needs `SENDGRID_API_KEY` |
| BUG-14 | `GET /contracts/templates` is unreachable because `/{contract_id}` is registered first. The template picker on New Contract fails. | `api/app/routers/contracts.py:73`, `:340` | Reproduced: 422 | **Fixed 2026-11-01** |
| BUG-15 | `GET /staff/leave` is unreachable because `/{staff_id}` is registered first. The Leave tab shows an error while the page header claims "0 pending leave requests". | `api/app/routers/staff.py:118`, `:402` | Reproduced in API and UI | **Fixed 2026-11-01** |
| BUG-16 | Repeat customers' payments are treated as duplicates. `provider_ref` uses the reusable card `authorization_code`, not the unique transaction `reference`, so a second charge returns 409 and is dropped. | `web/app/api/webhooks/paystack/route.ts:209` | Code | **Fixed 2026-11-01** |
| BUG-17 | Internal signature mismatch on whole amounts. Node signs `1500`; Python verifies `1500.0`. Every whole-cedi payment would fail once a secret is enabled. The test passes only because it signs in Python. | `route.ts:190`; `webhooks.py:80` | Reproduced | **Fixed 2026-11-01** |
| BUG-18 | `INTERNAL_WEBHOOK_SECRET` cannot be enabled. It is not a `Settings` field, so an env var is ignored, and adding it to `api/.env` crashes startup with `extra_forbidden`. See SEC-03. | `api/app/config.py:6`; `webhooks.py:66` | Reproduced both ways | **Fixed 2026-11-01** |
| BUG-20 | Stock can be oversold by repeating an item in one sale, because each line is checked against unreduced stock. | `api/app/routers/inventory.py:487-511` | Reproduced: 6 in stock, sold 10, stock is -4 | **Fixed 2026-11-01** |
| BUG-21 | Shop sale prices can be overridden by any `inventory:update` user, including negative prices. | `inventory.py:505` | Reproduced: invoice of GHS -100 marked `paid` | **Fixed 2026-11-01** |
| BUG-22 | Invoice totals trust client-sent line totals. Quantity x price is not checked; empty invoices and negative totals are accepted. | `invoicing.py:224` | Reproduced: qty 2 x 100 accepted with line total 1 | **Fixed 2026-11-01** |
| BUG-43 | Booking note edits always returned 404. `bookings.py` had its header twice and the second `router = APIRouter()` dropped the PATCH route, while the UI calls it. | `api/app/routers/bookings.py`; `web/hooks/useBookings.ts:212` | Reproduced: route missing from the app | **Fixed 2026-11-01** |
| BUG-44 | Admins cannot edit other people's booking notes. The check reads `current_user.is_admin`, which does not exist on `User`, so it is always false. | `api/app/routers/bookings.py`, `update_note` | Code | **Fixed 2026-11-01** |
| BUG-45 | Popups have no popup styling. `web/styles/*.css` is imported by nothing, and `.pp-modal-overlay` exists only there, so forms such as Add Staff render at the bottom of the page. | `web/styles/invoices.css:128`; `web/app/(dashboard)/layout.tsx:3` | Reproduced on Staff | **Fixed 2026-11-01**: 40-plus other classes in `web/styles` are still not loaded |
| BUG-46 | `GET /reports/staff/attendance` always returned 500 because of a broken SQL cast. | `api/app/routers/reports.py` | Reproduced by the route smoke test | **Fixed 2026-11-01** |
| BUG-47 | PDFs cannot be generated on this Windows machine because WeasyPrint cannot load the system library `pango-1.0-0`. Download PDF fails, and invoice emails go out without being generated. | `api/app/services/pdf.py:557` | Reproduced in test logs | Open |
| BUG-48 | Two logins in the same second received identical refresh tokens, so logging out one ended both. | `api/app/utils/security.py` | Reproduced by a timing failure in the test suite | **Fixed 2026-11-01** |
| BUG-42 | Fresh installs cannot be used. README promises a seeded `admin@partyparadise.com`, but no migration creates a user or permissions. Without `seed_permissions.py`, non-admin roles get 403 on everything. | `README.md:144`; `api/migrations/versions/001_auth_users.py:97` | Reproduced: 0 users after migrating | **Fixed 2026-11-01** |

### High: frontend

| ID | Bug | Location | Evidence | Status |
|---|---|---|---|---|
| BUG-10 | **Almost every API error displays "An unknown error occurred".** The interceptor already normalises errors, and callers normalise again, which loses the message. About 86 uses of `normaliseError`. | `web/lib/api.ts:114`, `:182`; callers in `web/hooks/index.ts` and pages | Reproduced on the Leave tab | **Fixed 2026-11-01** |
| BUG-11 | **A wrong password gives no feedback.** The auto-refresh interceptor catches the login 401 and reloads the page, which clears the form and shows no error. | `web/lib/api.ts:113-139`, `:167` | Reproduced: page reloaded, no error element | **Fixed 2026-11-01** |
| BUG-12 | "Forgot password" is fake. `/auth/forgot-password` does not exist, the error is swallowed, and the user is told a reset link was sent. | `web/app/(auth)/login/forgot/page.tsx:21-25` | Reproduced: route absent from OpenAPI | **Fixed 2026-11-01**: email delivery needs `SENDGRID_API_KEY` |
| BUG-19 | **Client portal is unfinished.** Portal login renders with no styling, because `(auth)/layout.tsx` and its CSS do not apply to `app/portal/(auth)`. The portal dashboard depends on CSS that only the staff layout imports. Bookings, invoices, contracts, documents, notifications and inquiries pages do not exist, though middleware and notification links point to them. | `web/app/portal/`; `web/middleware.ts:12`; `webhooks.py:219`; `contracts.py:315` | Login reproduced in browser; the rest from Code | **Fixed 2026-11-01** |

### Medium

| ID | Bug | Location | Evidence | Status |
|---|---|---|---|---|
| BUG-23 | Status `overdue` is never set by the backend, so Overdue cards and the filter tab are always zero. Invoice stats cover only the current page, and the header said "26 invoices in this view" beside 20 rows. | `web/app/(dashboard)/invoices/page.tsx:65-77`; `invoicing.py:372` | Reproduced/Code | **Fixed 2026-11-01** |
| BUG-24 | Filters silently do nothing: invoice `search` and client `assigned_to` are sent but ignored by the API. | `web/hooks/index.ts:53`, `:204`; `clients.py:192`; `invoicing.py:170` | Code | **Fixed 2026-11-01** |
| BUG-25 | Pagination breaks. After any filter change `filters.page` stays 1 and overrides the page. `useContracts` has no page control. Inventory and Shop only see the first 20 items, so item 21 onward cannot be sold without searching. | `web/hooks/index.ts:54`, `:80`, `:205`, `:351`, `:398-418` | Code | **Fixed 2026-11-01** |
| BUG-26 | Staff attendance report always crashes (`func.cast`/`func.Integer` misuse). | `api/app/routers/reports.py:317` | Reproduced: 500 | **Fixed 2026-11-01** (same bug as BUG-46) |
| BUG-27 | Time and date maths is unvalidated. An overnight shift records -20 hours; leave ending before it starts records -8 days. Clock times are client-supplied. | `staff.py:383-386`, `:438` | Reproduced | **Fixed 2026-11-01** |
| BUG-28 | Ordinary data errors become bare 500s: duplicate client email, nonexistent client/user IDs, malformed UUID in `PATCH /auth/users/{id}`. No `IntegrityError` handler exists. | `clients.py:229`; `bookings.py:469`; `invoicing.py:227`; `auth.py:92` | Reproduced | **Fixed 2026-11-01** |
| BUG-29 | Inventory import crashes with 500 on an extra CSV column, non-UTF-8 CSV, an overlong field, or a malformed XLSX. One bad row can lose the whole import. | `inventory.py:132`, `:137`, `:179`, `:389` | Reproduced: all 4 cases | **Fixed 2026-11-01** |
| BUG-30 | Mixed-case client emails block portal login: stored as typed, looked up lowercased. Editing a client's email also does not update their portal account. | `portal.py:61`, `:420`; `clients.py:259` | Reproduced: correct password returned 401 | **Fixed 2026-11-01** |
| BUG-31 | Booking rules are missing: any status jump is allowed (`completed` -> `inquiry`), past dates, negative guests, end before start, duplicate staff. Equipment conflicts are not rechecked when a date changes or a booking is confirmed, and quantity is ignored. | `bookings.py:368`, `:509`, `:565`, `:627` | Reproduced/Code | **Fixed 2026-11-01**: events may still end after midnight, and `equipment` has no stock count, so quantity is only checked to be 1 or more |
| BUG-32 | Combo bookings have no template, so New Contract fails with 404. Template choice is also non-deterministic (`.first()` with no ordering, can pick a generic one). | `contracts.py:116-127`; migration `008` | Reproduced for missing-template path | **Fixed 2026-11-01** |
| BUG-33 | Expense handling is inconsistent: negative amounts accepted, `PATCH status=voided` leaves the journal entry in place, while the delete path hard-deletes journal rows. | `accounting.py:153-167`, `:198-205` | Reproduced | **Fixed 2026-11-01** |
| BUG-34 | Shop sales write no journal entry, so the ledger disagrees with P&L. Sale metadata is stored as JSON in `invoice.notes`, which the invoice PDF template prints. | `inventory.py:220`, `:526`; `api/app/services/pdf.py:282` | Reproduced: 0 journal rows | **Fixed 2026-11-01** |
| BUG-35 | **`SENDGRID_SANDBOX` in `.env` has no effect.** Settings loads it, but `email.py` reads `os.getenv`. A developer who enables it can still email real clients. | `api/app/services/email.py:61` | Code | **Fixed 2026-11-01** |
| BUG-36 | Inventory `adjustment` can only reduce stock, so a count that finds extra items cannot be recorded. | `inventory.py:633` | Code | **Fixed 2026-11-01** |
| BUG-38 | Mojibake in the live UI: the empty-money placeholder renders as `â€”` on dashboard and invoices cards. 8 source files affected, plus README. | `web/lib/utils.ts:17` | Reproduced | **Fixed 2026-11-01** |
| BUG-39 | The dashboard shows invented content: "vs last month" always trends up, "3 awaiting follow-up" is hardcoded, "Revenue Trend" is a single bar, and the notification dot is permanent. Bell, Search and "Remember me" do nothing. | `web/app/(dashboard)/page.tsx:82`, `:112`, `:313`; `layout.tsx:160-166`; `login/page.tsx:15` | Reproduced/Code | **Fixed 2026-11-01**: invented figures and dead buttons removed. The dashboard date-range buttons were not reviewed |
| BUG-40 | UI rough edges: Staff tabs render joined as "StaffScheduleLeave", internal notes appear in the UI ("This page is now the operational source of truth"), logout disappears when the sidebar is collapsed, and only 2 route groups have error boundaries. No `not-found` page exists. | `web/app/(dashboard)/staff/page.tsx`; `layout.tsx:124` | Reproduced/Code | **Fixed 2026-11-01** |
| BUG-41 | "Sent" is reported even when nothing was delivered. Email and PDF failures are logged and ignored, so an invoice becomes `sent` with no email. PDF download returns 500 on this machine because WeasyPrint's native libraries are missing. | `invoicing.py:372-392`; `contracts.py:192-209`; `api/app/routers/pdfs.py:47` | Reproduced | **Fixed 2026-11-01**: PDFs still need BUG-47 |

### Low

| ID | Bug | Location | Evidence | Status |
|---|---|---|---|---|
| BUG-37 | The shift check says "overlapping" but blocks any second shift that day. | `staff.py:286-296` | Code | **Fixed 2026-11-01** |

---

## Security vulnerabilities

### Critical

| ID | Vulnerability | Location | Evidence | Status |
|---|---|---|---|---|
| SEC-01 | **Password hashes leak through the staff API.** Endpoints return ORM objects with `.user` loaded, so the whole `User` row is serialised, including `password_hash`. Default `staff` role has `staff:read`, so the lowest role can harvest admin hashes for offline cracking. The frontend relies on this `user` object, so it needs a proper response schema, not just a field removal. Leave endpoints nest the same data. | `api/app/routers/staff.py:113-115`, `:129`, `:184`, `:208`, `:418-422` | Reproduced as `staff` role: `password_hash` present | **Fixed 2026-11-01** |
| SEC-02 | **Unauthenticated portal account takeover.** `POST /portal/auth/setup/{token}` treats the account's UUID as the token. It never expires, works repeatedly, has no password rules, and activates disabled accounts. The UUID is hard to guess but is not a secret. | `api/app/routers/portal.py:120-140` | Reproduced: anonymous reset, then logged in with password `x` | **Fixed 2026-11-01** |
| SEC-03 | **Payment endpoint has no real authentication.** `POST /invoices/{id}/payments` accepts any caller sending `X-Source: paystack-webhook`, and the HMAC check can never run (BUG-18). **It only fails today because of BUG-01. Fixing BUG-01 first would let anyone mark invoices paid, so fix this first.** | `api/app/routers/webhooks.py:66-68`, `:101-113` | Reproduced: anonymous request reached the DB write | **Fixed 2026-11-01** |

### High

| ID | Vulnerability | Location | Evidence | Status |
|---|---|---|---|---|
| SEC-04 | Refresh tokens work as access tokens. Auth checks `type` but not the `refresh` claim, so a stolen 7-day token gives direct API access. | `api/app/dependencies.py:29`, `:100`; `api/app/utils/security.py:35` | Reproduced: 200 on `/clients` | **Fixed 2026-11-01** |
| SEC-05 | Audit log API has no authentication. Anyone can reach list and create. It only crashes now because it uses the wrong model. Double prefix makes the path `/audit-logs/audit-logs/`. | `api/app/routers/audit_log.py:8-29`; `api/app/main.py:66` | Reproduced: anonymous request reached the handler (500) | **Fixed 2026-11-01** (list still returns 500 for admins until DB-02) |
| SEC-06 | Stored XSS on the public signing page. Contract body is rendered with `dangerouslySetInnerHTML` without escaping, and it includes staff-entered text. The page shares an origin with the JS-readable tokens in SEC-08, so a script could steal sessions. | `web/app/contracts/sign/[token]/page.tsx:441` | `<script>` confirmed in public API response; browser execution not tested | **Fixed 2026-11-01** |
| SEC-07 | The `staff` role is over-privileged. `staff:update` lets any staff member change salaries and approve leave, including their own. | `api/scripts/seed_permissions.py:76-86`; `staff.py:191`, `:455` | Reproduced: staff raised a salary to 999,999 and approved leave | **Fixed 2026-11-01** |
| SEC-08 | Tokens are readable by JavaScript. Refresh tokens are in `localStorage` and a non-HttpOnly cookie without `Secure`. The portal access token is in `localStorage`, contradicting the code's own comment. | `web/lib/api.ts:18-31`, `:63`; `web/app/portal/(auth)/login/page.tsx:30` | Code | **Partly fixed**: the portal access token left `localStorage`; refresh tokens are still readable by JavaScript |
| SEC-09 | No login rate limiting or lockout on staff or portal login. Timing also reveals whether an email exists, since bcrypt only runs for real users. | `api/app/services/auth.py:56`; `portal.py:65` | Reproduced: 12 bad attempts, no throttle | **Fixed 2026-11-01** |
| SEC-10 | JWT signing key can be a public value. `config.py` falls back to `change-me-in-production`, nothing blocks startup with it, and root `.env`, which Docker Compose loads, still holds a placeholder. Anyone could forge an admin token on such a deployment. | `api/app/config.py:9`; `docker-compose.yml:48` | Code; placeholder detected without printing values | **Fixed 2026-11-01** |
| SEC-11 | **Credentials in the repo.** `.env.example` is committed with what looks like a real local database password in `DATABASE_URL`, and the repo has a GitHub remote (`alpha01-01/PartyParadise`; visibility could not be checked). Untracked `create_test_users.py` holds fixed passwords and resets them on each run. README and Compose publish weak defaults. **Rotate the database password if it is real or reused anywhere, and do not commit that script as is.** | `.env.example:23`; `api/scripts/create_test_users.py:21`; `README.md:148`; `docker-compose.yml:25` | Code | **Partly fixed**: code cleaned, **password rotation still needed** |
| SEC-12 | Dependencies with known vulnerabilities. `npm audit`: 7 production packages (1 critical, 5 high, 1 moderate), including `next` 14.2.3 (fix 14.2.35) and `axios`. `pip-audit`: `python-jose` (JWT library), `python-multipart`, `jinja2`, `weasyprint`, `python-dotenv`, `pytest`. | `web/package.json`; `api/requirements.txt` | Reproduced with both tools | **Fixed 2026-11-01** |

### Medium

| ID | Vulnerability | Location | Evidence | Status |
|---|---|---|---|---|
| SEC-13 | Sessions are not revoked: changing a password or deactivating a user leaves refresh sessions in place, tokens are not rotated, and the portal has no logout endpoint, so its button only clears the browser. | `api/app/services/auth.py:97`, `:136`; `auth.py:97` | Code | **Partly fixed**: refresh tokens are not rotated |
| SEC-14 | Contract signing is weak. The link is the contract UUID, never expires (the email claims 48 hours), proves nothing about the signer, and accepted a 2 MB signature anonymously. | `contracts.py:196`, `:221-296`; `email.py:246` | Reproduced | **Partly fixed**: signing does not prove who signed |
| SEC-15 | Paystack events are not verified further: currency and transaction are not confirmed with Paystack's verify API. | `route.ts:166` | Code | **Fixed 2026-11-01** |
| SEC-16 | Import has no size limit and parses user ZIP/XML directly, risking memory exhaustion. | `inventory.py:324`, `:157`, `:180` | Code | **Fixed 2026-11-01** |
| SEC-17 | Temporary portal passwords travel by email and appear in API responses outside production. Users are told to change them, but the portal has no way to do so. | `portal.py:443`; `email.py:336`, `:339` | Reproduced | **Fixed 2026-11-01** |
| SEC-18 | HTML injection in emails: names, venue and similar values are inserted unescaped. | `api/app/services/email.py:191`, `:241`, `:374` | Code | **Fixed 2026-11-01** |
| SEC-19 | Internal exception text is returned to clients. | `invoicing.py:319` | Code | **Fixed 2026-11-01** |
| SEC-20 | No CSP or other security headers from web or API. `useHasPermission` returns true for any role, so the UI shows actions users cannot perform (the API still enforces them). | No `next.config`; `web/lib/auth.ts:151-159` | Code | **Fixed 2026-11-01** |

### Low

| ID | Vulnerability | Location | Evidence | Status |
|---|---|---|---|---|
| SEC-21 | API docs are on unless `ENV=production`, and Compose hardcodes development. Postgres and the web dev server listen on all interfaces here, so they are reachable from the local network. | `main.py:35`; `docker-compose.yml:28`, `:47` | Reproduced with `netstat` | **Fixed 2026-11-01** |
| SEC-22 | Password policy is only 8 characters on staff and none on portal setup server-side. | `api/app/schemas/auth.py:28`; `portal.py:26` | Code | **Fixed 2026-11-01** |

---

## Database issues

**Dev database snapshot, read-only:** Alembic at `009`, 50 tables, 0 CHECK constraints, 38 foreign keys with no index, 89 sessions of which 88 expired, 102 audit rows.

| ID | Severity | Issue | Location | Evidence | Status |
|---|---|---|---|---|---|
| DB-01 | Critical | **Alembic is broken.** `010` points to `009_client_portal`, but the real ID is `009`. Every command fails with `KeyError`, including `upgrade`, so new setups cannot migrate. | `api/migrations/versions/010_audit_logs.py:10` | Reproduced | **Fixed 2026-11-01** |
| DB-02 | Critical | Fixing that ID is not enough. `010` recreates existing `audit_logs` (`relation already exists`), and its `Integer` columns cannot reference UUID `users.id`. Decide on one audit table and extend the existing one with a proper migration. Needs care: 102 rows exist. | `010_audit_logs.py:15-25`; `001_auth_users.py:81` | Reproduced | **Fixed 2026-11-01** |
| DB-03 | High | Two migration folders. Root `migrations/` differs from `api/migrations/` (`metadata` vs `extra_data` in `001`). Alembic only uses `api/`. | `migrations/versions/001_auth_users.py:87` | Reproduced with `diff` | **Fixed 2026-11-01** |
| DB-04 | High | No CHECK constraints, so the database accepts negative stock, money and hours, and invalid statuses. Add them after fixing and checking existing data. | All migrations | Reproduced: 0 constraints | **Fixed 2026-11-01** |
| DB-05 | High | Missing unique constraints: `payments.provider_ref` (payment idempotency is a racy check), `payments.reference`, `expenses.reference`, `user_roles`, `role_permissions`, `client_tags`, `booking_staff`. | `005`, `006`, `001`, and model files | Code | **Fixed 2026-11-01** |
| DB-06 | High | 38 foreign keys lack an index, including `booking_services.booking_id`, `invoice_items.invoice_id`, `client_addresses.client_id`, `user_roles.user_id`, `role_permissions.role_id`. `sessions.token_hash`, used on every refresh, has no index. | Dev catalog | Reproduced | **Fixed 2026-11-01** |
| DB-07 | High | `generate_reference` is unsafe under concurrency. It reads all refs for the year and adds one, so two simultaneous requests get the same reference: a 500 on unique columns, a silent duplicate on `payments` and `expenses`. Use a sequence or counter table. | `api/app/utils/references.py:13-28` | Code | **Fixed 2026-11-01** |
| DB-08 | Medium | There is no "system" actor. `payments.received_by` and `journal_entries.created_by` are required, but webhooks have no user. Make them nullable with a source field, or create a system user. Root cause of BUG-01. | `005:84`; `006:67` | Reproduced | **Fixed 2026-11-01** |
| DB-09 | Medium | Models omit 48 indexes that exist in migrations. **`alembic revision --autogenerate` would propose dropping all 48.** Declare them in the models before anyone uses autogenerate, which README recommends. | `api/app/models/*` | Reproduced | **Fixed 2026-11-01** |
| DB-10 | Medium | ORM cascades contradict DB rules: `Invoice.payments` and `StaffProfile.shifts` use delete cascade, while their foreign keys are `RESTRICT`. | `models/invoicing.py:73`; `models/staff.py:27` | Code | **Fixed 2026-11-01** |
| DB-11 | Medium | Login audit data is silently lost: `AuditLog(metadata=...)` sets a Python attribute, not `extra_data`. Login is also the only event being audited. | `api/app/services/auth.py:86` | Reproduced: `extra_data` NULL | **Fixed 2026-11-01** |
| DB-12 | Medium | Expired sessions are never cleaned up. | `sessions`, `portal_sessions` | Reproduced: 88 of 89 expired | **Fixed 2026-11-01** |
| DB-13 | Medium | Shop sale data lives in JSON text in `invoices.notes`, queried with `LIKE`. Walk-in client lookup by name can race and create duplicates. Needs a proper sales model or columns. | `inventory.py:420`, `:464` | Code | **Partly fixed**: sales are found by reference, not by searching notes. The data itself is still JSON in notes |
| DB-14 | Medium | `amount_paid` has two update paths: staff payments recalculate, webhooks increment. They can diverge, and there is no refund or void path. | `invoicing.py:127`; `webhooks.py:168` | Code | **Partly fixed**: one recalculating path. There is still no refund or void path |
| DB-15 | Medium | Accounting periods are not enforced: `account_periods` is empty, entries get no period, and nothing blocks changes to closed periods. | `webhooks.py:174`; `accounting.py` | Reproduced: 0 rows | **Fixed 2026-11-01** |
| DB-17 | High | **The app role cannot run migrations on dev.** All 49 tables belong to `postgres`, so `partypeople` fails with `must be owner of table audit_logs`. Revisions 010 and 011 are therefore not applied to dev. `api/scripts/fix_dev_table_owner.sql` hands ownership to the app role. | Dev catalog | Reproduced 2026-11-01; fix tested on a throwaway database | **Fixed 2026-11-01**: dev tables owned by `partypeople`, revision `011` applied, `alembic check` clean |
| DB-16 | Low | Assorted: `id` columns have no DB default (49), `updated_at` relies on the ORM, no `pool_pre_ping`, version mismatch (Compose Postgres 15, dev 18), README table count is out of date. | `api/app/database.py:7`; migrations | Reproduced | **Partly fixed**: `pool_pre_ping` added. `id` defaults and the Postgres version gap remain |

---

## Missing tests

**Current state:** 642 tests in 15 files with `TEST_DATABASE_URL` set, all passing, with no expected failures left. TEST-01 to TEST-06 are in place; CI is written but has never run. **Only `test_webhooks.py` is committed.** `conftest.py`, `test_inventory_import.py`, `test_references.py` and `test_security.py` are untracked. No frontend tests, no end-to-end tests, no CI, no ESLint config.

The webhook tests pass while the real flow is 100% broken, because a fake DB ignores `NOT NULL`, and the test signs its payload with Python instead of Node. **New integration tests must run against real Postgres.**

| ID | Priority | Needed coverage | Would have caught |
|---|---|---|---|
| TEST-01 | P0 | Postgres test fixture with per-test rollback, plus CI running tests, `tsc`, lint and a build | Everything below |
| TEST-02 | P0 | Migration smoke test: `upgrade head` on an empty DB, `alembic check`, one-way drift check | DB-01, DB-02, DB-09 |
| TEST-03 | P0 | Authorization matrix for all ~100 routes: anonymous, client, staff, manager, admin | SEC-03, SEC-05, SEC-07 |
| TEST-04 | P0 | Response safety: assert no `password_hash` in any response | SEC-01 |
| TEST-05 | P0 | Auth lifecycle: login, refresh, refresh-as-access rejected, logout, revocation on password change, portal flows | BUG-02, BUG-09, SEC-02, SEC-04 |
| TEST-06 | P0 | Webhook with real DB, including a contract test proving Node and Python signatures match, and duplicate delivery | BUG-01, BUG-16, BUG-17 |
| TEST-07 | P1 | Finance rules: totals, payment limits, status changes, atomicity, ledger agreement, P&L | BUG-06, BUG-07, BUG-08, BUG-22, BUG-33, BUG-34 |
| TEST-08 | P1 | Contract lifecycle: template fills with no `{{` left, combo type, send, sign, expiry | BUG-04, BUG-32, SEC-14 |
| TEST-09 | P1 | Route smoke test: every list/detail route returns no 5xx or unexpected 422 | BUG-14, BUG-15, BUG-26 |
| TEST-10 | P1 | Inventory: repeated lines, concurrency, stock limits, malformed imports | BUG-20, BUG-21, BUG-29 |
| TEST-11 | P1 | API schema type check: money is one consistent JSON type, generated TS types from OpenAPI | BUG-05 |
| TEST-12 | P2 | Bookings and staff rules: status moves, equipment conflicts, overnight shifts, leave dates | BUG-27, BUG-31 |
| TEST-13 | P2 | Frontend unit tests: error normalisation, interceptor, pagination hooks, formatters | BUG-10, BUG-11, BUG-25, BUG-38 |
| TEST-14 | P2 | Playwright flows: login (wrong and right password), booking -> invoice -> payment, contract signing, portal | BUG-11, BUG-19 |
| TEST-15 | P3 | Accessibility checks and concurrency tests for references and stock | DB-07, BUG-08 |

---

## Performance concerns

Query counts were measured with a handful of rows. Costs grow with data.

| ID | Severity | Concern | Location | Evidence | Status |
|---|---|---|---|---|---|
| PERF-01 | High | N+1 on invoice list: **25 queries for 20 rows**, because each row lazy-loads its client. Add `selectinload`. | `invoicing.py:194`, `:71` | Reproduced | **Fixed 2026-11-01** |
| PERF-02 | High | Client list loads every booking, service and invoice for every client, and client detail fetches it all twice (`/clients/{id}` plus `/timeline`). This gets heavier with each client's history. | `clients.py:181`, `:289`; `web/hooks/index.ts:131` | Reproduced: 10 queries; Code | **Fixed 2026-11-01** |
| PERF-03 | Medium | P&L runs 2 queries per month (27 total) where one `GROUP BY` would do, and `extract()` filters cannot use date indexes. | `reports.py:110`, `:29` | Reproduced | **Fixed 2026-11-01** |
| PERF-04 | Medium | PDF generation and SendGrid calls run inside requests with no background queue, and the browser timeout is 15 seconds. | `invoicing.py:388`; `contracts.py:205`; `web/lib/api.ts:11` | Code | Open |
| PERF-05 | Medium | Import is `async def` but does blocking DB and parsing work, which stalls the event loop for all users. | `inventory.py:316` | Code | **Fixed 2026-11-01** |
| PERF-06 | Medium | `generate_reference` loads every reference for the year on each create, and the staff/shop lists have N+1 patterns (`/inventory/shop-sales` 9 queries for few rows). | `references.py:13`; `inventory.py:427` | Reproduced | **Fixed 2026-11-01** |
| PERF-07 | Medium | Search uses `ILIKE '%x%'` with no trigram index, and shop sales use `LIKE` on notes, so these scan full tables. | `clients.py:205`; `bookings.py:415`; `inventory.py:420` | Code | **Partly fixed**: shop sales no longer scan notes. Client and booking search still need a `pg_trgm` index |
| PERF-08 | Medium | Unbounded lists: equipment, staff, leave, suppliers, shifts and all portal lists. | `inventory.py:703`; `staff.py:112`; `portal.py` | Code | **Fixed 2026-11-01** |
| PERF-09 | Low | Each permission check costs 2 queries on top of user lookup. Load roles once per request or cache briefly. | `api/app/dependencies.py:60-77` | Code | **Fixed 2026-11-01** |
| PERF-10 | Low | Web container runs the dev server, and API uses a single worker with default pool. No client-side caching, and `dashboard.css` is 2,012 lines. | `web/Dockerfile`; `api/Dockerfile` | Code | **Fixed 2026-11-01** |

---

## Fixes completed

When an item is fixed, record it here and set its status above to `Fixed`.

| Date | ID(s) | Fix | Verified by | Commit |
|---|---|---|---|---|
| 2026-11-01 | SEC-01 | Staff and leave routes now use explicit response schemas with no `password_hash` | Unit tests; real Postgres sweep of 36 GET routes; Staff page checked in browser | Uncommitted |
| 2026-11-01 | SEC-02 | Portal setup needs a signed, 48-hour, single-use token and a strong password; bare account IDs and disabled accounts are refused | Unit tests; end-to-end on Postgres | Uncommitted |
| 2026-11-01 | SEC-03, BUG-17, BUG-18 | Payment endpoint now always requires a valid signature and rejects everything if no secret is set. `INTERNAL_WEBHOOK_SECRET` is a real setting. Node and Python sign the same `.2f` amount. Paystack relay refuses to send unsigned | Unit tests including relay-format signature; Postgres. Node side verified by type-check and matching format, not a live webhook | Uncommitted |
| 2026-11-01 | SEC-04 | Refresh tokens rejected on staff and portal access checks | Unit tests; Postgres | Uncommitted |
| 2026-11-01 | SEC-05 | Audit list needs `users:read` (admin only), HTTP write route removed, double prefix fixed | Unit tests; Postgres | Uncommitted |
| 2026-11-01 | SEC-10 | `SECRET_KEY` is required, at least 32 characters, and placeholders stop startup | Unit tests; confirmed refusal on placeholder | Uncommitted |
| 2026-11-01 | SEC-11 (part) | Password removed from `.env.example`, Compose reads `POSTGRES_PASSWORD`, README default login removed, `create_test_users.py` generates passwords and refuses production | Grep; Postgres seed run. Compose change not run | Uncommitted |
| 2026-11-01 | SEC-12 (part) | `python-jose` replaced by `PyJWT` 2.15.0; `jinja2` 3.1.6; `next` 14.2.35; `axios` 1.21.0 and transitive fixes. `npm audit` production findings fell from 7 to 2 | `pip-audit` and `npm audit` re-run (PyJWT 2.15.0 itself not re-scanned); `tsc`; production build | Uncommitted |
| 2026-11-01 | BUG-42 (part) | README now gives the real first-login steps | Doc change | Uncommitted |

| 2026-11-01 | DB-01, DB-03 | Broken `010` removed and replaced, Alembic chain repaired, stale root `migrations/` deleted | Upgrade on empty Postgres and on a copy of dev; migration tests | Uncommitted |
| 2026-11-01 | BUG-03, DB-02, DB-11 | One `AuditLog` model on the existing UUID table, extended by revision `010`. `record_audit` writes in the same transaction as the change. Login IP is now stored | Tests; booking edit through the UI on Next 16 wrote the before and after values; all 103 audit rows kept on the copy | Uncommitted |
| 2026-11-01 | BUG-42 | Revision `011` seeds permissions, so a fresh install has working roles | Empty-database test: 27 permissions, 60 role links | Uncommitted |
| 2026-11-01 | BUG-43 | Note edit route restored and duplicate header removed | Test through the API | Uncommitted |
| 2026-11-01 | DB-09 | All 50 migration indexes declared in the models | `alembic check` clean, kept by test | Uncommitted |
| 2026-11-01 | TEST-01 to TEST-06 | Postgres fixture with per-test rollback, migration, authorization matrix, response safety, auth lifecycle and webhook tests, Node and Python signature contract test, CI workflow | Local suite. CI has not run | Uncommitted |
| 2026-11-01 | SEC-12 (part) | Next 16.4.3, React 19, ESLint 9 with a real config, `middleware.ts` renamed `proxy.ts` | Isolated copy: `tsc`, lint, production build, `npm audit` 0 production findings, sign-in, redirects and booking edit in a browser | Uncommitted |

| 2026-11-01 | BUG-02, BUG-09 | Staff and portal routes use their auth dependency directly, so `/auth/me`, change password and all portal data routes work. Changing a password now ends existing sessions | Tests for every route against each token type | Uncommitted |
| 2026-11-01 | BUG-04 | Placeholders fill in any case, `service_description` is built from the booking, and an unknown placeholder stops the contract | Tests on all 3 seeded templates | Uncommitted |
| 2026-11-01 | BUG-14, BUG-15 | Literal routes registered before `/{id}`, which also restores `/staff/shifts/week`. A test now fails on any shadowed route | Tests; template list and Leave tab in a browser | Uncommitted |
| 2026-11-01 | BUG-05 | New `Money` type sends every money field as a JSON number, matching the TypeScript types | Tests; Invoices and Bookings totals in a browser | Uncommitted |
| 2026-11-01 | BUG-10, BUG-11 | `normaliseError` keeps already normalised errors, validation messages are readable, and failed sign-ins skip token refresh | Wrong password message in a browser | Uncommitted |
| 2026-11-01 | BUG-12, BUG-13 | `/auth/forgot-password`, `/auth/reset-password` and `/login/reset/[token]`. Single-use links last 1 hour for resets and 48 hours for invites. New staff get an invite, or the creator gets the link if email fails. Email lookup ignores case | Tests; new staff set a password in a browser and logged in. Real email delivery not tested | Uncommitted |
| 2026-11-01 | BUG-46 | Attendance report SQL fixed | Route smoke test | Uncommitted |

| 2026-11-01 | BUG-01, BUG-16, DB-08 | Revision `012` makes the user columns nullable and adds `payments.source`. The relay now sends the unique transaction reference | Signed events through the real Next relay into a copy of dev: bad signature refused, charge recorded, repeat ignored, second charge on the same card recorded. Live Paystack not tested | Uncommitted |
| 2026-11-01 | BUG-06, BUG-08, DB-14 | `services/payments.py` is the one payment path for staff and webhooks, with a row lock, one transaction and full validation. `amount_paid` is always recalculated | Tests including a forced ledger failure; payment through the UI | Uncommitted |
| 2026-11-01 | BUG-07 | Paid and cancelled invoices cannot be sent. Re-sending an open invoice keeps its status | Tests | Uncommitted |
| 2026-11-01 | BUG-22 | Server calculates line totals and refuses mismatches, empty invoices, negative values and discounts over the total | Tests | Uncommitted |
| 2026-11-01 | BUG-33 | Positive amounts only; voiding by update and by delete share one path and keep an audit row | Tests | Uncommitted |
| 2026-11-01 | BUG-34 | Shop sales write a ledger entry and the existing sale was backfilled. Metadata no longer reaches invoice notes or PDFs | Tests; migration on a copy of dev | Uncommitted |
| 2026-11-01 | DB-04 (part), DB-05 | 11 CHECK and 7 UNIQUE constraints | Dev data audited first; upgrade, rollback and re-upgrade on a copy | Uncommitted; applied to dev |
| 2026-11-01 | DB-07 | Reference numbers come from a locked counter row | 8 simultaneous requests got 8 different numbers | Uncommitted |
| 2026-11-01 | BUG-45 | Modal styles added to the loaded dashboard stylesheet | Record Payment popup in a browser | Uncommitted |

| 2026-11-01 | BUG-20, BUG-21, BUG-36 | Repeated sale lines count against stock, prices cannot be negative, only finance roles can change a shop price, and stocktakes can add or remove stock | Tests | Uncommitted |
| 2026-11-01 | BUG-29 | Imports survive extra cells, non-UTF-8 files and bad Excel files, and each row imports on its own | Tests | Uncommitted |
| 2026-11-01 | BUG-23, BUG-24, BUG-25 | Overdue is set by the API, invoice cards use a new all-invoices stats route, search and assignee filters work, pagination is fixed, and Inventory and Shop load the whole catalogue | API tests. The web pagination changes passed type-check and build, not a browser run | Uncommitted |
| 2026-11-01 | BUG-27, SEC-07 (part) | New `staff:manage` permission covers pay, role, status and leave review. Nobody reviews their own leave. Staff clock only their own shifts at server time. Overnight shifts count correctly | Tests | Uncommitted |
| 2026-11-01 | BUG-28 | Database errors return 409 or 422 with a readable message | Tests | Uncommitted |
| 2026-11-01 | BUG-30, BUG-31, BUG-32, BUG-44 | Portal emails ignore case and follow client edits. Booking moves follow a workflow, equipment is rechecked, combo template added, template choice is fixed, admins can edit any note | Tests; combo contract on a copy of dev | Uncommitted |
| 2026-11-01 | SEC-06, SEC-14 (part) | Contract text is escaped. Signing links are signed and last 7 days, bare IDs are refused, signatures are limited to 200 KB, and signing is audited | Planted script did not run in a browser; contract signed through the page | Uncommitted |
| 2026-11-01 | SEC-13 (part), BUG-48 | Deactivation ends sessions, portal logout added, refresh tokens are unique | Tests | Uncommitted |
| 2026-11-01 | BUG-35, BUG-41 | Sandbox setting is honoured. Send routes report whether email was delivered, and staff see a warning or the signing link | Tests | Uncommitted |
| 2026-11-01 | DB-04 | 5 more CHECK constraints on stock, bookings, hours and leave | Dev data audited; upgrade, rollback and re-upgrade on a copy | Uncommitted; applied to dev |

| 2026-11-01 | SEC-07 | Pay is hidden from anyone without `staff:manage`, except on their own record | Tests | Uncommitted |
| 2026-11-01 | SEC-17 | Portal invites use a one-time 48-hour link. No temporary password is created or returned, re-inviting keeps the current password, and clients can change their password | Tests; invite link used in a browser | Uncommitted |
| 2026-11-01 | Paystack charges, SEC-15 | `POST /portal/invoices/{id}/pay` starts a charge. Each webhook is confirmed with Paystack's verify API for status, currency, amount and invoice before recording, and refused if Paystack cannot be reached | Tests; full browser journey against a local fake Paystack through the real relay. Live Paystack not tested | Uncommitted |
| 2026-11-01 | BUG-19 | Portal login is styled, with a shared layout plus Bookings, Invoices, Invoice detail, Contracts, Documents, Notifications, Enquiries and Account pages. Drafts are hidden from clients, and staff can list enquiries through the API | Tests; pages loaded in a browser. Screens with no test data showed empty states only | Uncommitted |
| 2026-11-01 | Phase 4 regression | Staff can save the edit form when role and type are unchanged | Test | Uncommitted |
| 2026-11-01 | SEC-08 (part) | Portal access token stays in memory, and a full page load now refreshes it | Browser | Uncommitted |

| 2026-11-01 | SEC-09, SEC-22 | Login locks an account after 5 failures and an address after 30 in 15 minutes, password reset requests are limited, unknown emails spend the same bcrypt time, and staff passwords follow the portal rule | Tests; 6th bad login returned 429 on a running server | Uncommitted |
| 2026-11-01 | SEC-12 | `python-multipart` 0.0.31, `python-dotenv` 1.2.2, `weasyprint` 70, `pytest` 9.0.3 | `pip-audit` on pinned packages: none found. Transitive packages not scanned, and PDF output not checked on the new WeasyPrint | Uncommitted |
| 2026-11-01 | SEC-16, PERF-05 | 5 MB upload limit, 50 MB unzipped limit, XML entities refused, and import no longer blocks the event loop | Tests | Uncommitted |
| 2026-11-01 | SEC-18, SEC-19 | Email values are escaped, and internal error text is no longer returned | Tests | Uncommitted |
| 2026-11-01 | SEC-20, SEC-21 | Content Security Policy and headers on web and API, API docs only in development, Compose ports bound to `127.0.0.1` | Headers read from running servers; staff pages loaded with no policy violations | Uncommitted |
| 2026-11-01 | DB-06, DB-10, DB-12, DB-15 | Revision `014` indexes 36 columns including every foreign key and both `token_hash` columns. Contradictory cascades removed, expired sessions cleared, closed periods refuse changes | Tests; upgrade, rollback and re-upgrade on a copy; applied to dev | Uncommitted |
| 2026-11-01 | PERF-01, 02, 03, 06, 08, 09 | Invoice and shop lists load relations in bulk, client list skips history, P&L uses `GROUP BY`, unbounded lists have limits, permission checks use one query | Query-count tests | Uncommitted |
| 2026-11-01 | BUG-37, BUG-38, BUG-39, BUG-40 | Shifts check real overlaps. Garbled text repaired in 11 files. Invented dashboard figures, dead buttons and internal notes removed. Tabs styled, logout works when collapsed, 404 and error pages added | Tests; staff pages in a browser | Uncommitted |
| 2026-11-01 | PERF-10, deployment | Production Dockerfiles run as non-root, `.dockerignore` added, `docker-compose.prod.yml` runs migrations first, backups documented | Docker has not been run | Uncommitted |
| 2026-11-01 | Observability | Request IDs and timing in logs, `/health` checks the database | Tests | Uncommitted |
| 2026-11-01 | Clean-up | `stubs.py` and `page.wired.tsx` deleted, test tools moved to `requirements-dev.txt`, settings use Pydantic v2, staff can see client enquiries on the client page | Tests; type-check | Uncommitted |

### Outstanding from Phase 6

These were left on purpose because each is a feature or redesign, not a fix:

- **Cookie sessions (SEC-08) and token rotation (SEC-13):** refresh tokens are still readable by JavaScript. Moving them to HttpOnly cookies also solves rotation, and should be done as one piece of work.
- **Signer identity (SEC-14):** needs a design, such as a code sent by SMS.
- **Refunds (DB-14)**, editing or cancelling invoices, and a durable log of rejected Paystack events.
- **Background jobs (PERF-04):** email and PDF work still runs inside the request.
- **Client and booking search (PERF-07):** needs a `pg_trgm` index.
- **Accessibility:** most of the 149 labels are not linked to their inputs, and native `alert`/`confirm` remain.
- **Structure:** service layer, splitting `hooks/index.ts`, and generated TypeScript types.
- **Not run:** Docker images, CI, live Paystack, real email, PDFs on WeasyPrint 70.
- **Your actions:** rotate the database password (SEC-11), decide on rewriting git history (decision 6), and untrack `web/tsconfig.tsbuildinfo` when committing.

### Outstanding from Phase 5

- **Live Paystack is untested.** Run a test-mode charge with real test keys, and register the webhook URL with Paystack.
- **Forgot password for clients:** there is no self-service reset. Staff can send a new invite.
- **Portal PDFs:** clients cannot download invoices or contracts yet (needs BUG-47).

### Outstanding from Phase 4

- **Staff reading clients and invoices** is unchanged. Only pay is hidden (decision 5).
- **Refresh token rotation (SEC-13):** left out because the page-load refresh and the API interceptor can use the same token at once, and rotating would sign people out at random. Needs one shared refresh first.
- **Signing proves who holds the link, not who the person is (SEC-14).** A public rate limit is also missing.
- **Links sent before this change** stop working. The 2 old test contracts can be re-sent.
- **Sign page text** promises a copy by email, which is not implemented.

### Outstanding from Phase 3

- **Paystack setup:** set `PAYSTACK_SECRET_KEY` and `INTERNAL_API_URL`, and the same `INTERNAL_WEBHOOK_SECRET` for the API and web app, before taking real payments. Live Paystack has not been tested.
- **A rejected webhook loses track of money.** If a charge exceeds the balance or hits a cancelled invoice, the relay logs it and stops. Someone must reconcile it by hand.
- **No refund or void path** for payments (DB-14).
- **Voided expenses delete their ledger rows** rather than adding a reversal. The audit log keeps the amount.
- **PDFs on Windows (BUG-47):** needs the GTK/Pango runtime installed, or a PDF service.

### Outstanding from Phase 2

- **Email delivery is untested.** Without `SENDGRID_API_KEY`, forgot password sends nothing; outside production the link is written to the API log. Staff invites show the link on screen.
- **Rate limiting:** `/auth/forgot-password` has none yet.
- **Portal screens** were tested through the API, not in a browser. Only the portal login and dashboard pages exist (Phase 5).

### Outstanding from Phase 1

- **New lint rules:** 35 existing errors from `eslint-config-next` 16 are set to warnings in `web/eslint.config.mjs` (`set-state-in-effect`, `purity`, `immutability`, `no-unescaped-entities`). Fix them, then restore them to errors.
- **CI** has not run. Docker builds were not tested with Next 16.
- **Authorization matrix limit:** it proves each route's rule is enforced, not that the rule is right. The `staff` over-privilege (SEC-07) still passes.

### Outstanding from Phase 0

- **Rotate the database password (SEC-11).** The password that was in `.env.example` was the live dev password and remains in git history (commit `2bd13e5`).
- **Set `INTERNAL_WEBHOOK_SECRET`** to the same value for the API and web app, or all webhook payments are refused. Only relevant once BUG-01 is fixed.
- **Docker:** set a real `SECRET_KEY` and `POSTGRES_PASSWORD` in root `.env`, or the stack will not start. This is intended.
- **Existing weak test accounts:** run `python scripts/create_test_users.py --reset-passwords`, if those accounts exist.
- **Python packages still flagged:** `python-multipart`, `python-dotenv`, `weasyprint`, `pytest`. These need version compatibility checks.

---

## Outstanding technical debt

### Missing features and unfinished work

- No self-service password reset for clients, and no user management UI (`/auth/users` routes are unused).
- **Tables with no API:** quotes, purchase orders, payroll, and bank writes. There is no document or receipt upload, and `supabase` is installed for storage but no upload route exists.
- **27 of 100 backend routes are unused by the web app**, including clock-in/out, shift editing, journal, bank accounts, suppliers and the attendance report.
- Missing actions: cancel invoice, refund or void payment, edit invoice, delete or archive clients.

### Structure

- `web/components/AuthGuard.tsx` contains pasted layout code. `web/hooks/index.ts` is a 1,069-line file combining all domains.
- Routers hold business logic and rely on function-level imports. Introduce a service layer and response schemas for every route, because ad hoc ORM returns caused SEC-01.
- Hook logic is repeated with inconsistent cancellation and pagination. Consider TanStack Query. There are 35 uses of `any`.
- `web/lib/types.ts` is hand-maintained and wrong about money. Generate it from OpenAPI.

### Repository and deployment

- **39 MB of installers are committed:** `api/python312-installer.exe` and `api/rustup-init.exe`. Removing them fully needs a history rewrite. `web/tsconfig.tsbuildinfo` is also tracked.
- Much important work is uncommitted, with only one commit in history.
- Server secrets were copied into `web/.env.local`.

### Observability

- No error tracking service.
- Failed webhooks are only logged. Add a durable event table so payments can be replayed.

### Dependencies and tooling

- `passlib` is unmaintained and logs a `bcrypt.__about__` error.
- Custom `from_orm` methods remain.
- README says Tailwind, but there is no Tailwind config. Remove the dependency or adopt it.

### UI and accessibility

- Only 8 uses of `aria-*`/`htmlFor` against 149 `<label>` and 171 form controls, so most labels are not linked to their inputs.
- Icon buttons lack names (hamburger, portal password toggle), and the mobile overlay is a clickable `div`.
- Styling is split between 2,000+ lines of global CSS and heavy inline styles. Portal layout uses a fixed two-column grid that will not fit phones.
- Native `alert`/`confirm` are used rather than designed dialogs and toasts.
- Dates use the browser's timezone and "today" uses server time, so dates can be off by one.

### Documentation


---

## Recommended fix order

Security comes before functional repairs. In particular, **SEC-03 must land before BUG-01.**

| Phase | Goal | Items |
|---|---|---|
| **0. Immediate** | Close open holes | **Code complete 2026-11-01.** Remaining: see [Outstanding from Phase 0](#outstanding-from-phase-0) |
| **1. Foundation** | Make it installable and testable | **Code complete 2026-11-01.** Remaining: see [Outstanding from Phase 1](#outstanding-from-phase-1) |
| **2. Core flows** | Restore what users do daily | **Code complete 2026-11-01.** Remaining: see [Outstanding from Phase 2](#outstanding-from-phase-2) |
| **3. Money integrity** | Trustworthy finances | **Code complete 2026-11-01.** Remaining: see [Outstanding from Phase 3](#outstanding-from-phase-3) |
| **4. Business rules and stock** | Prevent bad data | **Code complete 2026-11-01.** Remaining: see [Outstanding from Phase 4](#outstanding-from-phase-4) |
| **5. Portal and online payments** | Finish client features | **Code complete 2026-11-01.** Remaining: see [Outstanding from Phase 5](#outstanding-from-phase-5) |
| **6. Polish and scale** | Production quality | **Code complete 2026-11-01.** Remaining: see [Outstanding from Phase 6](#outstanding-from-phase-6) |

### Decisions needed

1. ~~**The 2 sent contracts.**~~ Decided 2026-11-01: both are test data and nothing was sent to a client.
2. ~~**Audit log design.**~~ Decided 2026-11-01: extended the existing UUID table.
3. ~~**System actor for webhooks.**~~ Decided 2026-11-01: nullable columns with `payments.source`.
4. ~~**Client portal invitations.**~~ Decided 2026-11-01: one-time expiring invite links.
5. ~~**Staff permissions.**~~ Decided 2026-11-01: pay is hidden from everyone without `staff:manage`, except on their own record.
6. **Git history:** whether to rewrite it to remove the installers and the `.env.example` password. This affects anyone with a clone.
