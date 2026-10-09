"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { reportRangeStart, type ReportRange } from "@/lib/pos-reporting"

/**
 * What the till took, and what it cost to take it.
 *
 * Two things this deliberately does NOT do.
 *
 * It does not count VOIDED or PARKED sales anywhere. A voided sale is money
 * that was never taken, and a report that includes it is a report that
 * disagrees with the drawer.
 *
 * And it reports on `occurredAt`, never `createdAt`. On a till that was
 * offline those differ, and a day's takings means what happened at the
 * counter that day — not when the server heard about it. Getting this
 * backwards would make every report wrong the first time a till reconnects.
 */

async function requireReportTenant() {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null
  const shop = await db.shopkeeperProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, shopName: true, posEnabled: true },
  })
  if (!shop || !shop.posEnabled) return null
  return { shopkeeperId: shop.id, shopName: shop.shopName }
}

const n = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v.toString()))

export type TillReport = {
  shopName: string
  range: ReportRange
  from: string
  takings: number
  saleCount: number
  averageSale: number
  itemsSold: number
  /** Only across lines where a cost was recorded — see costCoverage. */
  grossMargin: number | null
  /** What share of lines carried a cost price, so the margin is readable. */
  costCoverage: number
  voidedCount: number
  voidedValue: number
  byMethod: { method: string; amount: number; count: number }[]
  byDay: { day: string; amount: number; count: number }[]
  topProducts: { name: string; quantity: number; unit: string; revenue: number }[]
  byCashier: { name: string; amount: number; count: number }[]
}

export async function getTillReport(input: unknown): Promise<TillReport | null> {
  const tenant = await requireReportTenant()
  if (!tenant) return null
  const parsed = z.object({ range: z.enum(["today", "7d", "30d"]).optional() }).safeParse(input ?? {})
  const range: ReportRange = parsed.success ? parsed.data.range ?? "today" : "today"
  const from = reportRangeStart(range)

  const [completed, voided] = await Promise.all([
    db.posSale.findMany({
      where: { shopkeeperId: tenant.shopkeeperId, status: "COMPLETED", occurredAt: { gte: from } },
      select: {
        id: true, total: true, occurredAt: true, cashierName: true, paymentMethod: true,
        payments: { select: { method: true, amount: true } },
        items: { select: { name: true, unit: true, quantity: true, totalPrice: true, costAtSale: true } },
      },
      // A shop doing thousands a day needs aggregation in SQL rather than
      // this; at the volumes a counter does in a month, pulling the rows and
      // folding them here is simpler and fast enough. Revisit above ~20k.
      take: 20000,
    }),
    db.posSale.aggregate({
      where: { shopkeeperId: tenant.shopkeeperId, status: "VOIDED", occurredAt: { gte: from } },
      _sum: { total: true },
      _count: true,
    }),
  ])

  let takings = 0
  let itemsSold = 0
  let revenueWithCost = 0
  let costOfSales = 0
  let linesWithCost = 0
  let totalLines = 0

  const byMethod = new Map<string, { amount: number; count: number }>()
  const byDay = new Map<string, { amount: number; count: number }>()
  const byProduct = new Map<string, { name: string; unit: string; quantity: number; revenue: number }>()
  const byCashier = new Map<string, { amount: number; count: number }>()

  for (const sale of completed) {
    const total = n(sale.total)
    takings += total

    const day = sale.occurredAt.toISOString().slice(0, 10)
    const dayRow = byDay.get(day) ?? { amount: 0, count: 0 }
    byDay.set(day, { amount: dayRow.amount + total, count: dayRow.count + 1 })

    const cashier = sale.cashierName ?? "Unknown"
    const cRow = byCashier.get(cashier) ?? { amount: 0, count: 0 }
    byCashier.set(cashier, { amount: cRow.amount + total, count: cRow.count + 1 })

    // Split across tenders where there were several, so a split sale is not
    // counted entirely as whichever method happened to be first.
    for (const p of sale.payments) {
      const amount = n(p.amount)
      const mRow = byMethod.get(p.method) ?? { amount: 0, count: 0 }
      byMethod.set(p.method, { amount: mRow.amount + amount, count: mRow.count + 1 })
    }

    for (const item of sale.items) {
      const qty = n(item.quantity)
      const revenue = n(item.totalPrice)
      itemsSold += qty
      totalLines++

      const key = item.name
      const pRow = byProduct.get(key) ?? { name: item.name, unit: item.unit, quantity: 0, revenue: 0 }
      byProduct.set(key, { ...pRow, quantity: pRow.quantity + qty, revenue: pRow.revenue + revenue })

      if (item.costAtSale != null) {
        linesWithCost++
        revenueWithCost += revenue
        costOfSales += n(item.costAtSale) * qty
      }
    }
  }

  // Reported as null rather than zero when nothing carries a cost. A margin
  // of "0" would read as "we made nothing", when the truth is "nobody has
  // entered what these cost".
  const grossMargin = linesWithCost > 0 ? revenueWithCost - costOfSales : null

  return {
    shopName: tenant.shopName,
    range,
    from: from.toISOString(),
    takings,
    saleCount: completed.length,
    averageSale: completed.length > 0 ? takings / completed.length : 0,
    itemsSold,
    grossMargin,
    costCoverage: totalLines > 0 ? linesWithCost / totalLines : 0,
    voidedCount: voided._count,
    voidedValue: n(voided._sum.total),
    byMethod: [...byMethod.entries()]
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.amount - a.amount),
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    topProducts: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    byCashier: [...byCashier.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.amount - a.amount),
  }
}

export type ShiftRow = {
  id: string
  cashierName: string | null
  openedAt: string
  closedAt: string | null
  openingFloat: number
  expectedCash: number | null
  countedCash: number | null
  variance: number | null
  note: string | null
  saleCount: number
}

/**
 * Closed and open shifts, newest first.
 *
 * The variance is read from the row rather than recomputed. It was stored at
 * close time on purpose: a void or a correction tomorrow must not silently
 * rewrite what a cashier signed off on tonight.
 */
export async function getShiftHistory(input: unknown): Promise<ShiftRow[]> {
  const tenant = await requireReportTenant()
  if (!tenant) return []
  const parsed = z.object({ limit: z.number().int().min(1).max(100).optional() }).safeParse(input ?? {})
  const take = parsed.success ? parsed.data.limit ?? 30 : 30

  const shifts = await db.tillSession.findMany({
    where: { shopkeeperId: tenant.shopkeeperId },
    orderBy: { openedAt: "desc" },
    take,
    select: {
      id: true, cashierName: true, openedAt: true, closedAt: true,
      openingFloat: true, expectedCash: true, countedCash: true, variance: true, note: true,
      _count: { select: { sales: true } },
    },
  })

  return shifts.map((s) => ({
    id: s.id,
    cashierName: s.cashierName,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    openingFloat: n(s.openingFloat),
    expectedCash: s.expectedCash == null ? null : n(s.expectedCash),
    countedCash: s.countedCash == null ? null : n(s.countedCash),
    variance: s.variance == null ? null : n(s.variance),
    note: s.note,
    saleCount: s._count.sales,
  }))
}
