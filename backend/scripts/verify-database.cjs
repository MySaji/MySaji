const { PrismaClient } = require("@prisma/client")
try { process.loadEnvFile() } catch { /* Hosting may supply the environment directly. */ }
const db = new PrismaClient({ log: [] })
db.$transaction(async tx => {
  await tx.$executeRaw`SET TRANSACTION READ ONLY`
  const tables = await tx.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  const columns = await tx.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name IN ('settledAt', 'gatewayAmount', 'gatewayCurrency')`
  const extensions = await tx.$queryRaw`SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'postgis'`
  const indexes = await tx.$queryRaw`SELECT indexname FROM pg_indexes WHERE indexname IN ('shopkeeper_profiles_geo_gist','provider_profiles_geo_gist','customer_requests_geo_gist','distributor_locations_geo_gist','addresses_geo_gist')`
  console.log(JSON.stringify({
    connection: "ok", readOnly: true, publicTables: tables.length,
    migrationHistoryPresent: tables.some(t => t.table_name === "_prisma_migrations"),
    paymentColumns: Object.fromEntries(["settledAt", "gatewayAmount", "gatewayCurrency"].map(name => [name, columns.some(c => c.column_name === name)])),
    postgisSchema: extensions[0]?.schema ?? null, spatialIndexesPresent: indexes.length,
  }, null, 2))
}, { timeout: 15_000 }).catch(() => {
  console.log("Database verification unavailable: connection, access, or schema check failed. No changes were made.")
  process.exitCode = 1
}).finally(() => db.$disconnect())
