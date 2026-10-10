"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Shield, Trash2, CheckCircle2, AlertTriangle, Flag, Search, MessageSquare, FileText, Loader2 } from "lucide-react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import {
  getSubAdminContentReports, approveReportedContentAsSubAdmin, removeReportedContentAsSubAdmin,
  type SubAdminContentReport,
} from "@/backend/actions/sub-admin-moderation"

export default function SubAdminModerationPage() {
  const { t, tn } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [items, setItems] = useState<SubAdminContentReport[]>([])
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const SEVERITY_LABEL: Record<string, string> = {
    high: t("subAdmin.moderation.severityHigh"),
    medium: t("subAdmin.moderation.severityMedium"),
    low: t("subAdmin.moderation.severityLow"),
  }

  const TYPE_LABEL: Record<string, string> = {
    post: t("subAdmin.moderation.typePost"),
    post_comment: t("subAdmin.moderation.typePostComment"),
    review: t("subAdmin.moderation.typeReview"),
    message: t("subAdmin.moderation.typeMessage"),
  }

  const refresh = async () => {
    const data = await getSubAdminContentReports()
    setItems(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filtered = items.filter(i => {
    if (filter !== "all" && i.severity !== filter) return false
    if (search && !i.content.toLowerCase().includes(search.toLowerCase()) && !i.user.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleApprove = async (id: string) => {
    setBusyId(id)
    const result = await approveReportedContentAsSubAdmin({ reportId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleRemove = async (id: string) => {
    setBusyId(id)
    const result = await removeReportedContentAsSubAdmin({ reportId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const sevColor = (s: string) => {
    switch (s) {
      case "high": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
      case "medium": return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
      default: return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
    }
  }

  const typeIcon = (type: string) => {
    switch (type) {
      case "review": return <MessageSquare size={14} />
      case "message": return <MessageSquare size={14} />
      case "post_comment": return <MessageSquare size={14} />
      default: return <FileText size={14} />
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("subAdmin.moderation.title")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("subAdmin.moderation.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-[11px] font-semibold">{tn("subAdmin.moderation.urgentCount", items.filter(i => i.severity === "high").length)}</span>
          <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-[11px] font-semibold">{tn("subAdmin.moderation.totalCount", items.length)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t("subAdmin.moderation.statPendingReview"), value: items.length.toString(), icon: Shield, color: "text-blue-600" },
          { label: t("subAdmin.moderation.statHighSeverity"), value: items.filter(i => i.severity === "high").length.toString(), icon: AlertTriangle, color: "text-red-600" },
          { label: t("subAdmin.moderation.statTotalReportsFiled"), value: items.reduce((sum, i) => sum + i.reportCount, 0).toString(), icon: Flag, color: "text-amber-600" },
        ].map((s, i) => (
          <Card key={i} className="p-4 flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center ${s.color} flex-shrink-0`}><s.icon size={18} /></div>
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 flex-1">
          <Search size={16} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("subAdmin.moderation.searchPlaceholder")} className="bg-transparent text-xs outline-none flex-1 text-gray-700 dark:text-gray-200 placeholder:text-gray-400" />
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          {["all", "high", "medium", "low"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${filter === f ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm" : "text-gray-500"}`}>
              {f === "all" ? t("subAdmin.moderation.filterAll") : SEVERITY_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(item => {
          const isBusy = busyId === item.id
          return (
            <Card key={item.id} className={`p-4 ${item.severity === "high" ? "border-l-3 border-l-red-500" : ""}`}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${item.severity === "high" ? "bg-red-100 dark:bg-red-900/30 text-red-600" : item.severity === "medium" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"}`}>
                  {typeIcon(item.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-900 dark:text-white">{item.user}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sevColor(item.severity)}`}>{SEVERITY_LABEL[item.severity] ?? item.severity}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{TYPE_LABEL[item.type] ?? item.type}</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mb-1 leading-relaxed">{item.content}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{t("subAdmin.moderation.reasonPrefix", { reason: item.reason })}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                    <span>{new Date(item.time).toLocaleString()}</span>
                    <span>{tn("subAdmin.moderation.reportCount", item.reportCount)}</span>
                  </div>
                </div>
                <div className="flex sm:flex-col gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleApprove(item.id)} disabled={isBusy} className="gap-1 text-[11px] text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20"><CheckCircle2 size={14} />{t("subAdmin.moderation.approve")}</Button>
                  <Button size="sm" variant="outline" onClick={() => handleRemove(item.id)} disabled={isBusy} className="gap-1 text-[11px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"><Trash2 size={14} />{t("subAdmin.moderation.remove")}</Button>
                </div>
              </div>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("subAdmin.moderation.allReviewed")}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
