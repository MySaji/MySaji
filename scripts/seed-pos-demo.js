#!/usr/bin/env node
/**
 * Creates a POS-only Saji Pro account with a stocked catalogue, so the till
 * can actually be used rather than only read about.
 *
 * Why this is needed: /provider/till shows nothing without a signed-in
 * account that holds the POS capability, has a ShopkeeperProfile with
 * posEnabled, and has priced products with stock. That is four preconditions,
 * none of which exist in this database, so the feature is unreachable by
 * clicking.
 *
 * What it makes, by default a butchery because that profile exercises the two
 * traits that are actually implemented (MEASURED and WASTAGE):
 *
 *   - a PROVIDER user with a known password
 *   - ONE ProCapability row, POS, ACTIVE
 *   - a ShopkeeperProfile with listedOnMarketplace FALSE, which is the whole
 *     point of a POS-only account: a counter, not a storefront
 *   - eight products with barcodes, cost prices, units and opening stock
 *
 * Everything it creates is tagged with a marker in the email address, and
 * --revert deletes exactly those rows and nothing else. It never touches a
 * real account: it refuses to run if the email already belongs to a user it
 * did not create.
 *
 * NOT FOR PRODUCTION, and THE PASSWORD IS NOT IN THIS FILE.
 *
 * It used to be, and that was wrong: a literal password in a script in
 * version control is a working login for every database the script has ever
 * been run against, readable by anyone who can read the repo. Deleting the
 * account afterwards does not help, because the string stays in the history.
 *
 * So a fresh random password is generated on each run and printed once.
 * Nothing persists it. If you lose it, run --revert and seed again, which is
 * cheap by design. Set POS_DEMO_PASSWORD in the environment to choose your
 * own — useful for a repeatable local loop, and still not committed.
 *
 * The account is POS-only and never listed on the marketplace, so customers
 * cannot see it, but that limits the blast radius rather than making it
 * safe. Remove it with --revert when you are done.
 *
 *   node scripts/seed-pos-demo.js                     # butchery
 *   node scripts/seed-pos-demo.js --profile CLOTHES     # exercises VARIANTS
 *   node scripts/seed-pos-demo.js --profile PHARMACY    # exercises BATCH_EXPIRY
 *   node scripts/seed-pos-demo.js --profile PHONES      # exercises SERIALISED + FITMENT
 *   node scripts/seed-pos-demo.js --profile SUPERMARKET
 *   node scripts/seed-pos-demo.js --profile MITUMBA    # exercises OPEN_PRICE
 *   node scripts/seed-pos-demo.js --revert             # remove it again
 */

require("dotenv").config()

const bcrypt = require("bcryptjs")
const { PrismaClient } = require("@prisma/client")

// Session-mode connection: this runs alongside the dev server, and the pooled
// URL has a connection_limit of 5 that the two together can exhaust.
const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } })

const REVERT = process.argv.includes("--revert")
const profileArg = (() => {
  const i = process.argv.indexOf("--profile")
  return i !== -1 ? (process.argv[i + 1] || "").toUpperCase() : "BUTCHERY"
})()

/** The marker. Every row this script owns is reachable from this address. */
const EMAIL = "pos-demo@saji.test"

/**
 * Generated per run, never stored, never committed.
 *
 * crypto.randomBytes rather than Math.random: this is a real login against a
 * real database, and the fact that it is "only a demo" is exactly the
 * reasoning that puts weak credentials into production.
 */
const PASSWORD =
  process.env.POS_DEMO_PASSWORD ||
  "Pos-" + require("crypto").randomBytes(9).toString("base64url")

/**
 * Presets, duplicated from lib/pos-profiles.ts rather than imported.
 *
 * A plain node script cannot import a TS module, and adding a build step for
 * a demo seeder is not worth it. The cost is that this list can drift from
 * the registry — so it is checked below, and the script says so if the traits
 * it writes are not the ones the registry would have chosen.
 */
const PROFILES = {
  BUTCHERY: {
    label: "Butchery",
    traits: ["MEASURED", "BATCH_EXPIRY", "WASTAGE"],
    unit: "kg",
    shopName: "Mwangi Choice Butchery",
    products: [
      { name: "Minced Beef", price: 650, cost: 480, unit: "kg", stock: "24.5", barcode: null },
      { name: "Beef Steak", price: 780, cost: 600, unit: "kg", stock: "12.25", barcode: null },
      { name: "Goat Meat", price: 820, cost: 640, unit: "kg", stock: "8.75", barcode: null },
      { name: "Beef Sausages", price: 420, cost: 310, unit: "kg", stock: "6", barcode: "6161100340018" },
      { name: "Chicken, whole", price: 560, cost: 430, unit: "piece", stock: "15", barcode: "6161100340025" },
      { name: "Matumbo", price: 380, cost: 280, unit: "kg", stock: "9.5", barcode: null },
      { name: "Boneless Fillet", price: 950, cost: 740, unit: "kg", stock: "4.2", barcode: null },
      { name: "Cooking Fat 500g", price: 180, cost: 140, unit: "piece", stock: "22", barcode: "6161100340032" },
    ],
  },
  SUPERMARKET: {
    label: "Supermarket",
    traits: ["MEASURED", "VARIANTS", "BATCH_EXPIRY", "AGE_RESTRICTED", "WASTAGE"],
    unit: "piece",
    shopName: "Jirani Mini Supermarket",
    products: [
      { name: "Unga wa Dola 2kg", price: 215, cost: 188, unit: "piece", stock: "60", barcode: "6161101510010" },
      { name: "Sugar, loose", price: 165, cost: 142, unit: "kg", stock: "48.5", barcode: null },
      { name: "Cooking Oil 1L", price: 340, cost: 295, unit: "piece", stock: "36", barcode: "6161101510027" },
      { name: "Milk 500ml", price: 60, cost: 52, unit: "piece", stock: "80", barcode: "6161101510034" },
      { name: "Bread, white", price: 70, cost: 58, unit: "piece", stock: "25", barcode: "6161101510041" },
      { name: "Rice, Pishori", price: 210, cost: 180, unit: "kg", stock: "34.75", barcode: null },
      { name: "Omo 1kg", price: 290, cost: 248, unit: "piece", stock: "18", barcode: "6161101510058" },
      { name: "Eggs, tray of 30", price: 540, cost: 470, unit: "piece", stock: "12", barcode: null },
    ],
  },
  CLOTHES: {
    label: "Clothes & fashion",
    traits: ["VARIANTS"],
    unit: "piece",
    shopName: "Rehema Fashion House",
    // Every product here has sizes, which is the point of this profile:
    // VARIANTS is the trait 23 of the 35 shop types want, and a clothes
    // shop is the shortest path to seeing it work.
    products: [
      { name: "Mens Shirt", price: 1200, cost: 700, unit: "piece", stock: "0", barcode: null,
        variants: [
          { label: "S", stock: "4", barcode: "6161102110011" },
          { label: "M", stock: "9", barcode: "6161102110028" },
          { label: "L", stock: "6", barcode: "6161102110035" },
          { label: "XL", stock: "2", barcode: "6161102110042" },
        ] },
      { name: "Ladies Dress", price: 2200, cost: 1300, unit: "piece", stock: "0", barcode: null,
        variants: [
          { label: "S / Blue", stock: "3", barcode: null },
          { label: "M / Blue", stock: "5", barcode: null },
          { label: "M / Red", stock: "4", barcode: null },
          { label: "L / Red", stock: "1", barcode: null },
        ] },
      { name: "Jeans", price: 1800, cost: 1050, unit: "piece", stock: "0", barcode: null,
        variants: [
          { label: "30", stock: "3", barcode: null },
          { label: "32", stock: "7", barcode: null },
          { label: "34", stock: "5", barcode: null },
          { label: "36", stock: "0", barcode: null },
        ] },
      { name: "School Sweater", price: 950, cost: 560, unit: "piece", stock: "0", barcode: null,
        variants: [
          { label: "Age 6", stock: "8", barcode: null },
          { label: "Age 10", stock: "6", barcode: null },
          { label: "Age 14", stock: "4", barcode: null },
        ] },
      // Deliberately plain: a clothes shop still sells things that have no
      // sizes, and the till must handle both side by side.
      { name: "Leather Belt", price: 800, cost: 430, unit: "piece", stock: "14", barcode: "6161102110059" },
      { name: "Socks, pair", price: 250, cost: 120, unit: "pair", stock: "40", barcode: "6161102110066" },
    ],
  },
  PHARMACY: {
    label: "Pharmacy",
    traits: ["BATCH_EXPIRY", "AGE_RESTRICTED", "CONTROLLED", "WASTAGE"],
    unit: "piece",
    shopName: "Afya Bora Chemist",
    // Every product here is tracked by delivery, which is the point: the
    // till sells soonest-to-expire first and refuses expired stock, and a
    // pharmacy is where that matters rather than being tidy.
    products: [
      { name: "Amoxicillin 500mg", price: 350, cost: 210, unit: "piece", stock: "0", barcode: "6161103110015",
        batches: [
          { number: "AMX-2301", days: 18, qty: "12" },
          { number: "AMX-2404", days: 420, qty: "60" },
        ] },
      { name: "Paracetamol 500mg", price: 60, cost: 32, unit: "piece", stock: "0", barcode: "6161103110022",
        batches: [
          { number: "PCM-2210", days: -12, qty: "20" },
          { number: "PCM-2405", days: 300, qty: "150" },
        ] },
      { name: "ORS Sachets", price: 45, cost: 22, unit: "piece", stock: "0", barcode: null,
        batches: [{ number: "ORS-88", days: 75, qty: "90" }] },
      { name: "Cough Syrup 100ml", price: 480, cost: 300, unit: "piece", stock: "0", barcode: null,
        batches: [
          { number: "CS-04", days: 25, qty: "8" },
          { number: "CS-07", days: 200, qty: "24" },
        ] },
      { name: "Surgical Gloves", price: 25, cost: 12, unit: "pair", stock: "0", barcode: null,
        batches: [{ number: "GL-19", days: null, qty: "300" }] },
      // No batches: a chemist still sells things that never go off and
      // nobody tracks by delivery.
      { name: "Hot Water Bottle", price: 950, cost: 560, unit: "piece", stock: "7", barcode: null },
    ],
  },
  PHONES: {
    label: "Phones & accessories",
    traits: ["VARIANTS", "SERIALISED", "FITMENT"],
    unit: "piece",
    shopName: "Luthuli Phone Centre",
    // Handsets are tracked unit by unit; accessories are not. A phone shop
    // is exactly where both shapes sit side by side on one counter.
    products: [
      { name: "Tecno Spark 10", price: 16500, cost: 13200, unit: "piece", stock: "0", barcode: null,
        serials: ["350111222333001", "350111222333002", "350111222333003"] },
      { name: "Samsung A05", price: 19800, cost: 15900, unit: "piece", stock: "0", barcode: null,
        serials: ["350111222444001", "350111222444002"] },
      { name: "USB-C Cable 1m", price: 400, cost: 180, unit: "piece", stock: "45", barcode: "6161104110019",
        fitsWith: ["Tecno Spark 10", "Samsung A05", "USB-C"] },
      { name: "Screen Protector", price: 250, cost: 90, unit: "piece", stock: "60", barcode: null,
        fitsWith: ["Tecno Spark 10"] },
      { name: "Charger 20W", price: 1200, cost: 700, unit: "piece", stock: "18", barcode: "6161104110026",
        fitsWith: ["USB-C"] },
      { name: "Earphones", price: 650, cost: 300, unit: "piece", stock: "24", barcode: null },
    ],
  },
  MITUMBA: {
    label: "Mitumba / second-hand",
    traits: ["VARIANTS", "BULK_BREAK", "OPEN_PRICE"],
    unit: "piece",
    shopName: "Gikomba Finest Mitumba",
    products: [
      { name: "Shirt, assorted", price: 350, cost: 180, unit: "piece", stock: "90", barcode: null },
      { name: "Jeans, assorted", price: 650, cost: 320, unit: "piece", stock: "55", barcode: null },
      { name: "Dress, assorted", price: 550, cost: 260, unit: "piece", stock: "48", barcode: null },
      { name: "Jacket, heavy", price: 1200, cost: 600, unit: "piece", stock: "20", barcode: null },
      { name: "T-shirt, assorted", price: 250, cost: 110, unit: "piece", stock: "120", barcode: null },
      { name: "Sweater, assorted", price: 450, cost: 220, unit: "piece", stock: "40", barcode: null },
      { name: "Bedsheet set", price: 900, cost: 480, unit: "piece", stock: "16", barcode: null },
      { name: "Shoes, assorted", price: 800, cost: 400, unit: "pair", stock: "35", barcode: null },
    ],
  },
}

/**
 * Does the duplicated preset above still match lib/pos-profiles.ts?
 *
 * Read out of the source as text, because a node script cannot import the TS
 * module. A mismatch is a warning rather than a failure — the demo is still
 * usable — but an unreported mismatch would mean this script quietly seeds a
 * shop configured differently from one a real signup would produce, which is
 * the one thing a demo must not do.
 */
function checkPresetDrift(key, traits) {
  const fs = require("fs")
  const path = require("path")
  let src
  try {
    src = fs.readFileSync(path.join(__dirname, "..", "lib", "pos-profiles.ts"), "utf8")
  } catch {
    console.warn("  note: could not read lib/pos-profiles.ts to check this preset against the registry.")
    return
  }
  // Scanned with plain string operations rather than a regex. A regex built
  // from a template string here has to survive two levels of escaping, and
  // getting that wrong fails silently in the worst way: the check passes
  // because it matched nothing.
  const at = src.indexOf(`key: "${key}"`)
  const traitsAt = at === -1 ? -1 : src.indexOf("traits: [", at)
  const close = traitsAt === -1 ? -1 : src.indexOf("]", traitsAt)
  if (at === -1 || traitsAt === -1 || close === -1 || traitsAt - at > 400) {
    console.warn(`  note: ${key} is not in lib/pos-profiles.ts any more — this preset may be stale.`)
    return
  }
  const registry = src
    .slice(traitsAt + "traits: [".length, close)
    .split(",")
    .map((t) => t.trim().replace(/['"]/g, ""))
    .filter(Boolean)
    .sort()
  const mine = [...traits].sort()
  if (registry.join(",") !== mine.join(",")) {
    console.warn("")
    console.warn(`  WARNING: this script's ${key} preset has drifted from lib/pos-profiles.ts.`)
    console.warn(`    registry: ${registry.join(", ")}`)
    console.warn(`    seeded:   ${mine.join(", ")}`)
    console.warn("  A real signup would configure this shop differently. Update PROFILES above.")
    console.warn("")
  }
}

async function revert() {
  const user = await db.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, shopkeeperProfile: { select: { id: true } } },
  })
  if (!user) {
    console.log("Nothing to revert — no demo POS account exists.")
    return
  }
  const shopId = user.shopkeeperProfile?.id

  if (shopId) {
    // Order matters: movements and sale lines reference products, so they go
    // first. Deleting the user would cascade most of this, but doing it
    // explicitly means the counts below are a real check rather than a hope.
    const products = await db.product.findMany({ where: { shopkeeperId: shopId }, select: { id: true } })
    const productIds = products.map((p) => p.id)
    const counts = {
      movements: (await db.stockMovement.deleteMany({ where: { shopkeeperId: shopId } })).count,
      sales: (await db.posSale.deleteMany({ where: { shopkeeperId: shopId } })).count,
      shifts: (await db.tillSession.deleteMany({ where: { shopkeeperId: shopId } })).count,
      cashiers: (await db.posCashier.deleteMany({ where: { shopkeeperId: shopId } })).count,
      devices: (await db.posDevice.deleteMany({ where: { shopkeeperId: shopId } })).count,
      // Before the products: deleting a product cascades its variants, but
      // doing it explicitly means the count below is a real check rather
      // than an assumption about the cascade.
      serials: (await db.productSerial.deleteMany({ where: { shopkeeperId: shopId } })).count,
      batches: (await db.productBatch.deleteMany({ where: { shopkeeperId: shopId } })).count,
      variants: (await db.productVariant.deleteMany({ where: { shopkeeperId: shopId } })).count,
      inventory: (await db.inventory.deleteMany({ where: { productId: { in: productIds } } })).count,
      products: (await db.product.deleteMany({ where: { id: { in: productIds } } })).count,
    }
    console.log("Removed:", counts)
  }

  await db.user.delete({ where: { id: user.id } })
  console.log(`Removed the demo POS account (${EMAIL}).`)
}

async function seed() {
  const preset = PROFILES[profileArg]
  if (!preset) {
    console.error(`Unknown --profile "${profileArg}". Choose one of: ${Object.keys(PROFILES).join(", ")}`)
    process.exitCode = 1
    return
  }

  // Refuse to touch an account this script did not create. The email is
  // reserved for the demo, but a human may have registered it by hand and
  // overwriting somebody's login is not a thing a seed script gets to do.
  const existing = await db.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, createdAt: true, shopkeeperProfile: { select: { id: true, posEnabled: true } } },
  })
  if (existing && !existing.shopkeeperProfile?.posEnabled) {
    console.error(
      `${EMAIL} already exists but does not look like this script's demo account ` +
      `(no POS-enabled shop). Refusing to modify it. Delete it by hand if that is what you want.`,
    )
    process.exitCode = 1
    return
  }
  if (existing) {
    console.log("A demo POS account already exists; replacing it.")
    await revert()
  }

  checkPresetDrift(profileArg, preset.traits)

  const password = await bcrypt.hash(PASSWORD, 12)

  const user = await db.user.create({
    data: {
      name: "POS Demo",
      email: EMAIL,
      password,
      phone: null,
      role: "PROVIDER",
      // ACTIVE straight away, matching registerUser: a business type chosen
      // at signup is not a request for staff to approve.
      proCapabilities: { create: [{ type: "POS", status: "ACTIVE" }] },
      providerProfile: { create: {} },
    },
    select: { id: true, name: true },
  })

  const shop = await db.shopkeeperProfile.create({
    data: {
      userId: user.id,
      shopName: preset.shopName,
      shopDescription: "Demo shop for trying the Saji till.",
      // The defining fact about a POS-only account.
      listedOnMarketplace: false,
      posEnabled: true,
      posProfileKey: profileArg,
      posTraits: preset.traits,
      posConfig: {
        negativeStock: "WARN",
        cashRounding: 0,
        defaultUnit: preset.unit,
        requirePinPerSale: false,
        managerPinToVoid: true,
        taxRate: 0,
        taxInclusive: true,
        receiptHeader: preset.shopName.toUpperCase(),
        receiptFooter: "Asante! Goods once sold are not returnable.",
      },
      posActivatedAt: new Date(),
      isVerified: true,
    },
    select: { id: true },
  })

  let made = 0
  for (const p of preset.products) {
    const product = await db.product.create({
      data: {
        shopkeeperId: shop.id,
        name: p.name,
        description: `${p.name} — demo stock for the Saji till.`,
        sku: p.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 28),
        barcode: p.barcode,
        price: p.price,
        costPrice: p.cost,
        unit: p.unit,
        isActive: true,
        fitsWith: p.fitsWith || [],
        // A POS-only shop is not listed, so publishing is meaningless here.
        // Left null deliberately: null means "never went live", which is
        // exactly right for a product that only ever sells across a counter.
        publishedAt: null,
      },
      select: { id: true },
    })

    // Units tracked individually. The serial count IS the stock, which is
    // the invariant the register exists to hold.
    if (p.serials && p.serials.length > 0) {
      await db.product.update({ where: { id: product.id }, data: { tracksSerials: true } })
      for (const serial of p.serials) {
        await db.productSerial.create({
          data: { productId: product.id, shopkeeperId: shop.id, serial, costPrice: p.cost },
        })
      }
      const n = p.serials.length
      await db.inventory.upsert({
        where: { productId: product.id },
        update: { stockOnHand: String(n), currentStock: n },
        create: { productId: product.id, stockOnHand: String(n), currentStock: n, lowStockThreshold: 5, reorderLevel: 10 },
      })
      await db.stockMovement.create({
        data: {
          shopkeeperId: shop.id, productId: product.id, kind: "OPENING_BALANCE",
          quantity: String(n), unit: p.unit, unitCost: p.cost, balanceAfter: String(n),
          reason: "Opening stock, seeded for the demo",
          idempotencyKey: "seed:opening:" + product.id, occurredAt: new Date(),
        },
      })
      made++
      continue
    }

    // Deliveries, where this product is tracked by them. Each batch carries
    // its own opening stock as a real ledger row, and the product figure is
    // the sum — the same invariant lib/pos-ledger.ts maintains.
    if (p.batches && p.batches.length > 0) {
      await db.product.update({ where: { id: product.id }, data: { tracksBatches: true } })
      let total = 0
      for (const b of p.batches) {
        const expiry = b.days === null || b.days === undefined
          ? null
          : new Date(Date.now() + b.days * 24 * 60 * 60 * 1000)
        const batch = await db.productBatch.create({
          data: {
            productId: product.id,
            shopkeeperId: shop.id,
            batchNumber: b.number,
            expiryDate: expiry,
            costPrice: p.cost,
            stockOnHand: b.qty,
            currentStock: Math.max(0, Math.floor(Number(b.qty))),
          },
          select: { id: true },
        })
        await db.stockMovement.create({
          data: {
            shopkeeperId: shop.id, productId: product.id, batchId: batch.id,
            kind: "OPENING_BALANCE", quantity: b.qty, unit: p.unit, unitCost: p.cost,
            balanceAfter: b.qty, reason: "Opening stock, seeded for the demo",
            idempotencyKey: "seed:opening:" + batch.id, occurredAt: new Date(),
          },
        })
        total += Number(b.qty)
      }
      await db.inventory.upsert({
        where: { productId: product.id },
        update: { stockOnHand: String(total), currentStock: Math.max(0, Math.floor(total)) },
        create: {
          productId: product.id, stockOnHand: String(total),
          currentStock: Math.max(0, Math.floor(total)), lowStockThreshold: 5, reorderLevel: 10,
        },
      })
      made++
      continue
    }

    // Sizes, where this product has them. Each one carries its own opening
    // stock as a real ledger row, exactly as a product's does — so a size's
    // figure is explainable from day one.
    if (p.variants && p.variants.length > 0) {
      await db.product.update({ where: { id: product.id }, data: { hasVariants: true } })
      let total = 0
      for (const [position, v] of p.variants.entries()) {
        const variant = await db.productVariant.create({
          data: {
            productId: product.id,
            shopkeeperId: shop.id,
            label: v.label,
            sku: (p.name + "-" + v.label).toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 36),
            barcode: v.barcode ?? null,
            position,
            stockOnHand: v.stock,
            currentStock: Math.max(0, Math.floor(Number(v.stock))),
          },
          select: { id: true },
        })
        if (Number(v.stock) !== 0) {
          await db.stockMovement.create({
            data: {
              shopkeeperId: shop.id, productId: product.id, variantId: variant.id,
              kind: "OPENING_BALANCE", quantity: v.stock, unit: p.unit, unitCost: p.cost,
              balanceAfter: v.stock, reason: "Opening stock, seeded for the demo",
              idempotencyKey: "seed:opening:" + variant.id, occurredAt: new Date(),
            },
          })
        }
        total += Number(v.stock)
      }
      // The product-level figure is the sum of its sizes, the same invariant
      // lib/pos-ledger.ts maintains on every write.
      //
      // upsert, not update: this branch returns before the Inventory row is
      // created further down, so there is nothing to update on a first run.
      await db.inventory.upsert({
        where: { productId: product.id },
        update: { stockOnHand: String(total), currentStock: Math.max(0, Math.floor(total)) },
        create: {
          productId: product.id,
          stockOnHand: String(total),
          currentStock: Math.max(0, Math.floor(total)),
          lowStockThreshold: 5,
          reorderLevel: 10,
        },
      })
      made++
      continue
    }

    // Opening stock goes in as a LEDGER ROW, not as a bare number, so the
    // demo shop's figures are explainable from the first day exactly as a
    // real shop's would be. stockOnHand carries the fraction; currentStock
    // is floor() of it, which is what lib/pos-ledger.ts maintains.
    const onHand = p.stock
    await db.inventory.create({
      data: {
        productId: product.id,
        stockOnHand: onHand,
        currentStock: Math.max(0, Math.floor(Number(onHand))),
        lowStockThreshold: 5,
        reorderLevel: 10,
      },
    })
    await db.stockMovement.create({
      data: {
        shopkeeperId: shop.id,
        productId: product.id,
        kind: "OPENING_BALANCE",
        quantity: onHand,
        unit: p.unit,
        unitCost: p.cost,
        balanceAfter: onHand,
        reason: "Opening stock, seeded for the demo",
        occurredAt: new Date(),
      },
    })
    made++
  }

  console.log("")
  console.log("  This password is shown ONCE and is stored nowhere. Copy it now.")
  console.log("  Remove the account with --revert when you have finished testing.")
  console.log("")
  console.log(`  ${preset.shopName}  (${preset.label})`)
  console.log(`  ${made} products, each with opening stock in the ledger`)
  console.log(`  Traits on: ${preset.traits.join(", ")}`)
  console.log("")
  console.log(`  Sign in at  /auth/login`)
  console.log(`    email     ${EMAIL}`)
  console.log(`    password  ${PASSWORD}`)
  console.log(`  Then open   /provider/till`)
  console.log("")
  console.log("  Undo with:  node scripts/seed-pos-demo.js --revert")
  console.log("")
}

;(REVERT ? revert() : seed())
  .catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
