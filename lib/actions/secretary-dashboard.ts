"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function requireSecretary(): Promise<{ userId: string; name: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "secretary") return null
  return { userId: session.user.id, name: session.user.name ?? "Secretary" }
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export type SecretaryRecentTransaction = {
  id: string
  description: string
  amount: number
  type: string
  status: string
  date: string
}

export type SecretaryWalletBucket = {
  role: string
  totalBalance: number
  walletCount: number
  discrepancyCount: number
}

export type SecretaryDashboardData = {
  totalProcessed: number
  totalProcessedGrowthPct: number
  pendingCount: number
  pendingChange: number
  completedCount: number
  completedGrowthPct: number
  thisMonth: number
  thisMonthGrowthPct: number
  recentTransactions: SecretaryRecentTransaction[]
  walletBuckets: SecretaryWalletBucket[]
} | null

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Customer Wallets", PROVIDER: "Provider Wallets", SHOPKEEPER: "Shopkeeper Wallets", DISTRIBUTOR: "Distributor Wallets", AGENT: "Agent Wallets",
}

export async function getSecretaryDashboard(): Promise<SecretaryDashboardData> {
  const secretary = await requireSecretary()
  if (!secretary) return null

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const startOfWeek = new Date(now.getTime() - 7 * 86400000)
  const startOfPrevWeek = new Date(now.getTime() - 14 * 86400000)

  const [
    allTimeAgg,
    thisMonthAgg, lastMonthAgg,
    completedCount, completedCountLastWeek,
    pendingWithdrawals, pendingWithdrawalsPrevWeek,
    recentTxns,
    walletsByRole,
  ] = await Promise.all([
    db.payment.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: "COMPLETED", paidAt: { gte: startOfThisMonth } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: "COMPLETED", paidAt: { gte: startOfLastMonth, lt: startOfThisMonth } }, _sum: { amount: true } }),
    db.payment.count({ where: { status: "COMPLETED" } }),
    db.payment.count({ where: { status: "COMPLETED", paidAt: { gte: startOfPrevWeek, lt: startOfWeek } } }),
    db.withdrawalRequest.count({ where: { status: "PENDING" } }),
    db.withdrawalRequest.count({ where: { status: "PENDING", createdAt: { lt: startOfWeek } } }),
    db.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { wallet: { include: { user: true } } } }),
    db.wallet.findMany({
      include: { user: { select: { role: true } }, transactions: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ])

  const recentTransactions: SecretaryRecentTransaction[] = recentTxns.map((t) => ({
    id: t.id,
    description: `${t.description}, ${t.wallet.user.name}`,
    amount: Number(t.amount),
    type: t.type,
    status: t.status,
    date: t.createdAt.toISOString(),
  }))

  const bucketMap = new Map<string, { totalBalance: number; walletCount: number; discrepancyCount: number }>()
  for (const w of walletsByRole) {
    const role = w.user.role
    if (!["CUSTOMER", "PROVIDER", "SHOPKEEPER", "DISTRIBUTOR", "AGENT"].includes(role)) continue
    const bucket = bucketMap.get(role) ?? { totalBalance: 0, walletCount: 0, discrepancyCount: 0 }
    bucket.totalBalance += Number(w.balance)
    bucket.walletCount += 1
    const lastTxn = w.transactions[0]
    if (lastTxn && Number(lastTxn.balanceAfter) !== Number(w.balance)) bucket.discrepancyCount += 1
    bucketMap.set(role, bucket)
  }
  const walletBuckets: SecretaryWalletBucket[] = Array.from(bucketMap.entries()).map(([role, b]) => ({
    role: ROLE_LABEL[role] ?? role,
    ...b,
  }))

  return {
    totalProcessed: Number(allTimeAgg._sum.amount ?? 0),
    totalProcessedGrowthPct: pctChange(Number(thisMonthAgg._sum.amount ?? 0), Number(lastMonthAgg._sum.amount ?? 0)),
    pendingCount: pendingWithdrawals,
    pendingChange: pendingWithdrawals - pendingWithdrawalsPrevWeek,
    completedCount,
    completedGrowthPct: pctChange(completedCount, completedCountLastWeek),
    thisMonth: Number(thisMonthAgg._sum.amount ?? 0),
    thisMonthGrowthPct: pctChange(Number(thisMonthAgg._sum.amount ?? 0), Number(lastMonthAgg._sum.amount ?? 0)),
    recentTransactions,
    walletBuckets,
  }
}
