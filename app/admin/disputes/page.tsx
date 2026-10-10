"use client"

import { useEffect, useState } from "react"
import { Search, Download, Eye, AlertTriangle, DollarSign, MessageSquare, Clock, Loader2 } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { KycDocumentViewer, type KycDocumentItem } from "@/frontend/components/kyc/kyc-document-viewer"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import {
  getDisputes, resolveDispute, closeDispute,
  type AdminDispute, type AdminDisputeStatus,
} from "@/backend/actions/admin-disputes"

export default function DisputesPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [disputes, setDisputes] = useState<AdminDispute[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState("All")
  const [selectedDispute, setSelectedDispute] = useState<AdminDispute | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [actionMode, setActionMode] = useState<"none" | "resolve" | "close">("none")
  const [resolutionText, setResolutionText] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const STATUS_LABEL: Record<AdminDisputeStatus, string> = {
    Open: t("admin.disputes.statusOpen"),
    "In Review": t("admin.disputes.statusInReview"),
    Escalated: t("admin.disputes.statusEscalated"),
    Resolved: t("admin.disputes.statusResolved"),
    Closed: t("admin.disputes.statusClosed"),
  }

  const SEVERITY_LABEL: Record<string, string> = {
    High: t("admin.disputes.severityHigh"),
    Medium: t("admin.disputes.severityMedium"),
    Low: t("admin.disputes.severityLow"),
  }

  const refresh = async () => {
    const data = await getDisputes()
    setDisputes(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filters = [
    { label: t("admin.disputes.statusAll"), type: "All", count: disputes.length },
    { label: STATUS_LABEL.Open, type: "Open", count: disputes.filter(d => d.status === "Open").length },
    { label: STATUS_LABEL["In Review"], type: "In Review", count: disputes.filter(d => d.status === "In Review").length },
    { label: STATUS_LABEL.Resolved, type: "Resolved", count: disputes.filter(d => d.status === "Resolved").length },
    { label: STATUS_LABEL.Closed, type: "Closed", count: disputes.filter(d => d.status === "Closed").length },
  ]

  const filteredDisputes = disputes.filter(d => {
    const matchesSearch = d.user.toLowerCase().includes(searchTerm.toLowerCase()) || d.disputeNumber.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = activeFilter === "All" || d.status === activeFilter
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: AdminDisputeStatus) => {
    switch (status) {
      case "Open": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
      case "In Review": return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
      case "Escalated": return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
      case "Resolved": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
      case "Closed": return "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
      default: return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "High": return "text-red-600 dark:text-red-400"
      case "Medium": return "text-yellow-600 dark:text-yellow-400"
      case "Low": return "text-blue-600 dark:text-blue-400"
      default: return "text-gray-600 dark:text-gray-400"
    }
  }

  const handleExportDisputes = () => {
    const data = {
      exportDate: new Date().toISOString(),
      totalDisputes: disputes.length,
      disputes: disputes.map(d => ({
        id: d.disputeNumber, user: d.user, job: d.job, amount: d.amount,
        reason: d.reason, status: d.status, severity: d.severity, date: d.date,
      }))
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `disputes-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const openDetail = (dispute: AdminDispute) => {
    setSelectedDispute(dispute)
    setActionMode("none")
    setResolutionText("")
    setRefundAmount("")
    setShowModal(true)
  }

  const handleResolve = async () => {
    if (!selectedDispute || !resolutionText.trim()) return
    setIsSubmitting(true)
    const result = await resolveDispute({
      disputeId: selectedDispute.id,
      resolution: resolutionText,
      refundAmount: refundAmount ? Number(refundAmount) : undefined,
    })
    setIsSubmitting(false)
    if (!result.success) { alert(result.error); return }
    setShowModal(false)
    await refresh()
  }

  const handleClose = async () => {
    if (!selectedDispute || !resolutionText.trim()) return
    setIsSubmitting(true)
    const result = await closeDispute({ disputeId: selectedDispute.id, resolution: resolutionText })
    setIsSubmitting(false)
    if (!result.success) { alert(result.error); return }
    setShowModal(false)
    await refresh()
  }

  const stats = [
    { label: t("admin.disputes.statTotalDisputes"), value: disputes.length, icon: AlertTriangle, color: "from-red-50 to-red-100" },
    { label: t("admin.disputes.statOpenCases"), value: disputes.filter(d => d.status === "Open").length, icon: Clock, color: "from-yellow-50 to-yellow-100" },
    { label: t("admin.disputes.statUnderReview"), value: disputes.filter(d => d.status === "In Review").length, icon: MessageSquare, color: "from-blue-50 to-blue-100" },
    { label: t("admin.disputes.statTotalAtStake"), value: formatMoney(disputes.filter(d => d.status === "Open" || d.status === "In Review").reduce((sum, d) => sum + d.amount, 0)), icon: DollarSign, color: "from-purple-50 to-purple-100" },
  ]

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const isFinal = selectedDispute?.status === "Resolved" || selectedDispute?.status === "Closed"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("admin.disputes.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.disputes.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={i} className={`p-4 border-0 shadow-lg bg-gradient-to-br ${stat.color} dark:from-gray-800 dark:to-gray-800`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{stat.label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
                </div>
                <Icon className="w-5 h-5 text-gray-400" />
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="w-full sm:flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t("admin.disputes.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
          />
        </div>
        <Button onClick={handleExportDisputes} className="bg-green-600 hover:bg-green-700 gap-2">
          <Download size={18} />
          <span className="hidden sm:inline">{t("admin.disputes.export")}</span>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {filters.map((filter) => (
          <button
            key={filter.type}
            onClick={() => setActiveFilter(filter.type)}
            className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors flex items-center gap-2 text-xs ${
              activeFilter === filter.type
                ? "bg-blue-600 text-white shadow-lg"
                : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {filter.label}
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-200 dark:bg-gray-700">{filter.count}</span>
          </button>
        ))}
      </div>

      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.disputes.colId")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("common.customer")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.disputes.colJobOrder")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.disputes.colAmount")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.disputes.colReason")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("common.status")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.disputes.colSeverity")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.disputes.colAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredDisputes.length > 0 ? filteredDisputes.map((dispute) => (
                <tr key={dispute.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{dispute.disputeNumber}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{dispute.user}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{dispute.job}</td>
                  <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(dispute.amount)}</td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">{dispute.reason}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${getStatusColor(dispute.status)}`}>
                      {STATUS_LABEL[dispute.status] ?? dispute.status}
                    </span>
                  </td>
                  <td className={`px-6 py-4 text-xs font-semibold ${getSeverityColor(dispute.severity)}`}>
                    {SEVERITY_LABEL[dispute.severity] ?? dispute.severity}
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => openDetail(dispute)} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-blue-600">
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">{t("admin.disputes.noDisputesFound")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.disputes.modalTitle")}</DialogTitle>
          </DialogHeader>
          {selectedDispute && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.disputes.idLabel")}</span>
                  <span className="font-semibold">{selectedDispute.disputeNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.disputes.userLabel")}</span>
                  <span className="font-semibold">{selectedDispute.user}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.disputes.jobOrderLabel")}</span>
                  <span className="font-semibold">{selectedDispute.job}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.disputes.amountAtStakeLabel")}</span>
                  <span className="font-semibold">{formatMoney(selectedDispute.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.disputes.reasonLabel")}</span>
                  <span className="font-semibold">{selectedDispute.reason}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("admin.disputes.descriptionLabel")}</span>
                  <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{selectedDispute.description}</p>
                </div>
                {selectedDispute.resolution && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("admin.disputes.resolutionLabel")}</span>
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{selectedDispute.resolution}</p>
                  </div>
                )}
              </div>

              {selectedDispute.photos.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">{t("admin.disputes.photosLabel")}</p>
                  <KycDocumentViewer
                    documents={selectedDispute.photos.map((url, i) => ({ label: `${t("admin.disputes.photoLabel")} ${i + 1}`, url })) satisfies KycDocumentItem[]}
                  />
                </div>
              )}

              {!isFinal && actionMode === "none" && (
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setActionMode("close")}>{t("admin.disputes.closeNoAction")}</Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setActionMode("resolve")}>{t("admin.disputes.resolve")}</Button>
                </div>
              )}

              {!isFinal && actionMode === "resolve" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5">{t("admin.disputes.resolutionNotesLabel")}</label>
                    <Textarea value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder={t("admin.disputes.resolutionPlaceholder")} className="min-h-[80px]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5">{t("admin.disputes.refundAmountLabel")}</label>
                    <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="0" />
                    <p className="text-[11px] text-muted-foreground mt-1">{t("admin.disputes.refundHint")}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setActionMode("none")} disabled={isSubmitting}>{t("admin.disputes.back")}</Button>
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleResolve} disabled={!resolutionText.trim() || isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.disputes.confirmResolution")}
                    </Button>
                  </div>
                </div>
              )}

              {!isFinal && actionMode === "close" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5">{t("admin.disputes.reasonForClosingLabel")}</label>
                    <Textarea value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder={t("admin.disputes.closingPlaceholder")} className="min-h-[80px]" />
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setActionMode("none")} disabled={isSubmitting}>{t("admin.disputes.back")}</Button>
                    <Button className="flex-1 bg-gray-600 hover:bg-gray-700" onClick={handleClose} disabled={!resolutionText.trim() || isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.disputes.confirmClose")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
