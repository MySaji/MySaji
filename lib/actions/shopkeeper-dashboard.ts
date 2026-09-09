"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"

// A Provider Business owner can also run a shop (see setupBusinessShop() in
// lib/actions/provider-business.ts) — that keeps role="provider" (their
// portal stays Provider, not a role switch) but gets a real, linked
// ShopkeeperProfile on the same account. So access here isn't purely
// role-gated: it's "role=shopkeeper", OR "role=provider AND a business
// owner AND a shop is actually linked" — either way, the caller must have
// a real ShopkeeperProfile row, this never fabricates access.
export async function requireShopkeeper(): Promise<{ userId: string; shopkeeperId: string } | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  // Owning a ShopkeeperProfile is what makes an account a shopkeeper — the
  // lookup below scopes everything to that one shop, so a provider who runs a
  // shop manages only their own. This used to additionally require
  // isBusinessOwner, which locked solo providers out of their own shop pages
  // while the Saji Pro sidebar still listed them (it shows the shop group on
  // `!!user.shopkeeperProfile` alone — see getMyRoleProfiles). Shop Earnings
  // was the visible symptom: the page spun forever.
  if (session.user.role !== "shopkeeper" && session.user.role !== "provider") return null

  const profile = await db.shopkeeperProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, shopkeeperId: profile.id }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export type ShopkeeperDashboardData = {
  totalRevenue: number
  monthRevenueGrowthPct: number
  ordersToday: number
  ordersGrowthPct: number
  activeProducts: number
  totalProducts: number
  totalCustomers: number
  recentOrders: { id: string; orderNumber: string; customer: string; itemCount: number; amount: number; status: string; createdAt: string }[]
  topProducts: { id: string; name: string; totalSold: number; revenue: number }[]
  processingOrders: number
  lowStockCount: number
  todaysRevenue: number
} | null

export async function getShopkeeperDashboard(): Promise<ShopkeeperDashboardData> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return null

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [
    allTimeRevenueAgg,
    thisMonthRevenueAgg,
    lastMonthRevenueAgg,
    ordersTodayCount,
    ordersYesterdayCount,
    activeProducts,
    totalProducts,
    distinctCustomers,
    recentOrdersRaw,
    topProductsRaw,
    processingOrders,
    inventories,
    todaysRevenueAgg,
  ] = await Promise.all([
    db.order.aggregate({ where: { shopkeeperId: shopkeeper.shopkeeperId, status: { not: "CANCELLED" } }, _sum: { subtotal: true } }),
    db.order.aggregate({ where: { shopkeeperId: shopkeeper.shopkeeperId, status: { not: "CANCELLED" }, createdAt: { gte: startOfThisMonth } }, _sum: { subtotal: true } }),
    db.order.aggregate({ where: { shopkeeperId: shopkeeper.shopkeeperId, status: { not: "CANCELLED" }, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } }, _sum: { subtotal: true } }),
    db.order.count({ where: { shopkeeperId: shopkeeper.shopkeeperId, createdAt: { gte: startOfToday } } }),
    db.order.count({ where: { shopkeeperId: shopkeeper.shopkeeperId, createdAt: { gte: startOfYesterday, lt: startOfToday } } }),
    db.product.count({ where: { shopkeeperId: shopkeeper.shopkeeperId, isActive: true } }),
    db.product.count({ where: { shopkeeperId: shopkeeper.shopkeeperId } }),
    db.order.findMany({ where: { shopkeeperId: shopkeeper.shopkeeperId }, select: { customerId: true }, distinct: ["customerId"] }),
    db.order.findMany({
      where: { shopkeeperId: shopkeeper.shopkeeperId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: true, items: true },
    }),
    db.product.findMany({
      where: { shopkeeperId: shopkeeper.shopkeeperId },
      orderBy: { totalSold: "desc" },
      take: 4,
    }),
    db.order.count({ where: { shopkeeperId: shopkeeper.shopkeeperId, status: "PROCESSING" } }),
    db.inventory.findMany({ where: { product: { shopkeeperId: shopkeeper.shopkeeperId } }, select: { currentStock: true, lowStockThreshold: true } }),
    db.order.aggregate({ where: { shopkeeperId: shopkeeper.shopkeeperId, status: { not: "CANCELLED" }, createdAt: { gte: startOfToday } }, _sum: { subtotal: true } }),
  ])

  const lowStockCount = inventories.filter((i) => i.currentStock <= i.lowStockThreshold).length

  return {
    totalRevenue: Number(allTimeRevenueAgg._sum.subtotal ?? 0),
    monthRevenueGrowthPct: pctChange(Number(thisMonthRevenueAgg._sum.subtotal ?? 0), Number(lastMonthRevenueAgg._sum.subtotal ?? 0)),
    ordersToday: ordersTodayCount,
    ordersGrowthPct: pctChange(ordersTodayCount, ordersYesterdayCount),
    activeProducts,
    totalProducts,
    totalCustomers: distinctCustomers.length,
    recentOrders: recentOrdersRaw.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customer: o.customer.name,
      itemCount: o.items.length,
      amount: Number(o.total),
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    topProducts: topProductsRaw.map((p) => ({
      id: p.id,
      name: p.name,
      totalSold: p.totalSold,
      revenue: Number(p.price) * p.totalSold,
    })),
    processingOrders,
    lowStockCount,
    todaysRevenue: Number(todaysRevenueAgg._sum.subtotal ?? 0),
  }
}
