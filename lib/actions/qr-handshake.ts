"use server"

import crypto from "crypto"
import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { logJobEvent } from "@/lib/actions/job-events"

const HANDSHAKE_TTL_MS = 3 * 60 * 1000

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type GenerateHandshakeResult = { success: true; token: string; expiresAt: string } | { success: false; error: string }

/** Customer-side: mints a fresh, opaque, single-use token good for a few
 * minutes — the QR/code payload is just this random string, never a job,
 * customer, or provider id, so nothing sensitive leaks if it's seen or
 * intercepted. Any previous unconsumed token for this job is invalidated
 * first, so only one code is ever "live" at a time. */
export async function generateJobQrHandshake(jobId: string): Promise<GenerateHandshakeResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") return { success: false, error: "You must be signed in as a customer." }

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.customerId !== session.user.id) return { success: false, error: "Job not found." }
  if (!job.providerId) return { success: false, error: "This job has no assigned provider yet." }
  if (job.status !== "ACCEPTED" && job.status !== "IN_PROGRESS") {
    return { success: false, error: "Identity verification is only available for an active job." }
  }

  await db.qrHandshake.deleteMany({ where: { jobId, consumedAt: null } })

  const token = crypto.randomBytes(16).toString("hex")
  const expiresAt = new Date(Date.now() + HANDSHAKE_TTL_MS)

  await db.qrHandshake.create({
    data: { jobId, token, customerId: session.user.id, providerId: job.providerId, expiresAt },
  })

  return { success: true, token, expiresAt: expiresAt.toISOString() }
}

const verifySchema = z.object({ jobId: z.string().trim().min(1), token: z.string().trim().min(1) })

export type VerifyHandshakeResult = { success: true } | { success: false; error: string }

/** Provider-side: validates the code the customer is showing them right
 * now against exactly the job the provider believes they're on — not just
 * "is this token valid anywhere," but "is it valid for THIS job and THIS
 * provider." Single-use: consuming it here means it can never be replayed. */
export async function verifyJobQrHandshake(input: unknown): Promise<VerifyHandshakeResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = verifySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const handshake = await db.qrHandshake.findUnique({ where: { token: parsed.data.token } })
  if (!handshake || handshake.jobId !== parsed.data.jobId) return { success: false, error: "Code doesn't match this job." }
  if (handshake.providerId !== provider.providerId) return { success: false, error: "This code wasn't issued for you." }
  if (handshake.consumedAt) return { success: false, error: "This code has already been used." }
  if (handshake.expiresAt < new Date()) return { success: false, error: "This code has expired. Ask the customer to generate a new one." }

  await db.qrHandshake.update({ where: { id: handshake.id }, data: { consumedAt: new Date(), consumedByUserId: provider.userId } })

  await logJobEvent({
    jobId: handshake.jobId, type: "IDENTITY_HANDSHAKE_COMPLETED", actor: "PROVIDER", actorUserId: provider.userId,
    description: "Customer/provider identity handshake completed",
  })

  return { success: true }
}

/** Whether this job already has a completed handshake — drives whether the
 * UI shows "Verify Identity" or a done state. Real read of the same rows
 * verifyJobQrHandshake writes, not a separate tracked flag. */
export async function getJobHandshakeStatus(jobId: string): Promise<{ verified: boolean; verifiedAt: string | null }> {
  const session = await auth()
  if (!session?.user?.id) return { verified: false, verifiedAt: null }

  const job = await db.job.findUnique({ where: { id: jobId }, include: { provider: true } })
  if (!job) return { verified: false, verifiedAt: null }
  const isCustomer = job.customerId === session.user.id
  const isProvider = job.provider?.userId === session.user.id
  if (!isCustomer && !isProvider) return { verified: false, verifiedAt: null }

  const completed = await db.qrHandshake.findFirst({ where: { jobId, consumedAt: { not: null } }, orderBy: { consumedAt: "desc" } })
  return { verified: !!completed, verifiedAt: completed?.consumedAt?.toISOString() ?? null }
}
