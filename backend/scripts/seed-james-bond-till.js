/**
 * The James Bond Till: a demo shop with working M-Pesa.
 *
 * WHAT THIS IS FOR
 *
 * Trying the prompt flow end to end needs Daraja credentials, and a
 * shopkeeper signing up for the first time has none. This points one demo
 * shop at the platform's own sandbox credentials, already in .env, so the
 * prompt path can be exercised without anyone registering with Safaricom.
 *
 * WHY IT IS NOT THE DEFAULT FOR EVERY SHOP
 *
 * Money settles into whichever shortcode signed the request. Lending this
 * shortcode to a real shop would send their takings to the platform's
 * account, so this is one named demo shop and nothing else, and it refuses
 * to run against production credentials.
 *
 *   node backend/scripts/seed-james-bond-till.js
 *   node backend/scripts/seed-james-bond-till.js --revert
 *
 * The password is generated fresh on each run and printed once. It is not
 * in this file and is stored nowhere.
 */
require("dotenv").config()
const crypto = require("crypto")
const bcrypt = require("bcryptjs")
const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } })

const REVERT = process.argv.includes("--revert")
const EMAIL = "james.bond@saji.test"
const SHOP = "James Bond Till"
const PASSWORD = process.env.JAMES_BOND_PASSWORD || "JB-" + crypto.randomBytes(9).toString("base64url")

// Same scheme as backend/services/payment-method-crypto.ts. Duplicated rather
// than imported because that is TypeScript behind a path alias and this is a
// plain node script; the format is fixed and tested there.
function encrypt(plain) {
  const raw = process.env.PAYMENT_METHOD_ENCRYPTION_KEY
  if (!raw) return null
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) return null
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")
}

async function main() {
  const existing = await db.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, shopkeeperProfile: { select: { id: true } } },
  })

  if (REVERT) {
    if (!existing) { console.log("Nothing to remove."); return }
    const sid = existing.shopkeeperProfile?.id
    if (sid) {
      await db.posPayment.deleteMany({ where: { sale: { shopkeeperId: sid } } }).catch(() => {})
      await db.posSaleItem.deleteMany({ where: { sale: { shopkeeperId: sid } } })
      await db.posSale.deleteMany({ where: { shopkeeperId: sid } })
      await db.tillSession.deleteMany({ where: { shopkeeperId: sid } })
      await db.posCashier.deleteMany({ where: { shopkeeperId: sid } })
      await db.posDevice.deleteMany({ where: { shopkeeperId: sid } })
      await db.stockMovement.deleteMany({ where: { shopkeeperId: sid } })
      const prods = await db.product.findMany({ where: { shopkeeperId: sid }, select: { id: true } })
      await db.productSerial.deleteMany({ where: { shopkeeperId: sid } }).catch(() => {})
      await db.productBatch.deleteMany({ where: { shopkeeperId: sid } }).catch(() => {})
      await db.productVariant.deleteMany({ where: { shopkeeperId: sid } }).catch(() => {})
      await db.inventory.deleteMany({ where: { productId: { in: prods.map((p) => p.id) } } })
      await db.product.deleteMany({ where: { shopkeeperId: sid } })
      await db.shopkeeperProfile.delete({ where: { id: sid } })
    }
    await db.proCapability.deleteMany({ where: { userId: existing.id } }).catch(() => {})
    await db.providerProfile.deleteMany({ where: { userId: existing.id } }).catch(() => {})
    await db.user.delete({ where: { id: existing.id } })
    console.log("Removed " + EMAIL + " and its shop.")
    return
  }

  if (!process.env.PAYMENT_METHOD_ENCRYPTION_KEY) {
    console.error("PAYMENT_METHOD_ENCRYPTION_KEY is not set. Credentials cannot be stored securely.")
    process.exitCode = 1
    return
  }

  // Refuse to hand a demo shop live credentials. The prompt would move real
  // money into the platform's shortcode.
  const env = (process.env.MPESA_ENV || "sandbox").toLowerCase()
  if (env === "production" || env === "live") {
    console.error("MPESA_ENV is production. This script only seeds sandbox credentials.")
    process.exitCode = 1
    return
  }

  const ck = process.env.MPESA_CONSUMER_KEY
  const cs = process.env.MPESA_CONSUMER_SECRET
  const pk = process.env.MPESA_PASSKEY
  const shortcode = process.env.MPESA_SHORTCODE
  if (!ck || !cs || !pk || !shortcode) {
    console.error("M-Pesa credentials are incomplete in .env. Nothing seeded.")
    process.exitCode = 1
    return
  }

  const mpesa = {
    mpesaShortcode: shortcode,
    mpesaShortcodeType: "PAYBILL",
    mpesaAccountRef: "JAMESBOND",
    mpesaPromptEnabled: true,
    mpesaConsumerKey: encrypt(ck),
    mpesaConsumerSecret: encrypt(cs),
    mpesaPasskey: encrypt(pk),
    mpesaEnv: "sandbox",
  }

  const posConfig = {
    negativeStock: "WARN", expiredStock: "BLOCK", expiryWarningDays: 30, defaultUnit: "piece",
    taxRate: 0, taxInclusive: true, cashRounding: 0,
    requirePinPerSale: false, managerPinToVoid: true,
    receiptHeader: SHOP, receiptFooter: "Shaken, not stirred.",
  }

  let userId = existing?.id
  if (!userId) {
    const u = await db.user.create({
      data: {
        name: "James Bond", email: EMAIL, phone: "+254700007007",
        password: await bcrypt.hash(PASSWORD, 12),
        role: "PROVIDER", isActive: true,
        verificationStatus: "VERIFIED", kycStatus: "APPROVED",
        providerProfile: { create: {} },
      },
    })
    userId = u.id
  } else {
    await db.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(PASSWORD, 12) } })
  }

  const shop = await db.shopkeeperProfile.upsert({
    where: { userId },
    update: { shopName: SHOP, posEnabled: true, posProfileKey: "SUPERMARKET", posConfig, ...mpesa },
    create: {
      userId, shopName: SHOP, posEnabled: true, listedOnMarketplace: false,
      posProfileKey: "SUPERMARKET",
      posTraits: ["MEASURED", "VARIANTS", "BATCH_EXPIRY", "AGE_RESTRICTED", "WASTAGE"],
      posConfig, posActivatedAt: new Date(), ...mpesa,
    },
  })

  // A few things to ring up, so the prompt can be tried against a real total.
  const items = [
    { name: "Martini Mix 750ml", sku: "JB-MART", price: 1200, barcode: "5000000000017" },
    { name: "Walther Soap 100g", sku: "JB-SOAP", price: 150, barcode: "5000000000024" },
    { name: "Tuxedo Shoe Polish", sku: "JB-POL", price: 320, barcode: "5000000000031" },
  ]
  for (const it of items) {
    const existingP = await db.product.findFirst({ where: { shopkeeperId: shop.id, sku: it.sku }, select: { id: true } })
    if (existingP) continue
    await db.product.create({
      data: {
        shopkeeperId: shop.id, name: it.name, description: "Demo stock for the James Bond Till.",
        sku: it.sku, barcode: it.barcode, price: it.price, unit: "piece", isActive: true,
        inventory: { create: { currentStock: 50 } },
      },
    })
  }

  console.log("")
  console.log("  James Bond Till is ready.")
  console.log("")
  console.log("    email     " + EMAIL)
  console.log("    password  " + PASSWORD)
  console.log("")
  console.log("  This password is shown ONCE and is stored nowhere. Copy it now.")
  console.log("  M-Pesa prompts are wired to the SANDBOX shortcode " + shortcode + ".")
  console.log("  Sandbox prompts move no real money.")
  console.log("")
  console.log("  Remove it again with: node backend/scripts/seed-james-bond-till.js --revert")
  console.log("")
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())
