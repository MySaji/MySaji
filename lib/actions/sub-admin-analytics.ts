"use server"

import { db } from "@/lib/db"
import { requireSubAdmin } from "@/lib/actions/sub-admin-dashboard"

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export type SubAdminAnalyticsData = {
  userGrowthPct: number
  jobGrowthPct: number
  verificationRatePct: number
  activeAgents: number
  monthlyData: { month: string; users: number; jobs: number; verifications: number }[]
  weeklyModeration: { day: string; disputes: number; reports: number }[]
} | null

export async function getSubAdminAnalytics(): Promise<SubAdminAnalyticsData> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return null

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const startOfWeek = new Date(now.getTime() - 7 * 86400000)

  const [
    usersThisMonth, usersLastMonth,
    jobsThisMonth, jobsLastMonth,
    approvedDocs, rejectedDocs,
    activeAgents,
    usersSixMonths, jobsSixMonths, verificationsSixMonths,
    weekDisputes, weekReports,
  ] = await Promise.all([
    db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfThisMonth } } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } } }),
    db.job.count({ where: { createdAt: { gte: startOfThisMonth } } }),
    db.job.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } } }),
    db.kycDocument.count({ where: { status: "APPROVED" } }),
    db.kycDocument.count({ where: { status: "REJECTED" } }),
    db.user.count({ where: { role: "AGENT", isActive: true } }),
    db.user.findMany({ where: { deletedAt: null, createdAt: { gte: sixMonthsAgo } }, select: { createdAt: true } }),
    db.job.findMany({ where: { createdAt: { gte: sixMonthsAgo } }, select: { createdAt: true } }),
    db.kycDocument.findMany({ where: { submittedAt: { gte: sixMonthsAgo } }, select: { submittedAt: true } }),
    db.dispute.findMany({ where: { createdAt: { gte: startOfWeek } }, select: { createdAt: true } }),
    db.contentReport.findMany({ where: { createdAt: { gte: startOfWeek } }, select: { createdAt: true } }),
  ])

  const monthLabels: string[] = []
  const usersByMonth = new Map<string, number>()
  const jobsByMonth = new Map<string, number>()
  const verifByMonth = new Map<string, number>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleDateString([], { month: "short" })
    monthLabels.push(label)
    usersByMonth.set(label, 0)
    jobsByMonth.set(label, 0)
    verifByMonth.set(label, 0)
  }
  for (const u of usersSixMonths) {
    const label = u.createdAt.toLocaleDateString([], { month: "short" })
    if (usersByMonth.has(label)) usersByMonth.set(label, (usersByMonth.get(label) ?? 0) + 1)
  }
  for (const j of jobsSixMonths) {
    const label = j.createdAt.toLocaleDateString([], { month: "short" })
    if (jobsByMonth.has(label)) jobsByMonth.set(label, (jobsByMonth.get(label) ?? 0) + 1)
  }
  for (const v of verificationsSixMonths) {
    const label = v.submittedAt.toLocaleDateString([], { month: "short" })
    if (verifByMonth.has(label)) verifByMonth.set(label, (verifByMonth.get(label) ?? 0) + 1)
  }
  const monthlyData = monthLabels.map((month) => ({
    month,
    users: usersByMonth.get(month) ?? 0,
    jobs: jobsByMonth.get(month) ?? 0,
    verifications: verifByMonth.get(month) ?? 0,
  }))

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const disputesByDay = new Map<string, number>()
  const reportsByDay = new Map<string, number>()
  for (const d of weekDisputes) disputesByDay.set(dayLabels[d.createdAt.getDay()], (disputesByDay.get(dayLabels[d.createdAt.getDay()]) ?? 0) + 1)
  for (const r of weekReports) reportsByDay.set(dayLabels[r.createdAt.getDay()], (reportsByDay.get(dayLabels[r.createdAt.getDay()]) ?? 0) + 1)
  const weeklyModeration = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86400000)
    const label = dayLabels[d.getDay()]
    return { day: label, disputes: disputesByDay.get(label) ?? 0, reports: reportsByDay.get(label) ?? 0 }
  })

  const reviewedDocs = approvedDocs + rejectedDocs

  return {
    userGrowthPct: pctChange(usersThisMonth, usersLastMonth),
    jobGrowthPct: pctChange(jobsThisMonth, jobsLastMonth),
    verificationRatePct: reviewedDocs > 0 ? Math.round((approvedDocs / reviewedDocs) * 100) : 0,
    activeAgents,
    monthlyData,
    weeklyModeration,
  }
}
