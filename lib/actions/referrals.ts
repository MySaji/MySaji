"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"

function generateReferralCode(name: string): string {
  const base = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4) || "USER"
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `SAJI-${base}${suffix}`
}

export async function getOrCreateReferralCode(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  if (!user) return null
  if (user.referralCode) return user.referralCode

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(user.name)
    try {
      const updated = await db.user.update({ where: { id: user.id }, data: { referralCode: code } })
      return updated.referralCode
    } catch {
      // unique collision on this attempt — try another code
    }
  }
  return null
}

export type ReferralHistoryItem = {
  id: string
  name: string
  avatar: string | null
  date: string
  status: string
  rewardAmount: number
}

export type ReferralSummary = {
  code: string
  invited: number
  completed: number
  totalEarned: number
  history: ReferralHistoryItem[]
} | null

export async function getReferralSummary(): Promise<ReferralSummary> {
  const session = await auth()
  if (!session?.user?.id) return null

  const code = await getOrCreateReferralCode()
  if (!code) return null

  const referrals = await db.referral.findMany({
    where: { referrerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { referredUser: true },
  })

  return {
    code,
    invited: referrals.length,
    completed: referrals.filter((r) => r.status === "REWARDED").length,
    totalEarned: referrals.reduce((sum, r) => sum + (r.status === "REWARDED" ? Number(r.rewardAmount ?? 0) : 0), 0),
    history: referrals.map((r) => ({
      id: r.id,
      name: r.referredUser.name,
      avatar: r.referredUser.image,
      date: r.createdAt.toISOString(),
      status: r.status,
      rewardAmount: Number(r.rewardAmount ?? 0),
    })),
  }
}

const REFERRAL_REWARD_AMOUNT = 500

/** Fires when a referred provider's first-ever completed Job happens — the
 * customer-side equivalent (maybeRewardReferral in lib/actions/jobs.ts) fires
 * on first booking *created*; providers have no "booking" of their own, so
 * this triggers on first job *completed* instead. */
export async function maybeRewardReferralForProvider(providerUserId: string) {
  const providerProfile = await db.providerProfile.findUnique({ where: { userId: providerUserId } })
  if (!providerProfile) return

  const completedCount = await db.job.count({ where: { providerId: providerProfile.id, status: "COMPLETED" } })
  if (completedCount !== 1) return

  const referral = await db.referral.findUnique({ where: { referredUserId: providerUserId } })
  if (!referral || referral.status !== "ACTIVATED") return

  const wallet = await db.wallet.findUnique({ where: { userId: referral.referrerId } })
  if (!wallet) return

  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore + REFERRAL_REWARD_AMOUNT

  await db.$transaction([
    db.referral.update({
      where: { id: referral.id },
      data: { status: "REWARDED", rewardAmount: REFERRAL_REWARD_AMOUNT, rewardGivenAt: new Date() },
    }),
    db.wallet.update({
      where: { userId: referral.referrerId },
      data: { balance: balanceAfter, totalEarned: { increment: REFERRAL_REWARD_AMOUNT } },
    }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount: REFERRAL_REWARD_AMOUNT,
        description: "Referral reward — your referred provider completed their first job",
        referenceType: "REFERRAL",
        referenceId: referral.id,
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    }),
    db.notification.create({
      data: {
        userId: referral.referrerId,
        title: "Referral reward earned!",
        message: `KES ${REFERRAL_REWARD_AMOUNT} was added to your wallet for referring a provider.`,
        type: "PROMO",
        actionUrl: "/provider/referrals",
      },
    }),
  ])
}
