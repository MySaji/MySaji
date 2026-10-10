import { db } from "@/backend/db"

/**
 * Settlement side-effects that follow a confirmed payment, deliberately NOT
 * server actions.
 *
 * Each of these used to be exported from a "use server" file, and every export
 * of such a file is a callable HTTP endpoint whether or not any client imports
 * it. That made "grant this provider a month of Pro", "confirm this rental"
 * and "award this user loyalty points" reachable by anyone who could name the
 * id — none of which was ever meant to be callable from a browser. Their real
 * callers are the payments API route, payment webhooks, and other server
 * actions completing work.
 *
 * Same shape as lib/kyc-review-core.ts, lib/wallet-core.ts and
 * lib/payment-core.ts. Re-exporting any of this from a "use server" file
 * would recreate the endpoint it removes.
 */

const SUBSCRIPTION_PERIOD_DAYS = 30
const EARN_RATE_PER_KES = 0.01

/** Extends a provider's Saji Pro period. Callers must already have
 *  established that the subscription payment cleared. */
export async function confirmProSubscriptionPayment(providerId: string, amount: number): Promise<void> {
  const existing = await db.providerSubscription.findUnique({ where: { providerId } })
  const now = new Date()
  const base = existing?.currentPeriodEnd && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now
  const currentPeriodEnd = new Date(base.getTime() + SUBSCRIPTION_PERIOD_DAYS * 86400000)

  await db.providerSubscription.upsert({
    where: { providerId },
    update: { status: "ACTIVE", currentPeriodEnd, lastPaymentAmount: amount, lastPaymentAt: now },
    create: { providerId, status: "ACTIVE", currentPeriodEnd, lastPaymentAmount: amount, lastPaymentAt: now },
  })
}

/** The PENDING_PAYMENT filter is what stops this confirming a booking that
 *  was never in a payable state. */
export async function confirmRentalBookingPayment(bookingId: string): Promise<void> {
  await db.rentalBooking.updateMany({
    where: { id: bookingId, status: "PENDING_PAYMENT" },
    data: { status: "CONFIRMED" },
  })
}

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
