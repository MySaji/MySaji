const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Prisma } = require('@prisma/client')
const { loadService } = require('./load-service.cjs')
const D = n => new Prisma.Decimal(n)
function setup(options = {}) {
  const grants = new Set(options.grants ?? ['salon.book','till.sell'])
  const actor = { businessId:'business',storeId:'branch',shopkeeperId:'shop',userId:'user',staffId:'staff',can:p=>grants.has(p) }
  let appointment = { id:'visit',shopkeeperId:'shop',serviceId:'service',status:'COMPLETED',version:1,customerName:'Jane',customerPhone:'0712345678',saleItemId:null,depositAmount:D(0),depositCheckoutId:null,...options.appointment }
  let sales = [], events = []
  const service = { id:'service',name:'Braiding',unit:'service',price:D(1500),discountPrice:null,isService:true,isActive:true,hasVariants:false,...options.product }
  const db = {
    shopkeeperProfile:{findUnique:async()=>({id:'shop',shopName:'Salon',posEnabled:true,posProfileKey:options.profile??'SALON',posTraits:null,posConfig:{}})},
    posSalonAppointment:{findFirst:async q=>q.where.id===appointment.id && q.where.shopkeeperId===appointment.shopkeeperId ? {...appointment}:null,update:async({data})=>{appointment={...appointment,...data,version:appointment.version+1};return appointment}},
    tillSession:{findFirst:async()=>options.closed?null:{id:'shift'}},
    product:{findMany:async()=>[service],update:async()=>{if(options.failAfterLink)throw Error('write failed');return service}},
    posPromotion:{findMany:async()=>[]},
    posSale:{findUnique:async q=>sales.find(s=>s.idempotencyKey===q.where.shopkeeperId_idempotencyKey.idempotencyKey)??null,findFirst:async()=>sales.at(-1)??null,create:async({data})=>{const s={...data,id:'sale',items:data.items.create.map((l,i)=>({...l,id:'line'+i})),payments:data.payments.create};sales.push(s);return s}},
    posAuditEvent:{create:async({data})=>{events.push(data);return data},findFirst:async q=>events.find(e=>e.action===q.where.action)??null},
    $queryRaw:async()=>[{id:'shift'}],
    $transaction:async fn=>{const savedAppointment={...appointment},savedSales=[...sales],savedEvents=[...events];try{return await fn(db)}catch(e){appointment=savedAppointment;sales=savedSales;events=savedEvents;throw e}},
  }
  const actions = loadService('backend/actions/pos-sales.ts', {
    zod:require('zod'),bcryptjs:{},crypto:require('node:crypto'),
    '@/backend/db':{db},'@/backend/auth':{auth:async()=>({user:{id:'user',role:'shopkeeper',name:'Reception'}})},
    '@/backend/services/pos-access-core':{requirePosPermission:async p=>grants.has(p)?{ok:true,actor}:{ok:false,error:'Denied'},recordPosAudit:async()=>{}},
    '@/backend/services/pos-tenant':{posShopIdFor:async()=> 'shop'},
    '@/backend/domain/pos-receipt-details':loadService('backend/domain/pos-receipt-details.ts'),
    '@/backend/domain/pos-mpesa':loadService('backend/domain/pos-mpesa.ts'),
    '@/backend/services/pos-mpesa-claims':{},'@/backend/services/pos-ledger':{recordStockMovement:async()=>{throw Error('Services must not move stock')}},
    '@/backend/services/pos-approval':{approveWithManagerPin:async()=>({ok:true,approvedBy:null}),aboveThresholdOrNever:()=>false},
    '@/backend/domain/pos-pricing':loadService('backend/domain/pos-pricing.ts'),
    '@/backend/domain/pos-config':{parsePosConfig:()=>({taxRate:16,taxInclusive:false,cashRounding:0,receiptHeader:'Salon',loyaltyEnabled:false})},
    '@/backend/actions/pos-mpesa':{},'@/backend/services/etims-queue-core':{queueSaleForEtims:async()=>{}},
    '@/backend/actions/pos-billing-shop':{getTillBillingGate:async()=>({canSell:!options.billingPaused,message:'Subscription paused'})},
    '@/backend/domain/pos-profiles':{effectiveTraits:()=>options.noService?[]:['SERVICE']},
  })
  return {...actions,getAppointment:()=>appointment,getSales:()=>sales,getEvents:()=>events}
}
const input = {id:'visit',version:1,cashReceived:2000}
test('salon cash issues one real receipt with VAT, change, net commission and an atomic appointment link',async()=>{
 const s=setup();const r=await s.recordSalonCashPayment(input);assert.equal(r.success,true,JSON.stringify(r));
 assert.equal(r.data.total,1740);assert.equal(r.data.tax,240);assert.equal(r.data.changeGiven,260);assert.equal(r.data.customerName,'Jane');assert.equal(r.data.payments[0].method,'CASH');
 assert.equal(s.getAppointment().saleItemId,'line0');assert.equal(Number(s.getAppointment().commissionBase),1500);assert.equal(s.getSales()[0].tillSessionId,'shift');assert.equal(s.getEvents().filter(e=>e.action==='salon.cash_checkout').length,1);
 const retry=await s.recordSalonCashPayment(input);assert.equal(retry.success,true);assert.equal(retry.data.replayed,true);assert.equal(s.getSales().length,1);assert.equal(s.getAppointment().version,2);
})
test('cash rejects unreceived/short amounts, closed shifts, missing grants and billing pauses without sales',async()=>{
 for(const options of [{closed:true},{billingPaused:true},{grants:['salon.book']},{grants:['till.sell']},{profile:'CLOTHES'},{noService:true}]){const s=setup(options);assert.equal((await s.recordSalonCashPayment(input)).success,false);assert.equal(s.getSales().length,0)}
 for(const cashReceived of [0,-1,0.001,1500]){const s=setup();assert.equal((await s.recordSalonCashPayment({...input,cashReceived})).success,false);assert.equal(s.getSales().length,0)}
})
test('cash refuses wrong branches, unfinished visits, deposits, stale versions and previously matched visits',async()=>{
 for(const appointment of [{shopkeeperId:'other'},{status:'IN_SERVICE'},{depositAmount:D(300)},{depositCheckoutId:'pending'},{version:2},{saleItemId:'prior'}]){const s=setup({appointment});assert.equal((await s.recordSalonCashPayment(input)).success,false);assert.equal(s.getSales().length,0)}
 for(const product of [{isService:false},{isActive:false},{id:'other'}]){const s=setup({product});assert.equal((await s.recordSalonCashPayment(input)).success,false);assert.equal(s.getSales().length,0)}
})
test('a failure after cash linking rolls back receipt, appointment and audit together',async()=>{
 const s=setup({failAfterLink:true});assert.equal((await s.recordSalonCashPayment(input)).success,false);assert.equal(s.getSales().length,0);assert.equal(s.getAppointment().saleItemId,null);assert.equal(s.getAppointment().version,1);assert.equal(s.getEvents().length,0);
})
test('forged salon checkout cannot attach mixed tenders, wrong customer or another service',async()=>{
 const base={expectedShopId:'shop',expectedUserId:'user',idempotencyKey:'salon-cash:visit',salonCashAppointment:{id:'visit',version:1},lines:[{productId:'service',quantity:'1'}],payments:[{method:'CASH',amount:2000}],customerName:'Jane',customerPhone:'0712345678'};
 for(const changed of [{payments:[{method:'CARD',amount:2000}]},{idempotencyKey:'other-key'},{customerName:'Other'},{lines:[{productId:'service',quantity:'2'}]},{posCustomerId:'other'}]){const s=setup();assert.equal((await s.recordPosSale({...base,...changed})).success,false);assert.equal(s.getSales().length,0)}
})
