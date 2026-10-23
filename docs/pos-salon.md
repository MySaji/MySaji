# Salon, barber & spa workspace

The SALON profile already existed, with service/retail selling, variants and open prices. This change adds a dedicated `/pos/salon` workspace; it does not create another disconnected POS.

## Using the workspace

1. Owner selects **Salon, barber & spa** in Till Settings. The Salon navigation entry appears for staff with `salon.view`. Existing owners receive all permission keys. Existing employees with explicit feature selections must be granted the new Salon features by the owner in Team.
2. Add services in Catalogue with the Service option. Keep physical retail products as products. Add the employees through Team using their own accounts.
3. In **Salon > Service duration & commission settings**, set duration and commission percentage for each service. Defaults are 60 minutes and zero commission. New appointments snapshot these rules and the quoted catalogue price; later rule changes do not rewrite old work.
4. Book a customer or use the current-time walk-in shortcut. Assign a branch employee and one service. Stylist schedule conflicts are checked across branches with transaction locks. For multi-service visits, create separate consecutive appointments, one per service. Chairs/rooms are not separately scheduled in this version.
5. Reception checks the client in; the assigned stylist starts and completes the service. Cancellation and no-show need reasons. Future appointments cannot be marked no-show. Only unstarted bookings can be rescheduled, with conflict checks. Completed services cannot be edited or silently deleted.
6. Complete the existing Register checkout, with the actual service and the customer's name or phone. Shift and payment checks remain in that flow. Return to the completed appointment and match the exact receipt number. This does not create or re-charge a sale. It only credits an existing service receipt line.
7. Review the period and employee filters, completed services, matched receipts and commission estimates. Clicking an employee filters the diary. Audit events also appear in the owner's existing audit log.

## Permissions

Owner-selected features are enforced in backend actions, not just hidden in the UI:

| Feature | Capability |
| --- | --- |
| `salon.view` | Open the workspace; own assigned work by default |
| `salon.book` | Reception access to branch bookings, check-in, cancellation and rescheduling |
| `salon.service` | Start/complete assigned services; reception with this feature can manage service progress |
| `salon.manage` | Configure service durations and commission rates |
| `salon.commission` | Read branch commission estimates and employee history |

A stylist-only seat can use `salon.view` and `salon.service` without permission to sell, view stock, view other employees' bookings or see commission amounts. Staff with Salon-only access land in Salon after login. Cashier/manager role defaults include reception/service features, but explicit feature lists remain authoritative. Commission configuration/reporting are not silently granted to cashiers. Receipt matching additionally requires sales or commission access.

## Money and accountability

- Completion is operational, not payment. Only a fully paid COMPLETED sale with zero balance can initially be matched.
- Receipt and service must belong to the current branch; customer name or normalized phone must match. Receipts predating check-in are rejected. The matching service line must have quantity one, no return and no previous appointment allocation. A unique database index prevents duplicate credits. Unmatched receipt details remain in the existing sales system.
- Net commission base is the service line's proportional share of `sale.total - sale.tax`, using the recorded subtotal. This allocates sale discounts and excludes VAT for both inclusive/exclusive pricing. The appointment's snapshotted commission percentage applies to that base.
- Current estimates reduce for recorded returned quantities. VOIDED/REFUNDED sales contribute zero. Partial returns reduce the matched service estimate; unrelated retail returns do not erase another service line's commission. Original receipt links and appointment history remain intact. There are no commission payout or payroll records yet.
- Commission estimates are NOT profit, payroll, attendance or proof of external payment. Material consumption, product costs and salon overheads are not included in this calculation. The dashboard does not label revenue minus commissions as profit.
- Booking retries use a stable UUID; stale versions and invalid transitions are rejected. Appointment writes use branch locks; stylist availability uses a cross-branch stylist lock. Actions record actor identity in existing audit events. No customer emails, messages or notifications are sent by this change.
- Filters use inclusive EAT calendar days, up to 93 days per request. A 500-record display cap is explicit; narrow the period for complete summaries. Disabled employee history remains visible, but inactive staff cannot receive new bookings.

## Existing shared features and remaining scope

The salon continues to use the existing Register, service/retail Catalogue, stock/purchasing, customers/loyalty, shifts, payment inbox, expense, report, receipt, team and audit modules subject to permissions. This change does not independently certify their external integrations. Daraja credentials/webhooks and eTIMS configuration/certification requirements still apply; no claim of KRA approval or production payment readiness is made.

Not implemented by this change: payroll/salary advances, commission disbursement ledgers, automatic per-service ingredient consumption and material-cost margins, chair/room scheduling, multi-service appointment bundles, online customer bookings, reminder delivery, consent/birthday preferences, packages/memberships or attendance clocks. These are additional modules, not working buttons or invented performance metrics in this workspace. Avoid presenting the entire quoted long-term roadmap as delivered.

## Database and release

Migration: `backend/prisma/migrations/20261023010000_pos_salon/migration.sql`. Adds service rules and appointments with branch/product/staff/receipt-line foreign keys, unique receipt-line allocation, schedule indexes and value/status checks. It was applied to the configured database when the user requested an isolated Salon test account. The test business has three demo services and a demo stylist, with no sales or payments recorded.

The existing database has unreconciled historical migration records. Do not blindly run `prisma migrate deploy` or reset it. A reviewable salon-only installer is provided: `node backend/scripts/install-pos-salon.cjs` is read-only; `--apply` is the explicit installation mode after release approval. It runs only this migration in a transaction and does not modify existing business rows. Reconcile Prisma migration history separately. Retain salon history on rollback; do not drop tables after owners begin using them.

Generate the Prisma client during deployment and test against a migrated disposable database. An existing Windows process held the Prisma engine DLL during local regeneration; new model types were generated and validated, and the local production build/typecheck passed using the existing same-version engine. Stop/restart the relevant local dev server before regenerating if the DLL remains locked; this change did not kill the user's running processes.

Production deployment remains subject to the existing Vercel access/plan blocker documented in `pos-business-websites.md`. No salon data or live payment transaction was created as part of implementation.

## Verification

`tests/pos-salon.test.cjs` exercises EAT date validation, commission/reversal maths, profile/permission gates, branch ownership, snapshotted prices/rates, overlap rejection, booking idempotence, stylist-only reads, redacted financial data, version/status checks, cancellation reasons, rescheduling and receipt matching/customer/duplicate-credit checks. Browser fixtures run the real React components with sample data at 320/390/1280px and exercise booking, walk-ins, check-in/start/complete, receipt matching and service rules. Fixtures mock persistence and do not establish a signed-in production end-to-end result.

Validation result: full unit suite 120 tests, 119 passed and one optional PostgreSQL integration test skipped; targeted ESLint has no errors or warnings; Prisma schema validation and the salon production build passed. Browser fixtures passed at all three widths. The salon migration is now installed for the user-requested test account; a real signed-in appointment/checkout/receipt-match acceptance test remains a release check.

## Development loading fix (23 October 2026)

The user reported a generic salon-load error after the new models were installed. A fresh-process invocation of the actual salon loading action against the test business successfully returned three services, two staff and no appointments. The long-running local Next dev server predated schema generation and retained its old Prisma singleton/engine.

The verified MySaji server on port 3000 was stopped, `prisma generate` completed successfully with the engine DLL released, and the server restarted on the same port. The development singleton now carries a schema stamp and is replaced when generated model metadata changes; production does not reuse this development cache. Regression tests cover unchanged-schema reuse and replacement of old/unstamped clients. The salon loader now logs a diagnostic code only (no customer records, query payloads or connection strings) instead of suggesting missing migrations for every failure.

Post-restart checks: local login/salon routes return HTTP 200; the real read-only Salon action loads the test business successfully. Full unit suite: 121 passed, one optional database test skipped. No user passwords, sessions, appointment records or financial records were changed by this fix. Browser refresh is needed to pick up the restarted server; an authenticated browser session was not available to the agent for direct UI confirmation.
