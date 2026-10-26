# Saji Till Business pulse

Business pulse is available to the signed-in **business owner** at `/pos/pulse`, from the Till sidebar and Overview's Money tools. It uses the owner's active branch. Managers or employees cannot gain access by a feature override, direct URL, or server-action request. Stock-count assignments use the existing counting/approval permissions separately.

## Included workflows

1. **Daily brief:** choose an East Africa Time calendar day; review recorded sales, tenders, expenses, refunds, missing historical costs and unmatched M-Pesa payments. Download a branded PDF brief. Each block links to records for further review.
2. **Money Match:** compare M-Pesa tenders with confirmed transactions by reference, consumed sale and exact amount; inspect unlinked merchant payments and stored cash-drawer differences. Sandbox and production/shortcode records are kept separate. This screen does not approve payments or claim access to an independently verified bank balance.
3. **Explainable review alerts:** reversals, discounts meeting an owner-set percentage, cash variances and stock adjustment/wastage events. These are review prompts, not accusations, staff scores or machine-learning fraud findings.
4. **Buy next:** net unit sales over a 30-day window, current available inventory, supplier lead days and desired cover produce editable restocking suggestions. Variant quantities are separate. Choose a supplier, review costs/quantities, then create a DRAFT purchase order. Approval and goods receiving remain in Buying. A request UUID prevents retries from creating duplicate drafts.
5. **Phone stock-taking:** filter the catalogue by names/SKUs when starting a count, assign a draft count to a branch employee, scan product/variant barcodes with the existing camera scanner, enter physical quantities and submit for approval. Assignment does not grant access. Ordinary counters cannot retrieve or edit another employee's assigned count by guessing IDs. Batch/serial tracked stock and services are excluded from standard count creation and guarded during approval. Existing specialised stock-ledger tools handle those products.
6. **Customer comeback tools:** identify customers past the configured return interval, record explicit WhatsApp marketing permission or withdrawal with evidence, and prepare English/Swahili message drafts. The user reviews the draft in WhatsApp before sending. No automated messages, bulk marketing or notification delivery are activated. Loyalty membership or giving a receipt number is not treated as marketing consent. Consent history remains in the audit log.
7. **Connected business website:** existing owner-selected products continue to come from the active catalogue. Public cards show qualitative availability only, not private stock quantities. Product enquiries and appointment requests carry item context into the business's published WhatsApp or email contact. These requests are enquiries, not confirmed bookings, orders or payments. Publishing, business contacts and subdomain deployment/DNS remain prerequisites.
8. **Service cost cards:** owners define materials and quantities in catalogue units and a planned commission percentage. Cards calculate current known material costs, service price before configured VAT, planned commission and contribution before overheads. Missing costs suppress contribution. These cards are planning estimates: they do not deduct materials, alter receipts, calculate payroll or report net profit. Actual, reversible material consumption is now available separately in the Operations desk. Earned salon commissions stay in the existing Salon workspace.
9. **English/Swahili report assistant:** supported questions about sales, expenses, payments, stock and profit receive deterministic answers from the selected branch/date and links to source workspaces. It performs no mutations and sends no customer/business data to an AI provider. This is a grounded report assistant, not unrestricted generative AI.

## Data boundaries and limitations

- The selected date controls financial records. Current inventory, catalogue costs, customer balances and consent are live rather than historical snapshots.
- Sales are reported before refunds. Refunds use their issue date. Recorded tenders exclude credit and gift-card redemption, may include deposits, and are not net profit.
- Expense recording and cash-drawer withdrawal are distinct records. Do not count an expense as proof that cash physically left a drawer.
- M-Pesa comparisons cover loaded confirmations for that day. A sale paid on another day can need manual review. Safaricom callback/merchant setup is still required; this feature does not bypass Daraja access or recover every absent callback.
- Restocking uses a simple sales-rate estimate. Open purchase orders are displayed but not deducted; review incoming deliveries before ordering. New products, stockouts, seasonal demand and variant reservations need human judgment. Non-variant reserved inventory is deducted.
- A count posts only its frozen variance, preserving stock movements since counting started. Approval claims the submitted document in the transaction so repeated approval cannot duplicate adjustments. Missing projections fail the transaction.
- Workspace limits: 10,000 daily sales, 5,000 daily merchant transactions, 2,000 catalogue products, 2,000 customers and 1,000 closed shifts. Exceeding these shows an explicit partial-data warning. The Money Match list shows up to 200 tenders; alerts show up to 100, including at most 50 stock events. Customer search shows up to 100 loaded matches.
- Planning settings support 200 service recipes (30 materials each), 2,000 consent records and 100 purchase-draft lines. Version checks prevent stale planning forms overwriting concurrent changes. Audit writes for planning settings and purchase drafts happen in their database transactions.

## Installation and verification

Prisma schema: `PosBusinessPulse`, plus `assignedStaffId` and `assignedStaffName` on `PosStockCount`.

Migration: `backend/prisma/migrations/20261024010000_pos_business_pulse/migration.sql`.

```text
npx prisma generate
node backend/scripts/install-pos-pulse.cjs
node backend/scripts/install-pos-pulse.cjs --apply
```

The installer checks first, installs only this additive schema in a transaction and refuses a partial installation. It deliberately does not replay unrelated baseline migrations or resolve migration-history drift. Normal deployments with reconciled migration history can apply the checked-in migration through their existing deployment process. Restart a running development server after Prisma generation when needed.

On 24 October 2026 the targeted installer applied this schema to the configured database. A read-only invocation of the actual Business pulse action against the existing Salon demo branch returned planning storage available, three catalogue services and two staff records. Authentication was injected for that diagnostic; this is not evidence of a completed browser login or live M-Pesa payment.

Focused tests: `tests/pos-pulse.test.cjs` and `tests/pos-stocktake-growth.test.cjs` cover authorization, tenant scopes, EAT dates, calculations, consent, stale writes, draft retries, contextual enquiries, assigned-count access and stock approval safety. Browser fixtures verified the actual workspace at 320/390/1280px and exercised bilingual answers, consent, follow-up review, service quantities and reviewed purchase drafts without sending messages or writing sales.

This change does not deploy or publish any business website, activate merchant integrations, send customer messages, or change existing sales records.

## Completed validation

- Prisma generation and schema validation passed.
- Targeted ESLint and repository TypeScript checks passed.
- Full automated suite: 148 passed, one optional PostgreSQL integration test skipped.
- Production webpack build passed, including TypeScript and generation of 273 static pages. Existing metadataBase warnings remain unrelated to these workflows.
- Actual Business pulse component browser checks passed at 320/390/1280px, including English/Swahili answers, purchase-draft payloads, consent gating, follow-up review and service material quantities.
- Actual stock-count component browser checks passed at the same widths, including employee assignment, scanned-barcode filtering, quantity entry and clearing filters. Camera decoding itself uses the existing scanner and was not tested on physical phone cameras in this update.
- Actual database reads returned Business pulse planning available and stock-count assignment available for the existing demo branch, with two assignable staff. No sales, purchases or marketing messages were created by these checks.
- No deployment or business-website publication was performed.

The next-stage workflows (invoice capture, actual materials, public booking/waitlists, expiry rescue, counter recovery and accountant ZIP export) are documented in `docs/pos-operations.md`.
