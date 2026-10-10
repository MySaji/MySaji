"use server"

import { db } from "@/backend/db"
import { requireAgent } from "@/backend/actions/agent-dashboard"

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export type AgentWeeklyResolution = { day: string; resolved: number; pending: number }
export type AgentReasonBreakdown = { name: string; count: number; percentage: number }

export type AgentAnalyticsData = {
  weeklyResolution: AgentWeeklyResolution[]
  reasonBreakdown: AgentReasonBreakdown[]
} | null

export async function getAgentAnalytics(): Promise<AgentAnalyticsData> {
  const agent = await requireAgent()
  if (!agent) return null

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)

  const [weekDisputes, allMine] = await Promise.all([
    db.dispute.findMany({
      where: { assignedToId: agent.userId, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, resolvedAt: true, status: true },
    }),
    db.dispute.findMany({
      where: { assignedToId: agent.userId },
      select: { reason: true },
    }),
  ])

  const weekBuckets = new Map<string, { resolved: number; pending: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    weekBuckets.set(d.toDateString(), { resolved: 0, pending: 0 })
  }
  for (const d of weekDisputes) {
    const key = d.createdAt.toDateString()
    const bucket = weekBuckets.get(key)
    if (!bucket) continue
    if (d.status === "RESOLVED" || d.status === "CLOSED") bucket.resolved += 1
    else bucket.pending += 1
  }
  const weeklyResolution: AgentWeeklyResolution[] = Array.from(weekBuckets.entries()).map(([dateStr, b]) => ({
    day: DAY_NAMES[new Date(dateStr).getDay()],
    resolved: b.resolved,
    pending: b.pending,
  }))

  const reasonCounts = new Map<string, number>()
  for (const d of allMine) reasonCounts.set(d.reason, (reasonCounts.get(d.reason) ?? 0) + 1)
  const total = allMine.length
  const reasonBreakdown: AgentReasonBreakdown[] = Array.from(reasonCounts.entries())
    .map(([name, count]) => ({ name, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)

  return { weeklyResolution, reasonBreakdown }
}
