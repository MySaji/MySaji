"use server"

import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "12m"

const PERIOD_DAYS: Record<AnalyticsPeriod, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 }

function bucketKey(date: Date, period: AnalyticsPeriod): string {
  if (period === "12m") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
  if (period === "90d") {
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - date.getDay())
    return weekStart.toISOString().slice(0, 10)
  }
  return date.toISOString().slice(0, 10)
}

export type ProviderAnalytics = {
  totalRevenue: number
  revenueGrowthPct: number
  jobsCompleted: number
  jobsGrowthPct: number
  avgRating: number
  repeatClientPct: number
  revenueTrend: { label: string; value: number }[]
  jobsByCategory: { name: string; count: number; pct: number }[]
  peakHours: { hour: string; jobs: number }[]
  topCustomers: { name: string; jobs: number; spent: number; lastJobAt: string }[]
  avgResponseMinutes: number
  completionRatePct: number
} | null

export async function getProviderAnalytics(period: AnalyticsPeriod): Promise<ProviderAnalytics> {
  const provider = await requireProvider()
  if (!provider) return null

  const now = new Date()
  const days = PERIOD_DAYS[period]
  const startDate = new Date(now.getTime() - days * 86400000)
  const prevStartDate = new Date(startDate.getTime() - days * 86400000)

  const [profile, currentJobs, previousJobs, allNonPendingJobs, statusCounts] = await Promise.all([
    db.providerProfile.findUnique({ where: { id: provider.providerId } }),
    db.job.findMany({
      where: { providerId: provider.providerId, status: "COMPLETED", completedAt: { gte: startDate } },
      include: { customer: true, service: { include: { category: true } } },
    }),
    db.job.findMany({
      where: { providerId: provider.providerId, status: "COMPLETED", completedAt: { gte: prevStartDate, lt: startDate } },
      select: { price: true },
    }),
    db.job.findMany({
      where: { providerId: provider.providerId, status: { not: "PENDING" } },
      select: { createdAt: true, updatedAt: true },
    }),
    db.job.groupBy({ by: ["status"], where: { providerId: provider.providerId }, _count: true }),
  ])
  if (!profile) return null

  const totalRevenue = currentJobs.reduce((sum, j) => sum + Number(j.price), 0)
  const prevRevenue = previousJobs.reduce((sum, j) => sum + Number(j.price), 0)
  const revenueGrowthPct = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10 : (totalRevenue > 0 ? 100 : 0)

  const jobsGrowthPct = previousJobs.length > 0
    ? Math.round(((currentJobs.length - previousJobs.length) / previousJobs.length) * 1000) / 10
    : (currentJobs.length > 0 ? 100 : 0)

  // Revenue trend buckets
  const bucketMap = new Map<string, number>()
  for (const job of currentJobs) {
    const key = bucketKey(job.completedAt ?? job.scheduledDate, period)
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + Number(job.price))
  }
  const revenueTrend = [...bucketMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }))

  // Jobs by category
  const categoryMap = new Map<string, number>()
  for (const job of currentJobs) {
    const name = job.service?.category?.name ?? "Other"
    categoryMap.set(name, (categoryMap.get(name) ?? 0) + 1)
  }
  const jobsByCategory = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, pct: currentJobs.length > 0 ? Math.round((count / currentJobs.length) * 100) : 0 }))

  // Peak booking hours (2-hour buckets)
  const hourBuckets = Array.from({ length: 12 }, (_, i) => ({ hour: `${i * 2}-${i * 2 + 2}h`, jobs: 0 }))
  for (const job of currentJobs) {
    const h = (job.completedAt ?? job.scheduledDate).getHours()
    hourBuckets[Math.floor(h / 2)].jobs += 1
  }
  const peakHours = hourBuckets.filter((_, i) => i >= 3 && i <= 10) // 6am - 10pm

  // Top customers
  const customerMap = new Map<string, { name: string; jobs: number; spent: number; lastJobAt: string }>()
  for (const job of currentJobs) {
    const existing = customerMap.get(job.customerId)
    const jobDate = (job.completedAt ?? job.scheduledDate).toISOString()
    if (existing) {
      existing.jobs += 1
      existing.spent += Number(job.price)
      if (jobDate > existing.lastJobAt) existing.lastJobAt = jobDate
    } else {
      customerMap.set(job.customerId, { name: job.customer.name, jobs: 1, spent: Number(job.price), lastJobAt: jobDate })
    }
  }
  const topCustomers = [...customerMap.values()].sort((a, b) => b.spent - a.spent).slice(0, 5)
  const repeatClientPct = customerMap.size > 0
    ? Math.round(([...customerMap.values()].filter((c) => c.jobs >= 2).length / customerMap.size) * 100)
    : 0

  // Response time: avg time from job creation to first status change, for jobs no longer pending
  const avgResponseMinutes = allNonPendingJobs.length > 0
    ? Math.round(allNonPendingJobs.reduce((sum, j) => sum + (j.updatedAt.getTime() - j.createdAt.getTime()) / 60000, 0) / allNonPendingJobs.length)
    : 0

  const completedCount = statusCounts.find((s) => s.status === "COMPLETED")?._count ?? 0
  const cancelledCount = statusCounts.find((s) => s.status === "CANCELLED")?._count ?? 0
  const disputedCount = statusCounts.find((s) => s.status === "DISPUTED")?._count ?? 0
  const resolvedTotal = completedCount + cancelledCount + disputedCount
  const completionRatePct = resolvedTotal > 0 ? Math.round((completedCount / resolvedTotal) * 100) : 0

  return {
    totalRevenue,
    revenueGrowthPct,
    jobsCompleted: currentJobs.length,
    jobsGrowthPct,
    avgRating: Number(profile.rating),
    repeatClientPct,
    revenueTrend,
    jobsByCategory,
    peakHours,
    topCustomers,
    avgResponseMinutes,
    completionRatePct,
  }
}
