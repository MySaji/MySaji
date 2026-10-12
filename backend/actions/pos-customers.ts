"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { parsePosConfig } from "@/backend/domain/pos-config"
import { requirePosPermission, recordPosAudit } from "@/backend/actions/pos-access"

/**
 * Customers, and the points they earn for shopping here.
 *
 * HOW THE SCHEME WORKS
 *
 * Spend a hundred shillings, get a point. Spend the points later like
 * money. That is the whole thing, and it is the shape every Kenyan
 * supermarket scheme uses because it is the one a customer can check in
 * their head at the counter.
 *
 * WHY THE BALANCE IS A LEDGER AND NOT A NUMBER
 *
 * The same reason stock is. A points balance stored as a single number can
 * be edited, and a balance that can be edited is one a customer cannot
 * argue with and a shop cannot audit. So every movement is a row, the sum
 * of the rows is the truth, and `pointsBalance` on the customer is a cached
 * projection recomputed from them.
 *
 * WHAT HAPPENS WHEN A SALE IS UNDONE
 *
 * The points go back. A void or a refund that left the points behind would
 * let somebody earn by ringing up sales and voiding them, which is a
 * cash-free way to drain a loyalty scheme.
 *
 * SIGNING UP IS NOT CREATING AN ACCOUNT
 *
 * A name and a phone number, given at a counter in four seconds. No
 * password, no email needed, no SAJI account. Anything heavier and nobody
 * joins, and a scheme nobody joins is worse than none.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

/** Kenyan numbers in any of the shapes people actually type. */
export async function normalizeCustomerPhone(raw: string): Promise<string | null> {
  const digits = raw.trim().replace(/[^\d+]/g, "")
  if (/^\+254\d{9}$/.test(digits)) return digits
  if (/^254\d{9}$/.test(digits)) return "+" + digits
  if (/^0\d{9}$/.test(digits)) return "+254" + digits.slice(1)
  if (/^\d{9}$/.test(digits)) return "+254" + digits
  return null
}

function normalize(raw: string): string | null {
  const digits = raw.trim().replace(/[^\d+]/g, "")
  if (/^\+254\d{9}$/.test(digits)) return digits
  if (/^254\d{9}$/.test(digits)) return "+" + digits
  if (/^0\d{9}$/.test(digits)) return "+254" + digits.slice(1)
  if (/^\d{9}$/.test(digits)) return "+254" + digits
  return null
}

export type LoyaltySettings = {
  enabled: boolean
  pointsPerHundred: number
  shillingsPerPoint: number
  minRedeem: number
}

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

async function loyaltyOf(shopkeeperId: string): Promise<LoyaltySettings> {
  const shop = await db.shopkeeperProfile.findUnique({ where: { id: shopkeeperId }, select: { posConfig: true } })
  const cfg = parsePosConfig(shop?.posConfig)
  return {
    enabled: cfg.loyaltyEnabled,
    pointsPerHundred: cfg.loyaltyPointsPerHundred,
    shillingsPerPoint: cfg.loyaltyShillingsPerPoint,
    minRedeem: cfg.loyaltyMinRedeem,
  }
}

export async function getLoyaltySettings(input?: unknown): Promise<LoyaltySettings | null> {
  const staffId = (input as { staffId?: string } | undefined)?.staffId
  const g = await gate("product.view", staffId)
  if (!g.ok) return null
  return loyaltyOf(g.shopkeeperId)
}

// ------------------------------------------------------------------ the list

export type CustomerRow = {
  id: string
  name: string
  phone: string
  email: string | null
  pointsBalance: number
  pointsEarned: number
  /** What those points are worth today, in shillings. */
  pointsValue: number
  totalSpent: number
  visits: number
  lastSeenAt: string | null
  joinedAt: string
  isActive: boolean
}

export async function getCustomers(input?: unknown): Promise<CustomerRow[]> {
  const parsed = z.object({
    query: z.string().trim().max(60).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input ?? {})
  const q = parsed.success ? parsed.data.query?.trim() : undefined
  const g = await gate("product.view", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return []

  const settings = await loyaltyOf(g.shopkeeperId)
  const rows = await db.posCustomer.findMany({
    where: {
      shopkeeperId: g.shopkeeperId,
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { lastSeenAt: { sort: "desc", nulls: "last" } }],
    take: parsed.success ? parsed.data.limit ?? 100 : 100,
  })

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    pointsBalance: c.pointsBalance,
    pointsEarned: c.pointsEarned,
    pointsValue: Math.round(c.pointsBalance * settings.shillingsPerPoint * 100) / 100,
    totalSpent: money(c.totalSpent),
    visits: c.visits,
    lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
    joinedAt: c.joinedAt.toISOString(),
    isActive: c.isActive,
  }))
}

/**
 * Find one at the till, by the number they just read out.
 *
 * Phone first and exact, because that is what a cashier types while a queue
 * waits. The name search is there for when somebody has forgotten which
 * number they joined with.
 */
export async function findCustomerForTill(input: unknown): Promise<CustomerRow[]> {
  const parsed = z.object({
    query: z.string().trim().min(2).max(60),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return []
  const g = await gate("till.sell", parsed.data.staffId)
  if (!g.ok) return []

  const phone = normalize(parsed.data.query)
  const settings = await loyaltyOf(g.shopkeeperId)
  const rows = await db.posCustomer.findMany({
    where: {
      shopkeeperId: g.shopkeeperId,
      isActive: true,
      ...(phone
        ? { phone }
        : { OR: [{ name: { contains: parsed.data.query, mode: "insensitive" } }, { phone: { contains: parsed.data.query } }] }),
    },
    take: 8,
  })

  return rows.map((c) => ({
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    pointsBalance: c.pointsBalance, pointsEarned: c.pointsEarned,
    pointsValue: Math.round(c.pointsBalance * settings.shillingsPerPoint * 100) / 100,
    totalSpent: money(c.totalSpent), visits: c.visits,
    lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
    joinedAt: c.joinedAt.toISOString(), isActive: c.isActive,
  }))
}

export type CustomerResult = { success: true; customerId: string } | { success: false; error: string }

const saveSchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2, "A name is at least 2 characters").max(80),
  phone: z.string().trim().min(9).max(16),
  email: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(400).optional(),
  staffId: z.string().trim().max(60).optional(),
})

/**
 * Sign somebody up, or correct their details.
 *
 * A cashier may do this: joining happens at the counter with a queue
 * behind, and sending the customer to find a manager is how a scheme dies.
 */
export async function saveCustomer(input: unknown): Promise<CustomerResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  const g = await gate("till.sell", parsed.data.staffId)
  if (!g.ok) return { success: false, error: g.error }
  const d = parsed.data

  const phone = normalize(d.phone)
  if (!phone) return { success: false, error: "That does not look like a Kenyan phone number." }

  try {
    if (d.customerId) {
      const own = await db.posCustomer.findFirst({
        where: { id: d.customerId, shopkeeperId: g.shopkeeperId },
        select: { id: true },
      })
      if (!own) return { success: false, error: "That customer is not on your list." }
      await db.posCustomer.update({
        where: { id: own.id },
        data: { name: d.name, phone, email: d.email || null, notes: d.notes || null },
      })
      return { success: true, customerId: own.id }
    }

    const created = await db.posCustomer.create({
      data: {
        shopkeeperId: g.shopkeeperId,
        name: d.name, phone, email: d.email || null, notes: d.notes || null,
      },
      select: { id: true },
    })
    await recordPosAudit({
      actor: g.actor, action: "customer.join",
      summary: `${g.actor.name} signed up ${d.name} for points`,
      entityType: "PosCustomer", entityId: created.id,
    })
    return { success: true, customerId: created.id }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // The unique is (shop, phone). Two customers on one number makes every
      // balance a guess about whose points they are.
      const existing = await db.posCustomer.findFirst({
        where: { shopkeeperId: g.shopkeeperId, phone },
        select: { name: true },
      })
      return { success: false, error: (existing?.name ?? "Someone") + " is already signed up on that number." }
    }
    return { success: false, error: "That customer could not be saved." }
  }
}

export async function setCustomerActive(input: unknown): Promise<CustomerResult> {
  const parsed = z.object({
    customerId: z.string().trim().min(1),
    isActive: z.boolean(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const g = await gate("staff.manage", parsed.data.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const own = await db.posCustomer.findFirst({
    where: { id: parsed.data.customerId, shopkeeperId: g.shopkeeperId },
    select: { id: true },
  })
  if (!own) return { success: false, error: "That customer is not on your list." }
  // Never deleted: their points are a debt the shop owes, and their past
  // purchases have to stay readable.
  await db.posCustomer.update({ where: { id: own.id }, data: { isActive: parsed.data.isActive } })
  return { success: true, customerId: own.id }
}

// ---------------------------------------------------------------- the ledger

export type LoyaltyEntryRow = {
  id: string
  kind: string
  points: number
  balanceAfter: number
  amount: number | null
  reason: string | null
  occurredAt: string
  saleId: string | null
}

export async function getCustomerHistory(input: unknown): Promise<{
  customer: CustomerRow
  entries: LoyaltyEntryRow[]
} | null> {
  const parsed = z.object({
    customerId: z.string().trim().min(1),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return null
  const g = await gate("product.view", parsed.data.staffId)
  if (!g.ok) return null

  const c = await db.posCustomer.findFirst({
    where: { id: parsed.data.customerId, shopkeeperId: g.shopkeeperId },
  })
  if (!c) return null

  const settings = await loyaltyOf(g.shopkeeperId)
  const entries = await db.posLoyaltyEntry.findMany({
    where: { customerId: c.id },
    orderBy: { occurredAt: "desc" },
    take: 100,
  })

  return {
    customer: {
      id: c.id, name: c.name, phone: c.phone, email: c.email,
      pointsBalance: c.pointsBalance, pointsEarned: c.pointsEarned,
      pointsValue: Math.round(c.pointsBalance * settings.shillingsPerPoint * 100) / 100,
      totalSpent: money(c.totalSpent), visits: c.visits,
      lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
      joinedAt: c.joinedAt.toISOString(), isActive: c.isActive,
    },
    entries: entries.map((e) => ({
      id: e.id,
      kind: String(e.kind),
      points: e.points,
      balanceAfter: e.balanceAfter,
      amount: e.amount ? money(e.amount) : null,
      reason: e.reason,
      occurredAt: e.occurredAt.toISOString(),
      saleId: e.saleId,
    })),
  }
}

/**
 * Change a balance by hand, with a reason that is kept.
 *
 * Needed because schemes go wrong in ways the till cannot see: a customer
 * who was not signed up when they should have been, a goodwill gesture, a
 * mistake. The reason is required rather than optional, because an
 * unexplained adjustment is exactly what a fraud looks like.
 */
export async function adjustPoints(input: unknown): Promise<CustomerResult> {
  const parsed = z.object({
    customerId: z.string().trim().min(1),
    points: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.string().trim().min(3, "Say why").max(200),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const g = await gate("staff.manage", parsed.data.staffId)
  if (!g.ok) return { success: false, error: g.error }
  const d = parsed.data
  if (d.points === 0) return { success: false, error: "That would change nothing." }

  const c = await db.posCustomer.findFirst({
    where: { id: d.customerId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true, pointsBalance: true },
  })
  if (!c) return { success: false, error: "That customer is not on your list." }
  if (c.pointsBalance + d.points < 0) {
    return { success: false, error: c.name + " only has " + c.pointsBalance + " points." }
  }

  await db.$transaction(async (tx) => {
    const after = c.pointsBalance + d.points
    await tx.posLoyaltyEntry.create({
      data: {
        shopkeeperId: g.shopkeeperId, customerId: c.id, kind: "ADJUSTMENT",
        points: d.points, balanceAfter: after, reason: d.reason, actorName: g.actor.name,
      },
    })
    await tx.posCustomer.update({
      where: { id: c.id },
      data: {
        pointsBalance: after,
        // Lifetime earned counts only what was earned by shopping. A
        // goodwill adjustment is not a measure of a good customer.
        ...(d.points > 0 ? {} : {}),
      },
    })
  }, { timeout: 20000 })

  await recordPosAudit({
    actor: g.actor, action: "loyalty.adjust",
    summary: `${g.actor.name} ${d.points > 0 ? "added" : "removed"} ${Math.abs(d.points)} points ${d.points > 0 ? "to" : "from"} ${c.name}: ${d.reason}`,
    entityType: "PosCustomer", entityId: c.id,
    detail: { points: d.points, reason: d.reason },
  })
  return { success: true, customerId: c.id }
}
