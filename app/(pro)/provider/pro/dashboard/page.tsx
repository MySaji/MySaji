"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Eye, MessageSquare, Calendar, Wallet, ShieldAlert, X, Plus, Package, MapPin, FileText, Upload, Rocket,
  ChevronRight, TrendingUp, Star, Loader2, ClipboardCheck, UploadCloud, Sparkles,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { getProDashboardOverview, type ProDashboardOverview } from "@/lib/actions/provider-pro-dashboard"
import { getMySubscriptionStatus, type ProviderSubscriptionStatus } from "@/lib/actions/provider-subscription"
import { useLocalization } from "@/lib/hooks/useLocalization"

const OFFER_STATUS_STYLE: Record<string, { label: string; className: string }> = {
  LIVE: { label: "LIVE", className: "bg-emerald-500 text-white" },
  UNDER_REVIEW: { label: "UNDER REVIEW", className: "bg-amber-500 text-white" },
  DRAFT: { label: "DRAFT", className: "bg-slate-500 text-white" },
}

const OFFER_ACTION_BY_STATUS: Record<string, { label: string; variant: "default" | "outline" }> = {
  LIVE: { label: "Manage Offer", variant: "default" },
  UNDER_REVIEW: { label: "View Status", variant: "outline" },
  DRAFT: { label: "Continue Setup", variant: "outline" },
}

const ACTIVITY_ICON: Record<string, typeof Calendar> = {
  booking: Calendar,
  rental: Package,
  review: Star,
  payment: Wallet,
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-medium ${pct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
      {pct >= 0 ? "+" : ""}{pct}% this week <TrendingUp className={`h-3 w-3 ${pct < 0 ? "rotate-180" : ""}`} />
    </span>
  )
}

export default function ProDashboardPage() {
  const { formatMoney } = useLocalization()
  const router = useRouter()
  const [overview, setOverview] = useState<ProDashboardOverview>(null)
  const [subscription, setSubscription] = useState<ProviderSubscriptionStatus>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showVerifyBanner, setShowVerifyBanner] = useState(true)

  useEffect(() => {
    Promise.all([getProDashboardOverview(), getMySubscriptionStatus()])
      .then(([o, s]) => { setOverview(o); setSubscription(s) })
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading || !overview) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  if (!subscription?.isPro) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <Rocket className="h-10 w-10 text-amber-500" />
        <p className="text-base font-semibold text-foreground">This dashboard is a Saji Pro feature</p>
        <p className="max-w-sm text-xs text-muted-foreground">Subscribe to Saji Pro to unlock the full offers dashboard, performance overview, and growth tools.</p>
        <Button asChild className="rounded-xl"><Link href="/provider/pro">See Saji Pro</Link></Button>
      </div>
    )
  }

  const firstName = overview.name.split(" ")[0]

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      {/* Welcome header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Welcome back, {firstName}! 👋</h1>
          <p className="text-xs text-muted-foreground mt-1">Manage your offers, bookings and grow your business.</p>
        </div>
        <Button asChild className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700">
          <Link href="/provider/offers"><Plus className="h-4 w-4" /> Create an Offer</Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 p-4 shadow-sm min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground truncate"><Eye className="h-4 w-4 text-emerald-600 flex-shrink-0" /> Profile views</div>
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">{overview.profileViews.toLocaleString()}</p>
        </Card>
        <Card className="border-0 p-4 shadow-sm min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground truncate"><MessageSquare className="h-4 w-4 text-sky-600 flex-shrink-0" /> Requests</div>
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">{overview.requests.value}</p>
          <TrendBadge pct={overview.requests.changePct} />
        </Card>
        <Card className="border-0 p-4 shadow-sm min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground truncate"><Calendar className="h-4 w-4 text-amber-600 flex-shrink-0" /> Bookings</div>
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">{overview.bookings.value}</p>
          <TrendBadge pct={overview.bookings.changePct} />
        </Card>
        <Card className="border-0 p-4 shadow-sm min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground truncate"><Wallet className="h-4 w-4 text-emerald-600 flex-shrink-0" /> Earnings</div>
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">{formatMoney(overview.earnings.value)}</p>
          <TrendBadge pct={overview.earnings.changePct} />
        </Card>
      </div>

      {/* Verification banner */}
      {!overview.isVerified && showVerifyBanner && (
        <Card className="border-0 border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-900/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-foreground">Complete your verification</p>
                <p className="text-xs text-muted-foreground">Get verified to build trust and get more bookings.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button asChild size="sm" variant="outline" className="rounded-lg border-amber-400 text-amber-700 hover:bg-amber-100 bg-transparent dark:text-amber-400"><Link href="/provider/profile/verification">Continue Verification</Link></Button>
              <button onClick={() => setShowVerifyBanner(false)} aria-label="Dismiss" className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </div>
        </Card>
      )}

      {/* My Offers */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">My Offers</h2>
          <Link href="/provider/offers" className="text-xs font-medium text-emerald-600 hover:underline">View all offers</Link>
        </div>
        {overview.offers.length === 0 ? (
          <Card className="border-dashed p-8 text-center">
            <p className="text-xs text-muted-foreground">No offers yet. Create one to start appearing in discovery.</p>
            <Button asChild size="sm" className="mt-3 rounded-xl"><Link href="/provider/offers">Create an Offer</Link></Button>
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {overview.offers.slice(0, 8).map((offer) => {
              const statusStyle = OFFER_STATUS_STYLE[offer.status]
              const action = OFFER_ACTION_BY_STATUS[offer.status]
              return (
                <Card key={offer.id} className="w-64 flex-shrink-0 overflow-hidden border-0 shadow-sm">
                  <div className="relative aspect-[4/3] bg-muted">
                    {offer.image ? <img src={offer.image} alt={offer.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">No Image</div>}
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyle.className}`}>{statusStyle.label}</span>
                  </div>
                  <div className="p-3">
                    <h3 className="truncate font-semibold text-foreground">{offer.title}</h3>
                    <p className="truncate text-[11px] text-muted-foreground">{offer.categoryName ?? "—"}</p>
                    <p className="mt-1 text-xs font-bold text-foreground">{offer.price != null ? <>From {formatMoney(offer.price)}</> : "Request Quote"}</p>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] text-muted-foreground">
                      <div><p className="font-semibold text-foreground">{offer.viewCount}</p>Views</div>
                      <div><p className="font-semibold text-foreground">{offer.requestCount}</p>Requests</div>
                      <div><p className="font-semibold text-foreground">{offer.bookingCount}</p>Bookings</div>
                    </div>
                    <Button size="sm" variant={action.variant} className="mt-3 w-full rounded-lg" onClick={() => router.push("/provider/offers")}>{action.label}</Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick Actions */}
        <Card className="border-0 p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-foreground">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Plus, label: "Create an Offer", href: "/provider/offers", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
              { icon: Package, label: "Add Rental", href: "/provider/rentals", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
              { icon: MapPin, label: "Add Service Area", href: "/provider/profile/skills", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
              { icon: FileText, label: "Create Quote", href: "/provider/quotes", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
              { icon: Upload, label: "Upload Work", href: "/provider/portfolio", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
              { icon: Rocket, label: "Promote Profile", href: "/provider/pro", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
            ].map((action) => (
              <Link key={action.label} href={action.href} className="flex flex-col items-center gap-2 text-center">
                <div className={`flex h-11 w-11 items-center justify-center rounded-full ${action.color}`}><action.icon className="h-5 w-5" /></div>
                <span className="text-[11px] text-muted-foreground">{action.label}</span>
              </Link>
            ))}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
            <Link href="/provider/jobs" className="text-xs font-medium text-emerald-600 hover:underline">View all</Link>
          </div>
          {overview.recentActivity.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nothing yet. Activity will show up here as customers interact with your offers.</p>
          ) : (
            <div className="space-y-3">
              {overview.recentActivity.map((item) => {
                const Icon = ACTIVITY_ICON[item.kind]
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">{item.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>
                    </div>
                    <span className="flex-shrink-0 text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Performance Overview */}
        <Card className="border-0 p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Performance Overview</h2>
            <span className="text-[11px] text-muted-foreground">This month</span>
          </div>
          <div className="h-52">
            {overview.chart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No data yet this month</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview.chart} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <Tooltip formatter={(value: number) => [formatMoney(value), "Earnings"]} labelFormatter={(v) => new Date(v).toLocaleDateString()} contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  <Area type="monotone" dataKey="earnings" stroke="#16a34a" strokeWidth={2.5} fillOpacity={1} fill="url(#colorEarnings)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border/50 pt-3 text-center">
            <div className="min-w-0"><p className="text-xs font-bold text-foreground truncate">{overview.monthStats.views}</p><p className="text-[10px] text-muted-foreground">Views</p></div>
            <div className="min-w-0"><p className="text-xs font-bold text-foreground truncate">{overview.monthStats.requests.value}</p><p className="text-[10px] text-muted-foreground">Requests</p></div>
            <div className="min-w-0"><p className="text-xs font-bold text-foreground truncate">{overview.monthStats.bookings.value}</p><p className="text-[10px] text-muted-foreground">Bookings</p></div>
            <div className="min-w-0"><p className="text-xs font-bold text-foreground truncate">{formatMoney(overview.monthStats.earnings.value)}</p><p className="text-[10px] text-muted-foreground">Earnings</p></div>
          </div>
        </Card>

        {/* Grow Your Business */}
        <Card className="border-0 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-foreground">Grow Your Business</h2>
          <div className="space-y-1">
            {[
              { icon: ClipboardCheck, title: "Add more offers", desc: "More offers = more visibility", href: "/provider/offers", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
              { icon: UploadCloud, title: "Upload more work", desc: "Show your skills and build trust", href: "/provider/portfolio", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
              { icon: Star, title: "Get verified", desc: "Verified profiles get 3x more bookings", href: "/provider/profile/verification", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
              { icon: Sparkles, title: "Promote your profile", desc: "Reach more customers in your area", href: "/provider/pro", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
            ].map((tip) => (
              <Link key={tip.title} href={tip.href} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted/60 transition-colors">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${tip.color}`}><tip.icon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{tip.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{tip.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
