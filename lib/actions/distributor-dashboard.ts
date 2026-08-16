"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function requireDistributor(): Promise<{ userId: string; distributorId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "distributor") return null
  const profile = await db.distributorProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, distributorId: profile.id }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export type DistributorDashboardData = {
  totalRevenue: number
  monthRevenueGrowthPct: number
  ordersToday: number
  ordersGrowthPct: number
  activeProducts: number
  totalProducts: number
  totalLocations: number
  totalBuyers: number
  recentOrders: { id: string; orderNumber: string; buyer: string; itemCount: number; amount: number; status: string; createdAt: string }[]
  topProducts: { id: string; name: string; totalSold: number; revenue: number }[]
  processingOrders: number
  lowStockCount: number
  todaysRevenue: number
} | null

export async function getDistributorDashboard(): Promise<DistributorDashboardData> {
  const distributor = await requireDistributor()
  if (!distributor) return null

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
    totalLocations,
    distinctBuyers,
    recentOrdersRaw,
    topProductsRaw,
    processingOrders,
    inventories,
    todaysRevenueAgg,
  ] = await Promise.all([
    db.wholesaleOrder.aggregate({ where: { distributorId: distributor.distributorId, status: { not: "CANCELLED" } }, _sum: { subtotal: true } }),
    db.wholesaleOrder.aggregate({ where: { distributorId: distributor.distributorId, status: { not: "CANCELLED" }, createdAt: { gte: startOfThisMonth } }, _sum: { subtotal: true } }),
    db.wholesaleOrder.aggregate({ where: { distributorId: distributor.distributorId, status: { not: "CANCELLED" }, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } }, _sum: { subtotal: true } }),
    db.wholesaleOrder.count({ where: { distributorId: distributor.distributorId, createdAt: { gte: startOfToday } } }),
    db.wholesaleOrder.count({ where: { distributorId: distributor.distributorId, createdAt: { gte: startOfYesterday, lt: startOfToday } } }),
    db.distributorProduct.count({ where: { distributorId: distributor.distributorId, isActive: true } }),
    db.distributorProduct.count({ where: { distributorId: distributor.distributorId } }),
    db.distributorLocation.count({ where: { distributorId: distributor.distributorId } }),
    db.wholesaleOrder.findMany({ where: { distributorId: distributor.distributorId }, select: { buyerShopkeeperId: true }, distinct: ["buyerShopkeeperId"] }),
    db.wholesaleOrder.findMany({
      where: { distributorId: distributor.distributorId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { buyerShopkeeper: { include: { user: true } }, items: true },
    }),
    db.distributorProduct.findMany({
      where: { distributorId: distributor.distributorId },
      orderBy: { totalSoldWholesale: "desc" },
      take: 4,
    }),
    db.wholesaleOrder.count({ where: { distributorId: distributor.distributorId, status: "PROCESSING" } }),
    db.distributorInventory.findMany({ where: { distributorProduct: { distributorId: distributor.distributorId } }, select: { currentStock: true, lowStockThreshold: true } }),
    db.wholesaleOrder.aggregate({ where: { distributorId: distributor.distributorId, status: { not: "CANCELLED" }, createdAt: { gte: startOfToday } }, _sum: { subtotal: true } }),
  ])

  const lowStockCount = inventories.filter((i) => i.currentStock <= i.lowStockThreshold).length

  return {
    totalRevenue: Number(allTimeRevenueAgg._sum.subtotal ?? 0),
    monthRevenueGrowthPct: pctChange(Number(thisMonthRevenueAgg._sum.subtotal ?? 0), Number(lastMonthRevenueAgg._sum.subtotal ?? 0)),
    ordersToday: ordersTodayCount,
    ordersGrowthPct: pctChange(ordersTodayCount, ordersYesterdayCount),
    activeProducts,
    totalProducts,
    totalLocations,
    totalBuyers: distinctBuyers.length,
    recentOrders: recentOrdersRaw.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      buyer: o.buyerShopkeeper.user.name,
      itemCount: o.items.length,
      amount: Number(o.total),
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    topProducts: topProductsRaw.map((p) => ({
      id: p.id,
      name: p.name,
      totalSold: p.totalSoldWholesale,
      revenue: Number(p.wholesalePrice) * p.totalSoldWholesale,
    })),
    processingOrders,
    lowStockCount,
    todaysRevenue: Number(todaysRevenueAgg._sum.subtotal ?? 0),
  }
}
