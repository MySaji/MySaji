"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { BarChart3, TrendingUp, Clock, Users, Loader2 } from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { getAgentStats, type AgentStatsData } from "@/lib/actions/agent-stats"

export default function AgentStatsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<AgentStatsData>(null)

  useEffect(() => {
    getAgentStats().then(setData).finally(() => setIsLoading(false))
  }, [])

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const stats = [
    { label: t("agent.stats.statTotalCases6mo"), value: data.totalCases.toString(), icon: Users, color: "bg-blue-100 dark:bg-blue-900/30" },
    { label: t("agent.common.resolutionRate"), value: `${data.resolutionRatePct}%`, icon: TrendingUp, color: "bg-green-100 dark:bg-green-900/30" },
    { label: t("agent.common.avgResolutionTime"), value: data.avgResponseHours !== null ? `${data.avgResponseHours}h` : t("agent.common.notAvailable"), icon: Clock, color: "bg-yellow-100 dark:bg-yellow-900/30" },
    { label: t("agent.stats.statCasesResolved6mo"), value: data.resolvedCount.toString(), icon: Users, color: "bg-purple-100 dark:bg-purple-900/30" },
  ]

  const topMetrics = [
    { title: t("agent.stats.fastestResolution"), value: data.fastestResolutionHours !== null ? `${data.fastestResolutionHours}h` : t("agent.common.notAvailable"), benchmark: data.avgResponseHours !== null ? t("agent.stats.hoursAvgTemplate", { hours: data.avgResponseHours }) : t("agent.common.notAvailable") },
    { title: t("agent.stats.bestMonthResolutionRate"), value: data.bestMonth ? `${data.bestMonth.resolutionRatePct}%` : t("agent.common.notAvailable"), benchmark: data.bestMonth ? data.bestMonth.month : t("agent.common.notAvailable") },
    { title: t("agent.stats.currentlyEscalated"), value: `${data.escalationRatePct}%`, benchmark: t("agent.stats.ofAllTimeAssignedCases") },
  ]

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("agent.stats.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">{t("agent.stats.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon
          return (
            <Card key={idx} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stat.value}</p>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {topMetrics.map((metric, idx) => (
          <Card key={idx} className="p-6">
            <p className="text-sm text-muted-foreground mb-3">{metric.title}</p>
            <div className="flex items-baseline gap-2 mb-4">
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{metric.value}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{metric.benchmark}</p>
            </div>
            <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-300 rounded-full"></div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          {t("agent.stats.monthlyPerformance")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("agent.stats.colMonth")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("agent.stats.colCasesAssigned")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.casesResolved")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.resolutionRate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.monthlyStats.map((stat, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{stat.month}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{stat.cases}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{stat.resolved}</td>
                  <td className="px-6 py-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {stat.resolutionRatePct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
