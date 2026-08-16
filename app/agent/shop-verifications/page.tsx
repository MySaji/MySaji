"use client"

import { useEffect, useState } from "react"
import { Search, Eye, CheckCircle, X as XIcon, Loader2, Store, Wrench } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { KycDocumentViewer, type KycDocumentItem } from "@/components/kyc/kyc-document-viewer"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getAgentVerifications, approveAgentVerification, rejectAgentVerification,
  type AgentVerification,
} from "@/lib/actions/agent-verifications"

export default function AgentVerificationsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [verifications, setVerifications] = useState<AgentVerification[]>([])
  const [filter, setFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<AgentVerification | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showRejectReason, setShowRejectReason] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const refresh = async () => {
    const data = await getAgentVerifications()
    setVerifications(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filtered = verifications.filter(v => {
    const ms = v.displayName.toLowerCase().includes(search.toLowerCase()) || v.ownerName.toLowerCase().includes(search.toLowerCase())
    const mf = filter === "All" || v.status === filter
    return ms && mf
  })

  const getColor = (s: string) => s === "Approved" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700" : s === "Pending" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700" : "bg-red-100 dark:bg-red-900/30 text-red-700"

  const handleApprove = async (id: string) => {
    setBusyId(id)
    const result = await approveAgentVerification({ kycDocumentId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
    setShowModal(false)
  }

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return
    setBusyId(id)
    const result = await rejectAgentVerification({ kycDocumentId: id, reason: rejectReason })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    setShowRejectReason(false)
    setRejectReason("")
    await refresh()
    setShowModal(false)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const filterLabels: Record<string, string> = {
    All: t("agent.shopVerifications.filterAll"),
    Pending: t("agent.shopVerifications.statPending"),
    Approved: t("agent.shopVerifications.statApproved"),
    Rejected: t("agent.shopVerifications.statRejected"),
  }

  const roleLabel = (role: AgentVerification["role"]) =>
    role === "SHOPKEEPER" ? t("agent.shopVerifications.roleShop") : t("agent.shopVerifications.roleProvider")
  const RoleIcon = (role: AgentVerification["role"]) => (role === "SHOPKEEPER" ? Store : Wrench)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{t("agent.shopVerifications.title")}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("agent.shopVerifications.subtitle")}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 border-0 shadow-sm"><p className="text-xs text-gray-500">{t("agent.shopVerifications.statPending")}</p><p className="text-xl font-bold text-amber-600">{verifications.filter(v=>v.status==="Pending").length}</p></Card>
        <Card className="p-3 border-0 shadow-sm"><p className="text-xs text-gray-500">{t("agent.shopVerifications.statApproved")}</p><p className="text-xl font-bold text-emerald-600">{verifications.filter(v=>v.status==="Approved").length}</p></Card>
        <Card className="p-3 border-0 shadow-sm"><p className="text-xs text-gray-500">{t("agent.shopVerifications.statRejected")}</p><p className="text-xl font-bold text-red-600">{verifications.filter(v=>v.status==="Rejected").length}</p></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("agent.shopVerifications.searchPlaceholder")} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {["All","Pending","Approved","Rejected"].map(f => (
            <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${filter===f?"bg-indigo-600 text-white":"bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"}`}>{filterLabels[f]}</button>
          ))}
        </div>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.shopVerifications.colShop")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">{t("agent.shopVerifications.colType")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">{t("agent.shopVerifications.colDocuments")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t("agent.shopVerifications.noneFound")}</td></tr>
              ) : filtered.map(v => {
                const Icon = RoleIcon(v.role)
                return (
                <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{v.displayName}</p>
                    <p className="text-[10px] text-gray-500">{v.ownerName} -- {new Date(v.submittedDate).toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1"><Icon size={12} />{roleLabel(v.role)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 hidden sm:table-cell">{v.documents}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getColor(v.status)}`}>{v.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={()=>{setSelected(v);setShowRejectReason(false);setRejectReason("");setShowModal(true)}} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-indigo-600"><Eye size={15}/></button>
                      {v.status==="Pending" && <>
                        <button onClick={()=>handleApprove(v.id)} disabled={busyId === v.id} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-emerald-600"><CheckCircle size={15}/></button>
                        <button onClick={()=>{setSelected(v);setShowRejectReason(true);setRejectReason("");setShowModal(true)}} disabled={busyId === v.id} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-red-600"><XIcon size={15}/></button>
                      </>}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{t("agent.shopVerifications.modalTitle")}</DialogTitle></DialogHeader>
          {selected && <div className="space-y-3 py-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
              {[[t("agent.shopVerifications.colType"),roleLabel(selected.role)],[t("agent.shopVerifications.colShop"),selected.displayName],[t("agent.shopVerifications.labelOwner"),selected.ownerName],[t("auth.email"),selected.email],[t("agent.shopVerifications.labelDocumentType"),selected.documentType],...(selected.documentNumber ? [[t("agent.shopVerifications.labelDocumentNumber"),selected.documentNumber]] : []),[t("common.status"),selected.status],[t("agent.shopVerifications.labelSubmitted"),new Date(selected.submittedDate).toLocaleDateString()],...(selected.rejectionReason ? [[t("agent.shopVerifications.labelRejectionReason"),selected.rejectionReason]] : [])].map(([l,v])=>(
                <div key={l} className="flex justify-between text-sm"><span className="text-gray-500">{l}</span><span className="font-medium text-gray-900 dark:text-white">{v}</span></div>
              ))}
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1.5">{t("agent.shopVerifications.submittedDocumentsLabel")}</p>
              <KycDocumentViewer
                documents={[
                  { label: t("agent.shopVerifications.docIdFront"), url: selected.idFileUrl },
                  ...(selected.idBackFileUrl ? [{ label: t("agent.shopVerifications.docIdBack"), url: selected.idBackFileUrl }] : []),
                  ...(selected.selfieFileUrl ? [{ label: t("agent.shopVerifications.docSelfie"), url: selected.selfieFileUrl }] : []),
                ] satisfies KycDocumentItem[]}
              />
            </div>

            {selected.status==="Pending" && showRejectReason && (
              <div>
                <label className="block text-sm font-medium mb-1.5">{t("agent.shopVerifications.rejectionReasonInputLabel")}</label>
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t("agent.shopVerifications.rejectReasonPlaceholder")} className="min-h-[80px]" />
              </div>
            )}
            {selected.status==="Pending" && (
              showRejectReason ? (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowRejectReason(false)} disabled={busyId === selected.id}>{t("common.cancel")}</Button>
                  <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => handleReject(selected.id)} disabled={!rejectReason.trim() || busyId === selected.id}>
                    {busyId === selected.id ? <Loader2 size={16} className="animate-spin" /> : t("agent.shopVerifications.reject")}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowRejectReason(true)} disabled={busyId === selected.id}>{t("agent.shopVerifications.reject")}</Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(selected.id)} disabled={busyId === selected.id}>
                    {busyId === selected.id ? <Loader2 size={16} className="animate-spin" /> : t("agent.shopVerifications.approve")}
                  </Button>
                </div>
              )
            )}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
