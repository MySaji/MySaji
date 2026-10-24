// Targeted additive installer; does not replay unrelated migration history.
require('@next/env').loadEnvConfig(process.cwd())
const fs=require('node:fs'),path=require('node:path'),{PrismaClient}=require('@prisma/client')
const db=new PrismaClient({log:[],datasources:{db:{url:process.env.DIRECT_URL||process.env.DATABASE_URL}}})
const apply=process.argv.includes('--apply')
async function main(){await db.$transaction(async tx=>{
 if(apply)await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(184223,91814)`
 const rows=await tx.$queryRaw`SELECT to_regclass('public.pos_business_pulse')::text AS pulse, (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_stock_counts' AND column_name IN ('assignedStaffId','assignedStaffName')) AS assignment`
 const installed=!!rows[0].pulse&&rows[0].assignment===2
 if(installed){console.log('Business pulse storage and stock assignment columns exist. No changes made.');return}
 if(rows[0].pulse||rows[0].assignment)throw Error('Partial schema; inspect before continuing')
 if(!apply){console.log('Business pulse storage is missing. Read-only check: no changes made.');return}
 const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261024010000_pos_business_pulse/migration.sql'),'utf8')
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement)
 console.log('Installed Business pulse planning storage and stock-count assignment columns. Existing business records were not changed.')
},{timeout:30000})}
main().catch(error=>{console.error(`Business pulse installation failed${error.code?` (${error.code})`:''}. No partial transaction was committed.`);process.exitCode=1}).finally(()=>db.$disconnect())
