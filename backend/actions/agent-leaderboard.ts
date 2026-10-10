"use server"

import { db } from "@/backend/db"
import { requireAgent } from "@/backend/actions/agent-dashboard"

export type AgentLeaderboardRow = {
  rank: number
  userId: string
  name: string
  casesAssigned: number
  casesResolved: number
  resolutionRatePct: number
  isYou: boolean
}

export async function getAgentLeaderboard(): Promise<AgentLeaderboardRow[] | null> {
  const agent = await requireAgent()
  if (!agent) return null

  const agents = await db.user.findMany({
    where: { role: "AGENT", deletedAt: null },
    select: { id: true, name: true, disputesAssigned: { select: { status: true } } },
  })

  const rows = agents.map((a) => {
    const casesAssigned = a.disputesAssigned.length
    const casesResolved = a.disputesAssigned.filter((d) => d.status === "RESOLVED" || d.status === "CLOSED").length
    return {
      userId: a.id,
      name: a.name,
      casesAssigned,
      casesResolved,
      resolutionRatePct: casesAssigned > 0 ? Math.round((casesResolved / casesAssigned) * 100) : 0,
      isYou: a.id === agent.userId,
    }
  })

  rows.sort((a, b) => b.casesResolved - a.casesResolved || b.resolutionRatePct - a.resolutionRatePct)

  return rows.map((r, i) => ({ rank: i + 1, ...r }))
}
