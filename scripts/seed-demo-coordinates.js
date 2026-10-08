#!/usr/bin/env node
/**
 * Development fixture: gives a handful of shops and providers real Nairobi
 * coordinates so the "near me" radius filters have something to return.
 *
 * Every lat/lng column in this database starts null — coordinates were only
 * ever writable by a shopkeeper tapping "use my current location", which
 * nobody had done — so the radius filters are correct but demonstrably empty
 * until something is located. This seeds a deliberate spread of real
 * distances from the Nairobi CBD so each radius chip (2 / 5 / 10 / 25 / 50 km)
 * visibly changes the result set:
 *
 *   Westlands        ~2 km      Karen       ~13 km
 *   Kilimani         ~3 km      Thika       ~37 km
 *   Industrial Area  ~5 km      Mombasa    ~440 km  (outside every radius)
 *
 * Providers are matched to the place their existing `location` text already
 * names, so the coordinates agree with what their profile claims rather than
 * being arbitrary. Shops have no location text at all, so they are assigned
 * round-robin across the same places.
 *
 * Idempotent: rows that already have coordinates are left alone, so a real
 * position set through the UI is never overwritten.
 *
 *   node scripts/seed-demo-coordinates.js --dry-run
 *   node scripts/seed-demo-coordinates.js
 *   node scripts/seed-demo-coordinates.js --revert   # clears what it set
 */

require("dotenv").config()

const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry-run")
const REVERT = process.argv.includes("--revert")

// Real coordinates, ordered nearest-first from the Nairobi CBD.
const PLACES = [
  { name: "Westlands, Nairobi", latitude: -1.2674, longitude: 36.8108 },
  { name: "Kilimani, Nairobi", latitude: -1.2906, longitude: 36.7869 },
  { name: "Industrial Area, Nairobi", latitude: -1.3086, longitude: 36.8509 },
  { name: "Karen, Nairobi", latitude: -1.3195, longitude: 36.7076 },
  { name: "Thika", latitude: -1.0333, longitude: 37.0693 },
  { name: "Mombasa", latitude: -4.0435, longitude: 39.6682 },
]

/** Where a customer measures from, so the saved-address origin has a value. */
const CUSTOMER_ORIGIN = { latitude: -1.286389, longitude: 36.817223 } // Nairobi CBD

const HOW_MANY_SHOPS = 6
const HOW_MANY_PROVIDERS = 6

/** Picks the place whose name the provider's own location text mentions. */
function placeForText(text) {
  if (!text) return null
  const lower = text.toLowerCase()
  return PLACES.find((p) => lower.includes(p.name.split(",")[0].toLowerCase())) ?? null
}

async function revert() {
  const shops = await db.shopkeeperProfile.updateMany({ data: { latitude: null, longitude: null } })
  const providers = await db.providerProfile.updateMany({ data: { latitude: null, longitude: null } })
  console.log(`Cleared coordinates on ${shops.count} shop(s) and ${providers.count} provider(s).`)
  console.log("Customer address coordinates were left alone — clear those by hand if you need to.")
}

async function main() {
  if (REVERT) return revert()

  // --- Shops -------------------------------------------------------------
  const shops = await db.shopkeeperProfile.findMany({
    where: { latitude: null },
    select: { id: true, shopName: true },
    orderBy: { createdAt: "asc" },
    take: HOW_MANY_SHOPS,
  })

  for (const [index, shop] of shops.entries()) {
    const place = PLACES[index % PLACES.length]
    console.log(`  shop     ${shop.shopName} -> ${place.name}`)
    if (!DRY_RUN) {
      await db.shopkeeperProfile.update({
        where: { id: shop.id },
        data: { latitude: place.latitude, longitude: place.longitude },
      })
    }
  }

  // --- Providers ---------------------------------------------------------
  // Prefer the ones whose location text already names a real place, so the
  // coordinates and the text agree.
  const providers = await db.providerProfile.findMany({
    where: { latitude: null },
    select: { id: true, location: true, user: { select: { name: true } } },
    orderBy: [{ location: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: HOW_MANY_PROVIDERS,
  })

  for (const [index, provider] of providers.entries()) {
    const place = placeForText(provider.location) ?? PLACES[index % PLACES.length]
    const matched = placeForText(provider.location) ? "(matched own location text)" : "(assigned)"
    console.log(`  provider ${provider.user.name} -> ${place.name} ${matched}`)
    if (!DRY_RUN) {
      await db.providerProfile.update({
        where: { id: provider.id },
        data: { latitude: place.latitude, longitude: place.longitude },
      })
    }
  }

  // --- A customer origin -------------------------------------------------
  // getMyLocationOrigin() measures from the customer's default saved address,
  // so at least one needs coordinates for the radius chips to be enabled
  // without granting the browser's GPS prompt.
  const addresses = await db.address.findMany({
    where: { latitude: null, user: { role: "CUSTOMER" } },
    select: { id: true, label: true, user: { select: { email: true } } },
    orderBy: { isDefault: "desc" },
    take: 3,
  })

  for (const address of addresses) {
    console.log(`  address  ${address.user.email} / ${address.label} -> Nairobi CBD`)
    if (!DRY_RUN) {
      await db.address.update({ where: { id: address.id }, data: CUSTOMER_ORIGIN })
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would locate" : "Located"} ${shops.length} shop(s), ` +
      `${providers.length} provider(s) and ${addresses.length} customer address(es).`
  )
  if (!DRY_RUN) console.log("Undo with: node scripts/seed-demo-coordinates.js --revert")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
