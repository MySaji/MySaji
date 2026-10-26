"use server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import crypto from "node:crypto"
import { db } from "@/backend/db"
import { activeUser } from "@/backend/services/active-user"
import { operationsActor,operationsFail as fail } from "@/backend/services/pos-operations-access"
import { operationsSettingsSchema,readOperationsSettings } from "@/backend/domain/pos-operations"
import { salonDay,salonPhone } from "@/backend/domain/pos-salon"
import { publicBookingBusiness,availableBookingSlots,occupiedAppointments,finalizeBookingDeposit } from "@/backend/services/pos-booking-core"
import { checkRateLimit } from "@/backend/services/rate-limit"
import { merchantToken,mpesaBase,mpesaPublicUrl,mpesaTokenHash } from "@/backend/services/pos-mpesa-core"
import { decryptAccountNumber } from "@/backend/services/payment-method-crypto"
export async function saveOnlineBookingSettings(input:unknown){
 const p=z.object({shopId:z.string(),version:z.number().int().min(0),settings:operationsSettingsSchema}).safeParse(input);if(!p.success)return fail("Check opening hours, weekdays, notice periods and deposit rules.")
 const actor=await operationsActor("settings.business",p.data.shopId);if(!actor?.shopkeeperId||actor.role!=="OWNER")return fail("Only the owner can publish online booking settings.")
 const shop=await db.shopkeeperProfile.findUnique({where:{id:actor.shopkeeperId},select:{posProfileKey:true,mpesaEnv:true,mpesaUseDemoCreds:true,mpesaShortcode:true,mpesaConsumerKey:true,mpesaConsumerSecret:true,mpesaPasskey:true,mpesaPromptEnabled:true}})
 if(shop?.posProfileKey!=="SALON"&&p.data.settings.bookingEnabled)return fail("Online appointments require a Salon, barber & spa branch.")
 if(p.data.settings.bookingEnabled){const count=await db.posStaff.count({where:{id:{in:p.data.settings.publicStaffIds},businessId:actor.businessId,isActive:true,OR:[{storeId:null},{storeId:actor.storeId}]}});if(!count||count!==new Set(p.data.settings.publicStaffIds).size)return fail("Choose active staff assigned to this branch for the public diary.")}
 if(p.data.settings.depositAmount>0){if(!shop||shop.mpesaEnv!=="production"||shop.mpesaUseDemoCreds||!shop.mpesaShortcode||!shop.mpesaConsumerKey||!shop.mpesaConsumerSecret||!shop.mpesaPasskey||!shop.mpesaPromptEnabled)return fail("Enable the branch's live merchant M-Pesa credentials/prompts before requiring online deposits.");try{mpesaPublicUrl()}catch{return fail("Configure a public HTTPS M-Pesa callback address before enabling deposits.")}}
 try{return await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon'),hashtext(${actor.shopkeeperId!}))`
  const current=await tx.posOperationsConfig.findUnique({where:{shopkeeperId:actor.shopkeeperId!}});if((current?.version??0)!==p.data.version)return fail("Booking settings changed. Refresh and try again.")
  await tx.posOperationsConfig.upsert({where:{shopkeeperId:actor.shopkeeperId!},create:{shopkeeperId:actor.shopkeeperId!,settings:p.data.settings as Prisma.InputJsonValue},update:{settings:p.data.settings as Prisma.InputJsonValue,version:{increment:1}}})
  await tx.posAuditEvent.create({data:{businessId:actor.businessId,storeId:actor.storeId,actorUserId:actor.userId,action:"booking.settings",summary:"Updated public diary, staff visibility and cancellation/deposit rules"}})
  return {success:true as const}
 })}catch{return fail("Online booking settings could not be saved.")}
}
export async function getPublicBookingOptions(slug:string){
 const business=await publicBookingBusiness(slug);if(!business)return fail("Online booking is not available for this business.")
 return {success:true as const,data:{name:business.name,branches:business.branches.map(b=>({id:b.id,name:b.name,services:b.services,staff:b.staff,settings:{opens:b.settings.opens,closes:b.settings.closes,noticeHours:b.settings.noticeHours,cancellationHours:b.settings.cancellationHours,cancellationPolicy:b.settings.cancellationPolicy,depositAmount:b.settings.depositAmount}}))}}
}
export async function getOnlineSlots(input:unknown){
 const p=z.object({slug:z.string().max(48),storeId:z.string().max(60),serviceId:z.string().max(60),day:z.string()}).safeParse(input);if(!p.success)return fail("Choose a branch, service and date.")
 const day=salonDay(p.data.day);if(!day||+day>Date.now()+90*86400000||+day<Date.now()-86400000)return fail("Choose a booking date within the next 90 days.")
 const business=await publicBookingBusiness(p.data.slug);if(!business)return fail("Online booking is unavailable.")
 const result=await availableBookingSlots(business,p.data.storeId,p.data.serviceId,p.data.day);if(!result)return fail("Choose a published service at an online-booking branch.")
 return {success:true as const,slots:result.slots}
}
export async function bookOnlineAppointment(input:unknown){
 const user=await activeUser();if(!user||user.role!=="CUSTOMER")return fail("Sign in with your customer account to book an appointment.")
 const p=z.object({requestId:z.string().uuid(),slug:z.string().max(48),storeId:z.string().max(60),serviceId:z.string().max(60),stylistId:z.string().max(60),startsAt:z.string().datetime(),phone:z.string().max(30),acceptPolicy:z.literal(true),waitlistId:z.string().uuid().optional()}).safeParse(input)
 if(!p.success)return fail("Choose an available slot, contact number and accept the cancellation policy.")
 const phone=salonPhone(p.data.phone);if(!/^254[17]\d{8}$/.test(phone))return fail("Use a Kenyan contact number such as 07..., 01... or +254....")
 const limit=await checkRateLimit(user.id,"online-salon-book",8,3600000);if(!limit.allowed)return fail("Booking limit reached. Manage your existing bookings or try later.")
 const d=p.data,startsAt=new Date(d.startsAt);if(+startsAt>Date.now()+90*86400000)return fail("Choose a date within the next 90 days.");const day=new Date(+startsAt+10800000).toISOString().slice(0,10)
 try{return await db.$transaction(async tx=>{
  const business=await publicBookingBusiness(d.slug,tx);if(!business)return fail("Online booking is unavailable.")
  const branch=business.branches.find(b=>b.id===d.storeId);if(!branch)return fail("The branch is not accepting online bookings.")
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon'),hashtext(${branch.shopkeeperId}))`
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon-stylist'),hashtext(${d.stylistId}))`
  const prior=await tx.posSalonAppointment.findUnique({where:{id:d.requestId}});if(prior)return prior.customerUserId===user.id?{success:true as const,id:prior.id,needsDeposit:prior.status==="AWAITING_DEPOSIT"}:fail("Start a new booking request.")
  const availability=await availableBookingSlots(business,d.storeId,d.serviceId,day,tx)
  if(!availability?.slots.some(s=>s.id===d.stylistId&&s.times.includes(d.startsAt)))return fail("That slot is no longer available. Refresh the diary and choose another.")
  const member=branch.staff.find(s=>s.id===d.stylistId)!,service=availability.service,deposit=Math.min(branch.settings.depositAmount,Math.floor(service.price)),endsAt=new Date(+startsAt+service.duration*60000)
  if(d.waitlistId){const offer=await tx.posBookingWaitlist.findFirst({where:{id:d.waitlistId,customerUserId:user.id,shopkeeperId:branch.shopkeeperId,serviceId:service.id,status:"OFFERED",offeredStartsAt:startsAt,offeredStylistId:member.id,offerExpiresAt:{gt:new Date()}}});if(!offer)return fail("This waitlist offer expired or belongs to another account.")}
  const appointment=await tx.posSalonAppointment.create({data:{id:d.requestId,shopkeeperId:branch.shopkeeperId,stylistId:member.id,stylistName:member.name,serviceId:service.id,serviceName:service.name,customerName:user.name??"Customer",customerPhone:phone,customerUserId:user.id,bookingSource:"WEB",onlineCancellationHours:branch.settings.cancellationHours,startsAt,endsAt,status:deposit>0?"AWAITING_DEPOSIT":"BOOKED",quotedPrice:service.price,depositAmount:deposit,depositState:deposit>0?"PENDING":"NONE",holdExpiresAt:deposit>0?new Date(Date.now()+10*60000):null,notes:`Customer accepted cancellation policy: ${branch.settings.cancellationPolicy}`,commissionBps:(await tx.posSalonService.findUnique({where:{productId:service.id},select:{commissionBps:true}}))?.commissionBps??0}})
  await tx.posAuditEvent.create({data:{businessId:business.businessId,storeId:branch.id,actorUserId:user.id,action:"booking.online_created",entityType:"salon_appointment",entityId:appointment.id,summary:deposit>0?"Customer reserved a time pending verified deposit":"Customer confirmed an online appointment"}})
  if(d.waitlistId){const accepted=await tx.posBookingWaitlist.updateMany({where:{id:d.waitlistId,customerUserId:user.id,status:"OFFERED",offerExpiresAt:{gt:new Date()}},data:{status:"BOOKED",appointmentId:appointment.id}});if(!accepted.count)throw Error("Waitlist offer changed before acceptance.")}
  await tx.notification.create({data:{userId:business.ownerUserId,title:deposit>0?"Online booking awaiting deposit":"New online appointment",message:`A customer reserved ${service.name}. Review the Salon diary.`,type:"SYSTEM",actionUrl:"/pos/salon"}})
  return {success:true as const,id:appointment.id,needsDeposit:deposit>0}
 },{timeout:30000})}catch{return fail("Booking could not be confirmed. Retry with the same request; it cannot create a second appointment.")}
}
export async function requestBookingDeposit(input:unknown){
 const user=await activeUser();if(!user)return fail("Sign in to pay a booking deposit.")
 const p=z.object({id:z.string().uuid()}).safeParse(input);if(!p.success)return fail("Choose your booking.")
 const a=await db.posSalonAppointment.findFirst({where:{id:p.data.id,customerUserId:user.id,status:"AWAITING_DEPOSIT",holdExpiresAt:{gt:new Date()}}});if(!a)return fail("The deposit hold expired or this booking is not payable. Refresh your bookings.")
 const knownPaid=await db.posMpesaTransaction.findFirst({where:{shopkeeperId:a.shopkeeperId,accountReference:`BOOKING:${a.id}`,status:"PAID",amount:a.depositAmount,phone:a.customerPhone,checkoutId:{not:null}},select:{checkoutId:true}})
 if(knownPaid?.checkoutId){await db.posSalonAppointment.updateMany({where:{id:a.id,customerUserId:user.id,status:"AWAITING_DEPOSIT"},data:{depositCheckoutId:knownPaid.checkoutId}});await finalizeBookingDeposit(knownPaid.checkoutId);return {success:true as const,existing:true}}
 if(a.depositCheckoutId)return {success:true as const,existing:true}
 const limit=await checkRateLimit(user.id,"booking-deposit-prompt",3,3600000);if(!limit.allowed)return fail("Prompt limit reached. Check your phone and booking payment status.")
 const shop=await db.shopkeeperProfile.findUnique({where:{id:a.shopkeeperId}})
 if(!shop||shop.mpesaEnv!=="production"||shop.mpesaUseDemoCreds||!shop.mpesaPromptEnabled||!shop.mpesaShortcode||!shop.mpesaPasskey)return fail("This business's live deposit payments are not ready. Contact the business.")
 try{
  const origin=mpesaPublicUrl(),passkey=decryptAccountNumber(shop.mpesaPasskey);if(!passkey)return fail("The business's payment credentials need attention.")
  const token=await merchantToken(shop),secret=crypto.randomBytes(32).toString("hex"),checkoutLock=`BOOKING-SENDING:${crypto.randomUUID()}`
  const claimed=await db.posSalonAppointment.updateMany({where:{id:a.id,depositCheckoutId:null,status:"AWAITING_DEPOSIT",holdExpiresAt:{gt:new Date()}},data:{depositCheckoutId:checkoutLock}});if(!claimed.count)return {success:true as const,existing:true}
  const pending=await db.posMpesaTransaction.create({data:{shopkeeperId:shop.id,shortcode:shop.mpesaShortcode,environment:"production",source:"STK",status:"PENDING",amount:a.depositAmount,phone:a.customerPhone,accountReference:`BOOKING:${a.id}`,callbackTokenHash:mpesaTokenHash(secret)}})
  const timestamp=new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)
  const response=await fetch(mpesaBase("production")+"/mpesa/stkpush/v1/processrequest",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({BusinessShortCode:shop.mpesaShortcode,Password:Buffer.from(shop.mpesaShortcode+passkey+timestamp).toString("base64"),Timestamp:timestamp,TransactionType:shop.mpesaShortcodeType==="TILL"?"CustomerBuyGoodsOnline":"CustomerPayBillOnline",Amount:Number(a.depositAmount),PartyA:a.customerPhone,PartyB:shop.mpesaShortcode,PhoneNumber:a.customerPhone,CallBackURL:`${origin}/api/mpesa/pos/stk/${secret}`,AccountReference:a.id.slice(0,12),TransactionDesc:"Booking deposit"})})
  const result=await response.json()
  if(!response.ok||typeof result.CheckoutRequestID!=="string"){await db.posMpesaTransaction.updateMany({where:{id:pending.id,status:"PENDING"},data:{status:"FAILED",resultDescription:"Booking prompt rejected"}});await db.posSalonAppointment.updateMany({where:{id:a.id,depositCheckoutId:checkoutLock},data:{depositCheckoutId:null}});return fail("The payment provider rejected this prompt. Contact the business or retry within the hold period.")}
  const accepted=await db.posMpesaTransaction.findUnique({where:{callbackTokenHash:mpesaTokenHash(secret)}})
  if(!accepted||accepted.checkoutId&&accepted.checkoutId!==result.CheckoutRequestID)return fail("Conflicting payment status. Contact the business before another payment.")
  await db.posMpesaTransaction.update({where:{id:accepted.id},data:{checkoutId:result.CheckoutRequestID}})
  await db.posSalonAppointment.updateMany({where:{id:a.id,depositCheckoutId:checkoutLock},data:{depositCheckoutId:result.CheckoutRequestID}})
  await finalizeBookingDeposit(result.CheckoutRequestID)
  return {success:true as const,existing:false}
 }catch{return fail("Deposit status is uncertain. Check your bookings and phone before retrying. The hold will expire automatically; contact the business if money was deducted.")}
}
export async function getMyOnlineBookings(slug=""){
 const user=await activeUser();if(!user)return fail("Sign in to see your bookings.");if(slug.length>48)return fail("Invalid business address.")
 const site=slug?await db.posBusinessWebsite.findUnique({where:{subdomain:slug},select:{business:{select:{stores:{select:{shopkeeperId:true}}}}}}):null
 if(slug&&!site)return fail("Business not found. Use My bookings to view all your appointments.")
 const shopFilter=site?{shopkeeperId:{in:site.business.stores.map(s=>s.shopkeeperId)}}:{}
 const pending=await db.posSalonAppointment.findMany({where:{customerUserId:user.id,...shopFilter,depositState:"PENDING"},select:{id:true,shopkeeperId:true,depositCheckoutId:true},orderBy:{createdAt:"desc"},take:20})
 for(const row of pending){
  let checkout=row.depositCheckoutId
  if(!checkout||checkout.startsWith("BOOKING-SENDING:")){
   const paid=await db.posMpesaTransaction.findFirst({where:{shopkeeperId:row.shopkeeperId,accountReference:`BOOKING:${row.id}`,status:"PAID",checkoutId:{not:null}},select:{checkoutId:true}})
   const recovered=paid??await db.posMpesaTransaction.findFirst({where:{shopkeeperId:row.shopkeeperId,accountReference:`BOOKING:${row.id}`,checkoutId:{not:null},status:{in:["PAID","PENDING","FAILED"]}},select:{checkoutId:true}})
   if(recovered?.checkoutId){await db.posSalonAppointment.updateMany({where:{id:row.id,depositCheckoutId:checkout},data:{depositCheckoutId:recovered.checkoutId}});checkout=recovered.checkoutId}
  }
  if(checkout&&!checkout.startsWith("BOOKING-SENDING:"))await finalizeBookingDeposit(checkout)
 }
 await db.posSalonAppointment.updateMany({where:{customerUserId:user.id,...shopFilter,status:"AWAITING_DEPOSIT",holdExpiresAt:{lte:new Date()}},data:{status:"CANCELLED",cancellationReason:"Deposit hold expired",version:{increment:1}}})
 const [rows,waitlist]=await Promise.all([db.posSalonAppointment.findMany({where:{customerUserId:user.id,...shopFilter},orderBy:{startsAt:"desc"},take:100,select:{id:true,serviceName:true,stylistName:true,startsAt:true,status:true,depositAmount:true,depositState:true,depositCheckoutId:true,holdExpiresAt:true,quotedPrice:true,shopkeeperId:true}}),db.posBookingWaitlist.findMany({where:{customerUserId:user.id,...shopFilter,status:{in:["WAITING","OFFERED"]}},orderBy:{createdAt:"desc"},take:50,select:{id:true,serviceId:true,shopkeeperId:true,status:true,offeredStartsAt:true,offeredStylistId:true,offerExpiresAt:true,fromDate:true,toDate:true}})])
 const ownShopIds=[...new Set([...rows.map(r=>r.shopkeeperId),...waitlist.map(w=>w.shopkeeperId)])]
 const [stores,sites,services]=await Promise.all([db.posStore.findMany({where:{shopkeeperId:{in:ownShopIds}},select:{id:true,name:true,shopkeeperId:true}}),db.posBusinessWebsite.findMany({where:{business:{stores:{some:{shopkeeperId:{in:ownShopIds}}}}},select:{subdomain:true,business:{select:{stores:{select:{shopkeeperId:true}}}}}}),db.product.findMany({where:{id:{in:waitlist.map(w=>w.serviceId)},shopkeeperId:{in:ownShopIds}},select:{id:true,name:true}})])
 const label=(shopId:string)=>({branchName:stores.find(s=>s.shopkeeperId===shopId)?.name??"Business branch",storeId:stores.find(s=>s.shopkeeperId===shopId)?.id??"",businessSlug:sites.find(s=>s.business.stores.some(b=>b.shopkeeperId===shopId))?.subdomain??""})
 return {success:true as const,rows:rows.map(r=>({...r,...label(r.shopkeeperId),startsAt:r.startsAt.toISOString(),holdExpiresAt:r.holdExpiresAt?.toISOString()??null,depositAmount:Number(r.depositAmount),quotedPrice:Number(r.quotedPrice),depositCheckoutId:undefined})),waitlist:waitlist.map(w=>({...w,...label(w.shopkeeperId),serviceName:services.find(s=>s.id===w.serviceId)?.name??"Service",offeredStartsAt:w.offeredStartsAt?.toISOString()??null,offerExpiresAt:w.offerExpiresAt?.toISOString()??null,fromDate:w.fromDate.toISOString(),toDate:w.toDate.toISOString()}))}
}
export async function cancelMyOnlineBooking(input:unknown){
 const user=await activeUser();if(!user)return fail("Sign in to manage your bookings.")
 const p=z.object({id:z.string().uuid(),reason:z.string().trim().min(3).max(200)}).safeParse(input);if(!p.success)return fail("Give a cancellation reason.")
 const initial=await db.posSalonAppointment.findFirst({where:{id:p.data.id,customerUserId:user.id},select:{shopkeeperId:true}});if(!initial)return fail("Booking not found.")
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon'),hashtext(${initial.shopkeeperId}))`
  const a=await tx.posSalonAppointment.findFirst({where:{id:p.data.id,customerUserId:user.id}});if(!a)return fail("Booking not found.")
  const settings=readOperationsSettings((await tx.posOperationsConfig.findUnique({where:{shopkeeperId:a.shopkeeperId}}))?.settings)
  if(a.status!=="AWAITING_DEPOSIT"&&+a.startsAt<Date.now()+(a.onlineCancellationHours??settings.cancellationHours)*3600000)return fail("The self-service cancellation window has closed. Contact the business.")
  const result=await tx.posSalonAppointment.updateMany({where:{id:a.id,customerUserId:user.id,version:a.version,status:{in:["BOOKED","AWAITING_DEPOSIT"]}},data:{status:"CANCELLED",cancellationReason:p.data.reason,version:{increment:1}}})
  if(!result.count)return fail("This appointment can no longer be cancelled online.")
  const store=await tx.posStore.findUnique({where:{shopkeeperId:a.shopkeeperId},select:{id:true,businessId:true,business:{select:{ownerUserId:true}}}})
  if(store){await tx.notification.create({data:{userId:store.business.ownerUserId,title:"An online appointment was cancelled",message:"A customer cancelled their appointment. Review the diary and consenting waitlist to offer the available time.",type:"SYSTEM",actionUrl:"/pos/operations"}});await tx.posAuditEvent.create({data:{businessId:store.businessId,storeId:store.id,actorUserId:user.id,action:"booking.customer_cancel",entityType:"salon_appointment",entityId:a.id,summary:p.data.reason}})}
  return {success:true as const}
 })
}

export async function joinBookingWaitlist(input:unknown){
 const user=await activeUser();if(!user||user.role!=="CUSTOMER")return fail("Sign in with a customer account to join the waitlist.")
 const p=z.object({requestId:z.string().uuid(),slug:z.string().max(48),storeId:z.string().max(60),serviceId:z.string().max(60),from:z.string(),to:z.string(),consent:z.literal(true)}).safeParse(input);if(!p.success)return fail("Choose dates and consent to in-app cancellation-slot offers.")
 const from=salonDay(p.data.from),to=salonDay(p.data.to);if(!from||!to||to<from||+from<Date.now()-86400000||+to>Date.now()+90*86400000)return fail("Choose a valid waitlist range within the next 90 days.")
 const business=await publicBookingBusiness(p.data.slug),branch=business?.branches.find(b=>b.id===p.data.storeId);if(!branch?.services.some(s=>s.id===p.data.serviceId))return fail("Choose a published branch service.")
 const limit=await checkRateLimit(user.id,"salon-waitlist",5,86400000);if(!limit.allowed)return fail("Waitlist limit reached. Manage your existing requests.")
 try{return await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-waitlist-customer'),hashtext(${user.id+branch.shopkeeperId}))`
  const prior=await tx.posBookingWaitlist.findFirst({where:{shopkeeperId:branch.shopkeeperId,customerUserId:user.id,serviceId:p.data.serviceId,status:{in:["WAITING","OFFERED"]}}});if(prior)return {success:true as const,id:prior.id}
  const row=await tx.posBookingWaitlist.create({data:{id:p.data.requestId,shopkeeperId:branch.shopkeeperId,serviceId:p.data.serviceId,customerUserId:user.id,fromDate:from,toDate:to,consentAt:new Date()}});return {success:true as const,id:row.id}
 })}catch{return fail("Waitlist request could not be saved. Refresh before trying again.")}
}
export async function withdrawBookingWaitlist(id:string){
 const user=await activeUser();if(!user)return fail("Sign in to manage your waitlist.")
 const p=z.string().uuid().safeParse(id);if(!p.success)return fail("Choose a waitlist request.")
 const row=await db.posBookingWaitlist.updateMany({where:{id:p.data,customerUserId:user.id,status:{in:["WAITING","OFFERED"]}},data:{status:"CANCELLED",offerExpiresAt:null}})
 return row.count?{success:true as const}:fail("The waitlist request already changed.")
}
export async function offerCancellationSlot(input:unknown){
 const p=z.object({shopId:z.string(),id:z.string().uuid(),stylistId:z.string().max(60),startsAt:z.string().datetime()}).safeParse(input);if(!p.success)return fail("Choose a waitlisted customer and an available slot.")
 const actor=await operationsActor("salon.book",p.data.shopId);if(!actor?.shopkeeperId)return fail("You cannot offer slots for this branch.")
 const site=await db.posBusinessWebsite.findUnique({where:{businessId:actor.businessId},select:{subdomain:true}});if(!site)return fail("Publish the business website before offering online slots.")
 try{return await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon'),hashtext(${actor.shopkeeperId!}))`
  const row=await tx.posBookingWaitlist.findFirst({where:{id:p.data.id,shopkeeperId:actor.shopkeeperId!,status:{in:["WAITING","OFFERED"]}}});if(!row)return fail("This customer is no longer waiting or withdrew consent.")
  if(row.status==="OFFERED"&&row.offerExpiresAt&&row.offerExpiresAt>new Date())return fail("This customer already has an active offer. Wait for it to expire or be withdrawn before offering again.")
  const start=new Date(p.data.startsAt);if(+start<+row.fromDate||+start>=+row.toDate+86400000)return fail("The slot is outside the customer's requested dates.")
  const business=await publicBookingBusiness(site.subdomain,tx);if(!business)return fail("Public booking is unavailable.")
  const options=await availableBookingSlots(business,actor.storeId!,row.serviceId,new Date(+start+10800000).toISOString().slice(0,10),tx)
  if(!options?.slots.some(s=>s.id===p.data.stylistId&&s.times.includes(p.data.startsAt)))return fail("Choose a currently available public booking slot.")
  await tx.posBookingWaitlist.update({where:{id:row.id},data:{status:"OFFERED",offeredStartsAt:start,offeredStylistId:p.data.stylistId,offerExpiresAt:new Date(Date.now()+30*60000)}})
  await tx.notification.create({data:{userId:row.customerUserId,title:"A salon appointment slot is available",message:"A business offered a time within your waitlist dates. Review it within 30 minutes. Availability is confirmed only when you accept.",type:"SYSTEM",actionUrl:`/customer/bookings?business=${site.subdomain}`}})
  await tx.posAuditEvent.create({data:{businessId:actor.businessId,storeId:actor.storeId,actorUserId:actor.userId,action:"booking.waitlist_offer",entityType:"waitlist",entityId:row.id,summary:"Offered an available slot to a consenting waitlisted customer"}})
  return {success:true as const}
 })}catch{return fail("The slot could not be offered. Refresh the diary and retry.")}
}
export type PublicBookingOptions=Extract<Awaited<ReturnType<typeof getPublicBookingOptions>>,{success:true}>["data"]
export type MyOnlineBookings=Extract<Awaited<ReturnType<typeof getMyOnlineBookings>>,{success:true}>
