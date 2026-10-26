import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { getEffectivePlatformPreferences } from "@/backend/actions/admin-settings"
import { getEffectiveCommissionRate, splitByCommission } from "@/backend/services/commission"

/**
 * Commission owed, when the customer pays the provider directly.
 *
 * WHY THIS EXISTS
 *
 * The platform was built around holding the customer's money and paying the
 * provider the rest. That is the right shape eventually, and the code for it
 * is untouched. But a new app asking a stranger to hand over money before a
 * plumber has turned up looks exactly like a scam, and the people being asked
 * are right to be suspicious.
 *
 * So the money can bypass the platform entirely: the customer pays the
 * provider on their phone after the work, the way they already pay everyone
 * else. The platform's cut then becomes a DEBT the provider carries, charged
 * when they accept the job, and settled later. This is how Uber bills a
 * driver who took a cash fare, and for the same reason.
 *
 * WHAT IS CHARGED, AND WHEN
 *
 * On acceptance, not on completion. A provider who accepts a job has taken
 * it off the market and out of everyone else's list; whether they then do
 * the work is between them and the customer. Cancelling reverses it in full,
 * because a job that did not happen earned the platform nothing.
 *
 * WHERE THE DEBT LIVES
 *
 * In the wallet the provider already has, as a negative balance, with a
 * Transaction row for every movement. Deliberately NOT a separate ledger: a
 * provider must not have to learn that they have two balances, and their
 * earnings from anything else should pay this down by themselves.
 *
 * WHAT STOPS
 *
 * Accepting new work, once the debt reaches the cap an admin sets. Nothing
 * else: their account, their history, their listing and any job already in
 * hand are untouched, because cutting off a provider mid-job would punish
 * the customer waiting for them.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

/** How a job is paid for, platform wide. */
export type JobPaymentMode = "IN_APP" | "DIRECT" | "BOTH"

export async function jobPaymentMode(): Promise<JobPaymentMode> {
  const prefs = await getEffectivePlatformPreferences()
  const mode = (prefs as { jobPaymentMode?: string }).jobPaymentMode
  return mode === "IN_APP" || mode === "BOTH" ? mode : "DIRECT"
}

/**
 * What a booking starts as.
 *
 * PENDING_PAYMENT holds a job until money arrives through the platform. Where
 * the customer is going to pay the provider directly that money never comes,
 * so the job would sit there forever: invisible to the provider, never
 * accepted, never cancelled, and from the customer's side simply ignored.
 *
 * Lives here rather than in an action because FIVE different flows create
 * jobs (the booking wizard, quick-book, an offer, an accepted quote on a
 * request, and a service contract) and three of them were setting
 * PENDING_PAYMENT by hand. One of them being missed is exactly how a booking
 * silently goes nowhere.
 */
export async function openingJobStatus(): Promise<"PENDING" | "PENDING_PAYMENT"> {
  const mode = await jobPaymentMode()
  return mode === "DIRECT" ? "PENDING" : "PENDING_PAYMENT"
}

/** How much a provider may owe before they stop being able to take work. */
export async function commissionDebtCap(): Promise<number> {
  const prefs = await getEffectivePlatformPreferences()
  const cap = Number((prefs as { commissionDebtCap?: number }).commissionDebtCap)
  return Number.isFinite(cap) && cap >= 0 ? cap : 1500
}

/**
 * Whether this job's commission is the provider's to owe.
 *
 * In BOTH mode the two routes live side by side, so the question is not what
 * the platform prefers but what actually happened to this job: money that
 * came through the platform is already short the commission, and charging
 * the provider again would take it twice.
 */
export async function jobIsProviderPaid(jobId: string): Promise<boolean> {
  const paid = await db.payment.findFirst({
    where: { jobId, status: "COMPLETED" },
    select: { id: true },
  })
  return paid === null
}

export type DebtState = {
  /** What they owe, as a positive number. Zero when they are square. */
  owed: number
  cap: number
  /** False once the debt has reached the cap. */
  canAcceptWork: boolean
  /** What to tell them, where anything needs saying. */
  message: string | null
  /** How close they are, for a bar they can watch. */
  fractionUsed: number
}

/** Where a provider stands. Reads only; charging is the functions below. */
export async function debtStateOf(userId: string): Promise<DebtState> {
  const [wallet, cap] = await Promise.all([
    db.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    commissionDebtCap(),
  ])

  const balance = wallet ? Number(wallet.balance) : 0
  const owed = balance < 0 ? Math.abs(balance) : 0
  const canAcceptWork = cap <= 0 ? true : owed < cap

  return {
    owed: Number(owed.toFixed(2)),
    cap,
    canAcceptWork,
    fractionUsed: cap > 0 ? Math.min(1, owed / cap) : 0,
    message: !canAcceptWork
      ? "You owe KSh " + owed.toLocaleString("en-KE") + " in commission. Settle it to start accepting work again."
      : owed > 0 && cap > 0 && owed / cap >= 0.75
        ? "You owe KSh " + owed.toLocaleString("en-KE") + " in commission. At KSh " +
          cap.toLocaleString("en-KE") + " you will not be able to accept new work."
        : null,
  }
}

export type ChargeResult =
  | { ok: true; charged: number; rate: number; alreadyCharged?: boolean }
  | { ok: false; error: string }

/**
 * Put this job's commission on the provider's account.
 *
 * Idempotent per job: a job accepted, released and accepted again must be
 * charged once, and the surest way to make a provider distrust the figure is
 * to bill them twice for the same work. The existing Transaction row is the
 * record that it has been charged, so there is nothing new to keep in step.
 */
export async function chargeCommissionDebt(input: {
  jobId: string
  providerUserId: string
  providerProfileId: string
}): Promise<ChargeResult> {
  const job = await db.job.findUnique({
    where: { id: input.jobId },
    select: { id: true, title: true, price: true },
  })
  if (!job) return { ok: false, error: "That job no longer exists." }

  const existing = await db.transaction.findFirst({
    where: { referenceType: "JOB_COMMISSION", referenceId: job.id, status: "COMPLETED" },
    select: { id: true, amount: true },
  })
  if (existing) {
    return { ok: true, charged: money(existing.amount), rate: 0, alreadyCharged: true }
  }

  const profile = await db.providerProfile.findUnique({
    where: { id: input.providerProfileId },
    select: { completedJobs: true },
  })
  const rate = await getEffectiveCommissionRate("PROVIDER", profile?.completedJobs ?? 0)
  const gross = Number(job.price)
  const { commissionAmount } = splitByCommission(gross, rate)

  // Nothing to charge on a free job, and a zero movement would only clutter
  // the statement they read to understand the figure.
  if (commissionAmount <= 0) return { ok: true, charged: 0, rate }

  try {
    await db.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId: input.providerUserId },
        update: {},
        create: { userId: input.providerUserId },
      })
      const before = Number(wallet.balance)
      const after = Number((before - commissionAmount).toFixed(2))

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: after } })
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "DEBIT",
          amount: commissionAmount,
          description: "Commission on " + job.title,
          referenceType: "JOB_COMMISSION",
          referenceId: job.id,
          status: "COMPLETED",
          balanceBefore: before,
          balanceAfter: after,
        },
      })
      // The platform earned this when the job was taken, which is the moment
      // being recorded, so the revenue figures agree with the wallet.
      await tx.platformRevenue.create({
        data: {
          role: "PROVIDER",
          sourceType: "JOB",
          sourceId: job.id,
          userId: input.providerUserId,
          grossAmount: D(gross),
          rate,
          commissionAmount: D(commissionAmount),
          payoutAmount: D(Number((gross - commissionAmount).toFixed(2))),
        },
      })
    }, { timeout: 30000, maxWait: 10000 })

    return { ok: true, charged: commissionAmount, rate }
  } catch {
    return { ok: false, error: "The commission could not be recorded. Nothing was changed." }
  }
}

/**
 * Take it back off, because the job did not happen.
 *
 * A reversal rather than a deletion: the charge and its undoing both stay on
 * the statement, so a provider questioning their balance can follow it
 * instead of finding a row that silently vanished. The platform revenue row
 * goes, since no revenue was earned, and leaving it would overstate takings.
 */
export async function reverseCommissionDebt(jobId: string): Promise<{ ok: true; reversed: number }> {
  const charge = await db.transaction.findFirst({
    where: { referenceType: "JOB_COMMISSION", referenceId: jobId, status: "COMPLETED" },
    select: { id: true, walletId: true, amount: true },
  })
  if (!charge) return { ok: true, reversed: 0 }

  const already = await db.transaction.findFirst({
    where: { referenceType: "JOB_COMMISSION_REVERSAL", referenceId: jobId },
    select: { id: true },
  })
  if (already) return { ok: true, reversed: 0 }

  const amount = money(charge.amount)
  try {
    await db.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { id: charge.walletId } })
      if (!wallet) return
      const before = Number(wallet.balance)
      const after = Number((before + amount).toFixed(2))

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: after } })
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount,
          description: "Commission returned, job cancelled",
          referenceType: "JOB_COMMISSION_REVERSAL",
          referenceId: jobId,
          status: "COMPLETED",
          balanceBefore: before,
          balanceAfter: after,
        },
      })
      await tx.platformRevenue.deleteMany({ where: { sourceType: "JOB", sourceId: jobId } })
    }, { timeout: 30000, maxWait: 10000 })
    return { ok: true, reversed: amount }
  } catch {
    return { ok: true, reversed: 0 }
  }
}

/**
 * Settle what is owed, in whole or in part.
 *
 * Takes money that has already arrived; it does not collect it. Whatever
 * route the provider used, the payment lands here once and credits the
 * wallet, and the debt is simply the balance climbing back towards zero.
 */
export async function settleCommissionDebt(input: {
  userId: string
  amount: number
  method: string
  reference?: string | null
}): Promise<{ ok: true; owedAfter: number } | { ok: false; error: string }> {
  if (!(input.amount > 0)) return { ok: false, error: "Enter how much is being paid." }

  await db.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId: input.userId },
      update: {},
      create: { userId: input.userId },
    })
    const before = Number(wallet.balance)
    const after = Number((before + input.amount).toFixed(2))

    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: after } })
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount: input.amount,
        description: "Commission settled by " + input.method,
        referenceType: "COMMISSION_SETTLEMENT",
        referenceId: input.reference ?? null,
        status: "COMPLETED",
        balanceBefore: before,
        balanceAfter: after,
      },
    })
  }, { timeout: 30000, maxWait: 10000 })

  const state = await debtStateOf(input.userId)
  return { ok: true, owedAfter: state.owed }
}
