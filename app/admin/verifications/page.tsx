"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Download, Eye, CheckCircle, Clock, UserCheck, AlertCircle, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { KycDocumentViewer, type KycDocumentItem } from "@/components/kyc/kyc-document-viewer"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getVerifications, approveVerification, rejectVerification,
  type AdminVerification,
} from "@/lib/actions/admin-verifications"

const getStatusColor = (status: string) => {
  switch (status) {
    case "Approved": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
    case "Pending": return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
    case "Rejected": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
    default: return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
  }
}

export default function VerificationsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [verifications, setVerifications] = useState<AdminVerification[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState("All")
  const [selectedVerification, setSelectedVerification] = useState<AdminVerification | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showRejectReason, setShowRejectReason] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const STATUS_LABEL: Record<string, string> = {
    Pending: t("admin.verifications.statusPending"),
    Approved: t("admin.verifications.statusApproved"),
    Rejected: t("admin.verifications.statusRejected"),
  }

  const refresh = async () => {
    const data = await getVerifications()
    setVerifications(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filteredVerifications = useMemo(
    () => verifications.filter((v) => {
      const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || v.email.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesFilter = activeFilter === "All" || v.status === activeFilter
      return matchesSearch && matchesFilter
    }),
    [searchTerm, activeFilter, verifications],
  )

  const filters = [
    { label: t("admin.verifications.filterAll"), type: "All", count: verifications.length },
    { label: STATUS_LABEL.Pending, type: "Pending", count: verifications.filter((v) => v.status === "Pending").length },
    { label: STATUS_LABEL.Approved, type: "Approved", count: verifications.filter((v) => v.status === "Approved").length },
    { label: STATUS_LABEL.Rejected, type: "Rejected", count: verifications.filter((v) => v.status === "Rejected").length },
  ]

  const stats = [
    { label: t("admin.verifications.statTotalSubmissions"), value: verifications.length, icon: UserCheck, color: "from-blue-50 to-blue-100" },
    { label: STATUS_LABEL.Approved, value: verifications.filter((v) => v.status === "Approved").length, icon: CheckCircle, color: "from-emerald-50 to-emerald-100" },
    { label: t("admin.verifications.statPendingReview"), value: verifications.filter((v) => v.status === "Pending").length, icon: Clock, color: "from-yellow-50 to-yellow-100" },
    { label: STATUS_LABEL.Rejected, value: verifications.filter((v) => v.status === "Rejected").length, icon: AlertCircle, color: "from-red-50 to-red-100" },
  ]

  const handleExportVerifications = () => {
    const data = {
      exportDate: new Date().toISOString(),
      totalVerifications: verifications.length,
      verifications: verifications.map((v) => ({
        id: v.id, name: v.name, email: v.email, role: v.role,
        documentType: v.documentType, status: v.status, submittedDate: v.submittedDate,
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `verifications-export-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleApprove = async (kycDocumentId: string) => {
    setIsSubmitting(true)
    const result = await approveVerification({ kycDocumentId })
    setIsSubmitting(false)
    if (!result.success) { alert(result.error); return }
    setShowModal(false)
    await refresh()
  }

  const handleReject = async (kycDocumentId: string) => {
    if (!rejectReason.trim()) return
    setIsSubmitting(true)
    const result = await rejectVerification({ kycDocumentId, reason: rejectReason })
    setIsSubmitting(false)
    if (!result.success) { alert(result.error); return }
    setShowModal(false)
    setShowRejectReason(false)
    setRejectReason("")
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("admin.verifications.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.verifications.subtitle")}</p>
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
            placeholder={t("admin.verifications.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
          />
        </div>
        <Button onClick={handleExportVerifications} className="bg-green-600 hover:bg-green-700 gap-2">
          <Download size={18} />
          <span className="hidden sm:inline">{t("admin.verifications.export")}</span>
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
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.verifications.colName")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("auth.email")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.verifications.colRole")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.verifications.colDocument")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("common.status")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.verifications.colAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredVerifications.length > 0 ? filteredVerifications.map((verification) => (
                <tr key={verification.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{verification.name}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{verification.email}</td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">{verification.role}</td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">{verification.documentType}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${getStatusColor(verification.status)}`}>
                      {STATUS_LABEL[verification.status] ?? verification.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => { setSelectedVerification(verification); setShowRejectReason(false); setRejectReason(""); setShowModal(true) }}
                      className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-blue-600"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">{t("admin.verifications.noVerificationsFound")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.verifications.modalTitle")}</DialogTitle>
          </DialogHeader>
          {selectedVerification && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.verifications.nameLabel")}</span>
                  <span className="font-semibold">{selectedVerification.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.verifications.emailLabel")}</span>
                  <span className="font-semibold text-blue-600">{selectedVerification.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.verifications.roleLabel")}</span>
                  <span className="font-semibold">{selectedVerification.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{t("admin.verifications.documentTypeLabel")}</span>
                  <span className="font-semibold">{selectedVerification.documentType}</span>
                </div>
                {selectedVerification.documentNumber && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">{t("admin.verifications.documentNumberLabel")}</span>
                    <span className="font-semibold">{selectedVerification.documentNumber}</span>
                  </div>
                )}
                {selectedVerification.rejectionReason && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">{t("admin.verifications.rejectionReasonLabel")}</span>
                    <span className="font-semibold text-red-600">{selectedVerification.rejectionReason}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">{t("admin.verifications.submittedDocuments")}</p>
                <KycDocumentViewer
                  documents={[
                    { label: t("admin.verifications.idFront"), url: selectedVerification.idFileUrl },
                    ...(selectedVerification.idBackFileUrl ? [{ label: t("admin.verifications.idBack"), url: selectedVerification.idBackFileUrl }] : []),
                    ...(selectedVerification.selfieFileUrl ? [{ label: t("admin.verifications.selfie"), url: selectedVerification.selfieFileUrl }] : []),
                  ] satisfies KycDocumentItem[]}
                />
              </div>

              {selectedVerification.status === "Pending" && (
                <>
                  {showRejectReason && (
                    <div>
                      <label className="block text-xs font-medium mb-1.5">{t("admin.verifications.rejectionReasonInputLabel")}</label>
                      <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t("admin.verifications.rejectReasonPlaceholder")} className="min-h-[80px]" />
                    </div>
                  )}
                  <div className="flex gap-3">
                    {showRejectReason ? (
                      <>
                        <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowRejectReason(false)} disabled={isSubmitting}>{t("common.cancel")}</Button>
                        <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => handleReject(selectedVerification.id)} disabled={!rejectReason.trim() || isSubmitting}>
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.verifications.confirmReject")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowRejectReason(true)} disabled={isSubmitting}>{t("admin.verifications.reject")}</Button>
                        <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(selectedVerification.id)} disabled={isSubmitting}>
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.verifications.approve")}
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
