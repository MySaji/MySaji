"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type PendingCertification = {
  id: string
  providerId: string
  providerName: string
  categoryName: string | null
  name: string
  issuer: string
  dateIssued: string
  expiryDate: string | null
  documentUrl: string | null
}

export async function getPendingCertificationCount(): Promise<number> {
  const admin = await requireAdmin()
  if (!admin) return 0
  return db.certification.count({ where: { status: "PENDING" } })
}

export async function getPendingCertifications(): Promise<PendingCertification[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const certs = await db.certification.findMany({
    where: { status: "PENDING" },
    include: { provider: { include: { user: true, category: true } } },
    orderBy: { dateIssued: "desc" },
  })

  return certs.map((c) => ({
    id: c.id,
    providerId: c.providerId,
    providerName: c.provider.user.name,
    categoryName: c.provider.category?.name ?? null,
    name: c.name,
    issuer: c.issuer,
    dateIssued: c.dateIssued.toISOString(),
    expiryDate: c.expiryDate?.toISOString() ?? null,
    documentUrl: c.documentUrl,
  }))
}

const reviewSchema = z.object({
  id: z.string().trim().min(1),
  approve: z.boolean(),
  rejectionReason: z.string().trim().optional(),
})

export type ReviewCertificationResult = { success: true } | { success: false; error: string }

export async function reviewCertification(input: unknown): Promise<ReviewCertificationResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const cert = await db.certification.findUnique({ where: { id: parsed.data.id }, include: { provider: true } })
  if (!cert) return { success: false, error: "Certification not found." }
  if (cert.status !== "PENDING") return { success: false, error: "This certification was already reviewed." }

  await db.certification.update({ where: { id: cert.id }, data: { status: parsed.data.approve ? "APPROVED" : "REJECTED" } })

  await db.notification.create({
    data: {
      userId: cert.provider.userId,
      title: parsed.data.approve ? "Certification approved" : "Certification rejected",
      message: parsed.data.approve
        ? `Your certification "${cert.name}" was approved.`
        : `Your certification "${cert.name}" was rejected.${parsed.data.rejectionReason ? ` ${parsed.data.rejectionReason}` : ""}`,
      type: "SYSTEM",
      actionUrl: "/provider/profile/certifications",
    },
  }).catch(() => {})

  await logAdminAction({
    userId: admin.userId, action: parsed.data.approve ? "APPROVE_CERTIFICATION" : "REJECT_CERTIFICATION",
    entityType: "Certification", entityId: cert.id, newValues: { name: cert.name, approve: parsed.data.approve },
  })

  return { success: true }
}
