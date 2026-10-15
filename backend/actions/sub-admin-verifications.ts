"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireSubAdmin } from "@/backend/actions/sub-admin-dashboard"
import { logAdminAction } from "@/backend/services/admin-audit-core"
import { approveKycDocument, rejectKycDocument } from "@/backend/services/kyc-review-core"

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Customer", PROVIDER: "Provider", SHOPKEEPER: "Shopkeeper", DISTRIBUTOR: "Distributor",
  AGENT: "Agent", SECRETARY: "Secretary", SUB_ADMIN: "Sub-Admin", ADMIN: "Admin",
}

export type SubAdminVerification = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  documentType: string
  documentNumber: string | null
  documents: string
  idFileUrl: string
  idBackFileUrl: string | null
  selfieFileUrl: string | null
  status: "Pending" | "Approved" | "Rejected"
  submittedDate: string
  rejectionReason: string | null
}

export async function getSubAdminVerifications(): Promise<SubAdminVerification[]> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return []

  const docs = await db.kycDocument.findMany({
    orderBy: { submittedAt: "desc" },
    include: { user: true },
  })

  return docs.map((d) => ({
    id: d.id,
    userId: d.userId,
    name: d.user.name,
    email: d.user.email,
    role: ROLE_LABEL[d.user.role] ?? d.user.role,
    documentType: d.documentType.replace(/_/g, " "),
    documentNumber: d.documentNumber,
    documents: `${d.documentType.replace(/_/g, " ")}${d.selfieFileUrl ? " + Selfie" : ""}`,
    idFileUrl: d.idFileUrl,
    idBackFileUrl: d.idBackFileUrl,
    selfieFileUrl: d.selfieFileUrl,
    status: d.status === "APPROVED" ? "Approved" : d.status === "REJECTED" ? "Rejected" : "Pending",
    submittedDate: d.submittedAt.toISOString(),
    rejectionReason: d.rejectionReason,
  }))
}

export type SubAdminVerificationActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ kycDocumentId: z.string().trim().min(1) })

export async function approveSubAdminVerification(input: unknown): Promise<SubAdminVerificationActionResult> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return { success: false, error: "You must be signed in as a sub-admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const doc = await db.kycDocument.findUnique({ where: { id: parsed.data.kycDocumentId } })
  if (!doc) return { success: false, error: "Verification not found." }

  const result = await approveKycDocument(parsed.data.kycDocumentId, subAdmin.userId)
  if (!result.success) return result

  await logAdminAction({
    userId: subAdmin.userId,
    action: "verification.approve",
    entityType: "KycDocument",
    entityId: doc.id,
    oldValues: { status: doc.status },
    newValues: { status: "APPROVED" },
  })

  return { success: true }
}

const rejectSchema = z.object({
  kycDocumentId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "Please provide a rejection reason"),
})

export async function rejectSubAdminVerification(input: unknown): Promise<SubAdminVerificationActionResult> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return { success: false, error: "You must be signed in as a sub-admin." }

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const doc = await db.kycDocument.findUnique({ where: { id: parsed.data.kycDocumentId } })
  if (!doc) return { success: false, error: "Verification not found." }

  const result = await rejectKycDocument(parsed.data.kycDocumentId, subAdmin.userId, parsed.data.reason)
  if (!result.success) return result

  await logAdminAction({
    userId: subAdmin.userId,
    action: "verification.reject",
    entityType: "KycDocument",
    entityId: doc.id,
    oldValues: { status: doc.status },
    newValues: { status: "REJECTED", rejectionReason: parsed.data.reason },
  })

  return { success: true }
}
