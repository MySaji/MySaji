"use server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { operationsActor,operationsFail as fail } from "@/backend/services/pos-operations-access"
import { expiryActionAllowed } from "@/backend/domain/pos-operations"
import { recordStockMovement } from "@/backend/services/pos-ledger"
export async function createExpiryPlan(input:unknown){
 const p=z.object({shopId:z.string(),requestId:z.string().uuid(),batchId:z.string().min(1).max(60),action:z.enum(["RETURN","TRANSFER","MARKDOWN"]),quantity:z.number().positive().max(1e6).multipleOf(0.001),target:z.string().trim().min(2).max(160),note:z.string().trim().min(5).max(500)}).safeParse(input)
 if(!p.success)return fail("Choose a batch, quantity, action, destination and plan details.")
 const actor=await operationsActor("stock.adjust",p.data.shopId);if(!actor?.shopkeeperId)return fail("Expiry planning requires stock adjustment access.")
 const [batch,shop]=await Promise.all([db.productBatch.findFirst({where:{id:p.data.batchId,shopkeeperId:actor.shopkeeperId,isActive:true},include:{product:{select:{controlled:true,ageRestricted:true}}}}),db.shopkeeperProfile.findUnique({where:{id:actor.shopkeeperId},select:{posProfileKey:true}})])
 if(!batch||p.data.quantity>Number(batch.stockOnHand??batch.currentStock))return fail("The planned quantity exceeds this active batch's stock.")
 const day=new Date(new Date(Date.now()+10800000).toISOString().slice(0,10)+"T00:00:00+03:00")
 if(!expiryActionAllowed(p.data.action,!!batch.expiryDate&&batch.expiryDate<day,batch.product.controlled||batch.product.ageRestricted||["PHARMACY","AGROVET"].includes(shop?.posProfileKey??"")))return fail("Markdown plans are disabled for expired or restricted stock. Use return, disposal or the specialist inventory workflow.")
 if(p.data.action==="TRANSFER"&&!await db.posStore.findFirst({where:{businessId:actor.businessId,shopkeeperId:p.data.target,isActive:true},select:{id:true}}))return fail("Choose another active branch in this business.")
 try{
  const row=await db.posExpiryPlan.upsert({where:{id:p.data.requestId},create:{id:p.data.requestId,shopkeeperId:actor.shopkeeperId,batchId:batch.id,action:p.data.action,quantity:p.data.quantity,target:p.data.target,note:p.data.note,actorUserId:actor.userId},update:{},select:{id:true,shopkeeperId:true}})
  return row.shopkeeperId===actor.shopkeeperId?{success:true as const,id:row.id}:fail("Start a new expiry plan.")
 }catch{return fail("The expiry plan could not be saved.")}
}
export async function resolveExpiryPlan(input:unknown){
 const p=z.object({shopId:z.string(),id:z.string().uuid(),resolution:z.string().trim().min(5).max(300),cancel:z.boolean().default(false),returnConfirmed:z.boolean().default(false)}).safeParse(input);if(!p.success)return fail("Record the result or cancellation reason.")
 const actor=await operationsActor("stock.adjust",p.data.shopId);if(!actor?.shopkeeperId)return fail("You cannot resolve expiry plans for this branch.")
 try{return await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-expiry-plan'),hashtext(${p.data.id}))`
  const plan=await tx.posExpiryPlan.findFirst({where:{id:p.data.id,shopkeeperId:actor.shopkeeperId!}});if(!plan)return fail("Plan not found.")
  if(plan.status!=="PLANNED")return {success:true as const,replayed:true}
  if(plan.action==="RETURN"&&!p.data.cancel){
   if(!p.data.returnConfirmed)return fail("Confirm the physical supplier return and enter the supplier's receipt/reference. No credit or refund is implied.")
   const batch=await tx.productBatch.findFirst({where:{id:plan.batchId,shopkeeperId:plan.shopkeeperId,isActive:true},include:{product:{select:{unit:true}}}});if(!batch)return fail("The batch is no longer active.")
   const moved=await recordStockMovement(tx as never,{shopkeeperId:plan.shopkeeperId,productId:batch.productId,variantId:batch.variantId,batchId:batch.id,kind:"SUPPLIER_RETURN",quantity:plan.quantity.negated(),unit:batch.product.unit,unitCost:batch.costPrice,reason:`Supplier return ${plan.id}: ${p.data.resolution}`,actorUserId:actor.userId,idempotencyKey:`expiry-return:${plan.id}`},"BLOCK")
   if(!moved.ok)throw Error(moved.message)
  }
  if(plan.action==="TRANSFER"&&!p.data.cancel){
   const destination=await tx.posStore.findFirst({where:{businessId:actor.businessId,shopkeeperId:plan.target,isActive:true},select:{shopkeeperId:true}})
   const source=await tx.productBatch.findFirst({where:{id:plan.batchId,shopkeeperId:plan.shopkeeperId,isActive:true},include:{product:{select:{sku:true,unit:true}},variant:{select:{sku:true,label:true}}}})
   if(!destination||destination.shopkeeperId===plan.shopkeeperId||!source||source.expiryDate&&source.expiryDate<new Date(new Date(Date.now()+10800000).toISOString().slice(0,10)+"T00:00:00+03:00"))return fail("Choose a different active branch and unexpired source batch.")
   const target=await tx.product.findUnique({where:{shopkeeperId_sku:{shopkeeperId:destination.shopkeeperId,sku:source.product.sku}},include:{variants:{where:{isActive:true}}}})
   if(!target?.isActive||target.isService||!target.tracksBatches||target.unit!==source.product.unit)return fail("The destination needs the matching SKU/unit already configured for batch tracking. Set up that branch's batch inventory first.")
   const variant=source.variant?target.variants.find(v=>source.variant?.sku?v.sku===source.variant.sku:v.label===source.variant?.label):null
   if(target.hasVariants!==!!source.variant||source.variant&&!variant)return fail("Set up the matching variant SKU/label in the destination branch first.")
   const targetBatch=await tx.productBatch.create({data:{shopkeeperId:destination.shopkeeperId,productId:target.id,variantId:variant?.id??null,batchNumber:source.batchNumber,expiryDate:source.expiryDate,costPrice:source.costPrice}})
   const out=await recordStockMovement(tx as never,{shopkeeperId:plan.shopkeeperId,productId:source.productId,variantId:source.variantId,batchId:source.id,kind:"TRANSFER_OUT",quantity:plan.quantity.negated(),unit:source.product.unit,unitCost:source.costPrice,reason:`Expiry plan ${plan.id}: ${p.data.resolution}`,actorUserId:actor.userId,idempotencyKey:`expiry-transfer-out:${plan.id}`},"BLOCK")
   if(!out.ok)throw Error(out.message)
   const incoming=await recordStockMovement(tx as never,{shopkeeperId:destination.shopkeeperId,productId:target.id,variantId:variant?.id??null,batchId:targetBatch.id,kind:"TRANSFER_IN",quantity:plan.quantity,unit:target.unit,unitCost:source.costPrice,reason:`Expiry plan ${plan.id}: ${p.data.resolution}`,actorUserId:actor.userId,idempotencyKey:`expiry-transfer-in:${plan.id}`},"BLOCK")
   if(!incoming.ok)throw Error(incoming.message)
  }
  await tx.posExpiryPlan.update({where:{id:plan.id},data:{status:p.data.cancel?"CANCELLED":"COMPLETED",resolution:p.data.resolution,completedAt:new Date()}})
  await tx.posAuditEvent.create({data:{businessId:actor.businessId,storeId:actor.storeId,actorUserId:actor.userId,action:"expiry.resolve",summary:`${p.data.cancel?"Cancelled":"Completed"} ${plan.action.toLowerCase()} plan: ${p.data.resolution}`,entityType:"expiry_plan",entityId:plan.id}})
  return {success:true as const,replayed:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000})}catch{return fail("The plan could not be resolved. Check current stock and retry. No partial supplier return was saved.")}
}
