"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"

export type JobEventActor = "CUSTOMER" | "PROVIDER" | "SYSTEM" | "ADMIN"

/** Appends one real event to a job's Evidence Timeline. Internal — called
 * from the server action that actually performed the real thing being
 * logged (job created, quote submitted, work completed, payment released,
 * QR handshake, change order, warranty claim, safety incident, ...), never
 * exposed as a directly client-callable mutation, so the timeline can't be
 * forged from the client with an arbitrary description. Failures here never
 * throw — evidence logging is additive, not a hard dependency of whatever
 * real operation it's attached to. */
export async function logJobEvent(input: {
  jobId?: string
  contractId?: string
  type: string
  actor: JobEventActor
  actorUserId?: string | null
  description: string
  metadata?: Record<string, unknown>
  attachments?: string[]
}): Promise<void> {
  if (!input.jobId && !input.contractId) return
  await db.jobEvent.create({
    data: {
      jobId: input.jobId ?? null,
      contractId: input.contractId ?? null,
      type: input.type,
      actor: input.actor,
      actorUserId: input.actorUserId ?? null,
      description: input.description,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      attachments: input.attachments ?? [],
    },
  }).catch(() => {})
}

export type JobTimelineEvent = {
  id: string
  type: string
  actor: JobEventActor
  actorName: string | null
  description: string
  metadata: Record<string, unknown> | null
  attachments: string[]
  createdAt: string
}

/** Customer, the assigned provider, or an admin can read a job's timeline
 * — nobody else. Returns an empty list (not an error) for anyone else, same
 * fail-closed convention as other job-scoped reads in this app. */
export async function getJobTimeline(jobId: string): Promise<JobTimelineEvent[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const job = await db.job.findUnique({ where: { id: jobId }, include: { provider: true } })
  if (!job) return []

  const isCustomer = job.customerId === session.user.id
  const isProvider = job.provider?.userId === session.user.id
  const isAdmin = session.user.role === "admin"
  if (!isCustomer && !isProvider && !isAdmin) return []

  const events = await db.jobEvent.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } })

  const actorUserIds = [...new Set(events.map((e) => e.actorUserId).filter((id): id is string => !!id))]
  const actorUsers = actorUserIds.length > 0
    ? await db.user.findMany({ where: { id: { in: actorUserIds } }, select: { id: true, name: true } })
    : []
  const nameById = new Map(actorUsers.map((u) => [u.id, u.name]))

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    actor: e.actor,
    actorName: e.actorUserId ? nameById.get(e.actorUserId) ?? null : null,
    description: e.description,
    metadata: (e.metadata as Record<string, unknown> | null) ?? null,
    attachments: e.attachments,
    createdAt: e.createdAt.toISOString(),
  }))
}

/** Same as getJobTimeline but for a ServiceContract still in negotiation
 * (before AGREED creates a real Job — see respondToContractQuote, which
 * re-parents these same rows onto the job's timeline the moment one
 * exists, so nothing here is ever a second, disconnected history). */
export async function getContractTimeline(contractId: string): Promise<JobTimelineEvent[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const contract = await db.serviceContract.findUnique({ where: { id: contractId }, include: { provider: true } })
  if (!contract) return []

  const isCustomer = contract.customerId === session.user.id
  const isProvider = contract.provider.userId === session.user.id
  const isAdmin = session.user.role === "admin"
  if (!isCustomer && !isProvider && !isAdmin) return []

  const events = await db.jobEvent.findMany({ where: { contractId }, orderBy: { createdAt: "asc" } })

  const actorUserIds = [...new Set(events.map((e) => e.actorUserId).filter((id): id is string => !!id))]
  const actorUsers = actorUserIds.length > 0
    ? await db.user.findMany({ where: { id: { in: actorUserIds } }, select: { id: true, name: true } })
    : []
  const nameById = new Map(actorUsers.map((u) => [u.id, u.name]))

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    actor: e.actor,
    actorName: e.actorUserId ? nameById.get(e.actorUserId) ?? null : null,
    description: e.description,
    metadata: (e.metadata as Record<string, unknown> | null) ?? null,
    attachments: e.attachments,
    createdAt: e.createdAt.toISOString(),
  }))
}
