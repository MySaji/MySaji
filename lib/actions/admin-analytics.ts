"use server"

import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/actions/admin-dashboard"

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export type AdminAnalyticsData = {
  metrics: { labelKey: string; value?: string; rawAmount?: number; changePct: number }[]
  revenueData: { month: string; revenue: number; users: number }[]
  userGrowthData: { month: string; providers: number; shopkeepers: number; customers: number }[]
  roleDistribution: { name: string; value: number }[]
  weeklyActivity: { day: string; cases: number; volume: number }[]
  topAgents: { rank: number; name: string; casesResolved: number; casesAssigned: number; earnings: number }[]
} | null

export async function getAdminAnalytics(): Promise<AdminAnalyticsData> {
  const admin = await requireAdmin()
  if (!admin) return null

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const startOfWeek = new Date(now.getTime() - 7 * 86400000)

  const [
    totalUsers, usersThisMonth, usersLastMonth,
    revenueThisMonthAgg, revenueLastMonthAgg,
    activeAgents,
    openDisputes, openDisputesLastMonth,
    paymentsSixMonths, usersSixMonths,
    roleCounts,
    weekDisputes, weekPayments,
    agentUsers,
  ] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfThisMonth } } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } } }),
    db.payment.aggregate({ where: { status: "COMPLETED", paidAt: { gte: startOfThisMonth } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: "COMPLETED", paidAt: { gte: startOfLastMonth, lt: startOfThisMonth } }, _sum: { amount: true } }),
    db.user.count({ where: { role: "AGENT", isActive: true } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] }, createdAt: { lt: startOfThisMonth } } }),
    db.payment.findMany({ where: { status: "COMPLETED", paidAt: { gte: sixMonthsAgo } }, select: { amount: true, paidAt: true } }),
    db.user.findMany({ where: { deletedAt: null, createdAt: { gte: sixMonthsAgo } }, select: { role: true, createdAt: true } }),
    db.user.groupBy({ by: ["role"], where: { deletedAt: null }, _count: true }),
    db.dispute.findMany({ where: { createdAt: { gte: startOfWeek } }, select: { createdAt: true } }),
    db.payment.findMany({ where: { status: "COMPLETED", paidAt: { gte: startOfWeek } }, select: { amount: true, paidAt: true } }),
    db.user.findMany({
      where: { role: "AGENT", deletedAt: null },
      include: { wallet: true, disputesAssigned: { select: { status: true } } },
    }),
  ])

  const metrics = [
    { labelKey: "admin.analytics.metricTotalUsers", value: totalUsers.toLocaleString(), changePct: pctChange(usersThisMonth, usersLastMonth) },
    { labelKey: "admin.analytics.metricRevenueMtd", rawAmount: Number(revenueThisMonthAgg._sum.amount ?? 0), changePct: pctChange(Number(revenueThisMonthAgg._sum.amount ?? 0), Number(revenueLastMonthAgg._sum.amount ?? 0)) },
    { labelKey: "admin.analytics.metricActiveAgents", value: activeAgents.toString(), changePct: 0 },
    { labelKey: "admin.analytics.metricOpenDisputes", value: openDisputes.toString(), changePct: pctChange(openDisputes, openDisputesLastMonth) },
  ]

  const monthLabels: string[] = []
  const revenueByMonth = new Map<string, number>()
  const usersByMonth = new Map<string, { providers: number; shopkeepers: number; customers: number }>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleDateString([], { month: "short" })
    monthLabels.push(label)
    revenueByMonth.set(label, 0)
    usersByMonth.set(label, { providers: 0, shopkeepers: 0, customers: 0 })
  }
  for (const p of paymentsSixMonths) {
    const label = p.paidAt!.toLocaleDateString([], { month: "short" })
    if (revenueByMonth.has(label)) revenueByMonth.set(label, (revenueByMonth.get(label) ?? 0) + Number(p.amount))
  }
  for (const u of usersSixMonths) {
    const label = u.createdAt.toLocaleDateString([], { month: "short" })
    const bucket = usersByMonth.get(label)
    if (!bucket) continue
    if (u.role === "PROVIDER") bucket.providers++
    else if (u.role === "SHOPKEEPER") bucket.shopkeepers++
    else if (u.role === "CUSTOMER") bucket.customers++
  }

  const revenueData = monthLabels.map((month) => ({ month, revenue: Math.round((revenueByMonth.get(month) ?? 0) / 1000), users: 0 }))
  const userGrowthData = monthLabels.map((month) => ({ month, ...usersByMonth.get(month)! }))

  const roleLabel: Record<string, string> = { PROVIDER: "Providers", SHOPKEEPER: "Shopkeepers", CUSTOMER: "Customers", AGENT: "Agents", SUB_ADMIN: "Sub-Admins", SECRETARY: "Secretaries", ADMIN: "Admins" }
  const roleDistribution = roleCounts
    .filter((r) => r.role !== "ADMIN")
    .map((r) => ({ name: roleLabel[r.role] ?? r.role, value: r._count }))
    .sort((a, b) => b.value - a.value)

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const casesByDay = new Map<string, number>()
  const volumeByDay = new Map<string, number>()
  for (const d of weekDisputes) {
    const label = dayLabels[d.createdAt.getDay()]
    casesByDay.set(label, (casesByDay.get(label) ?? 0) + 1)
  }
  for (const p of weekPayments) {
    const label = dayLabels[p.paidAt!.getDay()]
    volumeByDay.set(label, (volumeByDay.get(label) ?? 0) + Number(p.amount))
  }
  const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86400000)
    const label = dayLabels[d.getDay()]
    return { day: label, cases: casesByDay.get(label) ?? 0, volume: Math.round((volumeByDay.get(label) ?? 0) / 1000) }
  })

  const topAgents = agentUsers
    .map((u) => ({
      name: u.name,
      casesResolved: u.disputesAssigned.filter((d) => d.status === "RESOLVED" || d.status === "CLOSED").length,
      casesAssigned: u.disputesAssigned.length,
      earnings: Number(u.wallet?.totalEarned ?? 0),
    }))
    .filter((a) => a.casesAssigned > 0)
    .sort((a, b) => b.casesResolved - a.casesResolved)
    .slice(0, 5)
    .map((a, i) => ({ rank: i + 1, ...a }))

  return { metrics, revenueData, userGrowthData, roleDistribution, weeklyActivity, topAgents }
}
