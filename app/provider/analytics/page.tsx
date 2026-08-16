"use client"

import { useEffect, useState } from "react"
import { DollarSign, Users, Briefcase, Star, Clock, ArrowUpRight, ArrowDownRight, BarChart3, PieChart as PieChartIcon, Loader2, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { getProviderAnalytics, type AnalyticsPeriod, type ProviderAnalytics } from "@/lib/actions/provider-analytics"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function AnalyticsPage() {
  const { t, formatMoney } = useLocalization()
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d")
  const [isLoading, setIsLoading] = useState(true)
  const [analytics, setAnalytics] = useState<ProviderAnalytics>(null)

  useEffect(() => {
    setIsLoading(true)
    getProviderAnalytics(period).then(setAnalytics).finally(() => setIsLoading(false))
  }, [period])

  if (isLoading || !analytics) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const maxVal = Math.max(...analytics.revenueTrend.map((d) => d.value), 1)
  const peakMax = Math.max(...analytics.peakHours.map((h) => h.jobs), 1)

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("provider.analytics.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("provider.analytics.subtitle")}</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {(["7d", "30d", "90d", "12m"] as AnalyticsPeriod[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {p === "7d" ? t("provider.analytics.period7d") : p === "30d" ? t("provider.analytics.period30d") : p === "90d" ? t("provider.analytics.period90d") : t("provider.analytics.period12m")}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 border border-border rounded-xl">
          <div className="flex items-start justify-between mb-2">
            <div className="p-2 rounded-lg bg-primary/10"><DollarSign className="w-4 h-4 text-primary" /></div>
            <span className={`text-[11px] font-medium flex items-center gap-0.5 ${analytics.revenueGrowthPct >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {analytics.revenueGrowthPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {analytics.revenueGrowthPct >= 0 ? "+" : ""}{analytics.revenueGrowthPct}%
            </span>
          </div>
          <p className="text-xl font-bold text-foreground">{formatMoney(analytics.totalRevenue)}</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.analytics.statTotalRevenue")}</p>
        </Card>
        <Card className="p-4 border border-border rounded-xl">
          <div className="flex items-start justify-between mb-2">
            <div className="p-2 rounded-lg bg-primary/10"><Briefcase className="w-4 h-4 text-primary" /></div>
            <span className={`text-[11px] font-medium flex items-center gap-0.5 ${analytics.jobsGrowthPct >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {analytics.jobsGrowthPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {analytics.jobsGrowthPct >= 0 ? "+" : ""}{analytics.jobsGrowthPct}%
            </span>
          </div>
          <p className="text-xl font-bold text-foreground">{analytics.jobsCompleted}</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.analytics.statJobsCompleted")}</p>
        </Card>
        <Card className="p-4 border border-border rounded-xl">
          <div className="p-2 rounded-lg bg-primary/10 w-fit mb-2"><Star className="w-4 h-4 text-primary" /></div>
          <p className="text-xl font-bold text-foreground">{analytics.avgRating.toFixed(1)}</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.analytics.statAvgRating")}</p>
        </Card>
        <Card className="p-4 border border-border rounded-xl">
          <div className="p-2 rounded-lg bg-primary/10 w-fit mb-2"><Users className="w-4 h-4 text-primary" /></div>
          <p className="text-xl font-bold text-foreground">{analytics.repeatClientPct}%</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.analytics.statRepeatClients")}</p>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card className="p-4 border border-border rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />{t("provider.analytics.revenueTrendTitle")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("provider.analytics.revenueTrendSubtitle")}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-foreground">{formatMoney(analytics.totalRevenue)}</p>
            <p className={`text-xs font-medium ${analytics.revenueGrowthPct >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {analytics.revenueGrowthPct >= 0 ? "+" : ""}{analytics.revenueGrowthPct}% {t("provider.analytics.vsPrevious")}
            </p>
          </div>
        </div>
        {analytics.revenueTrend.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">{t("provider.analytics.noJobsThisPeriod")}</div>
        ) : (
          <>
            <div className="flex items-end gap-1 h-40">
              {analytics.revenueTrend.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-primary/80 rounded-t-sm hover:bg-primary transition-colors min-h-[2px]" style={{ height: `${(d.value / maxVal) * 100}%` }} title={formatMoney(d.value)} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-muted-foreground">{analytics.revenueTrend[0]?.label}</span>
              <span className="text-[10px] text-muted-foreground">{analytics.revenueTrend[analytics.revenueTrend.length - 1]?.label}</span>
            </div>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Jobs by Category */}
        <Card className="p-4 border border-border rounded-xl">
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4"><PieChartIcon className="w-4 h-4 text-primary" />{t("provider.analytics.jobsByCategoryTitle")}</h3>
          {analytics.jobsByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("provider.analytics.noJobsThisPeriod")}</p>
          ) : (
            <div className="space-y-3">
              {analytics.jobsByCategory.map((cat) => (
                <div key={cat.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground font-medium">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">{t("provider.analytics.jobsCountPct", { count: cat.count, pct: cat.pct })}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${cat.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Peak Hours */}
        <Card className="p-4 border border-border rounded-xl">
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4"><Clock className="w-4 h-4 text-primary" />{t("provider.analytics.peakHoursTitle")}</h3>
          <div className="space-y-2">
            {analytics.peakHours.map((h) => (
              <div key={h.hour} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16">{h.hour}</span>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all flex items-center justify-end pr-2" style={{ width: `${(h.jobs / peakMax) * 100}%` }}>
                    {h.jobs > 0 && <span className="text-[10px] font-bold text-accent-foreground">{h.jobs}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Top Customers */}
      <Card className="p-4 border border-border rounded-xl">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4"><Users className="w-4 h-4 text-primary" />{t("provider.analytics.topCustomersTitle")}</h3>
        {analytics.topCustomers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("provider.analytics.noJobsThisPeriod")}</p>
        ) : (
          <div className="space-y-3">
            {analytics.topCustomers.map((cust, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{cust.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{cust.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t("provider.analytics.customerJobsLast", { jobs: cust.jobs, date: new Date(cust.lastJobAt).toLocaleDateString() })}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground">{formatMoney(cust.spent)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Response & Completion Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 border border-border rounded-xl text-center">
          <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{analytics.avgResponseMinutes < 60 ? t("provider.analytics.minutesShort", { min: analytics.avgResponseMinutes }) : t("provider.analytics.hoursShort", { hr: (analytics.avgResponseMinutes / 60).toFixed(1) })}</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.analytics.avgResponseTime")}</p>
        </Card>
        <Card className="p-4 border border-border rounded-xl text-center">
          <CheckCircle2 className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{analytics.completionRatePct}%</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.analytics.completionRate")}</p>
        </Card>
      </div>
    </div>
  )
}
