"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requireAdmin, logAdminAction } from "@/backend/actions/admin-dashboard"
import {
  getPriceList, parsePriceList, billingStateOf, advanceBilling, settleCharge,
  ensureSubscription, addDays, addMonth,
  type PosPriceList,
} from "@/backend/services/pos-billing"

/**
 * The admin side of POS subscriptions.
 *
 * WHAT AN ADMIN CAN AND CANNOT DO HERE
 *
 * They set the price list, see every POS business and what it owes, take a
 * payment that arrived by some route the platform did not see, waive a
 * charge, and pause or restore a till. They cannot quietly reprice an
 * existing shop by editing the list: that is a separate, deliberate action
 * against one business, and it leaves a note saying who did it.
 *
 * WHY SUSPENDING IS NOT DELETING
 *
 * A suspended till stops SELLING. Its stock, sales history, customers and
 * reports stay readable and exportable. Holding a shopkeeper's own records
 * hostage to collect a subscription is not a thing this platform does, and
 * writing that down here is cheaper than relearning it later.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal | null | undefined) => (d == null ? 0 : Number(d.toFixed(2)))

// ----------------------------------------------------------------- the price

export type PosBillingSettings = {
  list: PosPriceList
  /** How many businesses are on each footing, so a change has context. */
  counts: { total: number; trial: number; active: number; pastDue: number; suspended: number }
  /** What is owed across the platform, and what has been collected. */
  owed: number
  collected: number
  canEdit: boolean
} | null

export async function getPosBillingSettings(): Promise<PosBillingSettings> {
  const admin = await requireAdmin()
  if (!admin) return null

  const list = await getPriceList()

  const [grouped, total, due, paid] = await Promise.all([
    db.posSubscription.groupBy({ by: ["status"], _count: { id: true } }),
    db.posBusiness.count(),
    db.posBillingCharge.aggregate({ where: { status: "DUE" }, _sum: { amount: true } }),
    db.posBillingCharge.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
  ])
  const by = new Map(grouped.map((g) => [g.status, g._count.id]))

  return {
    list,
    counts: {
      total,
      trial: by.get("TRIAL") ?? 0,
      active: by.get("ACTIVE") ?? 0,
      pastDue: by.get("PAST_DUE") ?? 0,
      suspended: by.get("SUSPENDED") ?? 0,
    },
    owed: money(due._sum.amount),
    collected: money(paid._sum.amount),
    canEdit: true,
  }
}

export type PosBillingResult = { success: true; message?: string } | { success: false; error: string }

export async function setPosPriceList(input: unknown): Promise<PosBillingResult> {
  const parsed = z.object({
    enabled: z.boolean(),
    setupFee: z.number().min(0).max(10_000_000),
    monthlyFee: z.number().min(0).max(10_000_000),
    trialDays: z.number().int().min(0).max(365),
    graceDays: z.number().int().min(0).max(90),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the figures" }

  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can change the price list." }

  const list = parsePriceList({ ...parsed.data, currency: "KES" })

  const before = await getPriceList()
  await db.platformSetting.upsert({
    where: { key: "pos_billing" },
    update: { value: list as never, updatedById: admin.userId },
    create: { key: "pos_billing", value: list as never, updatedById: admin.userId },
  })
  await logAdminAction({
    userId: admin.userId,
    action: "pos_billing.price_list",
    entityType: "platform_setting",
    entityId: "pos_billing",
    oldValues: before as unknown as Record<string, unknown>,
    newValues: list as unknown as Record<string, unknown>,
  })

  return {
    success: true,
    message: "Saved. This is what NEW businesses will pay; shops already signed up keep the price they agreed to.",
  }
}

// -------------------------------------------------------------- the POS users

export type AdminPosRow = {
  businessId: string
  businessName: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string | null
  stores: number
  staff: number
  /** Sales rung up in the last 30 days, so an admin can see a live till. */
  salesLast30: number
  takingsLast30: number
  status: string
  canSell: boolean
  owed: number
  setupFee: number
  monthlyFee: number
  setupSettled: boolean
  trialEndsAt: string | null
  periodEndsAt: string | null
  lastPaidAt: string | null
  adminNote: string | null
  createdAt: string
}

export async function getAdminPosBusinesses(input?: unknown): Promise<AdminPosRow[]> {
  const parsed = z.object({
    query: z.string().trim().max(80).optional(),
    status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]).optional(),
  }).safeParse(input ?? {})
  const admin = await requireAdmin()
  if (!admin) return []

  // Businesses that predate billing get a subscription on first sight, so an
  // admin opening this page is not looking at half a list.
  const missing = await db.posBusiness.findMany({
    where: { subscription: null },
    select: { id: true },
    take: 200,
  })
  for (const m of missing) await ensureSubscription(m.id)
  await advanceBilling()

  const q = parsed.success ? parsed.data.query : undefined
  const status = parsed.success ? parsed.data.status : undefined

  const businesses = await db.posBusiness.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { owner: { name: { contains: q, mode: "insensitive" } } },
              { owner: { email: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(status ? { subscription: { status: status as never } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, name: true, createdAt: true,
      owner: { select: { name: true, email: true, phone: true } },
      subscription: true,
      stores: { where: { isActive: true }, select: { id: true, shopkeeperId: true } },
      _count: { select: { staff: true } },
    },
  })

  const shopIds = businesses.flatMap((b) => b.stores.map((s) => s.shopkeeperId))
  const since = addDays(new Date(), -30)
  const sales = shopIds.length
    ? await db.posSale.groupBy({
        by: ["shopkeeperId"],
        where: {
          shopkeeperId: { in: shopIds },
          occurredAt: { gte: since },
          status: { notIn: ["VOIDED", "PARKED"] },
        },
        _count: { id: true },
        _sum: { total: true },
      })
    : []
  const salesBy = new Map(sales.map((s) => [s.shopkeeperId, s]))

  const due = await db.posBillingCharge.groupBy({
    by: ["businessId"],
    where: { status: "DUE", businessId: { in: businesses.map((b) => b.id) } },
    _sum: { amount: true },
  })
  const owedBy = new Map(due.map((d) => [d.businessId, money(d._sum.amount)]))

  return businesses.map((b) => {
    const mine = b.stores.map((s) => salesBy.get(s.shopkeeperId)).filter(Boolean)
    const sub = b.subscription
    return {
      businessId: b.id,
      businessName: b.name,
      ownerName: b.owner.name,
      ownerEmail: b.owner.email,
      ownerPhone: b.owner.phone,
      stores: b.stores.length,
      staff: b._count.staff,
      salesLast30: mine.reduce((t, s) => t + (s!._count.id ?? 0), 0),
      takingsLast30: mine.reduce((t, s) => t + Number(s!._sum.total ?? 0), 0),
      status: sub?.status ?? "ACTIVE",
      canSell: sub ? sub.status !== "SUSPENDED" && sub.status !== "CANCELLED" : true,
      owed: owedBy.get(b.id) ?? 0,
      setupFee: money(sub?.setupFee),
      monthlyFee: money(sub?.monthlyFee),
      setupSettled: sub?.setupSettled ?? true,
      trialEndsAt: sub?.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
      periodEndsAt: sub?.periodEndsAt ? sub.periodEndsAt.toISOString() : null,
      lastPaidAt: sub?.lastPaidAt ? sub.lastPaidAt.toISOString() : null,
      adminNote: sub?.adminNote ?? null,
      createdAt: b.createdAt.toISOString(),
    }
  })
}

export type AdminChargeRow = {
  id: string
  kind: string
  status: string
  amount: number
  periodStart: string | null
  periodEnd: string | null
  paidAt: string | null
  paidMethod: string | null
  reference: string | null
  recordedBy: string | null
  note: string | null
  createdAt: string
}

export async function getAdminPosCharges(input: unknown): Promise<AdminChargeRow[]> {
  const parsed = z.object({ businessId: z.string().trim().min(1) }).safeParse(input)
  if (!parsed.success) return []
  const admin = await requireAdmin()
  if (!admin) return []

  const rows = await db.posBillingCharge.findMany({
    where: { businessId: parsed.data.businessId },
    orderBy: { createdAt: "desc" },
    take: 60,
  })

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    amount: money(r.amount),
    periodStart: r.periodStart ? r.periodStart.toISOString() : null,
    periodEnd: r.periodEnd ? r.periodEnd.toISOString() : null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    paidMethod: r.paidMethod,
    reference: r.reference,
    recordedBy: r.recordedBy,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }))
}

/**
 * Record a payment that arrived some other way.
 *
 * Cash, a bank transfer, an M-Pesa the platform did not see. Always
 * available, because a platform that can only accept money through its own
 * integration will eventually hold a paid up shop hostage to a webhook.
 */
export async function recordPosPayment(input: unknown): Promise<PosBillingResult> {
  const parsed = z.object({
    chargeId: z.string().trim().min(1),
    method: z.string().trim().min(2).max(40),
    reference: z.string().trim().max(80).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the payment details" }

  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can record a payment." }

  const r = await settleCharge({
    chargeId: parsed.data.chargeId,
    method: parsed.data.method,
    reference: parsed.data.reference ?? null,
    recordedBy: admin.name,
  })
  if (!r.ok) return { success: false, error: r.error }
  if (r.alreadyPaid) {
    return { success: true, message: "That charge was already paid, so nothing changed. Refresh to see where this business stands." }
  }
  await logAdminAction({
    userId: admin.userId,
    action: "pos_billing.payment_recorded",
    entityType: "pos_billing_charge",
    entityId: parsed.data.chargeId,
    newValues: { method: parsed.data.method, reference: parsed.data.reference ?? null },
  })
  return { success: true, message: "Recorded. The till is back on if that cleared what was owed." }
}

/** Write a charge off, with a reason that stays on the record. */
export async function waivePosCharge(input: unknown): Promise<PosBillingResult> {
  const parsed = z.object({
    chargeId: z.string().trim().min(1),
    reason: z.string().trim().min(3, "Say why it is being waived").max(200),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Give a reason" }

  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can waive a charge." }

  const charge = await db.posBillingCharge.findUnique({ where: { id: parsed.data.chargeId } })
  if (!charge) return { success: false, error: "That charge no longer exists." }
  if (charge.status === "PAID") return { success: false, error: "That one is already paid." }

  await db.$transaction(async (tx) => {
    await tx.posBillingCharge.update({
      where: { id: charge.id },
      data: {
        status: "WAIVED",
        note: parsed.data.reason,
        recordedBy: admin.name,
        paidAt: new Date(),
      },
    })
    // Waiving the last outstanding charge puts the till back, exactly as
    // paying it would.
    const left = await tx.posBillingCharge.count({
      where: { subscriptionId: charge.subscriptionId, status: "DUE" },
    })
    if (left === 0) {
      await tx.posSubscription.update({
        where: { id: charge.subscriptionId },
        data: {
          status: "ACTIVE",
          ...(charge.kind === "SETUP" ? { setupSettled: true } : {}),
          ...(charge.kind === "MONTHLY" && charge.periodEnd ? { periodEndsAt: charge.periodEnd } : {}),
        },
      })
    }
  }, { timeout: 30000, maxWait: 10000 })

  await logAdminAction({
    userId: admin.userId,
    action: "pos_billing.waived",
    entityType: "pos_billing_charge",
    entityId: charge.id,
    newValues: { reason: parsed.data.reason, amount: money(charge.amount) },
  })
  return { success: true, message: "Waived, with your reason against it." }
}

/**
 * What one business pays.
 *
 * Separate from the price list on purpose: this is the deliberate act of
 * repricing ONE shop, and it says who did it and why.
 */
export async function setPosBusinessPrice(input: unknown): Promise<PosBillingResult> {
  const parsed = z.object({
    businessId: z.string().trim().min(1),
    setupFee: z.number().min(0).max(10_000_000).optional(),
    monthlyFee: z.number().min(0).max(10_000_000).optional(),
    graceDays: z.number().int().min(0).max(90).optional(),
    note: z.string().trim().max(200).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the figures" }
  const d = parsed.data

  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can change what a shop pays." }

  await ensureSubscription(d.businessId)
  await db.posSubscription.update({
    where: { businessId: d.businessId },
    data: {
      ...(d.setupFee !== undefined ? { setupFee: D(d.setupFee) } : {}),
      ...(d.monthlyFee !== undefined ? { monthlyFee: D(d.monthlyFee) } : {}),
      ...(d.graceDays !== undefined ? { graceDays: d.graceDays } : {}),
      adminNote: (d.note ? d.note + " " : "") + "(set by " + admin.name + " on " +
        new Date().toLocaleDateString("en-KE") + ")",
    },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "pos_billing.repriced",
    entityType: "pos_business",
    entityId: d.businessId,
    newValues: { setupFee: d.setupFee ?? null, monthlyFee: d.monthlyFee ?? null, graceDays: d.graceDays ?? null },
  })
  return { success: true, message: "Saved against that business only." }
}

/** Give a business more time, as a trial extension rather than a free month. */
export async function extendPosTrial(input: unknown): Promise<PosBillingResult> {
  const parsed = z.object({
    businessId: z.string().trim().min(1),
    days: z.number().int().min(1).max(365),
    note: z.string().trim().max(200).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the number of days" }
  const d = parsed.data

  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can extend a trial." }

  await ensureSubscription(d.businessId)
  const sub = await db.posSubscription.findUnique({ where: { businessId: d.businessId } })
  if (!sub) return { success: false, error: "That business has no subscription." }

  // From today where the trial has already lapsed, from its end where it has
  // not: extending a lapsed trial by seven days should mean seven days from
  // now, not seven days that already passed.
  const from = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date()

  await db.posSubscription.update({
    where: { id: sub.id },
    data: {
      status: "TRIAL",
      trialEndsAt: addDays(from, d.days),
      adminNote: (d.note ? d.note + " " : "") + "(trial extended " + d.days + " days by " + admin.name + ")",
    },
  })

  return { success: true, message: "Extended by " + d.days + " days." }
}

/**
 * Pause or restore a till by hand.
 *
 * The reason is required for a suspension, because "why is my till off" is
 * the first thing the shopkeeper will ask and support needs an answer that
 * is written down.
 */
export async function setPosBusinessActive(input: unknown): Promise<PosBillingResult> {
  const parsed = z.object({
    businessId: z.string().trim().min(1),
    active: z.boolean(),
    reason: z.string().trim().max(200).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const d = parsed.data

  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can pause a till." }
  if (!d.active && (!d.reason || d.reason.trim().length < 3)) {
    return { success: false, error: "Say why the till is being paused." }
  }

  await ensureSubscription(d.businessId)
  const sub = await db.posSubscription.findUnique({ where: { businessId: d.businessId } })
  if (!sub) return { success: false, error: "That business has no subscription." }

  // Restoring puts them back where the figures say they belong, rather than
  // on a free pass: still owing means still past due.
  let restored: "ACTIVE" | "PAST_DUE" = "ACTIVE"
  if (d.active) {
    const owing = await db.posBillingCharge.count({ where: { subscriptionId: sub.id, status: "DUE" } })
    if (owing > 0) restored = "PAST_DUE"
  }

  await db.posSubscription.update({
    where: { id: sub.id },
    data: {
      status: d.active ? restored : "SUSPENDED",
      adminNote: d.active
        ? "Restored by " + admin.name + " on " + new Date().toLocaleDateString("en-KE")
        : (d.reason ?? "") + " (paused by " + admin.name + ")",
    },
  })

  await logAdminAction({
    userId: admin.userId,
    action: d.active ? "pos_billing.restored" : "pos_billing.suspended",
    entityType: "pos_business",
    entityId: d.businessId,
    newValues: { reason: d.reason ?? null },
  })

  return {
    success: true,
    message: d.active
      ? restored === "PAST_DUE"
        ? "The till is back on, and still shows what is owed."
        : "The till is back on."
      : "The till is paused. Their records are untouched and still readable.",
  }
}

/** Raise the month's charges and suspend what has run out, on demand. */
export async function runPosBillingCycle(): Promise<PosBillingResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can run billing." }

  const r = await advanceBilling()
  return {
    success: true,
    message:
      r.raised + " charge" + (r.raised === 1 ? "" : "s") + " raised, " +
      r.pastDue + " now past due, " + r.suspended + " suspended.",
  }
}

/** One business, in full, for the detail panel. */
export async function getAdminPosBusiness(input: unknown): Promise<{
  row: AdminPosRow
  charges: AdminChargeRow[]
  state: Awaited<ReturnType<typeof billingStateOf>>
} | null> {
  const parsed = z.object({ businessId: z.string().trim().min(1) }).safeParse(input)
  if (!parsed.success) return null
  const admin = await requireAdmin()
  if (!admin) return null

  const rows = await getAdminPosBusinesses({})
  const row = rows.find((r) => r.businessId === parsed.data.businessId)
  if (!row) return null

  const [charges, state] = await Promise.all([
    getAdminPosCharges({ businessId: parsed.data.businessId }),
    billingStateOf(parsed.data.businessId),
  ])
  return { row, charges, state }
}
