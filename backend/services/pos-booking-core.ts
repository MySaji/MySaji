import "server-only"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { validBusinessSubdomain,websiteContentSchema } from "@/backend/domain/pos-website"
import { readOperationsSettings,bookingSlots } from "@/backend/domain/pos-operations"
import { salonDay } from "@/backend/domain/pos-salon"
export function occupiedAppointments(now=new Date()):Prisma.PosSalonAppointmentWhereInput{return {OR:[{status:{in:["BOOKED","CHECKED_IN","IN_SERVICE"]}},{status:"AWAITING_DEPOSIT",holdExpiresAt:{gt:now}}]}}
export async function publicBookingBusiness(slug:string,tx:Prisma.TransactionClient=db){
 if(!validBusinessSubdomain(slug))return null
 const site=await tx.posBusinessWebsite.findFirst({where:{subdomain:slug,publishedAt:{not:null},business:{owner:{isActive:true,deletedAt:null}}},select:{publishedContent:true,businessId:true,business:{select:{ownerUserId:true,stores:{where:{isActive:true},select:{id:true,name:true,shopkeeperId:true}}}}}})
 if(!site)return null
 const content=websiteContentSchema.safeParse(site.publishedContent);if(!content.success)return null
 const branches=[]
 for(const store of site.business.stores){
  const [config,shop]=await Promise.all([tx.posOperationsConfig.findUnique({where:{shopkeeperId:store.shopkeeperId}}),tx.shopkeeperProfile.findUnique({where:{id:store.shopkeeperId},select:{posEnabled:true,posProfileKey:true}})])
  const settings=readOperationsSettings(config?.settings)
  if(!settings.bookingEnabled||!shop?.posEnabled||shop.posProfileKey!=="SALON"||!settings.publicStaffIds.length)continue
  const [services,staff]=await Promise.all([tx.product.findMany({where:{id:{in:content.data.productIds},shopkeeperId:store.shopkeeperId,isActive:true,isService:true},select:{id:true,name:true,price:true,discountPrice:true,salonServices:{select:{durationMinutes:true}}},orderBy:{name:"asc"}}),tx.posStaff.findMany({where:{id:{in:settings.publicStaffIds},businessId:site.businessId,isActive:true,OR:[{storeId:null},{storeId:store.id}]},select:{id:true,name:true},orderBy:{name:"asc"}})])
  if(!services.length||!staff.length)continue
  branches.push({id:store.id,name:store.name,shopkeeperId:store.shopkeeperId,settings,services:services.map(s=>({id:s.id,name:s.name,price:Number(s.discountPrice??s.price),duration:s.salonServices[0]?.durationMinutes??60})),staff})
 }
 return {name:content.data.name,ownerUserId:site.business.ownerUserId,businessId:site.businessId,branches}
}
export async function availableBookingSlots(business:NonNullable<Awaited<ReturnType<typeof publicBookingBusiness>>>,storeId:string,serviceId:string,day:string,tx:Prisma.TransactionClient=db){
 const branch=business.branches.find(b=>b.id===storeId),start=salonDay(day);if(!branch||!start)return null
 const service=branch.services.find(s=>s.id===serviceId);if(!service)return null
 const end=new Date(+start+86400000)
 const appointments=await tx.posSalonAppointment.findMany({where:{stylistId:{in:branch.staff.map(s=>s.id)},startsAt:{lt:end},endsAt:{gt:start},...occupiedAppointments()},select:{stylistId:true,startsAt:true,endsAt:true}})
 return {branch,service,slots:branch.staff.map(person=>({...person,times:bookingSlots(day,service.duration,branch.settings,appointments.filter(a=>a.stylistId===person.id))}))}
}
/** Called only after existing merchant callback validation, or from an authenticated owner's/customer's refresh. */
export async function finalizeBookingDeposit(checkoutId:string){
 const initial=await db.posSalonAppointment.findUnique({where:{depositCheckoutId:checkoutId},select:{id:true,shopkeeperId:true,stylistId:true}});if(!initial)return
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon'),hashtext(${initial.shopkeeperId}))`
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon-stylist'),hashtext(${initial.stylistId}))`
  const [appointment,payment]=await Promise.all([tx.posSalonAppointment.findUnique({where:{id:initial.id}}),tx.posMpesaTransaction.findUnique({where:{checkoutId}})])
  if(!appointment||!payment||payment.status!=="PAID"||payment.shopkeeperId!==appointment.shopkeeperId||Number(payment.amount)!==Number(appointment.depositAmount)||payment.phone?.replace(/\D/g,"")!==appointment.customerPhone?.replace(/\D/g,""))return
  if(["PAID","PAID_REVIEW"].includes(appointment.depositState))return
  const conflict=await tx.posSalonAppointment.findFirst({where:{id:{not:appointment.id},stylistId:appointment.stylistId,startsAt:{lt:appointment.endsAt},endsAt:{gt:appointment.startsAt},...occupiedAppointments()},select:{id:true}})
  const canConfirm=appointment.status==="AWAITING_DEPOSIT"&&appointment.holdExpiresAt&&appointment.holdExpiresAt>new Date()&&!conflict
  await tx.posSalonAppointment.update({where:{id:appointment.id},data:{depositState:canConfirm?"PAID":"PAID_REVIEW",...(canConfirm?{status:"BOOKED",holdExpiresAt:null}:{}),version:{increment:1}}})
 },{timeout:20000})
}
