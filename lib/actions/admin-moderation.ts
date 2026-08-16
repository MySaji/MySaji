"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type AdminContentReport = {
  id: string
  type: "post" | "post_comment" | "review" | "message"
  targetId: string
  user: string
  content: string
  reason: string
  severity: "high" | "medium" | "low"
  time: string
  reportCount: number
}

const TYPE_FROM_DB: Record<string, AdminContentReport["type"]> = {
  POST: "post", POST_COMMENT: "post_comment", REVIEW: "review", MESSAGE: "message",
}
const SEVERITY_FROM_DB: Record<string, AdminContentReport["severity"]> = { HIGH: "high", MEDIUM: "medium", LOW: "low" }

export async function getContentReports(): Promise<AdminContentReport[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const reports = await db.contentReport.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { reportedUser: true },
  })

  const grouped = new Map<string, typeof reports>()
  for (const r of reports) {
    const key = `${r.targetType}:${r.targetId}`
    grouped.set(key, [...(grouped.get(key) ?? []), r])
  }

  return Array.from(grouped.values()).map((group) => {
    const first = group[0]
    return {
      id: first.id,
      type: TYPE_FROM_DB[first.targetType] ?? "post",
      targetId: first.targetId,
      user: first.reportedUser?.name ?? "Unknown",
      content: first.contentSnapshot,
      reason: first.reason,
      severity: SEVERITY_FROM_DB[first.severity] ?? "medium",
      time: first.createdAt.toISOString(),
      reportCount: group.length,
    }
  })
}

export type AdminModerationActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ reportId: z.string().trim().min(1) })

export async function approveReportedContent(input: unknown): Promise<AdminModerationActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const report = await db.contentReport.findUnique({ where: { id: parsed.data.reportId } })
  if (!report) return { success: false, error: "Report not found." }

  await db.contentReport.updateMany({
    where: { targetType: report.targetType, targetId: report.targetId, status: "PENDING" },
    data: { status: "APPROVED", resolvedAt: new Date(), resolvedById: admin.userId },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "content_report.approve",
    entityType: report.targetType,
    entityId: report.targetId,
  })

  return { success: true }
}

export async function removeReportedContent(input: unknown): Promise<AdminModerationActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const report = await db.contentReport.findUnique({ where: { id: parsed.data.reportId } })
  if (!report) return { success: false, error: "Report not found." }

  await db.contentReport.updateMany({
    where: { targetType: report.targetType, targetId: report.targetId, status: "PENDING" },
    data: { status: "REMOVED", resolvedAt: new Date(), resolvedById: admin.userId },
  })

  if (report.targetType === "POST") {
    await db.post.updateMany({ where: { id: report.targetId }, data: { isArchived: true } }).catch(() => {})
  }

  await logAdminAction({
    userId: admin.userId,
    action: "content_report.remove",
    entityType: report.targetType,
    entityId: report.targetId,
  })

  return { success: true }
}
