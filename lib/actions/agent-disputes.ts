"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAgent } from "@/lib/actions/agent-dashboard"
import { logAdminAction } from "@/lib/actions/admin-dashboard"
import { pushToUser } from "@/lib/actions/push"

export type AgentDisputeStatus = "Open" | "In Review" | "Resolved" | "Escalated" | "Closed"

export type AgentDispute = {
  id: string
  disputeNumber: string
  customer: string
  provider: string | null
  context: string
  amount: number
  reason: string
  description: string
  status: AgentDisputeStatus
  severity: "High" | "Medium" | "Low"
  date: string
  resolution: string | null
  photos: string[]
  isMine: boolean
}

const STATUS_LABEL: Record<string, AgentDisputeStatus> = {
  OPEN: "Open", IN_REVIEW: "In Review", RESOLVED: "Resolved", ESCALATED: "Escalated", CLOSED: "Closed",
}
const SEVERITY_LABEL: Record<string, "High" | "Medium" | "Low"> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" }

export async function getAgentDisputes(): Promise<AgentDispute[] | null> {
  const agent = await requireAgent()
  if (!agent) return null

  const disputes = await db.dispute.findMany({
    where: { OR: [{ assignedToId: agent.userId }, { assignedToId: null, status: "OPEN" }] },
    orderBy: { createdAt: "desc" },
    include: { customer: true, provider: { include: { user: true } }, job: true, order: true },
  })

  return disputes.map((d) => ({
    id: d.id,
    disputeNumber: d.disputeNumber,
    customer: d.customer.name,
    provider: d.provider?.user.name ?? null,
    context: d.job?.title ?? (d.order ? `Order ${d.order.orderNumber}` : "N/A"),
    amount: d.refundAmount ? Number(d.refundAmount) : d.job ? Number(d.job.price) : d.order ? Number(d.order.total) : 0,
    reason: d.reason,
    description: d.description,
    status: STATUS_LABEL[d.status] ?? "Open",
    severity: SEVERITY_LABEL[d.severity] ?? "Medium",
    date: d.createdAt.toISOString(),
    resolution: d.resolution,
    photos: d.photos,
    isMine: d.assignedToId === agent.userId,
  }))
}

export type AgentDisputeNote = { id: string; senderName: string; isMine: boolean; message: string; time: string }

export async function getDisputeNotes(disputeId: string): Promise<AgentDisputeNote[] | null> {
  const agent = await requireAgent()
  if (!agent) return null

  const notes = await db.disputeMessage.findMany({
    where: { disputeId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { name: true } } },
  })

  return notes.map((n) => ({
    id: n.id,
    senderName: n.sender.name,
    isMine: n.senderId === agent.userId,
    message: n.message,
    time: n.createdAt.toISOString(),
  }))
}

type ActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ disputeId: z.string().trim().min(1) })

export async function claimDispute(input: unknown): Promise<ActionResult> {
  const agent = await requireAgent()
  if (!agent) return { success: false, error: "Not authorized." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const dispute = await db.dispute.findUnique({ where: { id: parsed.data.disputeId } })
  if (!dispute) return { success: false, error: "Dispute not found." }
  if (dispute.assignedToId) return { success: false, error: "This dispute is already assigned." }
  if (dispute.status !== "OPEN") return { success: false, error: "Only open disputes can be claimed." }

  await db.dispute.update({ where: { id: dispute.id }, data: { assignedToId: agent.userId } })
  await logAdminAction({
    userId: agent.userId,
    action: "dispute.claim",
    entityType: "Dispute",
    entityId: dispute.id,
    newValues: { assignedToId: agent.userId },
  })

  return { success: true }
}

const noteSchema = z.object({
  disputeId: z.string().trim().min(1),
  message: z.string().trim().min(1, "Enter a note").max(1000),
})

export async function addDisputeNote(input: unknown): Promise<ActionResult> {
  const agent = await requireAgent()
  if (!agent) return { success: false, error: "Not authorized." }

  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const dispute = await db.dispute.findUnique({ where: { id: parsed.data.disputeId } })
  if (!dispute) return { success: false, error: "Dispute not found." }
  if (dispute.assignedToId !== agent.userId) return { success: false, error: "This dispute isn't assigned to you." }

  await db.disputeMessage.create({
    data: { disputeId: dispute.id, senderId: agent.userId, message: parsed.data.message },
  })

  return { success: true }
}

const resolveSchema = z.object({
  disputeId: z.string().trim().min(1),
  resolution: z.string().trim().min(5, "Please describe the resolution"),
  refundAmount: z.number().min(0).optional(),
})

export async function resolveDisputeAsAgent(input: unknown): Promise<ActionResult> {
  const agent = await requireAgent()
  if (!agent) return { success: false, error: "Not authorized." }

  const parsed = resolveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { disputeId, resolution, refundAmount } = parsed.data

  const dispute = await db.dispute.findUnique({ where: { id: disputeId } })
  if (!dispute) return { success: false, error: "Dispute not found." }
  if (dispute.assignedToId !== agent.userId) return { success: false, error: "This dispute isn't assigned to you." }
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
      ? `Dispute ${dispute.disputeNumber} resolved — KES ${refundAmount.toLocaleString()} refunded.`
      : `Dispute ${dispute.disputeNumber} has been resolved.`,
    url: "/customer/disputes",
  })

  await logAdminAction({
    userId: agent.userId,
    action: "dispute.resolve",
    entityType: "Dispute",
    entityId: disputeId,
    oldValues: { status: dispute.status },
    newValues: { status: "RESOLVED", resolution, refundAmount },
  })

  return { success: true }
}

const escalateSchema = z.object({
  disputeId: z.string().trim().min(1),
  reason: z.string().trim().min(5, "Please explain why this needs to go to a supervisor"),
})

/** For a case beyond the agent's authority — clears assignedToId so it drops
 * out of this agent's own queue (getAgentDisputes only shows disputes
 * assigned to the caller or unclaimed OPEN ones) and lands in Admin's and
 * Sub-Admin's dispute queues instead (both list every dispute regardless of
 * status, see admin-disputes.ts / sub-admin-disputes.ts), with the agent's
 * reasoning preserved as a DisputeMessage so the next reviewer has context. */
export async function escalateDisputeAsAgent(input: unknown): Promise<ActionResult> {
  const agent = await requireAgent()
  if (!agent) return { success: false, error: "Not authorized." }

  const parsed = escalateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const dispute = await db.dispute.findUnique({ where: { id: parsed.data.disputeId } })
  if (!dispute) return { success: false, error: "Dispute not found." }
  if (dispute.assignedToId !== agent.userId) return { success: false, error: "This dispute isn't assigned to you." }
  if (dispute.status === "RESOLVED" || dispute.status === "CLOSED") return { success: false, error: "This dispute is already closed." }

  await db.$transaction([
    db.dispute.update({
      where: { id: dispute.id },
      data: { status: "ESCALATED", assignedToId: null, severity: "HIGH" },
    }),
    db.disputeMessage.create({
      data: { disputeId: dispute.id, senderId: agent.userId, message: `Escalated to a supervisor: ${parsed.data.reason}` },
    }),
  ])

  await logAdminAction({
    userId: agent.userId,
    action: "dispute.escalate",
    entityType: "Dispute",
    entityId: dispute.id,
    oldValues: { status: dispute.status, assignedToId: dispute.assignedToId },
    newValues: { status: "ESCALATED", assignedToId: null },
  })

  return { success: true }
}

const closeSchema = z.object({
  disputeId: z.string().trim().min(1),
  resolution: z.string().trim().min(5, "Please describe why this dispute is being closed"),
})

export async function closeDisputeAsAgent(input: unknown): Promise<ActionResult> {
  const agent = await requireAgent()
  if (!agent) return { success: false, error: "Not authorized." }

  const parsed = closeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const dispute = await db.dispute.findUnique({ where: { id: parsed.data.disputeId } })
  if (!dispute) return { success: false, error: "Dispute not found." }
  if (dispute.assignedToId !== agent.userId) return { success: false, error: "This dispute isn't assigned to you." }
  if (dispute.status === "RESOLVED" || dispute.status === "CLOSED") return { success: false, error: "This dispute is already closed." }

  await db.dispute.update({
    where: { id: dispute.id },
    data: { status: "CLOSED", resolution: parsed.data.resolution, resolvedAt: new Date() },
  })

  await logAdminAction({
    userId: agent.userId,
    action: "dispute.close",
    entityType: "Dispute",
    entityId: dispute.id,
    oldValues: { status: dispute.status },
    newValues: { status: "CLOSED", resolution: parsed.data.resolution },
  })

  return { success: true }
}
