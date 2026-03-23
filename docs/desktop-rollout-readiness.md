# Desktop Rollout Readiness

This document is the working checklist for deciding when PartyParadise is ready for rollout on desktop and laptop for the internal operations team.

Current recommendation: not yet production-ready for full rollout.
Recommended stage: controlled internal beta after the checks below are completed.

---

## Release gates

A desktop rollout is only approved when all of the following are true:

- Core workflows pass end-to-end with real data.
- No protected dashboard page bounces users unexpectedly after login or refresh.
- Staff can complete daily work without placeholder blockers.
- Finance workflows work from booking -> invoice -> payment -> report.
- Contracts can be generated, reviewed, sent, downloaded, and signed.
- Permissions are correct for admin, manager, and staff roles.
- Error handling is understandable and recoverable.
- Production environment setup, backups, and monitoring are documented.

---

## Current readiness

### Ready or close

- Authentication, session restore, and logout are functioning in development.
- Dashboard shell and main operational pages have been upgraded visually.
- Main desktop modules exist: bookings, clients, contracts, invoices, expenses, reports, inventory, equipment, and staff.
- Web TypeScript currently passes.
- Database setup and Alembic migrations are working.

### Not rollout-ready yet

- Client portal experience is not complete on the web side.
- End-to-end business workflows have not yet been verified in one formal pass.
- Permissions need a dedicated audit and signoff.
- Several pages still need production-level action handling, confirmations, and recovery states.
- Deployment hardening is still incomplete.

---

## Priority 1: Core workflow verification

These are the workflows the business needs in order to operate day to day.
Each one should be marked as `Pass`, `Partial`, or `Fail` during testing.

### 1. Client lifecycle

- Create client
- Edit client
- View client detail
- Log interaction
- Invite client to portal

Exit criteria:

- Client record saves reliably
- Edit page loads and updates correctly
- Notes and contact details persist
- No unexpected redirect or bounce

### Client workflow status (2026-03-22)

Status: Partial

What was verified in code:

- Client create page exists and submits to the backend.
- Client edit page exists and updates the record.
- Client detail page now has the backend data it needs for addresses, bookings, invoices, and portal status.
- Client search now supports name, email, phone, WhatsApp, and source instead of name-only.

What was fixed during this pass:

- Reworked the web clients list page to reduce bounce-risk and keep the selection/detail flow stable.
- Rebuilt the backend client response so detail views receive bookings, invoices, addresses, and portal account data.
- Verified the updated backend file compiles and the web app still passes TypeScript.

Remaining items before this workflow is a full Pass:

- Browser smoke test for create -> detail -> edit -> refresh -> invite portal.
- Verify interaction logging visually end to end.
- Verify portal invite success and resulting account state on the client record.
### 2. Booking lifecycle

- Create booking
- View booking detail
- Update booking status
- Add booking notes
- Assign staff
- Assign equipment
- View booking in calendar/list

Exit criteria:

- Booking appears immediately after creation
- Status changes persist
- Staff and equipment links remain visible after refresh
- Calendar and list views match the same booking data

### Booking workflow status (2026-03-22)

Status: Partial

What was verified in code:

- Booking list, calendar, creation, detail, status update, note, staff, and equipment endpoints all exist.
- The bookings page now sends search terms to the backend instead of filtering only in the browser state.
- Booking detail responses now include services, staff assignments, equipment allocations, notes, latest invoice summary, and latest contract summary.
- The bookings drawer now routes invoice generation to the web invoice flow instead of an API-style path.

What was fixed during this pass:

- Added backend search support for booking reference, client fields, event type, and venue.
- Expanded the backend booking payload so the detail page has the data it was already trying to render.
- Verified the updated backend file compiles and the web app still passes TypeScript.

Remaining items before this workflow is a full Pass:

- Browser smoke test for create -> detail -> status change -> note -> refresh.
- Verify staff assignment and equipment allocation visually end to end.
- Verify generated invoice and contract links feel correct from both the list drawer and full booking detail view.

### 3. Invoice lifecycle

- Generate invoice from booking
- View invoice detail
- Download invoice PDF
- Record payment
- Delete draft or cancelled invoice when needed

Exit criteria:

- Invoice totals are correct
- Payment updates outstanding balance correctly
- PDF downloads successfully
- Reports reflect the invoice and payment correctly

### 4. Contract lifecycle

- Generate contract from booking
- View contract detail
- Send contract
- Download contract PDF
- Complete signing flow

Exit criteria:

- Contract body renders correctly
- Sending produces the expected next state
- Signed contract updates status correctly
- Staff can access the final signed record

### 5. Expense and reporting lifecycle

- Create expense
- View and filter expenses
- Confirm expense appears in reports
- Confirm P&L reflects the change

Exit criteria:

- Expenses save and reappear after refresh
- Category filtering works
- P&L totals update correctly

### 6. Warehouse lifecycle

- View inventory
- Adjust stock
- View equipment
- Add equipment
- Log maintenance

Exit criteria:

- Stock counts update correctly
- Equipment status remains accurate
- Maintenance actions do not silently fail

### 7. Staff operations lifecycle

- Add staff member
- View staff detail
- Assign shift
- View weekly schedule
- Approve or decline leave request
- Clock in / clock out via API verification

Exit criteria:

- Schedule data is consistent
- Shift assignment is visible immediately
- Attendance endpoints behave correctly

---

## Priority 2: Stability and permissions

### Navigation and session stability

Test all protected pages after:

- first login
- browser refresh
- direct URL visit
- logout and re-login
- switching between pages quickly

Pages to verify:

- /
- /bookings
- /clients
- /contracts
- /invoices
- /expenses
- /reports
- /inventory
- /equipment
- /staff

Exit criteria:

- No route should bounce unexpectedly to dashboard or login while the session is valid.
- Logout should redirect immediately and consistently.

### Permissions audit

Verify access for:

- admin
- manager
- staff
- portal client

Check:

- dashboard page access
- page actions
- export buttons
- payment actions
- contract actions
- portal endpoints

Exit criteria:

- No unexpected 403 for intended roles
- No overexposed admin action for lower roles

---

## Priority 3: Production quality gaps

These are not always blockers for internal beta, but they are blockers for a broader rollout.

### UX and feedback

- Confirm all critical actions show success or failure clearly
- Add confirmations where destructive actions exist
- Remove any remaining placeholder copy that looks unfinished
- Confirm empty states are informative and actionable

### Data quality and realism

- Remove any demo assumptions that conflict with real records
- Ensure summary cards and detail panels reflect real backend data
- Verify export outputs are meaningful and clean

### Error handling

- Replace generic unknown-error states where possible
- Confirm failed API calls do not leave pages stuck or misleading
- Confirm cancelled requests do not surface as user-facing errors

---

## Priority 4: Deployment and operations

These items must be complete before real production rollout.

### Environment and secrets

- Production .env values verified
- Database credentials rotated and documented securely
- SECRET_KEY replaced with production-grade secret
- SendGrid, Supabase, and Paystack credentials verified

### Database and backups

- Production migration runbook documented
- Backup and restore procedure tested
- Admin bootstrap process documented

### Monitoring and support

- Backend logging strategy confirmed
- Frontend error capture strategy confirmed
- Payment webhook monitoring confirmed
- Email delivery verification confirmed

### Launch operations

- Browser support list defined
- Staff onboarding guide prepared
- Admin operating guide prepared
- Incident rollback plan documented

---

## Portal status

Desktop internal rollout can proceed before the client portal is complete, but only if the rollout is clearly positioned as an internal staff/admin rollout.

Current portal status:

- Backend portal routes exist
- Portal login exists on web
- Portal pages behind login are not yet complete enough for client rollout

Decision:

- Internal desktop rollout: possible after Priority 1 and Priority 2 pass
- Client-facing rollout: blocked until portal pages are fully implemented and tested

---

## Recommended rollout sequence

### Stage 1: Internal verification

- Run the full Priority 1 workflow pass
- Fix all `Fail` items
- Re-test all `Partial` items

### Stage 2: Controlled internal beta

- Admin and a small internal team use the app for real work
- Log friction points, missing actions, and reporting mismatches
- Fix operational blockers quickly

### Stage 3: Internal production rollout

- Complete permissions audit
- Complete deployment hardening
- Finalize onboarding documentation

### Stage 4: Client portal rollout

- Finish portal UI
- Verify invoice, contract, and notification flows
- Then begin client-facing release

---

## Immediate next pass

Run this first before any broader rollout decision:

1. Client workflow verification
2. Booking workflow verification
3. Invoice and payment verification
4. Contract verification
5. Expense and report verification
6. Inventory, equipment, and staff verification
7. Refresh / logout / direct URL navigation verification

If any of those produce blockers, fix them before moving into beta.

---

## Decision rule

PartyParadise is desktop beta-ready when:

- All Priority 1 workflows are `Pass` or clearly acceptable `Partial`
- No page bounce or auth instability remains
- No blocking permission issue remains
- Finance and contracts workflows are dependable

PartyParadise is desktop production-ready when:

- Priority 1 through Priority 4 are complete
- Internal beta has already surfaced and resolved real workflow issues
- Portal/client rollout status is clearly separated from internal rollout status

