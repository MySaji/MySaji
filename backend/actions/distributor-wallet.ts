"use server"

import { db } from "@/backend/db"
import { requireDistributor } from "@/backend/actions/distributor-dashboard"
import type { WalletPaymentMethod } from "@/backend/actions/wallet"

export type DistributorWalletTransaction = {
  id: string
  type: "credit" | "debit"
  description: string
  amount: number
  date: string
  status: "completed" | "pending"
}

export type DistributorWalletSummary = {
  balance: number
  currency: string
  totalEarnings: number
  thisMonth: number
  pending: number
  transactions: DistributorWalletTransaction[]
  paymentMethods: WalletPaymentMethod[]
} | null

const METHOD_TYPE_FROM_DB: Record<string, WalletPaymentMethod["type"]> = {
  MPESA: "mpesa",
  CARD: "card",
  PAYPAL: "paypal",
  BANK: "bank",
}

export async function getDistributorWalletSummary(): Promise<DistributorWalletSummary> {
  const distributor = await requireDistributor()
  if (!distributor) return null

  const [wallet, paymentMethods] = await Promise.all([
    db.wallet.findUnique({
      where: { userId: distributor.userId },
      include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    db.paymentMethod.findMany({ where: { userId: distributor.userId }, orderBy: { createdAt: "asc" } }),
  ])
  if (!wallet) return null

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const thisMonthAgg = await db.transaction.aggregate({
    where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: startOfThisMonth } },
    _sum: { amount: true },
  })

  return {
    balance: Number(wallet.balance),
    currency: wallet.currency,
    totalEarnings: Number(wallet.totalEarned),
    thisMonth: Number(thisMonthAgg._sum.amount ?? 0),
    pending: Number(wallet.pendingBalance),
    transactions: wallet.transactions.map((t) => ({
      id: t.id,
      type: Number(t.amount) >= 0 ? "credit" : "debit",
      description: t.description,
      amount: Math.abs(Number(t.amount)),
      date: t.createdAt.toISOString(),
      status: t.status === "PENDING" ? "pending" : "completed",
    })),
    paymentMethods: paymentMethods.map((p) => ({
      id: p.id,
      type: METHOD_TYPE_FROM_DB[p.type] ?? "card",
      name: p.provider ?? p.type,
      number: p.accountNumber,
      isDefault: p.isDefault,
    })),
  }
}
