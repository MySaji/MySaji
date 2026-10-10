"use server"

import { db } from "@/backend/db"
import { requireSecretary } from "@/backend/actions/secretary-dashboard"

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const METHOD_LABEL: Record<string, string> = { MPESA: "M-Pesa", CARD: "Card", BANK: "Bank Transfer", PAYPAL: "PayPal" }

function deriveMethod(payment: { paymentMethod: { type: string } | null; externalRef: string | null; contextType: string }): string {
  if (payment.paymentMethod) return METHOD_LABEL[payment.paymentMethod.type] ?? payment.paymentMethod.type
  const ref = payment.externalRef ?? ""
  if (ref.startsWith("mpesa") || ref.startsWith("ws_CO_")) return "M-Pesa"
  if (ref.startsWith("cs_") || ref.startsWith("stripe")) return "Stripe"
  if (ref.toLowerCase().includes("paypal")) return "PayPal"
  if (payment.contextType === "ORDER") return "Wallet"
  return "Other"
}

export type SecretaryAnalytics = {
  channelBreakdown: { name: string; value: number; amount: number }[]
  weeklyVolume: { day: string; transactions: number; volume: number }[]
  metrics: { totalTransactions: number; transactionVolume: number; avgTransaction: number; successRatePct: number }
  topAccounts: { id: string; name: string; role: string; earnings: number }[]
}

export async function getSecretaryAnalytics(): Promise<SecretaryAnalytics | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)

  const [allChannelPayments, weekPayments, statusCounts, allTimeAgg, topWallets] = await Promise.all([
    db.payment.findMany({
      where: { status: "COMPLETED" },
      select: { amount: true, contextType: true, externalRef: true, paymentMethod: { select: { type: true } } },
      take: 500,
      orderBy: { paidAt: "desc" },
    }),
    db.payment.findMany({ where: { status: "COMPLETED", paidAt: { gte: sevenDaysAgo } }, select: { amount: true, paidAt: true } }),
    db.payment.groupBy({ by: ["status"], _count: true }),
    db.payment.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true } }),
    db.wallet.findMany({
      where: { totalEarned: { gt: 0 } },
      orderBy: { totalEarned: "desc" },
      take: 5,
      include: { user: { select: { name: true, role: true } } },
    }),
  ])

  const channelTotals = new Map<string, number>()
  for (const p of allChannelPayments) {
    const method = deriveMethod(p)
    channelTotals.set(method, (channelTotals.get(method) ?? 0) + Number(p.amount))
  }
  const grandTotal = Array.from(channelTotals.values()).reduce((a, b) => a + b, 0)
  const channelBreakdown = Array.from(channelTotals.entries())
    .map(([name, amount]) => ({ name, amount, value: grandTotal > 0 ? Math.round((amount / grandTotal) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount)

  const weekBuckets = new Map<string, { transactions: number; volume: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    weekBuckets.set(d.toDateString(), { transactions: 0, volume: 0 })
  }
  for (const p of weekPayments) {
    if (!p.paidAt) continue
    const key = p.paidAt.toDateString()
    const bucket = weekBuckets.get(key)
    if (bucket) { bucket.transactions += 1; bucket.volume += Number(p.amount) }
  }
  const weeklyVolume = Array.from(weekBuckets.entries()).map(([dateStr, b]) => ({
    day: DAY_NAMES[new Date(dateStr).getDay()],
    transactions: b.transactions,
    volume: b.volume,
  }))

  const countByStatus: Record<string, number> = {}
  for (const s of statusCounts) countByStatus[s.status] = s._count
  const completed = countByStatus["COMPLETED"] ?? 0
  const failed = countByStatus["FAILED"] ?? 0
  const totalTransactions = Object.values(countByStatus).reduce((a, b) => a + b, 0)
  const transactionVolume = Number(allTimeAgg._sum.amount ?? 0)

  const topAccounts = topWallets.map((w) => ({
    id: w.id,
    name: w.user.name,
    role: w.user.role,
    earnings: Number(w.totalEarned),
  }))

  return {
    channelBreakdown,
    weeklyVolume,
    metrics: {
      totalTransactions,
      transactionVolume,
      avgTransaction: completed > 0 ? Math.round(transactionVolume / completed) : 0,
      successRatePct: completed + failed > 0 ? Math.round((completed / (completed + failed)) * 1000) / 10 : 100,
    },
    topAccounts,
  }
}

// ============================= REVENUE TREND (period-filterable) ==========================
// Split out from getSecretaryAnalytics() for the same reason as the admin
// dashboard's equivalent split — switching this chart's time range shouldn't
// re-fetch the channel breakdown / weekly volume / top accounts widgets,
// which don't depend on it.

export type SecretaryRevenueQuery = { year: number; month?: number }

export type SecretaryRevenueTrend = {
  chart: { label: string; revenue: number }[]
  periodLabel: string
}

/** `month` is 0-11 and optional — omitted means the whole year (bucketed
 * by month); given means that specific calendar month (bucketed by day).
 * Both are explicitly-chosen calendar periods (any year back to 1990). */
export async function getSecretaryRevenueTrend(query: SecretaryRevenueQuery): Promise<SecretaryRevenueTrend | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null

  const { year, month } = query
  let start: Date, end: Date, periodLabel: string
  let buckets: { key: string; label: string }[]

  if (month === undefined) {
    start = new Date(year, 0, 1)
    end = new Date(year + 1, 0, 1)
    buckets = Array.from({ length: 12 }, (_, i) => ({ key: `${year}-${i}`, label: MONTH_NAMES[i] }))
    periodLabel = String(year)
  } else {
    start = new Date(year, month, 1)
    end = new Date(year, month + 1, 1)
    const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86400000)
    buckets = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i)
      return { key: d.toDateString(), label: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}` }
    })
    const fullMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    periodLabel = `${fullMonthNames[month]} ${year}`
  }

  const keyFor = (d: Date) => (month === undefined ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString())

  const payments = await db.payment.findMany({
    where: { status: "COMPLETED", paidAt: { gte: start, lt: end } },
    select: { amount: true, paidAt: true },
  })

  const bucketMap = new Map(buckets.map((b) => [b.key, 0]))
  for (const p of payments) {
    if (!p.paidAt) continue
    const key = keyFor(p.paidAt)
    if (bucketMap.has(key)) bucketMap.set(key, (bucketMap.get(key) ?? 0) + Number(p.amount))
  }

  const chart = buckets.map((b) => ({ label: b.label, revenue: Math.round(bucketMap.get(b.key) ?? 0) }))
  return { chart, periodLabel }
}
