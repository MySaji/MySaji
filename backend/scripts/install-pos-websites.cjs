// Default is read-only. --apply installs ONLY the reviewed additive website SQL;
// it does not run unrelated historical migrations or alter existing business rows.
require("@next/env").loadEnvConfig(process.cwd())
const fs = require("node:fs")
const path = require("node:path")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient({ log: [], datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } })
const apply = process.argv.includes("--apply")
const expected = ["id", "businessId", "subdomain", "draft", "publishedContent", "publishedAt", "version", "createdAt", "updatedAt"]

async function inspect(tx) {
  const columns = await tx.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_business_websites'`
  return { exists: columns.length > 0, missing: expected.filter(name => !columns.some(c => c.column_name === name)) }
}
async function main() {
  await db.$transaction(async tx => {
    if (apply) await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(184223, 91812)`
    const status = await inspect(tx)
    if (status.exists) {
      if (status.missing.length) throw new Error("The website table is incomplete. Review its schema before proceeding.")
      console.log("Website table already exists with all expected columns. No changes made.")
      return
    }
    if (!apply) { console.log("Website table is missing. No changes made. Reviewed installation command: node backend/scripts/install-pos-websites.cjs --apply"); return }
    const base = await tx.$queryRaw`SELECT to_regclass('public.pos_businesses')::text AS business_table`
    if (!base[0]?.business_table) throw new Error("Existing POS business tables must be installed first.")
    const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261020010000_pos_business_websites/migration.sql"), "utf8")
    // This reviewed migration contains simple DDL with no embedded semicolons.
    for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
    const installed = await inspect(tx)
    if (!installed.exists || installed.missing.length) throw new Error("Website installation validation failed; transaction will roll back.")
    console.log("Website table, unique address indexes and business foreign key installed successfully. Existing business data was preserved.")
  }, { timeout: 30_000 })
}
main().catch(error => { console.error(error.code ? `Website installation failed (${error.code}). Check database access and migration prerequisites.` : "Website installation failed. Review schema prerequisites and database access before retrying."); process.exitCode = 1 }).finally(() => db.$disconnect())
