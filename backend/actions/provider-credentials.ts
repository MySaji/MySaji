"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type ProviderCredentialsActionResult = { success: true } | { success: false; error: string }

// ============================= SKILLS & WORK AREAS =============================

export type ProviderSkillsData = { skills: string[]; workAreas: string[] } | null

export async function getMySkills(): Promise<ProviderSkillsData> {
  const provider = await requireProvider()
  if (!provider) return null
  const profile = await db.providerProfile.findUnique({ where: { id: provider.providerId } })
  if (!profile) return null
  return { skills: profile.skills, workAreas: profile.workAreas }
}

const skillsSchema = z.object({ skills: z.array(z.string().trim().min(1)).max(30), workAreas: z.array(z.string().trim().min(1)).max(30) })

export async function updateMySkills(input: unknown): Promise<ProviderCredentialsActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = skillsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.providerProfile.update({ where: { id: provider.providerId }, data: { skills: parsed.data.skills, workAreas: parsed.data.workAreas } })
  return { success: true }
}

// ============================= CERTIFICATIONS =============================

export type ProviderCertification = {
  id: string
  name: string
  issuer: string
  dateIssued: string
  expiryDate: string | null
  status: "approved" | "pending" | "rejected" | "expired"
  documentUrl: string | null
}

export async function getMyCertifications(): Promise<ProviderCertification[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const certs = await db.certification.findMany({ where: { providerId: provider.providerId }, orderBy: { dateIssued: "desc" } })
  const now = new Date()
  return certs.map((c) => ({
    id: c.id,
    name: c.name,
    issuer: c.issuer,
    dateIssued: c.dateIssued.toISOString(),
    expiryDate: c.expiryDate?.toISOString() ?? null,
    status: c.status === "APPROVED" && c.expiryDate && c.expiryDate < now ? "expired" : (c.status.toLowerCase() as "approved" | "pending" | "rejected"),
    documentUrl: c.documentUrl,
  }))
}

const addCertSchema = z.object({
  name: z.string().trim().min(1, "Certification name is required"),
  issuer: z.string().trim().min(1, "Issuing body is required"),
  dateIssued: z.string().min(1, "Date issued is required"),
  expiryDate: z.string().optional(),
  documentUrl: z.string().optional(),
})

export async function addMyCertification(input: unknown): Promise<ProviderCredentialsActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = addCertSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const dateIssued = new Date(parsed.data.dateIssued)
  if (Number.isNaN(dateIssued.getTime())) return { success: false, error: "Invalid date issued." }
  const expiryDate = parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null

  await db.certification.create({
    data: {
      providerId: provider.providerId,
      name: parsed.data.name,
      issuer: parsed.data.issuer,
      dateIssued,
      expiryDate,
      documentUrl: parsed.data.documentUrl || null,
    },
  })
  return { success: true }
}

const certIdSchema = z.object({ id: z.string().trim().min(1) })

export async function removeMyCertification(input: unknown): Promise<ProviderCredentialsActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = certIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.certification.deleteMany({ where: { id: parsed.data.id, providerId: provider.providerId } })
  return { success: true }
}

// ============================= RATINGS =============================

export type ProviderReviewItem = {
  id: string
  jobId: string | null
  customerName: string
  customerAvatar: string | null
  rating: number
  comment: string
  professionalism: number | null
  communication: number | null
  punctuality: number | null
  qualityOfWork: number | null
  response: string | null
  createdAt: string
  disputeStatus: { disputeNumber: string; status: string; resolution: string | null } | null
}

const REVIEW_DISPUTE_REASON = "Review dispute"

export async function getMyReviews(): Promise<ProviderReviewItem[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const reviews = await db.review.findMany({
    where: { providerId: provider.providerId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  })

  const jobIds = reviews.map((r) => r.jobId).filter((id): id is string => Boolean(id))
  const disputes = jobIds.length > 0
    ? await db.dispute.findMany({ where: { jobId: { in: jobIds }, reason: REVIEW_DISPUTE_REASON } })
    : []
  const disputeByJobId = new Map(disputes.map((d) => [d.jobId, d]))

  return reviews.map((r) => {
    const dispute = r.jobId ? disputeByJobId.get(r.jobId) : undefined
    return {
      id: r.id,
      jobId: r.jobId,
      customerName: r.customer.name,
      customerAvatar: r.customer.image,
      rating: r.rating,
      comment: r.comment,
      professionalism: r.professionalism,
      communication: r.communication,
      punctuality: r.punctuality,
      qualityOfWork: r.qualityOfWork,
      response: r.response,
      createdAt: r.createdAt.toISOString(),
      disputeStatus: dispute ? { disputeNumber: dispute.disputeNumber, status: dispute.status, resolution: dispute.resolution } : null,
    }
  })
}

const replySchema = z.object({ reviewId: z.string().trim().min(1), response: z.string().trim().min(1, "Write a reply") })

export async function replyToReview(input: unknown): Promise<ProviderCredentialsActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = replySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const review = await db.review.findUnique({ where: { id: parsed.data.reviewId } })
  if (!review || review.providerId !== provider.providerId) return { success: false, error: "Review not found." }

  await db.review.update({ where: { id: review.id }, data: { response: parsed.data.response, respondedAt: new Date() } })
  return { success: true }
}

const disputeReviewSchema = z.object({
  reviewId: z.string().trim().min(1),
  explanation: z.string().trim().min(10, "Please explain why this review should be reviewed").max(1000),
})

/** A formal appeal, not just the public reply above — creates a real
 * Dispute (reusing the same model/queues admin and agents already work
 * from for order returns and job disputes), scoped to the job the review
 * came from, so a human actually reviews it rather than the provider's
 * objection just sitting unread. */
export async function disputeReview(input: unknown): Promise<ProviderCredentialsActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = disputeReviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const review = await db.review.findUnique({ where: { id: parsed.data.reviewId } })
  if (!review || review.providerId !== provider.providerId) return { success: false, error: "Review not found." }
  if (!review.jobId) return { success: false, error: "This review isn't linked to a job and can't be disputed." }

  const existing = await db.dispute.findFirst({ where: { jobId: review.jobId, reason: REVIEW_DISPUTE_REASON } })
  if (existing) return { success: false, error: "You already have an open dispute for this review." }

  const disputeNumber = `DISP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  await db.dispute.create({
    data: {
      disputeNumber,
      jobId: review.jobId,
      customerId: review.customerId,
      providerId: provider.providerId,
      reason: REVIEW_DISPUTE_REASON,
      description: parsed.data.explanation,
      status: "OPEN",
      severity: "LOW",
    },
  })

  return { success: true }
}

// ============================= PROOF OF WORK (PortfolioItem) =============================

export type ProviderPortfolioItem = {
  id: string
  title: string
  description: string | null
  imageUrl: string
  videoUrl: string | null
  createdAt: string
  featured: boolean
}

export async function getMyPortfolio(): Promise<ProviderPortfolioItem[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const items = await db.portfolioItem.findMany({ where: { providerId: provider.providerId }, orderBy: { createdAt: "desc" } })
  return items.map((i) => ({ id: i.id, title: i.title, description: i.description, imageUrl: i.imageUrl, videoUrl: i.videoUrl, createdAt: i.createdAt.toISOString(), featured: i.featured }))
}

const addPortfolioSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  imageUrl: z.string().min(1, "An image is required"),
  videoUrl: z.string().trim().optional(),
})

export async function addMyPortfolioItem(input: unknown): Promise<ProviderCredentialsActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = addPortfolioSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.portfolioItem.create({
    data: {
      providerId: provider.providerId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      imageUrl: parsed.data.imageUrl,
      videoUrl: parsed.data.videoUrl || null,
    },
  })
  return { success: true }
}

const updatePortfolioSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
})

export async function updateMyPortfolioItem(input: unknown): Promise<ProviderCredentialsActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = updatePortfolioSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.portfolioItem.updateMany({
    where: { id: parsed.data.id, providerId: provider.providerId },
    data: { title: parsed.data.title, description: parsed.data.description || null },
  })
  return { success: true }
}

const portfolioIdSchema = z.object({ id: z.string().trim().min(1) })

export async function removeMyPortfolioItem(input: unknown): Promise<ProviderCredentialsActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = portfolioIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.portfolioItem.deleteMany({ where: { id: parsed.data.id, providerId: provider.providerId } })
  return { success: true }
}
