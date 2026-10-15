import "server-only"
import { serialTransaction } from "@/backend/services/db-transaction"

export async function payWithWallet(input: { userId: string; amount: number; jobId?: string; providerId?: string }) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Invalid payment amount")
  return serialTransaction(async tx => {
    if (input.jobId) {
      const job = await tx.job.findUniqueOrThrow({ where: { id: input.jobId } })
      if (job.customerId !== input.userId) throw new Error("Job not found")
      const existing = await tx.payment.findFirst({ where: { jobId: job.id, status: "COMPLETED" } })
      if (existing) return existing
      if (job.status !== "PENDING_PAYMENT" || !job.price.equals(input.amount)) throw new Error("Job is not payable")
    }
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } })
    const debit = await tx.wallet.updateMany({ where: { id: wallet.id, balance: { gte: input.amount } }, data: { balance: { decrement: input.amount } } })
    if (debit.count !== 1) throw new Error("Insufficient wallet balance")
    const payment = await tx.payment.create({ data: { amount: input.amount, currency: "KES", status: "COMPLETED", contextType: input.jobId ? "JOB" : "SUBSCRIPTION", jobId: input.jobId, payerId: input.userId, paidAt: new Date(), settledAt: input.providerId ? new Date() : undefined } })
    await tx.transaction.create({ data: { walletId: wallet.id, type: "DEBIT", amount: -input.amount,
      description: input.jobId ? "Job payment" : "SAJI Pro subscription", referenceType: input.jobId ? "JOB" : "SUBSCRIPTION", referenceId: input.jobId ?? payment.id,
      status: "COMPLETED", balanceBefore: wallet.balance, balanceAfter: wallet.balance.minus(input.amount) } })
    if (input.providerId) {
      const subscription = await tx.providerSubscription.findUnique({ where: { providerId: input.providerId } })
      const now = new Date(), base = subscription?.currentPeriodEnd && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now
      const data = { status: "ACTIVE" as const, currentPeriodEnd: new Date(base.getTime() + 30 * 86400000), lastPaymentAmount: input.amount, lastPaymentAt: now }
      await tx.providerSubscription.upsert({ where: { providerId: input.providerId }, create: { providerId: input.providerId, ...data }, update: data })
    }
    return payment
  })
}
