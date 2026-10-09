# POS for SAJI — Agreed direction and way forward

> **Status:** agreed design. No code has been written or changed. Every
> file, model and line of logic cited below was read in the repository
> while writing this.
>
> Supersedes the earlier "Option 2" draft. The engine that sits behind
> this — the eleven composable selling traits that let one till serve 34
> shop types — is **POS1.md**, and is unchanged.

---

## 1. The decision

POS becomes a **Saji Pro business type**, chosen at registration like
the six that already exist, with two rules on top:

**Rule 1 — POS is exclusive to retail.**

| Selection | Allowed? | What it means |
|---|:-:|---|
| `POS` alone | ✅ | A till. Stock and sales are the shop's own; nothing is listed on SAJI. |
| `POS` + `PRODUCTS` | ✅ | The same catalogue and the same stock also sell on the SAJI marketplace. |
| `POS` + anything else | ❌ | Services, Rentals, Freelance, Tutoring, Consulting are not retail counters. |

**Rule 2 — the till can leave the browser.** Installable on the
shopkeeper's own machine, running against the same account and the same
shop.

The rest of this document is what those two rules actually cost, in the
code as it stands.

---

## 2. Why the exclusivity rule is right

It is not an arbitrary restriction, and it is worth being able to defend
it to a shopkeeper:

- A till is a **place**, not a service. Services, tutoring, consulting
  and freelance are sold by the hour and often remotely; there is no
  counter and no stock to decrement.
- It keeps the portal coherent. A Pro who is a plumber *and* runs a till
  would need two unrelated navs in one sidebar.
- `PRODUCTS` is the one honest pairing, because POS and PRODUCTS are the
  **same stock sold through two channels**. That is the product's whole
  story: *the counter and the marketplace draw down the same tin of
  paint.*

It also gives a clean upsell ladder, which is commercially the most
valuable thing in this design:

```
   Sign up with POS alone          →  a working till (tool)
   Later, tick "Sell Products"     →  the same shelf, now visible to
                                      every SAJI customer nearby (demand)
```

The shopkeeper adopts POS because it replaces a notebook. They stay for
the marketplace. Nothing else SAJI could build has that shape.

---

## 3. Two landmines in the current code

These are the reason this document exists. Both were found by reading
`lib/actions/pro-capabilities.ts`, and **both silently defeat Rule 1** if
left alone.

### Landmine 1 — a shop record force-adds `PRODUCTS`

```ts
// lib/actions/pro-capabilities.ts
if (shop && !effective.includes("PRODUCTS")) effective.push("PRODUCTS")
```

Any account owning a `ShopkeeperProfile` is granted `PRODUCTS`
automatically. A POS shop will certainly have a `ShopkeeperProfile` —
that is where its catalogue lives.

**So "POS alone" cannot currently be expressed.** Ticking POS without
PRODUCTS would still produce a marketplace-listed shop, which is the
precise opposite of what Rule 1 promises.

The cause is that one record is doing two jobs. *Having a catalogue* and
*being listed for sale on SAJI* are different facts, and today they are
the same column.

**Resolution:** separate them. A `ShopkeeperProfile` gains something like
`listedOnMarketplace: Boolean @default(true)` — `true` for every shop
that exists today, so nothing changes for them — and the auto-add above
becomes conditional on it. Ticking "Sell Products" is then exactly the
act of flipping that to `true`.

This is the single most important schema decision in the whole plan, and
it is small. Get it wrong and the POS-only promise is undeliverable.

### Landmine 2 — a pending POS account is shown the plumber portal

```ts
const effective: ProBusinessType[] = active.length > 0 ? [...active] : ["SERVICES"]
```

The fallback is deliberate and correct for its original purpose: Pro
accounts predating business types have no rows, and defaulting them to
`SERVICES` keeps their sidebar intact rather than emptying it.

But a **brand-new POS signup whose capability is still `PENDING` has no
`ACTIVE` rows** — so it falls through to `SERVICES` and is shown a
plumber's portal on first login. The worst possible first impression for
a paying retail customer.

**Resolution:** the fallback must distinguish *"no rows, legacy account"*
from *"rows exist but none active yet"*. The second case should land on
a "your till is being set up" state, not on someone else's portal.

This also forces an explicit answer to a question that is easy to leave
implicit: **is POS auto-`ACTIVE` at signup, or does it need staff
review?** See §8.

---

## 4. The picker, with the rule in it

The signup picker is currently pure multi-select — `"Select all that
apply"`, validated only as *at least one*
(`app/auth/signup/page.tsx`). POS introduces the **first mutual
exclusion** in that UI, so the rule has to be visible rather than
enforced by silent failure.

**When POS is ticked**, the five non-retail cards dim with a reason
attached — never just disappear:

```
What does your business do?                    Select all that apply

┌─────────────────────────┐  ┌─────────────────────────┐
│ 🧾 Run a Shop Till      │  │ 🏪 Sell Products        │
│    POS            ✓     │  │    on SAJI              │
└─────────────────────────┘  └─────────────────────────┘
       ↑ selected                  ↑ can be added

┌─────────────────────────┐  ┌─────────────────────────┐
│ 🔧 Offer Services       │  │ 📦 Rent Out Items       │
│    ⊘ not available with │  │    ⊘ not available with │
│      a shop till        │  │      a shop till        │
└─────────────────────────┘  └─────────────────────────┘
        … Freelance, Tutoring, Consulting likewise dimmed

  Untick "Run a Shop Till" to choose these instead.
```

**When a non-retail type is ticked first**, POS dims with the mirror
message. The rule must be reversible in both directions and never leave
someone stuck without an explanation.

Three non-negotiables:

1. **Explain, don't hide.** A dimmed card with a reason teaches the
   model. A missing card looks like a bug.
2. **Enforce on the server.** `requestProCapability` must reject an
   illegal combination, and signup must validate the whole set, not each
   type in isolation. Today `businessTypeSchema` is a `z.enum` over
   single values — there is no combination validator at all. Client-side
   dimming is a courtesy, not a control.
3. **One rule, one place.** Put `isAllowedCombination(types)` in
   `lib/pro-modules.ts` next to the registry, so the signup picker, the
   "add business type" page and the server action cannot disagree.

### Existing Pros

`/provider/business-types` already exists for adding a capability later.
A plumber opening a shop will find POS dimmed there with the same
reason. Switching from Services to POS means **dropping** a capability
that has jobs, offers and history behind it — that is a support-assisted
path, not a toggle, and should be stated as such rather than quietly
allowed.

---

## 5. Where the till actually lives

There is **one portal** — Saji Pro. `/provider/*` and `/shopkeeper/*` are
route namespaces inside it under a single `app/(pro)/layout.tsx`;
`components/provider-topbar.tsx` records the merge in its own comment.
POS does not get a portal of its own.

But the till is not a page in that portal either, and the app already
shows why. `lib/hooks/useProviderWorkspace.ts` derives an **Adaptive UI
Workspace** — `solo`, `business_owner`, `field_technician` — and the
nav reshapes around it. A field technician gets a stripped, task-focused
view of the same portal their employer manages.

**A cashier is the same shape as a field technician.** So:

| Workspace | Who | Sees |
|---|---|---|
| `solo` | The Pro | Full portal |
| `business_owner` | Runs a team | Full portal + team |
| `field_technician` | Staff on a job | Stripped, task-focused |
| **`till`** | **Cashier at a counter** | **Checkout only** |

`/pos` renders **outside** the `(pro)` chrome — no sidebar, no topbar,
no wallet, no notification bell. A cashier serving a queue sees a
product grid, a cart and a pay button. The owner reaches everything else
through the normal portal on their own device.

---

## 6. The standalone build

This is the second new requirement, and it deserves a blunt analysis
because the word "standalone" hides where the work actually is.

### Packaging is the cheap part. Offline is the expensive part.

A desktop shell around a web app is a few days. A till that keeps
selling through a four-hour internet outage and reconciles cleanly
afterwards is the single largest engineering item in this entire plan —
larger than the till UI, larger than the trait engine.

Wrapping an online-only app in a desktop window produces something that
still stops working when the line drops, while *looking* like it
shouldn't. That is worse than the browser, because it breaks a promise
the packaging made.

**So: build offline-first, then package. Never the reverse.**

### The ladder

**Step A — PWA install (nearly free, available now).**
`public/manifest.json` and `public/sw.js` already exist. An installed
PWA on Windows gives an app icon, its own window with no browser
chrome, and offline operation. That is most of the perceived benefit of
"standalone" for roughly none of the cost.

**Step B — Tauri wrapper (when hardware demands it).**

The honest trigger for going native is **not** the feeling of a real
app. It is hardware:

| Need | PWA | Desktop |
|---|:-:|:-:|
| Barcode scanner (keyboard-wedge) | ✅ | ✅ |
| Offline selling | ✅ | ✅ |
| App icon, own window | ✅ | ✅ |
| **Thermal receipt printer (ESC/POS)** | ⚠️ fragile | ✅ |
| **Cash drawer kick** | ❌ | ✅ |
| **Weighing scale over serial** | ⚠️ limited | ✅ |

Most scanners already work in a browser because they type. Printers,
drawers and scales do not — WebUSB and WebSerial exist in Chromium but
are permission-gated, inconsistent, and a poor bet for a butchery scale
at 7am.

A butchery, a supermarket and a pharmacy will want all three rows in
bold. A mitumba stall will not. **Hardware is the trigger, and it
arrives per shop type** — which maps neatly onto POS1's trait bundles.

### Tauri over Electron

For this market the choice is not close:

| | Tauri | Electron |
|---|---|---|
| Installer size | ~5–15 MB | ~85–150 MB |
| Memory | Uses the OS webview | Bundles Chromium |
| Old hardware | Comfortable | Heavy |
| Download on Kenyan bandwidth | Reasonable | Painful |

Tauri also ships a signed auto-updater, which matters once tills are in
shops you cannot visit.

### The rule that keeps this sane

**One codebase.** The desktop build is the same Next.js UI in a native
shell, not a fork. The moment there are two POS implementations, they
diverge and you maintain two products.

### What standalone does *not* mean

It does not mean a local-only till with no account. The desktop app
signs into the same SAJI account and syncs to the same shop — otherwise
there are two sources of truth for stock, and "the counter and the
marketplace draw down the same tin of paint" stops being true, which was
the entire reason to build this inside SAJI.

Desktop also brings obligations the browser handled for you: device
registration and revocation for a lost or stolen machine, encryption of
sales data at rest, and a signed update channel.

---

## 7. Way forward

Sequenced so the riskiest migrations happen while the feature is small,
and so something is usable at the end of every phase.

**Phase 0 — Make the rule expressible** *(small, unblocks everything)*
Split "has a catalogue" from "is listed on SAJI"
(`listedOnMarketplace`, defaulting `true` so no existing shop changes).
Fix the `PENDING`-falls-back-to-`SERVICES` hole. Add
`isAllowedCombination()` to `lib/pro-modules.ts`. **No UI yet.**

**Phase 1 — The choice**
Add `POS` to the enum, registry and meta. Picker with dimming and
reasons, server-side combination validation, shop-type sub-picker, the
profile preset it writes. Portal shows "Till — coming soon".
*Ships in days and makes the commercial proposition testable.*

**Phase 2 — The ledger** *(the real foundation)*
`StockMovement` as an immutable record; `currentStock` becomes a
projection. Fix the three blockers from POS1 §7: `sku` unique **per
shop**, decimal quantities, add `barcode` and `costPrice`.

**Phase 3 — The till, online only**
Cart, scan, cash + M-Pesa, receipt, open/close shift, PIN per cashier.
One profile — *General merchandise* — proven end to end.
**Critical:** a POS sale is an `Order` with `channel = IN_STORE` that
**bypasses wallet/escrow**. `lib/actions/cart.ts` debits a customer
wallet and holds funds; a counter sale is a shopkeeper recording money
already in their hand. Reusing `checkout()` because it looks close
enough is the most likely serious bug in this project.

**Phase 4 — Offline-first** *(the big one)*
Local catalogue, durable queue, idempotency keys, device registry,
conflict surfacing, explicit negative-stock policy. Delivered as the
installed **PWA**.

**Phase 5 — The first three real profiles**
Supermarket (barcode, batch), Butchery (weight, wastage), Clothes
(variants) — three profiles that between them exercise every hard
mechanism in POS1's trait engine.

**Phase 6 — Tauri desktop + hardware**
Receipt printer, cash drawer, scale. Signed auto-update, device
revocation, encryption at rest.

**Phase 7 — The marketplace tie-in**
The "also sell on SAJI" upgrade path, one shared stock figure across
both channels. This is the payoff; it needs Phases 2 and 3 to be solid
first.

**Phase 8 — VAT and eTIMS**, only once verified end to end. A tax
calculation is not compliance.

---

## 8. Decisions I need from you

These change the build and I should not guess at them:

1. **Is POS auto-`ACTIVE` at signup, or staff-reviewed?** A till that
   cannot take money until someone approves it is a poor first
   impression; an unvetted till is a compliance question. `ProCapability`
   supports both.
2. **Is POS a paid tier?** `ProviderSubscription` exists and POS is the
   most obviously chargeable thing SAJI has. It changes the signup flow
   if so.
3. **Can an existing Services Pro convert to POS?** My assumption:
   support-assisted, not self-serve, because it means dropping a
   capability with live history.
4. **Which comes first after Phase 3 — offline or more shop profiles?**
   Offline is harder and serves everyone; profiles are easier and win
   specific segments.
5. **Desktop timing.** I would ship the PWA at Phase 4 and hold Tauri
   until a real shop needs a receipt printer. If you have already
   promised a downloadable app to someone, that changes the order.

---

## 9. Risks worth stating plainly

- **Offline is not a checkbox.** Two tills selling the last item while
  disconnected cannot both be right. Pick the policy — reserve, allow
  negative, or block — before building, and show the cashier which is in
  force.
- **M-Pesa cannot be confirmed offline.** A sale may be recorded while
  its payment is unverified. The receipt must say so rather than imply
  settlement.
- **The enum change ripples.** Adding `POS` to `ProBusinessType` means
  every `switch` over it must handle the new member. Worth grepping
  before the migration, not after.
- **"Standalone" invites a local-only expectation.** Be explicit in
  marketing that the desktop till syncs to the same SAJI shop, or
  shopkeepers will expect it to work with no account at all.
- **A profile that cannot be edited is a trap.** Real shops drift — the
  agrovet starts stocking gumboots. Every preset must be adjustable from
  settings on day one.

---

## 10. Implementation log

Written as the code landed, so this document keeps describing the code
rather than describing an intention. Phase numbers refer to §7.

### Phase 0 — the rule is expressible — **done**

| What | Where |
|---|---|
| `listedOnMarketplace` on the tenant, default `true` | `prisma/schema.prisma` |
| `isAllowedCombination()` / `isTypeSelectable()` / `shouldListOnMarketplace()` | `lib/pro-modules.ts` |
| The `PENDING`-falls-back-to-`SERVICES` hole, closed | `lib/actions/pro-capabilities.ts` |
| The `PRODUCTS` force-add, narrowed to listed shops | same |

Two corrections to what §4 said about those last two.

The fallback was `active.length > 0 ? active : ["SERVICES"]`. The test
that actually means "this account predates business types" is
`rows.length === 0` — somebody awaiting review *has* rows and *has*
chosen. It now distinguishes the two, and an account with only a
pending request gets the core module set and the status of its request
rather than a plumber's portal.

The force-add was `if (shop && !includes("PRODUCTS")) push("PRODUCTS")`.
It is now `if (shop?.listedOnMarketplace && …)`. Because POS accounts
own a `ShopkeeperProfile` too — it is the till's tenant — "has a shop"
stopped meaning "sells on SAJI" the moment POS existed.

### Phase 1 — the choice — **done**

`POS` is in the TS union, the Prisma enum, `PRO_BUSINESS_TYPES` (next to
`PRODUCTS`, so the one legal pairing reads adjacently) and
`DEFAULT_MODULES_BY_TYPE`. Six new modules under a `till` group that is
deliberately **not** the existing `shop` group.

The rule is enforced in three places, and a dimmed control is not one of
them: the picker dims and explains, `registerUser` validates the whole
set, and `requestProCapability` validates the set the account *would*
hold — including pending requests, since otherwise someone could queue
POS and then Rentals and move the conflict to whichever staff approved
second.

A seventh step appears in signup for POS accounts only: the shop type,
from the thirty-five presets. Searchable grouped rows rather than a card
grid, because thirty-five cards is a wall on a phone and the shopkeeper
is looking for their own trade, not browsing.

**One decision taken rather than asked** (§8.1): POS is **auto-`ACTIVE`
at signup**, following the precedent already in `registerUser` — every
type chosen at signup is ACTIVE, because the person choosing is not
making a request of anyone. Types added *later*, from inside the portal,
still go through staff. §8.2 to §8.5 remain open.

### Phase 2 — the ledger — **done**

`StockMovement`, append-only, signed quantities, `Decimal(14,3)`.
`lib/pos-ledger.ts` is the only writer. The three blockers from POS1 §7
are cleared: `sku` is unique **per shop** (it was globally unique, which
is simply wrong for a multi-tenant catalogue), and `barcode`, `costPrice`
and `unit` exist.

**Two figures, one truth.** `Inventory.currentStock` stays `Int` — some
221 call sites across cart, checkout, wholesale and the distributor
portal read it as a number — and a nullable `stockOnHand Decimal(14,3)`
holds the exact balance. The ledger maintains
`currentStock = max(0, floor(stockOnHand))`. Flooring, not rounding: 0.4
kg of mince is real stock at the counter but is not one sellable unit on
the marketplace, and rounding up would let a customer order something
that does not exist.

A product with no ledger rows seeds its first balance from
`currentStock`, so the first movement continues the real shelf figure
instead of starting a parallel count from zero.

### Phase 3 — correction to §7

> **§7 Phase 3 said:** "a POS sale is an `Order` with
> `channel = IN_STORE`". **That was wrong**, and `PosSale` is its own
> table instead.

Three reasons, in increasing order of seriousness. `Order.customerId` is
required and FKs to a real `User`; a walk-in has no account. `Order`
carries an address, a delivery fee, an escrow-backed `Payment` and a
`PENDING → SHIPPED → DELIVERED` lifecycle, none of which describe a sale
that is complete the moment the cash is in the drawer. And every
existing revenue, "orders today" and shop-analytics query counts `Order`
rows unfiltered — folding counter takings into figures that have always
meant marketplace orders would corrupt them silently, which is the worst
way for a number to be wrong.

The two channels meet where they should: at the shared `Product`
catalogue and the shared `StockMovement` ledger. One stock figure, two
ways to sell from it. That is Phase 7's payoff and it does not require
the sale tables to be the same one.

The PDFs recommended separate `sales` / `sale_items` tables and were
right, for this reason rather than for the NestJS architecture they came
attached to.

### Offline, brought forward from Phase 4

Idempotency is in the schema and the ledger now, not later, because
retrofitting it means reconciling stock that has already been
double-counted. `StockMovement` and `PosSale` each carry a device-issued
`idempotencyKey`, unique **per shop**. A replay returns the original
movement id and `replayed: true` — success, not an error, because a till
retrying its queue after a dropped connection has done nothing wrong.

`occurredAt` and `createdAt` are both kept: on an offline till they
differ, reports must use the first and sync debugging needs the second.

### Verified

- `21/22` foundation (schema defaults, per-shop SKU, fractional
  quantities, idempotency, a walk-in sale, tenant isolation). The one
  failure is the barcode index: with 16 rows and no barcodes populated
  Postgres prefers a sequential scan, which is correct. The index exists
  and is used once `enable_seqscan` is off; preference at real data size
  is **not** demonstrated.
- `26/26` ledger, including every case it must refuse — wrong-direction
  movements, another tenant's product, `BLOCK` past zero, and a replay
  that must not double-count.
- `64/64` the rule, the module sets, and provisioning — every allowed and
  refused combination, order- and duplicate-independence, a POS-only shop
  landing unlisted, a POS + Sell Products shop landing listed, an
  unrecognised preset falling back to General, and re-provisioning
  neither duplicating the shop nor un-listing a live one.
- `tsc --noEmit` clean across the project.

Every test created its own rows and deleted them; none left anything
behind, and the one real product touched was restored and re-checked.

### Not built yet

Phase 4's offline queue, Phase 5's remaining presets, Phase 6's native
desktop build and hardware, Phase 8's VAT. Of the till's own pages, Cash
Shifts and Devices are still unbuilt — shift history lives on the reports
page for now, and a devices page waits on device pairing, which belongs
with the offline work.
Nine of the eleven traits are registry entries with `stage: "planned"`
and no behaviour behind them — `POS_TRAIT_META` says which, so neither
the settings page nor the till can promise a shopkeeper something that
does not work.

Phase 7's marketplace tie-in is **done** — see the entry below.

### Phase 3 — the till, online only — **done**

`lib/actions/pos-sales.ts` and `/provider/till`. Three rules govern that
file, each because the obvious shortcut is wrong:

1. **No function takes a `shopkeeperId`.** The tenant comes from the
   session, every time. One parameter would make every call site a
   place isolation can be got wrong.
2. **The server prices the sale.** The till sends what was scanned and
   how much of it, never what anything costs. A client-supplied total is
   a client-supplied discount — and it is tested: a crafted request
   carrying `total: 1` is ignored and charged 1,300.
3. **One transaction or nothing.** Sale, lines, tenders and a
   `StockMovement` per line commit together. An oversold line under
   `BLOCK` rolls the whole sale back — verified down to "no orphan stock
   movement was left behind".

Traits are enforced server-side, not merely hidden in the UI: a bookshop
posting `quantity: "1.5"` is refused and told which setting would allow
it, and a shop without `OPEN_PRICE` cannot send `unitPriceOverride`.

Shifts open and close with a stored variance. Voiding keeps the sale row,
marks it `VOIDED`, and restocks through the ledger under a derived
idempotency key, so voiding twice cannot restock twice.

**Money is shown in shillings, never the viewer's currency.** Every other
page formats through `useLocalization`, which converts KES into whatever
the viewer picked. That is right for browsing and dangerous at a counter:
the cashier is holding shillings and counting change in shillings, and a
till reading "$6.77" while the customer hands over a thousand-shilling
note causes real losses. The till and the receipt format directly.

**M-Pesa is recorded, not verified.** Nothing here talks to Safaricom —
the cashier reads a code off the customer's phone. The payment sheet says
so, because implying the till confirmed the money is a lie with money
attached.

### The download — **installable, not native**

The till has its own manifest (`Saji Till`, `start_url: /provider/till`,
standalone) overriding the marketplace one for this route only, plus an
install card that handles Chrome/Edge/Android via `beforeinstallprompt`
and falls back to instructions on iOS. Installing gives a real icon that
opens the register in its own window with no browser chrome.

The service worker location took two goes and is worth recording:

- `/till-sw.js` would claim scope `/` and **replace the push worker**
  the notification settings card registers, breaking notifications
  app-wide.
- `/provider/till/sw.js` claims `/provider/till/`, which does **not**
  include `/provider/till` — no trailing slash. The page would be
  uncontrolled, an uncontrolled `start_url` is not installable, and the
  install offer would simply never appear with nothing to show why.
- `/provider/sw.js`, scope `/provider/`, is the one that works. Wider
  than the till, which is only acceptable because the worker does
  nothing.

It **caches nothing**, deliberately. A till serving a stale cached price
is worse than a till that will not load: the cashier charges yesterday's
price and nobody finds out until the stock count disagrees. The fetch
handler exists only because Chrome requires one before offering to
install. The card says plainly that a connection is still needed.

Tauri is not built. The PWA is the right first step — it installs on
Windows, Android and iOS today with no toolchain — and a native binary
earns its place when a real shop needs a receipt printer or a cash
drawer, which is Phase 6.

### Verified, this pass

- `60/60` the sale path, including everything it must refuse: a
  signed-out request, a fraction at a shop without `MEASURED`, a price
  override without `OPEN_PRICE`, another tenant's product, underpayment,
  an oversold line under `BLOCK`, a double void, and a cross-tenant void.
- `47/47` the portal, with real rows — closing the gap left open last
  pass. A `PENDING`-only account is no longer shown a plumber's portal; a
  POS-only account is not handed six storefront pages; a shop that
  predates POS keeps every one of them.
- `43/43` **in a real browser**, Chrome at 390px and 1280px: no
  horizontal overflow on any screen, no till control under 32px, the
  basket sheet and payment sheet open, a 2.25 kg sale rung up through
  the UI matched the server's stored total, change and ledger movement
  exactly, and the demo data was restored afterwards.
- `10/10` the install prerequisites: both service workers coexist, the
  till page is controlled by the provider one, and the manifest, scope
  and icons are right.

Two findings came from that browser pass rather than from reading the
code: a 28px remove button and a 19px cancel link, both below a usable
tap size, and a single-column catalogue that showed only six products at
390px. Fixed to 32px minimum and two columns.

**Not demonstrated:** that Chrome actually fires `beforeinstallprompt` —
automated Chrome does not raise it, so only the prerequisites are proven.
And the barcode index is still only shown to be *usable*, not *preferred*,
because the table holds too few rows for the planner to choose it.

### `scripts/seed-pos-demo.js`

Creates a POS-only account (`pos-demo@saji.test`, password generated per
run and printed once) with a
stocked butchery, supermarket or mitumba catalogue, opening stock written
as real ledger rows. `--revert` removes it. It refuses to touch an
account it did not create, and it checks its duplicated presets against
`lib/pos-profiles.ts` and warns if they have drifted — because a demo
configured differently from a real signup is the one thing a demo must
not be.

### Phase 7 — one stock figure, two channels — **done**

`checkout()`, order cancellation and shop returns now append through
`recordOrderMovements`. A till sale and a marketplace order come off the
same figure, and the history distinguishes them: `SALE` versus
`ORDER_FULFILMENT`, each naming what caused it.

**A separate function from the till's, for two reasons.** Checkout is
concurrent — two customers can buy the last unit in the same
millisecond, and the code being replaced used Prisma's atomic
`decrement` precisely so neither update is lost. The till's
read-balance-then-write is right at a counter and would have been a
lost-update bug in checkout. And checkout's transaction is already long;
`recordStockMovement` costs about five round trips per line, which this
project has hit transaction timeouts on before. The batched version is
four queries regardless of line count.

The price is `balanceAfter`, left null on order movements: the balance
after an atomic adjustment cannot be known without locking the row, and
locking inventory during checkout is a far worse trade than losing a
convenience column. The ledger SUM is the truth either way.

A shop with no till gets a stock history too. That is not a side effect
— "who took the twelve crates" is worth answering for a plain storefront
as much as for a counter.

### The concurrency bug the test found

Two checkouts at the same instant, for a product with no ledger yet,
each read "nothing here" and each wrote an **OPENING_BALANCE** row. The
projections stayed correct, because those move by atomic deltas — but
the ledger said 12 while the shelf said 2.

Deciding to seed is a read, and no amount of care in the surrounding
code fixes a read-then-write race. The opening row now carries a
deterministic idempotency key, `seed:opening:<productId>`, so the
existing unique index on `(shopkeeperId, idempotencyKey)` enforces "one
opening balance per product" in the database. `ON CONFLICT DO NOTHING`
makes the loser of the race a no-op. The till path had the same hazard
and got the same fix.

**This is invisible to any test that does one thing at a time.** It was
found only because the test runs two checkouts through `Promise.all`,
which is worth keeping in mind for every balance this system grows.

### Verified, this pass

- `30/30` the marketplace path: a no-till shop gaining a history, the
  opening row capturing what was already on the shelf, cancellation
  restocking with a reason, and the race above.
- `231` assertions green across all five suites after the change —
  nothing in the till regressed.
- `43/43` again in real Chrome, and `tsc` clean.

### Stock and Reports — **done**

`/provider/till/stock` is the screen the ledger was built for. Any system
can show a number; this one shows that the number is 22.75 because it was
20, 5.5 arrived on Friday, 1.5 spoiled overnight and a count found 1.25
short. The drill-in per product is the whole point.

Three things on it are deliberate:

**A stock count records the gap, it does not set the figure.** Setting a
number erases the discrepancy; recording the correction keeps both the
old figure and the size of the difference, which is the thing worth
looking at when it happens three weeks running.

**A loss needs a reason, and the server insists.** "Stock went down" with
no explanation is exactly the record this ledger exists to replace. The
WASTAGE trait is enforced server-side too, not merely hidden — a shop
that has not switched it on is refused and told which setting to turn on.

**Drift is surfaced rather than silently repaired.** `stockOnHand` is a
projection of the ledger; the page compares the two on read and says when
they disagree, because "the ledger is missing a movement" and "the cache
went stale" need completely different investigations and look identical
from the shop floor. The ledger, not the cache, is reported as the
figure.

`/provider/till/reports` gives takings, payment mix, day-by-day, best
sellers, margin and shift history. Two honesty rules: voided sales are
excluded from every figure and shown separately, and the margin states
what share of lines actually carry a cost price — a margin over 40% of
lines is not the shop's margin, and presenting it as one would be the
most misleading number on the page. With no costs recorded at all it
reads "Not known" rather than zero.

### Two bugs the browser found that the build did not

**A `"use server"` file may export only async functions.** `pos-reports.ts`
exported `REPORT_RANGES` as an array. `tsc --noEmit` passed. `next build`
passed. The page 500'd at request time with *"A 'use server' file can only
export async functions, found object"*. Moved to `lib/pos-reporting.ts`,
and a scan confirmed it was the only such export in the codebase. The
lesson is narrower than it sounds: **neither typecheck nor build catches
this**, so a `"use server"` module's exports need checking by eye or by
loading the page.

**"12 sellable on Saji" on a shop that is not on Saji.** The stock page
showed the floored integer beside the exact figure, which is useful for a
shop selling through both channels and meaningless for the counter-only
shops that are most POS accounts. Now gated on `listedOnMarketplace`.

Also: `<Card>` ships `flex flex-col gap-6 py-6`, so four summary tiles
filled half a 390px screen before any stock was visible. Compact tiles
are plain divs; `Card` is for things that want that padding.

### A guard against this recurring

The signup suite now asserts that **every till module offered to a POS
account points at a page that exists on disk**. Twice in this work a
module was added to the nav before or after its page, and both times the
only thing that caught it was a stale test failing for the wrong reason.
Now a dead nav link fails a test on its own terms.

### Verified

`286` assertions green across six suites, plus `21/21` in real Chrome
over the two new pages at 390px and 1280px — including recording a
delivery through the UI and confirming the database agreed, with the
demo data restored afterwards.

### Phase 4 — offline — **done, with its boundary stated**

Two different failures get called "offline" and only one is solved. Being
clear which matters more than the feature, because a shopkeeper who
believes the wrong one loses a morning.

**The line drops while the till is open.** Handled. The catalogue is
already local, sales queue, the cashier keeps serving. This is the
dominant failure in practice.

**The till is started cold with no connection.** *Not* handled. Loading
the page still needs the network, because serving the app shell from a
cache means eventually serving STALE CODE to a till — and stale code at
a till prices things wrong. The queue page says so in as many words, and
the browser test asserts that a cold offline reload *fails*, so that if
shell caching is ever added the test says so rather than quietly passing
on a claim that is no longer true.

What is guaranteed either way is the thing that matters: **a sale that
was rung up is never lost.** It sits in an IndexedDB outbox until the
server confirms it, surviving a reload, a crash and a flat battery.

Raw IndexedDB, no library: the surface used is small, and a dependency on
a counter machine is a thing that can fail to load.

**A queued sale is not a receipt.** It gets its own screen — amber, "Saved
on this device", the change still shown because the customer is standing
there, and no receipt number, because the server assigns those and
inventing one would collide with a real one later. It says plainly: do
not ring it up again.

**A refusal is not a failure to send,** and the two get opposite handling.
A thrown fetch means the server was never reached: stay pending, retry.
A returned `{ success: false }` means it was reached and said no: stop
retrying and show a person, because retrying forever would hide a sale
the shop believes it made. `/provider/till/queue` keeps those two in
separate lists, and discarding one requires confirming a sentence that
says what discarding means.

`navigator.onLine` is treated as a hint, never the answer. It reports
"online" for a machine on a router with no upstream and for a captive
portal — both ordinary in a Kenyan shopping centre. The authority is what
happened to the last actual request.

### A real race the offline test found

`markSending` read the entry in one transaction and wrote it back in
another. If the entry was dequeued in between — its send having just
succeeded — the later write **resurrected it**: a sale the server had
already accepted reappeared stuck in "sending" forever. `markFailed` and
`retrySale` had the same shape. All three now do their read and write in
one transaction and never re-create a row that is gone.

Worth recording honestly: fixing this did **not** make the failing
assertion pass. The assertion was reading the outbox once, immediately
after a drain, and catching a *subsequent* sync pass mid-flight — on a
dev server where a round trip is tens of seconds. The race was real and
worth fixing; it was not what the test was showing. Those are two
different findings and collapsing them would have left a genuine bug
in place.

### Verified

`26/26` in a real browser with the network genuinely cut via Playwright's
offline emulation — not route interception, which silently failed to
match the server-action POSTs and let an earlier version of this test
"pass" the offline step while the sale actually went through.

The sequence proven: ring up with the line cut, nothing reaches the
server, the sale is in the local outbox with its idempotency key; a cold
reload fails as documented; reconnect and it arrives **exactly once**,
with a receipt number, stock moved once, and `occurredAt` earlier than
`createdAt` as it must be for a sale that happened before the server
heard. Then the same sale is deliberately re-queued and replayed: no
second sale, no second stock movement, and the entry clears.

`286` assertions still green across the six server-side suites.
