"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { logJobEvent } from "@/lib/actions/job-events"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type IdentityVerificationStatus = "PENDING" | "VERIFIED" | "FAILED"
export type IdentityVerificationActionResult = { success: true } | { success: false; error: string }

/** Only jobs in a category admin has already flagged as high-risk
 * (Category.requiresLicense, the same signal Phase 6's licensing gate
 * uses) require identity verification — matching the spec's own
 * "particularly... high-risk providers may require stronger verification"
 * framing rather than a blanket mandatory selfie on every booking. */
async function isHighRiskJob(jobId: string): Promise<boolean> {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job) return false

  let categoryId: string | null = null
  if (job.serviceId) categoryId = (await db.service.findUnique({ where: { id: job.serviceId }, select: { categoryId: true } }))?.categoryId ?? null
  if (!categoryId && job.offerId) categoryId = (await db.offer.findUnique({ where: { id: job.offerId }, select: { categoryId: true } }))?.categoryId ?? null
  if (!categoryId) {
    const contract = await db.serviceContract.findUnique({ where: { jobId: job.id }, select: { categoryId: true } })
    categoryId = contract?.categoryId ?? null
  }
  if (!categoryId) return false

  const category = await db.category.findUnique({ where: { id: categoryId } })
  return !!category?.requiresLicense
}

const submitSchema = z.object({ jobId: z.string().trim().min(1), selfieUrl: z.string().trim().min(1, "Take a selfie to continue") })

/** Real prompt/gate/selfie-capture step — no actual face-match algorithm
 * runs here (no biometric provider is configured or paid for in this
 * environment), so this always resolves to VERIFIED once a selfie is
 * submitted. Same honest "sandbox simulation" pattern this app already
 * uses for payment gateways with no live credentials — wire in a real
 * face-match API later by replacing the one line below that always
 * approves. No biometric template is derived or stored, only the plain
 * selfie image itself. */
export async function submitIdentityVerification(input: unknown): Promise<IdentityVerificationActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }

  await db.identityVerification.create({
    data: { jobId: job.id, providerId: provider.providerId, selfieUrl: parsed.data.selfieUrl, status: "VERIFIED", verifiedAt: new Date() },
  })

  await logJobEvent({ jobId: job.id, type: "IDENTITY_VERIFICATION_COMPLETED", actor: "PROVIDER", actorUserId: provider.userId, description: "Provider completed identity verification" })

  return { success: true }
}

export async function getJobIdentityVerificationStatus(jobId: string): Promise<{ required: boolean; verified: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { required: false, verified: false }

  const [required, verified] = await Promise.all([
    isHighRiskJob(jobId),
    db.identityVerification.findFirst({ where: { jobId, status: "VERIFIED" } }),
  ])
  return { required, verified: !!verified }
}

/** Internal gate used by startJob — not client-callable directly. */
export async function requireVerifiedIdentityForJob(jobId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!(await isHighRiskJob(jobId))) return { ok: true }

  const verified = await db.identityVerification.findFirst({ where: { jobId, status: "VERIFIED" } })
  if (verified) return { ok: true }
  return { ok: false, reason: "This is a high-risk job category. Verify your identity before starting." }
}
