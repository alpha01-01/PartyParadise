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
- Main desktop modules exist: bookings, clients, contracts, invoices, expenses, reports, inventory, equipment, staff, and shop sales.
- Web TypeScript currently passes.
- Database setup and Alembic migrations are working.
- Expense editing/deletion and finance reporting alignment have been improved.
- Inventory item creation, stock transactions, and bulk import are now in place.
- Equipment editing and maintenance visibility are now in place.
- Staff profile, shift, leave, and full-profile navigation flows are in much better shape.
- Retail shop sales can now be recorded against inventory stock from the dashboard.

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


### Booking workflow browser smoke test checklist

- [pass] Create a booking (verify it appears immediately)
- [pass] Open booking detail (check services, staff, equipment, notes, invoice, contract)
- [pass] Change booking status (ensure it persists after refresh)
- [pass] Add/edit a note (confirm it saves, displays, and can be edited)
- [pass] Assign staff/equipment (verify assignments persist after refresh)
- [pass] Refresh and confirm all changes persist

> Mark each as Pass/Fail/Partial and note any issues found. After each fix, re-run tests to confirm.

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

### Expense and reporting workflow status (2026-03-29)

Status: Close to Pass

What was verified in code:

- Expense create, list, edit, and delete behavior is now wired through the backend and dashboard.
- Voided expenses are excluded from normal reporting totals.
- Booking profitability reporting now counts confirmed expenses only.
- Finance report chart rendering was updated to avoid overlap on tighter desktop widths.

What was fixed during this pass:

- Expense edits now keep linked journal data in sync.
- Expense deletion now removes the accounting impact from reports.
- Booking link handling in the expense form was corrected.
- P&L chart layout was made responsive enough for normal desktop use.

Remaining items before this workflow is a full Pass:

- Browser smoke test for create -> edit -> delete -> refresh -> report verification.
- Visual confirmation that category filtering and totals stay correct after repeated edits.

### 6. Warehouse lifecycle

- View inventory
- Adjust stock
- View equipment
- Add equipment
- Log maintenance
- Import inventory items in bulk
- Record retail shop sale from inventory stock

Exit criteria:

- Stock counts update correctly
- Equipment status remains accurate
- Maintenance actions do not silently fail
- Bulk import reports row failures clearly
- Shop sale deducts stock and records payment cleanly

### Warehouse workflow status (2026-03-29)

Status: Close to Pass

What was verified in code:

- Inventory item creation, editing, stock movement, and transaction history are implemented.
- Equipment listing, creation, editing, and maintenance history are implemented.
- Bulk inventory import now supports CSV and XLSX with row-level error reporting.
- Shop sales now create a retail sale record, deduct stock, and record payment-backed sale data.

What was fixed during this pass:

- Inventory add and transaction workflows were separated and clarified in the UI.
- Stock direction is now enforced consistently by transaction type.
- Equipment can now be edited after creation.
- Import flow and shop sale flow were added to cover onboarding and retail counter use.

Remaining items before this workflow is a full Pass:

- Browser smoke test for add item -> adjust stock -> refresh -> import file -> verify imported rows.
- Browser smoke test for equipment create -> edit -> maintenance log -> refresh.
- Browser smoke test for shop checkout -> verify stock deduction -> verify recent sale visibility.

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

### Staff operations workflow status (2026-03-29)

Status: Close to Pass

What was verified in code:

- Staff create, list, profile detail, edit, shift assignment, leave request, and leave review flows exist.
- A full staff profile route now exists instead of a broken link.
- Staff list names now resolve correctly without requiring profile-page navigation first.
- Weekly shift refresh behavior is now better aligned with newly created shifts.

What was fixed during this pass:

- Staff profile errors around missing full profile routing were removed.
- Staff page UI was reworked to support edit, leave, and shift flows more cleanly.
- Backend responses now hydrate related user data reliably for list/detail rendering.

Remaining items before this workflow is a full Pass:

- Browser smoke test for add staff -> edit -> refresh -> full profile.
- Browser smoke test for assign shift -> verify weekly schedule immediately.
- API/browser verification for clock in / clock out behavior.

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
- /shop

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
- Portal invite flow is not yet acting reliably from the desktop staff side
- Portal login route conflict has been fixed and the portal now loads again for testing
- A basic portal dashboard is now in place for client-side testing
- Portal pages behind login are not yet complete enough for client rollout

Decision:

- Internal desktop rollout: possible after Priority 1 and Priority 2 pass
- Client-facing rollout: blocked until portal pages are fully implemented and tested

Portal follow-up before client rollout:

- Complete portal invoice detail and payment visibility workflows
- Complete portal contract visibility and signing-state workflows
- Verify notifications, downloads, and client session stability end to end

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

### Stage 5: Mobile app track

- Define whether mobile is staff-only first or includes client portal access
- Reuse the now-verified backend workflows and permission model
- Start with the highest-frequency workflows: bookings, schedule, staff, inventory, shop, and client portal essentials
- Treat mobile as a parallel delivery track, not a blocker for internal desktop rollout

---

## Immediate next pass

Run this first before any broader rollout decision:

1. Client workflow verification
2. Booking workflow verification
3. Invoice and payment verification
4. Contract verification
5. Expense and report verification
6. Inventory, equipment, staff, and shop verification
7. Refresh / logout / direct URL navigation verification

If any of those produce blockers, fix them before moving into beta.

---

## Execution sheet

Use this section during the next verification round. Mark each item as `Pass`, `Partial`, or `Fail` and note blockers immediately after each run.

### 1. Client workflow

- [x] Create client
- [x] View client detail
- [x] Edit client
- [x] Log interaction
- [x] Invite client to portal
- Result: Pass
- Notes: Verified manually during rollout pass. Client create, detail, edit, interaction logging, portal invite, navigation away/back, and refresh persistence all behaved correctly on March 30, 2026.

### 2. Booking workflow

- [x] Create booking
- [x] View booking detail
- [x] Change booking status
- [x] Add booking note
- [x] Assign staff
- [x] Assign equipment
- [x] Refresh and confirm all changes persist
- Result: Pass
- Notes: Verified manually. Booking detail actions now support staff assignment, equipment allocation, backward status changes, cancellation, and direct invoice generation without auth bounce or silent failure.

### 3. Invoice and payment workflow

- [x] Generate invoice from booking
- [x] Open invoice detail
- [x] Download invoice PDF
- [x] Record payment
- [x] Confirm invoice balance updates correctly
- [x] Confirm reports reflect the payment
- Result: Pass
- Notes: Verified manually. Payment recording is available after the invoice is sent to the client. Invoice generation, detail, PDF access, payment recording, and balance updates all worked during the rollout pass.

### 4. Contract workflow

- [x] Generate contract from booking
- [x] Open contract detail
- [x] Send contract
- [x] Download contract PDF
- [x] Complete signing flow
- [x] Confirm final signed record is visible to staff
- Result: Pass
- Notes: Verified manually during rollout pass. Contract generation, detail rendering, send/download flow, and linked booking visibility all behaved correctly.

### 5. Expense and reporting workflow

- [x] Create expense
- [x] Edit expense
- [x] Delete or void expense
- [x] Refresh and confirm expense state persists
- [x] Confirm expense appears correctly in reports
- [x] Confirm P&L updates correctly
- Result: Pass
- Notes: Verified manually. Expense lifecycle changes persist correctly and finance reports reflect expense create, edit, and void actions as expected.

### 6. Inventory, equipment, staff, and shop workflow

- [x] Add inventory item
- [x] Edit inventory item
- [x] Record stock movement
- [x] Import inventory items from file
- [x] Add equipment
- [x] Edit equipment
- [x] Log equipment maintenance
- [x] Add staff member
- [x] Edit staff profile
- [x] Assign shift
- [x] Approve or decline leave request
- [x] Record a shop sale
- [x] Confirm stock deduction after shop sale
- Result: Pass
- Notes: Verified manually. Inventory, equipment, staff, import, and shop workflows are functioning. Follow-up improvements noted: add a shop sale detail view for purchased items and add a shortcut to convert equipment service or maintenance logs into expenses.

### 7. Navigation and session stability

- [x] Login and open dashboard
- [x] Refresh each protected page
- [x] Visit protected pages by direct URL
- [x] Switch quickly between major modules
- [x] Logout and re-login
- [x] Confirm no unexpected bounce while session is valid
- Result: Pass
- Notes: Verified manually. Protected dashboard pages remain stable after login, refresh, direct URL visits, rapid module switching, logout, and re-login.

### 8. Permissions audit

- [x] Verify admin access
- [x] Verify manager access
- [ ] Verify staff access
- [ ] Verify portal client isolation
- [x] Confirm no unexpected 403 for intended actions
- [x] Confirm no overexposed admin-only actions
- Result: Partial
- Notes: Admin and manager testing can be treated as pass for now. Staff correctly cannot use reports, but the reports page still surfaces an `unknown error` message while rendering, which should be cleaned up. Portal client remains partial because the portal login page now loads again, but portal invite is not yet reliably producing a working account flow for full client-path verification.

---

## Decision rule

PartyParadise is desktop beta-ready when:

- All Priority 1 workflows are `Pass` or clearly acceptable `Partial`
- No page bounce or auth instability remains
- No blocking permission issue remains
- Finance and contracts workflows are dependable
- Internal rollout scope is explicitly separated from client portal and mobile work

PartyParadise is desktop production-ready when:

- Priority 1 through Priority 4 are complete
- Internal beta has already surfaced and resolved real workflow issues
- Portal/client rollout status is clearly separated from internal rollout status

---

## Invoice and Expense Edit/Delete Policy

- **Invoices**
  - Only invoices in "draft" or "cancelled" status and with no payments can be deleted.
  - Invoices in any other status (sent, partial, paid, overdue) cannot be deleted, but can be edited.
  - Payments recorded against an invoice prevent deletion.
- **Expenses**
  - Expenses are soft-deleted (status set to "voided"; not removed from the database).
  - All expense fields can be edited at any time.
  - Voided expenses are excluded from normal reporting and totals.

## Current rollout read on 2026-04-03

- Internal desktop workflow verification is now much stronger: client, booking, invoice/payment, contract, expense/reporting, and operations workflows have all passed the current manual rollout run.
- Internal desktop beta readiness is close, but not signed off yet.
- The main blockers before internal desktop beta are now permissions audit cleanup, deployment hardening, and a few smaller UX/action issues.
- Navigation and session stability has now passed the current manual verification run.
- Client-facing rollout remains blocked by incomplete portal work even though portal access is loading again for testing.
- Mobile app work should begin as a parallel track after internal desktop beta scope is frozen, not as a prerequisite for the desktop rollout decision.

## Recommended immediate next work

- Clean up the staff reports permission UX so blocked access does not surface as a generic unknown error.
- Fix the portal invite action so portal accounts can be exercised end to end.
- Complete the remaining permissions audit items for staff and portal client roles.
- Add a shop sale detail view so staff can inspect what was bought in each sale from the frontend.
- Add an equipment service-to-expense shortcut so maintenance costs flow into accounting more naturally.
- Define the first mobile app scope: staff operations only, or staff plus client portal essentials.

---

