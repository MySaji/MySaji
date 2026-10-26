const {test}=require('node:test');const assert=require('node:assert/strict');const {Prisma}=require('@prisma/client');const {loadService}=require('./load-service.cjs');
const domain=loadService('backend/domain/pos-salon.ts');
const D=n=>new Prisma.Decimal(n);
function setup(options={}){
 const grants=new Set(options.grants||['salon.view','salon.book','salon.service','salon.manage','salon.commission','till.sell']);
 const actor={businessId:'business',shopkeeperId:'shop',storeId:'branch',staffId:'staff',userId:'user',name:'Reception',role:'CASHIER',can:key=>grants.has(key)};
 const now=new Date();let appointment={id:'appointment',shopkeeperId:'shop',stylistId:'staff',stylistName:'Mary',serviceId:'service',serviceName:'Braiding',customerName:'Jane',customerPhone:'0712345678',startsAt:now,endsAt:new Date(now.getTime()+3600000),status:options.status||'BOOKED',version:1,notes:'',commissionBps:4000,quotedPrice:D(1500),commissionBase:null,saleItemId:null,checkedInAt:now,startedAt:now,completedAt:now,cancellationReason:null,saleItem:null};
 const queries=[],audit=[],updates=[];let created;
 const sale={id:'sale',saleNumber:'POS-001',status:'COMPLETED',shopkeeperId:'shop',subtotal:D(1500),total:D(1500),tax:D(0),amountPaid:D(1500),customerName:'Jane',customerPhone:'+254712345678',occurredAt:now,items:[{id:'line',productId:'service',quantity:D(1),totalPrice:D(1500),returnItems:[],salonAppointment:null}],...options.sale};
 const tx={
  $queryRaw:async q=>{assert.match(q[0],/SELECT true AS locked/);queries.push(['lock',q])},
  product:{findFirst:async q=>{queries.push(['product',q]);return options.foreignService?null:{name:'Braiding',price:D(1500),salonServices:[{durationMinutes:60,commissionBps:4000}]}},findMany:async()=>[{id:'service',name:'Braiding',price:D(1500),salonServices:[{durationMinutes:60,commissionBps:4000}]}]},
  posStaff:{findFirst:async q=>{queries.push(['staff',q]);return options.foreignStaff?null:{id:'staff',name:'Mary'}},findMany:async q=>{queries.push(['staff-list',q]);return[{id:'staff',name:'Mary'}]}},
  posSalonAppointment:{findUnique:async()=>options.replay?{id:'prior',shopkeeperId:'shop'}:null,
   findFirst:async q=>{queries.push(['appointment',q]);if(q.where.startsAt)return options.overlap?{id:'conflict'}:null;return q.where.id===appointment.id&&q.where.shopkeeperId==='shop'?appointment:null},
   findMany:async q=>{queries.push(['list',q]);return[appointment]},create:async({data})=>{created=data;return{id:data.id}},update:async q=>{updates.push(q);appointment={...appointment,...q.data,version:appointment.version+1};return appointment}},
  posSale:{findFirst:async q=>{queries.push(['sale',q]);return options.missingSale?null:sale}},
  posSaleItem:{findUnique:async()=>({sale:{saleNumber:'POS-001'}})},posSalonService:{upsert:async q=>{updates.push(q);return q}},
 };
 const db={...tx,$transaction:async fn=>fn(tx),shopkeeperProfile:{findUnique:async()=>({posProfileKey:options.profile||'SALON'})}};
 const service=loadService('backend/actions/pos-salon.ts',{zod:require('zod'),'@prisma/client':{Prisma},'@/backend/db':{db},'@/backend/services/pos-access-core':{requirePosPermission:async p=>grants.has(p)?{ok:true,actor}:{ok:false,error:'Denied'},recordPosAudit:async e=>audit.push(e)},'@/backend/services/pos-booking-core':{occupiedAppointments:()=>({OR:[{status:{in:['BOOKED','CHECKED_IN','IN_SERVICE']}},{status:'AWAITING_DEPOSIT',holdExpiresAt:{gt:new Date()}}]})},'@/backend/domain/pos-salon':domain});
 return{...service,queries,audit,updates,getCreated:()=>created,getAppointment:()=>appointment,setAppointment:values=>{appointment={...appointment,...values}},sale};
}
const booking=()=>({requestId:'2b74d659-80e5-47cc-b2cc-53d1c2c5bb8b',serviceId:'service',stylistId:'staff',startsAt:new Date(Date.now()+10800000).toISOString().slice(0,16),customerName:'Jane',customerPhone:'0712345678',notes:''});

test('salon dates validate calendar days and commission excludes reversals and adjusts returns',()=>{
 assert.equal(domain.salonDay('2026-02-30'),null);assert.equal(domain.salonStart('2026-10-23T25:10'),null);
 assert.equal(domain.salonDay('2026-10-23').toISOString(),'2026-10-22T21:00:00.000Z');
 assert.equal(domain.salonCommission(1500,4000,0,'COMPLETED'),600);
 assert.equal(domain.salonCommission(1500,4000,.5,'PART_REFUNDED'),300);
 assert.equal(domain.salonCommission(1500,4000,0,'VOIDED'),0);
 assert.equal(domain.salonPhone('0712345678'),domain.salonPhone('+254712345678'));
});

test('salon booking is permission and profile gated before writes',async()=>{
 for(const options of [{grants:[]},{profile:'GENERAL'},{foreignService:true},{foreignStaff:true}]){
  const s=setup(options);assert.equal((await s.bookSalonAppointment(booking())).success,false);assert.equal(s.getCreated(),undefined);
 }
});

test('appointments snapshot server service rules, validate branch staff and reject overlapping stylists',async()=>{
 const s=setup();const result=await s.bookSalonAppointment({...booking(),commissionBps:9999});assert.equal(result.success,true);
 const row=s.getCreated();assert.equal(row.commissionBps,4000);assert.equal(row.stylistName,'Mary');assert.equal(row.endsAt-row.startsAt,3600000);assert.equal(Number(row.quotedPrice),1500);
 const staff=s.queries.find(([kind])=>kind==='staff')[1];assert.equal(staff.where.businessId,'business');assert.equal(staff.where.OR[1].storeId,'branch');
 const overlap=setup({overlap:true});assert.equal((await overlap.bookSalonAppointment(booking())).success,false);assert.equal(overlap.getCreated(),undefined);
 const replay=setup({replay:true});assert.equal((await replay.bookSalonAppointment(booking())).success,true);assert.equal(replay.getCreated(),undefined);assert.equal(replay.audit.length,0);
});

test('stylist views remain self-scoped and redact commission data even with a forged employee filter',async()=>{
 const s=setup({grants:['salon.view','salon.service']});s.setAppointment({commissionBase:D(1500),saleItem:{sale:{saleNumber:'POS-001',status:'COMPLETED'},returnItems:[]}});
 const result=await s.getSalonWorkspace({from:'2026-10-23',to:'2026-10-23',stylistId:'other'});assert.equal(result.success,true);
 assert.equal(s.queries.find(([kind])=>kind==='list')[1].where.stylistId,'staff');assert.equal(result.data.appointments[0].commission,null);assert.equal(result.data.services[0].commissionBps,null);
 assert.equal(result.data.canMatch,false);assert.equal(result.data.links.sell,false);
});

test('service transitions require current versions, assigned staff and cancellation reasons',async()=>{
 const s=setup({grants:['salon.view','salon.service'],status:'CHECKED_IN'});s.setAppointment({stylistId:'someone-else'});
 assert.equal((await s.updateSalonAppointment({id:'appointment',version:1,status:'IN_SERVICE'})).success,false);
 const reception=setup();assert.equal((await reception.updateSalonAppointment({id:'appointment',version:1,status:'COMPLETED'})).success,false);
 assert.equal((await reception.updateSalonAppointment({id:'appointment',version:2,status:'CHECKED_IN'})).success,false);
 assert.equal((await reception.updateSalonAppointment({id:'appointment',version:1,status:'CANCELLED'})).success,false);
 assert.equal((await reception.updateSalonAppointment({id:'appointment',version:1,status:'CHECKED_IN'})).success,true);
 assert.equal(reception.audit[0].action,'salon.checked_in');
});

test('rescheduling checks conflicts and preserves completed service history',async()=>{
 const s=setup({overlap:true});assert.equal((await s.rescheduleSalonAppointment({id:'appointment',version:1,startsAt:booking().startsAt})).success,false);
 const done=setup({status:'COMPLETED'});assert.equal((await done.rescheduleSalonAppointment({id:'appointment',version:1,startsAt:booking().startsAt})).success,false);
 assert.equal(done.updates.length,0);
});

test('receipt matching uses the real paid service line, discounts and VAT, then rejects reassignment',async()=>{
 const s=setup({status:'COMPLETED',sale:{subtotal:D(1740),total:D(1566),tax:D(216),amountPaid:D(1566),items:[{id:'line',productId:'service',quantity:D(1),totalPrice:D(1740),returnItems:[],salonAppointment:null}]}});
 assert.equal((await s.matchSalonReceipt({id:'appointment',version:1,receipt:'POS-001'})).success,true);
 assert.equal(Number(s.updates[0].data.commissionBase),1350);assert.equal(s.updates[0].data.saleItemId,'line');
 assert.equal((await s.matchSalonReceipt({id:'appointment',version:2,receipt:'OTHER'})).success,false);
 const query=s.queries.find(([kind])=>kind==='sale')[1];assert.equal(query.where.shopkeeperId,'shop');assert.equal(query.where.balanceDue,0);
});

test('unpaid, wrong-customer and already allocated receipts do not earn commission',async()=>{
 for(const sale of [{amountPaid:D(100)},{customerName:'Someone else',customerPhone:'0799999999'},{items:[{id:'line',quantity:D(1),totalPrice:D(1500),returnItems:[],salonAppointment:{id:'other'}}]}]){
  const s=setup({status:'COMPLETED',sale});assert.equal((await s.matchSalonReceipt({id:'appointment',version:1,receipt:'POS-001'})).success,false);assert.equal(s.updates.length,0);
 }
});
