"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin, logAdminAction } from "@/backend/actions/admin-dashboard"

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

export type FlaggedAccount = {
  userId: string
  name: string
  email: string
  role: string
  moderationStatus: "CLEAR" | "UNDER_REVIEW" | "RESTRICTED"
  reportCount: number
  reasons: string[]
  violationCount: number
  latestAt: string
}

/**
 * Accounts that need a human decision: enough different people reported them,
 * or the platform's own rules flagged their messages.
 *
 * Both signals in one list on purpose — an account with two reports and a
 * dozen "pay me directly" flags is a clearer case than either number alone,
 * and splitting them across two screens hides that.
 */
export async function getFlaggedAccounts(): Promise<FlaggedAccount[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const [reports, violations] = await Promise.all([
    db.contentReport.findMany({
      where: { targetType: "USER", status: "PENDING" },
      include: { reportedUser: { select: { id: true, name: true, email: true, role: true, moderationStatus: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.policyViolation.findMany({
      where: { reviewed: false },
      include: { user: { select: { id: true, name: true, email: true, role: true, moderationStatus: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ])

  type Row = FlaggedAccount & { reporters: Set<string> }
  const byUser = new Map<string, Row>()

  const ensure = (u: { id: string; name: string; email: string; role: string; moderationStatus: string }, at: Date): Row => {
    const existing = byUser.get(u.id)
    if (existing) {
      if (at.toISOString() > existing.latestAt) existing.latestAt = at.toISOString()
      return existing
    }
    const row: Row = {
      userId: u.id, name: u.name, email: u.email, role: u.role,
      moderationStatus: u.moderationStatus as FlaggedAccount["moderationStatus"],
      reportCount: 0, reasons: [], violationCount: 0,
      latestAt: at.toISOString(), reporters: new Set<string>(),
    }
    byUser.set(u.id, row)
    return row
  }

  for (const r of reports) {
    if (!r.reportedUser) continue
    const row = ensure(r.reportedUser, r.createdAt)
    // Counted by distinct reporter, matching the threshold that put the
    // account here — counting rows would overstate it.
    if (r.reporterId) row.reporters.add(r.reporterId)
    if (!row.reasons.includes(r.reason)) row.reasons.push(r.reason)
  }
  for (const v of violations) {
    const row = ensure(v.user, v.createdAt)
    row.violationCount += 1
  }

  return [...byUser.values()]
    .map(({ reporters, ...rest }) => ({ ...rest, reportCount: reporters.size }))
    .sort((a, b) => (b.reportCount + b.violationCount) - (a.reportCount + a.violationCount))
}

export type AccountViolationDetail = {
  id: string
  kind: string
  severity: string
  excerpt: string
  createdAt: string
}

export async function getAccountViolations(userId: string): Promise<AccountViolationDetail[]> {
  const admin = await requireAdmin()
  if (!admin) return []
  const rows = await db.policyViolation.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, take: 50,
  })
  return rows.map((v) => ({
    id: v.id, kind: v.kind, severity: v.severity,
    excerpt: v.excerpt, createdAt: v.createdAt.toISOString(),
  }))
}

const decideSchema = z.object({
  userId: z.string().trim().min(1),
  decision: z.enum(["clear", "restrict"]),
})

/**
 * The admin's decision on a flagged account.
 *
 * "clear" is the approval the reports were waiting on: it resolves the open
 * reports, marks the violations reviewed and puts the account back to normal.
 * "restrict" is the only path that actually limits an account, and it is only
 * ever reachable from here — no amount of reporting sets it by itself.
 */
export async function decideFlaggedAccount(input: unknown): Promise<AdminModerationActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorised." }

  const parsed = decideSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { userId, decision } = parsed.data

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { moderationStatus: decision === "clear" ? "CLEAR" : "RESTRICTED" },
    }),
    db.contentReport.updateMany({
      where: { targetType: "USER", targetId: userId, status: "PENDING" },
      data: { status: decision === "clear" ? "APPROVED" : "REMOVED", resolvedAt: new Date(), resolvedById: admin.userId },
    }),
    db.policyViolation.updateMany({ where: { userId, reviewed: false }, data: { reviewed: true } }),
  ])

  await logAdminAction({
    userId: admin.userId,
    action: decision === "clear" ? "MODERATION_CLEAR_ACCOUNT" : "MODERATION_RESTRICT_ACCOUNT",
    entityType: "USER",
    entityId: userId,
  })
  return { success: true }
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
