// Read-only unless --apply is supplied. Does not replay baseline/payment migrations.
require("@next/env").loadEnvConfig(process.cwd())
const fs = require("node:fs")
const path = require("node:path")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient({ log: [], datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } })
const apply = process.argv.includes("--apply")
async function main() {
  await db.$transaction(async tx => {
    if (apply) await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(184223, 91813)`
    const rows = await tx.$queryRaw`SELECT to_regclass('public.pos_salon_services')::text AS services, to_regclass('public.pos_salon_appointments')::text AS appointments`
    if (rows[0].services && rows[0].appointments) { console.log("Salon tables already exist. No changes made; verify schema before release."); return }
    if (rows[0].services || rows[0].appointments) throw new Error("Partial salon schema")
    if (!apply) { console.log("Salon tables are missing. Read-only check: no changes made. Installation requires --apply after review."); return }
    const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261023010000_pos_salon/migration.sql"), "utf8")
    for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
    console.log("Salon service rules and appointment tables installed. No existing business records were modified.")
  }, { timeout: 30_000 })
}
main().catch(error => { console.error(`Salon installation failed${error.code ? ` (${error.code})` : ""}. No partial transaction was committed. Check database access and prerequisites.`); process.exitCode = 1 }).finally(() => db.$disconnect())
