import "server-only"

import { db } from "@/backend/db"

import type { Prisma } from "@prisma/client"

export type JobEventActor = "CUSTOMER" | "PROVIDER" | "SYSTEM" | "ADMIN"

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
