"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"
import { pushToUser } from "@/lib/actions/push"

export type AdminDisputeStatus = "Open" | "In Review" | "Resolved" | "Escalated" | "Closed"

export type AdminDispute = {
  id: string
  disputeNumber: string
  user: string
  job: string
  amount: number
  reason: string
  description: string
  status: AdminDisputeStatus
  severity: "High" | "Medium" | "Low"
  date: string
  resolution: string | null
  photos: string[]
}

const STATUS_LABEL: Record<string, AdminDisputeStatus> = {
  OPEN: "Open", IN_REVIEW: "In Review", RESOLVED: "Resolved", ESCALATED: "Escalated", CLOSED: "Closed",
}
const SEVERITY_LABEL: Record<string, "High" | "Medium" | "Low"> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" }

export async function getDisputes(): Promise<AdminDispute[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const disputes = await db.dispute.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: true, job: true, order: true },
  })

  return disputes.map((d) => ({
    id: d.id,
    disputeNumber: d.disputeNumber,
    user: d.customer.name,
    job: d.job?.title ?? (d.order ? `Order ${d.order.orderNumber}` : "N/A"),
    amount: d.refundAmount ? Number(d.refundAmount) : d.job ? Number(d.job.price) : d.order ? Number(d.order.total) : 0,
    reason: d.reason,
    description: d.description,
    status: STATUS_LABEL[d.status] ?? "Open",
    severity: SEVERITY_LABEL[d.severity] ?? "Medium",
    date: d.createdAt.toISOString(),
    resolution: d.resolution,
    photos: d.photos,
  }))
}

export type AdminDisputeActionResult = { success: true } | { success: false; error: string }

const resolveSchema = z.object({
  disputeId: z.string().trim().min(1),
  resolution: z.string().trim().min(5, "Please describe the resolution"),
  refundAmount: z.number().min(0).optional(),
})

export async function resolveDispute(input: unknown): Promise<AdminDisputeActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = resolveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { disputeId, resolution, refundAmount } = parsed.data

  const dispute = await db.dispute.findUnique({ where: { id: disputeId } })
  if (!dispute) return { success: false, error: "Dispute not found." }
  if (dispute.status === "RESOLVED" || dispute.status === "CLOSED") return { success: false, error: "This dispute is already closed." }

  await db.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", resolution, refundAmount: refundAmount || undefined, resolvedAt: new Date() },
    })

    if (refundAmount && refundAmount > 0) {
      const wallet = await tx.wallet.upsert({
        where: { userId: dispute.customerId },
        update: {},
        create: { userId: dispute.customerId },
      })
      const balanceBefore = Number(wallet.balance)
      const balanceAfter = balanceBefore + refundAmount
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } })
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND",
          amount: refundAmount,
          description: `Refund for dispute ${dispute.disputeNumber}`,
          referenceType: "DISPUTE",
          referenceId: dispute.id,
          status: "COMPLETED",
          balanceBefore,
          balanceAfter,
        },
      })
    }

    await tx.notification.create({
      data: {
        userId: dispute.customerId,
        title: "Dispute resolved",
        message: refundAmount && refundAmount > 0
          ? `Dispute ${dispute.disputeNumber} has been resolved. KES ${refundAmount.toLocaleString()} was refunded to your wallet.`
          : `Dispute ${dispute.disputeNumber} has been resolved: ${resolution}`,
        type: "SYSTEM",
      },
    })
  })

  await pushToUser(dispute.customerId, {
    title: "Dispute resolved",
    body: refundAmount && refundAmount > 0
      ? `Dispute ${dispute.disputeNumber} resolved. KES ${refundAmount.toLocaleString()} refunded.`
      : `Dispute ${dispute.disputeNumber} has been resolved.`,
    url: "/customer/disputes",
  })

  await logAdminAction({
    userId: admin.userId,
    action: "dispute.resolve",
    entityType: "Dispute",
    entityId: disputeId,
    oldValues: { status: dispute.status },
    newValues: { status: "RESOLVED", resolution, refundAmount },
  })

  return { success: true }
}

const closeSchema = z.object({
  disputeId: z.string().trim().min(1),
  resolution: z.string().trim().min(5, "Please describe why this dispute is being closed"),
})

export async function closeDispute(input: unknown): Promise<AdminDisputeActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = closeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const dispute = await db.dispute.findUnique({ where: { id: parsed.data.disputeId } })
  if (!dispute) return { success: false, error: "Dispute not found." }
  if (dispute.status === "RESOLVED" || dispute.status === "CLOSED") return { success: false, error: "This dispute is already closed." }

  await db.dispute.update({
    where: { id: dispute.id },
    data: { status: "CLOSED", resolution: parsed.data.resolution, resolvedAt: new Date() },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "dispute.close",
    entityType: "Dispute",
    entityId: dispute.id,
    oldValues: { status: dispute.status },
    newValues: { status: "CLOSED", resolution: parsed.data.resolution },
  })

  return { success: true }
}
