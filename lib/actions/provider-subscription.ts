"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getEffectivePlatformPreferences } from "@/lib/actions/admin-settings"

const SUBSCRIPTION_PERIOD_DAYS = 30

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type ProviderSubscriptionStatus = {
  isPro: boolean
  currentPeriodEnd: string | null
  priceKES: number
} | null

/** Lazily reconciled, same convention as StaffInvite's expiry elsewhere in
 * this app — no cron needed, ACTIVE flips to EXPIRED the first time anyone
 * reads a lapsed subscription rather than on a schedule. */
export async function getMySubscriptionStatus(): Promise<ProviderSubscriptionStatus> {
  const provider = await requireProvider()
  if (!provider) return null

  const [subscription, prefs] = await Promise.all([
    db.providerSubscription.findUnique({ where: { providerId: provider.providerId } }),
    getEffectivePlatformPreferences(),
  ])

  if (subscription?.status === "ACTIVE" && subscription.currentPeriodEnd && subscription.currentPeriodEnd < new Date()) {
    await db.providerSubscription.update({ where: { id: subscription.id }, data: { status: "EXPIRED" } })
    return { isPro: false, currentPeriodEnd: subscription.currentPeriodEnd.toISOString(), priceKES: prefs.providerProPriceKES }
  }

  return {
    isPro: subscription?.status === "ACTIVE",
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    priceKES: prefs.providerProPriceKES,
  }
}

/**
 * Gate for features reserved to Saji Pro subscribers.
 *
 * Deliberately applied to nothing yet. Contracts, milestones, quotes and
 * invoicing all exist today and every provider can use them; moving any of
 * them behind this guard takes a working feature away from people who already
 * rely on it, which is a pricing decision rather than an engineering one. The
 * mechanism is here so that decision is a one-line change per action:
 *
 *   const denied = await requirePro()
 *   if (denied) return denied
 *
 * The only feature currently gated on Pro is the live-offer cap, enforced
 * inline in publishOffer() (lib/actions/offers.ts) because it needs the
 * configured cap in its message.
 */
export type ProGateResult = { success: false; error: string; requiresPro: true }

export async function requirePro(): Promise<ProGateResult | null> {
  const status = await getMySubscriptionStatus()
  if (status?.isPro) return null

  return {
    success: false,
    error: "This is a Saji Pro feature. Upgrade from your Pro dashboard to use it.",
    requiresPro: true,
  }
}

/** Lightweight balance-only read for the Pro purchase page's "Pay from
 * Wallet" option — getWalletSummary() in lib/actions/wallet.ts pulls
 * transactions, payment methods and escrow jobs too, more than this button
 * needs just to decide whether to show/disable itself. */
export async function getMyWalletBalance(): Promise<number> {
  const session = await auth()
  if (!session?.user?.id) return 0
  const wallet = await db.wallet.findUnique({ where: { userId: session.user.id }, select: { balance: true } })
  return wallet ? Number(wallet.balance) : 0
}

export type ProSubscriptionPaymentStatus = { status: "PENDING" | "COMPLETED" | "FAILED"; failureReason?: string | null }

/** The frontend polls this after initiating an M-Pesa/Stripe subscription
 * payment — mirrors checkWalletTopupStatus() in lib/actions/wallet.ts,
 * actively reconciling with the gateway when the local Payment is still
 * PENDING and this environment has no public webhook URL to be called
 * back on. */
export async function checkProSubscriptionPaymentStatus(paymentId: string): Promise<ProSubscriptionPaymentStatus | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.payerId !== session.user.id || payment.contextType !== "SUBSCRIPTION") return null

  if (payment.status === "PENDING" && payment.externalRef) {
    const { queryMpesaPayment, retrieveStripeSessionStatus } = await import("@/lib/actions/payments")
    const providerProfile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
    const ref = payment.externalRef
    if (ref.startsWith("ws_CO_")) {
      const result = await queryMpesaPayment(ref)
      if (result) {
        if (result.resultCode === 0) {
          await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
          if (providerProfile) await confirmProSubscriptionPayment(providerProfile.id, Number(payment.amount))
        } else {
          await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: result.reason ?? null } })
        }
      }
    } else if (ref.startsWith("cs_")) {
      const stripeStatus = await retrieveStripeSessionStatus(ref)
      if (stripeStatus === "paid") {
        await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
        if (providerProfile) await confirmProSubscriptionPayment(providerProfile.id, Number(payment.amount))
      }
    }
  }

  const fresh = await db.payment.findUnique({ where: { id: paymentId } })
  return { status: (fresh?.status as ProSubscriptionPaymentStatus["status"]) ?? "PENDING", failureReason: fresh?.failureReason ?? null }
}

/** Called by /api/payments/initiate once a SUBSCRIPTION-context payment
 * actually completes (real STK confirmation, or the sandbox-simulation
 * path) — extends from whichever is later, "now" or the current period
 * end, so renewing a few days early doesn't forfeit the remaining time. */
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
