"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, RefreshCw, Loader2, ScaleIcon, Landmark, Plus } from "lucide-react"
import {
  getSecretaryReconciliation, getSecretaryReconciliationSummary, recomputeWalletBalance,
  getBankReconciliations, createBankReconciliation, resolveReconciliationDiscrepancy,
  type SecretaryReconciliationRow, type SecretaryReconciliationSummary, type BankReconciliation,
} from "@/lib/actions/secretary-reconciliation"

export default function SecretaryReconciliation() {
  const { t, formatMoney } = useLocalization()

  const [isLoading, setIsLoading] = useState(true)
  const [rows, setRows] = useState<SecretaryReconciliationRow[]>([])
  const [summary, setSummary] = useState<SecretaryReconciliationSummary | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filter, setFilter] = useState<"all" | "discrepancy">("all")
  const [busyId, setBusyId] = useState<string | null>(null)

  const [bankReconciliations, setBankReconciliations] = useState<BankReconciliation[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newAccount, setNewAccount] = useState("")
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newSystemBalance, setNewSystemBalance] = useState("")
  const [newBankBalance, setNewBankBalance] = useState("")
  const [addError, setAddError] = useState("")
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false)

  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionText, setResolutionText] = useState("")
  const [isResolving, setIsResolving] = useState(false)

  const load = useCallback(async () => {
    const [r, s, b] = await Promise.all([getSecretaryReconciliation(), getSecretaryReconciliationSummary(), getBankReconciliations()])
    setRows(r ?? [])
    setSummary(s)
    setBankReconciliations(b)
    setIsLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(row => {
    const matchesSearch =
      row.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filter === "all" || row.status === "discrepancy"
    return matchesSearch && matchesFilter
  })

  const summaryCards = summary ? [
    { label: t("secretary.reconciliation.statTotalWallets"), value: summary.totalWallets.toString() },
    { label: t("secretary.reconciliation.statReconciled"), value: summary.reconciledCount.toString() },
    { label: t("secretary.reconciliation.statDiscrepancies"), value: summary.discrepancyCount.toString() },
    { label: t("secretary.reconciliation.statTotalBalance"), value: formatMoney(summary.totalBalance) },
  ] : []

  const handleRecompute = async (walletId: string) => {
    setBusyId(walletId)
    await recomputeWalletBalance(walletId)
    await load()
    setBusyId(null)
  }

  const openAddModal = () => {
    setNewAccount("")
    setNewDate(new Date().toISOString().slice(0, 10))
    setNewSystemBalance("")
    setNewBankBalance("")
    setAddError("")
    setShowAddModal(true)
  }

  const submitNewReconciliation = async () => {
    const systemBalance = Number(newSystemBalance)
    const bankBalance = Number(newBankBalance)
    if (!Number.isFinite(systemBalance) || !Number.isFinite(bankBalance)) {
      setAddError(t("secretary.reconciliation.invalidAmounts"))
      return
    }
    setIsSubmittingEntry(true)
    setAddError("")
    const result = await createBankReconciliation({ account: newAccount, date: newDate, systemBalance, bankBalance })
    setIsSubmittingEntry(false)
    if (!result.success) { setAddError(result.error); return }
    setShowAddModal(false)
    await load()
  }

  const openResolve = (discrepancyId: string) => {
    setResolvingId(discrepancyId)
    setResolutionText("")
  }

  const submitResolve = async () => {
    if (!resolvingId || !resolutionText.trim()) return
    setIsResolving(true)
    const result = await resolveReconciliationDiscrepancy({ discrepancyId: resolvingId, resolution: resolutionText })
    setIsResolving(false)
    if (!result.success) { alert(result.error); return }
    setResolvingId(null)
    await load()
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("secretary.reconciliation.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {t("secretary.reconciliation.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((stat, idx) => (
          <Card key={idx} className="p-6">
            <p className="text-xs text-muted-foreground mb-2">{stat.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t("secretary.reconciliation.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "discrepancy")}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">{t("secretary.reconciliation.filterAllWallets")}</option>
          <option value="discrepancy">{t("secretary.reconciliation.filterDiscrepanciesOnly")}</option>
        </select>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <ScaleIcon className="w-6 h-6" />
          {t("secretary.reconciliation.ledgerIntegrityTitle")}
        </h2>
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.reconciliation.noWalletsFound")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.reconciliation.colUser")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.reconciliation.colStoredBalance")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.reconciliation.colLedgerBalance")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.reconciliation.colDiscrepancy")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.reconciliation.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(row => (
                  <tr key={row.walletId} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-6 py-4 text-xs">
                      <div className="font-medium text-gray-900 dark:text-white">{row.userName}</div>
                      <div className="text-gray-500 dark:text-gray-400 text-[11px]">{row.userEmail} · {row.role}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(row.currentBalance)}</td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{formatMoney(row.expectedBalance)}</td>
                    <td className={`px-6 py-4 text-xs font-medium ${row.discrepancy !== 0 ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
                      {row.discrepancy > 0 ? "+" : ""}{formatMoney(row.discrepancy)}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                        row.status === "reconciled" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                        "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                      }`}>
                        {row.status === "reconciled" ? t("secretary.reconciliation.statusReconciled") : t("secretary.reconciliation.statusDiscrepancy")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {row.status === "discrepancy" && (
                        <button
                          disabled={busyId === row.walletId}
                          onClick={() => handleRecompute(row.walletId)}
                          title={t("secretary.reconciliation.recomputeTooltip")}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={18} className={busyId === row.walletId ? "animate-spin" : ""} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-6 h-6" />
            {t("secretary.reconciliation.bankReconciliationTitle")}
          </h2>
          <Button onClick={openAddModal} className="gap-2">
            <Plus size={16} />
            {t("secretary.reconciliation.addEntryButton")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-6">{t("secretary.reconciliation.bankReconciliationHint")}</p>

        {bankReconciliations.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.reconciliation.noEntriesFound")}</p>
        ) : (
          <div className="space-y-3">
            {bankReconciliations.map((r) => (
              <div key={r.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{r.account}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{new Date(r.date).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                    r.status === "RECONCILED" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                    r.status === "UNDER_REVIEW" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                    "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                  }`}>
                    {r.status === "RECONCILED" ? t("secretary.reconciliation.statusReconciled") : r.status === "UNDER_REVIEW" ? t("secretary.reconciliation.statusUnderReview") : t("secretary.reconciliation.statusPending")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                  <div><p className="text-[11px] text-gray-500">{t("secretary.reconciliation.systemBalanceLabel")}</p><p className="font-medium text-gray-900 dark:text-white">{formatMoney(r.systemBalance)}</p></div>
                  <div><p className="text-[11px] text-gray-500">{t("secretary.reconciliation.bankBalanceLabel")}</p><p className="font-medium text-gray-900 dark:text-white">{formatMoney(r.bankBalance)}</p></div>
                  <div><p className="text-[11px] text-gray-500">{t("secretary.reconciliation.varianceLabel")}</p><p className={`font-medium ${r.variance !== 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{r.variance > 0 ? "+" : ""}{formatMoney(r.variance)}</p></div>
                </div>
                {r.discrepancies.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                    {r.discrepancies.map((d) => (
                      <div key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-700 dark:text-gray-300">{d.description}</p>
                          {d.resolution && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">{t("secretary.reconciliation.resolutionPrefix")} {d.resolution}</p>}
                        </div>
                        {d.status !== "resolved" ? (
                          <Button size="sm" variant="outline" className="bg-transparent flex-shrink-0" onClick={() => openResolve(d.id)}>{t("secretary.reconciliation.resolveButton")}</Button>
                        ) : (
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex-shrink-0">{t("secretary.reconciliation.resolvedBadge")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("secretary.reconciliation.addModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium mb-1.5">{t("secretary.reconciliation.accountLabel")}</label>
              <Input value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder={t("secretary.reconciliation.accountPlaceholder")} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">{t("secretary.reconciliation.dateLabel")}</label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("secretary.reconciliation.systemBalanceLabel")}</label>
                <Input type="number" value={newSystemBalance} onChange={(e) => setNewSystemBalance(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("secretary.reconciliation.bankBalanceLabel")}</label>
                <Input type="number" value={newBankBalance} onChange={(e) => setNewBankBalance(e.target.value)} placeholder="0" />
              </div>
            </div>
            {addError && <p className="text-xs text-red-600">{addError}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowAddModal(false)} disabled={isSubmittingEntry}>{t("common.cancel")}</Button>
              <Button className="flex-1" onClick={submitNewReconciliation} disabled={!newAccount.trim() || !newDate || isSubmittingEntry}>
                {isSubmittingEntry ? <Loader2 className="w-4 h-4 animate-spin" /> : t("secretary.reconciliation.submitEntryButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resolvingId !== null} onOpenChange={(open) => !open && setResolvingId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("secretary.reconciliation.resolveModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder={t("secretary.reconciliation.resolutionPlaceholder")} className="min-h-[80px]" />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setResolvingId(null)} disabled={isResolving}>{t("common.cancel")}</Button>
              <Button className="flex-1" onClick={submitResolve} disabled={!resolutionText.trim() || isResolving}>
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("secretary.reconciliation.confirmResolveButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
