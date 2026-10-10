"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Loader2 } from "lucide-react"
import { getAgentPerformance, type SubAdminPerformanceData } from "@/backend/actions/sub-admin-performance"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function PerformancePage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<SubAdminPerformanceData>(null)

  useEffect(() => {
    getAgentPerformance().then(setData).finally(() => setIsLoading(false))
  }, [])

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const benchmarks = [
    { metric: t("subAdmin.performance.benchmarkAvgCases"), value: data.avgCasesHandled },
    { metric: t("subAdmin.performance.benchmarkResolutionRate"), value: `${data.overallResolutionRatePct}%` },
  ]

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("subAdmin.performance.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">{t("subAdmin.performance.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {benchmarks.map((item, idx) => (
          <Card key={idx} className="p-6">
            <p className="text-xs text-muted-foreground mb-3">{item.metric}</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-4">{item.value}</p>
            <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-300 rounded-full"></div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("subAdmin.performance.overviewTitle")}</h2>
        {data.agents.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("subAdmin.performance.noAgentsYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.performance.colAgent")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.performance.colCasesAssigned")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.performance.colResolved")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.performance.colResolutionRate")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.agents.map((item) => (
                  <tr key={item.agentId} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-6 py-4 text-xs font-medium text-gray-900 dark:text-white">{item.name}</td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{item.casesAssigned}</td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{item.casesResolved}</td>
                    <td className="px-6 py-4 text-xs font-medium text-emerald-600 dark:text-emerald-400">{item.resolutionRatePct}%</td>
                    <td className="px-6 py-4 text-xs">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${item.status === "Active" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400"}`}>
                        {item.status === "Active" ? t("subAdmin.agents.statusActive") : t("subAdmin.agents.statusInactive")}
                      </span>
                    </td>
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
