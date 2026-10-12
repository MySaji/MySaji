"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission } from "@/backend/actions/pos-access"

/**
 * The first screen a shopkeeper sees.
 *
 * WHAT IT IS FOR, AND WHAT IT REFUSES TO BE
 *
 * A dashboard earns its place by answering the questions asked at the door
 * in the morning and at the counter at closing: did we take more than
 * yesterday, what is about to run out, what is selling, and did anything go
 * wrong. Everything here answers one of those. Nothing here is a number
 * chosen because it was easy to compute.
 *
 * EVERY FIGURE IS SCOPED AND PERMISSIONED
 *
 * Takings are not shown to a cashier, and this is where that is enforced
 * rather than in the screen: a till where the person handling cash can watch
 * the figure they are measured against is a till that quietly balances
 * itself. So the money blocks are omitted from the payload entirely for a
 * role that may not see them, instead of being sent and hidden.
 *
 * VOIDED AND REFUNDED SALES
 *
 * Counted out of takings, because the money is not in the drawer. Counted IN
 * to the "what went wrong" figures, because that is exactly what a
 * shopkeeper is looking for.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export type DashboardStat = {
  label: string
  value: number
  /** Percentage against the same figure yesterday. Null when there is no yesterday to compare. */
  deltaPercent: number | null
  /** A rise is not always good: more voids is a rise and a worry. */
  riseIsGood: boolean
  kind: "money" | "count"
}

export type PosDashboard = {
  shopName: string
  role: string
  canSeeMoney: boolean
  stats: DashboardStat[]
  /** Takings per day for the last seven days, oldest first. */
  trend: { date: string; label: string; total: number; transactions: number }[]
  recentSales: {
    id: string
    saleNumber: string
    occurredAt: string
    itemCount: number
    total: number
    paymentMethod: string
    status: string
    cashierName: string | null
  }[]
  stock: {
    totalProducts: number
    inStock: number
    lowStock: number
    outOfStock: number
    notTracked: number
  }
  topProducts: { productId: string; name: string; quantity: number; total: number }[]
  /** Things that need doing, newest first. Empty is a good day. */
  alerts: { kind: "low-stock" | "expiring" | "expired" | "unsynced" | "shift-open"; text: string; count: number }[]
  shiftOpen: boolean
}

/**
 * Everything the dashboard needs, in one round trip.
 *
 * Deliberately one call. Six independent fetches would show a screen that
 * assembles itself in front of the shopkeeper, and on a counter machine over
 * a thin connection that reads as broken.
 */
export async function getPosDashboard(input?: unknown): Promise<PosDashboard | null> {
  const staffId = (input as { staffId?: string } | undefined)?.staffId
  const parsed = z.object({ staffId: z.string().trim().max(60).optional() }).safeParse(input ?? {})
  const gate = await requirePosPermission("product.view", parsed.success ? parsed.data.staffId : staffId)
  if (!gate.ok || !gate.actor.shopkeeperId) return null

  const shopkeeperId = gate.actor.shopkeeperId
  const canSeeMoney = gate.actor.can("report.sales")

  const now = new Date()
  const todayStart = startOfDay(now)
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000)

  const [shop, todaySales, yesterdaySales, weekSales, recent, inventory, topRaw, openShift, batches] =
    await Promise.all([
      db.shopkeeperProfile.findUnique({ where: { id: shopkeeperId }, select: { shopName: true } }),
      db.posSale.findMany({
        where: { shopkeeperId, occurredAt: { gte: todayStart } },
        select: { total: true, status: true, customerPhone: true, customerId: true },
      }),
      db.posSale.findMany({
        where: { shopkeeperId, occurredAt: { gte: yesterdayStart, lt: todayStart } },
        select: { total: true, status: true, customerPhone: true, customerId: true },
      }),
      db.posSale.findMany({
        where: { shopkeeperId, occurredAt: { gte: weekStart } },
        select: { total: true, status: true, occurredAt: true },
      }),
      db.posSale.findMany({
        where: { shopkeeperId },
        orderBy: { occurredAt: "desc" },
        take: 8,
        select: {
          id: true, saleNumber: true, occurredAt: true, total: true,
          paymentMethod: true, status: true, cashierName: true,
          _count: { select: { items: true } },
        },
      }),
      db.inventory.findMany({
        where: { product: { shopkeeperId, isActive: true } },
        select: { currentStock: true, stockOnHand: true, lowStockThreshold: true, productId: true },
      }),
      db.posSaleItem.groupBy({
        by: ["productId", "name"],
        where: {
          sale: { shopkeeperId, occurredAt: { gte: weekStart }, status: { notIn: ["VOIDED", "REFUNDED"] } },
        },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { totalPrice: "desc" } },
        take: 5,
      }),
      db.tillSession.findFirst({ where: { shopkeeperId, closedAt: null }, select: { id: true } }),
      db.productBatch.findMany({
        where: { shopkeeperId, expiryDate: { not: null }, currentStock: { gt: 0 } },
        select: { expiryDate: true },
      }),
    ])

  if (!shop) return null

  type Saleish = { total: Prisma.Decimal; status: string; customerPhone?: string | null; customerId?: string | null }

  /** Voided and refunded sales are not takings: the money is not in the drawer. */
  const counted = <T extends Saleish>(rows: T[]): T[] =>
    rows.filter((r) => r.status !== "VOIDED" && r.status !== "REFUNDED")

  const takings = (rows: Saleish[]) =>
    counted(rows).reduce((a, r) => a.plus(D(r.total)), D(0))

  const delta = (today: number, yesterday: number): number | null => {
    // No yesterday means no comparison, which is different from "no change".
    // Showing 0% on a shop's first day would be a small lie.
    if (yesterday === 0) return today === 0 ? null : null
    return Math.round(((today - yesterday) / yesterday) * 100)
  }

  const todayTotal = money(takings(todaySales))
  const yTotal = money(takings(yesterdaySales))
  const todayCount = counted(todaySales).length
  const yCount = counted(yesterdaySales).length

  // A "customer" here is a sale that named one. Counting distinct phones
  // rather than sales, because one person buying twice is one customer.
  const customersOf = (rows: Saleish[]) =>
    new Set(
      counted(rows)
        .map((r) => r.customerId ?? r.customerPhone)
        .filter((x): x is string => Boolean(x)),
    ).size
  const todayCustomers = customersOf(todaySales)
  const yCustomers = customersOf(yesterdaySales)

  // Stock, by the figure the ledger holds where it has one.
  let inStock = 0, lowStock = 0, outOfStock = 0, notTracked = 0
  for (const inv of inventory) {
    const onHand = inv.stockOnHand !== null ? Number(inv.stockOnHand.toString()) : inv.currentStock
    if (inv.lowStockThreshold <= 0) { notTracked++; continue }
    if (onHand <= 0) outOfStock++
    else if (onHand <= inv.lowStockThreshold) lowStock++
    else inStock++
  }

  const stats: DashboardStat[] = []
  if (canSeeMoney) {
    stats.push({ label: "Today's sales", value: todayTotal, deltaPercent: delta(todayTotal, yTotal), riseIsGood: true, kind: "money" })
  }
  stats.push({ label: "Transactions", value: todayCount, deltaPercent: delta(todayCount, yCount), riseIsGood: true, kind: "count" })
  stats.push({ label: "Customers served", value: todayCustomers, deltaPercent: delta(todayCustomers, yCustomers), riseIsGood: true, kind: "count" })
  stats.push({ label: "Low stock items", value: lowStock + outOfStock, deltaPercent: null, riseIsGood: false, kind: "count" })

  // Seven days, with empty days present rather than skipped: a gap in a bar
  // chart reads as a closed shop, and a missing bar reads as a bug.
  const trend: PosDashboard["trend"] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayStart.getTime() - i * 86400000)
    const next = new Date(day.getTime() + 86400000)
    const rows = weekSales.filter((s) => s.occurredAt >= day && s.occurredAt < next)
    trend.push({
      date: day.toISOString(),
      label: day.toLocaleDateString("en-KE", { day: "numeric", month: "short" }),
      total: money(takings(rows)),
      transactions: counted(rows).length,
    })
  }

  const soon = new Date(now.getTime() + 30 * 86400000)
  const expiring = batches.filter((b) => b.expiryDate && b.expiryDate > now && b.expiryDate <= soon).length
  const expired = batches.filter((b) => b.expiryDate && b.expiryDate <= now).length

  const alerts: PosDashboard["alerts"] = []
  if (outOfStock > 0) alerts.push({ kind: "low-stock", count: outOfStock, text: `${outOfStock} ${outOfStock === 1 ? "item is" : "items are"} out of stock` })
  if (lowStock > 0) alerts.push({ kind: "low-stock", count: lowStock, text: `${lowStock} ${lowStock === 1 ? "item is" : "items are"} running low` })
  if (expired > 0) alerts.push({ kind: "expired", count: expired, text: `${expired} ${expired === 1 ? "batch has" : "batches have"} expired` })
  if (expiring > 0) alerts.push({ kind: "expiring", count: expiring, text: `${expiring} ${expiring === 1 ? "batch expires" : "batches expire"} within a month` })
  if (openShift) alerts.push({ kind: "shift-open", count: 1, text: "A shift is still open" })

  return {
    shopName: shop.shopName,
    role: gate.actor.role,
    canSeeMoney,
    stats,
    trend: canSeeMoney ? trend : [],
    recentSales: recent.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      occurredAt: s.occurredAt.toISOString(),
      itemCount: s._count.items,
      // A cashier sees that sales happened and what they contained, but not
      // what the shop took. The figure is the thing, not the row.
      total: canSeeMoney ? money(s.total) : 0,
      paymentMethod: String(s.paymentMethod),
      status: String(s.status),
      cashierName: s.cashierName,
    })),
    stock: {
      totalProducts: inventory.length,
      inStock, lowStock, outOfStock, notTracked,
    },
    topProducts: canSeeMoney
      ? topRaw.map((t) => ({
          productId: t.productId ?? "",
          name: t.name,
          quantity: Number((t._sum.quantity ?? D(0)).toString()),
          total: money(t._sum.totalPrice ?? D(0)),
        }))
      : [],
    alerts,
    shiftOpen: Boolean(openShift),
  }
}
