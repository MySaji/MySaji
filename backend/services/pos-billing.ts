import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"

/**
 * What a shop pays to use the till, and what happens when it does not.
 *
 * WHY THE PRICE IS COPIED AND NOT LOOKED UP
 *
 * The platform's price list is one thing; what a given shop agreed to pay is
 * another. The amounts live on the subscription, copied from the list when
 * the business signed up. An admin raising the price for new shops must not
 * silently reprice four hundred existing ones overnight, and a shop that
 * joined at 500 should not discover it is now paying 800 because somebody
 * edited a settings page. Repricing an existing shop is a deliberate act
 * with its own record.
 *
 * WHAT SUSPENSION DOES AND DOES NOT DO
 *
 * It stops the till selling. It does NOT touch the shop's data, hide its
 * reports, or delete anything: a shopkeeper who falls behind still owns
 * their stock figures, their sales history and their customer list, and
 * holding those hostage to collect a subscription would be wrong whatever
 * the contract said. They can read everything and export it. They cannot
 * ring up a new sale until they settle.
 *
 * THE GRACE PERIOD IS THE POINT
 *
 * A duka whose M-Pesa failed on a Sunday should not find the till dead on
 * Monday morning with customers queuing. Past due means the shopkeeper is
 * told, loudly, while everything keeps working. Only when the grace runs out
 * does anything stop.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

/** The platform's current price list, as an admin set it. */
export type PosPriceList = {
  /** Charging can be switched off entirely, which is where this starts. */
  enabled: boolean
  setupFee: number
  monthlyFee: number
  /** Days of free use for a new business. */
  trialDays: number
  /** Days the till keeps working after a payment is missed. */
  graceDays: number
  currency: string
}

export const DEFAULT_PRICE_LIST: PosPriceList = {
  // Off until an admin turns it on, so nobody is billed by a deployment that
  // simply had the feature installed.
  enabled: false,
  setupFee: 0,
  monthlyFee: 0,
  trialDays: 30,
  graceDays: 7,
  currency: "KES",
}

/** The list as stored, with anything missing or nonsensical replaced. */
export function parsePriceList(raw: unknown): PosPriceList {
  const v = (raw ?? {}) as Record<string, unknown>
  const num = (k: keyof PosPriceList, fallback: number, max: number) => {
    const n = Number(v[k])
    return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback
  }
  return {
    enabled: v.enabled === true,
    setupFee: num("setupFee", DEFAULT_PRICE_LIST.setupFee, 10_000_000),
    monthlyFee: num("monthlyFee", DEFAULT_PRICE_LIST.monthlyFee, 10_000_000),
    trialDays: Math.floor(num("trialDays", DEFAULT_PRICE_LIST.trialDays, 365)),
    graceDays: Math.floor(num("graceDays", DEFAULT_PRICE_LIST.graceDays, 90)),
    currency: typeof v.currency === "string" && v.currency.length === 3 ? v.currency : "KES",
  }
}

export async function getPriceList(): Promise<PosPriceList> {
  const row = await db.platformSetting.findUnique({ where: { key: "pos_billing" } })
  return parsePriceList(row?.value)
}

/** A month from this date, keeping the day of the month where it exists. */
export function addMonth(from: Date): Date {
  const d = new Date(from)
  const day = d.getDate()
  d.setMonth(d.getMonth() + 1)
  // The 31st of a month followed by a 30 day one rolls over, which would
  // quietly move a shop's billing day forward every year. Pull it back.
  if (d.getDate() < day) d.setDate(0)
  return d
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return d
}

export type BillingState = {
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED"
  /** Whether the till may ring up a sale right now. */
  canSell: boolean
  /** What the shopkeeper should be told, where anything. */
  message: string | null
  /** Total owed and not yet settled. */
  owed: number
  /** When the paid period ends, or the trial does. */
  until: Date | null
  /** Days left before selling stops. Null where nothing is counting down. */
  daysLeft: number | null
  setupFee: number
  monthlyFee: number
  currency: string
}

/**
 * Where this business stands, right now.
 *
 * Pure apart from the two reads, and deliberately does not write: deciding
 * whether a till may sell must not have the side effect of changing what it
 * owes. Moving a subscription between states is `advanceBilling`, which runs
 * on a schedule and on demand, and says what it did.
 */
export async function billingStateOf(businessId: string): Promise<BillingState> {
  const list = await getPriceList()
  const sub = await db.posSubscription.findUnique({
    where: { businessId },
    include: { charges: { where: { status: "DUE" }, select: { amount: true } } },
  })

  // Billing switched off platform wide, or a business that predates it.
  // Either way nobody is stopped from selling by a bill that does not exist.
  if (!list.enabled || !sub) {
    return {
      status: "ACTIVE",
      canSell: true,
      message: null,
      owed: 0,
      until: null,
      daysLeft: null,
      setupFee: list.setupFee,
      monthlyFee: list.monthlyFee,
      currency: list.currency,
    }
  }

  const owed = money(sub.charges.reduce((t, c) => t.plus(c.amount), D(0)))
  const now = new Date()
  const until = sub.status === "TRIAL" ? sub.trialEndsAt : sub.periodEndsAt
  const daysLeft = until ? Math.ceil((until.getTime() - now.getTime()) / 86400000) : null

  const common = {
    owed,
    until,
    daysLeft,
    setupFee: money(sub.setupFee),
    monthlyFee: money(sub.monthlyFee),
    currency: list.currency,
  }

  if (sub.status === "SUSPENDED") {
    return {
      ...common,
      status: "SUSPENDED",
      canSell: false,
      message:
        "The till is paused because the subscription has not been paid. Your stock, sales and " +
        "customers are all still here and nothing has been deleted. Settle " +
        list.currency + " " + owed.toLocaleString("en-KE") + " to start selling again.",
    }
  }

  if (sub.status === "CANCELLED") {
    return {
      ...common,
      status: "CANCELLED",
      canSell: false,
      message: "This till has been switched off. Talk to support if that is not what you wanted.",
    }
  }

  if (sub.status === "PAST_DUE") {
    const graceEnds = sub.periodEndsAt ? addDays(sub.periodEndsAt, sub.graceDays) : null
    const graceLeft = graceEnds ? Math.ceil((graceEnds.getTime() - now.getTime()) / 86400000) : null
    return {
      ...common,
      status: "PAST_DUE",
      canSell: true,
      daysLeft: graceLeft,
      message:
        list.currency + " " + owed.toLocaleString("en-KE") + " is due." +
        (graceLeft !== null && graceLeft > 0
          ? " The till keeps working for " + graceLeft + " more day" + (graceLeft === 1 ? "" : "s") + "."
          : " The till stops selling today."),
    }
  }

  if (sub.status === "TRIAL") {
    return {
      ...common,
      status: "TRIAL",
      canSell: true,
      message:
        daysLeft !== null && daysLeft <= 7
          ? "Your free trial ends in " + Math.max(0, daysLeft) + " day" + (daysLeft === 1 ? "" : "s") + "."
          : null,
    }
  }

  return {
    ...common,
    status: "ACTIVE",
    canSell: true,
    message: owed > 0 ? list.currency + " " + owed.toLocaleString("en-KE") + " is outstanding." : null,
  }
}

export type AdvanceResult = {
  /** How many monthly charges were raised. */
  raised: number
  /** How many businesses moved to past due. */
  pastDue: number
  /** How many were suspended because grace ran out. */
  suspended: number
}

/**
 * Move subscriptions along: end trials, raise the month's charge, and
 * suspend what has run out of grace.
 *
 * Idempotent by period: a monthly charge is raised once per period because
 * the period it covers is written on it, and one is only raised when none
 * exists for that period. Running this twice in a day does not bill twice,
 * which matters because it runs both on a schedule and whenever an admin
 * opens the page.
 */
export async function advanceBilling(businessId?: string): Promise<AdvanceResult> {
  const list = await getPriceList()
  if (!list.enabled) return { raised: 0, pastDue: 0, suspended: 0 }

  const now = new Date()
  const subs = await db.posSubscription.findMany({
    where: {
      ...(businessId ? { businessId } : {}),
      status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] },
    },
    include: { charges: { where: { kind: "MONTHLY" }, orderBy: { periodEnd: "desc" }, take: 1 } },
  })

  let raised = 0
  let pastDue = 0
  let suspended = 0

  for (const sub of subs) {
    // 1. A trial that has run out becomes a paying subscription, and the
    //    first month is charged from the day the trial ended.
    if (sub.status === "TRIAL") {
      if (!sub.trialEndsAt || sub.trialEndsAt > now) continue
      const periodStart = sub.trialEndsAt
      const periodEnd = addMonth(periodStart)
      await db.$transaction(async (tx) => {
        await tx.posBillingCharge.create({
          data: {
            subscriptionId: sub.id,
            businessId: sub.businessId,
            kind: "MONTHLY",
            amount: sub.monthlyFee,
            periodStart,
            periodEnd,
          },
        })
        await tx.posSubscription.update({
          where: { id: sub.id },
          data: { status: "PAST_DUE", periodEndsAt: periodStart },
        })
      }, { timeout: 30000, maxWait: 10000 })
      raised++
      pastDue++
      continue
    }

    // 2. A paid period that has ended raises the next month's charge, once.
    if (sub.periodEndsAt && sub.periodEndsAt <= now) {
      const last = sub.charges[0]
      const alreadyRaised = last?.periodEnd && last.periodEnd > sub.periodEndsAt
      if (!alreadyRaised) {
        const periodStart = sub.periodEndsAt
        const periodEnd = addMonth(periodStart)
        await db.posBillingCharge.create({
          data: {
            subscriptionId: sub.id,
            businessId: sub.businessId,
            kind: "MONTHLY",
            amount: sub.monthlyFee,
            periodStart,
            periodEnd,
          },
        })
        raised++
      }
      if (sub.status !== "PAST_DUE") {
        await db.posSubscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } })
        pastDue++
      }
    }

    // 3. Grace that has run out stops the till.
    if (sub.status === "PAST_DUE" && sub.periodEndsAt) {
      const graceEnds = addDays(sub.periodEndsAt, sub.graceDays)
      if (graceEnds <= now) {
        const stillOwed = await db.posBillingCharge.count({
          where: { subscriptionId: sub.id, status: "DUE" },
        })
        if (stillOwed > 0) {
          await db.posSubscription.update({ where: { id: sub.id }, data: { status: "SUSPENDED" } })
          suspended++
        }
      }
    }
  }

  return { raised, pastDue, suspended }
}

/**
 * Settle a charge, and move the subscription on if that clears the debt.
 *
 * The period is extended from where it ENDED, not from today: a shop that
 * pays three days late has already used those days, and rolling the date
 * forward from the payment would quietly give away three days a month.
 */
export async function settleCharge(input: {
  chargeId: string
  method: string
  reference?: string | null
  recordedBy?: string | null
}): Promise<{ ok: true; alreadyPaid?: boolean } | { ok: false; error: string }> {
  const charge = await db.posBillingCharge.findUnique({
    where: { id: input.chargeId },
    include: { subscription: true },
  })
  if (!charge) return { ok: false, error: "That charge no longer exists." }
  // Already settled. Reported rather than swallowed: an admin looking at a
  // sheet that has not refreshed can click the button for a charge somebody
  // just paid, and telling them it was "recorded" would have them believe
  // money arrived twice.
  if (charge.status === "PAID") return { ok: true, alreadyPaid: true }
  if (charge.status === "VOID") return { ok: false, error: "That charge was cancelled." }

  await db.$transaction(async (tx) => {
    await tx.posBillingCharge.update({
      where: { id: charge.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidMethod: input.method,
        reference: input.reference ?? null,
        recordedBy: input.recordedBy ?? null,
      },
    })

    if (charge.kind === "SETUP") {
      await tx.posSubscription.update({
        where: { id: charge.subscriptionId },
        data: { setupSettled: true, lastPaidAt: new Date() },
      })
    } else if (charge.periodEnd) {
      await tx.posSubscription.update({
        where: { id: charge.subscriptionId },
        data: { periodEndsAt: charge.periodEnd, lastPaidAt: new Date() },
      })
    }

    // Nothing left owing means the till is back, whatever it was before.
    const left = await tx.posBillingCharge.count({
      where: { subscriptionId: charge.subscriptionId, status: "DUE" },
    })
    if (left === 0) {
      await tx.posSubscription.update({
        where: { id: charge.subscriptionId },
        data: { status: "ACTIVE" },
      })
    }
  }, { timeout: 30000, maxWait: 10000 })

  return { ok: true }
}

/**
 * Start a subscription for a business that has none.
 *
 * Called when a POS business is created, and by the admin page for the
 * businesses that existed before any of this did. The price list is read
 * once, here, and copied onto the subscription.
 */
export async function ensureSubscription(businessId: string): Promise<void> {
  const existing = await db.posSubscription.findUnique({ where: { businessId } })
  if (existing) return

  const list = await getPriceList()
  const now = new Date()

  await db.$transaction(async (tx) => {
    const sub = await tx.posSubscription.create({
      data: {
        businessId,
        status: list.enabled && list.trialDays > 0 ? "TRIAL" : "ACTIVE",
        setupFee: D(list.setupFee),
        monthlyFee: D(list.monthlyFee),
        graceDays: list.graceDays,
        trialEndsAt: list.trialDays > 0 ? addDays(now, list.trialDays) : null,
        periodEndsAt: list.trialDays > 0 ? null : addMonth(now),
        setupSettled: list.setupFee <= 0,
      },
    })

    // The one off, raised at the start so it appears on the first bill
    // rather than surprising somebody in month two.
    if (list.enabled && list.setupFee > 0) {
      await tx.posBillingCharge.create({
        data: {
          subscriptionId: sub.id,
          businessId,
          kind: "SETUP",
          amount: D(list.setupFee),
        },
      })
    }
  }, { timeout: 30000, maxWait: 10000 })
}
