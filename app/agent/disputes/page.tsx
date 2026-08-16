"use client"

import { useEffect, useState, useCallback } from "react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Eye, Inbox, X, Search, Download, CheckCheck, XCircle, Loader2, Send, ArrowUpCircle } from "lucide-react"
import { KycDocumentViewer, type KycDocumentItem } from "@/components/kyc/kyc-document-viewer"
import {
  getAgentDisputes, getDisputeNotes, claimDispute, addDisputeNote, resolveDisputeAsAgent, closeDisputeAsAgent,
  escalateDisputeAsAgent,
  type AgentDispute, type AgentDisputeNote,
} from "@/lib/actions/agent-disputes"

export default function AgentDisputes() {
  const { t, formatMoney } = useLocalization()

  const [isLoading, setIsLoading] = useState(true)
  const [disputes, setDisputes] = useState<AgentDispute[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const [viewing, setViewing] = useState<AgentDispute | null>(null)
  const [notes, setNotes] = useState<AgentDisputeNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteText, setNoteText] = useState("")

  const [resolving, setResolving] = useState<AgentDispute | null>(null)
  const [resolutionText, setResolutionText] = useState("")
  const [refundAmount, setRefundAmount] = useState("")

  const [closing, setClosing] = useState<AgentDispute | null>(null)
  const [closeReason, setCloseReason] = useState("")

  const [escalating, setEscalating] = useState<AgentDispute | null>(null)
  const [escalateReason, setEscalateReason] = useState("")

  const load = useCallback(async () => {
    const d = await getAgentDisputes()
    setDisputes(d ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = disputes.filter(d => {
    const matchesSearch = d.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.disputeNumber.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || d.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const stats = [
    { label: t("agent.disputes.statTotal"), value: disputes.length },
    { label: t("agent.common.availableToClaim"), value: disputes.filter(d => !d.isMine).length },
    { label: t("agent.disputes.statMyOpenCases"), value: disputes.filter(d => d.isMine && (d.status === "Open" || d.status === "In Review" || d.status === "Escalated")).length },
    { label: t("agent.disputes.statMyResolved"), value: disputes.filter(d => d.isMine && (d.status === "Resolved" || d.status === "Closed")).length },
  ]

  const handleExport = () => {
    const data = { exportDate: new Date().toISOString(), totalDisputes: disputes.length, disputes }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `disputes-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleClaim = async (id: string) => {
    setBusyId(id)
    setError("")
    const result = await claimDispute({ disputeId: id })
    if (!result.success) setError(result.error)
    await load()
    setBusyId(null)
  }

  const openView = async (dispute: AgentDispute) => {
    setViewing(dispute)
    setNoteText("")
    setNotesLoading(true)
    const n = await getDisputeNotes(dispute.id)
    setNotes(n ?? [])
    setNotesLoading(false)
  }

  const submitNote = async () => {
    if (!viewing || !noteText.trim()) return
    const result = await addDisputeNote({ disputeId: viewing.id, message: noteText.trim() })
    if (result.success) {
      setNoteText("")
      const n = await getDisputeNotes(viewing.id)
      setNotes(n ?? [])
    }
  }

  const openResolve = (dispute: AgentDispute) => {
    setResolving(dispute)
    setResolutionText("")
    setRefundAmount("")
    setError("")
  }

  const submitResolve = async () => {
    if (!resolving) return
    setBusyId(resolving.id)
    setError("")
    const result = await resolveDisputeAsAgent({
      disputeId: resolving.id,
      resolution: resolutionText,
      refundAmount: refundAmount ? Number(refundAmount) : undefined,
    })
    if (!result.success) { setError(result.error); setBusyId(null); return }
    setResolving(null)
    setViewing(null)
    await load()
    setBusyId(null)
  }

  const openClose = (dispute: AgentDispute) => {
    setClosing(dispute)
    setCloseReason("")
    setError("")
  }

  const openEscalate = (dispute: AgentDispute) => {
    setEscalating(dispute)
    setEscalateReason("")
    setError("")
  }

  const submitEscalate = async () => {
    if (!escalating) return
    setBusyId(escalating.id)
    setError("")
    const result = await escalateDisputeAsAgent({ disputeId: escalating.id, reason: escalateReason })
    if (!result.success) { setError(result.error); setBusyId(null); return }
    setEscalating(null)
    setViewing(null)
    await load()
    setBusyId(null)
  }

  const submitClose = async () => {
    if (!closing) return
    setBusyId(closing.id)
    setError("")
    const result = await closeDisputeAsAgent({ disputeId: closing.id, resolution: closeReason })
    if (!result.success) { setError(result.error); setBusyId(null); return }
    setClosing(null)
    setViewing(null)
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
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("agent.disputes.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("agent.disputes.subtitle")}</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="bg-transparent gap-2">
          <Download size={18} />
          {t("agent.common.export")}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <Card key={idx} className="p-4">
            <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t("agent.disputes.searchPlaceholder")}
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
          <option value="all">{t("agent.disputes.filterAllStatuses")}</option>
          <option value="Open">{t("agent.disputes.filterOpen")}</option>
          <option value="In Review">{t("agent.disputes.filterInReview")}</option>
          <option value="Escalated">{t("agent.disputes.filterEscalated")}</option>
          <option value="Resolved">{t("agent.disputes.filterResolved")}</option>
          <option value="Closed">{t("agent.disputes.filterClosed")}</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Card className="p-6">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{t("agent.disputes.noDisputesFound")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.id")}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("common.customer")}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("common.provider")}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.severity")}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.amount")}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(dispute => (
                  <tr key={dispute.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{dispute.disputeNumber}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{dispute.customer}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{dispute.provider ?? t("agent.common.notAvailable")}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        dispute.status === "Open" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                        dispute.status === "In Review" || dispute.status === "Escalated" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" :
                        "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      }`}>
                        {dispute.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        dispute.severity === "High" ? "text-red-600" : dispute.severity === "Medium" ? "text-yellow-600" : "text-blue-600"
                      }`}>
                        {dispute.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{formatMoney(dispute.amount)}</td>
                    <td className="px-6 py-4">
                      {!dispute.isMine ? (
                        <button
                          disabled={busyId === dispute.id}
                          onClick={() => handleClaim(dispute.id)}
                          title={t("agent.disputes.claimTooltip")}
                          className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Inbox size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={() => openView(dispute)}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        >
                          <Eye size={18} />
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

      {viewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t("agent.disputes.disputeModalTitle", { number: viewing.disputeNumber })}</h2>
                <button onClick={() => setViewing(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500 dark:text-gray-400">{t("common.customer")}:</span> {viewing.customer}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("common.provider")}:</span> {viewing.provider ?? t("agent.common.notAvailable")}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("agent.disputes.labelContext")}:</span> {viewing.context}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("agent.disputes.labelReason")}:</span> {viewing.reason}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("agent.disputes.labelDescription")}:</span> {viewing.description}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("agent.common.amount")}:</span> {formatMoney(viewing.amount)}</p>
                <p><span className="text-gray-500 dark:text-gray-400">{t("common.status")}:</span> {viewing.status}</p>
                {viewing.resolution && <p><span className="text-gray-500 dark:text-gray-400">{t("agent.disputes.labelResolution")}:</span> {viewing.resolution}</p>}
              </div>

              {viewing.photos.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t("agent.disputes.photosHeading")}</h3>
                  <KycDocumentViewer
                    documents={viewing.photos.map((url, i) => ({ label: `${t("agent.disputes.photoLabel")} ${i + 1}`, url })) satisfies KycDocumentItem[]}
                  />
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t("agent.disputes.notesHeading")}</h3>
                {notesLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : notes.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 py-2">{t("agent.disputes.noNotesYet")}</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {notes.map(n => (
                      <div key={n.id} className={`text-xs rounded-lg px-3 py-2 ${n.isMine ? "bg-indigo-50 dark:bg-indigo-900/20" : "bg-gray-50 dark:bg-gray-700"}`}>
                        <p className="font-semibold text-gray-900 dark:text-white">{n.senderName}</p>
                        <p className="text-gray-700 dark:text-gray-300">{n.message}</p>
                        <p className="text-gray-400 mt-0.5">{new Date(n.time).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
                {viewing.status !== "Resolved" && viewing.status !== "Closed" && (
                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitNote()}
                      placeholder={t("agent.disputes.addNotePlaceholder")}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={submitNote} className="p-2 bg-indigo-600 rounded-lg text-white hover:bg-indigo-700">
                      <Send size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setViewing(null)}>{t("common.close")}</Button>
                {viewing.status !== "Resolved" && viewing.status !== "Closed" && (
                  <>
                    <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => openClose(viewing)}>
                      <XCircle size={16} className="mr-1" /> {t("agent.disputes.closeCase")}
                    </Button>
                    <Button variant="outline" className="flex-1 bg-transparent text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20" onClick={() => openEscalate(viewing)}>
                      <ArrowUpCircle size={16} className="mr-1" /> {t("agent.disputes.escalate")}
                    </Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => openResolve(viewing)}>
                      <CheckCheck size={16} className="mr-1" /> {t("agent.disputes.resolve")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {resolving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t("agent.disputes.resolveModalTitle")}</h2>
                <button onClick={() => setResolving(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t("agent.disputes.labelResolution")}</label>
                <textarea
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t("agent.disputes.refundAmountLabel")}</label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setResolving(null)}>{t("common.cancel")}</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={busyId === resolving.id} onClick={submitResolve}>
                  {busyId === resolving.id ? t("agent.disputes.resolving") : t("agent.disputes.confirmResolve")}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {closing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t("agent.disputes.closeModalTitle")}</h2>
                <button onClick={() => setClosing(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t("agent.disputes.closeReasonLabel")}</label>
                <textarea
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setClosing(null)}>{t("common.cancel")}</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700" disabled={busyId === closing.id} onClick={submitClose}>
                  {busyId === closing.id ? t("agent.disputes.closing") : t("agent.disputes.confirmClose")}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {escalating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t("agent.disputes.escalateModalTitle")}</h2>
                <button onClick={() => setEscalating(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("agent.disputes.escalateHint")}</p>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t("agent.disputes.escalateReasonLabel")}</label>
                <textarea
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setEscalating(null)}>{t("common.cancel")}</Button>
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={!escalateReason.trim() || busyId === escalating.id} onClick={submitEscalate}>
                  {busyId === escalating.id ? <Loader2 className="w-4 h-4 animate-spin" /> : t("agent.disputes.confirmEscalate")}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
