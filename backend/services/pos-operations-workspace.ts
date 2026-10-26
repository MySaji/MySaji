import "server-only"
import { db } from "@/backend/db"
import { resolvePosActor } from "@/backend/services/pos-access-core"
import { readOperationsSettings } from "@/backend/domain/pos-operations"
import { readPulseSettings } from "@/backend/domain/pos-pulse"
import { isGeminiConfigured } from "@/backend/services/ai/credentials"
export async function loadOperationsWorkspace(){
 const actor=await resolvePosActor();if(!actor?.shopkeeperId)return null
 const can={invoice:actor.can("purchase.view"),capture:actor.can("purchase.create"),receive:actor.can("stock.receive")&&actor.can("purchase.approve"),materials:actor.can("stock.adjust"),expiry:actor.can("stock.view"),booking:actor.can("salon.book"),settings:actor.role==="OWNER",handover:actor.can("report.sales")&&actor.can("expense.view"),health:actor.can("till.sell")||actor.role==="OWNER"}
 if(!Object.values(can).some(Boolean))return null
 const shopId=actor.shopkeeperId
 const [config,invoices,materials,products,batches,plans,appointments,jobs,receiptLines,waitlist,staff,pulse,site,shop]=await Promise.all([
  db.posOperationsConfig.findUnique({where:{shopkeeperId:shopId}}),
  can.invoice?db.posInvoiceDraft.findMany({where:{shopkeeperId:shopId},select:{id:true,fileName:true,status:true,receiptId:true,createdAt:true},orderBy:{createdAt:"desc"},take:100}):[],
  can.materials?db.posMaterialUsage.findMany({where:{shopkeeperId:shopId},orderBy:{postedAt:"desc"},take:100}):[],
  can.materials||can.booking?db.product.findMany({where:{shopkeeperId:shopId,isActive:true,...(!can.materials?{isService:true}:{})},select:{id:true,name:true,isService:true,unit:true,tracksSerials:true,costPrice:actor.can("report.margin"),variants:{where:{isActive:true},select:{id:true,label:true,costPrice:actor.can("report.margin")}}},orderBy:{name:"asc"},take:2000}):[],
  can.expiry||can.materials?db.productBatch.findMany({where:{shopkeeperId:shopId,isActive:true,OR:[{stockOnHand:{gt:0}},{stockOnHand:null,currentStock:{gt:0}}]},include:{product:{select:{name:true,unit:true,controlled:true,ageRestricted:true}}},orderBy:{expiryDate:"asc"},take:1000}):[],
  can.expiry?db.posExpiryPlan.findMany({where:{shopkeeperId:shopId},orderBy:{createdAt:"desc"},take:100}):[],
  can.materials?db.posSalonAppointment.findMany({where:{shopkeeperId:shopId,status:{in:["IN_SERVICE","COMPLETED"]}},select:{id:true,serviceId:true,serviceName:true,customerName:true,startsAt:true},orderBy:{startsAt:"desc"},take:100}):[],
  can.materials?db.posJobCard.findMany({where:{shopkeeperId:shopId,status:{in:["IN_PROGRESS","READY","COLLECTED"]}},select:{id:true,reference:true,itemDescription:true},orderBy:{receivedAt:"desc"},take:100}):[],
  can.materials?db.posSaleItem.findMany({where:{sale:{shopkeeperId:shopId,status:{in:["COMPLETED","PART_REFUNDED"]}},product:{isService:true}},select:{id:true,productId:true,name:true,sale:{select:{saleNumber:true}}},orderBy:{sale:{occurredAt:"desc"}},take:100}):[],
  can.booking?db.posBookingWaitlist.findMany({where:{shopkeeperId:shopId,status:{in:["WAITING","OFFERED"]}},orderBy:{createdAt:"asc"},take:100}):[],
  can.settings||can.booking?db.posStaff.findMany({where:{businessId:actor.businessId,isActive:true,OR:[{storeId:null},{storeId:actor.storeId}]},select:{id:true,name:true},orderBy:{name:"asc"}}):[],
  can.materials?db.posBusinessPulse.findUnique({where:{shopkeeperId:shopId},select:{settings:true}}):null,
  can.settings||can.booking?db.posBusinessWebsite.findUnique({where:{businessId:actor.businessId},select:{subdomain:true,publishedAt:true}}):null,
  db.shopkeeperProfile.findUnique({where:{id:shopId},select:{shopName:true,posProfileKey:true}}),
 ])
 const destinations=can.materials?await db.posStore.findMany({where:{businessId:actor.businessId,isActive:true,shopkeeperId:{not:shopId}},select:{name:true,shopkeeperId:true}}):[]
 const users=waitlist.length?await db.user.findMany({where:{id:{in:waitlist.map(w=>w.customerUserId)}},select:{id:true,name:true}}):[]
 return {shopId,storeId:actor.storeId,userId:actor.userId,shopName:shop?.shopName??actor.businessName,profileKey:shop?.posProfileKey,can,settings:readOperationsSettings(config?.settings),settingsVersion:config?.version??0,aiAvailable:isGeminiConfigured()&&!!(process.env.POS_INVOICE_MODEL||process.env.POS_WEBSITE_MODEL),
 invoices:invoices.map(i=>({...i,createdAt:i.createdAt.toISOString()})),
 usage:materials.map(m=>({...m,postedAt:m.postedAt.toISOString(),reversedAt:m.reversedAt?.toISOString()??null,lines:actor.can("report.margin")?m.lines:Array.isArray(m.lines)?m.lines.map(line=>typeof line==="object"&&line!==null?{...line,unitCost:null}:line):[]})),
 products:products.map(p=>({...p,costPrice:actor.can("report.margin")&&p.costPrice!==undefined&&p.costPrice!==null?Number(p.costPrice):null,variants:p.variants.map(v=>({...v,costPrice:actor.can("report.margin")&&v.costPrice!==undefined&&v.costPrice!==null?Number(v.costPrice):null}))})),
 batches:batches.map(b=>({id:b.id,productId:b.productId,productName:b.product.name,unit:b.product.unit,variantId:b.variantId,batchNumber:b.batchNumber,expiryDate:b.expiryDate?.toISOString()??null,onHand:Number(b.stockOnHand??b.currentStock),restricted:b.product.controlled||b.product.ageRestricted||["PHARMACY","AGROVET"].includes(shop?.posProfileKey??"")})),
 plans:plans.map(p=>({...p,quantity:Number(p.quantity),createdAt:p.createdAt.toISOString(),completedAt:p.completedAt?.toISOString()??null})),
 appointments:appointments.map(a=>({...a,startsAt:a.startsAt.toISOString()})),jobs,receiptLines,
 waitlist:waitlist.map(w=>({...w,customerName:users.find(u=>u.id===w.customerUserId)?.name??"Customer",serviceName:products.find(p=>p.id===w.serviceId)?.name??"Published service",fromDate:w.fromDate.toISOString(),toDate:w.toDate.toISOString(),offeredStartsAt:w.offeredStartsAt?.toISOString()??null,offerExpiresAt:w.offerExpiresAt?.toISOString()??null,consentAt:w.consentAt.toISOString(),createdAt:w.createdAt.toISOString()})),
 staff,destinations,recipes:readPulseSettings(pulse?.settings).recipes,website:site?{subdomain:site.subdomain,published:!!site.publishedAt}:null}
}
export type OperationsWorkspaceData=NonNullable<Awaited<ReturnType<typeof loadOperationsWorkspace>>>
