"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { markVerificationPending } from "@/lib/verification-gate"
import { checkKycDuplicate, buildKycDedupeFields, KYC_DUPLICATE_ERROR } from "@/lib/kyc-duplicate-check"

const submitKycSchema = z.object({
  fileName: z.string().trim().min(1),
  fileDataUrl: z.string().min(1),
})

export type SubmitKycDocumentResult = { success: true } | { success: false; error: string }

/**
 * Minimal single-file KYC upload (used by the agent portal's "pending
 * verification" screen, which only collects one document — no ID number
 * or selfie). Fuller flows (provider verification, shopkeeper onboarding)
 * have their own dedicated actions that populate more of KycDocument.
 */
export async function submitKycDocument(input: unknown): Promise<SubmitKycDocumentResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "You must be signed in to upload a document." }
  }

  const parsed = submitKycSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const dup = await checkKycDuplicate({ excludeUserId: session.user.id, idFileUrl: parsed.data.fileDataUrl })
  if (dup.isDuplicate) {
    return { success: false, error: KYC_DUPLICATE_ERROR }
  }

  try {
    // Interactive form (not the array/batch form) so `timeout` can be
    // set — a base64 ID photo can take longer to write than Prisma's 5s
    // transaction default over this environment's slow DB connection,
    // see the confirmed failure in completeShopkeeperOnboarding.
    await db.$transaction(async (tx) => {
      await tx.kycDocument.create({
        data: {
          userId: session.user.id,
          documentType: "NATIONAL_ID",
          idFileUrl: parsed.data.fileDataUrl,
          ...buildKycDedupeFields({ idFileUrl: parsed.data.fileDataUrl }),
        },
      })
      await tx.user.update({ where: { id: session.user.id }, data: { kycStatus: "PENDING" } })
      await markVerificationPending(tx, session.user.id)
    }, { timeout: 60000, maxWait: 10000 })
    return { success: true }
  } catch {
    return { success: false, error: "Couldn't reach the server. Please check your connection and try again." }
  }
}

const submitBusinessPermitSchema = z.object({
  documentNumber: z.string().trim().min(1, "Please enter your business registration number"),
  fileDataUrl: z.string().min(1, "Please upload your business permit document"),
})

export type SubmitBusinessPermitResult = { success: true } | { success: false; error: string }

/**
 * Business-owner KYC — used by the Business branch of provider onboarding
 * (app/provider/onboarding). Unlike submitProviderKycDocument this is a
 * single document (no back photo / selfie): the thing being verified is
 * the business's registration, not an individual's identity, matching how
 * ShopkeeperProfile/DistributorProfile verification already work.
 */
export async function submitBusinessPermitDocument(input: unknown): Promise<SubmitBusinessPermitResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") {
    return { success: false, error: "You must be signed in as a provider to submit verification." }
  }

  const parsed = submitBusinessPermitSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please complete all verification fields before submitting." }
  }
  const { documentNumber, fileDataUrl } = parsed.data
  const userId = session.user.id

  const dup = await checkKycDuplicate({ excludeUserId: userId, documentNumber, idFileUrl: fileDataUrl })
  if (dup.isDuplicate) {
    return { success: false, error: KYC_DUPLICATE_ERROR }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.kycDocument.create({
        data: {
          userId,
          documentType: "BUSINESS_PERMIT",
          documentNumber,
          idFileUrl: fileDataUrl,
          ...buildKycDedupeFields({ documentNumber, idFileUrl: fileDataUrl }),
        },
      })
      await tx.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } })
      await markVerificationPending(tx, userId)
    }, { timeout: 60000, maxWait: 10000 })
    return { success: true }
  } catch {
    return { success: false, error: "Couldn't reach the server. Please check your connection and try again." }
  }
}

const KYC_DOC_TYPE_TO_DB = {
  "National ID": "NATIONAL_ID",
  "Driver's License": "DRIVERS_LICENSE",
  Passport: "PASSPORT",
} as const

const KYC_DOC_TYPE_FROM_DB: Record<string, string> = {
  NATIONAL_ID: "National ID",
  DRIVERS_LICENSE: "Driver's License",
  PASSPORT: "Passport",
  BUSINESS_PERMIT: "Business Permit",
}

const providerKycSchema = z.object({
  idType: z.enum(["National ID", "Driver's License", "Passport"]),
  idNumber: z.string().trim().min(1, "Please enter your document number"),
  idFile: z.string().min(1, "Please upload the front of your ID document"),
  idFileBack: z.string().min(1, "Please upload the back of your ID document"),
  selfieFile: z.string().min(1, "Please upload or capture a selfie"),
})

export type SubmitProviderKycResult = { success: true } | { success: false; error: string }

/**
 * Full provider KYC (re)submission — used by
 * app/provider/profile/verification/page.tsx. Each submission is stored
 * as its own KycDocument row (unlike the old localStorage version, which
 * overwrote a single per-user entry), and resets the user's kycStatus to
 * pending for admin re-review.
 */
export async function submitProviderKycDocument(input: unknown): Promise<SubmitProviderKycResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") {
    return { success: false, error: "You must be signed in as a provider to submit verification." }
  }

  const parsed = providerKycSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please complete all verification fields before submitting." }
  }
  const data = parsed.data
  const userId = session.user.id

  const dup = await checkKycDuplicate({ excludeUserId: userId, documentNumber: data.idNumber, idFileUrl: data.idFile, idBackFileUrl: data.idFileBack })
  if (dup.isDuplicate) {
    return { success: false, error: KYC_DUPLICATE_ERROR }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.kycDocument.create({
        data: {
          userId,
          documentType: KYC_DOC_TYPE_TO_DB[data.idType],
          documentNumber: data.idNumber,
          idFileUrl: data.idFile,
          idBackFileUrl: data.idFileBack,
          selfieFileUrl: data.selfieFile,
          ...buildKycDedupeFields({ documentNumber: data.idNumber, idFileUrl: data.idFile, idBackFileUrl: data.idFileBack }),
        },
      })
      await tx.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } })
      await markVerificationPending(tx, userId)
    }, { timeout: 60000, maxWait: 10000 })
    // Two base64 photos (ID + selfie) can take longer to write than
    // Prisma's 5s transaction default over this environment's slow DB
    // connection — see the confirmed failure in completeShopkeeperOnboarding.
    return { success: true }
  } catch {
    return { success: false, error: "Couldn't reach the server. Please check your connection and try again." }
  }
}

/**
 * Why the last submission was rejected, for the wizard to display.
 *
 * Deliberately narrow: everything else the wizard needs about an account's
 * standing (BASIC / PENDING / VERIFIED, and whether the last verdict was a
 * rejection) already travels in the session, so the dialog renders without
 * waiting on the network and only this one string arrives late.
 */
export async function getMyRejectionReason(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const doc = await db.kycDocument.findFirst({
    where: { userId: session.user.id },
    orderBy: { submittedAt: "desc" },
    select: { rejectionReason: true },
  })
  return doc?.rejectionReason ?? null
}

export type SubmitIdentityVerificationResult = { success: true } | { success: false; error: string }

/**
 * Role-agnostic identity submission — the one the shared verification wizard
 * (components/kyc/verification-gate-dialog.tsx) calls.
 *
 * submitProviderKycDocument above does the same work but refuses anyone whose
 * role isn't "provider", which was fine when only the provider portal had a
 * verification screen. Under progressive KYC a customer, shopkeeper or
 * distributor can be asked to verify at any gated action, so the submission
 * path can't be tied to one role. Provider submissions still go through the
 * older action, so its behaviour is untouched.
 */
export async function submitIdentityVerification(input: unknown): Promise<SubmitIdentityVerificationResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "You must be signed in to verify your identity." }
  }

  const parsed = providerKycSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please complete all verification fields before submitting." }
  }
  const data = parsed.data
  const userId = session.user.id

  const dup = await checkKycDuplicate({ excludeUserId: userId, documentNumber: data.idNumber, idFileUrl: data.idFile, idBackFileUrl: data.idFileBack })
  if (dup.isDuplicate) {
    return { success: false, error: KYC_DUPLICATE_ERROR }
  }

  try {
    // 60s for the same reason as every other KYC write in this file: two
    // base64 photos over this environment's slow pooler blow past Prisma's
    // 5s interactive-transaction default.
    await db.$transaction(async (tx) => {
      await tx.kycDocument.create({
        data: {
          userId,
          documentType: KYC_DOC_TYPE_TO_DB[data.idType],
          documentNumber: data.idNumber,
          idFileUrl: data.idFile,
          idBackFileUrl: data.idFileBack,
          selfieFileUrl: data.selfieFile,
          ...buildKycDedupeFields({ documentNumber: data.idNumber, idFileUrl: data.idFile, idBackFileUrl: data.idFileBack }),
        },
      })
      await tx.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } })
      await markVerificationPending(tx, userId)
    }, { timeout: 60000, maxWait: 10000 })
    return { success: true }
  } catch {
    return { success: false, error: "Couldn't reach the server. Please check your connection and try again." }
  }
}

export type LatestKycDocument = {
  idType: string
  idNumber: string
  idFile: string
  idFileBack: string
  selfieFile: string
} | null

/** Pre-fills the provider verification form with the most recent submission, if any. */
export async function getLatestKycDocument(): Promise<LatestKycDocument> {
  const session = await auth()
  if (!session?.user?.id) return null

  const doc = await db.kycDocument.findFirst({
    where: { userId: session.user.id },
    orderBy: { submittedAt: "desc" },
  })
  if (!doc) return null

  return {
    idType: KYC_DOC_TYPE_FROM_DB[doc.documentType] ?? "National ID",
    idNumber: doc.documentNumber ?? "",
    idFile: doc.idFileUrl,
    idFileBack: doc.idBackFileUrl ?? "",
    selfieFile: doc.selfieFileUrl ?? "",
  }
}
