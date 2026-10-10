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
 * Presence expires: a provider counts as online only while their device
 * keeps checking in (five minutes, see lib/provider-presence.ts). A real
 * device beats every 90s. This script has no device, so by default it
 * dates the check-in slightly in the FUTURE — a deliberate demo-only fib
 * that holds the providers online for --minutes with nothing left
 * running. Without it the demo went lopsided within five minutes, because
 * shops do not expire: shops still listed, providers silently gone.
 *
 * --watch is the honest alternative — it beats on a real interval, exactly
 * as a device would, for as long as you leave it open.
 *
 * Original opening hours are saved to scripts/.demo-presence-backup.json
 * and restored exactly by --revert, so a shop's real trading hours are
 * never guessed at.
 *
 *   node scripts/seed-demo-presence.js                # holds ~60 min
 *   node scripts/seed-demo-presence.js --minutes 240  # holds ~4 hours
 *   node scripts/seed-demo-presence.js --watch        # real beats, until Ctrl+C
 *   node scripts/seed-demo-presence.js --revert       # undo everything
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

/** How long seeded providers stay visible, in minutes. */
function holdMinutes() {
  const i = process.argv.indexOf("--minutes")
  const raw = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 24 * 60) : 60
}

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
    // id breaks ties, so repeated runs pick the SAME rows. Without it
    // Postgres is free to return a different shop each time and each run
    // forces another one open.
    orderBy: [{ rating: "desc" }, { id: "asc" }],
    take: PROVIDER_COUNT,
  })
  const shops = await db.shopkeeperProfile.findMany({
    where: { latitude: { not: null } },
    select: { id: true, shopName: true, openingTime: true, closingTime: true },
    orderBy: [{ rating: "desc" }, { id: "asc" }],
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
  // actual values rather than a plausible-looking default. Merged rather
  // than written once: an earlier version skipped this entirely when the
  // file already existed, so a re-run that happened to pick a different
  // shop forced it open with its real hours recorded nowhere. A shop
  // already in the file is never re-recorded, or the second run would
  // save the 00:00-23:59 the first one set.
  const prior = fs.existsSync(BACKUP) ? JSON.parse(fs.readFileSync(BACKUP, "utf8")) : { shops: [], providerIds: [] }
  const known = new Set(prior.shops.map((s) => s.id))
  fs.writeFileSync(BACKUP, JSON.stringify({
    shops: [
      ...prior.shops,
      ...shops.filter((s) => !known.has(s.id))
        .map((s) => ({ id: s.id, openingTime: s.openingTime, closingTime: s.closingTime })),
    ],
    providerIds: [...new Set([...prior.providerIds, ...providers.map((p) => p.id)])],
  }, null, 2))

  // Dated forward so the five-minute staleness check keeps passing for the
  // whole window. Only --watch writes an honest "now", because only
  // --watch sticks around to write the next one.
  const seenAt = WATCH ? new Date() : new Date(Date.now() + holdMinutes() * 60 * 1000)

  for (const p of providers) {
    await db.providerAvailability.upsert({
      where: { providerId: p.id },
      create: { providerId: p.id, weeklySchedule: {}, isOnline: true, lastSeenAt: seenAt },
      update: { isOnline: true, lastSeenAt: seenAt },
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
    console.log(`\nHolding for about ${holdMinutes()} minutes, then presence goes stale and the pro row empties.`)
    console.log("Re-run to extend, --minutes N for longer, or --watch for real heartbeats.")
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
