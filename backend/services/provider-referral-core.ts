import "server-only"

import { db } from "@/backend/db"

import { pushToUser } from "@/backend/services/push-core"

const REFERRAL_REWARD_AMOUNT = 500

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
        description: "Referral reward: your referred provider completed their first job",
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

  await pushToUser(referral.referrerId, {
    title: "Referral reward earned!",
    body: `KES ${REFERRAL_REWARD_AMOUNT} was added to your wallet for referring a provider.`,
    url: "/provider/referrals",
  }, "promo")
}
