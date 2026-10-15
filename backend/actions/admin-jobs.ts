"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin } from "@/backend/actions/admin-dashboard"
import { logAdminAction } from "@/backend/services/admin-audit-core"
import { pushToUser } from "@/backend/services/push-core"

export type AdminJobStatus = "Pending" | "Accepted" | "In Progress" | "Completed" | "Cancelled" | "Disputed" | "Awaiting Payment"

export type AdminJob = {
  id: string
  title: string
  category: string
  client: string
  provider: string | null
  budget: number
  status: AdminJobStatus
  deadline: string
  createdAt: string
}

const STATUS_LABEL: Record<string, AdminJobStatus> = {
  PENDING: "Pending", ACCEPTED: "Accepted", IN_PROGRESS: "In Progress", COMPLETED: "Completed",
  CANCELLED: "Cancelled", DISPUTED: "Disputed", PENDING_PAYMENT: "Awaiting Payment",
}

export async function getAdminJobs(): Promise<AdminJob[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const jobs = await db.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { customer: true, provider: { include: { user: true } }, service: { include: { category: true } } },
  })

  return jobs.map((j) => ({
    id: j.id,
    title: j.title,
    category: j.service?.category?.name ?? "General",
    client: j.customer.name,
    provider: j.provider?.user.name ?? null,
    budget: Number(j.price),
    status: STATUS_LABEL[j.status] ?? "Pending",
    deadline: j.scheduledDate.toISOString(),
    createdAt: j.createdAt.toISOString(),
  }))
}

export type AdminJobActionResult = { success: true } | { success: false; error: string }

const cancelSchema = z.object({ jobId: z.string().trim().min(1) })

export async function cancelJobAsAdmin(input: unknown): Promise<AdminJobActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job) return { success: false, error: "Job not found." }
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return { success: false, error: "This job can no longer be cancelled." }
  }

  await db.$transaction([
    db.job.update({ where: { id: job.id }, data: { status: "CANCELLED" } }),
    db.notification.create({
      data: {
        userId: job.customerId,
        title: "Job cancelled",
        message: `Your job "${job.title}" was cancelled by platform admin.`,
        type: "JOB",
        relatedType: "JOB",
        relatedId: job.id,
      },
    }),
  ])

  await pushToUser(job.customerId, { title: "Job cancelled", body: `Your job "${job.title}" was cancelled by platform admin.`, url: "/customer/jobs" }, "job")

  await logAdminAction({
    userId: admin.userId,
    action: "job.cancel",
    entityType: "Job",
    entityId: job.id,
    oldValues: { status: job.status },
    newValues: { status: "CANCELLED" },
  })

  return { success: true }
}
