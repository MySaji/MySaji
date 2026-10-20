#!/usr/bin/env node
/**
 * Enables PostGIS and creates the spatial indexes the geofence queries need.
 *
 * Why this is a script and not part of the Prisma schema: Prisma cannot model
 * a GiST index over an expression, so these objects have to be created
 * outside it. A `prisma db push` against an already-in-sync schema was
 * observed to leave them untouched, but push reconciles the database
 * against schema.prisma and nothing guarantees that holds for a push that
 * actually alters one of these tables. Everything here is idempotent, so
 * the safe habit is to run `--check` after a push and re-run this if
 * anything is missing.
 *
 * The indexes are over an expression rather than a stored geography column
 * on purpose: a stored column would have to be kept in step with
 * latitude/longitude by a trigger or a generated clause, both of which fight
 * with db push for ownership of the column. Indexing the expression keeps
 * latitude/longitude as the single source of truth while still giving the
 * planner something to scan.
 *
 *   node scripts/enable-postgis.js
 *   node scripts/enable-postgis.js --check
 */

process.loadEnvFile?.()

const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient()
const CHECK_ONLY = process.argv.includes("--check")

/** Tables carrying latitude/longitude that the geofence queries search. */
const SPATIAL_TABLES = [
  { table: "shopkeeper_profiles", index: "shopkeeper_profiles_geo_gist" },
  { table: "provider_profiles", index: "provider_profiles_geo_gist" },
  { table: "customer_requests", index: "customer_requests_geo_gist" },
  { table: "distributor_locations", index: "distributor_locations_geo_gist" },
  { table: "addresses", index: "addresses_geo_gist" },
]

/** Mirrors GEO_POINT in lib/geo-sql.ts — these two strings must stay
 *  character-identical. Postgres only uses an expression index when the
 *  query spells the expression exactly the way the index was built. */
const POINT_EXPRESSION =
  '(extensions.ST_SetSRID(extensions.ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::extensions.geography)'

async function isInstalled() {
  const rows = await db.$queryRawUnsafe(
    `SELECT e.extversion AS installed_version, n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis'`,
  )
  return Boolean(rows[0]?.installed_version && rows[0]?.schema === "extensions")
}

async function indexExists(name) {
  const rows = await db.$queryRawUnsafe(
    `SELECT 1 FROM pg_indexes WHERE indexname = '${name}'`,
  )
  return rows.length > 0
}

async function check() {
  const installed = await isInstalled()
  console.log(`postgis installed: ${installed ? "yes" : "NO"}`)
  let missing = installed ? 0 : 1
  for (const { table, index } of SPATIAL_TABLES) {
    const present = await indexExists(index)
    if (!present) missing++
    console.log(`  ${present ? "ok  " : "MISS"} ${index} on ${table}`)
  }
  if (missing > 0) {
    console.log("\nSomething is missing — re-run: node scripts/enable-postgis.js")
    process.exitCode = 1
  } else {
    console.log("\nAll spatial objects present.")
  }
}

async function main() {
  if (CHECK_ONLY) return check()

  // Supabase convention: extensions live in their own schema rather than
  // public, so every PostGIS call in this codebase is schema-qualified.
  await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS extensions`)
  await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions`)
  if (!(await isInstalled())) throw new Error("PostGIS must be installed in the extensions schema; review extension placement before continuing.")
  console.log("postgis enabled in schema extensions")

  for (const { table, index } of SPATIAL_TABLES) {
    // Partial: rows with no coordinates can never match a geofence, and
    // leaving them out keeps the index to the rows that are actually
    // searchable — most of these tables are mostly unlocated today.
    const sql =
      `CREATE INDEX IF NOT EXISTS ${index} ON "${table}" ` +
      `USING GIST (${POINT_EXPRESSION}) ` +
      `WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL`
    await db.$executeRawUnsafe(sql)
    console.log(`  index ${index} on ${table}`)
  }

  console.log("\nDone. Re-run this after any `prisma db push` that drops them.")
  console.log("Verify with: node scripts/enable-postgis.js --check")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
