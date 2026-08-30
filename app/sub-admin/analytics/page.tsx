"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, TrendingUp, Users, Briefcase, ShieldCheck, Loader2 } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts"
import { getSubAdminAnalytics, type SubAdminAnalyticsData } from "@/lib/actions/sub-admin-analytics"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function SubAdminAnalyticsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<SubAdminAnalyticsData>(null)

  useEffect(() => {
    getSubAdminAnalytics().then(setData).finally(() => setIsLoading(false))
  }, [])

  const handleExport = () => {
    if (!data) return
    const rows = [
      [t("subAdmin.analytics.csvMetric"), t("subAdmin.analytics.csvValue")],
      [t("subAdmin.analytics.csvUserGrowthMoM"), `${data.userGrowthPct}%`],
      [t("subAdmin.analytics.csvJobGrowthMoM"), `${data.jobGrowthPct}%`],
      [t("subAdmin.analytics.csvVerificationRate"), `${data.verificationRatePct}%`],
      [t("subAdmin.analytics.csvActiveAgents"), data.activeAgents],
      [],
      [t("subAdmin.analytics.csvMonth"), t("subAdmin.dashboard.newUsersLabel"), t("subAdmin.analytics.csvNewJobs"), t("subAdmin.analytics.csvVerificationsSubmitted")],
      ...data.monthlyData.map((m) => [m.month, m.users, m.jobs, m.verifications]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sub-admin-analytics-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const kpis = [
    { icon: Users, label: t("subAdmin.analytics.kpiUserGrowth"), value: `${data.userGrowthPct >= 0 ? "+" : ""}${data.userGrowthPct}%`, sub: t("subAdmin.analytics.vsLastMonth"), color: "text-blue-600" },
    { icon: Briefcase, label: t("subAdmin.analytics.kpiJobGrowth"), value: `${data.jobGrowthPct >= 0 ? "+" : ""}${data.jobGrowthPct}%`, sub: t("subAdmin.analytics.vsLastMonth"), color: "text-amber-600" },
    { icon: ShieldCheck, label: t("subAdmin.analytics.kpiVerificationRate"), value: `${data.verificationRatePct}%`, sub: t("subAdmin.analytics.ofReviewedSubmissions"), color: "text-emerald-600" },
    { icon: TrendingUp, label: t("subAdmin.analytics.kpiActiveAgents"), value: data.activeAgents.toString(), sub: t("subAdmin.analytics.onThePlatform"), color: "text-violet-600" },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("subAdmin.analytics.title")}</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t("subAdmin.analytics.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="bg-transparent gap-2 text-xs"><Download size={16} /> {t("subAdmin.common.export")}</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((s, i) => (
          <Card key={i} className="p-4 border-0 shadow-sm">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <p className="text-[11px] text-gray-500">{s.label}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{s.value}</p>
            <p className="text-[10px] text-gray-400">{s.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 lg:p-5 border-0 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t("subAdmin.analytics.platformGrowthTitle")}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
            <YAxis stroke="#9ca3af" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
            <Area type="monotone" dataKey="users" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name={t("subAdmin.dashboard.newUsersLabel")} />
            <Area type="monotone" dataKey="jobs" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} name={t("subAdmin.analytics.newJobsLabel")} />
            <Area type="monotone" dataKey="verifications" stroke="#10b981" fill="#10b981" fillOpacity={0.1} name={t("subAdmin.dashboard.verificationsLabel")} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 lg:p-5 border-0 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t("subAdmin.analytics.weeklyModerationTitle")}</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data.weeklyModeration}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="day" stroke="#9ca3af" fontSize={12} />
            <YAxis stroke="#9ca3af" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
            <Bar dataKey="disputes" fill="#3b82f6" radius={[6,6,0,0]} name={t("subAdmin.analytics.disputesRaisedLabel")} />
            <Bar dataKey="reports" fill="#8b5cf6" radius={[6,6,0,0]} name={t("subAdmin.analytics.contentReportsLabel")} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
