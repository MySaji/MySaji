import type { Prisma } from "@prisma/client"
import { db } from "@/backend/db"

/** A business permit proves a company is registered; it says nothing about
 *  who the person behind the account is. Only an identity document can move
 *  `verificationStatus`, which is the gate on transacting and moving money —
 *  otherwise a business could reach VERIFIED having submitted no ID at all,
 *  and a rejected permit would strip an identity verification that was never
 *  in question. The permit's own KycDocument.status is what the business gate
 *  in lib/verification-gate.ts reads. */
function isIdentityDocument(documentType: string): boolean {
  return documentType !== "BUSINESS_PERMIT"
}

/** Single source of truth for what "approve"/"reject" actually does to a
 * KycDocument — shared by admin-verifications.ts, sub-admin-verifications.ts,
 * and agent-verifications.ts so the three role-specific review queues can't
 * drift on behavior (this fixes a real drift: sub-admin/agent used to reject
 * with a hardcoded generic reason while admin took a real typed one — the
 * same rejected user got a useless message or a specific one purely based on
 * which staff member happened to review it). Each caller keeps its own
 * requireX() auth guard and role-scoping; only the DB mutation is shared. */

export async function approveKycDocument(kycDocumentId: string, reviewerId: string): Promise<{ success: true } | { success: false; error: string }> {
  const doc = await db.kycDocument.findUnique({ where: { id: kycDocumentId }, include: { user: true } })
  if (!doc) return { success: false, error: "Verification not found." }

  const isShop = doc.user.role === "SHOPKEEPER"
  const isProvider = doc.user.role === "PROVIDER"
  const isDistributor = doc.user.role === "DISTRIBUTOR"

  const isIdentity = isIdentityDocument(doc.documentType)

  const updates: Prisma.PrismaPromise<unknown>[] = [
    db.kycDocument.update({
      where: { id: doc.id },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: null },
    }),
  ]
  // Progressive KYC: `kycStatus` records the verdict on this document,
  // `verificationStatus` is what the gate in lib/verification-gate.ts
  // actually reads. Approval has to move both — moving only the first would
  // leave an approved user still unable to transact. A business permit moves
  // neither; approving it only flips its own status, which is what the
  // business half of the gate looks at.
  if (isIdentity) {
    updates.push(
      db.user.update({
        where: { id: doc.userId },
        data: { kycStatus: "APPROVED", verificationStatus: "VERIFIED" },
      }),
    )
  }
  if (isShop) updates.push(db.shopkeeperProfile.updateMany({ where: { userId: doc.userId }, data: { isVerified: true } }))
  else if (isProvider) updates.push(db.providerProfile.updateMany({ where: { userId: doc.userId }, data: { verified: true } }))
  else if (isDistributor) updates.push(db.distributorProfile.updateMany({ where: { userId: doc.userId }, data: { isVerified: true } }))

  updates.push(
    db.notification.create({
      data: {
        userId: doc.userId,
        title: !isIdentity
          ? "Business verification approved"
          : isShop ? "Shop registration approved" : isProvider ? "Provider verification approved" : "Verification approved",
        message: !isIdentity
          ? "Your business permit has been approved. Your company can now publish offers, take on work and be paid."
          : isShop
            ? "Your shop registration has been approved. You now have full access to your shopkeeper portal."
            : isProvider
              ? "Your provider verification has been approved. You now have full access to your provider portal."
              : "Your identity verification has been approved. You now have full access to your account.",
        type: "SYSTEM",
      },
    })
  )

  await db.$transaction(updates)
  return { success: true }
}

export async function rejectKycDocument(kycDocumentId: string, reviewerId: string, reason: string): Promise<{ success: true } | { success: false; error: string }> {
  const doc = await db.kycDocument.findUnique({ where: { id: kycDocumentId }, include: { user: true } })
  if (!doc) return { success: false, error: "Verification not found." }

  const isShop = doc.user.role === "SHOPKEEPER"
  const isProvider = doc.user.role === "PROVIDER"
  const isIdentity = isIdentityDocument(doc.documentType)

  await db.$transaction([
    db.kycDocument.update({
      where: { id: doc.id },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: reason },
    }),
    // A rejected identity document sends the account back to BASIC rather
    // than to a "rejected" tier of its own: for the purpose of what they may
    // do, a rejected user is simply unverified, and `kycStatus` REJECTED is
    // what lets the UI explain why and invite a resubmission. Revoking is the
    // fail-safe direction, and matches what already happened here before
    // progressive KYC — a REJECTED user was locked out of their portal
    // outright, so this is no more restrictive than the previous behaviour.
    //
    // A rejected *business permit* leaves both fields alone: it blocks the
    // company from publishing and being paid (via the permit's own status,
    // which the business gate reads) without stripping an identity
    // verification that was never in question.
    ...(isIdentityDocument(doc.documentType)
      ? [
          db.user.update({
            where: { id: doc.userId },
            data: { kycStatus: "REJECTED" as const, verificationStatus: "BASIC" as const },
          }),
        ]
      : []),
    db.notification.create({
      data: {
        userId: doc.userId,
        title: !isIdentity
          ? "Business verification rejected"
          : isShop ? "Shop registration rejected" : isProvider ? "Provider verification rejected" : "Verification rejected",
        message: !isIdentity
          ? `Your business permit was rejected: ${reason}`
          : isShop
            ? `Your shop registration was rejected: ${reason}`
            : isProvider
              ? `Your provider verification was rejected: ${reason}`
              : `Your identity verification was rejected: ${reason}`,
        type: "SYSTEM",
      },
    }),
  ])

  return { success: true }
}
