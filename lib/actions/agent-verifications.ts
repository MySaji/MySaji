"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAgent } from "@/lib/actions/agent-dashboard"
import { logAdminAction } from "@/lib/actions/admin-dashboard"
import { approveKycDocument, rejectKycDocument } from "@/lib/kyc-review-core"

export type AgentVerification = {
  id: string
  userId: string
  role: "SHOPKEEPER" | "PROVIDER"
  displayName: string
  ownerName: string
  email: string
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

// Scoped to shopkeeper and provider KYC documents only — agents review the
// two field-facing registration types they actually onboard, not the
// broader identity-verification queue (customers, distributors, staff)
// that Admin/Sub-Admin handle for every role.
export async function getAgentVerifications(): Promise<AgentVerification[]> {
  const agent = await requireAgent()
  if (!agent) return []

  const docs = await db.kycDocument.findMany({
    where: { user: { role: { in: ["SHOPKEEPER", "PROVIDER"] } } },
    orderBy: { submittedAt: "desc" },
    include: {
      user: {
        include: {
          shopkeeperProfile: true,
          providerProfile: { include: { category: true } },
        },
      },
    },
  })

  return docs.map((d) => {
    const role = d.user.role as "SHOPKEEPER" | "PROVIDER"
    const displayName =
      role === "SHOPKEEPER"
        ? (d.user.shopkeeperProfile?.shopName ?? "Unnamed Shop")
        : (d.user.providerProfile?.businessName || d.user.providerProfile?.category?.name || "Provider")

    return {
      id: d.id,
      userId: d.userId,
      role,
      displayName,
      ownerName: d.user.name,
      email: d.user.email,
      documentType: d.documentType.replace(/_/g, " "),
      documentNumber: d.documentNumber,
      documents: `${d.documentType.replace(/_/g, " ")}${d.idBackFileUrl ? " (front + back)" : ""}${d.selfieFileUrl ? " + Selfie" : ""}`,
      idFileUrl: d.idFileUrl,
      idBackFileUrl: d.idBackFileUrl,
      selfieFileUrl: d.selfieFileUrl,
      status: d.status === "APPROVED" ? "Approved" : d.status === "REJECTED" ? "Rejected" : "Pending",
      submittedDate: d.submittedAt.toISOString(),
      rejectionReason: d.rejectionReason,
    }
  })
}

export type AgentVerificationActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ kycDocumentId: z.string().trim().min(1) })

export async function approveAgentVerification(input: unknown): Promise<AgentVerificationActionResult> {
  const agent = await requireAgent()
  if (!agent) return { success: false, error: "You must be signed in as an agent." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const doc = await db.kycDocument.findUnique({ where: { id: parsed.data.kycDocumentId }, include: { user: true } })
  if (!doc) return { success: false, error: "Verification not found." }
  if (doc.user.role !== "SHOPKEEPER" && doc.user.role !== "PROVIDER") {
    return { success: false, error: "Agents can only review shop and provider verifications." }
  }

  const result = await approveKycDocument(parsed.data.kycDocumentId, agent.userId)
  if (!result.success) return result

  await logAdminAction({
    userId: agent.userId,
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

export async function rejectAgentVerification(input: unknown): Promise<AgentVerificationActionResult> {
  const agent = await requireAgent()
  if (!agent) return { success: false, error: "You must be signed in as an agent." }

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const doc = await db.kycDocument.findUnique({ where: { id: parsed.data.kycDocumentId }, include: { user: true } })
  if (!doc) return { success: false, error: "Verification not found." }
  if (doc.user.role !== "SHOPKEEPER" && doc.user.role !== "PROVIDER") {
    return { success: false, error: "Agents can only review shop and provider verifications." }
  }

  const result = await rejectKycDocument(parsed.data.kycDocumentId, agent.userId, parsed.data.reason)
  if (!result.success) return result

  await logAdminAction({
    userId: agent.userId,
    action: "verification.reject",
    entityType: "KycDocument",
    entityId: doc.id,
    oldValues: { status: doc.status },
    newValues: { status: "REJECTED", rejectionReason: parsed.data.reason },
  })

  return { success: true }
}
