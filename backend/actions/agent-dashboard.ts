"use server"

import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

export async function requireAgent(): Promise<{ userId: string; name: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "agent") return null
  return { userId: session.user.id, name: session.user.name ?? "Agent" }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export type AgentRecentDispute = {
  id: string
  disputeNumber: string
  customer: string
  provider: string | null
  status: string
  severity: string
  amount: number
  date: string
}

export type AgentActivity = {
  id: string
  action: string
  entityId: string
  time: string
}

export type AgentDashboardData = {
  openCount: number
  openChange: number
  resolvedCount: number
  resolvedGrowthPct: number
  resolvedTodayCount: number
  unassignedOpenCount: number
  resolutionRatePct: number
  avgResponseHours: number | null
  recentDisputes: AgentRecentDispute[]
  recentActivity: AgentActivity[]
} | null

export async function getAgentDashboard(): Promise<AgentDashboardData> {
  const agent = await requireAgent()
  if (!agent) return null

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(now.getTime() - 7 * 86400000)
  const startOfPrevWeek = new Date(now.getTime() - 14 * 86400000)

  const [
    openNow, openPrevWeek,
    resolvedAllTime, resolvedPrevAllTime,
    resolvedToday,
    unassignedOpenCount,
    resolvedForAvg,
    recentDisputesRaw,
    recentActivityRaw,
  ] = await Promise.all([
    db.dispute.count({ where: { assignedToId: agent.userId, status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] } } }),
    db.dispute.count({ where: { assignedToId: agent.userId, status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] }, createdAt: { lt: startOfWeek } } }),
    db.dispute.count({ where: { assignedToId: agent.userId, status: { in: ["RESOLVED", "CLOSED"] } } }),
    db.dispute.count({ where: { assignedToId: agent.userId, status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { lt: startOfWeek } } }),
    db.dispute.count({ where: { assignedToId: agent.userId, status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { gte: startOfToday } } }),
    db.dispute.count({ where: { assignedToId: null, status: "OPEN" } }),
    db.dispute.findMany({
      where: { assignedToId: agent.userId, status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    }),
    db.dispute.findMany({
      where: { assignedToId: agent.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: { select: { name: true } }, provider: { include: { user: { select: { name: true } } } }, job: true, order: true },
    }),
    db.auditLog.findMany({
      where: { userId: agent.userId, entityType: "Dispute" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ])

  const totalEverAssigned = openNow + resolvedAllTime
  const resolutionRatePct = totalEverAssigned > 0 ? Math.round((resolvedAllTime / totalEverAssigned) * 1000) / 10 : 0

  const responseDeltas = resolvedForAvg
    .filter((d) => d.resolvedAt)
    .map((d) => (d.resolvedAt!.getTime() - d.createdAt.getTime()) / 3600000)
  const avgResponseHours = responseDeltas.length > 0
    ? Math.round((responseDeltas.reduce((a, b) => a + b, 0) / responseDeltas.length) * 10) / 10
    : null

  const recentDisputes: AgentRecentDispute[] = recentDisputesRaw.map((d) => ({
    id: d.id,
    disputeNumber: d.disputeNumber,
    customer: d.customer.name,
    provider: d.provider?.user.name ?? null,
    status: d.status,
    severity: d.severity,
    amount: d.refundAmount ? Number(d.refundAmount) : d.job ? Number(d.job.price) : d.order ? Number(d.order.total) : 0,
    date: d.createdAt.toISOString(),
  }))

  const recentActivity: AgentActivity[] = recentActivityRaw.map((a) => ({
    id: a.id,
    action: a.action,
    entityId: a.entityId,
    time: a.createdAt.toISOString(),
  }))

  return {
    openCount: openNow,
    openChange: openNow - openPrevWeek,
    resolvedCount: resolvedAllTime,
    resolvedGrowthPct: pctChange(resolvedAllTime, resolvedPrevAllTime),
    resolvedTodayCount: resolvedToday,
    unassignedOpenCount,
    resolutionRatePct,
    avgResponseHours,
    recentDisputes,
    recentActivity,
  }
}
