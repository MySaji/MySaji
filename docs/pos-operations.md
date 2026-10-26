# Saji Till operations workflows

## Where to find them

Open **Saji Till > Operations** (`/pos/operations`). The sidebar and Overview link to the desk. Features follow the signed-in person's permissions and the owner's active branch; naming a different branch in an action is rejected. Changing branches remounts the forms so an old branch's drafts cannot silently become new-branch edits.

Customers use `/book/<published-business-subdomain>` to view the diary and `/customer/bookings` to manage their own salon appointments and waitlist. Customer navigation includes **Salon appointments**. A published business website shows a booking link only when its selected catalogue includes services from a booking-enabled branch.

## 1. Supplier invoice capture

- Choose a JPEG/PNG/WebP photo, take a camera photo, or select a PDF (maximum 3 MiB). Magic bytes and canonical base64 are checked; remote URLs are not fetched.
- AI extraction is optional. It sends that document to the configured Gemini model and validates a bounded JSON result. Missing quantities/costs and low-confidence lines remain visible for review. Manual review remains available if extraction is unavailable.
- Original document bytes remain in protected database storage, not public catalogue image URLs. Opening an original requires purchase-view access.
- Match the supplier and each product/variant; verify KES currency, pack-to-stock-unit conversion, tax treatment, quantities, unit costs and batches/expiry. No exchange rate or tax treatment is inferred. Foreign-currency captures must use the separate manual purchasing workflow after an appropriate review.
- **Save review draft for later** persists unfinished mappings without touching stock. Version checks refuse stale edits.
- Final receiving requires purchase-create, purchase-approve and stock-receive access. Human confirmation is explicit. An approved review freezes before receiving, so retries use the same approved lines even if a client supplies different values later.
- A SHA-256 document hash prevents duplicate file drafts within a branch. Existing supplier references are checked before receiving. The draft UUID is the goods-receipt idempotency key; replay returns the original receipt without another stock movement or audit entry.
- Received quantities allow up to three decimals; unit costs allow two. Reviewed invoice stock cost is capped at KSh 1 billion. Serial-numbered items use the existing serial inventory workflow.
- The result is an invoice document linked to a goods receipt. It does not automatically place a purchase order, create a payable balance, pay a supplier or change expense records.

Permissions: view `purchase.view`; capture/save mapping `purchase.create`; final receipt additionally `purchase.approve` and `stock.receive`. The owner can delegate these separately in Team.

## 2. Actual service-material usage

Choose an in-progress/completed appointment, eligible job or paid service receipt line. Select the service and enter actual materials in catalogue units. An existing Business pulse recipe can prefill the quantities; the operator still reviews actual use and selects variants/batches.

Posting appends `SERVICE_USAGE` stock movements, stores immutable quantity/unit-cost snapshots and journals the work context. Insufficient stock, wrong-branch products, invalid variants, expired batches or an invalid later line roll back the entire transaction. Serial-numbered parts remain in the existing serial sale/job workflow. One active material record per work context prevents accidental double consumption; request UUIDs make retries idempotent.

Corrections use a reasoned `SERVICE_USAGE_REVERSAL`, restoring the recorded materials once. A refund does not automatically imply that physically consumed shampoo/chemicals came back. Reversed batch stock is reactivated for inventory review, including expiry checks. Costs remain snapshots rather than today's prices being applied to old work.

Posting/reversal requires `stock.adjust`; historical material costs are omitted from workspace payloads without `report.margin`. Materials do not automatically calculate salary, payroll, net profit or customer charges.

## 3. Real online salon booking

The owner configures a Salon branch's opening days/hours, notice, public staff, cancellation policy and optional deposit in Operations. They must also publish the intended services through Website. Booking is opt-in and disabled by default; this update does not publish a website or expose staff automatically.

Public readers see only published active services and selected active staff names. Slots use EAT, service duration, opening hours and minimum notice, within a 90-day window. Busy times include live deposit holds. A signed-in active customer must choose a contact number and accept the policy before booking. Phone input accepts 07..., 01... and +254... formats. The cancellation notice is snapshotted on the appointment.

Online bookings, reception bookings and rescheduling share branch/stylist advisory locks. Slots are rechecked before writing, including conflicts for a stylist working across branches. Customer identity comes from the session, not a submitted user ID. Request UUIDs prevent duplicate appointments on retries.

A zero-deposit booking is confirmed immediately. Optional whole-shilling M-Pesa deposits require the branch's live merchant credentials, enabled prompts and a public HTTPS callback origin. Sandbox/demo credentials cannot enable public paid bookings.

A paid booking begins as a 10-minute `AWAITING_DEPOSIT` hold. Provider callbacks use the existing secret-bound validation, exact amount/phone checks and merchant status query. A verified payment confirms the appointment only while the hold is live and the slot is still available. Late, cancelled or conflicting payments become `PAID_REVIEW`, never a silently confirmed time or automatic refund. Pending prompt recovery checks the booking's existing merchant transaction before requesting another payment.

Booking deposits appear in the merchant payment inbox with a booking reference. Reception must apply that existing receipt to the final checkout, using split payment for any remainder; do not collect or count the deposit twice. The booking screen does not issue a fiscal sales receipt or automatically refund a cancellation. The salon diary shows deposit state/reference and whether its merchant receipt is already linked to a sale.

Customer cancellation is session-scoped, follows the snapshotted notice period and shares the branch lock with reception updates. The business receives an in-app cancellation notification. Customers can still manage their records through their portal when public booking is later disabled; no private bookings are exposed through public slots.

## 4. Cancellation recovery

Customers explicitly opt into an in-app waitlist for a branch/service/date range and can withdraw. Staff with `salon.book` choose an actually available slot and send a 30-minute in-app offer. Active offers cannot be repeatedly resent before expiry. Sending an offer does not reserve the time or guarantee availability; acceptance rechecks the slot under the booking locks. Only the intended signed-in customer can accept the offer. A changed/withdrawn/expired offer cannot be converted into a booking by a stale request.

No SMS, email or WhatsApp campaign is activated. The implemented offer channel is the existing in-app notification centre.

## 5. Expiry rescue desk

Batches approaching expiry within 30 days are grouped for action. Staff with `stock.view` can inspect; `stock.adjust` is required to plan or complete an action.

- **Supplier return:** save a plan, then confirm physical dispatch/acceptance with the supplier's reference. Completion posts a negative `SUPPLIER_RETURN` movement once. It does not record a supplier credit or cash refund.
- **Branch transfer:** completion moves the batch out/in atomically, preserving its number, expiry and cost. The destination must be another active branch in the same business with a matching active SKU/unit/variant already configured for batch tracking. Expired stock is not transferred through this tool. Use the existing transfer workflow for stock still in transit; mark completion here only for a completed physical transfer.
- **Markdown:** record a permitted pricing plan and outcome. The price change remains a separate action in Pricing under its existing permissions. Expired, controlled/age-restricted and pharmacy/agrovet stock cannot receive markdown plans through this desk. Do not use a general markdown to bypass batch-expiry restrictions.

Plans alone move no stock. Serializable transactions and idempotent movement keys prevent partial or repeated returns/transfers. Cancelled plans do not alter balances.

## 6. Counter health and encrypted recovery

Inspect this browser's connectivity signal, estimated storage, persistent-storage grant, cached catalogue time, service-worker registration and current account/branch's unsynced queue. Request persistent storage or print a clearly labelled non-sale test slip. Browser connectivity is not proof that a server or printer is reachable.

Export an encrypted queue recovery file with a passphrase of 12+ characters (AES-256-GCM; PBKDF2-SHA256, 250,000 iterations; random salt/IV). No passphrase is saved or sent to the server. Import authenticates the file and checks its account, branch and sale keys. A single IndexedDB transaction adds missing entries only, preserving original idempotency keys and existing queue records. Imported entries are not submitted automatically. The operator reviews/retries sync; entries are removed only after the server accepts them or returns their existing receipt.

Limits: 10 MiB decrypted backup, 15 MiB encrypted input, up to 10,000 entries. Backups recover only exported local entries, not data never backed up, erased browser sessions, a server database, or cash/payment confirmation. The same account/branch must be authorised before import. A `sending` entry can have an uncertain network result; retrying its original key is safe, rather than inventing a replacement sale.

Access follows `till.sell` or ownership and the existing offline account/branch scope. No cache-clearing or automatic discard button is added.

## 7. Accountant handover

The private `/api/pos/handover` endpoint streams a ZIP for an inclusive EAT date range (up to 93 days). It includes labelled CSVs for sales, tenders, refunds, expenses, closed drawers/differences, goods receipts, booking deposits, invoice index and review exceptions. Margin-authorised users also get costed sale lines and material snapshots. Original captured invoices can be included with purchase-view access.

Exports require `report.sales` and `expense.view`. They are private/no-store and escape spreadsheet formulas. A dependency-free stored ZIP writer keeps source documents as separate files. Export limits reject an overlarge range instead of silently truncating accounting records: 10,000 records per source, 200 invoices, 20 MiB of original documents.

The README distinguishes sales from tenders/refunds, deposited money from final sales, goods receipts from expenses, and recorded VAT from eTIMS submission. Missing costs/references/documents are listed for review. No audited statement, tax return, automatic supplier settlement or accountant email is claimed.

## PDF daily brief

Business pulse's **Download brief (PDF)** now creates a branded PDF using the existing jsPDF dependency, loaded only on demand. It includes branch/date, recorded figures, partial-data warning, cost gaps, scope notes and page footers. It no longer downloads plain text.

## Setup and installation

```text
npx prisma generate
node backend/scripts/install-pos-operations.cjs
node backend/scripts/install-pos-operations.cjs --apply
```

The targeted installer adds five tables, seven appointment columns and three movement enum values in a transaction; it refuses partial installations. It does not reset the database or replay unrelated migration history. Schema source: `backend/prisma/migrations/20261025010000_pos_operations/migration.sql`. Existing baseline migration-history reconciliation remains a separate deployment concern.

On 25 October 2026 this additive schema was installed in the configured database. Existing sales, stock balances and business publication were not changed by installation. Prisma generation/schema validation passed.

`POS_INVOICE_MODEL=gemini-3.5-flash-lite` was added to the local environment and `.env.example`, reusing the existing Gemini credential. This model passed live extraction of a synthetic PDF (one item, two units, KSh 200 unit cost, KSh 400 total). Larger available models timed out or were overloaded during verification. Real documents were not uploaded for testing. Production needs the same supported model setting and its own valid provider access; credentials are never placed in public variables.

Owners must enable the public diary, choose visible staff, publish services and review policy. Paid deposits additionally require the existing live Daraja and public callback setup. Subdomain DNS/deployment requirements from `pos-business-websites.md` still apply. No website was published and no live payment or customer notification was triggered by verification.

## Verification

- Focused unit tests cover document bytes/schema, permission/branch checks, immutable reviewed retries, goods-receipt replay, booking identity/policy/conflicts, timed deposit holds, exact/late deposit handling, material rollback/cost snapshots, encrypted recovery, PDF structure, formula escaping and ZIP structure.
- Existing salon, M-Pesa callback and website tests include the new booking integration.
- Browser fixtures mount the actual components with explicit action fixtures at 320/390/1280px. They exercise invoice upload/review/receiving, materials, waitlist offers, supplier-return confirmation, real IndexedDB encrypted export/import/retry, customer slots/policy/login return path and navigation to personal bookings.
- Physical phone cameras, receipt printers and live merchant payments still need acceptance testing on the intended hardware/merchant account. Browser fixture callbacks are not evidence of a real M-Pesa transaction.

Final verification on 25 October 2026: the full test suite passed (162 passed, one optional PostgreSQL test skipped), targeted ESLint and TypeScript passed, and the production webpack build succeeded. A separate real-database transaction verified public booking conflict exclusion, idempotent goods receiving, material usage and reversal, a supplier return and accountant ZIP generation; every diagnostic database write was rolled back. The generated ZIP passed CRC validation. No deployment or merge is part of this change.
