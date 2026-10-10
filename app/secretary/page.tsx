"use client"

import useSWR from "swr"
import { CreditCard, TrendingUp, Clock, CheckCircle, Download, BarChart3, Loader2 } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs"
import { getSecretaryDashboard } from "@/backend/actions/secretary-dashboard"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/frontend/lib/swr-utils"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function SecretaryDashboard() {
  const { t, tn, formatMoney } = useLocalization()
  const { data, isLoading } = useSWR(
    "secretary-dashboard", () => withTimeout(getSecretaryDashboard(), DASHBOARD_FETCH_TIMEOUT_MS),
  )

  const txnTypeLabels: Record<string, string> = {
    CREDIT: t("secretary.dashboard.txnTypeCredit"),
    DEBIT: t("secretary.dashboard.txnTypeDebit"),
    REFUND: t("secretary.dashboard.txnTypeRefund"),
    COMMISSION: t("secretary.dashboard.txnTypeCommission"),
    PAYOUT: t("secretary.dashboard.txnTypePayout"),
    ESCROW_HOLD: t("secretary.dashboard.txnTypeEscrowHold"),
    ESCROW_RELEASE: t("secretary.dashboard.txnTypeEscrowRelease"),
  }
  const txnStatusLabels: Record<string, string> = {
    PENDING: t("secretary.dashboard.txnStatusPending"),
    COMPLETED: t("secretary.dashboard.txnStatusCompleted"),
    FAILED: t("secretary.dashboard.txnStatusFailed"),
    REVERSED: t("secretary.dashboard.txnStatusReversed"),
  }

  const handleExportReport = () => {
    if (!data) return
    const exportData = {
      exportDate: new Date().toISOString(),
      stats: {
        totalProcessed: data.totalProcessed,
        pending: data.pendingCount,
        completed: data.completedCount,
        thisMonth: data.thisMonth,
      },
      transactions: data.recentTransactions,
      walletBuckets: data.walletBuckets,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `secretary-report-${new Date().toISOString().split('T')[0]}.json`
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
    { icon: CreditCard, label: t("secretary.dashboard.statTotalProcessed"), value: formatMoney(data.totalProcessed), color: "bg-blue-100 dark:bg-blue-900", trend: data.totalProcessedGrowthPct },
    { icon: Clock, label: t("secretary.dashboard.statPendingWithdrawals"), value: data.pendingCount.toString(), color: "bg-yellow-100 dark:bg-yellow-900", trend: null },
    { icon: CheckCircle, label: t("secretary.dashboard.statCompletedPayments"), value: data.completedCount.toLocaleString(), color: "bg-green-100 dark:bg-green-900", trend: data.completedGrowthPct },
    { icon: TrendingUp, label: t("secretary.dashboard.statThisMonth"), value: formatMoney(data.thisMonth), color: "bg-purple-100 dark:bg-purple-900", trend: data.thisMonthGrowthPct },
  ]

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("secretary.dashboard.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("secretary.dashboard.subtitle")}</p>
        </div>
        <Button onClick={handleExportReport} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Download size={18} />
          {t("secretary.dashboard.exportReport")}
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
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                  {stat.trend !== null && (
                    <p className={`text-[11px] mt-2 ${stat.trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {stat.trend >= 0 ? "+" : ""}{stat.trend}%
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

      <Tabs defaultValue="transactions" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="transactions">{t("secretary.dashboard.tabTransactions")}</TabsTrigger>
          <TabsTrigger value="reconciliation">{t("secretary.dashboard.tabReconciliation")}</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card className="p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("secretary.dashboard.tabTransactions")}</h2>
            {data.recentTransactions.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.dashboard.noTransactions")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.dashboard.colDescription")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.dashboard.colAmount")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.dashboard.colType")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.dashboard.colDate")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {data.recentTransactions.map(txn => (
                      <tr key={txn.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{txn.description}</td>
                        <td className={`px-6 py-4 text-xs font-semibold ${txn.amount >= 0 ? "text-emerald-600" : "text-gray-900 dark:text-white"}`}>
                          {txn.amount >= 0 ? "+" : ""}{formatMoney(txn.amount)}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{txnTypeLabels[txn.type] ?? txn.type}</td>
                        <td className="px-6 py-4 text-xs">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                            txn.status === "COMPLETED" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                            "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                          }`}>
                            {txnStatusLabels[txn.status] ?? txn.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{new Date(txn.date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation" className="space-y-4">
          <Card className="p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <BarChart3 className="w-6 h-6" />
              {t("secretary.dashboard.walletReconciliationStatusTitle")}
            </h2>
            {data.walletBuckets.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.dashboard.noWallets")}</p>
            ) : (
              <div className="space-y-4">
                {data.walletBuckets.map((bucket) => (
                  <div key={bucket.role} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{bucket.role}</h3>
                      <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                        bucket.discrepancyCount === 0 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                        "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                      }`}>
                        {bucket.discrepancyCount === 0 ? t("secretary.dashboard.reconciled") : tn("secretary.dashboard.discrepancyCount", bucket.discrepancyCount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{formatMoney(bucket.totalBalance)}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{tn("secretary.dashboard.walletCount", bucket.walletCount)}</p>
                      </div>
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
