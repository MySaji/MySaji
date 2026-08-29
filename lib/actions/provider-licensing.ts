"use server"

import { db } from "@/lib/db"

export type LicenseCheckResult = { blocked: false } | { blocked: true; reason: string }

/** Resolves which Category a Job belongs to (service, offer, or the
 * negotiated ServiceContract, in that priority order — falling back to the
 * provider's own primary category for jobs with none of those, e.g.
 * emergency bookings), then checks whether that category requires a
 * license the provider doesn't currently have — APPROVED, unexpired, and
 * name-matching Category.licenseName. Matching is a case-insensitive
 * substring check against the provider's real Certification rows, not a
 * blanket "has any certification" pass — there's no formal license-type
 * taxonomy in this schema to link against more strictly than that. */
export async function checkProviderLicenseForJob(jobId: string, providerId: string): Promise<LicenseCheckResult> {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job) return { blocked: false }

  let categoryId: string | null = null
  if (job.serviceId) {
    categoryId = (await db.service.findUnique({ where: { id: job.serviceId }, select: { categoryId: true } }))?.categoryId ?? null
  }
  if (!categoryId && job.offerId) {
    categoryId = (await db.offer.findUnique({ where: { id: job.offerId }, select: { categoryId: true } }))?.categoryId ?? null
  }
  if (!categoryId) {
    const contract = await db.serviceContract.findUnique({ where: { jobId: job.id }, select: { categoryId: true } })
    categoryId = contract?.categoryId ?? null
  }
  if (!categoryId) {
    const provider = await db.providerProfile.findUnique({ where: { id: providerId }, select: { categoryId: true } })
    categoryId = provider?.categoryId ?? null
  }
  if (!categoryId) return { blocked: false }

  const category = await db.category.findUnique({ where: { id: categoryId } })
  if (!category?.requiresLicense) return { blocked: false }

  const now = new Date()
  const validCert = await db.certification.findFirst({
    where: {
      providerId,
      status: "APPROVED",
      OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
      ...(category.licenseName ? { name: { contains: category.licenseName, mode: "insensitive" as const } } : {}),
    },
  })
  if (validCert) return { blocked: false }

  return {
    blocked: true,
    reason: `This job requires a verified ${category.licenseName ?? "license"} before you can accept it. Submit it from Profile > Certifications and wait for admin approval.`,
  }
}
