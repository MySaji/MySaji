"use server"

import { auth } from "@/backend/auth"

import { db } from "@/backend/db"

export type JobEventActor = "CUSTOMER" | "PROVIDER" | "SYSTEM" | "ADMIN"

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
