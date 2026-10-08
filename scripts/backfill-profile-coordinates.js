#!/usr/bin/env node
/**
 * Copies existing shop coordinates onto ShopkeeperProfile.latitude/longitude.
 *
 * Before those columns existed, a shopkeeper who tapped "use my current
 * location" had the position written only to an Address row of type OFFICE
 * owned by their User. Customer-facing radius search queries the profile
 * columns (a Prisma filter cannot reach through a join), so without this
 * backfill every shop located before the change would silently stop
 * appearing in "shops near me".
 *
 * ProviderProfile needs no equivalent pass: providers never had coordinates
 * anywhere to copy from, so they all legitimately start null and fill in as
 * each provider picks a place from the address autocomplete.
 *
 * Idempotent: a profile that already has coordinates is left alone, so this
 * is safe to re-run and will never overwrite a newer position with an older
 * address row.
 *
 *   node scripts/backfill-profile-coordinates.js --dry-run
 *   node scripts/backfill-profile-coordinates.js
 */

require("dotenv").config()

const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry-run")

async function main() {
  const profiles = await db.shopkeeperProfile.findMany({
    where: { OR: [{ latitude: null }, { longitude: null }] },
    select: { id: true, userId: true, shopName: true },
  })

  if (profiles.length === 0) {
    console.log("Every shopkeeper profile already has coordinates. Nothing to do.")
    return
  }

  console.log(`${profiles.length} shop(s) without coordinates.${DRY_RUN ? " (dry run)" : ""}`)

  const addresses = await db.address.findMany({
    where: {
      userId: { in: profiles.map((p) => p.userId) },
      type: "OFFICE",
      latitude: { not: null },
      longitude: { not: null },
    },
    // Mirrors the tie-break getShopById uses, so the backfill picks the same
    // row the app would have read.
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: { userId: true, latitude: true, longitude: true },
  })

  // findMany returns the preferred row first for each user, so the first
  // write per userId wins and later duplicates are ignored.
  const coordsByUser = new Map()
  for (const address of addresses) {
    if (!coordsByUser.has(address.userId)) coordsByUser.set(address.userId, address)
  }

  let updated = 0
  let skipped = 0

  for (const profile of profiles) {
    const coords = coordsByUser.get(profile.userId)
    if (!coords) {
      skipped++
      continue
    }

    const latitude = coords.latitude
    const longitude = coords.longitude
    console.log(`  ${profile.shopName} -> ${latitude}, ${longitude}`)

    if (!DRY_RUN) {
      await db.shopkeeperProfile.update({
        where: { id: profile.id },
        data: { latitude, longitude },
      })
    }
    updated++
  }

  console.log(
    `${DRY_RUN ? "Would update" : "Updated"} ${updated} shop(s). ` +
      `${skipped} had no located OFFICE address and stay null until the shopkeeper sets one.`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
