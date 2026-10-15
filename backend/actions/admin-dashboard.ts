"use server"

import { activeUser } from "@/backend/services/active-user"

import { db } from "@/backend/db"

export async function requireAdmin(): Promise<{ userId: string; name: string } | null> {
  const user = await activeUser()
  if (!user || user.role !== "ADMIN") return null
  return { userId: user.id, name: user.name ?? "Admin" }
}

export type AdminNavBadges = {
  users: number
  jobs: number
  disputes: number
  verifications: number
  moderation: number
}

export async function getAdminNavBadges(): Promise<AdminNavBadges> {
  const admin = await requireAdmin()
  if (!admin) return { users: 0, jobs: 0, disputes: 0, verifications: 0, moderation: 0 }

  const [users, jobs, disputes, verifications, moderation] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.job.count({ where: { status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] } } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } } }),
    db.kycDocument.count({ where: { status: "PENDING" } }),
    db.contentReport.count({ where: { status: "PENDING" } }),
  ])

  return { users, jobs, disputes, verifications, moderation }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export type AdminDashboardData = {
  totalUsers: number
  usersGrowthPct: number
  activeJobs: number
  activeJobsGrowthPct: number
  completedJobs: number
  completedJobsGrowthPct: number
  openDisputes: number
  disputesGrowthPct: number
  taskDistribution: { name: string; value: number }[]
  recentActivities: AdminActivity[]
  topPerformers: { id: string; name: string; earnings: number; tasks: number; active: boolean }[]
} | null

export type AdminActivity = { id: string; label: string; detail: string; type: "user" | "job" | "completed" | "dispute"; time: string }

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const admin = await requireAdmin()
  if (!admin) return null

  const now = new Date()
  const startOfWeek = new Date(now.getTime() - 7 * 86400000)
  const startOfPrevWeek = new Date(now.getTime() - 14 * 86400000)

  const [
    totalUsers, usersThisWeek, usersPrevWeek,
    activeJobs, activeJobsPrev,
    completedJobs, completedJobsPrev,
    openDisputes, disputesPrev,
    disputeStatusCounts,
    recentUsers, recentJobs, recentCompletedJobs, recentDisputes,
    topPerformersRaw,
  ] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfWeek } } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfPrevWeek, lt: startOfWeek } } }),
    db.job.count({ where: { status: { in: ["ACCEPTED", "IN_PROGRESS"] } } }),
    db.job.count({ where: { status: { in: ["ACCEPTED", "IN_PROGRESS"] }, createdAt: { gte: startOfPrevWeek, lt: startOfWeek } } }),
    db.job.count({ where: { status: "COMPLETED" } }),
    db.job.count({ where: { status: "COMPLETED", completedAt: { gte: startOfPrevWeek, lt: startOfWeek } } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] }, createdAt: { gte: startOfPrevWeek, lt: startOfWeek } } }),
    db.dispute.groupBy({ by: ["status"], _count: true }),
    db.user.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 3, select: { name: true, createdAt: true } }),
    db.job.findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { title: true, createdAt: true } }),
    db.job.findMany({ where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 3, select: { title: true, completedAt: true } }),
    db.dispute.findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { disputeNumber: true, reason: true, createdAt: true } }),
    db.wallet.findMany({
      where: { totalEarned: { gt: 0 } },
      orderBy: { totalEarned: "desc" },
      take: 4,
      include: { user: { select: { name: true, isActive: true, providerProfile: { select: { completedJobs: true } } } } },
    }),
  ])

  const statusMap = new Map(disputeStatusCounts.map((d) => [d.status, d._count]))
  const resolvedCount = (statusMap.get("RESOLVED") ?? 0) + (statusMap.get("CLOSED") ?? 0)
  const disputedCount = (statusMap.get("OPEN") ?? 0) + (statusMap.get("IN_REVIEW") ?? 0) + (statusMap.get("ESCALATED") ?? 0)
  const totalDisputeRows = resolvedCount + disputedCount
  const taskDistribution = totalDisputeRows > 0
    ? [
        { name: "Resolved", value: Math.round((resolvedCount / totalDisputeRows) * 100) },
        { name: "Open", value: Math.round((disputedCount / totalDisputeRows) * 100) },
      ]
    : [{ name: "No data yet", value: 100 }]

  const activities: AdminActivity[] = []
  for (const u of recentUsers) activities.push({ id: `u-${u.createdAt.getTime()}`, label: "New user registered", detail: u.name, type: "user", time: u.createdAt.toISOString() })
  for (const j of recentJobs) activities.push({ id: `j-${j.createdAt.getTime()}`, label: "Job posted", detail: j.title, type: "job", time: j.createdAt.toISOString() })
  for (const j of recentCompletedJobs) if (j.completedAt) activities.push({ id: `c-${j.completedAt.getTime()}`, label: "Job completed", detail: j.title, type: "completed", time: j.completedAt.toISOString() })
  for (const d of recentDisputes) activities.push({ id: `d-${d.createdAt.getTime()}`, label: "Dispute raised", detail: `${d.disputeNumber}: ${d.reason}`, type: "dispute", time: d.createdAt.toISOString() })
  activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  return {
    totalUsers,
    usersGrowthPct: pctChange(usersThisWeek, usersPrevWeek),
    activeJobs,
    activeJobsGrowthPct: pctChange(activeJobs, activeJobsPrev),
    completedJobs,
    completedJobsGrowthPct: pctChange(completedJobs, completedJobsPrev),
    openDisputes,
    disputesGrowthPct: pctChange(openDisputes, disputesPrev),
    taskDistribution,
    recentActivities: activities.slice(0, 4),
    topPerformers: topPerformersRaw.map((w) => ({
      id: w.id,
      name: w.user.name,
      earnings: Number(w.totalEarned),
      tasks: w.user.providerProfile?.completedJobs ?? 0,
      active: w.user.isActive,
    })),
  }
}

export type AdminRevenueQuery = { year: number; month?: number }

export type AdminRevenueData = {
  chart: { label: string; revenue: number; commission: number }[]
  totalRevenue: number
  totalCommission: number
  avgTransaction: number
  /** e.g. "2026" (whole-year view) or "March 2026" (a specific month). */
  periodLabel: string
}

const COMMISSION_RATE = 0.06

export async function getAdminRevenue(query: AdminRevenueQuery): Promise<AdminRevenueData | null> {
  const admin = await requireAdmin()
  if (!admin) return null

  const { year, month } = query
  let start: Date, end: Date, periodLabel: string
  let buckets: { key: string; label: string }[]

  if (month === undefined) {
    start = new Date(year, 0, 1)
    end = new Date(year + 1, 0, 1)
    buckets = Array.from({ length: 12 }, (_, i) => ({
      key: `${year}-${i}`,
      label: new Date(year, i, 1).toLocaleDateString("en-US", { month: "short" }),
    }))
    periodLabel = String(year)
  } else {
    start = new Date(year, month, 1)
    end = new Date(year, month + 1, 1)
    const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86400000)
    buckets = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i)
      return { key: d.toDateString(), label: String(d.getDate()) }
    })
    periodLabel = start.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }

  const keyFor = (d: Date) => (month === undefined ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString())

  const payments = await db.payment.findMany({
    where: { status: "COMPLETED", paidAt: { gte: start, lt: end } },
    select: { amount: true, paidAt: true },
  })

  const bucketMap = new Map(buckets.map((b) => [b.key, { revenue: 0, commission: 0 }]))
  for (const p of payments) {
    const entry = bucketMap.get(keyFor(p.paidAt!))
    if (!entry) continue
    const amount = Number(p.amount)
    entry.revenue += amount
    entry.commission += amount * COMMISSION_RATE
  }

  const chart = buckets.map((b) => {
    const v = bucketMap.get(b.key)!
    return { label: b.label, revenue: Math.round(v.revenue), commission: Math.round(v.commission) }
  })

  const totalRevenue = chart.reduce((sum, d) => sum + d.revenue, 0)
  const totalCommission = chart.reduce((sum, d) => sum + d.commission, 0)
  const avgTransaction = payments.length > 0 ? Math.round(totalRevenue / payments.length) : 0

  return { chart, totalRevenue, totalCommission, avgTransaction, periodLabel }
}
