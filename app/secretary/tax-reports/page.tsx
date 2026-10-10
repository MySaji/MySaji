"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { Download, Loader2, TrendingUp, FileSpreadsheet, Plus, CheckCircle2 } from "lucide-react"
import {
  getSecretaryRevenueReport, getTaxReports, createTaxReport, markTaxReportFiled,
  type RevenuePeriod, type RevenueReport, type SecretaryTaxReport,
} from "@/backend/actions/secretary-reports"

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]

export default function SecretaryRevenueReports() {
  const { t, formatMoney } = useLocalization()

  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState<RevenuePeriod>("monthly")
  const [year, setYear] = useState(CURRENT_YEAR)
  const [report, setReport] = useState<RevenueReport | null>(null)

  const [taxReports, setTaxReports] = useState<SecretaryTaxReport[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newPeriod, setNewPeriod] = useState("")
  const [newType, setNewType] = useState<"MONTHLY_VAT" | "QUARTERLY" | "ANNUAL" | "PAYE">("MONTHLY_VAT")
  const [newDueDate, setNewDueDate] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newTaxDue, setNewTaxDue] = useState("")
  const [createError, setCreateError] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const loadTaxReports = useCallback(async () => {
    setTaxReports(await getTaxReports())
  }, [])

  const load = useCallback(async (p: RevenuePeriod, y: number) => {
    setIsLoading(true)
    const r = await getSecretaryRevenueReport(p, y)
    setReport(r)
    setIsLoading(false)
  }, [])

  useEffect(() => { load(period, year) }, [load, period, year])
  useEffect(() => { loadTaxReports() }, [loadTaxReports])

  const totals = report ? report.rows.reduce(
    (acc, r) => ({
      grossVolume: acc.grossVolume + r.grossVolume,
      paymentCount: acc.paymentCount + r.paymentCount,
      withdrawalsPaidOut: acc.withdrawalsPaidOut + r.withdrawalsPaidOut,
      netRetained: acc.netRetained + r.netRetained,
    }),
    { grossVolume: 0, paymentCount: 0, withdrawalsPaidOut: 0, netRetained: 0 }
  ) : null

  const summaryCards = totals ? [
    { label: t("secretary.taxReports.statGrossVolume"), value: formatMoney(totals.grossVolume) },
    { label: t("secretary.taxReports.statCompletedPayments"), value: totals.paymentCount.toLocaleString() },
    { label: t("secretary.taxReports.statWithdrawalsPaidOut"), value: formatMoney(totals.withdrawalsPaidOut) },
    { label: t("secretary.taxReports.statNetRetained"), value: formatMoney(totals.netRetained) },
  ] : []

  const openCreateModal = () => {
    setNewPeriod("")
    setNewType("MONTHLY_VAT")
    setNewDueDate("")
    setNewAmount(report ? String(totals?.grossVolume ?? "") : "")
    setNewTaxDue("")
    setCreateError("")
    setShowCreateModal(true)
  }

  const submitCreateTaxReport = async () => {
    const amount = Number(newAmount)
    const taxDue = Number(newTaxDue)
    if (!Number.isFinite(amount) || !Number.isFinite(taxDue)) {
      setCreateError(t("secretary.taxReports.invalidAmounts"))
      return
    }
    setIsCreating(true)
    setCreateError("")
    const result = await createTaxReport({ period: newPeriod, type: newType, dueDate: newDueDate, amount, taxDue })
    setIsCreating(false)
    if (!result.success) { setCreateError(result.error); return }
    setShowCreateModal(false)
    await loadTaxReports()
  }

  const handleMarkFiled = async (id: string) => {
    setBusyId(id)
    const result = await markTaxReportFiled({ taxReportId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await loadTaxReports()
  }

  const handleExportCsv = () => {
    if (!report) return
    const header = "Period,Gross Volume,Payment Count,Withdrawals Paid Out,Net Retained"
    const lines = report.rows.map(r => `${r.label},${r.grossVolume},${r.paymentCount},${r.withdrawalsPaidOut},${r.netRetained}`)
    const csv = [header, ...lines].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `revenue-report-${report.period}-${report.year}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("secretary.taxReports.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("secretary.taxReports.subtitle")}</p>
        </div>
        <Button onClick={handleExportCsv} disabled={!report} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Download size={18} />
          {t("secretary.taxReports.exportCsv")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as RevenuePeriod)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="monthly">{t("secretary.taxReports.periodMonthly")}</option>
          <option value="quarterly">{t("secretary.taxReports.periodQuarterly")}</option>
          <option value="annual">{t("secretary.taxReports.periodAnnual")}</option>
        </select>
        {period !== "annual" && (
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {isLoading || !report ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map((stat, idx) => (
              <Card key={idx} className="p-6">
                <p className="text-xs text-muted-foreground mb-2">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
              </Card>
            ))}
          </div>

          <Card className="p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              {t("secretary.taxReports.breakdownBy", {
                unit: period === "monthly" ? t("secretary.taxReports.unitMonth") : period === "quarterly" ? t("secretary.taxReports.unitQuarter") : t("secretary.taxReports.unitYear"),
              })}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colPeriod")}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colGrossVolume")}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colPayments")}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colWithdrawalsPaidOut")}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colNetRetained")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {report.rows.map((row) => (
                    <tr key={row.label} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-6 py-4 text-xs font-medium text-gray-900 dark:text-white">{row.label}</td>
                      <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{formatMoney(row.grossVolume)}</td>
                      <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{row.paymentCount}</td>
                      <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{formatMoney(row.withdrawalsPaidOut)}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(row.netRetained)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-6 flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {t("secretary.taxReports.footerNote")}
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("secretary.taxReports.filedReportsTitle")}</h2>
              <Button onClick={openCreateModal} className="gap-2">
                <Plus size={16} />
                {t("secretary.taxReports.newReportButton")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-6">{t("secretary.taxReports.filedReportsHint")}</p>

            {taxReports.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.taxReports.noReportsFound")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colPeriodLabel")}</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colType")}</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colDueDate")}</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("secretary.taxReports.colTaxDue")}</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("secretary.reconciliation.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {taxReports.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-xs font-medium text-gray-900 dark:text-white">{r.period}</td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{t(`secretary.taxReports.type${r.type === "MONTHLY_VAT" ? "MonthlyVat" : r.type === "QUARTERLY" ? "Quarterly" : r.type === "ANNUAL" ? "Annual" : "Paye"}`)}</td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{new Date(r.dueDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(r.taxDue)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                            r.status === "FILED" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" :
                            r.status === "OVERDUE" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                            "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                          }`}>
                            {t(`secretary.taxReports.status${r.status === "FILED" ? "Filed" : r.status === "OVERDUE" ? "Overdue" : r.status === "PENDING" ? "Pending" : "Draft"}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.status !== "FILED" && (
                            <Button size="sm" variant="outline" className="gap-1 text-[11px] bg-transparent" disabled={busyId === r.id} onClick={() => handleMarkFiled(r.id)}>
                              {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                              {t("secretary.taxReports.markFiledButton")}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("secretary.taxReports.createModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium mb-1.5">{t("secretary.taxReports.periodLabel")}</label>
              <Input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder={t("secretary.taxReports.periodPlaceholder")} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">{t("secretary.taxReports.typeLabel")}</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as typeof newType)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-xs"
              >
                <option value="MONTHLY_VAT">{t("secretary.taxReports.typeMonthlyVat")}</option>
                <option value="QUARTERLY">{t("secretary.taxReports.typeQuarterly")}</option>
                <option value="ANNUAL">{t("secretary.taxReports.typeAnnual")}</option>
                <option value="PAYE">{t("secretary.taxReports.typePaye")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">{t("secretary.taxReports.dueDateLabel")}</label>
              <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("secretary.taxReports.reportedAmountLabel")}</label>
                <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("secretary.taxReports.taxDueLabel")}</label>
                <Input type="number" value={newTaxDue} onChange={(e) => setNewTaxDue(e.target.value)} placeholder="0" />
              </div>
            </div>
            {createError && <p className="text-xs text-red-600">{createError}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowCreateModal(false)} disabled={isCreating}>{t("common.cancel")}</Button>
              <Button className="flex-1" onClick={submitCreateTaxReport} disabled={!newPeriod.trim() || !newDueDate || isCreating}>
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : t("secretary.taxReports.saveReportButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
