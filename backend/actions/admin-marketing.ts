"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin } from "@/backend/actions/admin-dashboard"
import { logAdminAction } from "@/backend/services/admin-audit-core"

// ============================= REFERRALS =============================

export type AdminReferral = {
  id: string
  referrerName: string
  referredUserName: string
  referralCode: string
  status: string
  rewardAmount: number | null
  createdAt: string
}

export type AdminReferralSummary = {
  totalReferrals: number
  rewardedCount: number
  pendingCount: number
  totalRewardsPaid: number
  recent: AdminReferral[]
}

/** Referral rewards fire automatically (see maybeRewardReferralForProvider /
 * jobs.ts's customer-side equivalent) — admin has never had any visibility
 * into the referral program at all until now, not even to spot abuse
 * (e.g. a user cycling through throwaway accounts to farm reward payouts). */
export async function getReferralOverview(): Promise<AdminReferralSummary> {
  const admin = await requireAdmin()
  if (!admin) return { totalReferrals: 0, rewardedCount: 0, pendingCount: 0, totalRewardsPaid: 0, recent: [] }

  const referrals = await db.referral.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { referrer: true, referredUser: true },
  })

  return {
    totalReferrals: referrals.length,
    rewardedCount: referrals.filter((r) => r.status === "REWARDED").length,
    pendingCount: referrals.filter((r) => r.status === "PENDING" || r.status === "ACTIVATED").length,
    totalRewardsPaid: referrals.reduce((sum, r) => sum + (r.status === "REWARDED" ? Number(r.rewardAmount ?? 0) : 0), 0),
    recent: referrals.map((r) => ({
      id: r.id,
      referrerName: r.referrer.name,
      referredUserName: r.referredUser.name,
      referralCode: r.referralCode,
      status: r.status,
      rewardAmount: r.rewardAmount ? Number(r.rewardAmount) : null,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

export type AdminMarketingActionResult = { success: true } | { success: false; error: string }

const referralIdSchema = z.object({ referralId: z.string().trim().min(1) })

/** Voiding sets CANCELLED — a terminal status maybeRewardReferralForProvider
 * / its customer-side equivalent both check for before paying out, so a
 * voided referral can never be rewarded even if the referred user goes on
 * to complete the qualifying action. */
export async function voidReferral(input: unknown): Promise<AdminMarketingActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = referralIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const referral = await db.referral.findUnique({ where: { id: parsed.data.referralId } })
  if (!referral) return { success: false, error: "Referral not found." }
  if (referral.status === "REWARDED") return { success: false, error: "This referral has already been rewarded and can't be voided." }

  await db.referral.update({ where: { id: referral.id }, data: { status: "CANCELLED" } })

  await logAdminAction({
    userId: admin.userId,
    action: "referral.void",
    entityType: "Referral",
    entityId: referral.id,
    oldValues: { status: referral.status },
    newValues: { status: "CANCELLED" },
  })

  return { success: true }
}

// ============================= ENDORSEMENTS =============================

export type AdminEndorsement = {
  id: string
  fromUserName: string
  toName: string
  message: string
  createdAt: string
}

export async function getEndorsements(): Promise<AdminEndorsement[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const endorsements = await db.endorsement.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { fromUser: true, toUser: true, toShop: true },
  })

  return endorsements.map((e) => ({
    id: e.id,
    fromUserName: e.fromUser.name,
    toName: e.toUser?.name ?? e.toShop?.shopName ?? "Unknown",
    message: e.message,
    createdAt: e.createdAt.toISOString(),
  }))
}

const endorsementIdSchema = z.object({ endorsementId: z.string().trim().min(1) })

export async function deleteEndorsement(input: unknown): Promise<AdminMarketingActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = endorsementIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const endorsement = await db.endorsement.findUnique({ where: { id: parsed.data.endorsementId } })
  if (!endorsement) return { success: false, error: "Endorsement not found." }

  await db.endorsement.delete({ where: { id: endorsement.id } })

  await logAdminAction({
    userId: admin.userId,
    action: "endorsement.delete",
    entityType: "Endorsement",
    entityId: endorsement.id,
  })

  return { success: true }
}

// ============================= PROMOTIONS =============================

export type AdminPromotion = {
  id: string
  shopName: string
  name: string
  code: string
  type: string
  value: number
  usedCount: number
  maxUses: number | null
  status: string
  startDate: string
  endDate: string | null
}

export async function getPlatformPromotions(): Promise<AdminPromotion[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const promotions = await db.promotion.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { shopkeeper: true },
  })

  return promotions.map((p) => ({
    id: p.id,
    shopName: p.shopkeeper.shopName,
    name: p.name,
    code: p.code,
    type: p.type,
    value: Number(p.value),
    usedCount: p.usedCount,
    maxUses: p.maxUses,
    status: p.status,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate ? p.endDate.toISOString() : null,
  }))
}

const promotionIdSchema = z.object({ promotionId: z.string().trim().min(1) })

/** Force-pause a promotion an admin has judged abusive (fake discount, spam
 * code, etc.) — previously a shop's promotions were entirely outside admin
 * reach; this reuses the same PAUSED status a shopkeeper can already set on
 * their own promotion, so it shows as paused identically in their dashboard. */
export async function forcePausePromotion(input: unknown): Promise<AdminMarketingActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = promotionIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const promotion = await db.promotion.findUnique({ where: { id: parsed.data.promotionId } })
  if (!promotion) return { success: false, error: "Promotion not found." }
  if (promotion.status === "PAUSED") return { success: false, error: "This promotion is already paused." }

  await db.promotion.update({ where: { id: promotion.id }, data: { status: "PAUSED" } })

  await logAdminAction({
    userId: admin.userId,
    action: "promotion.force_pause",
    entityType: "Promotion",
    entityId: promotion.id,
    oldValues: { status: promotion.status },
    newValues: { status: "PAUSED" },
  })

  return { success: true }
}
