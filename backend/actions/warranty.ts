"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { logJobEvent } from "@/backend/actions/job-events"
import { notifyUser } from "@/backend/actions/notify"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type WarrantyStatus = "ACTIVE" | "EXPIRED" | "VOID"
export type WarrantyClaimStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED"
export type WarrantyActionResult = { success: true } | { success: false; error: string }

// ============================= PROVIDER: ADD WARRANTY =============================

const addWarrantySchema = z.object({
  jobId: z.string().trim().min(1),
  durationDays: z.coerce.number().int().positive("Enter a warranty length in days"),
  terms: z.string().trim().optional(),
})

export async function addWarrantyToJob(input: unknown): Promise<WarrantyActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = addWarrantySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }
  if (job.status !== "COMPLETED") return { success: false, error: "Only a completed job can have a warranty added." }

  const existing = await db.warranty.findUnique({ where: { jobId: job.id } })
  if (existing) return { success: false, error: "This job already has a warranty." }

  const startDate = job.completedAt ?? new Date()
  const expiresAt = new Date(startDate.getTime() + parsed.data.durationDays * 86400000)

  await db.warranty.create({
    data: { jobId: job.id, providerId: provider.providerId, durationDays: parsed.data.durationDays, startDate, expiresAt, terms: parsed.data.terms || null },
  })

  await logJobEvent({
    jobId: job.id, type: "WARRANTY_ADDED", actor: "PROVIDER", actorUserId: provider.userId,
    description: `Provider added a ${parsed.data.durationDays}-day warranty`, metadata: { durationDays: parsed.data.durationDays, expiresAt: expiresAt.toISOString() },
  })

  return { success: true }
}

// ============================= READ =============================

export type WarrantyDetail = {
  id: string
  durationDays: number
  startDate: string
  expiresAt: string
  terms: string | null
  status: WarrantyStatus
  claims: { id: string; description: string; status: WarrantyClaimStatus; createdAt: string; photos: string[]; resolutionNote: string | null }[]
} | null

/** Lazily reconciled — same convention as ProviderSubscription/StaffInvite:
 * ACTIVE flips to EXPIRED the first time anyone reads a lapsed warranty. */
export async function getJobWarranty(jobId: string): Promise<WarrantyDetail> {
  const session = await auth()
  if (!session?.user?.id) return null

  const job = await db.job.findUnique({ where: { id: jobId }, include: { provider: true } })
  if (!job) return null
  const isCustomer = job.customerId === session.user.id
  const isProvider = job.provider?.userId === session.user.id
  if (!isCustomer && !isProvider && session.user.role !== "admin") return null

  let warranty = await db.warranty.findUnique({ where: { jobId }, include: { claims: { orderBy: { createdAt: "desc" } } } })
  if (!warranty) return null

  if (warranty.status === "ACTIVE" && warranty.expiresAt < new Date()) {
    await db.warranty.update({ where: { id: warranty.id }, data: { status: "EXPIRED" } })
    warranty = { ...warranty, status: "EXPIRED" }
  }

  return {
    id: warranty.id,
    durationDays: warranty.durationDays,
    startDate: warranty.startDate.toISOString(),
    expiresAt: warranty.expiresAt.toISOString(),
    terms: warranty.terms,
    status: warranty.status,
    claims: warranty.claims.map((c) => ({ id: c.id, description: c.description, status: c.status, createdAt: c.createdAt.toISOString(), photos: c.photos, resolutionNote: c.resolutionNote })),
  }
}

// ============================= CUSTOMER: REPORT ISSUE =============================

const reportIssueSchema = z.object({
  jobId: z.string().trim().min(1),
  description: z.string().trim().min(1, "Describe the issue"),
  photos: z.array(z.string()).optional(),
})

export async function reportWarrantyIssue(input: unknown): Promise<WarrantyActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") return { success: false, error: "You must be signed in as a customer." }

  const parsed = reportIssueSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId }, include: { provider: true } })
  if (!job || job.customerId !== session.user.id) return { success: false, error: "Job not found." }

  const warranty = await db.warranty.findUnique({ where: { jobId: job.id } })
  if (!warranty) return { success: false, error: "This job has no warranty." }
  if (warranty.status !== "ACTIVE" || warranty.expiresAt < new Date()) {
    if (warranty.status === "ACTIVE") await db.warranty.update({ where: { id: warranty.id }, data: { status: "EXPIRED" } })
    return { success: false, error: "This warranty has expired." }
  }

  await db.warrantyClaim.create({
    data: { warrantyId: warranty.id, description: parsed.data.description, photos: parsed.data.photos ?? [] },
  })

  await logJobEvent({
    jobId: job.id, type: "WARRANTY_CLAIM_CREATED", actor: "CUSTOMER", actorUserId: session.user.id,
    description: `Customer reported a warranty issue: ${parsed.data.description}`, attachments: parsed.data.photos,
  })

  if (job.provider) {
    await notifyUser({
      userId: job.provider.userId, title: "Warranty issue reported", message: `A warranty issue was reported for "${job.title}".`, type: "JOB", relatedType: "JOB", relatedId: job.id, actionUrl: "/provider/jobs",
    })
  }

  return { success: true }
}

// ============================= PROVIDER: RESOLVE CLAIM =============================

const resolveClaimSchema = z.object({
  claimId: z.string().trim().min(1),
  status: z.enum(["IN_REVIEW", "RESOLVED", "REJECTED"]),
  resolutionNote: z.string().trim().optional(),
})

export async function resolveWarrantyClaim(input: unknown): Promise<WarrantyActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = resolveClaimSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const claim = await db.warrantyClaim.findUnique({ where: { id: parsed.data.claimId }, include: { warranty: { include: { job: true } } } })
  if (!claim || claim.warranty.providerId !== provider.providerId) return { success: false, error: "Claim not found." }

  await db.warrantyClaim.update({
    where: { id: claim.id },
    data: { status: parsed.data.status, resolutionNote: parsed.data.resolutionNote || null, resolvedAt: parsed.data.status === "RESOLVED" || parsed.data.status === "REJECTED" ? new Date() : null },
  })

  await logJobEvent({
    jobId: claim.warranty.jobId, type: "WARRANTY_CLAIM_UPDATED", actor: "PROVIDER", actorUserId: provider.userId,
    description: `Provider marked the warranty claim as ${parsed.data.status.toLowerCase().replace("_", " ")}`,
  })

  return { success: true }
}

// ============================= CUSTOMER: BOOK FOLLOW-UP =============================

export type BookFollowUpResult = { success: true; jobId: string } | { success: false; error: string }

/** A real, free follow-up visit under an active warranty — skips payment
 * entirely (price is genuinely 0, not a discount applied after the fact)
 * and goes straight to PENDING for the provider to accept, same as any
 * other job from that point on. */
export async function bookWarrantyFollowUp(jobId: string): Promise<BookFollowUpResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") return { success: false, error: "You must be signed in as a customer." }

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.customerId !== session.user.id) return { success: false, error: "Job not found." }
  if (!job.providerId) return { success: false, error: "This job has no assigned provider." }

  const warranty = await db.warranty.findUnique({ where: { jobId: job.id } })
  if (!warranty) return { success: false, error: "This job has no warranty." }
  if (warranty.status !== "ACTIVE" || warranty.expiresAt < new Date()) {
    return { success: false, error: "This warranty has expired." }
  }

  const followUp = await db.job.create({
    data: {
      customerId: session.user.id,
      providerId: job.providerId,
      title: `Warranty follow-up: ${job.title}`,
      description: `Free follow-up visit under warranty for the original job "${job.title}".`,
      price: 0,
      location: job.location,
      scheduledDate: new Date(),
      status: "PENDING",
      warrantyFollowUpForId: warranty.id,
    },
  })

  await logJobEvent({ jobId: job.id, type: "WARRANTY_FOLLOWUP_BOOKED", actor: "CUSTOMER", actorUserId: session.user.id, description: "Customer booked a warranty follow-up visit" })
  await logJobEvent({ jobId: followUp.id, type: "JOB_CREATED", actor: "CUSTOMER", actorUserId: session.user.id, description: `Warranty follow-up booked for "${job.title}"` })

  const provider = await db.providerProfile.findUnique({ where: { id: job.providerId } })
  if (provider) {
    await notifyUser({
      userId: provider.userId, title: "Warranty follow-up booked", message: `A free follow-up visit was booked for "${job.title}".`, type: "JOB", relatedType: "JOB", relatedId: followUp.id, actionUrl: "/provider/jobs",
    })
  }

  return { success: true, jobId: followUp.id }
}
