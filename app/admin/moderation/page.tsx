"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Shield, Trash2, CheckCircle2, AlertTriangle, Flag, Search, MessageSquare, FileText, Loader2, X } from "lucide-react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import {
  getContentReports, approveReportedContent, removeReportedContent,
  getFlaggedAccounts, decideFlaggedAccount, getAccountViolations,
  type AdminContentReport, type FlaggedAccount, type AccountViolationDetail,
} from "@/backend/actions/admin-moderation"

export default function AdminModerationPage() {
  const { t, tn } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [items, setItems] = useState<AdminContentReport[]>([])
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  // Accounts, as opposed to individual pieces of content: people enough
  // others reported, or whose messages the platform's own rules flagged.
  const [accounts, setAccounts] = useState<FlaggedAccount[]>([])
  const [openAccount, setOpenAccount] = useState<FlaggedAccount | null>(null)
  const [accountViolations, setAccountViolations] = useState<AccountViolationDetail[]>([])

  const SEVERITY_LABEL: Record<string, string> = {
    high: t("admin.moderation.severityHigh"),
    medium: t("admin.moderation.severityMedium"),
    low: t("admin.moderation.severityLow"),
  }

  const TYPE_LABEL: Record<string, string> = {
    post: t("admin.moderation.typePost"),
    post_comment: t("admin.moderation.typePostComment"),
    review: t("admin.moderation.typeReview"),
    message: t("admin.moderation.typeMessage"),
  }

  const refresh = async () => {
    const [reports, flagged] = await Promise.all([getContentReports(), getFlaggedAccounts()])
    setItems(reports)
    setAccounts(flagged)
  }

  const openAccountDetail = async (account: FlaggedAccount) => {
    setOpenAccount(account)
    setAccountViolations([])
    setAccountViolations(await getAccountViolations(account.userId))
  }

  const decide = async (userId: string, decision: "clear" | "restrict") => {
    setBusyId(userId)
    const result = await decideFlaggedAccount({ userId, decision })
    setBusyId(null)
    setOpenAccount(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
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
    const result = await approveReportedContent({ reportId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleRemove = async (id: string) => {
    setBusyId(id)
    const result = await removeReportedContent({ reportId: id })
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
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("admin.moderation.title")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("admin.moderation.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-[11px] font-semibold">{tn("admin.moderation.urgentCount", items.filter(i => i.severity === "high").length)}</span>
          <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-[11px] font-semibold">{tn("admin.moderation.totalCount", items.length)}</span>
        </div>
      </div>

      {accounts.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
            <Flag className="h-4 w-4 text-red-600" /> {t("admin.moderation.flaggedAccountsTitle")}
          </h2>
          <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">{t("admin.moderation.flaggedAccountsHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <Card key={a.userId} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{a.name}</p>
                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{a.role} · {a.email}</p>
                  </div>
                  {a.moderationStatus === "UNDER_REVIEW" && (
                    <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      {t("admin.moderation.underReview")}
                    </span>
                  )}
                  {a.moderationStatus === "RESTRICTED" && (
                    <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {t("admin.moderation.restricted")}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {tn("admin.moderation.reportsCount", a.reportCount)}
                  </span>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-700 dark:bg-violet-900/20 dark:text-violet-400">
                    {tn("admin.moderation.violationsCount", a.violationCount)}
                  </span>
                </div>

                {a.reasons.length > 0 && (
                  <p className="mt-2 line-clamp-2 text-[11px] text-gray-600 dark:text-gray-400">{a.reasons.join(" · ")}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 bg-transparent text-xs" onClick={() => openAccountDetail(a)}>
                    {t("admin.moderation.reviewAction")}
                  </Button>
                  <Button size="sm" disabled={busyId === a.userId} className="flex-1 bg-emerald-600 text-xs text-white hover:bg-emerald-700" onClick={() => decide(a.userId, "clear")}>
                    {busyId === a.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("admin.moderation.approveAccount")}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t("admin.moderation.statPendingReview"), value: items.length.toString(), icon: Shield, color: "text-blue-600" },
          { label: t("admin.moderation.statHighSeverity"), value: items.filter(i => i.severity === "high").length.toString(), icon: AlertTriangle, color: "text-red-600" },
          { label: t("admin.moderation.statTotalReportsFiled"), value: items.reduce((sum, i) => sum + i.reportCount, 0).toString(), icon: Flag, color: "text-amber-600" },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("admin.moderation.searchPlaceholder")} className="bg-transparent text-xs outline-none flex-1 text-gray-700 dark:text-gray-200 placeholder:text-gray-400" />
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          {["all", "high", "medium", "low"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${filter === f ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm" : "text-gray-500"}`}>
              {f === "all" ? t("admin.moderation.filterAll") : SEVERITY_LABEL[f]}
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
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{t("admin.moderation.reasonPrefix", { reason: item.reason })}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                    <span>{new Date(item.time).toLocaleString()}</span>
                    <span>{tn("admin.moderation.reportCount", item.reportCount)}</span>
                  </div>
                </div>
                <div className="flex sm:flex-col gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleApprove(item.id)} disabled={isBusy} className="gap-1 text-[11px] text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20"><CheckCircle2 size={14} />{t("admin.moderation.approve")}</Button>
                  <Button size="sm" variant="outline" onClick={() => handleRemove(item.id)} disabled={isBusy} className="gap-1 text-[11px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"><Trash2 size={14} />{t("admin.moderation.remove")}</Button>
                </div>
              </div>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("admin.moderation.allReviewed")}</p>
          </Card>
        )}
      </div>
      {/* What the flags actually were. An admin approving or restricting an
          account needs to read the evidence, not just a count. */}
      {openAccount && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpenAccount(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-gray-800 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-gray-900 dark:text-white">{openAccount.name}</p>
                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{openAccount.role} · {openAccount.email}</p>
              </div>
              <button onClick={() => setOpenAccount(null)} aria-label={t("common.close")} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {openAccount.reasons.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-900 dark:text-white">{tn("admin.moderation.reportsCount", openAccount.reportCount)}</p>
                <ul className="mt-1.5 space-y-1">
                  {openAccount.reasons.map((r) => (
                    <li key={r} className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">{t("admin.moderation.violationsTitle")}</p>
              {accountViolations.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">{t("admin.moderation.noViolations")}</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {accountViolations.map((v) => (
                    <li key={v.id} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">{v.kind.replace(/_/g, " ")}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sevColor(v.severity.toLowerCase())}`}>{v.severity}</span>
                      </div>
                      <p className="mt-1 text-[11px] italic text-gray-700 dark:text-gray-300">{v.excerpt}</p>
                      <p className="mt-0.5 text-[10px] text-gray-400">{new Date(v.createdAt).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 bg-transparent text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                disabled={busyId === openAccount.userId}
                onClick={() => decide(openAccount.userId, "restrict")}
              >
                {t("admin.moderation.restrictAccount")}
              </Button>
              <Button
                className="flex-1 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                disabled={busyId === openAccount.userId}
                onClick={() => decide(openAccount.userId, "clear")}
              >
                {t("admin.moderation.approveAccount")}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
