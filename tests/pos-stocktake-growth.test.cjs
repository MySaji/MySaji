const test=require('node:test'),assert=require('node:assert/strict'),{Prisma}=require('@prisma/client'),{loadService}=require('./load-service.cjs')
function setup(allowed=true){
 const calls=[],actor={role:'STOCK_CONTROLLER',businessId:'business',storeId:'store',shopkeeperId:'shop',userId:'user',staffId:'staff-a',name:'Amina',can:p=>p==='stock.count'}
 const wrap=(name,value)=>async arg=>{calls.push([name,arg]);return typeof value==='function'?value(arg):value}
 const db={posStockCount:{findMany:wrap('list',[]),findFirst:wrap('count',null),updateMany:wrap('claim',{count:1}),update:wrap('metadata',{})},posStockCountLine:{findFirst:wrap('line',null)},posStaff:{findFirst:wrap('staff',null)},product:{count:wrap('specialised',0)},stockMovement:{create:wrap('movement',{})},$executeRaw:async(strings,...args)=>{calls.push(['projection',{sql:strings.join('?'),args}]);return 1}}
 db.$transaction=async fn=>fn(db)
 const service=loadService('backend/actions/pos-stocktake.ts',{zod:require('zod'),'@/backend/db':{db},'@/backend/services/pos-access-core':{requirePosPermission:async p=>p==='stock.count_approve'&&!allowed?{ok:false,error:'Denied'}:{ok:true,actor},recordPosAudit:wrap('audit',{})}})
 return {service,db,actor,calls,wrap}
}
test('assigned stock counts remain restricted when accessed by ID or line ID',async()=>{
 const f=setup();await f.service.getStockCounts();await f.service.getStockCount('count');await f.service.enterCountedQuantity({lineId:'line',counted:2})
 for(const name of ['list','count']){const query=f.calls.find(([n])=>n===name)[1];assert.equal(query.where.shopkeeperId,'shop');assert.equal(query.where.OR[1].assignedStaffId,'staff-a')}
 const line=f.calls.find(([n])=>n==='line')[1];assert.equal(line.where.count.OR[1].assignedStaffId,'staff-a')
})
test('stock assignment requires approval permission and rejects employees from another branch',async()=>{
 const denied=setup(false);assert.equal((await denied.service.assignStockCount({id:'count',assignedStaffId:'foreign'})).success,false);assert.equal(denied.calls.length,0)
 const f=setup();const result=await f.service.assignStockCount({id:'count',assignedStaffId:'foreign'});assert.equal(result.success,false)
 assert.equal(f.calls.find(([n])=>n==='staff')[1].where.businessId,'business');assert.equal(f.calls.some(([n])=>n==='claim'),false)
})
function countFixture(f){
 f.actor.role='OWNER';f.actor.can=()=>true
 f.db.posStockCount.findFirst=f.wrap('count',{id:'count',shopkeeperId:'shop',status:'SUBMITTED',reference:'SC-1',lines:[{id:'line',productId:'product',variantId:null,counted:new Prisma.Decimal(8),expected:new Prisma.Decimal(10),variance:new Prisma.Decimal(-2),unitCost:new Prisma.Decimal(100),unit:'piece'}]})
}
test('approval claims a submitted count before posting and applies a variance instead of overwriting later sales',async()=>{
 const f=setup();countFixture(f);const result=await f.service.approveStockCount({id:'count'});assert.equal(result.success,true)
 assert.equal(f.calls.find(([n])=>n==='claim')[1].where.status,'SUBMITTED')
 const projection=f.calls.find(([n])=>n==='projection')[1];assert.match(projection.sql,/COALESCE/);assert.match(projection.sql,/FLOOR/);assert.equal(Number(projection.args[0]),-2)
 assert(f.calls.findIndex(([n])=>n==='claim')<f.calls.findIndex(([n])=>n==='movement'))
})
test('concurrent approval cannot post a second stock adjustment',async()=>{
 const f=setup();countFixture(f);f.db.posStockCount.updateMany=f.wrap('claim',{count:0});assert.equal((await f.service.approveStockCount({id:'count'})).success,false);assert.equal(f.calls.some(([n])=>n==='movement'),false)
})
