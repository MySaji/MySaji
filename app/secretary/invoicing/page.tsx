"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Search, Download, CheckCheck, Loader2, FileText } from "lucide-react"
import {
  getSecretaryInvoices, getSecretaryInvoiceStats, secretaryMarkInvoicePaid,
  type SecretaryInvoice, type SecretaryInvoiceStats,
} from "@/backend/actions/secretary-invoicing"

export default function SecretaryInvoicing() {
  const { t, formatMoney } = useLocalization()

  const [isLoading, setIsLoading] = useState(true)
  const [invoices, setInvoices] = useState<SecretaryInvoice[]>([])
  const [stats, setStats] = useState<SecretaryInvoiceStats | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const statusLabels: Record<string, string> = {
    draft: t("secretary.invoicing.statusDraft"),
    sent: t("secretary.invoicing.statusSent"),
    paid: t("secretary.invoicing.statusPaid"),
    overdue: t("secretary.invoicing.statOverdue"),
    cancelled: t("secretary.invoicing.statusCancelled"),
  }

  const load = useCallback(async () => {
    const [inv, s] = await Promise.all([getSecretaryInvoices(), getSecretaryInvoiceStats()])
    setInvoices(inv ?? [])
    setStats(s)
    setIsLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = invoices.filter(inv => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.providerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const summaryData = stats ? [
    { label: t("secretary.invoicing.statTotalInvoices"), value: stats.totalCount.toString() },
    { label: t("secretary.invoicing.statCollected"), value: formatMoney(stats.collected) },
    { label: t("secretary.invoicing.statPending"), value: formatMoney(stats.pending) },
    { label: t("secretary.invoicing.statOverdue"), value: formatMoney(stats.overdue) },
  ] : []

  const handleExport = () => {
    const data = { exportDate: new Date().toISOString(), totalInvoices: invoices.length, invoices }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleMarkPaid = async (id: string) => {
    setBusyId(id)
    setError("")
    const result = await secretaryMarkInvoicePaid(id)
    if (!result.success) setError(result.error)
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("secretary.invoicing.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("secretary.invoicing.subtitle")}</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="bg-transparent gap-2">
          <Download size={18} />
          {t("secretary.invoicing.export")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryData.map((stat, idx) => (
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
            placeholder={t("secretary.invoicing.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">{t("secretary.invoicing.filterAllStatuses")}</option>
          <option value="draft">{t("secretary.invoicing.statusDraft")}</option>
          <option value="sent">{t("secretary.invoicing.statusSent")}</option>
          <option value="paid">{t("secretary.invoicing.statusPaid")}</option>
          <option value="overdue">{t("secretary.invoicing.statOverdue")}</option>
          <option value="cancelled">{t("secretary.invoicing.statusCancelled")}</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <FileText className="w-6 h-6" />
          {t("secretary.invoicing.invoicesTitle")}
        </h2>
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.invoicing.noInvoicesFound")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.invoicing.colInvoiceNumber")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.provider")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.invoicing.colClient")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.invoicing.colTotal")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.invoicing.colDueDate")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("secretary.invoicing.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-6 py-4 text-xs font-medium text-gray-900 dark:text-white">{inv.invoiceNumber}</td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{inv.providerName}</td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{inv.customerName}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(inv.total)}</td>
                    <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-xs">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-medium capitalize ${
                        inv.status === "paid" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                        inv.status === "overdue" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                        inv.status === "cancelled" ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" :
                        inv.status === "sent" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                        "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                      }`}>
                        {statusLabels[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {inv.status === "sent" && (
                        <button
                          disabled={busyId === inv.id}
                          onClick={() => handleMarkPaid(inv.id)}
                          title={t("secretary.invoicing.markAsPaidTooltip")}
                          className="p-2 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <CheckCheck size={18} />
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
    </div>
  )
}
