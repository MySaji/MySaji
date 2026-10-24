"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { resolvePosActor, recordPosAudit } from "@/backend/services/pos-access-core"
import { mpesaScope } from "@/backend/domain/pos-mpesa"
import { parsePosConfig } from "@/backend/domain/pos-config"
import { answerPulse, pulseDay, readPulseSettings, restockSuggestion, roundMoney, serviceCostCard, outreachDraft, type PulseSettings } from "@/backend/domain/pos-pulse"

const fail = (error: string) => ({ success: false as const, error })
async function owner() {
  const actor = await resolvePosActor()
  return actor?.role === "OWNER" && actor.shopkeeperId ? actor : null
}
export async function getBusinessPulse(input: unknown = {}) {
  const actor = await owner()
  if (!actor?.shopkeeperId) return fail("Only the business owner can open Business pulse. Select an active branch first.")
  const parsed = z.object({ day: z.string().default(new Date(Date.now()+10800000).toISOString().slice(0,10)) }).safeParse(input)
  const from = parsed.success ? pulseDay(parsed.data.day) : null
  if (!from || +from > Date.now()) return fail("Choose a valid date up to today, in East Africa Time.")
  const to = new Date(+from + 86400000), since = new Date(+to - 30*86400000), shopkeeperId = actor.shopkeeperId
  const shop = await db.shopkeeperProfile.findUnique({where:{id:shopkeeperId},select:{shopName:true,posProfileKey:true,posConfig:true,mpesaEnv:true,mpesaUseDemoCreds:true,mpesaShortcode:true}})
  if (!shop) return fail("Branch not found.")
  const merchant = mpesaScope(shop)
  const [sales, expenses, refunds, shifts, transactions, products, velocity, returned, changes, customers, orders, suppliers, staff] = await Promise.all([
    db.posSale.findMany({where:{shopkeeperId,occurredAt:{gte:from,lt:to}},orderBy:{id:"asc"},take:10001,select:{id:true,saleNumber:true,total:true,discount:true,subtotal:true,tax:true,status:true,cashierName:true,occurredAt:true,amountPaid:true,changeGiven:true,balanceDue:true,payments:{select:{id:true,method:true,amount:true,reference:true,stkConfirmed:true}},items:{select:{quantity:true,costAtSale:true}}}}),
    db.posExpense.aggregate({where:{shopkeeperId,voidedAt:null,occurredAt:{gte:from,lt:to}},_sum:{amount:true},_count:true}),
    db.posReturn.aggregate({where:{shopkeeperId,occurredAt:{gte:from,lt:to}},_sum:{totalRefunded:true},_count:true}),
    db.tillSession.findMany({where:{shopkeeperId,closedAt:{gte:from,lt:to}},orderBy:{closedAt:"desc"},take:1001,select:{id:true,cashierName:true,expectedCash:true,countedCash:true,variance:true,closedAt:true}}),
    db.posMpesaTransaction.findMany({where:{shopkeeperId,environment:merchant.environment,shortcode:merchant.shortcode,OR:[{confirmedAt:{gte:from,lt:to}},{confirmedAt:null,createdAt:{gte:from,lt:to}}]},orderBy:{createdAt:"desc"},take:5001,select:{id:true,status:true,amount:true,receipt:true,consumedSaleId:true,source:true,createdAt:true}}),
    db.product.findMany({where:{shopkeeperId,isActive:true},orderBy:{id:"asc"},take:2001,select:{id:true,name:true,sku:true,barcode:true,unit:true,isService:true,hasVariants:true,price:true,costPrice:true,createdAt:true,inventory:{select:{currentStock:true,stockOnHand:true,reservedStock:true,lowStockThreshold:true}},variants:{where:{isActive:true},select:{id:true,label:true,sku:true,currentStock:true,stockOnHand:true}},salonServices:{select:{commissionBps:true}}}}),
    db.posSaleItem.groupBy({by:["productId","variantId"],where:{sale:{shopkeeperId,occurredAt:{gte:since,lt:to},status:{in:["COMPLETED","PART_REFUNDED"]}}},_sum:{quantity:true}}),
    db.posReturnItem.groupBy({by:["productId","variantId"],where:{returnRow:{shopkeeperId,sale:{occurredAt:{gte:since,lt:to},status:{in:["COMPLETED","PART_REFUNDED"]}}}},_sum:{quantity:true}}),
    db.stockMovement.findMany({where:{shopkeeperId,occurredAt:{gte:from,lt:to},kind:{in:["COUNT_ADJUSTMENT","WASTAGE"]}},orderBy:{occurredAt:"desc"},take:51,select:{id:true,productId:true,quantity:true,reason:true,kind:true}}),
    db.posCustomer.findMany({where:{shopkeeperId,isActive:true},orderBy:{id:"asc"},take:2001,select:{id:true,name:true,phone:true,pointsBalance:true,lastSeenAt:true,visits:true}}),
    db.posPurchaseOrder.count({where:{shopkeeperId,status:{in:["ORDERED","PART_RECEIVED"]}}}),
    db.posSupplier.findMany({where:{shopkeeperId,isActive:true},select:{id:true,name:true},orderBy:{name:"asc"},take:300}),
    db.posStaff.findMany({where:{businessId:actor.businessId,isActive:true,OR:[{storeId:null},{storeId:actor.storeId}]},select:{id:true,name:true},orderBy:{name:"asc"}}),
  ])
  let saved: { settings: unknown; version: number } | null = null, planningAvailable = true
  try { saved = await db.posBusinessPulse.findUnique({where:{shopkeeperId}}) } catch { planningAvailable = false }
  const settings = readPulseSettings(saved?.settings), config = parsePosConfig(shop.posConfig)
  const limited = sales.length>10000 || products.length>2000 || transactions.length>5000 || shifts.length>1000 || customers.length>2000
  const saleRows=sales.slice(0,10000), productRows=products.slice(0,2000), txRows=transactions.slice(0,5000)
  const active = saleRows.filter(s=>!["PARKED","VOIDED"].includes(s.status))
  const earned = active.filter(s=>["COMPLETED","PART_REFUNDED","REFUNDED"].includes(s.status))
  const recordedSales = roundMoney(earned.reduce((n,s)=>n+Number(s.total),0))
  const tenders = active.flatMap(s=>s.payments.map(p=>({...p,saleId:s.id,saleNumber:s.saleNumber})))
  const collected = roundMoney(tenders.filter(p=>!["CREDIT","GIFT_CARD"].includes(p.method)).reduce((n,p)=>n+Number(p.amount),0))
  const spent = Number(expenses._sum.amount??0), refund = Number(refunds._sum.totalRefunded??0)
  const missingCostLines=earned.flatMap(s=>s.items).filter(i=>i.costAtSale===null).length
  const restock = productRows.filter(p=>!p.isService).flatMap(p=>{
    const variants=p.hasVariants?p.variants:[null]
    return variants.map(v=>{
      const sold = Math.max(0,Number(velocity.find(r=>r.productId===p.id&&r.variantId===(v?.id??null))?._sum.quantity??0)-Number(returned.find(r=>r.productId===p.id&&r.variantId===(v?.id??null))?._sum.quantity??0))
      const onHand = v?Number(v.stockOnHand??v.currentStock):Number(p.inventory?.stockOnHand??p.inventory?.currentStock??0)-Number(p.inventory?.reservedStock??0)
      const suggestion=restockSuggestion(onHand,sold,settings.leadDays,settings.coverDays,!["piece","pack","pair","box","bottle"].includes(p.unit))
      return {productId:p.id,variantId:v?.id??null,name:p.name+(v?` - ${v.label}`:""),unit:p.unit,stock:onHand,sold,cost:p.costPrice===null?null:Number(p.costPrice),...suggestion,shortHistory:+p.createdAt>+since}
    })
  }).sort((a,b)=>(a.daysLeft??Infinity)-(b.daysLeft??Infinity)||b.sold-a.sold)
  const unmatched=txRows.filter(t=>t.status==="PAID"&&!t.consumedSaleId)
  const moneyRows=tenders.filter(p=>p.method==="MPESA").map(p=>{
    const matches=txRows.filter(t=>t.status==="PAID"&&t.consumedSaleId===p.saleId&&t.receipt&&t.receipt===p.reference)
    const exact=matches.length===1&&Math.abs(Number(matches[0].amount)-Number(p.amount))<0.005
    return {id:p.id,saleId:p.saleId,saleNumber:p.saleNumber,reference:p.reference,amount:Number(p.amount),state:exact?"Matched":"Review",explanation:exact?"Receipt, linked sale and amount match a confirmed merchant payment.":"No exact match in this day's merchant receipts. Review Payments; a payment may have arrived on another day."}
  })
  const alerts: {id:string;title:string;detail:string;href:string}[]=[]
  for(const sale of saleRows){
    if(["VOIDED","REFUNDED","PART_REFUNDED"].includes(sale.status))alerts.push({id:`sale-${sale.id}`,title:`${sale.saleNumber}: ${sale.status.toLowerCase().replaceAll('_',' ')}`,detail:`Recorded by ${sale.cashierName??"unknown"}. Open the sales report and audit trail to review.`,href:"/pos/audit"})
    const percent=Number(sale.subtotal)>0?Number(sale.discount)/Number(sale.subtotal)*100:0
    if(percent>=settings.discountPercent)alerts.push({id:`discount-${sale.id}`,title:`${sale.saleNumber}: ${percent.toFixed(1)}% discount`,detail:`Meets the owner's ${settings.discountPercent}% review threshold. This is a review flag, not evidence of wrongdoing.`,href:"/pos/audit"})
  }
  for(const shift of shifts.slice(0,1000))if(shift.variance!==null&&Number(shift.variance)!==0)alerts.push({id:`shift-${shift.id}`,title:`Cash difference: KSh ${Number(shift.variance).toFixed(2)}`,detail:`${shift.cashierName??"Unnamed cashier"}; counted less expected cash.`,href:"/pos/shifts"})
  for(const movement of changes.slice(0,50))alerts.push({id:movement.id,title:`Stock ${movement.kind.toLowerCase().replaceAll('_',' ')}`,detail:`${Number(movement.quantity)} units; ${movement.reason??"no reason recorded"}. Review the stock ledger.`,href:"/pos/stock"})
  const recipes=settings.recipes.map(recipe=>{
    const service=productRows.find(p=>p.id===recipe.serviceId&&p.isService)
    if(!service)return null
    const price=Number(service.price),exTax=config.taxInclusive?price/(1+config.taxRate/100):price
    const materials=recipe.materials.map(m=>{const product=productRows.find(p=>p.id===m.productId&&!p.isService);return {...m,name:product?.name??"Unavailable material",unit:product?.unit??"",cost:product?.costPrice==null?null:Number(product.costPrice)}})
    return {serviceId:service.id,name:service.name,price,exTax:roundMoney(exTax),commissionPercent:recipe.commissionPercent,materials,...serviceCostCard(exTax,recipe.commissionPercent,materials)}
  }).filter(r=>r!==null)
  const outreach=customers.slice(0,2000).map(c=>{
    const consent=settings.consents.find(s=>s.customerId===c.id)
    const days=c.lastSeenAt?Math.max(0,Math.floor((+to-+c.lastSeenAt)/86400000)):null
    return {...c,lastSeenAt:c.lastSeenAt?.toISOString()??null,daysSinceVisit:days,eligible:!!consent?.allowed&&days!==null&&days>=settings.returnAfterDays,consent:consent??null}
  })
  return {success:true as const,data:{shopName:shop.shopName,salon:shop.posProfileKey==="SALON",day:parsed.success?parsed.data.day:"",generatedAt:new Date().toISOString(),version:saved?.version??0,planningAvailable,settings,limited,
    brief:{sales:recordedSales,saleCount:earned.length,collected,expenses:spent,expenseCount:expenses._count,refunds:refund,refundCount:refunds._count,missingCostLines,unmatched:unmatched.length,pendingPrompts:txRows.filter(t=>t.status==="PENDING").length},
    money:{rows:moneyRows.slice(0,200),rowCount:moneyRows.length,unmatched:unmatched.map(t=>({id:t.id,receipt:t.receipt,amount:Number(t.amount)})),shifts:shifts.slice(0,1000).map(s=>({...s,expectedCash:s.expectedCash===null?null:Number(s.expectedCash),countedCash:s.countedCash===null?null:Number(s.countedCash),variance:s.variance===null?null:Number(s.variance),closedAt:s.closedAt?.toISOString()??null})),environment:merchant.environment,shortcode:merchant.shortcode},
    alerts:alerts.slice(0,100),alertsLimited:alerts.length>100||changes.length>50,restock,openOrders:orders,suppliers,staff,outreach,recipes,
    catalogue:productRows.map(p=>({id:p.id,name:p.name,isService:p.isService,unit:p.unit,cost:p.costPrice===null?null:Number(p.costPrice),commissionPercent:(p.salonServices[0]?.commissionBps??0)/100})),
  }}
}
export type BusinessPulse = Extract<Awaited<ReturnType<typeof getBusinessPulse>>,{success:true}>["data"]

const settingsChange=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("rules"),leadDays:z.number().int().min(0).max(90),coverDays:z.number().int().min(1).max(90),discountPercent:z.number().min(1).max(100),returnAfterDays:z.number().int().min(7).max(365)}),
 z.object({kind:z.literal("consent"),customerId:z.string().min(1).max(60),allowed:z.boolean(),evidence:z.string().trim().min(5).max(200)}),
 z.object({kind:z.literal("recipe"),serviceId:z.string().min(1).max(60),commissionPercent:z.number().min(0).max(100),materials:z.array(z.object({productId:z.string().min(1).max(60),quantity:z.number().positive().max(100000)})).min(1).max(30)}),
])
export async function savePulseSettings(input:unknown){
 const actor=await owner();if(!actor?.shopkeeperId)return fail("Only the owner can change these settings.")
 const parsed=z.object({version:z.number().int().min(0),change:settingsChange}).safeParse(input)
 if(!parsed.success)return fail("Check the planning rules, quantities and consent evidence.")
 const {change,version}=parsed.data,shopkeeperId=actor.shopkeeperId
 if(change.kind==="consent"&&!await db.posCustomer.findFirst({where:{id:change.customerId,shopkeeperId,isActive:true},select:{id:true}}))return fail("Customer not found in this branch.")
 if(change.kind==="recipe"){
  if(new Set(change.materials.map(m=>m.productId)).size!==change.materials.length)return fail("List each material once.")
  const [service,materials]=await Promise.all([db.product.count({where:{id:change.serviceId,shopkeeperId,isActive:true,isService:true}}),db.product.count({where:{id:{in:change.materials.map(m=>m.productId)},shopkeeperId,isActive:true,isService:false}})])
  if(!service||materials!==change.materials.length)return fail("Select an active service and materials from this branch.")
 }
 try{
  return await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-pulse'),hashtext(${shopkeeperId}))`
   const current=await tx.posBusinessPulse.findUnique({where:{shopkeeperId}})
   if((current?.version??0)!==version)return fail("Planning settings changed. Refresh and try again.")
   const config:PulseSettings=readPulseSettings(current?.settings)
   if(change.kind==="rules")Object.assign(config,{leadDays:change.leadDays,coverDays:change.coverDays,discountPercent:change.discountPercent,returnAfterDays:change.returnAfterDays})
   if(change.kind==="consent")config.consents=[...config.consents.filter(c=>c.customerId!==change.customerId),{customerId:change.customerId,allowed:change.allowed,evidence:change.evidence,at:new Date().toISOString(),recordedBy:actor.name}]
   if(change.kind==="recipe")config.recipes=[...config.recipes.filter(r=>r.serviceId!==change.serviceId),{serviceId:change.serviceId,commissionPercent:change.commissionPercent,materials:change.materials}]
   if(config.consents.length>2000||config.recipes.length>200)return fail("Planning capacity reached. Contact support before adding more records.")
   await tx.posBusinessPulse.upsert({where:{shopkeeperId},create:{shopkeeperId,settings:config as Prisma.InputJsonValue},update:{settings:config as Prisma.InputJsonValue,version:{increment:1}}})
   // Audit includes changes/evidence, so revoking consent never erases its history.
   await tx.posAuditEvent.create({data:{businessId:actor.businessId,storeId:actor.storeId,actorUserId:actor.userId,actorStaffId:actor.staffId,action:`pulse.${change.kind}`,entityType:"business_pulse",entityId:shopkeeperId,summary:`Updated ${change.kind} planning records`,detail:change as Prisma.InputJsonValue}})
   return {success:true as const}
  })
 }catch{return fail("Could not save planning settings. Check connectivity and that the Business pulse migration is installed.")}
}
export async function getPulseAnswer(input:unknown){
 const parsed=z.object({day:z.string(),question:z.string().trim().min(2).max(300),language:z.enum(["en","sw"])}).safeParse(input)
 if(!parsed.success)return fail("Choose a language and enter a question of 2 to 300 characters.")
 const result=await getBusinessPulse({day:parsed.data.day});if(!result.success)return result
 const data=result.data
 return {success:true as const,...answerPulse(parsed.data.question,parsed.data.language,{day:data.day,...data.brief,lowStock:data.restock.filter(r=>r.quantity>0).length,top:[...data.restock].sort((a,b)=>b.sold-a.sold)[0]?.name??"No recorded sales / Hakuna mauzo",limited:data.limited})}
}
export async function prepareCustomerFollowup(input:unknown){
 const actor=await owner();if(!actor?.shopkeeperId)return fail("Only the owner can prepare customer follow-ups.")
 const parsed=z.object({customerId:z.string().min(1).max(60),language:z.enum(["en","sw"])}).safeParse(input)
 if(!parsed.success)return fail("Choose a customer and language.")
 const [row,customer,shop]=await Promise.all([db.posBusinessPulse.findUnique({where:{shopkeeperId:actor.shopkeeperId}}),db.posCustomer.findFirst({where:{id:parsed.data.customerId,shopkeeperId:actor.shopkeeperId,isActive:true},select:{name:true,phone:true,pointsBalance:true}}),db.shopkeeperProfile.findUnique({where:{id:actor.shopkeeperId},select:{shopName:true,posProfileKey:true}})])
 if(!customer||!shop||!readPulseSettings(row?.settings).consents.some(c=>c.customerId===parsed.data.customerId&&c.allowed))return fail("Record the customer's explicit WhatsApp marketing consent first.")
 const text=outreachDraft(customer.name,shop.shopName,customer.pointsBalance,parsed.data.language,shop.posProfileKey==="SALON")
 await recordPosAudit({actor,action:"pulse.followup_draft",entityType:"customer",entityId:parsed.data.customerId,summary:"Prepared a customer follow-up draft; no message sent"})
 return {success:true as const,text,url:`https://wa.me/${customer.phone.replace(/\D/g,"")}?text=${encodeURIComponent(text)}`}
}
export async function createPulsePurchaseDraft(input:unknown){
 const actor=await owner();if(!actor?.shopkeeperId)return fail("Only the owner can create this draft.")
 const parsed=z.object({requestId:z.string().uuid(),supplierId:z.string().min(1).max(60),lines:z.array(z.object({productId:z.string().min(1).max(60),variantId:z.string().min(1).max(60).nullable(),quantity:z.number().positive().max(1000000),unitCost:z.number().nonnegative().max(10000000)})).min(1).max(100)}).safeParse(input)
 if(!parsed.success)return fail("Choose a supplier, quantities and purchase costs for up to 100 lines.")
 const d=parsed.data,shopkeeperId=actor.shopkeeperId
 if(new Set(d.lines.map(l=>`${l.productId}:${l.variantId}`)).size!==d.lines.length)return fail("Select each item once.")
 const [supplier,products]=await Promise.all([db.posSupplier.findFirst({where:{id:d.supplierId,shopkeeperId,isActive:true},select:{id:true}}),db.product.findMany({where:{id:{in:d.lines.map(l=>l.productId)},shopkeeperId,isActive:true,isService:false},select:{id:true,name:true,unit:true,hasVariants:true,variants:{where:{isActive:true},select:{id:true,label:true}}}})])
 if(!supplier)return fail("Choose an active supplier from this branch.")
 const lines: {productId:string;variantId:string|null;name:string;unit:string;quantity:Prisma.Decimal;unitCost:Prisma.Decimal}[]=[]
 for(const line of d.lines){
  const product=products.find(p=>p.id===line.productId),variant=product?.variants.find(v=>v.id===line.variantId)
  if(!product||(product.hasVariants?!variant:line.variantId!==null))return fail("One of the selected items is unavailable or belongs to another branch.")
  lines.push({productId:product.id,variantId:line.variantId,name:product.name+(variant?` - ${variant.label}`:""),unit:product.unit,quantity:new Prisma.Decimal(line.quantity),unitCost:new Prisma.Decimal(line.unitCost)})
 }
 try{
  const result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-pulse-purchase'),hashtext(${shopkeeperId}))`
   const previous=await tx.posPurchaseOrder.findUnique({where:{id:d.requestId},select:{id:true,orderNumber:true,shopkeeperId:true}})
   if(previous)return previous.shopkeeperId===shopkeeperId?{success:true as const,id:previous.id,orderNumber:previous.orderNumber}:fail("Start a new purchase draft.")
   const total=lines.reduce((sum,l)=>sum.add(l.quantity.mul(l.unitCost)),new Prisma.Decimal(0))
   const order=await tx.posPurchaseOrder.create({data:{id:d.requestId,shopkeeperId,supplierId:supplier.id,orderNumber:`PLAN-${d.requestId.slice(0,8).toUpperCase()}`,status:"DRAFT",expectedTotal:total,notes:"Owner-reviewed restocking plan. Quantities are suggestions, not automatic orders.",createdByUserId:actor.userId,createdByName:actor.name,items:{create:lines}},select:{id:true,orderNumber:true}})
   await tx.posAuditEvent.create({data:{businessId:actor.businessId,storeId:actor.storeId,actorUserId:actor.userId,action:"pulse.purchase_draft",summary:`Created restocking draft ${order.orderNumber}`,entityType:"PosPurchaseOrder",entityId:order.id}})
   return {success:true as const,...order}
  })
  return result
 }catch{return fail("Could not save the draft. Retry with the same selection; the request will not create a second order.")}
}
