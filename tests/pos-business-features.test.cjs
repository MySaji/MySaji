const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{Prisma}=require('@prisma/client'),{loadService}=require('./load-service.cjs')
const {features,profiles}=require('./pos-feature-fixture.cjs')
const {canOpenPosPage}=loadService('frontend/lib/pos-navigation.ts',{'@/backend/domain/pos-business-features':features})
const {POS_PERMISSIONS}=loadService('backend/domain/pos-permissions.ts')
const depsFor=file=>Object.fromEntries([...fs.readFileSync(file,'utf8').matchAll(/from "([^"]+)"/g)].map(m=>[m[1],{}]))
const business=(profile,traits,config)=>features.posBusinessFeatures({posProfileKey:profile,posTraits:traits,posConfig:config})

test('all business profiles share core pages but specialist access follows effective capabilities and staff permissions',()=>{
 for(const profile of profiles.POS_PROFILES){const f=business(profile.key);assert.equal(canOpenPosPage('/pos/products',['product.view'],f),true);assert.equal(canOpenPosPage('/pos/jobs',['till.sell'],f),f.jobCards);assert.equal(canOpenPosPage('/pos/floor',['till.sell'],f),f.tableService);assert.equal(canOpenPosPage('/pos/kitchen',['till.sell'],f),f.tableService);assert.equal(canOpenPosPage('/pos/orders',['till.sell'],f),f.deposits);assert.equal(canOpenPosPage('/pos/salon',['salon.view'],f),f.salon);assert.equal(canOpenPosPage('/pos/salon',[],f),false)}
 for(const key of ['CLOTHES','SUPERMARKET','SALON'])assert.equal(canOpenPosPage('/pos/floor',POS_PERMISSIONS,business(key)),false)
 assert.equal(canOpenPosPage('/pos/floor',POS_PERMISSIONS,business('CLOTHES',undefined,{tableService:true})),true)
 assert.equal(canOpenPosPage('/pos/floor',POS_PERMISSIONS,business('RESTAURANT',undefined,{tableService:false})),false)
 assert.equal(canOpenPosPage('/pos/jobs',POS_PERMISSIONS,business('CLOTHES',['VARIANTS','JOB_CARD'])),true)
 assert.equal(canOpenPosPage('/pos/salon',POS_PERMISSIONS,business('SALON',[])),false)
 assert.equal(canOpenPosPage('/pos/operations',['stock.view'],business('CLOTHES')),false)
 assert.equal(canOpenPosPage('/pos/operations',['stock.view'],business('SUPERMARKET')),true)
})

test('table and job actions reject the wrong business before reading or writing workflow records',async()=>{
 for(const [file,action,payload,flag]of [['backend/actions/pos-tables.ts','createTable',{name:'Table 1',seats:2},'tableService'],['backend/actions/pos-jobs.ts','createJobCard',{customerName:'Jane',itemDescription:'Dress'},'jobCards']]){
  const deps=depsFor(file);Object.assign(deps,{zod:require('zod'),'@prisma/client':{Prisma},'@/backend/db':{db:{}},'@/backend/services/pos-access-core':{requirePosPermission:async()=>({ok:true,actor:{shopkeeperId:'shop'}})},'@/backend/services/pos-business-features':{loadPosBusinessFeatures:async()=>({[flag]:false})}})
  const result=await loadService(file,deps)[action](payload);assert.equal(result.success,false);assert.match(result.error,/Enable|Settings/)
 }
})

const version='2026-11-05T09:00:00.000Z'
function fixture(options={}){
 let product={id:'product',name:'Item',isService:options.service??false,isActive:false,hasVariants:false,tracksBatches:false,tracksSerials:false,controlled:false,madeToOrder:false,updatedAt:new Date(version),unit:'piece',fitsWith:[],bulkUnit:null,unitsPerBulk:null,inventory:{currentStock:options.stock??0,stockOnHand:null},variants:[],salonServices:[{durationMinutes:60,commissionBps:4000}]}
 let movementCount=0,auditCount=0,salonRule=null
 const can=p=>!(options.denied||[]).includes(p)
 const actor={shopkeeperId:'shop',businessId:'business',storeId:'store',userId:'owner',staffId:null,role:'OWNER',name:'Owner',can}
 const tx={
  $queryRaw:async()=>[],
  product:{findFirst:async q=>q.where.OR?(options.clash?{id:'clash'}:null):q.where.id==='product'&&q.where.shopkeeperId==='shop'?product:null,updateMany:async q=>{if(+q.where.updatedAt!==+product.updatedAt)return{count:0};Object.assign(product,q.data);return{count:1}}},
  shopkeeperProfile:{findUnique:async()=>({posProfileKey:options.profile??'CLOTHES',posTraits:options.traits})},
  productVariant:{findFirst:async()=>null,create:async q=>{const v={id:'variant-'+product.variants.length,...q.data,currentStock:0,stockOnHand:null};product.variants.push(v);return v},update:async q=>{const v=product.variants.find(v=>v.id===q.where.id);Object.assign(v,q.data);return v}},
  posSalonService:{upsert:async q=>{salonRule=q;return q}},
 }
 const db={...tx,$transaction:async fn=>{const prior={...product,variants:product.variants.map(v=>({...v}))},moves=movementCount;try{return await fn(tx)}catch(e){product=prior;movementCount=moves;throw e}}}
 const service=loadService('backend/actions/pos-product-setup.ts',{zod:require('zod'),'@prisma/client':{Prisma},'@/backend/db':{db},'@/backend/domain/pos-business-features':features,'@/backend/services/pos-access-core':{requirePosPermission:async permission=>can(permission)?{ok:true,actor}:{ok:false},recordPosAudit:async()=>{auditCount++}},'@/backend/services/pos-ledger':{recordStockMovement:async(_tx,input)=>{movementCount++;return options.movementFailure?{ok:false,message:'Stock could not post'}:{ok:true}}}})
 return{service,get product(){return product},get movementCount(){return movementCount},get auditCount(){return auditCount},get salonRule(){return salonRule}}
}
const setupInput=()=>({productId:'product',version,hasVariants:true,tracksBatches:false,tracksSerials:false,controlled:false,madeToOrder:false,fitsWith:[],bulkUnit:'',unitsPerBulk:null,variants:[{label:'Blue / M',sku:'BLUE-M',barcode:'123456',price:null,isActive:true,openingStock:5}]})

test('clothing options save separate labels, barcodes and opening stock through the ledger; stale retries cannot post twice',async()=>{
 const f=fixture();assert.equal((await f.service.saveProductBusinessSetup(setupInput())).success,true);assert.equal(f.product.hasVariants,true);assert.equal(f.product.variants[0].label,'Blue / M');assert.equal(f.movementCount,1);assert.equal(f.auditCount,1)
 assert.equal((await f.service.saveProductBusinessSetup(setupInput())).success,false);assert.equal(f.movementCount,1)
})

test('foreign option IDs, duplicate codes, unsupported features and fractional clothing quantities do not mutate stock',async()=>{
 for(const change of [d=>{d.variants[0].id='foreign'},d=>{d.variants.push({...d.variants[0],label:'Red / M'})},d=>{d.tracksBatches=true},d=>{d.variants[0].openingStock=1.5}]){const f=fixture(),d=setupInput();change(d);assert.equal((await f.service.saveProductBusinessSetup(d)).success,false);assert.equal(f.movementCount,0);assert.equal(f.product.variants.length,0)}
 for(const settings of [{stock:10},{clash:true},{denied:['stock.adjust']},{denied:['product.edit']}]){const f=fixture(settings);assert.equal((await f.service.saveProductBusinessSetup(setupInput())).success,false);assert.equal(f.product.hasVariants,false);assert.equal(f.movementCount,0)}
})

test('a failed option stock movement rolls back the option and tracking flag',async()=>{
 const f=fixture({movementFailure:true});assert.equal((await f.service.saveProductBusinessSetup(setupInput())).success,false);assert.equal(f.product.variants.length,0);assert.equal(f.product.hasVariants,false);assert.equal(f.movementCount,0);assert.equal(f.auditCount,0)
})

test('option pricing and salon commission settings require their own grants; restricted readers do not receive commissions',async()=>{
 const priced=fixture({denied:['product.price']}),d=setupInput();d.variants[0].price=200;assert.equal((await priced.service.saveProductBusinessSetup(d)).success,false)
 const denied=fixture({profile:'SALON',service:true,denied:['salon.manage','salon.commission']});const view=await denied.service.getProductBusinessSetup('product');assert.equal(view.data.commissionBps,null);assert.equal(Object.hasOwn(view.data,'salonServices'),false)
 const rules={...setupInput(),hasVariants:false,variants:[],durationMinutes:45,commissionBps:3500};assert.equal((await denied.service.saveProductBusinessSetup(rules)).success,false)
 const owner=fixture({profile:'SALON',service:true});assert.equal((await owner.service.saveProductBusinessSetup(rules)).success,true);assert.equal(owner.salonRule.create.durationMinutes,45);assert.equal(owner.salonRule.create.commissionBps,3500)
})

function productFixture(profile){
 const file='backend/actions/pos-products.ts',deps=depsFor(file);let created
 Object.assign(deps,{zod:require('zod'),'@prisma/client':{Prisma},'@/backend/db':{db:{product:{findFirst:async()=>null,create:async q=>{created=q.data;return{id:'new-product'}}},productVariant:{findFirst:async()=>null},shopkeeperProfile:{findUnique:async()=>({posProfileKey:profile})}}},'@/backend/domain/pos-business-features':features,'@/backend/services/pos-access-core':{requirePosPermission:async()=>({ok:true,actor:{shopkeeperId:'shop',businessId:'business',role:'OWNER',name:'Owner',can:()=>true}}),recordPosAudit:async()=>{}}})
 return{service:loadService(file,deps),get created(){return created}}
}
test('salon catalogue creates service items without inventory; clothing cannot forge service selling',async()=>{
 const input={name:'Braiding',price:1500,unit:'piece',isService:true}
 const salon=productFixture('SALON');assert.equal((await salon.service.saveProduct(input)).success,true);assert.equal(salon.created.isService,true);assert.equal(salon.created.inventory,undefined)
 const clothes=productFixture('CLOTHES');assert.equal((await clothes.service.saveProduct(input)).success,false);assert.equal(clothes.created,undefined)
 const stock=productFixture('SALON');assert.equal((await stock.service.saveProduct({...input,openingStock:5})).success,false)
})

test('a new item becomes available only when valid option stock setup commits', async()=>{const f=fixture();const d={...setupInput(),activateWhenReady:true};assert.equal((await f.service.saveProductBusinessSetup(d)).success,true);assert.equal(f.product.isActive,true);const bad=fixture({movementFailure:true});assert.equal((await bad.service.saveProductBusinessSetup(d)).success,false);assert.equal(bad.product.isActive,false)})
