"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"
import { SALON_STATES, SALON_TRANSITIONS, salonDay, salonStart, salonCommission, salonPhone, type SalonStatus } from "@/backend/domain/pos-salon"
import type { PosPermission } from "@/backend/domain/pos-permissions"

async function gate(permission: PosPermission) {
  const result = await requirePosPermission(permission)
  if (!result.ok) return result
  if (!result.actor.shopkeeperId || !result.actor.storeId) return { ok: false as const, error: "Select an active salon branch first." }
  const shop = await db.shopkeeperProfile.findUnique({ where: { id: result.actor.shopkeeperId }, select: { posProfileKey: true } })
  if (shop?.posProfileKey !== "SALON") return { ok: false as const, error: "Select Salon, barber & spa in Till settings to use this workspace." }
  return { ok: true as const, actor: result.actor, shopId: result.actor.shopkeeperId, storeId: result.actor.storeId }
}
async function lock(tx: Prisma.TransactionClient, shop: string) { await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon'), hashtext(${shop}))` }
const fail = (error: string) => ({ success: false as const, error })
const schemaError = () => fail("Check the appointment details and dates.")
async function journal(actor: Parameters<typeof recordPosAudit>[0]["actor"], action: string, id: string, summary: string) {
  await recordPosAudit({ actor, action: `salon.${action}`, entityType: "salon_appointment", entityId: id, summary })
}

export async function getSalonWorkspace(input: unknown = {}) {
  const g = await gate("salon.view")
  if (!g.ok) return fail(g.error)
  const today = new Date(Date.now() + 10_800_000).toISOString().slice(0, 10)
  const parsed = z.object({ from: z.string().default(today), to: z.string().default(today), stylistId: z.string().max(60).default("") }).safeParse(input)
  if (!parsed.success) return schemaError()
  const from = salonDay(parsed.data.from), to = salonDay(parsed.data.to)
  if (!from || !to || from > to || to.getTime() - from.getTime() > 92 * 86_400_000) return fail("Choose valid dates covering no more than 93 days.")
  const reception = g.actor.can("salon.book"), financial = g.actor.can("salon.commission"), manage = g.actor.can("salon.manage")
  const teamScope = reception || financial
  if (!teamScope && !g.actor.staffId) return fail("Your staff account is not assigned to this salon.")
  try {
    const [appointments, services, staff] = await Promise.all([
      db.posSalonAppointment.findMany({ where: { shopkeeperId: g.shopId, startsAt: { gte: from, lt: new Date(to.getTime() + 86_400_000) },
        ...(!teamScope ? { stylistId: g.actor.staffId! } : parsed.data.stylistId ? { stylistId: parsed.data.stylistId } : {}) }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 501,
        include: { saleItem: { select: { quantity: true, sale: { select: { saleNumber: true, status: true } }, returnItems: { select: { quantity: true } } } } } }),
      db.product.findMany({ where: { shopkeeperId: g.shopId, isService: true, isActive: true }, select: { id: true, name: true, price: true, salonServices: { select: { durationMinutes: true, commissionBps: true } } }, orderBy: { name: "asc" }, take: 300 }),
      db.posStaff.findMany({ where: { businessId: g.actor.businessId, OR: [{ storeId: null }, { storeId: g.storeId }], ...(!teamScope ? { id: g.actor.staffId! } : {}) }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    ])
    return { success: true as const, data: { canBook: reception, canTeamView: teamScope, canService: g.actor.can("salon.service"), canManage: manage, canFinancial: financial,
      links: { sell: g.actor.can("till.sell"), products: g.actor.can("product.view"), customers: g.actor.can("till.sell"), stock: g.actor.can("stock.view") },
      canMatch: reception && (g.actor.can("till.sell") || financial), truncated: appointments.length > 500,
      services: services.map(s => ({ id: s.id, name: s.name, price: Number(s.price), duration: s.salonServices[0]?.durationMinutes ?? 60, commissionBps: manage || financial ? s.salonServices[0]?.commissionBps ?? 0 : null })), staff,
      appointments: appointments.slice(0, 500).map(a => {
        const returned = a.saleItem?.returnItems.reduce((sum, r) => sum + Number(r.quantity), 0) ?? 0
        const earned = a.commissionBase !== null && a.saleItem ? salonCommission(Number(a.commissionBase), a.commissionBps, returned, a.saleItem.sale.status) : null
        return { id: a.id, version: a.version, stylistId: a.stylistId, stylistName: a.stylistName, serviceName: a.serviceName, customerName: a.customerName, customerPhone: a.customerPhone, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), status: a.status as SalonStatus, notes: a.notes,
          quotedPrice: reception || financial ? Number(a.quotedPrice) : null, commission: financial ? earned : null, saleNumber: a.saleItem?.sale.saleNumber ?? null,
          paymentState: !a.saleItem ? "Not matched" : ["VOIDED", "REFUNDED"].includes(a.saleItem.sale.status) ? "Reversed" : returned > 0 ? "Returned / adjusted" : "Receipt matched", cancellationReason: a.cancellationReason }
      }) } }
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : error instanceof Error ? error.name : "UNKNOWN"
    // Log a diagnostic code only, never customer data, queries or connection URLs.
    console.error("[salon.workspace.load]", { code })
    return fail("Salon appointments could not be loaded. Please refresh and try again.")
  }
}
export type SalonWorkspace = Extract<Awaited<ReturnType<typeof getSalonWorkspace>>, { success: true }>["data"]

export async function saveSalonService(input: unknown) {
  const g = await gate("salon.manage"); if (!g.ok) return fail(g.error)
  const parsed = z.object({ productId: z.string().min(1).max(60), duration: z.number().int().min(5).max(720), commissionPercent: z.number().min(0).max(100).multipleOf(0.01) }).safeParse(input)
  if (!parsed.success) return fail("Choose a duration from 5 to 720 minutes and a commission percentage from 0 to 100.")
  const product = await db.product.findFirst({ where: { id: parsed.data.productId, shopkeeperId: g.shopId, isActive: true, isService: true }, select: { id: true } })
  if (!product) return fail("Choose an active service from this branch's catalogue.")
  const values = { durationMinutes: parsed.data.duration, commissionBps: Math.round(parsed.data.commissionPercent * 100) }
  await db.posSalonService.upsert({ where: { productId: product.id }, create: { productId: product.id, shopkeeperId: g.shopId, ...values }, update: values })
  await journal(g.actor, "service_settings", product.id, `Updated salon service duration and commission rate (${values.commissionBps / 100}%)`)
  return { success: true as const }
}

export async function bookSalonAppointment(input: unknown) {
  const g = await gate("salon.book"); if (!g.ok) return fail(g.error)
  const parsed = z.object({ serviceId: z.string().min(1).max(60), stylistId: z.string().min(1).max(60), startsAt: z.string().max(16), customerName: z.string().trim().min(2).max(100), customerPhone: z.string().trim().max(30).default(""), notes: z.string().trim().max(500).default(""), requestId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return schemaError()
  const d = parsed.data, startsAt = salonStart(d.startsAt)
  if (!startsAt || startsAt.getTime() < Date.now() - 86_400_000 || startsAt.getTime() > Date.now() + 366 * 86_400_000) return fail("Book from yesterday up to one year ahead, using East Africa Time.")
  try {
    const result = await db.$transaction(async tx => {
      await lock(tx, g.shopId)
      const prior = await tx.posSalonAppointment.findUnique({ where: { id: d.requestId }, select: { id: true, shopkeeperId: true } })
      if (prior) return prior.shopkeeperId === g.shopId ? { success: true as const, id: prior.id, replayed: true } : fail("Please start a new booking.")
      const [service, staff] = await Promise.all([
        tx.product.findFirst({ where: { id: d.serviceId, shopkeeperId: g.shopId, isActive: true, isService: true }, select: { name: true, price: true, salonServices: true } }),
        tx.posStaff.findFirst({ where: { id: d.stylistId, businessId: g.actor.businessId, isActive: true, OR: [{ storeId: null }, { storeId: g.storeId }] }, select: { id: true, name: true } }),
      ])
      if (!service || !staff) return fail("Choose an active service and an employee assigned to this branch.")
      const config = service.salonServices[0], endsAt = new Date(startsAt.getTime() + (config?.durationMinutes ?? 60) * 60_000)
      // Stylist lock spans all branches: one person cannot be booked in two places.
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon-stylist'), hashtext(${staff.id}))`
      const overlap = await tx.posSalonAppointment.findFirst({ where: { stylistId: staff.id, status: { in: ["BOOKED", "CHECKED_IN", "IN_SERVICE"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } })
      if (overlap) return fail("That stylist already has a booking during this time. Choose another time or stylist.")
      const appointment = await tx.posSalonAppointment.create({ data: { id: d.requestId, shopkeeperId: g.shopId, stylistId: staff.id, stylistName: staff.name, serviceId: d.serviceId, serviceName: service.name, customerName: d.customerName, customerPhone: d.customerPhone || null, startsAt, endsAt, notes: d.notes, quotedPrice: service.price, commissionBps: config?.commissionBps ?? 0, createdByUserId: g.actor.userId } })
      return { success: true as const, id: appointment.id, replayed: false }
    })
    if (result.success && !result.replayed) await journal(g.actor, "book", result.id, "Booked a salon appointment")
    return result
  } catch { return fail("Booking could not be saved. Retry with the same form to avoid duplicates.") }
}

export async function updateSalonAppointment(input: unknown) {
  const g = await gate("salon.view"); if (!g.ok) return fail(g.error)
  const parsed = z.object({ id: z.string().max(60), version: z.number().int().positive(), status: z.enum(SALON_STATES), reason: z.string().trim().max(300).default("") }).safeParse(input)
  if (!parsed.success) return schemaError()
  const d = parsed.data
  const result = await db.$transaction(async tx => {
    await lock(tx, g.shopId)
    const appointment = await tx.posSalonAppointment.findFirst({ where: { id: d.id, shopkeeperId: g.shopId } })
    if (!appointment || appointment.version !== d.version) return fail("This appointment changed. Refresh before trying again.")
    const reception = g.actor.can("salon.book")
    if (["CHECKED_IN", "CANCELLED", "NO_SHOW"].includes(d.status) ? !reception : !g.actor.can("salon.service") || (!reception && appointment.stylistId !== g.actor.staffId)) return fail("You cannot make this appointment change.")
    if (!SALON_TRANSITIONS[appointment.status as SalonStatus]?.includes(d.status)) return fail("That appointment transition is not allowed.")
    if (["CANCELLED", "NO_SHOW"].includes(d.status) && d.reason.length < 5) return fail("Record a reason of at least five characters.")
    if (d.status === "NO_SHOW" && appointment.startsAt > new Date()) return fail("A future appointment cannot be marked as a no-show.")
    if (d.status === "IN_SERVICE" && appointment.startsAt.getTime() > Date.now() + 30 * 60_000) return fail("This appointment is scheduled for later. Reschedule it before starting early.")
    const now = new Date()
    await tx.posSalonAppointment.update({ where: { id: d.id }, data: { status: d.status, version: { increment: 1 }, ...(d.status === "CHECKED_IN" ? { checkedInAt: now } : d.status === "IN_SERVICE" ? { startedAt: now } : d.status === "COMPLETED" ? { completedAt: now } : { cancellationReason: d.reason }) } })
    return { success: true as const }
  })
  if (result.success) await journal(g.actor, d.status.toLowerCase(), d.id, `Salon appointment ${d.status.toLowerCase().replaceAll("_", " ")}${d.reason ? `: ${d.reason}` : ""}`)
  return result
}

export async function matchSalonReceipt(input: unknown) {
  const g = await gate("salon.book"); if (!g.ok) return fail(g.error)
  if (!g.actor.can("till.sell") && !g.actor.can("salon.commission")) return fail("Receipt matching requires sales or commission access.")
  const parsed = z.object({ id: z.string().max(60), version: z.number().int().positive(), receipt: z.string().trim().min(1).max(100) }).safeParse(input)
  if (!parsed.success) return schemaError()
  const d = parsed.data
  try {
    const result = await db.$transaction(async tx => {
      await lock(tx, g.shopId)
      const a = await tx.posSalonAppointment.findFirst({ where: { id: d.id, shopkeeperId: g.shopId } })
      if (!a || a.status !== "COMPLETED") return fail("Complete the service before matching its receipt.")
      if (a.saleItemId) {
        const existing = await tx.posSaleItem.findUnique({ where: { id: a.saleItemId }, select: { sale: { select: { saleNumber: true } } } })
        return existing?.sale.saleNumber === d.receipt ? { success: true as const, replayed: true } : fail("This service is already matched. Its original receipt cannot be replaced.")
      }
      if (a.version !== d.version) return fail("The appointment changed. Refresh and retry.")
      const sale = await tx.posSale.findFirst({ where: { shopkeeperId: g.shopId, saleNumber: d.receipt, status: "COMPLETED", balanceDue: 0 }, include: { items: { where: { productId: a.serviceId ?? "unavailable" }, include: { returnItems: true, salonAppointment: { select: { id: true } } } } } })
      if (!sale || sale.amountPaid.lessThan(sale.total)) return fail("Use a fully paid, completed receipt from this branch.")
      if (a.checkedInAt && sale.occurredAt.getTime() < a.checkedInAt.getTime() - 300_000) return fail("That receipt predates this visit. Use the receipt recorded for this service.")
      const phoneMatches = !!a.customerPhone && !!sale.customerPhone && salonPhone(a.customerPhone) === salonPhone(sale.customerPhone)
      const nameMatches = !!sale.customerName && sale.customerName.trim().toLowerCase() === a.customerName.trim().toLowerCase()
      if (!phoneMatches && !nameMatches) return fail("The receipt customer must match the appointment name or phone. Record the customer details at checkout.")
      const line = sale.items.find(item => !item.salonAppointment && !item.returnItems.length && item.quantity.equals(1))
      if (!line || !sale.subtotal.greaterThan(0)) return fail("Receipt needs one unassigned, unreturned line for this service with quantity one.")
      const base = Prisma.Decimal.max(0, line.totalPrice.mul(sale.total.minus(sale.tax)).div(sale.subtotal)).toDecimalPlaces(2)
      await tx.posSalonAppointment.update({ where: { id: a.id }, data: { saleItemId: line.id, commissionBase: base, version: { increment: 1 } } })
      return { success: true as const, replayed: false }
    })
    if (result.success && !result.replayed) await journal(g.actor, "receipt_match", d.id, `Matched salon service to receipt ${d.receipt}; commission based on net service amount excluding VAT`)
    return result
  } catch { return fail("The receipt could not be matched. Refresh and retry; the same line cannot be credited twice.") }
}

export async function rescheduleSalonAppointment(input: unknown) {
  const g = await gate("salon.book"); if (!g.ok) return fail(g.error)
  const parsed = z.object({ id: z.string().max(60), version: z.number().int().positive(), startsAt: z.string().max(16) }).safeParse(input)
  if (!parsed.success) return schemaError()
  const start = salonStart(parsed.data.startsAt)
  if (!start || start.getTime() < Date.now() - 86_400_000 || start.getTime() > Date.now() + 366 * 86_400_000) return fail("Choose a time from yesterday up to one year ahead in EAT.")
  const result = await db.$transaction(async tx => {
    await lock(tx, g.shopId)
    const a = await tx.posSalonAppointment.findFirst({ where: { id: parsed.data.id, shopkeeperId: g.shopId } })
    if (!a || a.version !== parsed.data.version || !["BOOKED", "CHECKED_IN"].includes(a.status)) return fail("Only an unchanged booking that has not started can be rescheduled.")
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('saji-salon-stylist'), hashtext(${a.stylistId}))`
    const endsAt = new Date(start.getTime() + a.endsAt.getTime() - a.startsAt.getTime())
    const overlap = await tx.posSalonAppointment.findFirst({ where: { id: { not: a.id }, stylistId: a.stylistId, status: { in: ["BOOKED", "CHECKED_IN", "IN_SERVICE"] }, startsAt: { lt: endsAt }, endsAt: { gt: start } }, select: { id: true } })
    if (overlap) return fail("The stylist is already booked at that time.")
    await tx.posSalonAppointment.update({ where: { id: a.id }, data: { startsAt: start, endsAt, version: { increment: 1 } } })
    return { success: true as const }
  })
  if (result.success) await journal(g.actor, "reschedule", parsed.data.id, `Rescheduled salon appointment to ${parsed.data.startsAt} EAT`)
  return result
}
