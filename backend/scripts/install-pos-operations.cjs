// Reviewed additive installer: no baseline replay, reset, or business-data seeding.
require('@next/env').loadEnvConfig(process.cwd())
const fs=require('node:fs'),path=require('node:path'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient({log:[],datasources:{db:{url:process.env.DIRECT_URL||process.env.DATABASE_URL}}}),apply=process.argv.includes('--apply')
async function main(){await db.$transaction(async tx=>{
 if(apply)await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(184223,91815)`
 const [tables,columns,enums]=await Promise.all([
 tx.$queryRaw`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('pos_operations_config','pos_invoice_drafts','pos_material_usage','pos_expiry_plans','pos_booking_waitlist')`,
 tx.$queryRaw`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_salon_appointments' AND column_name IN ('customerUserId','onlineCancellationHours','bookingSource','depositAmount','depositCheckoutId','depositState','holdExpiresAt')`,
 tx.$queryRaw`SELECT count(*)::int AS count FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='StockMovementKind' AND e.enumlabel IN ('SERVICE_USAGE','SERVICE_USAGE_REVERSAL','SUPPLIER_RETURN')`,
 ])
 if(tables[0].count===5&&columns[0].count===7&&enums[0].count===3){console.log('Operations tables, booking columns and movement kinds are installed. No changes made.');return}
 if(tables[0].count||columns[0].count||enums[0].count)throw Error('Partial operations schema: inspect before installation')
 if(!apply){console.log('Operations schema is missing. Read-only check: no changes made.');return}
 const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261025010000_pos_operations/migration.sql'),'utf8')
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement)
 console.log('Installed five operations tables, seven appointment columns and three ledger movement kinds. Existing sales and stock records were not changed.')
},{timeout:60000})}
main().catch(e=>{console.error(`Operations installation failed${e.code?` (${e.code})`:''}. No partial transaction committed.`);process.exitCode=1}).finally(()=>db.$disconnect())
