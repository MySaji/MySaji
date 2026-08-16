"use client"
import { useState, useMemo } from "react"
import useSWR from "swr"
import {
  Users, Briefcase, CheckCircle, AlertTriangle, TrendingUp, TrendingDown,
  ArrowRight, Loader2
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getAdminDashboard, getAdminRevenue } from "@/lib/actions/admin-dashboard"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/lib/swr-utils"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { getYearOptions, MONTH_OPTIONS } from "@/lib/revenue-period-options"

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444"]

const ACTIVITY_ICON = { user: Users, job: Briefcase, completed: CheckCircle, dispute: AlertTriangle }
const ACTIVITY_COLOR = {
  user: "bg-blue-100 dark:bg-blue-900/30 text-blue-600",
  job: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600",
  completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600",
  dispute: "bg-red-100 dark:bg-red-900/30 text-red-600",
}

function formatRelative(
  iso: string,
  t: (key: "admin.dashboard.justNow") => string,
  tn: (baseKey: string, count: number) => string,
): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return t("admin.dashboard.justNow")
  if (mins < 60) return tn("admin.dashboard.minutesAgo", mins)
  const hours = Math.round(mins / 60)
  if (hours < 24) return tn("admin.dashboard.hoursAgo", hours)
  return tn("admin.dashboard.daysAgo", Math.round(hours / 24))
}

const CURRENT_YEAR = new Date().getFullYear()

export default function AdminDashboard() {
  const { t, tn, formatMoney } = useLocalization()
  const { data, isLoading } = useSWR("admin-dashboard", () => withTimeout(getAdminDashboard(), DASHBOARD_FETCH_TIMEOUT_MS))

  const yearOptions = useMemo(() => getYearOptions(), [])
  // Draft = what's selected in the pickers right now; applied = what's
  // actually being fetched/shown — kept separate so changing the dropdowns
  // doesn't fire a new query until "Apply" is clicked.
  const [draftYear, setDraftYear] = useState(CURRENT_YEAR)
  const [draftMonth, setDraftMonth] = useState<number | "">("")
  const [appliedYear, setAppliedYear] = useState(CURRENT_YEAR)
  const [appliedMonth, setAppliedMonth] = useState<number | undefined>(undefined)

  const { data: revenue, isLoading: revenueLoading } = useSWR(
    ["admin-revenue", appliedYear, appliedMonth],
    () => withTimeout(getAdminRevenue({ year: appliedYear, month: appliedMonth }), DASHBOARD_FETCH_TIMEOUT_MS),
  )

  const applyRevenueFilter = () => {
    setAppliedYear(draftYear)
    setAppliedMonth(draftMonth === "" ? undefined : draftMonth)
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const stats = [
    { icon: Users, label: t("admin.dashboard.totalUsers"), value: data.totalUsers.toLocaleString(), change: data.usersGrowthPct, color: "from-blue-50 to-blue-100", textColor: "text-blue-600" },
    { icon: Briefcase, label: t("admin.dashboard.activeJobs"), value: data.activeJobs.toLocaleString(), change: data.activeJobsGrowthPct, color: "from-yellow-50 to-yellow-100", textColor: "text-yellow-600" },
    { icon: CheckCircle, label: t("admin.dashboard.completedJobs"), value: data.completedJobs.toLocaleString(), change: data.completedJobsGrowthPct, color: "from-emerald-50 to-emerald-100", textColor: "text-emerald-600" },
    { icon: AlertTriangle, label: t("admin.dashboard.openDisputes"), value: data.openDisputes.toLocaleString(), change: data.disputesGrowthPct, color: "from-red-50 to-red-100", textColor: "text-red-600" },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("admin.dashboard.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.dashboard.welcome")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          const positive = stat.change >= 0
          return (
            <Card key={i} className={`p-4 sm:p-6 border-0 shadow-lg bg-linear-to-br ${stat.color} dark:from-gray-800 dark:to-gray-800 hover:shadow-xl transition-shadow`}>
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="p-2 sm:p-3 rounded-lg bg-white/50 dark:bg-gray-700/50">
                  <Icon className={`w-4 h-4 sm:w-6 sm:h-6 ${stat.textColor}`} />
                </div>
                <div className={`flex items-center gap-1 text-xs sm:text-sm font-semibold ${positive ? "text-emerald-600" : "text-red-600"}`}>
                  {positive ? <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  {Math.abs(stat.change)}%
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm font-medium">{stat.label}</p>
              <p className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-1 sm:mt-2">{stat.value}</p>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 border-0 shadow-lg">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("admin.dashboard.revenueOverview")}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{revenue?.periodLabel ?? ""}</p>
            </div>
          </div>

          <div className="flex items-end justify-center gap-2 mb-6 flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("admin.dashboard.yearLabel")}</label>
              <select
                value={draftYear}
                onChange={(e) => setDraftYear(Number(e.target.value))}
                className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("admin.dashboard.monthLabel")}</label>
              <select
                value={draftMonth}
                onChange={(e) => setDraftMonth(e.target.value === "" ? "" : Number(e.target.value))}
                className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("admin.dashboard.wholeYear")}</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <Button onClick={applyRevenueFilter} className="bg-blue-600 hover:bg-blue-700 h-[38px]">
              {t("admin.dashboard.applyFilter")}
            </Button>
          </div>

          <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{t("admin.dashboard.totalRevenue")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1 truncate">{formatMoney(revenue?.totalRevenue ?? 0)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{t("admin.dashboard.commissionEst")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1 truncate">{formatMoney(revenue?.totalCommission ?? 0)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{t("admin.dashboard.avgTransaction")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1 truncate">{formatMoney(revenue?.avgTransaction ?? 0)}</p>
            </div>
          </div>

          {revenueLoading || !revenue ? (
            <div className="flex items-center justify-center" style={{ height: 300 }}>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenue.chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" stroke="#9ca3af" interval={appliedMonth !== undefined ? 3 : 0} />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }} />
              <Legend />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="commission" fill="#fbbf24" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6 border-0 shadow-lg">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">{t("admin.dashboard.disputeResolution")}</h2>

            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.taskDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.taskDistribution.map((entry, index) => (
                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-3 mt-6">
              {data.taskDistribution.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                    <span className="text-gray-700 dark:text-gray-300">{item.name}</span>
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-0 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("admin.dashboard.recentActivities")}</h2>
          </div>

          {data.recentActivities.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{t("admin.dashboard.noRecentActivity")}</p>
          ) : (
            <div className="space-y-4">
              {data.recentActivities.map((activity) => {
                const Icon = ACTIVITY_ICON[activity.type]
                return (
                  <div key={activity.id} className="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors">
                    <div className={`p-2 rounded-lg ${ACTIVITY_COLOR[activity.type]}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{activity.label}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{activity.detail}</p>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatRelative(activity.time, t, tn)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="p-6 border-0 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("admin.dashboard.topEarners")}</h2>
          </div>

          {data.topPerformers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{t("admin.dashboard.noEarningsRecorded")}</p>
          ) : (
            <div className="space-y-3">
              {data.topPerformers.map((performer) => (
                <div key={performer.id} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                        {performer.name.split(" ")[0][0]}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{performer.name}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{tn("admin.dashboard.jobsCompleted", performer.tasks)}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${performer.active
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-400"
                      }`}>
                      {performer.active ? t("admin.dashboard.active") : t("admin.dashboard.inactive")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <p className="text-gray-600 dark:text-gray-400">{t("admin.dashboard.earningsLabel")}</p>
                      <p className="font-bold text-gray-900 dark:text-white">{formatMoney(performer.earnings)}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
