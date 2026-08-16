"use server"

import { db } from "@/lib/db"
import { requireSubAdmin } from "@/lib/actions/sub-admin-dashboard"

export type UserActivityRow = { name: string; email: string; role: string; status: string; joined: string; ordersOrJobs: number }

export async function getUserActivityReport(): Promise<UserActivityRow[]> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return []

  const users = await db.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      providerProfile: { select: { completedJobs: true } },
      _count: { select: { orders: true, jobsAsCustomer: true } },
    },
  })

  return users.map((u) => ({
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.isActive ? "Active" : "Suspended",
    joined: u.createdAt.toISOString().split("T")[0],
    ordersOrJobs: u._count.orders + u._count.jobsAsCustomer + (u.providerProfile?.completedJobs ?? 0),
  }))
}

export type VerificationSummaryRow = { name: string; role: string; documentType: string; status: string; submitted: string; reviewed: string }

export async function getVerificationSummaryReport(): Promise<VerificationSummaryRow[]> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return []

  const docs = await db.kycDocument.findMany({
    orderBy: { submittedAt: "desc" },
    take: 500,
    include: { user: true },
  })

  return docs.map((d) => ({
    name: d.user.name,
    role: d.user.role,
    documentType: d.documentType,
    status: d.status,
    submitted: d.submittedAt.toISOString().split("T")[0],
    reviewed: d.reviewedAt ? d.reviewedAt.toISOString().split("T")[0] : "—",
  }))
}

export type DisputeResolutionRow = { disputeNumber: string; status: string; severity: string; assignedAgent: string; created: string; resolved: string }

export async function getDisputeResolutionReport(): Promise<DisputeResolutionRow[]> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return []

  const disputes = await db.dispute.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { assignedTo: true },
  })

  return disputes.map((d) => ({
    disputeNumber: d.disputeNumber,
    status: d.status,
    severity: d.severity,
    assignedAgent: d.assignedTo?.name ?? "Unassigned",
    created: d.createdAt.toISOString().split("T")[0],
    resolved: d.resolvedAt ? d.resolvedAt.toISOString().split("T")[0] : "—",
  }))
}
