const test=require('node:test'),assert=require('node:assert/strict'),{loadService}=require('./load-service.cjs'),zod=require('zod'),{Prisma}=require('@prisma/client')
const salon=loadService('backend/domain/pos-salon.ts'),domain=loadService('backend/domain/pos-operations.ts',{zod,'./pos-salon':salon})
function invoiceFixture(){let draft=null,received=0,failReceive=false;const reviews=[],actor={shopkeeperId:'shop',businessId:'business',storeId:'store',userId:'owner',can:()=>true},db={
 posInvoiceDraft:{findUnique:async()=>draft?{id:draft.id}:null,create:async({data})=>{draft={...data,version:1,status:'DRAFT'};return{id:data.id}},findFirst:async({where})=>draft&&where.id===draft.id&&where.shopkeeperId==='shop'?draft:null,update:async({data})=>Object.assign(draft,data),updateMany:async({data})=>{Object.assign(draft,data);return{count:1}}},
 posSupplier:{findFirst:async()=>({id:'supplier'})},product:{findMany:async()=>[{id:'product',hasVariants:false,tracksBatches:false,tracksSerials:false,variants:[]}]},posGoodsReceipt:{findFirst:async()=>null},posAuditEvent:{create:async()=>{}},$queryRaw:async()=>{}}
 db.$transaction=async fn=>fn(db)
 const service=loadService('backend/actions/pos-invoice-capture.ts',{zod,'@/backend/db':{db},'@/backend/services/pos-operations-access':{operationsActor:async(_p,shop)=>shop==='shop'?actor:null,operationsFail:e=>({success:false,error:e})},'@/backend/domain/pos-operations':domain,'@/backend/services/rate-limit':{checkRateLimit:async()=>({allowed:true})},'@/backend/services/ai/gemini-client':{},'@/backend/services/ai/credentials':{isGeminiConfigured:()=>false},'@/backend/actions/pos-purchasing':{receiveGoods:async p=>{received++;reviews.push(p);return failReceive?{success:false,error:'Network'}:{success:true,receiptId:p.requestId}}}})
 return {service,actor,getDraft:()=>draft,setFail:v=>{failReceive=v},count:()=>received,reviews}
}
const upload={shopId:'shop',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',fileName:'invoice.pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-1.7\nfixture\n%%EOF').toString('base64'),useAi:false}
const review={supplierId:'supplier',reference:'INV-1',reviewed:true,lines:[{productId:'product',quantity:2,unitCost:200}]}
test('manual invoice upload creates a draft only, rejects foreign branches, and deduplicates exact document bytes',async()=>{
 const f=invoiceFixture();assert.equal((await f.service.extractSupplierInvoice({...upload,shopId:'foreign'})).success,false)
 assert.equal((await f.service.extractSupplierInvoice(upload)).success,true);assert.equal(f.getDraft().status,'DRAFT');assert.equal(f.count(),0)
 const duplicate=await f.service.extractSupplierInvoice({...upload,requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.id,upload.requestId)
})
test('invoice receiving requires approval, freezes the approved review, and safely retries after network failure',async()=>{
 const f=invoiceFixture();await f.service.extractSupplierInvoice(upload);f.actor.can=p=>p!=='purchase.approve'
 assert.equal((await f.service.receiveReviewedInvoice({shopId:'shop',id:upload.requestId,version:1,review})).success,false);assert.equal(f.count(),0)
 f.actor.can=()=>true;f.setFail(true);assert.equal((await f.service.receiveReviewedInvoice({shopId:'shop',id:upload.requestId,version:1,review})).success,false)
 f.setFail(false);const retry=await f.service.receiveReviewedInvoice({shopId:'shop',id:upload.requestId,version:2,review:{...review,lines:[{productId:'product',quantity:99,unitCost:1}]}})
 assert.equal(retry.success,true);assert.equal(f.reviews[1].lines[0].quantity,2)
 const replay=await f.service.receiveReviewedInvoice({shopId:'shop',id:upload.requestId,version:2,review});assert.equal(replay.success,true);assert.equal(f.count(),2)
})
test('the actual goods receiver returns the original receipt for a replay and posts no additional stock or audit event',async()=>{
 let movement=0,audit=0;const actor={shopkeeperId:'shop',businessId:'business',userId:'owner',name:'Owner'}
 const db={posSupplier:{findFirst:async()=>({id:'supplier'})},product:{findMany:async()=>[{id:'product',name:'Milk',unit:'piece'}]},posGoodsReceipt:{findUnique:async()=>({id:upload.requestId,shopkeeperId:'shop',receiptNumber:'GRN-1',totalCost:new Prisma.Decimal(400),_count:{items:1}})},$queryRaw:async()=>{}};db.$transaction=async fn=>fn(db)
 const receiver=loadService('backend/actions/pos-purchasing.ts',{zod,'@/backend/db':{db},'@/backend/services/pos-ledger':{recordStockMovement:async()=>{movement++}},'@/backend/services/pos-access-core':{requirePosPermission:async()=>({ok:true,actor}),recordPosAudit:async()=>{audit++}}})
 const result=await receiver.receiveGoods({requestId:upload.requestId,expectedShopId:'shop',supplierId:'supplier',lines:review.lines})
 assert.equal(result.success,true);assert.equal(result.receiptId,upload.requestId);assert.equal(result.totalCost,400);assert.equal(movement,0);assert.equal(audit,0)
})
function bookingFixture(){let user={id:'customer',role:'CUSTOMER',name:'Jane'},notifications=0;const rows=[],startsAt=new Date(Date.now()+86400000).toISOString(),settings=domain.readOperationsSettings({depositAmount:0}),branch={id:'store',shopkeeperId:'shop',staff:[{id:'stylist',name:'Mary'}],services:[{id:'service',name:'Treatment',price:1000,duration:60}],settings},business={businessId:'business',ownerUserId:'owner',branches:[branch]}
 const db={posSalonAppointment:{findUnique:async({where})=>rows.find(r=>r.id===where.id)||null,create:async({data})=>{rows.push(data);return data}},posSalonService:{findUnique:async()=>({commissionBps:4000})},posAuditEvent:{create:async()=>{}},notification:{create:async()=>{notifications++}},$queryRaw:async()=>{},posBookingWaitlist:{findFirst:async()=>null}};db.$transaction=async fn=>fn(db)
 const service=loadService('backend/actions/pos-online-booking.ts',{zod,'@/backend/db':{db},'@/backend/services/active-user':{activeUser:async()=>user},'@/backend/services/pos-operations-access':{operationsActor:async()=>null,operationsFail:e=>({success:false,error:e})},'@/backend/domain/pos-operations':domain,'@/backend/domain/pos-salon':salon,'@/backend/services/pos-booking-core':{publicBookingBusiness:async()=>business,availableBookingSlots:async()=>({branch,service:branch.services[0],slots:[{id:'stylist',times:rows.length?[]:[startsAt]}]}),finalizeBookingDeposit:async()=>{}},'@/backend/services/rate-limit':{checkRateLimit:async()=>({allowed:true})},'@/backend/services/pos-mpesa-core':{},'@/backend/services/payment-method-crypto':{}})
 return {service,rows,startsAt,setUser:v=>{user=v},notifications:()=>notifications,settings}
}
test('online booking requires a signed-in customer and policy acceptance; replay returns one appointment and slot conflicts reject a second',async()=>{
 const f=bookingFixture(),input={requestId:upload.requestId,slug:'demo',storeId:'store',serviceId:'service',stylistId:'stylist',startsAt:f.startsAt,phone:'0712345678',acceptPolicy:true}
 f.setUser(null);assert.equal((await f.service.bookOnlineAppointment(input)).success,false);assert.equal(f.rows.length,0)
 f.setUser({id:'customer',role:'CUSTOMER',name:'Jane'});assert.equal((await f.service.bookOnlineAppointment({...input,acceptPolicy:false})).success,false)
 assert.equal((await f.service.bookOnlineAppointment(input)).success,true);assert.equal((await f.service.bookOnlineAppointment(input)).success,true);assert.equal(f.rows.length,1);assert.equal(f.notifications(),1)
 assert.equal((await f.service.bookOnlineAppointment({...input,requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})).success,false);assert.equal(f.rows[0].customerPhone,'254712345678')
})
test('deposit bookings reserve a timed hold and do not claim payment or a confirmed appointment',async()=>{
 const f=bookingFixture();f.settings.depositAmount=200
 const r=await f.service.bookOnlineAppointment({requestId:upload.requestId,slug:'demo',storeId:'store',serviceId:'service',stylistId:'stylist',startsAt:f.startsAt,phone:'0712345678',acceptPolicy:true})
 assert.equal(r.needsDeposit,true);assert.equal(f.rows[0].status,'AWAITING_DEPOSIT');assert.equal(f.rows[0].depositState,'PENDING');assert(f.rows[0].holdExpiresAt>new Date())
})
test('handover exports refuse missing report/expense permissions before reading any financial data',async()=>{
 const {buildAccountantHandover}=loadService('backend/services/pos-handover.ts',{'@/backend/db':{db:{}},'@/backend/services/pos-access-core':{resolvePosActor:async()=>({shopkeeperId:'shop',can:()=>false})},'@/backend/domain/pos-salon':salon,'@/backend/domain/pos-handover':{}})
 const result=await buildAccountantHandover('2026-10-01','2026-10-25',false);assert.equal(result.success,false);assert.equal(result.status,403)
})
