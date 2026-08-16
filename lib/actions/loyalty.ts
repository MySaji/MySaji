"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { pushToUser } from "@/lib/actions/push"

// 1 point per KES 100 spent, redeemable 1:1 for wallet credit (so 1 point =
// KES 1 — easy to explain in the UI as "earn 1% back as points").
const EARN_RATE_PER_KES = 0.01
const MIN_REDEEMABLE_POINTS = 50

export type LoyaltyHistoryItem = {
  id: string
  type: "EARN" | "REDEEM" | "ADJUST"
  points: number
  description: string
  createdAt: string
}

export type LoyaltySummary = {
  points: number
  lifetimePoints: number
  minRedeemable: number
  history: LoyaltyHistoryItem[]
} | null

export async function getLoyaltySummary(): Promise<LoyaltySummary> {
  const session = await auth()
  if (!session?.user?.id) return null

  const account = await db.loyaltyAccount.findUnique({
    where: { userId: session.user.id },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } },
  })
  if (!account) return { points: 0, lifetimePoints: 0, minRedeemable: MIN_REDEEMABLE_POINTS, history: [] }

  return {
    points: account.points,
    lifetimePoints: account.lifetimePoints,
    minRedeemable: MIN_REDEEMABLE_POINTS,
    history: account.transactions.map((t) => ({
      id: t.id,
      type: t.type,
      points: t.points,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    })),
  }
}

/** Awards points for a completed purchase/job — called after an Order hits
 * DELIVERED (lib/actions/shopkeeper-orders.ts) or a Job hits COMPLETED
 * (lib/actions/provider-jobs.ts), mirroring where referral rewards already
 * fire (same "side effect after a terminal status transition" pattern).
 * amountSpent should exclude shipping/tax — the goods value only. */
export async function awardLoyaltyPoints(
  userId: string,
  amountSpent: number,
  reference: { referenceType: string; referenceId: string },
): Promise<void> {
  const points = Math.floor(amountSpent * EARN_RATE_PER_KES)
  if (points <= 0) return

  const account = await db.loyaltyAccount.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })
  const balanceBefore = account.points
  const balanceAfter = balanceBefore + points

  await db.$transaction([
    db.loyaltyAccount.update({
      where: { userId },
      data: { points: balanceAfter, lifetimePoints: { increment: points } },
    }),
    db.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: "EARN",
        points,
        description: `Earned from ${reference.referenceType.toLowerCase()}`,
        referenceType: reference.referenceType,
        referenceId: reference.referenceId,
        balanceBefore,
        balanceAfter,
      },
    }),
  ])
}

export type RedeemLoyaltyResult = { success: true; creditedAmount: number } | { success: false; error: string }

/** Redeems the full points balance for equal KES wallet credit (1:1),
 * gated at a small minimum so redemptions aren't spammed one point at a
 * time. Mirrors creditWalletTopup's wallet-credit shape (lib/actions/
 * wallet.ts:102-140) but also writes the LoyaltyTransaction side. */
export async function redeemLoyaltyPoints(): Promise<RedeemLoyaltyResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const userId = session.user.id

  const account = await db.loyaltyAccount.findUnique({ where: { userId } })
  if (!account || account.points < MIN_REDEEMABLE_POINTS) {
    return { success: false, error: `You need at least ${MIN_REDEEMABLE_POINTS} points to redeem.` }
  }

  const pointsToRedeem = account.points
  const creditedAmount = pointsToRedeem

  const wallet = await db.wallet.upsert({ where: { userId }, update: {}, create: { userId } })
  const walletBefore = Number(wallet.balance)
  const walletAfter = walletBefore + creditedAmount
  const loyaltyBalanceBefore = account.points
  const loyaltyBalanceAfter = 0

  await db.$transaction([
    db.loyaltyAccount.update({ where: { userId }, data: { points: 0 } }),
    db.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: "REDEEM",
        points: -pointsToRedeem,
        description: "Redeemed for wallet credit",
        referenceType: "WALLET",
        balanceBefore: loyaltyBalanceBefore,
        balanceAfter: loyaltyBalanceAfter,
      },
    }),
    db.wallet.update({ where: { userId }, data: { balance: walletAfter } }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount: creditedAmount,
        description: `Redeemed ${pointsToRedeem.toLocaleString()} loyalty points`,
        referenceType: "LOYALTY",
        status: "COMPLETED",
        balanceBefore: walletBefore,
        balanceAfter: walletAfter,
      },
    }),
    db.notification.create({
      data: {
        userId,
        title: "Points redeemed",
        message: `${pointsToRedeem.toLocaleString()} points were redeemed for KES ${creditedAmount.toLocaleString()} in wallet credit.`,
        type: "PROMO",
        actionUrl: "/customer/rewards",
      },
    }),
  ])

  await pushToUser(userId, {
    title: "Points redeemed",
    body: `${pointsToRedeem.toLocaleString()} points redeemed for KES ${creditedAmount.toLocaleString()}.`,
    url: "/customer/rewards",
  }, "payment")

  return { success: true, creditedAmount }
}
