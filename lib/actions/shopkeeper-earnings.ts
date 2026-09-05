"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireVerified } from "@/lib/verification-gate"
import { requireShopkeeper } from "@/lib/actions/shopkeeper-dashboard"
import { encryptAccountNumber } from "@/lib/payment-method-crypto"

export type ShopkeeperTransaction = {
  id: string
  type: "credit" | "debit"
  description: string
  amount: number
  date: string
  status: "completed" | "pending"
}

export type ShopkeeperEarningsSummary = {
  totalEarnings: number
  thisMonth: number
  available: number
  pending: number
  transactions: ShopkeeperTransaction[]
} | null

export async function getShopkeeperEarningsSummary(): Promise<ShopkeeperEarningsSummary> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return null

  const wallet = await db.wallet.findUnique({
    where: { userId: shopkeeper.userId },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } },
  })
  if (!wallet) return null

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const thisMonthAgg = await db.transaction.aggregate({
    where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: startOfThisMonth } },
    _sum: { amount: true },
  })

  return {
    totalEarnings: Number(wallet.totalEarned),
    thisMonth: Number(thisMonthAgg._sum.amount ?? 0),
    available: Number(wallet.balance) - Number(wallet.pendingBalance),
    pending: Number(wallet.pendingBalance),
    transactions: wallet.transactions.map((t) => ({
      id: t.id,
      type: Number(t.amount) >= 0 ? "credit" : "debit",
      description: t.description,
      amount: Math.abs(Number(t.amount)),
      date: t.createdAt.toISOString(),
      status: t.status === "PENDING" ? "pending" : "completed",
    })),
  }
}

export type ShopkeeperEarningsActionResult = { success: true } | { success: false; error: string }

const METHOD_TO_DB: Record<string, "MPESA" | "BANK" | "PAYPAL"> = {
  mpesa: "MPESA",
  bank: "BANK",
  paypal: "PAYPAL",
}

const METHOD_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  bank: "Bank Transfer",
  paypal: "PayPal",
}

const withdrawSchema = z.object({
  amount: z.number().positive("Enter an amount greater than zero").min(100, "Minimum withdrawal is KES 100"),
  method: z.enum(["mpesa", "bank", "paypal"]),
  details: z.string().trim().min(1, "Please enter your withdrawal details"),
})

export async function requestShopkeeperWithdrawal(input: unknown): Promise<ShopkeeperEarningsActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  // Progressive KYC: same rule as the provider payout — money may only
  // leave the platform to a verified account.
  const gate = await requireVerified("payout.receive")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = withdrawSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { amount, method, details } = parsed.data

  const wallet = await db.wallet.findUnique({ where: { userId: shopkeeper.userId } })
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
        userId: shopkeeper.userId,
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
