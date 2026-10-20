"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Download, Eye, CheckCircle, Clock, UserCheck, AlertCircle, Loader2 } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { WorkflowGuide, WorkspaceRefresh } from "@/frontend/components/workspace-panels"
import { KycDocumentViewer, type KycDocumentItem } from "@/frontend/components/kyc/kyc-document-viewer"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import {
  getVerifications, approveVerification, rejectVerification,
  type AdminVerification,
} from "@/backend/actions/admin-verifications"

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
  const [pageError, setPageError] = useState("")
  const [actionError, setActionError] = useState("")
  const [notice, setNotice] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number>()
  const [roleFilter, setRoleFilter] = useState("ALL")
  const [sort, setSort] = useState("oldest")
  const [page, setPage] = useState(1)

  const STATUS_LABEL: Record<string, string> = {
    Pending: t("admin.verifications.statusPending"),
    Approved: t("admin.verifications.statusApproved"),
    Rejected: t("admin.verifications.statusRejected"),
  }

  const refresh = async () => {
    setRefreshing(true); setPageError("")
    try { setVerifications(await getVerifications()); setUpdatedAt(Date.now()) }
    catch { setPageError("The verification queue could not be loaded. Try refreshing.") }
    finally { setRefreshing(false) }
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filteredVerifications = useMemo(
    () => verifications.filter((v) => {
      const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || v.email.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesFilter = activeFilter === "All" || v.status === activeFilter
      return matchesSearch && matchesFilter && (roleFilter === "ALL" || v.role === roleFilter)
    }).sort((a, b) => sort === "oldest" ? Date.parse(a.submittedDate) - Date.parse(b.submittedDate) : Date.parse(b.submittedDate) - Date.parse(a.submittedDate)),
    [searchTerm, activeFilter, verifications, roleFilter, sort],
  )

  useEffect(() => { setPage(1) }, [searchTerm, activeFilter, roleFilter, sort])
  const totalPages = Math.max(1, Math.ceil(filteredVerifications.length / 12))
  const currentPage = Math.min(page, totalPages)
  const visibleVerifications = filteredVerifications.slice((currentPage - 1) * 12, currentPage * 12)

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

  const review = async (kycDocumentId: string, decision: "approve" | "reject") => {
    if (isSubmitting || (decision === "reject" && !rejectReason.trim())) return
    setIsSubmitting(true); setActionError(""); setNotice("")
    try {
      const result = decision === "approve" ? await approveVerification({ kycDocumentId }) : await rejectVerification({ kycDocumentId, reason: rejectReason })
      if (!result.success) { setActionError(result.error); return }
      setShowModal(false); setShowRejectReason(false); setRejectReason("")
      setNotice(decision === "approve" ? "Verification approved." : "Verification rejected with your reason.")
      await refresh()
    } catch { setActionError("We could not confirm this decision. Refresh the queue before repeating it.") }
    finally { setIsSubmitting(false) }
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
            aria-label="Search verifications" placeholder={t("admin.verifications.searchPlaceholder")}
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

      <WorkflowGuide title="Verification review" steps={[{ title: "Prioritise the queue", description: "Use status and account filters. Review oldest submissions first." }, { title: "Inspect the evidence", description: "Open each record and inspect the submitted documents." }, { title: "Record a decision", description: "Approve the evidence or give a clear reason when rejecting it." }]} />
      <WorkspaceRefresh refreshing={refreshing} updatedAt={updatedAt} refresh={() => void refresh()} />
      {pageError && <p role="alert" className="rounded-xl border border-red-200 p-4 text-sm text-red-700">{pageError}</p>}
      {notice && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-950">{notice}</p>}
      <div className="workspace-filterbar"><label>Account role<select value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="ALL">All roles</option>{[...new Set(verifications.map(item => item.role))].sort().map(role => <option key={role} value={role}>{role}</option>)}</select></label><label>Submission order<select value={sort} onChange={event => setSort(event.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label></div>
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
              {filteredVerifications.length > 0 ? visibleVerifications.map((verification) => (
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
                      aria-label={`Review verification for ${verification.name}`} onClick={() => { setActionError(""); setSelectedVerification(verification); setShowRejectReason(false); setRejectReason(""); setShowModal(true) }}
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

      <nav aria-label="Verification pages" className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-muted-foreground">{filteredVerifications.length} results. Page {currentPage} of {totalPages}.</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button></div></nav>
      <Dialog open={showModal} onOpenChange={open => { if (!isSubmitting) setShowModal(open) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.verifications.modalTitle")}</DialogTitle>
          </DialogHeader>
          {actionError && <p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{actionError}</p>}
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
                        <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => review(selectedVerification.id, "reject")} disabled={!rejectReason.trim() || isSubmitting}>
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.verifications.confirmReject")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowRejectReason(true)} disabled={isSubmitting}>{t("admin.verifications.reject")}</Button>
                        <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => review(selectedVerification.id, "approve")} disabled={isSubmitting}>
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
