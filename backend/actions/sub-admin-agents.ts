"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireSubAdmin } from "@/backend/actions/sub-admin-dashboard"
import { logAdminAction } from "@/backend/actions/admin-dashboard"
import { registerTeamMember } from "@/backend/actions/auth"

export type SubAdminAgent = {
  id: string
  name: string
  email: string
  phone: string | null
  status: "Active" | "Inactive"
  joined: string
  casesAssigned: number
  casesResolved: number
  commissionRate: number | null
  commissionTierName: string | null
}

export async function getAgents(): Promise<SubAdminAgent[]> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return []

  const [agents, tiers] = await Promise.all([
    db.user.findMany({
      where: { role: "AGENT", deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { disputesAssigned: { select: { status: true } } },
    }),
    db.commissionTier.findMany({ where: { role: "AGENT", status: "ACTIVE" }, orderBy: { minJobs: "desc" } }),
  ])

  return agents.map((a) => {
    const casesAssigned = a.disputesAssigned.length
    const casesResolved = a.disputesAssigned.filter((d) => d.status === "RESOLVED" || d.status === "CLOSED").length
    const tier = tiers.find((t) => casesResolved >= (t.minJobs ?? 0)) ?? null

    return {
      id: a.id,
      name: a.name,
      email: a.email,
      phone: a.phone,
      status: a.isActive ? "Active" : "Inactive",
      joined: a.createdAt.toISOString(),
      casesAssigned,
      casesResolved,
      commissionRate: tier ? Number(tier.rate) : null,
      commissionTierName: tier?.name ?? null,
    }
  })
}

export type SubAdminAgentActionResult = { success: true; userId?: string; temporaryPassword?: string } | { success: false; error: string }

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
})

export async function createAgent(input: unknown): Promise<SubAdminAgentActionResult> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return { success: false, error: "You must be signed in as a sub-admin." }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const result = await registerTeamMember({ name: parsed.data.name, email: parsed.data.email, teamRole: "agent" })
  if (!result.success) return { success: false, error: result.error }

  await logAdminAction({
    userId: subAdmin.userId,
    action: "agent.create",
    entityType: "User",
    entityId: result.userId,
    newValues: { name: parsed.data.name, email: parsed.data.email },
  })

  return { success: true, userId: result.userId, temporaryPassword: result.temporaryPassword }
}

const editSchema = z.object({
  agentId: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
})

export async function editAgent(input: unknown): Promise<SubAdminAgentActionResult> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return { success: false, error: "You must be signed in as a sub-admin." }

  const parsed = editSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const agent = await db.user.findUnique({ where: { id: parsed.data.agentId } })
  if (!agent || agent.role !== "AGENT") return { success: false, error: "Agent not found." }

  await db.user.update({ where: { id: agent.id }, data: { name: parsed.data.name, phone: parsed.data.phone || undefined } })
  await logAdminAction({
    userId: subAdmin.userId,
    action: "agent.edit",
    entityType: "User",
    entityId: agent.id,
    oldValues: { name: agent.name, phone: agent.phone },
    newValues: { name: parsed.data.name, phone: parsed.data.phone },
  })

  return { success: true }
}

const idSchema = z.object({ agentId: z.string().trim().min(1) })

export async function toggleAgentActive(input: unknown): Promise<SubAdminAgentActionResult> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return { success: false, error: "You must be signed in as a sub-admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const agent = await db.user.findUnique({ where: { id: parsed.data.agentId } })
  if (!agent || agent.role !== "AGENT") return { success: false, error: "Agent not found." }

  const nextActive = !agent.isActive
  await db.user.update({ where: { id: agent.id }, data: { isActive: nextActive } })
  await logAdminAction({
    userId: subAdmin.userId,
    action: nextActive ? "agent.reactivate" : "agent.deactivate",
    entityType: "User",
    entityId: agent.id,
    oldValues: { isActive: agent.isActive },
    newValues: { isActive: nextActive },
  })

  return { success: true }
}
