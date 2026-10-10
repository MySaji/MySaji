"use client"

import { useEffect, useState } from "react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { TrendingUp, Award, Download, DollarSign, Loader2 } from "lucide-react"
import { getAgentCommissions, type AgentCommissionsData } from "@/backend/actions/agent-commissions"

export default function AgentCommissionsPage() {
  const { t, tn, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<AgentCommissionsData>(null)

  useEffect(() => {
    getAgentCommissions().then(setData).finally(() => setIsLoading(false))
  }, [])

  const handleExport = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `commissions-${new Date().toISOString().split("T")[0]}.json`
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

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("agent.commissions.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("agent.commissions.subtitle")}</p>
        </div>
        <Button onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Download size={18} />
          {t("agent.common.export")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-2">{t("agent.commissions.totalEarned")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(data.totalEarned)}</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2">{t("agent.commissions.totalEarnedHint")}</p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg flex-shrink-0">
              <DollarSign className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-2">{t("agent.common.casesResolved")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{data.casesResolved}</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2">{t("agent.commissions.ofAssignedTemplate", { count: data.casesAssigned })}</p>
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-2">{t("agent.commissions.currentTier")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{data.currentTier ? `${data.currentTier.rate}%` : t("agent.commissions.noneTier")}</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2 truncate">{data.currentTier?.name ?? t("agent.commissions.noTierReachedYet")}</p>
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg flex-shrink-0">
              <Award className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>
      </div>

      {data.nextTier && (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{t("agent.commissions.nextTierTemplate", { name: data.nextTier.name, rate: data.nextTier.rate })}</h2>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {tn("agent.commissions.casesToNextTier", data.casesToNextTier ?? 0)}
          </p>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("agent.commissions.walletActivity")}</h2>
        {data.recentTransactions.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("agent.commissions.noTransactions")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.commissions.colDescription")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.amount")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.commissions.colType")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.commissions.colDate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.recentTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{tx.description}</td>
                    <td className={`px-6 py-4 text-xs font-semibold ${tx.amount >= 0 ? "text-emerald-600" : "text-gray-900 dark:text-white"}`}>
                      {tx.amount >= 0 ? "+" : ""}{formatMoney(tx.amount)}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{tx.type}</td>
                    <td className="px-6 py-4 text-xs">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                        tx.status === "COMPLETED" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                        "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{new Date(tx.date).toLocaleDateString()}</td>
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
