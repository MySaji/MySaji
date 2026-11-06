"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin } from "@/backend/actions/admin-dashboard"
import { activityDateRange } from "@/backend/domain/workspace-personalization"

export async function getAdminTeamActivity(input: unknown) {
  if (!(await requireAdmin())) return { success: false as const, error: "Administrator access is required." }
  const parsed = z
    .object({
      userId: z.string().min(1).max(100),
      from: z.string().length(10),
      to: z.string().length(10),
      before: z.object({ createdAt: z.string().datetime(), id: z.string().min(1).max(100) }).optional(),
    })
    .safeParse(input)
  if (!parsed.success) return { success: false as const, error: "Choose a team member and valid dates." }
  const d = parsed.data,
    range = activityDateRange(d.from, d.to)
  if (!range)
    return { success: false as const, error: "Choose valid dates covering no more than 366 full days." }
  try {
    const member = await db.user.findFirst({
      where: { id: d.userId, role: { in: ["SUB_ADMIN", "SECRETARY", "AGENT"] }, deletedAt: null },
      select: {
        id: true,
        name: true,
        role: true,
        teamProfile: { select: { jobTitle: true, department: true } },
      },
    })
    if (!member) return { success: false as const, error: "This team member is unavailable." }
    const where = { userId: member.id, createdAt: { gte: range.start, lt: range.end } }
    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where: {
          ...where,
          ...(d.before
            ? {
                OR: [
                  { createdAt: { lt: new Date(d.before.createdAt) } },
                  { createdAt: new Date(d.before.createdAt), id: { lt: d.before.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51,
        select: { id: true, action: true, entityType: true, createdAt: true },
      }),
    ])
    const entries = rows.slice(0, 50),
      last = entries.at(-1)
    return {
      success: true as const,
      data: {
        member: {
          id: member.id,
          name: member.name,
          role: member.role,
          jobTitle: member.teamProfile?.jobTitle ?? null,
          department: member.teamProfile?.department ?? null,
        },
        total,
        entries: entries.map((row) => ({
          id: row.id,
          action: row.action,
          entityType: row.entityType,
          createdAt: row.createdAt.toISOString(),
        })),
        next: rows.length > 50 && last ? { id: last.id, createdAt: last.createdAt.toISOString() } : null,
      },
    }
  } catch {
    return { success: false as const, error: "Recorded activity could not be loaded. Please retry." }
  }
}
export type AdminTeamActivity = Extract<
  Awaited<ReturnType<typeof getAdminTeamActivity>>,
  { success: true }
>["data"]
