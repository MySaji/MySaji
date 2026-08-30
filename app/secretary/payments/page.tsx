"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Eye, X, Search, Download, Send, CheckCheck, Ban, Loader2, Zap } from "lucide-react"
import {
  getSecretaryWithdrawals, getSecretaryPaymentStats,
  markWithdrawalProcessing, completeWithdrawal, rejectWithdrawal,
  getPendingBankTopups, confirmBankTopup, rejectBankTopup,
  type SecretaryWithdrawal, type SecretaryPaymentStats, type PendingBankTopup,
} from "@/lib/actions/secretary-payments"

export default function SecretaryPayments() {
  const { t, formatMoney } = useLocalization()

  const [isLoading, setIsLoading] = useState(true)
  const [withdrawals, setWithdrawals] = useState<SecretaryWithdrawal[]>([])
  const [stats, setStats] = useState<SecretaryPaymentStats | null>(null)
  const [bankTopups, setBankTopups] = useState<PendingBankTopup[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const withdrawalStatusLabels: Record<string, string> = {
    COMPLETED: t("secretary.payments.statusCompleted"),
    PROCESSING: t("secretary.payments.statusProcessing"),
    REJECTED: t("secretary.payments.statusRejected"),
    FAILED: t("secretary.payments.statusFailed"),
    PENDING: t("secretary.payments.statusPending"),
  }

  const [viewing, setViewing] = useState<SecretaryWithdrawal | null>(null)
  const [rejecting, setRejecting] = useState<SecretaryWithdrawal | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [completing, setCompleting] = useState<SecretaryWithdrawal | null>(null)
  const [externalRef, setExternalRef] = useState("")
  const [manualOverride, setManualOverride] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    const [w, s, b] = await Promise.all([getSecretaryWithdrawals(), getSecretaryPaymentStats(), getPendingBankTopups()])
    setWithdrawals(w ?? [])
    setStats(s)
    setBankTopups(b ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleConfirmBankTopup = async (paymentId: string) => {
    setBusyId(paymentId)
    await confirmBankTopup({ paymentId })
    await load()
    setBusyId(null)
  }

  const handleRejectBankTopup = async (paymentId: string) => {
    setBusyId(paymentId)
    await rejectBankTopup({ paymentId })
    await load()
    setBusyId(null)
  }

  const filtered = withdrawals.filter(w =>
    w.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const paymentStats = stats ? [
    { label: t("secretary.payments.statTotalProcessed"), value: formatMoney(stats.totalProcessed) },
    { label: t("secretary.payments.statPendingProcessing"), value: stats.pendingCount.toString() },
    { label: t("secretary.payments.statCompletedToday"), value: formatMoney(stats.todayProcessed) },
    { label: t("secretary.payments.statThisMonth"), value: formatMoney(stats.thisMonthProcessed) },
  ] : []

  const handleExport = () => {
    const data = { exportDate: new Date().toISOString(), totalWithdrawals: withdrawals.length, withdrawals }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `withdrawals-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleProcess = async (id: string) => {
    setBusyId(id)
    setError("")
    const result = await markWithdrawalProcessing(id)
    if (!result.success) setError(result.error)
    await load()
    setBusyId(null)
  }

  const openComplete = (w: SecretaryWithdrawal) => {
    setCompleting(w)
    setExternalRef("")
    setManualOverride(!w.canAutoPay)
    setError("")
  }

  const submitComplete = async () => {
    if (!completing) return
    setBusyId(completing.id)
    setError("")
    const result = await completeWithdrawal({ withdrawalId: completing.id, externalRef: externalRef || undefined })
    if (!result.success) { setError(result.error); setBusyId(null); return }
    setCompleting(null)
    await load()
    setBusyId(null)
  }

  const openReject = (w: SecretaryWithdrawal) => {
    setRejecting(w)
    setRejectReason("")
    setError("")
  }

  const submitReject = async () => {
    if (!rejecting) return
    setBusyId(rejecting.id)
    setError("")
    const result = await rejectWithdrawal({ withdrawalId: rejecting.id, reason: rejectReason })
    if (!result.success) { setError(result.error); setBusyId(null); return }
    setRejecting(null)
    await load()
    setBusyId(null)
  }

  if (isLoading) {
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("secretary.payments.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("secretary.payments.subtitle")}</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="bg-transparent gap-2">
          <Download size={18} />
          {t("secretary.payments.export")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {paymentStats.map((stat, idx) => (
          <Card key={idx} className="p-6">
            <p className="text-xs text-muted-foreground mb-2">{stat.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t("secretary.payments.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {bankTopups.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t("secretary.payments.pendingBankTransfersTitle")}</h2>
          <p className="text-xs text-muted-foreground mb-4">{t("secretary.payments.pendingBankTransfersSubtitle")}</p>
          <div className="space-y-2">
            {bankTopups.map((topup) => (
              <div key={topup.paymentId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{topup.customerName} <span className="font-normal text-muted-foreground">({topup.customerEmail})</span></p>
                  <p className="text-xs text-muted-foreground">{t("secretary.payments.refLabel")} {topup.reference} &middot; {new Date(topup.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-gray-900 dark:text-white">{formatMoney(topup.amount)}</p>
                  <Button size="sm" onClick={() => handleConfirmBankTopup(topup.paymentId)} disabled={busyId === topup.paymentId} className="gap-1.5">
                    {busyId === topup.paymentId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />} {t("secretary.payments.confirmButton")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleRejectBankTopup(topup.paymentId)} disabled={busyId === topup.paymentId} className="gap-1.5 bg-transparent">
                    <Ban className="w-3.5 h-3.5" /> {t("secretary.payments.rejectButton")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("secretary.payments.withdrawalRequestsTitle")}</h2>
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.payments.noWithdrawalRequests")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.payments.colUser")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.payments.colAmount")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.payments.colMethod")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.payments.colRequested")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.payments.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-6 py-4 text-xs">
                      <div className="font-medium text-gray-900 dark:text-white">{w.userName}</div>
                      <div className="text-gray-500 dark:text-gray-400 text-[11px]">{w.userEmail} · {w.userRole}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">
                      {formatMoney(w.netAmount)}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">
                      <div className="flex items-center gap-1.5">
                        {w.recipientLabel}
                        {w.canAutoPay && (w.status === "PENDING" || w.status === "PROCESSING") && (
                          <span title={t("secretary.payments.autoPayoutBadge")} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            <Zap size={10} /> {t("secretary.payments.autoPayoutBadge")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                        w.status === "COMPLETED" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                        w.status === "PROCESSING" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                        w.status === "REJECTED" || w.status === "FAILED" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                        "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                      }`}>
                        {withdrawalStatusLabels[w.status] ?? w.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{new Date(w.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => setViewing(w)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
                          <Eye size={18} />
                        </button>
                        {w.status === "PENDING" && (
                          <button
                            disabled={busyId === w.id}
                            onClick={() => handleProcess(w.id)}
                            title={t("secretary.payments.markProcessingTooltip")}
                            className="p-2 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Send size={18} />
                          </button>
                        )}
                        {(w.status === "PENDING" || w.status === "PROCESSING") && (
                          <>
                            <button
                              disabled={busyId === w.id}
                              onClick={() => openComplete(w)}
                              title={t("secretary.payments.markCompletedTooltip")}
                              className="p-2 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <CheckCheck size={18} />
                            </button>
                            <button
                              disabled={busyId === w.id}
                              onClick={() => openReject(w)}
                              title={t("secretary.payments.rejectTooltip")}
                              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Ban size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {viewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("secretary.payments.withdrawalDetailsTitle")}</h2>
                <button onClick={() => setViewing(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <div className="space-y-2 text-xs">
                <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailUser")}</span> {viewing.userName} ({viewing.userEmail})</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailRole")}</span> {viewing.userRole}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailAmount")}</span> {formatMoney(viewing.amount)}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailProcessingFee")}</span> {formatMoney(viewing.processingFee)}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailNetAmount")}</span> {formatMoney(viewing.netAmount)}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailMethod")}</span> {viewing.recipientLabel}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailStatus")}</span> {withdrawalStatusLabels[viewing.status] ?? viewing.status}</p>
                {viewing.rejectionReason && <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailRejectionReason")}</span> {viewing.rejectionReason}</p>}
                {viewing.externalRef && <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailExternalRef")}</span> {viewing.externalRef}</p>}
                <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailRequested")}</span> {new Date(viewing.createdAt).toLocaleString()}</p>
                {viewing.completedAt && <p><span className="text-gray-500 dark:text-gray-400">{t("secretary.payments.detailCompleted")}</span> {new Date(viewing.completedAt).toLocaleString()}</p>}
              </div>
              <Button className="w-full" variant="outline" onClick={() => setViewing(null)}>{t("common.close")}</Button>
            </div>
          </Card>
        </div>
      )}

      {completing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {completing.canAutoPay && !manualOverride ? t("secretary.payments.autoPayoutTitle") : t("secretary.payments.completeWithdrawalTitle")}
                </h2>
                <button onClick={() => setCompleting(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              {completing.canAutoPay && !manualOverride ? (
                <>
                  <div className="flex items-start gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                    <Zap className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-green-800 dark:text-green-300">
                      {t("secretary.payments.autoPayoutMessage", { amount: formatMoney(completing.netAmount), name: completing.userName })}
                    </p>
                  </div>
                  {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setCompleting(null)}>{t("common.cancel")}</Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={busyId === completing.id} onClick={submitComplete}>
                      {busyId === completing.id ? t("secretary.payments.sendingPayoutButton") : t("secretary.payments.autoPayoutButton")}
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualOverride(true)}
                    className="text-[11px] text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    {t("secretary.payments.manualOverrideLink")}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {t("secretary.payments.confirmPaidOutMessage", { amount: formatMoney(completing.netAmount), name: completing.userName, method: completing.recipientLabel })}
                  </p>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">{t("secretary.payments.externalReferenceLabel")}</label>
                    <input
                      type="text"
                      value={externalRef}
                      onChange={(e) => setExternalRef(e.target.value)}
                      placeholder={t("secretary.payments.externalReferencePlaceholder")}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setCompleting(null)}>{t("common.cancel")}</Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={busyId === completing.id} onClick={submitComplete}>
                      {busyId === completing.id ? t("secretary.payments.completingButton") : t("secretary.payments.confirmPaidOutButton")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("secretary.payments.rejectWithdrawalTitle")}</h2>
                <button onClick={() => setRejecting(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {t("secretary.payments.rejectMessage", { amount: formatMoney(rejecting.amount), name: rejecting.userName })}
              </p>
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400">{t("secretary.payments.reasonLabel")}</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setRejecting(null)}>{t("common.cancel")}</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700" disabled={busyId === rejecting.id} onClick={submitReject}>
                  {busyId === rejecting.id ? t("secretary.payments.rejectingButton") : t("secretary.payments.confirmRejectButton")}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
