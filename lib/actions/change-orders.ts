"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requirePro } from "@/lib/actions/provider-subscription"
import { logJobEvent } from "@/lib/actions/job-events"
import { notifyUser } from "@/lib/actions/notify"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type ChangeOrderStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED"
export type ChangeOrderActionResult = { success: true } | { success: false; error: string }

// ============================= PROVIDER =============================

const createChangeOrderSchema = z.object({
  jobId: z.string().trim().min(1),
  description: z.string().trim().min(1, "Describe the change"),
  additionalWork: z.string().trim().min(1, "Describe the additional work"),
  additionalCost: z.coerce.number().min(0, "Enter a valid amount"),
  additionalTimeDays: z.coerce.number().int().min(0).optional(),
  photos: z.array(z.string()).optional(),
})

/** Never touches Job.price or Job.expectedCompletionAt itself — this only
 * ever creates a PENDING request. Real money/scope changes only ever
 * happen inside respondToChangeOrder, and only on the customer's explicit
 * approval — a provider can't move the price on their own. */
export async function createChangeOrder(input: unknown): Promise<ChangeOrderActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const denied = await requirePro()
  if (denied) return denied

  const parsed = createChangeOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }
  if (job.status !== "ACCEPTED" && job.status !== "IN_PROGRESS") {
    return { success: false, error: "Change orders can only be requested on an active job." }
  }

  const changeOrder = await db.changeOrder.create({
    data: {
      jobId: job.id,
      requestedById: provider.userId,
      description: parsed.data.description,
      additionalWork: parsed.data.additionalWork,
      additionalCost: parsed.data.additionalCost,
      additionalTimeDays: parsed.data.additionalTimeDays,
      photos: parsed.data.photos ?? [],
      status: "PENDING",
    },
  })

  await logJobEvent({
    jobId: job.id, type: "CHANGE_ORDER_REQUESTED", actor: "PROVIDER", actorUserId: provider.userId,
    description: `Provider requested a change: ${parsed.data.additionalWork} (+KES ${parsed.data.additionalCost.toLocaleString()})`,
    metadata: { changeOrderId: changeOrder.id, additionalCost: parsed.data.additionalCost, additionalTimeDays: parsed.data.additionalTimeDays ?? null },
    attachments: parsed.data.photos,
  })

  await notifyUser({
    userId: job.customerId, title: "Change request", message: `Your provider requested a change to "${job.title}": +KES ${parsed.data.additionalCost.toLocaleString()}`,
    type: "JOB", relatedType: "JOB", relatedId: job.id, actionUrl: "/customer/jobs",
  })

  return { success: true }
}

const idSchema = z.object({ changeOrderId: z.string().trim().min(1) })

export async function cancelChangeOrder(input: unknown): Promise<ChangeOrderActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const changeOrder = await db.changeOrder.findUnique({ where: { id: parsed.data.changeOrderId }, include: { job: true } })
  if (!changeOrder || changeOrder.job.providerId !== provider.providerId) return { success: false, error: "Change order not found." }
  if (changeOrder.status !== "PENDING") return { success: false, error: "This change order has already been resolved." }

  await db.changeOrder.update({ where: { id: changeOrder.id }, data: { status: "CANCELLED", respondedAt: new Date() } })
  await logJobEvent({ jobId: changeOrder.jobId, type: "CHANGE_ORDER_CANCELLED", actor: "PROVIDER", actorUserId: provider.userId, description: "Provider cancelled the change request" })

  return { success: true }
}

// ============================= CUSTOMER =============================

const respondSchema = z.object({
  changeOrderId: z.string().trim().min(1),
  approve: z.boolean(),
  declineReason: z.string().trim().optional(),
})

/** The only place a Change Order actually touches the Job — and only after
 * explicit customer approval. Job.description is appended to (the
 * originally-agreed scope stays intact and readable), Job.price increases
 * by exactly additionalCost, and Job.expectedCompletionAt advances by
 * additionalTimeDays if one was given. */
export async function respondToChangeOrder(input: unknown): Promise<ChangeOrderActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") return { success: false, error: "You must be signed in as a customer." }

  const parsed = respondSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const changeOrder = await db.changeOrder.findUnique({ where: { id: parsed.data.changeOrderId }, include: { job: true } })
  if (!changeOrder || changeOrder.job.customerId !== session.user.id) return { success: false, error: "Change order not found." }
  if (changeOrder.status !== "PENDING") return { success: false, error: "This change order has already been resolved." }

  if (!parsed.data.approve) {
    await db.changeOrder.update({
      where: { id: changeOrder.id },
      data: { status: "DECLINED", declineReason: parsed.data.declineReason || null, respondedAt: new Date() },
    })
    await logJobEvent({
      jobId: changeOrder.jobId, type: "CHANGE_ORDER_DECLINED", actor: "CUSTOMER", actorUserId: session.user.id,
      description: parsed.data.declineReason ? `Customer declined the change request: ${parsed.data.declineReason}` : "Customer declined the change request",
    })
    if (changeOrder.job.providerId) {
      const provider = await db.providerProfile.findUnique({ where: { id: changeOrder.job.providerId } })
      if (provider) {
        await notifyUser({
          userId: provider.userId, title: "Change request declined", message: `Your change request for "${changeOrder.job.title}" was declined.`, type: "JOB", relatedType: "JOB", relatedId: changeOrder.jobId, actionUrl: "/provider/jobs",
        })
      }
    }
    return { success: true }
  }

  const newPrice = Number(changeOrder.job.price) + Number(changeOrder.additionalCost)
  const newDescription = `${changeOrder.job.description}\n\n[Change order approved: ${changeOrder.additionalWork}]`
  const newExpectedCompletion = changeOrder.additionalTimeDays
    ? new Date((changeOrder.job.expectedCompletionAt ?? changeOrder.job.scheduledDate).getTime() + changeOrder.additionalTimeDays * 86400000)
    : changeOrder.job.expectedCompletionAt

  await db.$transaction([
    db.changeOrder.update({ where: { id: changeOrder.id }, data: { status: "APPROVED", respondedAt: new Date() } }),
    db.job.update({
      where: { id: changeOrder.jobId },
      data: { price: newPrice, description: newDescription, expectedCompletionAt: newExpectedCompletion },
    }),
  ])

  await logJobEvent({
    jobId: changeOrder.jobId, type: "CHANGE_ORDER_APPROVED", actor: "CUSTOMER", actorUserId: session.user.id,
    description: `Customer approved the change request, price updated to KES ${newPrice.toLocaleString()}`,
    metadata: { newPrice, additionalTimeDays: changeOrder.additionalTimeDays ?? null },
  })

  if (changeOrder.job.providerId) {
    const provider = await db.providerProfile.findUnique({ where: { id: changeOrder.job.providerId } })
    if (provider) {
      await notifyUser({
        userId: provider.userId, title: "Change request approved", message: `Your change request for "${changeOrder.job.title}" was approved.`, type: "JOB", relatedType: "JOB", relatedId: changeOrder.jobId, actionUrl: "/provider/jobs",
      })
    }
  }

  return { success: true }
}

// ============================= READS =============================

export type ChangeOrderItem = {
  id: string
  description: string
  additionalWork: string
  additionalCost: number
  additionalTimeDays: number | null
  photos: string[]
  status: ChangeOrderStatus
  declineReason: string | null
  createdAt: string
}

export async function getJobChangeOrders(jobId: string): Promise<ChangeOrderItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const job = await db.job.findUnique({ where: { id: jobId }, include: { provider: true } })
  if (!job) return []

  const isCustomer = job.customerId === session.user.id
  const isProvider = job.provider?.userId === session.user.id
  if (!isCustomer && !isProvider && session.user.role !== "admin") return []

  const changeOrders = await db.changeOrder.findMany({ where: { jobId }, orderBy: { createdAt: "desc" } })

  return changeOrders.map((c) => ({
    id: c.id,
    description: c.description,
    additionalWork: c.additionalWork,
    additionalCost: Number(c.additionalCost),
    additionalTimeDays: c.additionalTimeDays,
    photos: c.photos,
    status: c.status,
    declineReason: c.declineReason,
    createdAt: c.createdAt.toISOString(),
  }))
}
