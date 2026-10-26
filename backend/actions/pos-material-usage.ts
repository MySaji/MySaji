"use server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { operationsActor,operationsFail as fail } from "@/backend/services/pos-operations-access"
import { materialLineSchema,materialSnapshotSchema } from "@/backend/domain/pos-operations"
import { recordStockMovement } from "@/backend/services/pos-ledger"
async function usageContext(tx:Prisma.TransactionClient,shopId:string,type:string,id:string,serviceId:string){
 if(type==="APPOINTMENT")return !!await tx.posSalonAppointment.findFirst({where:{id,shopkeeperId:shopId,serviceId,status:{in:["IN_SERVICE","COMPLETED"]}},select:{id:true}})
 if(type==="JOB")return !!await tx.posJobCard.findFirst({where:{id,shopkeeperId:shopId,status:{in:["IN_PROGRESS","READY","COLLECTED"]}},select:{id:true}})
 return !!await tx.posSaleItem.findFirst({where:{id,productId:serviceId,sale:{shopkeeperId:shopId,status:{in:["COMPLETED","PART_REFUNDED"]}}},select:{id:true}})
}
export async function postMaterialUsage(input:unknown){
 const p=z.object({shopId:z.string(),requestId:z.string().uuid(),serviceId:z.string().min(1).max(60),contextType:z.enum(["APPOINTMENT","JOB","SALE_ITEM"]),contextId:z.string().min(1).max(60),note:z.string().trim().min(3).max(300),lines:z.array(materialLineSchema).min(1).max(50)}).safeParse(input)
 if(!p.success)return fail("Select a service, a valid appointment/job/receipt line and actual material quantities.")
 const actor=await operationsActor("stock.adjust",p.data.shopId);if(!actor?.shopkeeperId)return fail("Recording material consumption requires stock adjustment access for this branch.")
 const d=p.data,shopId=actor.shopkeeperId
 const keys=d.lines.map(l=>`${l.productId}:${l.variantId}:${l.batchId}`);if(new Set(keys).size!==keys.length)return fail("List each product/variant/batch once.")
 try{return await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-usage-context'),hashtext(${shopId+':'+d.contextType+':'+d.contextId}))`
  const prior=await tx.posMaterialUsage.findUnique({where:{id:d.requestId}});if(prior)return prior.shopkeeperId===shopId?{success:true as const,id:prior.id,replayed:true}:fail("Start a new usage record.")
  if(!await tx.product.findFirst({where:{id:d.serviceId,shopkeeperId:shopId,isService:true,isActive:true},select:{id:true}})||!await usageContext(tx,shopId,d.contextType,d.contextId,d.serviceId))return fail("Use an active branch service and a service already in progress or completed in this branch.")
  if(await tx.posMaterialUsage.findFirst({where:{shopkeeperId:shopId,contextType:d.contextType,contextId:d.contextId,status:"POSTED"},select:{id:true}}))return fail("Materials are already recorded for this work. Reverse the original before correcting it.")
  const snapshots=[]
  for(const [i,line]of [...d.lines].sort((a,b)=>(a.productId+String(a.variantId)+String(a.batchId)).localeCompare(b.productId+String(b.variantId)+String(b.batchId))).entries()){
   const product=await tx.product.findFirst({where:{id:line.productId,shopkeeperId:shopId,isActive:true,isService:false},select:{id:true,name:true,unit:true,costPrice:true,tracksBatches:true,tracksSerials:true}})
   if(!product||product.tracksSerials)throw Error("Choose consumable stock from this branch. Serial-numbered parts use their serial sale/job workflow.")
   const batch=line.batchId?await tx.productBatch.findFirst({where:{id:line.batchId,shopkeeperId:shopId,productId:product.id,variantId:line.variantId,isActive:true},select:{id:true,expiryDate:true,costPrice:true}}):null
   if(product.tracksBatches&&!batch||batch?.expiryDate&&batch.expiryDate<new Date(new Date(Date.now()+10800000).toISOString().slice(0,10)+"T00:00:00+03:00"))throw Error("Choose an active, unexpired batch for this material.")
   const variant=line.variantId?await tx.productVariant.findFirst({where:{id:line.variantId,shopkeeperId:shopId,productId:product.id,isActive:true},select:{costPrice:true}}):null
   const cost=batch?.costPrice??variant?.costPrice??product.costPrice
   const movement=await recordStockMovement(tx as never,{shopkeeperId:shopId,productId:product.id,variantId:line.variantId,batchId:line.batchId,kind:"SERVICE_USAGE",quantity:new Prisma.Decimal(line.quantity).negated(),unit:product.unit,unitCost:cost,reason:`Service usage ${d.requestId}: ${d.note}`,actorUserId:actor.userId,idempotencyKey:`usage:${d.requestId}:${i}`},"BLOCK")
   if(!movement.ok)throw Error(movement.message)
   snapshots.push({...line,name:product.name,unit:product.unit,unitCost:cost?.toString()??null})
  }
  const row=await tx.posMaterialUsage.create({data:{id:d.requestId,shopkeeperId:shopId,serviceId:d.serviceId,contextType:d.contextType,contextId:d.contextId,note:d.note,lines:snapshots as Prisma.InputJsonValue,actorUserId:actor.userId,actorName:actor.name},select:{id:true}})
  await tx.posAuditEvent.create({data:{businessId:actor.businessId,storeId:actor.storeId,actorUserId:actor.userId,actorStaffId:actor.staffId,action:"service.materials",summary:`Recorded materials for ${d.contextType.toLowerCase()} ${d.contextId}`,entityType:"material_usage",entityId:row.id}})
  return {success:true as const,id:row.id,replayed:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:40000})}catch{return fail("Materials could not be posted. Check stock, batch/variant selection and concurrent changes, then retry with the same form. No partial usage was saved.")}
}
export async function reverseMaterialUsage(input:unknown){
 const p=z.object({shopId:z.string(),id:z.string().uuid(),reason:z.string().trim().min(5).max(300)}).safeParse(input);if(!p.success)return fail("Give a reversal reason of at least five characters.")
 const actor=await operationsActor("stock.adjust",p.data.shopId);if(!actor?.shopkeeperId)return fail("You cannot reverse material usage in this branch.")
 try{return await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-usage-reverse'),hashtext(${p.data.id}))`
  const row=await tx.posMaterialUsage.findFirst({where:{id:p.data.id,shopkeeperId:actor.shopkeeperId!}});if(!row)return fail("Usage record not found.")
  if(row.status==="REVERSED")return {success:true as const,replayed:true}
  const lines=materialSnapshotSchema.parse(row.lines)
  for(const [i,line]of lines.entries()){
   const movement=await recordStockMovement(tx as never,{shopkeeperId:row.shopkeeperId,productId:line.productId,variantId:line.variantId,batchId:line.batchId,kind:"SERVICE_USAGE_REVERSAL",quantity:String(line.quantity),unit:line.unit,unitCost:line.unitCost,reason:`Reversed usage ${row.id}: ${p.data.reason}`,actorUserId:actor.userId,idempotencyKey:`usage-reverse:${row.id}:${i}`},"ALLOW")
   if(!movement.ok)throw Error(movement.message)
   if(line.batchId)await tx.productBatch.updateMany({where:{id:line.batchId,shopkeeperId:row.shopkeeperId},data:{isActive:true}})
  }
  await tx.posMaterialUsage.update({where:{id:row.id},data:{status:"REVERSED",reversedAt:new Date(),reversedByUserId:actor.userId,reversalReason:p.data.reason}})
  await tx.posAuditEvent.create({data:{businessId:actor.businessId,storeId:actor.storeId,actorUserId:actor.userId,action:"service.materials_reverse",summary:p.data.reason,entityType:"material_usage",entityId:row.id}})
  return {success:true as const,replayed:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:40000})}catch{return fail("Reversal could not be posted. Refresh and retry; duplicate reversals do not restore stock twice.")}
}
