"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/frontend/components/ui/dialog"
import { Search, Download, User, Shield, CreditCard, Settings, AlertTriangle, CheckCircle2, XCircle, Eye, Clock, Globe, Monitor, Filter, Loader2 } from "lucide-react"
import { getAuditLogs, getAuditLogSummary, type AdminAuditLogEntry } from "@/backend/actions/admin-audit-log"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function AdminAuditLogPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([])
  const [summary, setSummary] = useState({ totalToday: 0, criticalCount: 0, activeAdmins: 0 })
  const [search, setSearch] = useState("")
  const [catFilter, setCatFilter] = useState("all")
  const [sevFilter, setSevFilter] = useState("all")
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogEntry | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  const SEVERITY_LABEL: Record<string, string> = {
    info: t("admin.auditLog.severityInfo"),
    warning: t("admin.auditLog.severityWarning"),
    critical: t("admin.auditLog.severityCritical"),
  }

  useEffect(() => {
    Promise.all([getAuditLogs(), getAuditLogSummary()]).then(([logsData, summaryData]) => {
      setLogs(logsData)
      setSummary(summaryData)
    }).finally(() => setIsLoading(false))
  }, [])

  const categories = useMemo(() => ["all", ...Array.from(new Set(logs.map((l) => l.category)))], [logs])

  const filtered = logs.filter(l => {
    if (catFilter !== "all" && l.category !== catFilter) return false
    if (sevFilter !== "all" && l.severity !== sevFilter) return false
    if (search && !l.action.toLowerCase().includes(search.toLowerCase()) && !l.user.toLowerCase().includes(search.toLowerCase()) && !l.target.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleExportCsv = () => {
    const rows = [
      ["User", "Role", "Action", "Target", "Category", "Severity", "Timestamp"],
      ...filtered.map(l => [l.user, l.role, l.action, l.target, l.category, l.severity, l.timestamp]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openDetail = (log: AdminAuditLogEntry) => {
    setSelectedLog(log)
    setShowDetailModal(true)
  }

  const sevBadge = (s: string) => {
    switch (s) {
      case "critical": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
      case "warning": return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
      default: return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
    }
  }

  const catIcon = (c: string) => {
    switch (c) {
      case "User": return <User size={14} />
      case "KycDocument": return <CheckCircle2 size={14} />
      case "Payment": return <CreditCard size={14} />
      case "CommissionTier": case "Service": case "Announcement": return <Settings size={14} />
      case "Dispute": return <AlertTriangle size={14} />
      case "POST": case "REVIEW": case "MESSAGE": case "POST_COMMENT": return <XCircle size={14} />
      default: return <Eye size={14} />
    }
  }

  const formatRelative = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const mins = Math.round(diffMs / 60000)
    if (mins < 1) return t("admin.auditLog.justNow")
    if (mins < 60) return t("admin.auditLog.minAgo", { count: mins })
    const hours = Math.round(mins / 60)
    if (hours < 24) return t("admin.auditLog.hAgo", { count: hours })
    return t("admin.auditLog.dAgo", { count: Math.round(hours / 24) })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("admin.auditLog.title")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("admin.auditLog.subtitle")}</p>
        </div>
        <Button size="sm" onClick={handleExportCsv} className="bg-blue-600 hover:bg-blue-700 gap-1.5 text-[11px] w-fit rounded-lg"><Download size={14} />{t("admin.auditLog.exportCsv")}</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: t("admin.auditLog.statTotalEventsToday"), value: summary.totalToday.toString(), color: "text-blue-600" },
          { label: t("admin.auditLog.statCriticalAlertsToday"), value: summary.criticalCount.toString(), color: "text-red-600" },
          { label: t("admin.auditLog.statActiveAdminsToday"), value: summary.activeAdmins.toString(), color: "text-emerald-600" },
        ].map((s, i) => (
          <Card key={i} className="p-4">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className={`text-xl font-bold ${s.color} mt-1`}>{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 flex-1">
          <Search size={16} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("admin.auditLog.searchPlaceholder")} className="bg-transparent text-xs outline-none flex-1 text-gray-700 dark:text-gray-200 placeholder:text-gray-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 outline-none">
            {categories.map(c => <option key={c} value={c}>{c === "all" ? t("admin.auditLog.allCategories") : c}</option>)}
          </select>
          <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} className="text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 outline-none">
            <option value="all">{t("admin.auditLog.allSeverity")}</option>
            <option value="info">{SEVERITY_LABEL.info}</option>
            <option value="warning">{SEVERITY_LABEL.warning}</option>
            <option value="critical">{SEVERITY_LABEL.critical}</option>
          </select>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {filtered.map(log => (
            <div key={log.id} className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 flex items-start gap-3 transition-colors ${log.severity === "critical" ? "border-l-[3px] border-l-red-500" : ""}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${log.severity === "critical" ? "bg-red-100 dark:bg-red-900/30 text-red-600" : log.severity === "warning" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" : "bg-gray-100 dark:bg-gray-700 text-gray-500"}`}>
                {catIcon(log.category)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{log.user}</span>
                  <span className="text-[11px] text-gray-400 capitalize">{log.action}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sevBadge(log.severity)}`}>{SEVERITY_LABEL[log.severity] ?? log.severity}</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">{log.target}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-gray-400">{formatRelative(log.timestamp)}</span>
                  {log.ip && <span className="text-[10px] text-gray-400 font-mono">{t("admin.auditLog.ipLabel", { ip: log.ip })}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openDetail(log)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 transition-colors" title={t("admin.users.viewTitle")}>
                  <Eye size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && <div className="p-8 text-center text-xs text-gray-400">{t("admin.auditLog.noEventsMatch")}</div>}
      </Card>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.auditLog.modalTitle")}</DialogTitle>
            <DialogDescription>{t("admin.auditLog.modalDesc")}</DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedLog.severity === "critical" ? "bg-red-100 dark:bg-red-900/30 text-red-600" : selectedLog.severity === "warning" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"}`}>
                  {catIcon(selectedLog.category)}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900 dark:text-white capitalize">{selectedLog.action}</h3>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sevBadge(selectedLog.severity)}`}>{SEVERITY_LABEL[selectedLog.severity] ?? selectedLog.severity}</span>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { icon: User, label: t("admin.auditLog.performedBy"), value: `${selectedLog.user} (${selectedLog.role})` },
                  { icon: Eye, label: t("admin.auditLog.target"), value: selectedLog.target },
                  { icon: Clock, label: t("admin.auditLog.timestamp"), value: new Date(selectedLog.timestamp).toLocaleString() },
                  { icon: Globe, label: t("admin.auditLog.ipAddress"), value: selectedLog.ip ?? t("admin.auditLog.notRecorded") },
                  { icon: Monitor, label: t("admin.auditLog.device"), value: selectedLog.device ?? t("admin.auditLog.notRecorded") },
                  { icon: Filter, label: t("admin.auditLog.category"), value: selectedLog.category },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2.5">
                    <item.icon size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{item.label}</p>
                      <p className="text-xs text-gray-900 dark:text-white break-words">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDetailModal(false)} className="rounded-lg">{t("common.close")}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
