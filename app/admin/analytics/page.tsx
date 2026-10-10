"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { TrendingUp, BarChart3, ArrowUpRight, ArrowDownRight, Users, CreditCard, Shield, AlertTriangle, Loader2 } from "lucide-react"
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { getAdminAnalytics, type AdminAnalyticsData } from "@/backend/actions/admin-analytics"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

const COLORS = ["#2563eb", "#0891b2", "#10b981", "#f59e0b", "#6366f1"]
const METRIC_ICON = [Users, CreditCard, Shield, AlertTriangle]

export default function AdminAnalyticsPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<AdminAnalyticsData>(null)

  useEffect(() => {
    getAdminAnalytics().then(setData).finally(() => setIsLoading(false))
  }, [])

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("admin.analytics.title")}</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("admin.analytics.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.metrics.map((m, i) => {
          const Icon = METRIC_ICON[i]
          const positive = m.changePct >= 0
          return (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600"><Icon size={16} /></div>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{t(m.labelKey as Parameters<typeof t>[0])}</p>
              <p className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white">{m.rawAmount != null ? formatMoney(m.rawAmount) : m.value}</p>
              {m.changePct !== 0 && (
                <div className="flex items-center gap-1 mt-1">
                  {positive ? <ArrowUpRight size={14} className="text-emerald-600" /> : <ArrowDownRight size={14} className="text-red-600" />}
                  <span className={`text-[11px] font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}>{Math.abs(m.changePct)}%</span>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="p-4 lg:p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">{t("admin.analytics.platformRevenue")}</h2>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">{t("admin.analytics.monthlyRevenueDesc")}</p>
        <div className="h-64 lg:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.revenueData}>
              <defs>
                <linearGradient id="adminRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid #e5e7eb" }} formatter={(val: number) => [formatMoney(val * 1000), t("admin.analytics.revenue")]} />
              <Area type="monotone" dataKey="revenue" name={t("admin.analytics.revenue")} stroke="#2563eb" strokeWidth={2.5} fill="url(#adminRevGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 lg:p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("admin.analytics.newSignupsByRole")}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.userGrowthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                <Area type="monotone" dataKey="providers" name={t("admin.analytics.providers")} stackId="1" stroke="#2563eb" fill="#2563eb" fillOpacity={0.6} />
                <Area type="monotone" dataKey="shopkeepers" name={t("admin.analytics.shopkeepers")} stackId="1" stroke="#0891b2" fill="#0891b2" fillOpacity={0.6} />
                <Area type="monotone" dataKey="customers" name={t("admin.analytics.customers")} stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 lg:p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("admin.analytics.userDistribution")}</h2>
          {data.roleDistribution.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-12">{t("admin.analytics.noUsersYet")}</p>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.roleDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                      {data.roleDistribution.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(val: number, name: string) => [val.toLocaleString(), name]} contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {data.roleDistribution.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-600 dark:text-gray-400">{r.name}</span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">{r.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4 lg:p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={18} className="text-gray-500" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("admin.analytics.weeklyActivity")}</h2>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weeklyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="cases" name={t("admin.analytics.disputesRaised")} fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="volume" name={t("admin.analytics.paymentVolumeK")} fill="#0891b2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 lg:p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("admin.analytics.topPerformingAgents")}</h2>
        {data.topAgents.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("admin.analytics.noAgentActivity")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400 text-[11px]">{t("admin.analytics.colRank")}</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400 text-[11px]">{t("admin.analytics.colAgent")}</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400 text-[11px]">{t("admin.analytics.colResolved")}</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400 text-[11px]">{t("admin.analytics.colAssigned")}</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400 text-[11px]">{t("admin.analytics.colEarnings")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topAgents.map(a => (
                  <tr key={a.rank} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2.5 px-3"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${a.rank <= 3 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"}`}>{a.rank}</span></td>
                    <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">{a.name}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">{a.casesResolved}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700 dark:text-gray-300">{a.casesAssigned}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-gray-900 dark:text-white">{formatMoney(a.earnings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
