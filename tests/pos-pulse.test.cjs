const test=require('node:test'),assert=require('node:assert/strict')
const {loadService}=require('./load-service.cjs'),zod=require('zod')
const domain=loadService('backend/domain/pos-pulse.ts',{zod})
test('Business pulse dates validate calendar days and use full East Africa days',()=>{
 assert.equal(domain.pulseDay('2026-10-24').toISOString(),'2026-10-23T21:00:00.000Z')
 assert.equal(domain.pulseDay('2026-02-30'),null);assert.equal(domain.pulseDay('2026-13-01'),null)
})
test('restocking uses a 30-day net sales rate, lead/cover days and safe unit rounding',()=>{
 assert.equal(domain.restockSuggestion(2,30,3,14,false).quantity,15)
 assert.equal(domain.restockSuggestion(20,30,3,14,false).quantity,0)
 assert.equal(domain.restockSuggestion(0,0,3,14,false).daysLeft,null)
 assert.equal(domain.restockSuggestion(0,1,0,1,true).quantity,0.034)
})
test('service cost estimates withhold contribution when a material cost is unknown',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(domain.serviceCostCard(1000,40,[{quantity:0.1,cost:200}]))),{materialsCost:20,commission:400,missing:0,contribution:580})
 assert.equal(domain.serviceCostCard(1000,40,[{quantity:1,cost:null}]).contribution,null)
})
test('English and Swahili answers cite report destinations and never describe sales as profit',()=>{
 const facts={day:'2026-10-24',sales:1000,collected:900,expenses:50,refunds:10,unmatched:2,lowStock:3,top:'Milk',limited:true}
 assert.match(domain.answerPulse('mauzo','sw',facts).text,/Mauzo/)
 assert.match(domain.answerPulse('profit','en',facts).text,/not profit/)
 assert.equal(domain.answerPulse('M-Pesa payments','en',facts).href,'/pos/pulse#money')
 assert.match(domain.answerPulse('sales','en',facts).text,/partial data/)
 assert.match(domain.answerPulse('delete all records','en',facts).text,/Ask about/)
})
function fixture(role='OWNER'){
 let queries=[];const at=new Date('2026-10-24T09:00:00Z')
 const wrap=(name,value)=>async args=>{queries.push([name,args]);return typeof value==='function'?value(args):value}
 const db={
 shopkeeperProfile:{findUnique:wrap('shop',{shopName:'Demo',posProfileKey:'SALON',posConfig:{taxRate:16,taxInclusive:true},mpesaEnv:'production',mpesaShortcode:'12345',mpesaUseDemoCreds:false})},
 posSale:{findMany:wrap('sales',[{id:'sale',saleNumber:'S-1',status:'COMPLETED',total:1160,subtotal:1160,discount:0,tax:160,cashierName:'Amina',occurredAt:at,items:[{quantity:1,costAtSale:null}],payments:[{id:'payment',method:'MPESA',amount:1160,reference:'ABC'}]}])},
 posExpense:{aggregate:wrap('expenses',{_sum:{amount:50},_count:1})},posReturn:{aggregate:wrap('refunds',{_sum:{totalRefunded:100},_count:1})},
 tillSession:{findMany:wrap('shifts',[])},posMpesaTransaction:{findMany:wrap('mpesa',[{id:'tx',status:'PAID',amount:1160,receipt:'ABC',consumedSaleId:'sale',createdAt:at},{id:'unmatched',status:'PAID',amount:500,receipt:'XYZ',consumedSaleId:null,createdAt:at}])},
 product:{findMany:wrap('products',[{id:'material',name:'Shampoo',sku:'S',barcode:'123',unit:'l',isService:false,hasVariants:false,price:300,costPrice:200,createdAt:new Date('2026-01-01'),inventory:{currentStock:2,stockOnHand:2,reservedStock:0},variants:[],salonServices:[]},{id:'service',name:'Treatment',unit:'piece',isService:true,price:1160,costPrice:null,createdAt:at,variants:[],salonServices:[]}]),count:wrap('productCount',0)},
 posSaleItem:{groupBy:wrap('velocity',[{productId:'material',variantId:null,_sum:{quantity:30}}])},posReturnItem:{groupBy:wrap('returns',[])},stockMovement:{findMany:wrap('movements',[])},
 posCustomer:{findMany:wrap('customers',[{id:'customer',name:'Jane',phone:'+254712345678',pointsBalance:20,lastSeenAt:new Date('2026-08-01'),visits:2}]),findFirst:wrap('customer',{id:'customer',name:'Jane',phone:'+254712345678',pointsBalance:20})},
 posPurchaseOrder:{count:wrap('orders',0),findUnique:wrap('prior',null),create:wrap('createOrder',{id:'order',orderNumber:'PLAN-1'})},posSupplier:{findMany:wrap('suppliers',[]),findFirst:wrap('supplier',{id:'supplier'})},posStaff:{findMany:wrap('staff',[])},
 posBusinessPulse:{findUnique:wrap('settings',{version:1,settings:{recipes:[{serviceId:'service',commissionPercent:40,materials:[{productId:'material',quantity:0.1}]}]}}),upsert:wrap('upsert',{})},
 posAuditEvent:{create:wrap('audit',{})},$queryRaw:wrap('lock',[]),
 }
 db.$transaction=async fn=>fn(db)
 const actor={role,shopkeeperId:'shop-a',businessId:'business-a',storeId:'branch-a',userId:'owner',staffId:null,name:'Owner',can:()=>true}
 const actions=loadService('backend/actions/pos-pulse.ts',{'zod':zod,'@/backend/db':{db},'@/backend/services/pos-access-core':{resolvePosActor:async()=>actor,recordPosAudit:wrap('journal',{})},'@/backend/domain/pos-mpesa':{mpesaScope:()=>({shortcode:'12345',environment:'production'})},'@/backend/domain/pos-config':{parsePosConfig:()=>({taxRate:16,taxInclusive:true})},'@/backend/domain/pos-pulse':domain})
 return {db,actions,queries,wrap}
}
test('all pulse actions refuse non-owners before reading branch data',async()=>{
 const f=fixture('MANAGER')
 for(const [name,input]of [['getBusinessPulse',{}],['savePulseSettings',{}],['getPulseAnswer',{day:'2026-10-24',question:'sales',language:'en'}],['prepareCustomerFollowup',{}],['createPulsePurchaseDraft',{}]])assert.equal((await f.actions[name](input)).success,false,name)
 assert.equal(f.queries.length,0)
})
test('daily brief keeps tenders, expenses and refunds separate and matches exact linked merchant receipts',async()=>{
 const f=fixture(),r=await f.actions.getBusinessPulse({day:'2026-10-24'})
 assert.equal(r.success,true);assert.equal(r.data.brief.sales,1160);assert.equal(r.data.brief.collected,1160);assert.equal(r.data.brief.expenses,50);assert.equal(r.data.brief.refunds,100)
 assert.equal(r.data.money.rows[0].state,'Matched');assert.equal(r.data.brief.unmatched,1);assert.equal(r.data.brief.missingCostLines,1)
 assert.equal(r.data.recipes[0].exTax,1000);assert.equal(r.data.recipes[0].contribution,580)
 assert.equal(r.data.restock[0].quantity,15)
 assert.equal(f.queries.find(([n])=>n==='mpesa')[1].where.environment,'production')
 for(const name of ['sales','expenses','refunds','shifts','products','movements','customers','orders'])assert.equal(f.queries.find(([n])=>n===name)[1].where.shopkeeperId,'shop-a',name)
})
test('foreign or inactive recipe products are rejected and stale setting versions do not write',async()=>{
 const f=fixture()
 assert.equal((await f.actions.savePulseSettings({version:1,change:{kind:'recipe',serviceId:'foreign-service',commissionPercent:40,materials:[{productId:'material',quantity:1}]}})).success,false)
 const r=await f.actions.savePulseSettings({version:0,change:{kind:'rules',leadDays:3,coverDays:14,discountPercent:20,returnAfterDays:30}})
 assert.equal(r.success,false);assert.match(r.error,/changed/);assert.equal(f.queries.some(([n])=>n==='upsert'),false)
})
test('follow-up drafts require current consent and record no sent message',async()=>{
 const f=fixture();assert.equal((await f.actions.prepareCustomerFollowup({customerId:'customer',language:'en'})).success,false)
 f.db.posBusinessPulse.findUnique=f.wrap('consent',{version:2,settings:{consents:[{customerId:'customer',allowed:true,evidence:'Customer asked at counter',at:new Date().toISOString(),recordedBy:'Owner'}]}})
 const result=await f.actions.prepareCustomerFollowup({customerId:'customer',language:'sw'})
 assert.equal(result.success,true);assert.match(result.text,/Habari Jane/);assert.match(result.url,/^https:\/\/wa.me\/254712345678/)
 assert.match(f.queries.find(([n])=>n==='journal')[1].summary,/no message sent/)
})
test('purchase draft retries return the existing branch order without writing another',async()=>{
 const f=fixture();f.db.posPurchaseOrder.findUnique=f.wrap('prior',{id:'existing',shopkeeperId:'shop-a',orderNumber:'PLAN-OLD'})
 const result=await f.actions.createPulsePurchaseDraft({requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',supplierId:'supplier',lines:[{productId:'material',variantId:null,quantity:2,unitCost:200}]})
 assert.equal(result.success,true);assert.equal(result.id,'existing');assert.equal(f.queries.some(([n])=>n==='createOrder'),false)
})
test('public product enquiries contain item context and service requests never confirm bookings',()=>{
 const {websiteEnquiryHref}=loadService('backend/domain/pos-website.ts',{zod})
 const url=websiteEnquiryHref({whatsapp:'+254712345678',email:''},{name:'Hair treatment',isService:true})
 assert.match(decodeURIComponent(url),/request an appointment/);assert.match(decodeURIComponent(url),/Please confirm availability/)
 assert.equal(websiteEnquiryHref({whatsapp:'',email:''},{name:'Milk',isService:false}),null)
})
