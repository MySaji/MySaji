# Business-specific Saji Till features

Updated 5 November 2026.

## One rule for navigation and workflows

`backend/domain/pos-business-features.ts` resolves the current branch profile, its saved selling traits and optional table-service preference. Saved traits remain authoritative. Employee permissions are checked in addition to business capabilities. Changing the business type does not grant staff additional permissions.

The same capabilities now control overview links, register navigation, specialist workspace shortcuts and the POS shell. Server-side table/kitchen, job-card, salon and material-consumption actions check the corresponding capability before accessing workflow records. Public salon availability also respects an owner disabling service selling.

| Business preset | Relevant tools |
| --- | --- |
| Supermarket | Product options/packs, measured sales, batch/expiry controls, age checks and wastage |
| Clothes, shoes, mitumba | Sizes/colours, separate option codes/barcodes, prices and stock |
| Salon, barber, spa | Service catalogue, diary, stylists, durations, commissions and material usage |
| Restaurant/cafe | Table orders and kitchen tickets, with service selling and wastage |
| Garage/repair/laundry | Job cards where enabled, with the preset's labour, compatibility or serial features |
| Phones/electronics | Individual serial tracking, variants and compatibility where enabled |
| Furniture/made-to-order trades | Deposit-eligible items and orders where enabled |

Shared checkout, receipts, shifts, accounting and staff access remain common to the business types. Business identity does not create a separate financial ledger implementation.

## Owner customisation

In **Settings > Selling features**, owners can apply a preset or change individual traits. **Tables and kitchen** has its own saved switch: its unset value follows the profile, while an explicit on/off value allows mixed-use businesses. This switch saves immediately. A clothing store can deliberately add table service; it will not receive it merely because a cashier has selling permission.

Disabling a feature hides its workspace; it does not delete stock, job histories or money owed. Existing authorised deposit settlement and historical reversal paths remain intact. Re-enable the feature to reopen its full workspace.

Operations desk tabs follow the business as well: material consumption requires service selling, booking settings require an enabled salon, and expiry rescue requires batch/expiry capability. Generic invoice, counter-health and accountant tools still follow their staff permissions.

## Catalogue setup

**Services:** choose Add product, then **Item type > Service / treatment / labour**. This option appears for businesses with service selling enabled. Services are created without physical inventory or opening stock. Existing product/service classification is protected: create a separate item rather than rewriting the type of a historical item.

**Clothing options:** clothes, shoes and mitumba default to **Set up sizes, colours or packs next**. Other variant-enabled businesses may select it. The parent is created paused, then the option form opens. Enter each size/colour label, optional SKU/barcode, optional price override and opening quantity. Saving a valid setup activates the new item in the same transaction as its option stock. Cancelling leaves it paused for later review. Single-item sellers can turn this option off.

**Existing items:** use the row's three-dot menu > **Business setup**. Existing options are preserved and can be paused. They cannot be silently removed. Identifiers are checked against products and other options in the branch. Entered prices require price access; opening option quantities require stock-adjustment access. Clothing quantities are whole units unless measured selling is enabled.

**Salon rules:** in a service's Business setup, an authorised salon manager sets its duration and stylist commission. New appointments use the settings; existing appointment/receipt snapshots are retained. Commission values are not returned to readers without salon management/commission access.

The same form exposes batch, serial, controlled-goods and made-to-order flags, compatibility or bulk metadata only where the branch supports them. Stock tracking cannot be removed once attached to an item. Enabling a new tracking mode requires zero unallocated parent stock; no automatic conversion or redistribution is guessed. Receive tracked batch/serial stock through its intake workflow. There is a limit of 100 options per setup form.

## Stock integrity and verification

Option edits, parent flags, service rules, activation and new option stock movements are written in a single transaction. An item version and a branch lock prevent stale forms from posting new stock twice. A failed movement rolls back the option, activation and tracking changes. The actor and branch come from the active session, not the request body.

Verification includes all registered profiles at capability/tool-selection level, permission and foreign-ID denial tests, identifier conflicts, stale retries, service creation, ledger rollback and commission redaction. Browser fixtures mount actual components with explicit action fixtures at 390px and 1280px for navigation, clothing creation/options and salon services/rules.

A separate real-database transaction created two test variants with quantities 5 and 3, confirmed their aggregate stock was 8, verified two opening movements and rejected a stale retry. All diagnostic database changes were rolled back, including the temporary branch-profile change. No new migration, deployment or real customer communication is part of this change.

Validation: the repository test suite passed 182 tests (one optional PostgreSQL test skipped). All eight focused mobile/desktop browser cases passed; the two clothing-creation cases were also rerun after the final activation safeguard. Targeted ESLint and TypeScript checks passed.
The final production build (Next.js webpack) passed, including its TypeScript validation and generation of 274 static pages. Existing metadataBase warnings remain outside this business-workflow change.
