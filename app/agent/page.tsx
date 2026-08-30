"use client"

import useSWR from "swr"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { AlertTriangle, Inbox, CheckCircle, TrendingUp, Download, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getAgentDashboard } from "@/lib/actions/agent-dashboard"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/lib/swr-utils"

export default function AgentDashboard() {
  const { t, formatMoney } = useLocalization()
  const { data, isLoading } = useSWR(
    "agent-dashboard", () => withTimeout(getAgentDashboard(), DASHBOARD_FETCH_TIMEOUT_MS),
  )

  const ACTION_LABEL: Record<string, string> = {
    "dispute.resolve": t("agent.dashboard.actionResolved"),
    "dispute.close": t("agent.dashboard.actionClosed"),
    "dispute.claim": t("agent.dashboard.actionClaimed"),
  }

  const handleExportReport = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `agent-report-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const stats = [
    { icon: AlertTriangle, label: t("agent.dashboard.statOpenDisputes"), value: data.openCount.toString(), color: "bg-red-100 dark:bg-red-900", trend: data.openChange },
    { icon: Inbox, label: t("agent.common.availableToClaim"), value: data.unassignedOpenCount.toString(), color: "bg-yellow-100 dark:bg-yellow-900", trend: null },
    { icon: CheckCircle, label: t("agent.dashboard.statResolvedToday"), value: data.resolvedTodayCount.toString(), color: "bg-green-100 dark:bg-green-900", trend: null },
    { icon: TrendingUp, label: t("agent.dashboard.statTotalResolved"), value: data.resolvedCount.toString(), color: "bg-blue-100 dark:bg-blue-900", trend: data.resolvedGrowthPct },
  ]

  const performanceMetrics = [
    { label: t("agent.common.resolutionRate"), value: `${data.resolutionRatePct}%` },
    { label: t("agent.common.avgResolutionTime"), value: data.avgResponseHours !== null ? `${data.avgResponseHours}h` : t("agent.common.notAvailable") },
    { label: t("agent.common.casesResolved"), value: data.resolvedCount.toString() },
    { label: t("agent.dashboard.metricCasesOpen"), value: data.openCount.toString() },
  ]

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("agent.dashboard.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("agent.dashboard.subtitle")}</p>
        </div>
        <Button onClick={handleExportReport} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Download size={18} />
          {t("agent.dashboard.exportReport")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon
          return (
            <Card key={idx} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                  {stat.trend !== null && (
                    <p className={`text-[11px] mt-2 ${stat.trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {stat.trend >= 0 ? "+" : ""}{stat.trend} {t("agent.dashboard.vsLastWeek")}
                    </p>
                  )}
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Tabs defaultValue="disputes" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="disputes">{t("agent.dashboard.tabDisputes")}</TabsTrigger>
          <TabsTrigger value="performance">{t("agent.dashboard.tabPerformance")}</TabsTrigger>
          <TabsTrigger value="activity">{t("agent.dashboard.tabActivity")}</TabsTrigger>
        </TabsList>

        <TabsContent value="disputes" className="space-y-4">
          <Card className="p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("agent.dashboard.tabDisputes")}</h2>
            {data.recentDisputes.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("agent.dashboard.noDisputesAssigned")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.id")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.customer")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.provider")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.severity")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.amount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {data.recentDisputes.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-6 py-4 text-xs font-medium text-gray-900 dark:text-white">{d.disputeNumber}</td>
                        <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{d.customer}</td>
                        <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{d.provider ?? t("agent.common.notAvailable")}</td>
                        <td className="px-6 py-4 text-xs">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                            d.status === "OPEN" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                            d.status === "IN_REVIEW" || d.status === "ESCALATED" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" :
                            "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          }`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{d.severity}</td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-900 dark:text-white">{formatMoney(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {performanceMetrics.map((metric, idx) => (
              <Card key={idx} className="p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{metric.label}</h3>
                <div className="flex items-end justify-between">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metric.value}</p>
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card className="p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("agent.dashboard.tabActivity")}</h2>
            {data.recentActivity.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("agent.dashboard.noActivity")}</p>
            ) : (
              <div className="space-y-4">
                {data.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
                    <div className="w-3 h-3 rounded-full mt-2 bg-blue-600" />
                    <div className="flex-1">
                      <p className="text-gray-900 dark:text-white font-medium">{ACTION_LABEL[activity.action] ?? activity.action}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{new Date(activity.time).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
