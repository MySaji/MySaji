"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requirePosPermission } from "@/backend/actions/pos-access"
import { resolvePosActor } from "@/backend/actions/pos-access"
import { billingStateOf, advanceBilling, ensureSubscription } from "@/backend/services/pos-billing"

/**
 * What the shopkeeper sees about their own subscription.
 *
 * Deliberately small and deliberately honest: what is owed, by when, what
 * happens if it is not paid, and what has been paid before. A shopkeeper who
 * cannot see their own bill is one who will be surprised by it.
 *
 * Nothing here can change what is owed. Taking a payment is the platform's
 * side, and recording one is an admin action, because a till that could mark
 * its own subscription paid would not be a subscription.
 */

export type ShopBillingView = {
  status: string
  canSell: boolean
  message: string | null
  owed: number
  currency: string
  setupFee: number
  monthlyFee: number
  until: string | null
  daysLeft: number | null
  /** What to pay, each one a line a shopkeeper can recognise. */
  charges: {
    id: string
    kind: string
    status: string
    amount: number
    periodStart: string | null
    periodEnd: string | null
    paidAt: string | null
    reference: string | null
  }[]
} | null

export async function getMyPosBilling(input?: unknown): Promise<ShopBillingView> {
  const parsed = z.object({ staffId: z.string().trim().max(60).optional() }).safeParse(input ?? {})
  const g = await requirePosPermission("settings.business", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return null

  await ensureSubscription(g.actor.businessId)
  // Bring the state up to date before showing it, so a shopkeeper opening
  // this page on the 2nd sees the month's charge rather than yesterday's
  // picture.
  await advanceBilling(g.actor.businessId)

  const state = await billingStateOf(g.actor.businessId)
  const charges = await db.posBillingCharge.findMany({
    where: { businessId: g.actor.businessId },
    orderBy: { createdAt: "desc" },
    take: 24,
  })

  return {
    status: state.status,
    canSell: state.canSell,
    message: state.message,
    owed: state.owed,
    currency: state.currency,
    setupFee: state.setupFee,
    monthlyFee: state.monthlyFee,
    until: state.until ? state.until.toISOString() : null,
    daysLeft: state.daysLeft,
    charges: charges.map((c) => ({
      id: c.id,
      kind: c.kind,
      status: c.status,
      amount: Number(c.amount.toFixed(2)),
      periodStart: c.periodStart ? c.periodStart.toISOString() : null,
      periodEnd: c.periodEnd ? c.periodEnd.toISOString() : null,
      paidAt: c.paidAt ? c.paidAt.toISOString() : null,
      reference: c.reference,
    })),
  }
}

/**
 * Whether this till may sell, for the till itself to ask.
 *
 * Cheap and safe to call on every till load. Returns "allowed" for every
 * business on a platform that is not charging, which is the default, so a
 * deployment that never turns billing on never pays for this check in
 * behaviour or in confusion.
 */
export async function getTillBillingGate(): Promise<{
  canSell: boolean
  status: string
  message: string | null
  owed: number
  currency: string
}> {
  const open = { canSell: true, status: "ACTIVE", message: null, owed: 0, currency: "KES" }
  try {
    const actor = await resolvePosActor()
    if (!actor) return open
    const state = await billingStateOf(actor.businessId)
    return {
      canSell: state.canSell,
      status: state.status,
      message: state.message,
      owed: state.owed,
      currency: state.currency,
    }
  } catch {
    // A failure to read the subscription must never be the reason a shop
    // cannot sell. Billing is the platform's problem, not the counter's.
    return open
  }
}
