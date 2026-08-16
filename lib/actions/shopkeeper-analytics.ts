"use server"

import { db } from "@/lib/db"
import { requireShopkeeper } from "@/lib/actions/shopkeeper-dashboard"

export type ShopkeeperAnalyticsRange = "7d" | "30d" | "90d" | "year"

export type ShopkeeperAnalytics = {
  totalRevenue: number
  revenueChangePct: number
  totalOrders: number
  ordersChangePct: number
  avgOrderValue: number
  avgOrderValueChangePct: number
  totalCustomers: number
  customersChangePct: number
  revenueTrend: { label: string; revenue: number }[]
  categoryBreakdown: { name: string; value: number; percent: number }[]
  monthlyRevenue: { name: string; revenue: number }[]
  statusBreakdown: { status: string; count: number }[]
  topProducts: { name: string; sales: number; revenue: number }[]
} | null

const RANGE_DAYS: Record<ShopkeeperAnalyticsRange, number> = { "7d": 7, "30d": 30, "90d": 90, "year": 365 }

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function getShopkeeperAnalytics(range: ShopkeeperAnalyticsRange): Promise<ShopkeeperAnalytics> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return null

  const days = RANGE_DAYS[range]
  const now = new Date()
  const startOfRange = new Date(now.getTime() - days * 86400000)
  const startOfPrevRange = new Date(startOfRange.getTime() - days * 86400000)

  const [currentOrders, previousOrders, allOrders] = await Promise.all([
    db.order.findMany({
      where: { shopkeeperId: shopkeeper.shopkeeperId, status: { not: "CANCELLED" }, createdAt: { gte: startOfRange } },
      include: { items: { include: { product: { include: { category: true } } } } },
    }),
    db.order.findMany({
      where: { shopkeeperId: shopkeeper.shopkeeperId, status: { not: "CANCELLED" }, createdAt: { gte: startOfPrevRange, lt: startOfRange } },
      select: { subtotal: true, customerId: true },
    }),
    db.order.findMany({
      where: { shopkeeperId: shopkeeper.shopkeeperId, status: { not: "CANCELLED" } },
      select: { status: true, createdAt: true, subtotal: true },
    }),
  ])

  const totalRevenue = currentOrders.reduce((sum, o) => sum + Number(o.subtotal), 0)
  const prevRevenue = previousOrders.reduce((sum, o) => sum + Number(o.subtotal), 0)
  const totalOrders = currentOrders.length
  const prevOrdersCount = previousOrders.length
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const prevAvgOrderValue = prevOrdersCount > 0 ? prevRevenue / prevOrdersCount : 0
  const totalCustomers = new Set(currentOrders.map((o) => o.customerId)).size
  const prevCustomers = new Set(previousOrders.map((o) => o.customerId)).size

  const bucketFormat = days <= 30 ? "day" : days <= 90 ? "week" : "month"
  const trendBuckets = new Map<string, number>()
  for (const order of currentOrders) {
    let label: string
    if (bucketFormat === "day") {
      label = order.createdAt.toLocaleDateString([], { month: "short", day: "numeric" })
    } else if (bucketFormat === "week") {
      const weekStart = new Date(order.createdAt)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      label = weekStart.toLocaleDateString([], { month: "short", day: "numeric" })
    } else {
      label = order.createdAt.toLocaleDateString([], { month: "short" })
    }
    trendBuckets.set(label, (trendBuckets.get(label) ?? 0) + Number(order.subtotal))
  }
  const revenueTrend = Array.from(trendBuckets.entries()).map(([label, revenue]) => ({ label, revenue }))

  const categoryTotals = new Map<string, number>()
  for (const order of currentOrders) {
    for (const item of order.items) {
      const categoryName = item.product.category?.name ?? "Other"
      categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + Number(item.totalPrice))
    }
  }
  const categoryTotalSum = Array.from(categoryTotals.values()).reduce((sum, v) => sum + v, 0)
  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([name, value]) => ({ name, value, percent: categoryTotalSum > 0 ? Math.round((value / categoryTotalSum) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)

  const monthBuckets = new Map<string, number>()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  for (const order of allOrders) {
    if (order.createdAt < sixMonthsAgo) continue
    const label = order.createdAt.toLocaleDateString([], { month: "short" })
    monthBuckets.set(label, (monthBuckets.get(label) ?? 0) + Number(order.subtotal))
  }
  const monthlyRevenue: { name: string; revenue: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleDateString([], { month: "short" })
    monthlyRevenue.push({ name: label, revenue: monthBuckets.get(label) ?? 0 })
  }

  const statusCounts = new Map<string, number>()
  for (const order of currentOrders) {
    statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1)
  }
  const statusBreakdown = Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count }))

  const topProductsRaw = await db.product.findMany({
    where: { shopkeeperId: shopkeeper.shopkeeperId },
    orderBy: { totalSold: "desc" },
    take: 5,
  })
  const topProducts = topProductsRaw.map((p) => ({
    name: p.name,
    sales: p.totalSold,
    revenue: Number(p.price) * p.totalSold,
  }))

  return {
    totalRevenue,
    revenueChangePct: pctChange(totalRevenue, prevRevenue),
    totalOrders,
    ordersChangePct: pctChange(totalOrders, prevOrdersCount),
    avgOrderValue,
    avgOrderValueChangePct: pctChange(avgOrderValue, prevAvgOrderValue),
    totalCustomers,
    customersChangePct: pctChange(totalCustomers, prevCustomers),
    revenueTrend,
    categoryBreakdown,
    monthlyRevenue,
    statusBreakdown,
    topProducts,
  }
}
