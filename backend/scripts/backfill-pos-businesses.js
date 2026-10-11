/**
 * Give every existing POS shop a business and a store.
 *
 * The POS was first built with ShopkeeperProfile as its only tenant. The
 * business layer added above it is useless to a shop that predates it, so
 * this walks the shops that already have a till switched on and gives each
 * one a PosBusiness, a PosStore wrapping it, and an OWNER seat.
 *
 * Idempotent: a shop that already has a store is skipped, so this can be run
 * after every deploy without thinking about it.
 *
 *   node backend/scripts/backfill-pos-businesses.js --dry-run
 *   node backend/scripts/backfill-pos-businesses.js
 */
require("dotenv").config()
const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } })
const DRY = process.argv.includes("--dry-run")

async function main() {
  const shops = await db.shopkeeperProfile.findMany({
    where: { posEnabled: true },
    select: {
      id: true, userId: true, shopName: true, posProfileKey: true, kraPin: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
      posStore: { select: { id: true } },
    },
  })

  const todo = shops.filter((s) => !s.posStore)
  console.log(shops.length + " shops with a till, " + todo.length + " without a business yet.")
  if (todo.length === 0) return

  let made = 0
  let skipped = 0

  for (const shop of todo) {
    // One business per owner. A second shop on the same account joins the
    // business it already has rather than starting a rival one.
    const existing = await db.posBusiness.findUnique({
      where: { ownerUserId: shop.userId },
      select: { id: true },
    })

    if (DRY) {
      console.log("  would " + (existing ? "attach to existing business" : "create business") + ": " + shop.shopName)
      made++
      continue
    }

    try {
      await db.$transaction(async (tx) => {
        const business =
          existing ??
          (await tx.posBusiness.create({
            data: {
              ownerUserId: shop.userId,
              name: shop.shopName,
              profileKey: shop.posProfileKey || "GENERAL",
              taxPin: shop.kraPin,
              // These shops are already trading, so their setup is finished
              // by definition. Sending them into a wizard would be absurd.
              setupCompletedAt: new Date(),
            },
            select: { id: true },
          }))

        await tx.posStore.create({
          data: {
            businessId: business.id,
            shopkeeperId: shop.id,
            name: shop.shopName,
          },
        })

        // The owner's own seat, so they appear in the staff list like
        // everyone else rather than being an invisible special case.
        const seat = await tx.posStaff.findFirst({
          where: { businessId: business.id, userId: shop.userId },
          select: { id: true },
        })
        if (!seat) {
          await tx.posStaff.create({
            data: {
              businessId: business.id,
              userId: shop.userId,
              name: shop.user.name || "Owner",
              role: "OWNER",
              email: shop.user.email,
              phone: shop.user.phone,
            },
          })
        }
      }, { timeout: 30000 })
      made++
      console.log("  " + shop.shopName)
    } catch (e) {
      skipped++
      console.error("  SKIPPED " + shop.shopName + ": " + e.message.split("\n")[0])
    }
  }

  console.log("")
  console.log(DRY ? "Dry run. Nothing written." : made + " done, " + skipped + " skipped.")
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())
