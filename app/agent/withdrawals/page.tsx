"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CreditCard, DollarSign, Clock, CheckCircle, AlertCircle, XCircle, Download, Loader2 } from "lucide-react"
import {
  getAgentWallet, getAgentWithdrawals, requestAgentWithdrawal,
  type AgentWalletSummary, type AgentWithdrawal,
} from "@/lib/actions/agent-withdrawals"

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  COMPLETED: CheckCircle, PROCESSING: Clock, PENDING: AlertCircle, FAILED: XCircle, REJECTED: XCircle,
}

export default function WithdrawalsPage() {
  const { t, currency, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [wallet, setWallet] = useState<AgentWalletSummary>(null)
  const [withdrawals, setWithdrawals] = useState<AgentWithdrawal[]>([])
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "card">("mpesa")
  const [details, setDetails] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    const [w, h] = await Promise.all([getAgentWallet(), getAgentWithdrawals()])
    setWallet(w)
    setWithdrawals(h ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleWithdraw = async () => {
    setError("")
    const amount = parseFloat(withdrawAmount)
    if (!amount || !details.trim()) { setError(t("agent.withdrawals.missingFieldsError")); return }
    setSubmitting(true)
    const result = await requestAgentWithdrawal({ amount, method: paymentMethod, details: details.trim() })
    setSubmitting(false)
    if (!result.success) { setError(result.error); return }
    setWithdrawAmount("")
    setDetails("")
    setShowWithdrawModal(false)
    await load()
  }

  const handleExportWithdrawals = () => {
    const data = { exportDate: new Date().toISOString(), wallet, withdrawals }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `withdrawals-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (isLoading || !wallet) {
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("agent.withdrawals.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("agent.withdrawals.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportWithdrawals} variant="outline" className="bg-transparent gap-2">
            <Download size={18} />
            {t("agent.common.export")}
          </Button>
          <Button onClick={() => setShowWithdrawModal(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <DollarSign size={18} />
            {t("agent.withdrawals.withdrawButton")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-2">{t("agent.withdrawals.availableBalance")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(wallet.available)}</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2">{t("agent.withdrawals.readyToWithdraw")}</p>
            </div>
            <div className="bg-emerald-200 dark:bg-emerald-700/50 p-3 rounded-lg flex-shrink-0">
              <DollarSign className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-2">{t("agent.withdrawals.pendingWithdrawal")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(wallet.pendingBalance)}</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2">{t("agent.withdrawals.awaitingProcessing")}</p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg flex-shrink-0">
              <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-2">{t("agent.withdrawals.totalWalletBalance")}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(wallet.balance)}</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2">{t("agent.withdrawals.availablePlusPending")}</p>
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("agent.withdrawals.withdrawalHistory")}</h2>
        {withdrawals.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("agent.withdrawals.noWithdrawalsYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.amount")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.withdrawals.colMethod")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.withdrawals.colRequested")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.withdrawals.colCompleted")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {withdrawals.map(w => {
                  const Icon = STATUS_ICON[w.status] ?? AlertCircle
                  return (
                    <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(w.netAmount)}</td>
                      <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{w.method}</td>
                      <td className="px-6 py-4 text-xs">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${
                            w.status === "COMPLETED" ? "text-green-600" :
                            w.status === "PROCESSING" ? "text-yellow-600" :
                            w.status === "PENDING" ? "text-orange-600" : "text-red-600"
                          }`} />
                          <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                            w.status === "COMPLETED" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                            w.status === "PROCESSING" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" :
                            w.status === "PENDING" ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400" :
                            "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          }`}>
                            {w.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{new Date(w.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{w.completedAt ? new Date(w.completedAt).toLocaleDateString() : "-"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("agent.withdrawals.requestModalTitle")}</h2>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("agent.withdrawals.amountLabelTemplate", { currency })}</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder={t("agent.withdrawals.enterAmountPlaceholder")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">{t("agent.withdrawals.availableTemplate", { amount: formatMoney(wallet.available) })}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("agent.withdrawals.methodLabel")}</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "mpesa" | "card")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="mpesa">{t("payment.mpesa")}</option>
                <option value="card">{t("agent.withdrawals.cardPayoutOption")}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                {paymentMethod === "mpesa" ? t("agent.withdrawals.mpesaNumberLabel") : t("agent.withdrawals.cardDetailsLabel")}
              </label>
              <input
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={paymentMethod === "mpesa" ? t("agent.withdrawals.mpesaPlaceholder") : t("agent.withdrawals.cardRefPlaceholder")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowWithdrawModal(false)} className="flex-1 bg-transparent">
                {t("common.cancel")}
              </Button>
              <Button onClick={handleWithdraw} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                {submitting ? t("agent.withdrawals.submitting") : t("agent.withdrawals.requestModalTitle")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
