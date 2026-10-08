#!/usr/bin/env node
/**
 * Puts two providers online and opens two shops, so the customer home
 * page's "Near you" rows have something to show.
 *
 * Why this is needed: that section deliberately hides anyone offline and
 * anything closed, and in this database every provider's online flag was
 * last touched in August. Nothing renders until something is genuinely
 * available, which is correct but makes the feature impossible to look at.
 *
 * IMPORTANT — presence expires. A provider counts as online only while
 * their device keeps checking in (five minutes, see
 * lib/provider-presence.ts). This script writes one check-in, so the two
 * providers drop off about five minutes later. That is the mechanism
 * working, not a bug. Use --watch to keep beating for them while you look
 * at the page.
 *
 * Original opening hours are saved to scripts/.demo-presence-backup.json
 * and restored exactly by --revert, so a shop's real trading hours are
 * never guessed at.
 *
 *   node scripts/seed-demo-presence.js            # one check-in, ~5 min
 *   node scripts/seed-demo-presence.js --watch    # keep alive until Ctrl+C
 *   node scripts/seed-demo-presence.js --revert   # undo everything
 */

require("dotenv").config()

const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")

// Session-mode connection: this script runs alongside the dev server and
// the pooled URL has a connection_limit of 5, which the two together can
// exhaust.
const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } })

const BACKUP = path.join(__dirname, ".demo-presence-backup.json")
const REVERT = process.argv.includes("--revert")
const WATCH = process.argv.includes("--watch")

/** Refreshed well inside the five-minute staleness window. */
const BEAT_MS = 60 * 1000

/** Two of each. Chosen for having coordinates already — a provider or shop
 *  with no position cannot appear in a proximity search however online it
 *  is, so seeding presence for one would look broken. */
const PROVIDER_COUNT = 2
const SHOP_COUNT = 2

async function pickTargets() {
  const providers = await db.providerProfile.findMany({
    where: {
      latitude: { not: null },
      parentBusinessId: null,
      user: { isActive: true },
    },
    select: { id: true, user: { select: { name: true } } },
    orderBy: { rating: "desc" },
    take: PROVIDER_COUNT,
  })
  const shops = await db.shopkeeperProfile.findMany({
    where: { latitude: { not: null } },
    select: { id: true, shopName: true, openingTime: true, closingTime: true },
    orderBy: { rating: "desc" },
    take: SHOP_COUNT,
  })
  return { providers, shops }
}

async function seed() {
  const { providers, shops } = await pickTargets()
  if (providers.length === 0 && shops.length === 0) {
    console.log("No located providers or shops to work with. Run scripts/seed-demo-coordinates.js first.")
    return
  }

  // Record real hours before overwriting them, so --revert restores the
  // actual values rather than a plausible-looking default.
  if (!fs.existsSync(BACKUP)) {
    fs.writeFileSync(BACKUP, JSON.stringify({
      shops: shops.map((s) => ({ id: s.id, openingTime: s.openingTime, closingTime: s.closingTime })),
      providerIds: providers.map((p) => p.id),
    }, null, 2))
  }

  for (const p of providers) {
    await db.providerAvailability.upsert({
      where: { providerId: p.id },
      create: { providerId: p.id, weeklySchedule: {}, isOnline: true, lastSeenAt: new Date() },
      update: { isOnline: true, lastSeenAt: new Date() },
    })
  }
  for (const s of shops) {
    await db.shopkeeperProfile.update({
      where: { id: s.id },
      data: { openingTime: "00:00", closingTime: "23:59" },
    })
  }

  console.log(`online now: ${providers.map((p) => p.user.name).join(", ") || "(none)"}`)
  console.log(`open now:   ${shops.map((s) => s.shopName).join(", ") || "(none)"}`)
  return providers.map((p) => p.id)
}

async function beat(providerIds) {
  await db.providerAvailability.updateMany({
    where: { providerId: { in: providerIds }, isOnline: true },
    data: { lastSeenAt: new Date() },
  })
}

async function revert() {
  if (!fs.existsSync(BACKUP)) {
    console.log("No backup file, so nothing to restore. Did you run the seed first?")
    return
  }
  const saved = JSON.parse(fs.readFileSync(BACKUP, "utf8"))

  for (const s of saved.shops) {
    await db.shopkeeperProfile.update({
      where: { id: s.id },
      data: { openingTime: s.openingTime, closingTime: s.closingTime },
    })
  }
  await db.providerAvailability.updateMany({
    where: { providerId: { in: saved.providerIds } },
    data: { isOnline: false, lastSeenAt: null },
  })

  fs.unlinkSync(BACKUP)
  console.log(`restored ${saved.shops.length} shop(s) to their real hours and took ${saved.providerIds.length} provider(s) offline`)
}

async function main() {
  if (REVERT) return revert()

  const providerIds = await seed()
  if (!WATCH) {
    console.log("\nThis lasts about five minutes, then presence goes stale and the rows empty again.")
    console.log("Re-run, or use --watch to hold it open.")
    console.log("Undo with: node scripts/seed-demo-presence.js --revert")
    return
  }

  console.log(`\nHolding presence open, beating every ${BEAT_MS / 1000}s. Ctrl+C to stop.`)
  console.log("Remember to run --revert afterwards.")
  // Keeps the process alive; the interval is the whole point of --watch.
  setInterval(() => {
    beat(providerIds)
      .then(() => process.stdout.write("."))
      .catch((e) => console.error("\nbeat failed:", e.message))
  }, BEAT_MS)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    // --watch deliberately holds the connection open.
    if (!WATCH || REVERT) db.$disconnect()
  })
