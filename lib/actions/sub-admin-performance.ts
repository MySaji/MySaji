"use server"

import { db } from "@/lib/db"
import { requireSubAdmin } from "@/lib/actions/sub-admin-dashboard"

export type SubAdminAgentPerformance = {
  agentId: string
  name: string
  casesAssigned: number
  casesResolved: number
  resolutionRatePct: number
  status: "Active" | "Inactive"
}

export type SubAdminPerformanceData = {
  agents: SubAdminAgentPerformance[]
  avgCasesHandled: number
  overallResolutionRatePct: number
} | null

export async function getAgentPerformance(): Promise<SubAdminPerformanceData> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return null

  const agents = await db.user.findMany({
    where: { role: "AGENT", deletedAt: null },
    include: { disputesAssigned: { select: { status: true } } },
  })

  const rows: SubAdminAgentPerformance[] = agents.map((a) => {
    const casesAssigned = a.disputesAssigned.length
    const casesResolved = a.disputesAssigned.filter((d) => d.status === "RESOLVED" || d.status === "CLOSED").length
    return {
      agentId: a.id,
      name: a.name,
      casesAssigned,
      casesResolved,
      resolutionRatePct: casesAssigned > 0 ? Math.round((casesResolved / casesAssigned) * 100) : 0,
      status: (a.isActive ? "Active" : "Inactive") as "Active" | "Inactive",
    }
  }).sort((a, b) => b.casesAssigned - a.casesAssigned)

  const totalAssigned = rows.reduce((sum, r) => sum + r.casesAssigned, 0)
  const totalResolved = rows.reduce((sum, r) => sum + r.casesResolved, 0)

  return {
    agents: rows,
    avgCasesHandled: rows.length > 0 ? Math.round(totalAssigned / rows.length) : 0,
    overallResolutionRatePct: totalAssigned > 0 ? Math.round((totalResolved / totalAssigned) * 100) : 0,
  }
}
