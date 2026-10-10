#!/usr/bin/env node
/**
 * Gives every existing ProviderProfile a storefront address.
 *
 * Slugs were added after these profiles existed, so all of them start null.
 * New profiles get one at creation (see lib/actions/auth.ts,
 * account-switch.ts and provider-business.ts); this covers the back catalogue.
 *
 * Idempotent: a profile that already has a slug is left alone.
 *
 *   node scripts/backfill-provider-slugs.js --dry-run
 *   node scripts/backfill-provider-slugs.js
 */

require("dotenv").config()

const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient()
const DRY_RUN = process.argv.includes("--dry-run")

/** Mirrors buildProviderSlug in lib/provider-slug.ts — keep the two in step. */
function clean(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}

function buildProviderSlug(displayName, email, profileId) {
  const base = clean(displayName) || clean(String(email ?? "").split("@")[0]) || "provider"
  return `${base}-${profileId.slice(-6)}`
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — nothing will be written\n" : "Backfilling storefront addresses\n")

  const profiles = await db.providerProfile.findMany({
    select: { id: true, slug: true, businessName: true, user: { select: { name: true, email: true } } },
  })

  const pending = profiles.filter((p) => !p.slug)
  console.log(`profiles: ${profiles.length}   without a slug: ${pending.length}`)
  if (pending.length === 0) {
    console.log("Nothing to do.")
    return
  }

  const taken = new Set(profiles.filter((p) => p.slug).map((p) => p.slug))
  let updated = 0
  let collided = 0

  for (const profile of pending) {
    // A business trades under its business name; a solo pro under their own.
    let slug = buildProviderSlug(profile.businessName || profile.user.name, profile.user.email, profile.id)

    // The id suffix makes this near-impossible, but a deterministic tiebreak
    // beats a unique-constraint failure part-way through the run.
    if (taken.has(slug)) {
      collided += 1
      let n = 2
      while (taken.has(`${slug}-${n}`)) n += 1
      slug = `${slug}-${n}`
    }
    taken.add(slug)

    if (!DRY_RUN) {
      await db.providerProfile.update({ where: { id: profile.id }, data: { slug } })
    }

    updated += 1
    console.log(`  ${DRY_RUN ? "would set" : "set      "} /p/${slug}`)
  }

  console.log(`\nSummary\n  addresses set ${updated}\n  collisions    ${collided}`)
  if (DRY_RUN) console.log("\nDry run — re-run without --dry-run to write.")
}

main()
  .catch((error) => {
    console.error("\nbackfill-provider-slugs failed:", error.message)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect().catch(() => {}))
