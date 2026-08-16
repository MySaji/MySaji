"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type AdminTeamRole = "sub-admin" | "secretary" | "agent"

export type AdminTeamMember = {
  id: string
  name: string
  email: string
  role: AdminTeamRole
  status: "active" | "inactive"
  joinedDate: string
  teamMemberProfileId: string | null
  jobTitle: string | null
  department: string | null
  managerId: string | null
  managerName: string | null
}

const ROLE_FROM_DB: Record<string, AdminTeamRole> = { SUB_ADMIN: "sub-admin", SECRETARY: "secretary", AGENT: "agent" }

/** jobTitle/department/managerId live on TeamMemberProfile (created for every
 * team member at signup — see registerTeamMember in auth.ts — but never
 * previously surfaced here). Sub-Admin's own Team page only edits this for
 * AGENT-role members; Admin oversees all three roles, so this is the one
 * place an org chart across sub-admins/secretaries/agents can be set. */
export async function getTeamMembers(): Promise<AdminTeamMember[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const users = await db.user.findMany({
    where: { role: { in: ["SUB_ADMIN", "SECRETARY", "AGENT"] }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { teamProfile: { include: { manager: { include: { user: true } } } } },
  })

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: ROLE_FROM_DB[u.role] ?? "agent",
    status: u.isActive ? "active" : "inactive",
    joinedDate: u.createdAt.toISOString(),
    teamMemberProfileId: u.teamProfile?.id ?? null,
    jobTitle: u.teamProfile?.jobTitle ?? null,
    department: u.teamProfile?.department ?? null,
    managerId: u.teamProfile?.managerId ?? null,
    managerName: u.teamProfile?.manager?.user.name ?? null,
  }))
}

export type AdminTeamActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ userId: z.string().trim().min(1) })

export async function toggleTeamMemberActive(input: unknown): Promise<AdminTeamActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const user = await db.user.findUnique({ where: { id: parsed.data.userId } })
  if (!user || !["SUB_ADMIN", "SECRETARY", "AGENT"].includes(user.role)) {
    return { success: false, error: "Team member not found." }
  }

  const nextActive = !user.isActive
  await db.user.update({ where: { id: user.id }, data: { isActive: nextActive } })

  await logAdminAction({
    userId: admin.userId,
    action: nextActive ? "team_member.reactivate" : "team_member.deactivate",
    entityType: "User",
    entityId: user.id,
    oldValues: { isActive: user.isActive },
    newValues: { isActive: nextActive },
  })

  return { success: true }
}

const updateOrgInfoSchema = z.object({
  teamMemberProfileId: z.string().trim().min(1),
  jobTitle: z.string().trim().optional(),
  department: z.string().trim().optional(),
  managerId: z.string().trim().optional().nullable(),
})

/** Same circular-reporting-loop guard as sub-admin-team.ts's
 * updateTeamMemberRole — kept as a separate implementation because this one
 * spans all three team roles rather than being scoped to AGENT. */
export async function updateTeamMemberOrgInfo(input: unknown): Promise<AdminTeamActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = updateOrgInfoSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { teamMemberProfileId, jobTitle, department, managerId } = parsed.data

  const member = await db.teamMemberProfile.findUnique({ where: { id: teamMemberProfileId } })
  if (!member) return { success: false, error: "Team member not found." }

  if (managerId) {
    if (managerId === teamMemberProfileId) return { success: false, error: "A team member can't manage themselves." }
    let cursor = await db.teamMemberProfile.findUnique({ where: { id: managerId } })
    while (cursor?.managerId) {
      if (cursor.managerId === teamMemberProfileId) return { success: false, error: "This would create a circular reporting loop." }
      cursor = await db.teamMemberProfile.findUnique({ where: { id: cursor.managerId } })
    }
  }

  await db.teamMemberProfile.update({
    where: { id: teamMemberProfileId },
    data: {
      jobTitle: jobTitle || undefined,
      department: department || undefined,
      managerId: managerId === undefined ? undefined : (managerId || null),
    },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "team_member.update_org_info",
    entityType: "TeamMemberProfile",
    entityId: teamMemberProfileId,
    oldValues: { jobTitle: member.jobTitle, department: member.department, managerId: member.managerId },
    newValues: { jobTitle, department, managerId },
  })

  return { success: true }
}
