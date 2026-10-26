const test=require('node:test'),assert=require('node:assert/strict'),{loadService}=require('./load-service.cjs'),zod=require('zod')
const salon=loadService('backend/domain/pos-salon.ts'),domain=loadService('backend/domain/pos-operations.ts',{zod,'./pos-salon':salon})
test('public slots use EAT, opening days, notice, duration and overlapping appointments',()=>{
 const settings=domain.readOperationsSettings({weekdays:[0,1,2,3,4,5,6],opens:'09:00',closes:'12:00',noticeHours:1})
 const busy=[{startsAt:new Date('2026-10-26T07:00:00Z'),endsAt:new Date('2026-10-26T08:00:00Z')}]
 const slots=domain.bookingSlots('2026-10-26',60,settings,busy,new Date('2026-10-26T04:00:00Z'))
 assert.deepEqual(JSON.parse(JSON.stringify(slots)),['2026-10-26T06:00:00.000Z','2026-10-26T08:00:00.000Z'])
 assert.equal(domain.bookingSlots('2026-02-30',60,settings,[],new Date()).length,0)
 assert.equal(domain.operationsSettingsSchema.safeParse({opens:'18:00',closes:'09:00'}).success,false)
})
test('invoice uploads require canonical supported bytes and structured extraction never accepts negative costs',()=>{
 assert.equal(domain.parseInvoiceFile('data:application/pdf;base64,'+Buffer.from('%PDF-1.7\nfixture\n%%EOF').toString('base64')).mimeType,'application/pdf')
 assert.equal(domain.parseInvoiceFile('data:image/png;base64,'+Buffer.from('not a PNG').toString('base64')),null)
 assert.equal(domain.parseInvoiceFile('https://internal.example/invoice.pdf'),null)
 assert.equal(domain.invoiceExtractSchema.safeParse({lines:[{description:'Milk',quantity:1,unitCost:-5}]}).success,false)
 assert.equal(domain.expiryActionAllowed('MARKDOWN',true,false),false);assert.equal(domain.expiryActionAllowed('MARKDOWN',false,true),false);assert.equal(domain.expiryActionAllowed('RETURN',true,true),true)
})
test('handover CSV neutralises formulas and ZIP preserves independent source records',()=>{
 const {storedZip,csvArchiveFile}=loadService('backend/domain/pos-handover.ts',{'@/backend/domain/pos-operations':domain},{TextEncoder})
 const csv=domain.toCsv(['name','value'],[['=IMPORTXML("bad")',-20]])
 assert.match(csv,/'=IMPORTXML/);assert.match(csv,/-20/)
 const zip=storedZip([csvArchiveFile('sales.csv',['receipt'],[['S-1']]),{name:'READ_ME.txt',data:new TextEncoder().encode('Not audited')}])
 assert.equal(Buffer.from(zip).readUInt32LE(0),0x04034b50);assert.equal(Buffer.from(zip).readUInt32LE(zip.length-22),0x06054b50)
 assert.throws(()=>storedZip([{name:'../secret',data:new Uint8Array()}]),/Unsafe/)
})
test('recovery encryption authenticates its bytes, passphrase, account, branch and sale identities',async()=>{
 const {encryptTillBackup,decryptTillBackup}=loadService('frontend/lib/pos-recovery.ts',{}, {crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,btoa,atob})
 const scope={userId:'user',shopId:'shop'},entry={key:'sale-key',payload:{idempotencyKey:'sale-key',expectedUserId:'user',expectedShopId:'shop',customerName:'Private customer'},summary:{total:100,itemCount:1,occurredAt:new Date().toISOString()},createdAt:new Date().toISOString(),status:'failed',attempts:4,lastError:'Network'}
 const encrypted=await encryptTillBackup(scope,[entry],'a long recovery phrase')
 assert.doesNotMatch(encrypted,/Private customer/);const restored=await decryptTillBackup(encrypted,'a long recovery phrase',scope)
 assert.equal(restored[0].key,entry.key);assert.equal(restored[0].status,'pending')
 await assert.rejects(decryptTillBackup(encrypted,'a wrong recovery phrase',scope),/incorrect/)
 await assert.rejects(decryptTillBackup(encrypted,'a long recovery phrase',{...scope,shopId:'foreign'}),/another account/)
 const parsed=JSON.parse(encrypted);parsed.ciphertext=(parsed.ciphertext[0]==='A'?'B':'A')+parsed.ciphertext.slice(1)
 await assert.rejects(decryptTillBackup(JSON.stringify(parsed),'a long recovery phrase',scope),/incorrect/)
 const invalid=await encryptTillBackup(scope,[{...entry,payload:{...entry.payload,expectedShopId:'foreign'}}],'a long recovery phrase')
 await assert.rejects(decryptTillBackup(invalid,'a long recovery phrase',scope),/invalid/)
})
test('daily brief is a downloadable multi-page-capable PDF with labelled recorded figures',async()=>{
 const {createBriefPdf}=loadService('frontend/lib/pos-brief-pdf.ts',{jspdf:require('jspdf')})
 const pdf=await createBriefPdf({shopName:'Demo shop',day:'2026-10-25',limited:true,generatedAt:new Date().toISOString(),brief:{sales:1000,collected:900,expenses:50,refunds:10,saleCount:3,unmatched:1,missingCostLines:2}})
 const bytes=Buffer.from(pdf.output('arraybuffer'))
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.match(bytes.toString('latin1'),/Daily business brief/);assert.match(bytes.toString('latin1'),/PARTIAL DATA/)
})
function usageFixture(){
 const {Prisma}=require('@prisma/client'),actor={shopkeeperId:'shop',businessId:'business',storeId:'store',userId:'owner',staffId:null,name:'Owner'},state={writes:0,usage:null},queries=[]
 const db={product:{findFirst:async q=>q.where.isService?{id:'service'}:q.where.id==='bad'?null:{id:q.where.id,name:'Shampoo',unit:'l',costPrice:new Prisma.Decimal(200),tracksBatches:false,tracksSerials:false}},posSalonAppointment:{findFirst:async()=>({id:'appointment'})},productBatch:{findFirst:async()=>null},productVariant:{findFirst:async()=>null},posMaterialUsage:{findUnique:async()=>null,findFirst:async()=>state.usage,create:async({data})=>{state.usage=data;return{id:data.id}},update:async()=>{}},posAuditEvent:{create:async()=>{}},$queryRaw:async()=>{}}
 db.$transaction=async fn=>{const copy={...state};try{return await fn(db)}catch(e){Object.assign(state,copy);throw e}}
 const service=loadService('backend/actions/pos-material-usage.ts',{zod,'@/backend/db':{db},'@/backend/services/pos-operations-access':{operationsActor:async()=>actor,operationsFail:e=>({success:false,error:e})},'@/backend/domain/pos-operations':domain,'@/backend/services/pos-ledger':{recordStockMovement:async(_tx,input)=>{queries.push(input);state.writes++;return{ok:true}}}})
 return {service,state,queries,db}
}
const usageInput={shopId:'shop',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',serviceId:'service',contextType:'APPOINTMENT',contextId:'appointment',note:'Treatment materials',lines:[{productId:'good',quantity:0.05},{productId:'bad',quantity:1}]}
test('invalid later material lines roll back earlier stock movements instead of committing a partial usage',async()=>{
 const f=usageFixture();const result=await f.service.postMaterialUsage(usageInput);assert.equal(result.success,false);assert.equal(f.state.writes,0);assert.equal(f.state.usage,null)
})
test('material records snapshot costs and quantities and reject a second active usage for the same work',async()=>{
 const f=usageFixture(),input={...usageInput,lines:[{productId:'good',quantity:0.05}]};const result=await f.service.postMaterialUsage(input)
 assert.equal(result.success,true);assert.equal(f.queries[0].kind,'SERVICE_USAGE');assert.equal(Number(f.queries[0].quantity),-0.05);assert.equal(f.state.usage.lines[0].unitCost,'200')
 assert.equal((await f.service.postMaterialUsage({...input,requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})).success,false)
})
function finalizerFixture({late=false,amount=500,foreign=false}={}){
 const at=new Date(),appointment={id:'booking',shopkeeperId:'shop',stylistId:'stylist',depositAmount:500,customerPhone:'254712345678',depositState:'PENDING',status:'AWAITING_DEPOSIT',holdExpiresAt:new Date(+at+(late?-60000:60000)),startsAt:new Date(+at+86400000),endsAt:new Date(+at+90000000)}
 const payment={id:'payment',shopkeeperId:foreign?'foreign':'shop',status:'PAID',amount,phone:'254712345678'}
 const db={posSalonAppointment:{findUnique:async()=>appointment,findFirst:async()=>null,update:async({data})=>Object.assign(appointment,data)},posMpesaTransaction:{findUnique:async()=>payment},$queryRaw:async()=>{}};db.$transaction=async fn=>fn(db)
 const {finalizeBookingDeposit}=loadService('backend/services/pos-booking-core.ts',{'@/backend/db':{db},'@/backend/domain/pos-website':{},'@/backend/domain/pos-operations':domain,'@/backend/domain/pos-salon':salon})
 return {finalizeBookingDeposit,appointment}
}
test('verified exact booking deposits confirm once; late, wrong-amount or foreign payments never claim a slot',async()=>{
 const good=finalizerFixture();await good.finalizeBookingDeposit('checkout');assert.equal(good.appointment.status,'BOOKED');assert.equal(good.appointment.depositState,'PAID');await good.finalizeBookingDeposit('checkout');assert.equal(good.appointment.depositState,'PAID')
 const late=finalizerFixture({late:true});await late.finalizeBookingDeposit('checkout');assert.equal(late.appointment.depositState,'PAID_REVIEW');assert.equal(late.appointment.status,'AWAITING_DEPOSIT')
 for(const options of [{amount:499},{foreign:true}]){const f=finalizerFixture(options);await f.finalizeBookingDeposit('checkout');assert.equal(f.appointment.depositState,'PENDING')}
})
