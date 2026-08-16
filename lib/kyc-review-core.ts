import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"

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

  const updates: Prisma.PrismaPromise<unknown>[] = [
    db.kycDocument.update({
      where: { id: doc.id },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: null },
    }),
    db.user.update({ where: { id: doc.userId }, data: { kycStatus: "APPROVED" } }),
  ]
  if (isShop) updates.push(db.shopkeeperProfile.updateMany({ where: { userId: doc.userId }, data: { isVerified: true } }))
  else if (isProvider) updates.push(db.providerProfile.updateMany({ where: { userId: doc.userId }, data: { verified: true } }))
  else if (isDistributor) updates.push(db.distributorProfile.updateMany({ where: { userId: doc.userId }, data: { isVerified: true } }))

  updates.push(
    db.notification.create({
      data: {
        userId: doc.userId,
        title: isShop ? "Shop registration approved" : isProvider ? "Provider verification approved" : "Verification approved",
        message: isShop
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

  await db.$transaction([
    db.kycDocument.update({
      where: { id: doc.id },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: reason },
    }),
    db.user.update({ where: { id: doc.userId }, data: { kycStatus: "REJECTED" } }),
    db.notification.create({
      data: {
        userId: doc.userId,
        title: isShop ? "Shop registration rejected" : isProvider ? "Provider verification rejected" : "Verification rejected",
        message: isShop
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
