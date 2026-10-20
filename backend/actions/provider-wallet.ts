"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { debtStateOf } from "@/backend/services/commission-debt"
import { requireVerified } from "@/backend/services/verification-gate"
import { encryptAccountNumber } from "@/backend/services/payment-method-crypto"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type ProviderWalletTransaction = {
  id: string
  type: "credit" | "debit"
  title: string
  amount: number
  date: string
  status: "completed" | "pending" | "failed" | "reversed"
}

export type ProviderEscrowJob = {
  id: string
  job: string
  client: string
  amount: number
  dueDate: string
}

export type ProviderWalletSummary = {
  balance: number
  /**
   * Commission owed to the platform, as a positive figure.
   *
   * Where the customer pays the provider directly, the platform's cut is a
   * debt rather than a deduction, so the wallet can sit below zero. Shown on
   * its own rather than left as a minus sign on the balance, because "you
   * owe 400" and "your balance is -400" are read very differently by
   * somebody deciding whether to take the next job.
   */
  commissionOwed: number
  commissionCap: number
  canAcceptWork: boolean
  commissionMessage: string | null
  available: number
  pending: number
  escrow: number
  thisMonth: number
  lastMonth: number
  jobsCompletedThisMonth: number
  transactions: ProviderWalletTransaction[]
  escrowJobs: ProviderEscrowJob[]
} | null

export async function getProviderWalletSummary(): Promise<ProviderWalletSummary> {
  const provider = await requireProvider()
  if (!provider) return null

  const wallet = await db.wallet.findUnique({
    where: { userId: provider.userId },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } },
  })
  if (!wallet) return null

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [thisMonthAgg, lastMonthAgg, jobsCompletedThisMonth, escrowJobsRaw] = await Promise.all([
    db.transaction.aggregate({ where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: startOfThisMonth } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } }, _sum: { amount: true } }),
    db.job.count({ where: { providerId: provider.providerId, status: "COMPLETED", completedAt: { gte: startOfThisMonth } } }),
    db.job.findMany({
      where: { providerId: provider.providerId, status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
      include: { customer: true },
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }),
  ])

  const escrowTotal = escrowJobsRaw.reduce((sum, j) => sum + Number(j.price), 0)

  const debt = await debtStateOf(provider.userId)

  return {
    balance: Number(wallet.balance),
    commissionOwed: debt.owed,
    commissionCap: debt.cap,
    canAcceptWork: debt.canAcceptWork,
    commissionMessage: debt.message,
    // Nothing to draw down while the balance is negative: what is there is
    // owed, not earned.
    available: Math.max(0, Number(wallet.balance) - Number(wallet.pendingBalance)),
    pending: Number(wallet.pendingBalance),
    escrow: escrowTotal,
    thisMonth: Number(thisMonthAgg._sum.amount ?? 0),
    lastMonth: Number(lastMonthAgg._sum.amount ?? 0),
    jobsCompletedThisMonth,
    transactions: wallet.transactions.map((t) => ({
      id: t.id,
      type: Number(t.amount) >= 0 ? "credit" : "debit",
      title: t.description,
      amount: Math.abs(Number(t.amount)),
      date: t.createdAt.toISOString(),
      status: t.status.toLowerCase() as "completed" | "pending" | "failed" | "reversed",
    })),
    escrowJobs: escrowJobsRaw.map((j) => ({
      id: j.id,
      job: j.title,
      client: j.customer.name,
      amount: Number(j.price),
      dueDate: j.scheduledDate.toISOString(),
    })),
  }
}

export type ProviderWalletActionResult = { success: true } | { success: false; error: string }

const METHOD_TO_DB: Record<string, "MPESA" | "CARD" | "BANK"> = {
  mpesa: "MPESA",
  airtel: "MPESA",
  bank: "BANK",
  card: "CARD",
}

const METHOD_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  airtel: "Airtel Money",
  bank: "Bank Transfer",
  card: "Card Payout",
}

const withdrawSchema = z.object({
  amount: z.number().positive("Enter an amount greater than zero").min(100, "Minimum withdrawal is KES 100"),
  method: z.enum(["mpesa", "airtel", "bank", "card"]),
  details: z.string().trim().min(1, "Please enter your withdrawal details"),
})

export async function requestProviderWithdrawal(input: unknown): Promise<ProviderWalletActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  // Progressive KYC: earnings accrue whatever the provider's status, but
  // taking them off the platform requires a verified identity — this is the
  // point the money becomes irreversible.
  const gate = await requireVerified("payout.receive")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = withdrawSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { amount, method, details } = parsed.data

  const wallet = await db.wallet.findUnique({ where: { userId: provider.userId } })
  if (!wallet) return { success: false, error: "Wallet not found." }

  const available = Number(wallet.balance) - Number(wallet.pendingBalance)
  if (amount > available) return { success: false, error: "Insufficient available balance." }

  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore - amount

  await db.$transaction([
    db.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter, pendingBalance: { increment: amount } } }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "PAYOUT",
        amount: -amount,
        description: `Withdrawal to ${METHOD_LABEL[method]}`,
        referenceType: "WITHDRAWAL",
        status: "PENDING",
        balanceBefore,
        balanceAfter,
      },
    }),
    db.withdrawalRequest.create({
      data: {
        userId: provider.userId,
        amount,
        method: METHOD_TO_DB[method],
        recipientDetails: {
          label: METHOD_LABEL[method],
          details,
          encryptedPhone: method === "mpesa" ? encryptAccountNumber(details) : null,
        },
        netAmount: amount,
      },
    }),
  ])

  return { success: true }
}
