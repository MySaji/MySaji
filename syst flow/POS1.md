# POS for SAJI — Option 1: The Trait Engine

> **Status:** design proposal. No code has been written or changed for this.
> Everything below was checked against the repository as it stands today;
> file and model names are real, and the gaps listed in §7 are things I
> confirmed are missing, not guesses.

---

## 1. The idea in one paragraph

You listed 34 shop types. The obvious reading is "build 34 POS screens".
That is the wrong shape, and it fails at shop 35 — the barber who also
sells pomade, the agrovet that starts stocking gumboots, the mitumba
trader who adds shoes.

A butchery and a cereals shop are not two different problems. They are
the *same* problem — **selling a quantity that is not a whole number** —
wearing different aprons. A pharmacy and an agrovet are the same problem:
**stock that expires and is legally controlled**. A phone shop and a
jewellery shop are the same problem: **every unit is individually
identified**.

So: do not enumerate shop types. **Identify the small set of selling
behaviours that actually differ, implement each one once, and let a shop
type be nothing more than a named bundle of them.**

I count **eleven** behaviours across all 34 of your types. Eleven
well-built traits beat thirty-four half-built verticals, and the
thirty-fifth shop type costs a config row rather than a sprint.

---

## 2. The eleven traits

| # | Trait | The question it answers | Shop types needing it |
|---|---|---|---|
| 1 | `MEASURED` | How much is "one"? | Butchery, cereals, fruit & veg, hardware, building materials, liquor (draught), agrovet |
| 2 | `VARIANTS` | Same product, different size/colour | Clothes, shoes, mitumba, bedding, kitchenware, baby, pet |
| 3 | `SERIALISED` | Which *physical* unit was sold? | Phones & accessories, electronics, jewellery & watches |
| 4 | `BATCH_EXPIRY` | Which batch, and when does it expire? | Pharmacy, agrovet, cosmetics, perfume, bakery, groceries, supermarket, baby, pet |
| 5 | `AGE_RESTRICTED` | May this person legally buy it? | Liquor store |
| 6 | `CONTROLLED` | Must this sale be recorded to a register? | Pharmacy, agrovet |
| 7 | `FITMENT` | Does this part fit that machine? | Car spare parts, electrical supplies, hardware & plumbing |
| 8 | `MADE_TO_ORDER` | Deposit now, deliver later | Furniture, bedding & curtains, building materials |
| 9 | `BULK_BREAK` | Bought as a bale, sold as pieces | Mitumba, cereals, cosmetics wholesale, general merchandise |
| 10 | `WASTAGE` | What did we lose, not sell? | Butchery, bakery, fruit & veg, groceries |
| 11 | `OPEN_PRICE` | Cashier sets the price at the till | Mitumba, general merchandise, gifts & toys |

Everything else every one of your 34 shops needs — a cart, a receipt, a
stock count, a daily total — is **core**, not a trait. Build core once.

### Why these eleven and not more

A trait earns its place only if it changes *the shape of a sale or a
stock record*. "Brands" is not a trait, it is a product attribute.
"Low-stock alerts" is not a trait, it is core. "Barcode scanning" is not
a trait, it is an input method that every shop may switch on.

This distinction is the whole discipline of the design. Keep the trait
list short and the core fat.

---

## 3. All 34 shop types as trait bundles

Read each row as: *this preset ships with these traits switched on; the
shopkeeper can switch any of them on or off afterwards.*

| Shop type | MEAS | VAR | SER | BATCH | AGE | CTRL | FIT | MTO | BULK | WASTE | OPEN |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Grocery shop | ● | | | ● | | | | | ● | ● | |
| Supermarket | ● | ● | | ● | ● | | | | | ● | |
| Clothes & fashion | | ● | | | | | | | | | |
| Shoe shop | | ● | | | | | | | | | |
| Phone accessories | | ● | ● | | | | ● | | | | |
| Cosmetics & beauty | | ● | | ● | | | | | | | |
| Detergents & cleaning | ● | ● | | ● | | | | | ● | | |
| Hardware | ● | | | | | | ● | | ● | | |
| Stationery & school | | ● | | | | | | | ● | | |
| Cereals | ● | | | | | | | | ● | ● | |
| Fruits & vegetables | ● | | | ● | | | | | | ● | |
| Butchery | ● | | | ● | | | | | | ● | |
| Bakery | ● | | | ● | | | | | | ● | |
| Perfume | | ● | | ● | | | | | | | |
| Baby products | | ● | | ● | | | | | | | |
| Furniture | | ● | | | | | | ● | | | |
| Electrical supplies | ● | | | | | | ● | | ● | | |
| Kitchenware | | ● | | | | | | | | | |
| Bedding & curtains | ● | ● | | | | | | ● | | | |
| Jewellery & watches | | ● | ● | | | | | | | | |
| Pet supplies | ● | ● | | ● | | | | | ● | | |
| Car spare parts | | | ● | | | | ● | | | | |
| Sports equipment | | ● | | | | | | | | | |
| Gifts & toys | | ● | | | | | | | | | ● |
| Plastic household goods | | ● | | | | | | | ● | | |
| Mitumba | | ● | | | | | | | ● | | ● |
| Electronics | | ● | ● | | | | ● | | | | |
| Liquor store | ● | ● | | ● | ● | | | | | | |
| Pharmacy | | | | ● | ● | ● | | | | ● | |
| Building materials | ● | | | | | | ● | ● | ● | | |
| Agrovet | ● | | | ● | | ● | | | ● | ● | |
| Cosmetics wholesale | | ● | | ● | | | | | ● | | |
| General merchandise | ● | ● | | | | | | | ● | | ● |
| Bookshop | | ● | | | | | | | | | |
| Hardware & plumbing | ● | | | | | | ● | | ● | | |

**Read the columns, not the rows.** `VARIANTS` appears 22 times.
`MEASURED` 17. `SERIALISED` 4. `CONTROLLED` 2. That tells you the build
order immediately: variants and measured units are the foundation, and
the controlled-substance register is a late, narrow feature for two
shop types. You could not see that from a list of 34 verticals.

---

## 4. What each trait actually does

### 1. `MEASURED` — fractional quantities
A sale line becomes `quantity: Decimal` with a `unitOfMeasure`
(`kg`, `g`, `l`, `m`, `m²`, `piece`). The till shows a numeric keypad
rather than a +/− stepper, and optionally reads a weight from a scale.
Price is `pricePerUnit × quantity`.

**This is the single most invasive trait** — see §7, because SAJI's
quantity columns are integers today.

### 2. `VARIANTS` — one product, many sellable units
A `ProductVariant` child row carries its own SKU, barcode, price delta
and stock. The till shows a size/colour grid instead of one button. The
catalogue shows one product; inventory counts each variant.

### 3. `SERIALISED` — identity per physical unit
Stock is a *list of serials*, not a number. Selling asks the cashier to
scan or pick the IMEI. This gives warranty lookup and theft traceability
for free, and makes "we have 3 in stock" mean three specific objects.

### 4. `BATCH_EXPIRY` — FEFO
Stock is held per batch with an expiry date. The till proposes the
**First-Expiring-First-Out** batch. Near-expiry becomes a dashboard
alert and a markdown opportunity rather than a write-off discovered
later.

### 5. `AGE_RESTRICTED`
The till interrupts the sale with an age confirmation the cashier must
positively acknowledge, and records who acknowledged it. Protects the
licence, not just the customer.

### 6. `CONTROLLED`
For pharmacy and agrovet: capture prescriber/buyer details against the
sale line, write to an append-only register, and make that register
exportable. This is a compliance artefact, not a feature — design it to
be auditable from day one or do not ship it.

### 7. `FITMENT`
A compatibility table (`make / model / year`, or `voltage / thread /
gauge`) with a lookup at the till: *"What fits a 2014 Probox?"* This is
the difference between a parts shop using your POS and using a notebook.

### 8. `MADE_TO_ORDER`
The sale splits into deposit now + balance on delivery, with a promised
date. The order lives in a production/delivery queue rather than
decrementing stock immediately.

### 9. `BULK_BREAK`
A purchase unit (bale, sack, carton) converts to sale units by a stated
factor. Receiving one bale of 40 adds 40 pieces. Essential for mitumba
and cereals; the conversion must be recorded, not implied.

### 10. `WASTAGE`
Spoilage, trimming loss and expiry are **first-class stock movements
with a reason code**, never silent adjustments. A butchery that cannot
see its trim loss cannot price meat.

### 11. `OPEN_PRICE`
The cashier types the price at the till. Needed for haggled trade.
Must be permission-gated and reported on, or it becomes the hole every
shrinkage disappears through.

---

## 5. How this maps onto SAJI as it exists

This is the part that makes it an *integration* rather than a rewrite.

| POS concept | Already in SAJI | Where |
|---|---|---|
| Tenant / the shop | **`ShopkeeperProfile`** | `prisma/schema.prisma` |
| Catalogue | **`Product`** | has `sku`, `price`, `discountPrice`, `images`, `isActive`, `publishedAt` |
| Stock | **`Inventory`** | `currentStock`, `reservedStock`, `lowStockThreshold`, `reorderLevel` |
| Sale | **`Order` + `OrderItem`** | already has `subtotal`, `discount`, `tax`, `total` |
| Money | **`Payment`** | has `status`, `externalRef`, `failureReason`, M-Pesa wired |
| Receipt | **`Receipt`** | `receiptNumber`, `lineItems Json`, `adjustments Json` |
| Per-type product fields | **`CategoryAttribute`** | typed dynamic fields per category — *the single best reuse in this whole document* |
| Suppliers / purchasing | **Distributor + `WholesaleOrder`** | a working B2B restock path already exists |
| Shop open/closed | **`isShopCurrentlyOpen`** | `lib/format.ts`, handles Sunday + holiday hours |
| Offline shell | **`public/sw.js` + `manifest.json`** | PWA groundwork is already present |
| Audit trail | **`AuditLog`** | exists |

**The strategic point:** SAJI does not need a POS *bolted on*. SAJI needs
its existing merchant half to grow a till. A POS sale is an `Order` with
`channel = IN_STORE` — same catalogue, same stock ledger, same receipts,
same analytics as the online orders the shop already takes. One shop,
one stock figure, two ways to sell.

That is a genuine competitive advantage over every standalone POS in the
market: the shopkeeper's counter sales and their SAJI marketplace sales
draw down **the same tin of paint**.

### `CategoryAttribute` deserves special mention

It already stores `key`, `label`, `type`, `options[]`, `placeholder`,
`sortOrder` per category, with an admin UI
(`lib/actions/admin-category-attributes.ts`). That is *exactly* the
mechanism for "a pharmacy product has a batch number, a car part has a
fitment, a shoe has a size". Do not build a second one.

---

## 6. Proposed data model (additive only)

Nothing below removes or renames an existing column.

```
ShopProfile (POS settings)      → shopkeeperId, traits[], unitSystem,
                                  priceIncludesTax, receiptHeader,
                                  negativeStockPolicy
ProductVariant                  → productId, sku, barcode, attributes Json,
                                  priceDelta, stock
StockItem (SERIALISED)          → productId, serial, status, soldOnSaleItemId
StockBatch (BATCH_EXPIRY)       → productId, batchNo, expiresAt, qty, cost
StockMovement  ← the keystone   → shopkeeperId, productId, variantId?,
                                  batchId?, delta Decimal, reason,
                                  referenceType, referenceId, actorId, at
Fitment                         → productId, make, model, yearFrom, yearTo
TillSession                     → shopkeeperId, deviceId, cashierId,
                                  openingFloat, closingCount, openedAt, closedAt
SaleChannel (enum on Order)     → ONLINE | IN_STORE
```

**`StockMovement` is the keystone.** Today `Inventory.currentStock` is a
mutable number — you can see what the stock *is* but never how it got
there. A POS without an immutable movement ledger cannot answer "who
adjusted this?", cannot do wastage, cannot reconcile a till, and cannot
survive an argument with a shopkeeper about missing stock. Make
`currentStock` a *projection* of the ledger, not the source of truth.

If you implement one thing from this document, implement
`StockMovement`.

---

## 7. Gaps I found — read this before estimating

These are real, verified against the current schema. Each is a blocker
for at least one shop type.

| # | Gap | Consequence | Affects |
|---|---|---|---|
| 1 | **`OrderItem.quantity` is `Int`** | Cannot sell 1.35 kg of meat | Butchery, cereals, fruit & veg, hardware, agrovet — 17 of 34 types |
| 2 | **`Inventory.currentStock` is `Int`** | Cannot hold 12.4 kg in stock | same 17 |
| 3 | **`Product.sku` is globally `@unique`** | Two shops cannot both use SKU `001`; CSV import collides across tenants | **all** |
| 4 | **No `barcode` field** | No scanning, the defining POS input | all |
| 5 | **No cost price** | No margin, no profit report, no stock valuation | all |
| 6 | **`Order.tax` exists but is never populated** — `cart.ts` sets no tax | No VAT, no eTIMS path | all |
| 7 | **No stock movement ledger** | No audit, no wastage, no till reconciliation | all |
| 8 | **Checkout is wallet/escrow only** | A cash-at-counter sale must *not* go through customer-wallet escrow; it is a different money path | all |
| 9 | **Staff/branches hang off `ProviderProfile`, not `ShopkeeperProfile`** | `StaffInvite` and `BusinessBranch` cannot currently give a shop a cashier | all multi-staff shops |
| 10 | **No offline write queue** | `sw.js` exists but there is no durable pending-sale queue | all |

Items 1–3 are schema migrations on live tables and should be sequenced
first and carefully. Item 3 in particular (`sku` unique → unique per
shop) is a one-line schema change with real data implications.

Item 8 is the one most likely to be missed in planning: SAJI's existing
checkout debits a customer wallet and holds funds. A POS sale is a
shopkeeper recording money they have already physically received. Routing
it through escrow would be wrong in both directions — it would hold the
shopkeeper's own cash and create a payout they do not need.

---

## 8. Build order

Sequenced so that something is usable at the end of every phase, and so
the riskiest migrations happen while the feature is small.

**Phase 0 — Foundations (no POS visible yet)**
`StockMovement` ledger; `Inventory.currentStock` becomes a projection;
`sku` unique per shop; add `barcode` and `costPrice`. Backfill one
movement per existing stock figure so history starts honest.

**Phase 1 — The till that works for 12 of your 34 shops**
Core only, no traits: cart, scan/search, cash + M-Pesa, receipt,
`TillSession` open/close, `Order.channel = IN_STORE`. This alone serves
bookshop, stationery, kitchenware, sports, toys, plastics, gifts.

**Phase 2 — `VARIANTS` + `MEASURED`**
The two traits that unlock 30 of the 34 types. Biggest return in the
plan by a wide margin.

**Phase 3 — `BATCH_EXPIRY` + `WASTAGE`**
Groceries, bakery, butchery, cosmetics, pet, baby. FEFO at the till,
near-expiry on the dashboard.

**Phase 4 — Offline**
Durable queue, idempotency keys, device registration, conflict surfacing.
Do this *after* the sale path is stable; offline multiplies the cost of
every bug in it.

**Phase 5 — The long tail**
`SERIALISED`, `FITMENT`, `MADE_TO_ORDER`, `BULK_BREAK`, `OPEN_PRICE`,
`AGE_RESTRICTED`, `CONTROLLED`. Each is small once the core is right,
and each can ship independently.

**Phase 6 — Compliance**
VAT, eTIMS. Deliberately last, and deliberately not promised until
verified against current KRA requirements — a tax calculation is not
compliance.

---

## 9. Honest risks

- **Offline is not a checkbox.** Two tills selling the last item while
  disconnected cannot both be right. Decide the policy (reserve, allow
  negative, or block) before building, and show the cashier which one is
  in force.
- **M-Pesa cannot be confirmed offline.** A sale may be recorded while
  its payment is still unverified. The receipt must say so.
- **eTIMS is a legal obligation, not a feature flag.** Do not advertise
  it until an integration is verified end to end.
- **The trait engine can be over-engineered.** Eleven traits is the
  budget. If a twelfth is proposed, the test is: *does it change the
  shape of a sale line or a stock record?* If not, it is an attribute or
  a report.
- **Shop type is a default, never a cage.** Every preset must be
  editable afterwards, because real shops do not respect categories.

---

## 10. Why this option

It is the version that still works in three years. The trait table is
the specification, the shop-type table is just marketing copy over it,
and the thirty-fifth shop type — the one you have not thought of yet —
costs a row in a config file.

The counter-argument is honest too: it is more abstract up front, and a
single hard-coded supermarket POS would demo sooner. If the goal is a
demo next month, see **POS2.md**, which gets there faster by hanging POS
off the signup flow you already have.
