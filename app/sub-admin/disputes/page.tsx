"use client"

import { useEffect, useState } from "react"
import { Search, Eye, AlertTriangle, DollarSign, MessageSquare, Clock, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { KycDocumentViewer, type KycDocumentItem } from "@/components/kyc/kyc-document-viewer"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getSubAdminDisputes, resolveDisputeAsSubAdmin, closeDisputeAsSubAdmin,
  type SubAdminDispute, type SubAdminDisputeStatus,
} from "@/lib/actions/sub-admin-disputes"

export default function SubAdminDisputesPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [disputes, setDisputes] = useState<SubAdminDispute[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState("All")
  const [selectedDispute, setSelectedDispute] = useState<SubAdminDispute | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [actionMode, setActionMode] = useState<"none" | "resolve" | "close">("none")
  const [resolutionText, setResolutionText] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const STATUS_LABEL: Record<SubAdminDisputeStatus, string> = {
    Open: t("subAdmin.disputes.statusOpen"),
    "In Review": t("subAdmin.disputes.statusInReview"),
    Escalated: t("subAdmin.disputes.statusEscalated"),
    Resolved: t("subAdmin.disputes.statusResolved"),
    Closed: t("subAdmin.disputes.statusClosed"),
  }

  const SEVERITY_LABEL: Record<string, string> = {
    High: t("subAdmin.disputes.severityHigh"),
    Medium: t("subAdmin.disputes.severityMedium"),
    Low: t("subAdmin.disputes.severityLow"),
  }

  const refresh = async () => {
    const data = await getSubAdminDisputes()
    setDisputes(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filters = [
    { label: t("subAdmin.disputes.statusAll"), type: "All", count: disputes.length },
    { label: STATUS_LABEL.Open, type: "Open", count: disputes.filter(d => d.status === "Open").length },
    { label: STATUS_LABEL["In Review"], type: "In Review", count: disputes.filter(d => d.status === "In Review").length },
    { label: STATUS_LABEL.Escalated, type: "Escalated", count: disputes.filter(d => d.status === "Escalated").length },
    { label: STATUS_LABEL.Resolved, type: "Resolved", count: disputes.filter(d => d.status === "Resolved").length },
    { label: STATUS_LABEL.Closed, type: "Closed", count: disputes.filter(d => d.status === "Closed").length },
  ]

  const filteredDisputes = disputes.filter(d => {
    const matchesSearch = d.user.toLowerCase().includes(searchTerm.toLowerCase()) || d.disputeNumber.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = activeFilter === "All" || d.status === activeFilter
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: SubAdminDisputeStatus) => {
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

  const openDetail = (dispute: SubAdminDispute) => {
    setSelectedDispute(dispute)
    setActionMode("none")
    setResolutionText("")
    setRefundAmount("")
    setShowModal(true)
  }

  const handleResolve = async () => {
    if (!selectedDispute || !resolutionText.trim()) return
    setIsSubmitting(true)
    const result = await resolveDisputeAsSubAdmin({
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
    const result = await closeDisputeAsSubAdmin({ disputeId: selectedDispute.id, resolution: resolutionText })
    setIsSubmitting(false)
    if (!result.success) { alert(result.error); return }
    setShowModal(false)
    await refresh()
  }

  const stats = [
    { label: t("subAdmin.disputes.statTotalDisputes"), value: disputes.length, icon: AlertTriangle },
    { label: t("subAdmin.disputes.statOpenCases"), value: disputes.filter(d => d.status === "Open").length, icon: Clock },
    { label: t("subAdmin.disputes.statUnderReview"), value: disputes.filter(d => d.status === "In Review").length, icon: MessageSquare },
    { label: t("subAdmin.disputes.statTotalAtStake"), value: formatMoney(disputes.filter(d => d.status === "Open" || d.status === "In Review").reduce((sum, d) => sum + d.amount, 0)), icon: DollarSign },
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
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{t("subAdmin.disputes.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{t("subAdmin.disputes.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={i} className="p-4 border-0 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
                </div>
                <Icon className="w-5 h-5 text-gray-400" />
              </div>
            </Card>
          )
        })}
      </div>

      <div className="w-full sm:max-w-md relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder={t("subAdmin.disputes.searchPlaceholder")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {filters.map((filter) => (
          <button
            key={filter.type}
            onClick={() => setActiveFilter(filter.type)}
            className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
              activeFilter === filter.type
                ? "bg-blue-600 text-white shadow-lg"
                : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {filter.label}
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 dark:bg-gray-700">{filter.count}</span>
          </button>
        ))}
      </div>

      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.disputes.colId")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.customer")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">{t("subAdmin.disputes.colJobOrder")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.disputes.colAmount")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">{t("subAdmin.disputes.colSeverity")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.disputes.colAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredDisputes.length > 0 ? filteredDisputes.map((dispute) => (
                <tr key={dispute.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{dispute.disputeNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{dispute.user}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">{dispute.job}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{formatMoney(dispute.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusColor(dispute.status)}`}>
                      {STATUS_LABEL[dispute.status] ?? dispute.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm font-semibold hidden sm:table-cell ${getSeverityColor(dispute.severity)}`}>
                    {SEVERITY_LABEL[dispute.severity] ?? dispute.severity}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openDetail(dispute)} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-blue-600" aria-label={t("subAdmin.disputes.viewDetailsLabel")}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">{t("subAdmin.disputes.noDisputesFound")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("subAdmin.disputes.modalTitle")}</DialogTitle>
          </DialogHeader>
          {selectedDispute && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("subAdmin.disputes.idLabel")}</span>
                  <span className="font-semibold">{selectedDispute.disputeNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("subAdmin.disputes.userLabel")}</span>
                  <span className="font-semibold">{selectedDispute.user}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("subAdmin.disputes.jobOrderLabel")}</span>
                  <span className="font-semibold">{selectedDispute.job}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("subAdmin.disputes.amountAtStakeLabel")}</span>
                  <span className="font-semibold">{formatMoney(selectedDispute.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("subAdmin.disputes.reasonLabel")}</span>
                  <span className="font-semibold">{selectedDispute.reason}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">{t("subAdmin.disputes.descriptionLabel")}</span>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{selectedDispute.description}</p>
                </div>
                {selectedDispute.resolution && (
                  <div>
                    <span className="text-sm text-muted-foreground">{t("subAdmin.disputes.resolutionLabel")}</span>
                    <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">{selectedDispute.resolution}</p>
                  </div>
                )}
              </div>

              {selectedDispute.photos.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1.5">{t("subAdmin.disputes.photosLabel")}</p>
                  <KycDocumentViewer
                    documents={selectedDispute.photos.map((url, i) => ({ label: `${t("subAdmin.disputes.photoLabel")} ${i + 1}`, url })) satisfies KycDocumentItem[]}
                  />
                </div>
              )}

              {!isFinal && actionMode === "none" && (
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setActionMode("close")}>{t("subAdmin.disputes.closeNoAction")}</Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setActionMode("resolve")}>{t("subAdmin.disputes.resolve")}</Button>
                </div>
              )}

              {!isFinal && actionMode === "resolve" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t("subAdmin.disputes.resolutionNotesLabel")}</label>
                    <Textarea value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder={t("subAdmin.disputes.resolutionPlaceholder")} className="min-h-[80px]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t("subAdmin.disputes.refundAmountLabel")}</label>
                    <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="0" />
                    <p className="text-xs text-muted-foreground mt-1">{t("subAdmin.disputes.refundHint")}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setActionMode("none")} disabled={isSubmitting}>{t("subAdmin.disputes.back")}</Button>
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleResolve} disabled={!resolutionText.trim() || isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("subAdmin.disputes.confirmResolution")}
                    </Button>
                  </div>
                </div>
              )}

              {!isFinal && actionMode === "close" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t("subAdmin.disputes.reasonForClosingLabel")}</label>
                    <Textarea value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder={t("subAdmin.disputes.closingPlaceholder")} className="min-h-[80px]" />
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setActionMode("none")} disabled={isSubmitting}>{t("subAdmin.disputes.back")}</Button>
                    <Button className="flex-1 bg-gray-600 hover:bg-gray-700" onClick={handleClose} disabled={!resolutionText.trim() || isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("subAdmin.disputes.confirmClose")}
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
