"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { notifyUser } from "@/backend/actions/notify"

const createSchema = z.object({
  title: z.string().trim().min(1, "Give this schedule a name"),
  frequencyDays: z.coerce.number().int().positive("Enter how often, in days"),
  jobId: z.string().trim().optional(),
})

export type RecurringMaintenanceActionResult = { success: true } | { success: false; error: string }

/** Set up from a completed job — reuses that job's real provider/service/
 * offer so "Book Again" later has somewhere real to point. */
export async function createRecurringMaintenance(input: unknown): Promise<RecurringMaintenanceActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") return { success: false, error: "You must be signed in as a customer." }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  let providerId: string | null = null
  let serviceId: string | null = null
  let offerId: string | null = null
  let lastCompletedAt: Date | null = null

  if (parsed.data.jobId) {
    const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
    if (!job || job.customerId !== session.user.id) return { success: false, error: "Job not found." }
    providerId = job.providerId
    serviceId = job.serviceId
    offerId = job.offerId
    lastCompletedAt = job.completedAt
  }

  const base = lastCompletedAt ?? new Date()
  const nextDueAt = new Date(base.getTime() + parsed.data.frequencyDays * 86400000)

  await db.recurringMaintenance.create({
    data: {
      customerId: session.user.id, providerId, serviceId, offerId, title: parsed.data.title,
      frequencyDays: parsed.data.frequencyDays, lastCompletedAt, nextDueAt,
    },
  })

  return { success: true }
}

export type RecurringMaintenanceItem = {
  id: string
  title: string
  providerId: string | null
  providerName: string | null
  serviceId: string | null
  offerId: string | null
  frequencyDays: number
  lastCompletedAt: string | null
  nextDueAt: string
  isDue: boolean
  isActive: boolean
}

/** Real due-date check at read time (lazy reconciliation, same convention
 * as ProviderSubscription/StaffInvite) — the first time a schedule is read
 * past its nextDueAt, this fires one real "may be due" notification
 * (guarded by reminderSentAt so it doesn't re-notify on every page visit). */
export async function getMyRecurringMaintenance(): Promise<RecurringMaintenanceItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const schedules = await db.recurringMaintenance.findMany({
    where: { customerId: session.user.id, isActive: true },
    orderBy: { nextDueAt: "asc" },
  })

  const now = new Date()
  const providerIds = [...new Set(schedules.map((s) => s.providerId).filter((id): id is string => !!id))]
  const providers = providerIds.length > 0
    ? await db.providerProfile.findMany({ where: { id: { in: providerIds } }, include: { user: true } })
    : []
  const providerNameById = new Map(providers.map((p) => [p.id, p.user.name]))

  const dueNow = schedules.filter((s) => s.nextDueAt <= now && !s.reminderSentAt)
  if (dueNow.length > 0) {
    await Promise.all(dueNow.map((s) =>
      notifyUser({ userId: session.user!.id, title: "Maintenance may be due", message: `${s.title} may be due for service.`, type: "SYSTEM", actionUrl: "/customer/recurring-maintenance" })
    ))
    await db.recurringMaintenance.updateMany({ where: { id: { in: dueNow.map((s) => s.id) } }, data: { reminderSentAt: now } })
  }

  return schedules.map((s) => ({
    id: s.id,
    title: s.title,
    providerId: s.providerId,
    providerName: s.providerId ? providerNameById.get(s.providerId) ?? null : null,
    serviceId: s.serviceId,
    offerId: s.offerId,
    frequencyDays: s.frequencyDays,
    lastCompletedAt: s.lastCompletedAt?.toISOString() ?? null,
    nextDueAt: s.nextDueAt.toISOString(),
    isDue: s.nextDueAt <= now,
    isActive: s.isActive,
  }))
}

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function markMaintenanceServiced(input: unknown): Promise<RecurringMaintenanceActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const schedule = await db.recurringMaintenance.findUnique({ where: { id: parsed.data.id } })
  if (!schedule || schedule.customerId !== session.user.id) return { success: false, error: "Schedule not found." }

  const now = new Date()
  await db.recurringMaintenance.update({
    where: { id: schedule.id },
    data: { lastCompletedAt: now, nextDueAt: new Date(now.getTime() + schedule.frequencyDays * 86400000), reminderSentAt: null },
  })

  return { success: true }
}

export async function deactivateRecurringMaintenance(input: unknown): Promise<RecurringMaintenanceActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const result = await db.recurringMaintenance.updateMany({ where: { id: parsed.data.id, customerId: session.user.id }, data: { isActive: false } })
  if (result.count === 0) return { success: false, error: "Schedule not found." }
  return { success: true }
}
