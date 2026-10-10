"use server"

import { db } from "@/backend/db"
import { requireAgent } from "@/backend/actions/agent-dashboard"

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export type AgentMonthlyStat = { month: string; cases: number; resolved: number; resolutionRatePct: number }

export type AgentStatsData = {
  totalCases: number
  resolutionRatePct: number
  avgResponseHours: number | null
  resolvedCount: number
  monthlyStats: AgentMonthlyStat[]
  fastestResolutionHours: number | null
  bestMonth: { month: string; resolutionRatePct: number } | null
  escalationRatePct: number
} | null

export async function getAgentStats(): Promise<AgentStatsData> {
  const agent = await requireAgent()
  if (!agent) return null

  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [allMine, everEscalatedCount, totalMineCount] = await Promise.all([
    db.dispute.findMany({
      where: { assignedToId: agent.userId, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, resolvedAt: true, status: true },
    }),
    db.dispute.count({ where: { assignedToId: agent.userId, status: "ESCALATED" } }),
    db.dispute.count({ where: { assignedToId: agent.userId } }),
  ])

  const monthBuckets = new Map<string, { cases: number; resolved: number }>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthBuckets.set(`${d.getFullYear()}-${d.getMonth()}`, { cases: 0, resolved: 0 })
  }
  for (const d of allMine) {
    const key = `${d.createdAt.getFullYear()}-${d.createdAt.getMonth()}`
    const bucket = monthBuckets.get(key)
    if (!bucket) continue
    bucket.cases += 1
    if (d.status === "RESOLVED" || d.status === "CLOSED") bucket.resolved += 1
  }
  const monthlyStats: AgentMonthlyStat[] = Array.from(monthBuckets.entries()).map(([key, b]) => ({
    month: MONTH_NAMES[Number(key.split("-")[1])],
    cases: b.cases,
    resolved: b.resolved,
    resolutionRatePct: b.cases > 0 ? Math.round((b.resolved / b.cases) * 100) : 0,
  }))

  const resolvedWithTimes = allMine.filter((d) => d.resolvedAt && (d.status === "RESOLVED" || d.status === "CLOSED"))
  const responseDeltas = resolvedWithTimes.map((d) => (d.resolvedAt!.getTime() - d.createdAt.getTime()) / 3600000)
  const avgResponseHours = responseDeltas.length > 0
    ? Math.round((responseDeltas.reduce((a, b) => a + b, 0) / responseDeltas.length) * 10) / 10
    : null
  const fastestResolutionHours = responseDeltas.length > 0 ? Math.round(Math.min(...responseDeltas) * 10) / 10 : null

  const bestMonth = monthlyStats.filter((m) => m.cases > 0).sort((a, b) => b.resolutionRatePct - a.resolutionRatePct)[0]

  const totalCases = allMine.length
  const resolvedCount = allMine.filter((d) => d.status === "RESOLVED" || d.status === "CLOSED").length
  const resolutionRatePct = totalCases > 0 ? Math.round((resolvedCount / totalCases) * 1000) / 10 : 0

  return {
    totalCases,
    resolutionRatePct,
    avgResponseHours,
    resolvedCount,
    monthlyStats,
    fastestResolutionHours,
    bestMonth: bestMonth ? { month: bestMonth.month, resolutionRatePct: bestMonth.resolutionRatePct } : null,
    escalationRatePct: totalMineCount > 0 ? Math.round((everEscalatedCount / totalMineCount) * 1000) / 10 : 0,
  }
}
