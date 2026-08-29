"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function requireSubAdmin(): Promise<{ userId: string; name: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "sub-admin") return null
  return { userId: session.user.id, name: session.user.name ?? "Sub-Admin" }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export type SubAdminPendingAction = { id: string; title: string; type: "verification" | "report"; urgency: "high" | "medium" | "low"; time: string }
export type SubAdminActivity = { id: string; action: string; detail: string; time: string; kind: "success" | "warning" | "error" }

export type SubAdminDashboardData = {
  totalUsers: number
  usersGrowthPct: number
  activeJobs: number
  activeJobsGrowthPct: number
  verifiedUsers: number
  verifiedUsersGrowthPct: number
  pendingApprovals: number
  pendingApprovalsChange: number
  weeklyData: { day: string; users: number; verifications: number }[]
  roleData: { name: string; value: number }[]
  pendingActions: SubAdminPendingAction[]
  recentActivity: SubAdminActivity[]
} | null

const ACTIVITY_LABEL: Record<string, { action: string; kind: SubAdminActivity["kind"] }> = {
  "verification.approve": { action: "Approved verification", kind: "success" },
  "verification.reject": { action: "Rejected verification", kind: "error" },
  "user.suspend": { action: "Suspended account", kind: "warning" },
  "user.reactivate": { action: "Reactivated account", kind: "success" },
  "dispute.resolve": { action: "Resolved dispute", kind: "success" },
  "content_report.approve": { action: "Approved flagged content", kind: "success" },
  "content_report.remove": { action: "Removed flagged content", kind: "warning" },
}

export async function getSubAdminDashboard(): Promise<SubAdminDashboardData> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return null

  const now = new Date()
  const startOfWeek = new Date(now.getTime() - 7 * 86400000)
  const startOfPrevWeek = new Date(now.getTime() - 14 * 86400000)

  const [
    totalUsers, usersThisWeek, usersPrevWeek,
    activeJobs, activeJobsPrev,
    verifiedUsers, verifiedThisWeek, verifiedPrevWeek,
    pendingApprovals, pendingApprovalsPrevWeek,
    weekSignups, weekVerificationSubmissions,
    roleCounts,
    pendingDocs, pendingReports,
    recentLogs,
  ] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfWeek } } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: startOfPrevWeek, lt: startOfWeek } } }),
    db.job.count({ where: { status: { in: ["ACCEPTED", "IN_PROGRESS"] } } }),
    db.job.count({ where: { status: { in: ["ACCEPTED", "IN_PROGRESS"] }, createdAt: { gte: startOfPrevWeek, lt: startOfWeek } } }),
    db.user.count({ where: { kycStatus: "APPROVED", deletedAt: null } }),
    db.kycDocument.count({ where: { status: "APPROVED", reviewedAt: { gte: startOfWeek } } }),
    db.kycDocument.count({ where: { status: "APPROVED", reviewedAt: { gte: startOfPrevWeek, lt: startOfWeek } } }),
    db.kycDocument.count({ where: { status: "PENDING" } }),
    db.kycDocument.count({ where: { status: "PENDING", submittedAt: { lt: startOfWeek } } }),
    db.user.findMany({ where: { deletedAt: null, createdAt: { gte: startOfWeek } }, select: { createdAt: true } }),
    db.kycDocument.findMany({ where: { submittedAt: { gte: startOfWeek } }, select: { submittedAt: true } }),
    db.user.groupBy({ by: ["role"], where: { deletedAt: null, role: { in: ["CUSTOMER", "PROVIDER", "SHOPKEEPER", "AGENT"] } }, _count: true }),
    db.kycDocument.findMany({ where: { status: "PENDING" }, orderBy: { submittedAt: "desc" }, take: 3, include: { user: true } }),
    db.contentReport.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 2, include: { reportedUser: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
  ])

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const userBuckets = new Map<string, number>()
  const verifBuckets = new Map<string, number>()
  for (const u of weekSignups) userBuckets.set(dayLabels[u.createdAt.getDay()], (userBuckets.get(dayLabels[u.createdAt.getDay()]) ?? 0) + 1)
  for (const v of weekVerificationSubmissions) verifBuckets.set(dayLabels[v.submittedAt.getDay()], (verifBuckets.get(dayLabels[v.submittedAt.getDay()]) ?? 0) + 1)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86400000)
    const label = dayLabels[d.getDay()]
    return { day: label, users: userBuckets.get(label) ?? 0, verifications: verifBuckets.get(label) ?? 0 }
  })

  const roleLabel: Record<string, string> = { CUSTOMER: "Customers", PROVIDER: "Providers", SHOPKEEPER: "Shopkeepers", AGENT: "Agents" }
  const roleData = roleCounts.map((r) => ({ name: roleLabel[r.role] ?? r.role, value: r._count })).sort((a, b) => b.value - a.value)

  const pendingActions: SubAdminPendingAction[] = [
    ...pendingDocs.map((d) => ({
      id: d.id,
      title: `${d.user.name}, ${d.documentType.replace(/_/g, " ")} Verification`,
      type: "verification" as const,
      urgency: (Date.now() - d.submittedAt.getTime() > 3 * 86400000 ? "high" : "medium") as "high" | "medium",
      time: d.submittedAt.toISOString(),
    })),
    ...pendingReports.map((r) => ({
      id: r.id,
      title: `Flagged content from ${r.reportedUser?.name ?? "Unknown"}`,
      type: "report" as const,
      urgency: "medium" as const,
      time: r.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5)

  const recentActivity: SubAdminActivity[] = recentLogs
    .filter((l) => ACTIVITY_LABEL[l.action])
    .slice(0, 4)
    .map((l) => ({
      id: l.id,
      action: ACTIVITY_LABEL[l.action].action,
      detail: l.user?.name ?? "System",
      time: l.createdAt.toISOString(),
      kind: ACTIVITY_LABEL[l.action].kind,
    }))

  return {
    totalUsers,
    usersGrowthPct: pctChange(usersThisWeek, usersPrevWeek),
    activeJobs,
    activeJobsGrowthPct: pctChange(activeJobs, activeJobsPrev),
    verifiedUsers,
    verifiedUsersGrowthPct: pctChange(verifiedThisWeek, verifiedPrevWeek),
    pendingApprovals,
    pendingApprovalsChange: pendingApprovals - pendingApprovalsPrevWeek,
    weeklyData,
    roleData,
    pendingActions,
    recentActivity,
  }
}
