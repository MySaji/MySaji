// Shared Gap 6 policy engine — called from both cancelMyJob
// (lib/actions/jobs.ts, customer self-cancels) and reportNoShow
// (lib/actions/provider-jobs.ts, provider reports a no-show): the exact
// same money movement either way, just a different trigger and
// cancellationReason. Not a "use server" file — same reasoning as
// lib/order-cancellation.ts, which this mirrors: a shared helper imported
// by two different "use server" action files can't itself be one.
import { db } from "@/backend/db"
import { getEffectivePlatformPreferences } from "@/backend/actions/admin-settings"
import { reverseCommissionDebt } from "@/backend/services/commission-debt"
import { logJobEvent } from "@/backend/actions/job-events"

export type JobCancellationReason = "EARLY_CANCELLATION" | "LATE_CANCELLATION" | "NO_SHOW"

export type JobCancellationResult =
  | { success: true; refundAmount: number; feeAmount: number; jobTitle: string; customerId: string; providerUserId: string | null }
  | { success: false; error: string }

const CANCELLABLE_STATUSES = ["PENDING", "ACCEPTED"] as const

// Thrown inside the transaction (and caught right below it) when the
// guarded status update in resolveJobCancellation affects zero rows —
// i.e. someone else already resolved this job. Module-scoped so the catch
// block can distinguish "already resolved" from a genuine DB failure.
const ALREADY_RESOLVED = Symbol("job-already-resolved")

/**
 * Reverses a job's payment(s): >=2h before the scheduled time (
 * EARLY_CANCELLATION) is a full, fee-free refund. Within 2h
 * (LATE_CANCELLATION) or a reported NO_SHOW carves a fixed dispatch fee
 * out of the refund and pays it straight to the provider as compensation
 * for the trip — capped at whatever was actually paid, so a refund can
 * never go negative. Does not send notifications; callers know who
 * initiated this and message the other party accordingly (mirrors
 * reverseOrder's same division of responsibility).
 *
 * Gap 6 is the first place two different actors can race to resolve the
 * same job — a customer cancelling and a provider reporting a no-show can
 * both be valid (job ACCEPTED, past its scheduled time) at the same
 * moment. The status transition below is a guarded updateMany, not a
 * plain update, specifically so only one of two near-simultaneous calls
 * can ever move money for a given job.
 */
export async function resolveJobCancellation(
  jobId: string,
  opts: { reason: JobCancellationReason },
): Promise<JobCancellationResult> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { payments: { where: { status: "COMPLETED" } }, provider: true },
  })
  if (!job) return { success: false, error: "Booking not found." }

  const totalPaid = job.payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const preferences = await getEffectivePlatformPreferences()
  // The fee compensates a provider for a wasted trip, so it only makes
  // sense once they've actually committed to the job — a still-PENDING
  // (unaccepted) booking cancelled late is a free refund either way.
  // NO_SHOW already implies ACCEPTED (reportNoShow's own precondition), so
  // this check covers both reasons without branching on which one it is.
  const feeApplies = opts.reason !== "EARLY_CANCELLATION" && job.providerId != null && job.status === "ACCEPTED"
  const feeAmount = feeApplies ? Math.min(preferences.cancellationDispatchFee, totalPaid) : 0
  const refundAmount = totalPaid - feeAmount

  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.job.updateMany({
        where: { id: job.id, status: { in: [...CANCELLABLE_STATUSES] } },
        data: { status: "CANCELLED", cancellationReason: opts.reason },
      })
      if (count === 0) throw ALREADY_RESOLVED

      for (const payment of job.payments) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAt: new Date() } })
      }

      if (refundAmount > 0) {
        const wallet = await tx.wallet.upsert({ where: { userId: job.customerId }, update: {}, create: { userId: job.customerId } })
        const before = Number(wallet.balance)
        const after = before + refundAmount
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: after } })
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: "REFUND",
            amount: refundAmount,
            description: `Refund for cancelled booking: ${job.title}`,
            referenceType: "JOB",
            referenceId: job.id,
            status: "COMPLETED",
            balanceBefore: before,
            balanceAfter: after,
          },
        })
      }

      if (feeAmount > 0 && job.provider) {
        const providerWallet = await tx.wallet.upsert({ where: { userId: job.provider.userId }, update: {}, create: { userId: job.provider.userId } })
        const before = Number(providerWallet.balance)
        const after = before + feeAmount
        await tx.wallet.update({ where: { id: providerWallet.id }, data: { balance: after, totalEarned: { increment: feeAmount } } })
        await tx.transaction.create({
          data: {
            walletId: providerWallet.id,
            type: "CREDIT",
            amount: feeAmount,
            description: opts.reason === "NO_SHOW" ? `Dispatch fee, customer no-show: ${job.title}` : `Dispatch fee, late cancellation: ${job.title}`,
            referenceType: "JOB",
            referenceId: job.id,
            status: "COMPLETED",
            balanceBefore: before,
            balanceAfter: after,
          },
        })
      }
    }, { timeout: 20000, maxWait: 10000 })
  } catch (err) {
    if (err === ALREADY_RESOLVED) return { success: false, error: "This booking has already been resolved." }
    console.error("resolveJobCancellation transaction failed:", err)
    return { success: false, error: "Something went wrong. Please try again." }
  }

  // The platform's commission goes back with it. A job that did not happen
  // earned nothing, and leaving the charge on the provider would have them
  // paying for a cancellation they may not have caused. Outside the
  // transaction above and idempotent, so a failure here cannot undo a
  // cancellation the customer has already been told about.
  await reverseCommissionDebt(job.id)

  await logJobEvent({
    jobId: job.id, type: "JOB_CANCELLED", actor: opts.reason === "NO_SHOW" ? "PROVIDER" : "SYSTEM",
    description: opts.reason === "NO_SHOW" ? "Job cancelled, customer no-show reported" : `Job cancelled (${opts.reason.toLowerCase().replace("_", " ")})`,
    metadata: { reason: opts.reason, refundAmount, feeAmount },
  })

  return { success: true, refundAmount, feeAmount, jobTitle: job.title, customerId: job.customerId, providerUserId: job.provider?.userId ?? null }
}
