"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"

async function requireProviderProfile() {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id }, include: { user: true, category: true } })
  if (!profile) return null
  return { session, profile }
}

// Monday 00:00 of the week containing `date` — used for every "this week
// vs last week" comparison on this dashboard so all four stat cards use the
// same real week boundary rather than four slightly different windows.
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

export type ProDashboardStat = { value: number; changePct: number | null }

export type ProDashboardOffer = {
  id: string
  title: string
  categoryName: string | null
  image: string | null
  price: number | null
  status: "DRAFT" | "UNDER_REVIEW" | "LIVE"
  viewCount: number
  requestCount: number
  bookingCount: number
}

export type ProDashboardActivityItem = {
  id: string
  kind: "booking" | "rental" | "review" | "payment"
  title: string
  subtitle: string
  createdAt: string
}

export type ProDashboardChartPoint = { date: string; earnings: number }

export type ProDashboardOverview = {
  name: string
  businessName: string | null
  categoryName: string | null
  avatar: string | null
  rating: number
  reviewCount: number
  isVerified: boolean
  profileViews: number
  requests: ProDashboardStat
  bookings: ProDashboardStat
  earnings: ProDashboardStat
  offers: ProDashboardOffer[]
  recentActivity: ProDashboardActivityItem[]
  chart: ProDashboardChartPoint[]
  monthStats: {
    views: number
    requests: ProDashboardStat
    bookings: ProDashboardStat
    earnings: ProDashboardStat
  }
} | null

export async function getProDashboardOverview(): Promise<ProDashboardOverview> {
  const ctx = await requireProviderProfile()
  if (!ctx) return null
  const { session, profile } = ctx
  const providerId = profile.id

  const now = new Date()
  const thisWeekStart = startOfWeek(now)
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const wallet = await db.wallet.findUnique({ where: { userId: session.user.id } })

  const [
    offers, earningsThisWeekAgg, earningsLastWeekAgg, earningsThisMonthAgg, earningsLastMonthAgg, monthTx, recentTx,
    quotesThisWeek, quotesLastWeek, quotesThisMonth, quotesLastMonth,
    jobsThisWeek, jobsLastWeek, rentalsThisWeek, rentalsLastWeek, jobsThisMonth, jobsLastMonth, rentalsThisMonth, rentalsLastMonth,
    recentJobs, recentRentals, recentReviews,
  ] = await Promise.all([
    db.offer.findMany({ where: { providerId }, include: { category: true }, orderBy: { createdAt: "desc" } }),
    wallet ? db.transaction.aggregate({ where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: thisWeekStart } }, _sum: { amount: true } }) : null,
    wallet ? db.transaction.aggregate({ where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: lastWeekStart, lt: thisWeekStart } }, _sum: { amount: true } }) : null,
    wallet ? db.transaction.aggregate({ where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: thisMonthStart } }, _sum: { amount: true } }) : null,
    wallet ? db.transaction.aggregate({ where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: lastMonthStart, lt: thisMonthStart } }, _sum: { amount: true } }) : null,
    wallet ? db.transaction.findMany({ where: { walletId: wallet.id, type: "CREDIT", createdAt: { gte: thisMonthStart } }, orderBy: { createdAt: "asc" } }) : [],
    wallet ? db.transaction.findMany({ where: { walletId: wallet.id, type: "CREDIT" }, orderBy: { createdAt: "desc" }, take: 5 }) : [],
    db.quote.count({ where: { providerId, createdAt: { gte: thisWeekStart } } }),
    db.quote.count({ where: { providerId, createdAt: { gte: lastWeekStart, lt: thisWeekStart } } }),
    db.quote.count({ where: { providerId, createdAt: { gte: thisMonthStart } } }),
    db.quote.count({ where: { providerId, createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
    db.job.count({ where: { providerId, createdAt: { gte: thisWeekStart } } }),
    db.job.count({ where: { providerId, createdAt: { gte: lastWeekStart, lt: thisWeekStart } } }),
    db.rentalBooking.count({ where: { providerId, createdAt: { gte: thisWeekStart } } }),
    db.rentalBooking.count({ where: { providerId, createdAt: { gte: lastWeekStart, lt: thisWeekStart } } }),
    db.job.count({ where: { providerId, createdAt: { gte: thisMonthStart } } }),
    db.job.count({ where: { providerId, createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
    db.rentalBooking.count({ where: { providerId, createdAt: { gte: thisMonthStart } } }),
    db.rentalBooking.count({ where: { providerId, createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
    db.job.findMany({ where: { providerId }, orderBy: { createdAt: "desc" }, take: 5, include: { customer: true } }),
    db.rentalBooking.findMany({ where: { providerId }, orderBy: { createdAt: "desc" }, take: 5, include: { customer: true, offer: true } }),
    db.review.findMany({ where: { providerId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ])

  const earningsThisWeek = Number(earningsThisWeekAgg?._sum.amount ?? 0)
  const earningsLastWeek = Number(earningsLastWeekAgg?._sum.amount ?? 0)
  const earningsThisMonth = Number(earningsThisMonthAgg?._sum.amount ?? 0)
  const earningsLastMonth = Number(earningsLastMonthAgg?._sum.amount ?? 0)

  const bookingsThisWeek = jobsThisWeek + rentalsThisWeek
  const bookingsLastWeek = jobsLastWeek + rentalsLastWeek
  const bookingsThisMonth = jobsThisMonth + rentalsThisMonth
  const bookingsLastMonth = jobsLastMonth + rentalsLastMonth

  const profileViews = offers.reduce((sum, o) => sum + o.viewCount, 0)

  const recentActivity: ProDashboardActivityItem[] = [
    ...recentJobs.map((j) => ({ id: `job-${j.id}`, kind: "booking" as const, title: "New booking received", subtitle: j.title, createdAt: j.createdAt.toISOString() })),
    ...recentRentals.map((r) => ({ id: `rental-${r.id}`, kind: "rental" as const, title: "New rental booking", subtitle: r.offer.title, createdAt: r.createdAt.toISOString() })),
    ...recentReviews.map((r) => ({ id: `review-${r.id}`, kind: "review" as const, title: "New review received", subtitle: `★ ${r.rating.toFixed(1)}`, createdAt: r.createdAt.toISOString() })),
    ...recentTx.map((t) => ({ id: `tx-${t.id}`, kind: "payment" as const, title: "Payment received", subtitle: `KES ${Number(t.amount).toLocaleString()}`, createdAt: t.createdAt.toISOString() })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8)

  // Daily earnings for the current month, real wallet CREDIT transactions
  // bucketed by day — no interpolation, days with no earnings are 0.
  const chartMap = new Map<string, number>()
  for (const t of monthTx) {
    const key = t.createdAt.toISOString().slice(0, 10)
    chartMap.set(key, (chartMap.get(key) ?? 0) + Number(t.amount))
  }
  const chart: ProDashboardChartPoint[] = []
  for (let d = new Date(thisMonthStart); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    chart.push({ date: key, earnings: chartMap.get(key) ?? 0 })
  }

  return {
    name: profile.user.name,
    businessName: profile.businessName,
    categoryName: profile.category?.name ?? null,
    avatar: profile.user.image,
    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
    isVerified: session.user.kycStatus === "approved",
    profileViews,
    requests: { value: quotesThisWeek, changePct: pctChange(quotesThisWeek, quotesLastWeek) },
    bookings: { value: bookingsThisWeek, changePct: pctChange(bookingsThisWeek, bookingsLastWeek) },
    earnings: { value: earningsThisWeek, changePct: pctChange(earningsThisWeek, earningsLastWeek) },
    offers: offers.map((o) => ({
      id: o.id,
      title: o.title,
      categoryName: o.category?.name ?? null,
      image: o.images[0] ?? null,
      price: o.price != null ? Number(o.price) : null,
      status: o.status,
      viewCount: o.viewCount,
      requestCount: o.requestCount,
      bookingCount: o.bookingCount,
    })),
    recentActivity,
    chart,
    monthStats: {
      views: profileViews,
      requests: { value: quotesThisMonth, changePct: pctChange(quotesThisMonth, quotesLastMonth) },
      bookings: { value: bookingsThisMonth, changePct: pctChange(bookingsThisMonth, bookingsLastMonth) },
      earnings: { value: earningsThisMonth, changePct: pctChange(earningsThisMonth, earningsLastMonth) },
    },
  }
}
