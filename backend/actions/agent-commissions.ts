"use server"

import { db } from "@/backend/db"
import { requireAgent } from "@/backend/actions/agent-dashboard"

export type AgentCommissionTierInfo = { name: string; rate: number; minJobs: number | null }

export type AgentWalletTransaction = {
  id: string
  description: string
  amount: number
  type: string
  status: string
  date: string
}

export type AgentCommissionsData = {
  casesResolved: number
  casesAssigned: number
  currentTier: AgentCommissionTierInfo | null
  nextTier: AgentCommissionTierInfo | null
  casesToNextTier: number | null
  totalEarned: number
  walletBalance: number
  recentTransactions: AgentWalletTransaction[]
} | null

export async function getAgentCommissions(): Promise<AgentCommissionsData> {
  const agent = await requireAgent()
  if (!agent) return null

  const [casesResolved, casesAssigned, tiers, wallet] = await Promise.all([
    db.dispute.count({ where: { assignedToId: agent.userId, status: { in: ["RESOLVED", "CLOSED"] } } }),
    db.dispute.count({ where: { assignedToId: agent.userId } }),
    db.commissionTier.findMany({ where: { role: "AGENT", status: "ACTIVE" }, orderBy: { minJobs: "asc" } }),
    db.wallet.findUnique({
      where: { userId: agent.userId },
      include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } },
    }),
  ])

  const eligible = tiers.filter((t) => casesResolved >= (t.minJobs ?? 0)).sort((a, b) => (b.minJobs ?? 0) - (a.minJobs ?? 0))
  const currentTier = eligible[0] ?? null
  const nextTier = tiers.filter((t) => (t.minJobs ?? 0) > casesResolved).sort((a, b) => (a.minJobs ?? 0) - (b.minJobs ?? 0))[0] ?? null

  const recentTransactions: AgentWalletTransaction[] = wallet
    ? wallet.transactions.map((t) => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        type: t.type,
        status: t.status,
        date: t.createdAt.toISOString(),
      }))
    : []

  return {
    casesResolved,
    casesAssigned,
    currentTier: currentTier ? { name: currentTier.name, rate: Number(currentTier.rate), minJobs: currentTier.minJobs } : null,
    nextTier: nextTier ? { name: nextTier.name, rate: Number(nextTier.rate), minJobs: nextTier.minJobs } : null,
    casesToNextTier: nextTier?.minJobs != null ? Math.max(0, nextTier.minJobs - casesResolved) : null,
    totalEarned: wallet ? Number(wallet.totalEarned) : 0,
    walletBalance: wallet ? Number(wallet.balance) : 0,
    recentTransactions,
  }
}
