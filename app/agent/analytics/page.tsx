"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Download, TrendingUp, Clock, Star, Loader2 } from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from "recharts"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { getAgentStats, type AgentStatsData } from "@/backend/actions/agent-stats"
import { getAgentAnalytics, type AgentAnalyticsData } from "@/backend/actions/agent-analytics"
import { getAgentLeaderboard, type AgentLeaderboardRow } from "@/backend/actions/agent-leaderboard"

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#0891b2"]

export default function AgentAnalyticsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<AgentStatsData>(null)
  const [analytics, setAnalytics] = useState<AgentAnalyticsData>(null)
  const [leaderboard, setLeaderboard] = useState<AgentLeaderboardRow[]>([])

  useEffect(() => {
    Promise.all([getAgentStats(), getAgentAnalytics(), getAgentLeaderboard()]).then(([s, a, l]) => {
      setStats(s)
      setAnalytics(a)
      setLeaderboard(l ?? [])
    }).finally(() => setIsLoading(false))
  }, [])

  const handleExport = () => {
    if (!stats || !analytics) return
    const data = { exportDate: new Date().toISOString(), stats, analytics, leaderboard }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `agent-analytics-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (isLoading || !stats || !analytics) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const you = leaderboard.find((r) => r.isYou)
  const agentComparison = leaderboard.slice(0, 5).map((r) => ({ name: r.isYou ? t("agent.analytics.youLabel") : r.name, cases: r.casesResolved }))

  const kpis = [
    { icon: TrendingUp, label: t("agent.stats.statTotalCases6mo"), value: stats.totalCases.toString(), color: "text-blue-600" },
    { icon: Clock, label: t("agent.analytics.avgResolution"), value: stats.avgResponseHours !== null ? `${stats.avgResponseHours}h` : t("agent.common.notAvailable"), color: "text-amber-600" },
    { icon: Star, label: t("agent.common.resolutionRate"), value: `${stats.resolutionRatePct}%`, color: "text-emerald-600" },
    { icon: TrendingUp, label: t("agent.analytics.yourRank"), value: you ? `#${you.rank}` : t("agent.common.notAvailable"), color: "text-indigo-600" },
  ]

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("agent.analytics.title")}</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t("agent.analytics.subtitle")}</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="bg-transparent gap-2" size="sm">
          <Download size={16} /> {t("agent.common.export")}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((s, i) => (
          <Card key={i} className="p-4 border-0 shadow-sm">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <p className="text-[11px] text-gray-500">{s.label}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 lg:p-5 border-0 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t("agent.analytics.performanceTrend")}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={stats.monthlyStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
            <YAxis stroke="#9ca3af" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
            <Area type="monotone" dataKey="cases" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} name={t("agent.common.assigned")} />
            <Area type="monotone" dataKey="resolved" stroke="#10b981" fill="#10b981" fillOpacity={0.1} name={t("agent.common.resolved")} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-4 lg:p-5 border-0 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t("agent.analytics.weeklyResolution")}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={analytics.weeklyResolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
              <Bar dataKey="resolved" fill="#6366f1" radius={[6, 6, 0, 0]} name={t("agent.common.resolved")} />
              <Bar dataKey="pending" fill="#f59e0b" radius={[6, 6, 0, 0]} name={t("agent.analytics.seriesPending")} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 lg:p-5 border-0 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t("agent.analytics.disputeReasons")}</h2>
          {analytics.reasonBreakdown.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("agent.analytics.noDisputesAssignedYet")}</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={analytics.reasonBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="count">
                    {analytics.reasonBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap sm:flex-col gap-2">
                {analytics.reasonBreakdown.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-2 text-[11px]">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-600 dark:text-gray-400">{cat.name}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{cat.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4 lg:p-5 border-0 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">{t("agent.analytics.agentComparison")}</h2>
        {agentComparison.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("agent.leaderboard.noAgentsFound")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agentComparison} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" stroke="#9ca3af" fontSize={12} />
              <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={12} width={60} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
              <Bar dataKey="cases" fill="#6366f1" radius={[0, 6, 6, 0]} name={t("agent.common.casesResolved")} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}
