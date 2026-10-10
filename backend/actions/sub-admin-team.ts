"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireSubAdmin } from "@/backend/actions/sub-admin-dashboard"
import { logAdminAction } from "@/backend/actions/admin-dashboard"

export type SubAdminTeamMember = {
  teamMemberProfileId: string
  userId: string
  name: string
  email: string
  jobTitle: string | null
  department: string | null
  status: "Active" | "Inactive"
  managerId: string | null
  managerName: string | null
  reportsCount: number
}

export async function getTeamHierarchy(): Promise<SubAdminTeamMember[]> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return []

  const profiles = await db.teamMemberProfile.findMany({
    where: { user: { role: "AGENT", deletedAt: null } },
    include: {
      user: true,
      manager: { include: { user: true } },
      reports: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return profiles.map((p) => ({
    teamMemberProfileId: p.id,
    userId: p.userId,
    name: p.user.name,
    email: p.user.email,
    jobTitle: p.jobTitle,
    department: p.department,
    status: p.user.isActive ? "Active" : "Inactive",
    managerId: p.managerId,
    managerName: p.manager?.user.name ?? null,
    reportsCount: p.reports.length,
  }))
}

export type SubAdminTeamActionResult = { success: true } | { success: false; error: string }

const updateSchema = z.object({
  teamMemberProfileId: z.string().trim().min(1),
  jobTitle: z.string().trim().optional(),
  department: z.string().trim().optional(),
  managerId: z.string().trim().optional().nullable(),
})

export async function updateTeamMemberRole(input: unknown): Promise<SubAdminTeamActionResult> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return { success: false, error: "You must be signed in as a sub-admin." }

  const parsed = updateSchema.safeParse(input)
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
    userId: subAdmin.userId,
    action: "team_member.update_role",
    entityType: "TeamMemberProfile",
    entityId: teamMemberProfileId,
    oldValues: { jobTitle: member.jobTitle, department: member.department, managerId: member.managerId },
    newValues: { jobTitle, department, managerId },
  })

  return { success: true }
}
