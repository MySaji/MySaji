"use client"

import { useEffect, useState } from "react"
import {
  Check, Clock, Layers, Loader2, RotateCcw, ShieldCheck, Sliders, X, XCircle,
  Wrench, Store, Package, Laptop, GraduationCap, Briefcase, Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getProCapabilityRequests, reviewProCapabilityRequest, getProModuleMatrix,
  setProModuleEnabled, resetProModuleToDefault,
  type ProCapabilityRequest, type ProModuleMatrix,
} from "@/lib/actions/pro-capabilities"
import {
  PRO_BUSINESS_TYPES, PRO_BUSINESS_TYPE_META, PRO_MODULES, type ProBusinessType,
} from "@/lib/pro-modules"

const TYPE_ICON: Record<string, typeof Wrench> = {
  Wrench, Store, Package, Laptop, GraduationCap, Briefcase,
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Saji Pro business control — one screen with the two jobs staff actually do
 * here: decide who gets to add a business type, and decide which pages each
 * business type puts in a Pro's menu.
 *
 * `canEditMatrix` is only ever a hint for what to render. Both server actions
 * behind this check the caller's role themselves (agents can review requests
 * but not rewrite the platform-wide matrix), so a hidden tab is a courtesy,
 * not the boundary.
 */
export function ProBusinessControl({ canEditMatrix = true }: { canEditMatrix?: boolean }) {
  const [tab, setTab] = useState<"requests" | "pages">("requests")
  const [requests, setRequests] = useState<ProCapabilityRequest[]>([])
  const [matrix, setMatrix] = useState<ProModuleMatrix | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [declining, setDeclining] = useState<string | null>(null)
  const [declineNote, setDeclineNote] = useState("")

  const refresh = async () => {
    const [reqs, mat] = await Promise.all([getProCapabilityRequests(), getProModuleMatrix()])
    setRequests(reqs)
    setMatrix(mat)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(""), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const decide = async (id: string, approve: boolean, note?: string) => {
    setBusyId(id)
    setError("")
    const result = await reviewProCapabilityRequest({ id, approve, reviewNote: note })
    setBusyId(null)
    if (!result.success) {
      setError(result.error)
      return
    }
    setDeclining(null)
    setDeclineNote("")
    setToast(approve ? "Approved — the account has its new pages." : "Request declined.")
    await refresh()
  }

  const toggleCell = async (businessType: ProBusinessType, moduleKey: string, next: boolean) => {
    const cellId = `${businessType}:${moduleKey}`
    setBusyId(cellId)
    setError("")
    const result = await setProModuleEnabled({ businessType, moduleKey, enabled: next })
    setBusyId(null)
    if (!result.success) {
      setError(result.error)
      return
    }
    await refresh()
  }

  const resetCell = async (businessType: ProBusinessType, moduleKey: string) => {
    const cellId = `${businessType}:${moduleKey}`
    setBusyId(cellId)
    setError("")
    await resetProModuleToDefault({ businessType, moduleKey })
    setBusyId(null)
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  const pending = requests.filter((r) => r.status === "PENDING")
  const reviewed = requests.filter((r) => r.status !== "PENDING")
  const cellOf = (type: ProBusinessType, key: string) =>
    matrix?.cells.find((c) => c.businessType === type && c.moduleKey === key)

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6 max-w-7xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Layers className="w-5 h-5 text-blue-600 flex-shrink-0" />
        Saji Pro Business
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-5">
        Approve what a Pro is allowed to offer, and control which pages each kind of offer opens up.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 mb-5 max-w-md">
        <button
          onClick={() => setTab("requests")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
            tab === "requests" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Requests
          {pending.length > 0 && (
            <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("pages")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
            tab === "pages" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Page Control
        </button>
      </div>

      {toast && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="min-w-0">{toast}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      {/* ---------------- Requests ---------------- */}
      {tab === "requests" && (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2.5">
              Waiting on you {pending.length > 0 && <span className="text-gray-400 font-normal">({pending.length})</span>}
            </h2>
            {pending.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
                <Check className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Nothing waiting. Every request has been reviewed.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((req) => {
                  const meta = PRO_BUSINESS_TYPE_META[req.type]
                  const Icon = TYPE_ICON[meta.icon] ?? Wrench
                  const isBusy = busyId === req.id
                  return (
                    <div key={req.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">
                            {req.userName} <span className="text-gray-400 font-normal">wants to add</span> {meta.label}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">
                            {req.email}{req.phone ? ` · ${req.phone}` : ""}
                          </p>
                          {req.currentTypes.length > 0 && (
                            <p className="text-[11px] text-gray-400 mt-1">
                              Already offers: {req.currentTypes.map((t) => PRO_BUSINESS_TYPE_META[t].label).join(", ")}
                            </p>
                          )}
                          {req.note && (
                            <p className="mt-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-2.5 leading-snug">
                              &ldquo;{req.note}&rdquo;
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-1.5">{timeAgo(req.requestedAt)}</p>

                          {declining === req.id ? (
                            <div className="mt-3">
                              <textarea
                                value={declineNote}
                                onChange={(e) => setDeclineNote(e.target.value)}
                                rows={2}
                                maxLength={500}
                                placeholder="Why is this being declined? The Pro sees this."
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
                              />
                              <div className="flex gap-2 mt-2">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={isBusy}
                                  onClick={() => decide(req.id, false, declineNote.trim() || undefined)}
                                  className="h-8 rounded-lg text-xs"
                                >
                                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm decline"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => { setDeclining(null); setDeclineNote("") }}
                                  className="h-8 rounded-lg text-xs"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                disabled={isBusy}
                                onClick={() => decide(req.id, true)}
                                className="h-8 rounded-lg text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                              >
                                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Approve</>}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => { setDeclining(req.id); setDeclineNote("") }}
                                className="h-8 rounded-lg text-xs gap-1"
                              >
                                <X className="w-3.5 h-3.5" strokeWidth={3} /> Decline
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {reviewed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2.5">Recently reviewed</h2>
              <div className="space-y-2">
                {reviewed.slice(0, 20).map((req) => (
                  <div key={req.id} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5">
                    <span className="w-6 h-6 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
                      <X className="w-3.5 h-3.5" strokeWidth={3} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {req.userName} · {PRO_BUSINESS_TYPE_META[req.type].label}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        Declined{req.reviewedByName ? ` by ${req.reviewedByName}` : ""}
                        {req.reviewNote ? ` — ${req.reviewNote}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ---------------- Page control ---------------- */}
      {tab === "pages" && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
            A tick means Pros who offer that business type see that page in their menu.
            Changes apply to every matching account. Grey rows are core pages that every
            Saji Pro keeps.
            {!canEditMatrix && " You can view this, but only an Admin or Sub-Admin can change it."}
          </p>

          {/* Wide by nature — 6 business types plus labels never fits a phone,
              so it scrolls inside its own container and the page body doesn't. */}
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left font-semibold text-gray-900 dark:text-white px-4 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10">
                    Page
                  </th>
                  {PRO_BUSINESS_TYPES.map((type) => {
                    const meta = PRO_BUSINESS_TYPE_META[type]
                    const Icon = TYPE_ICON[meta.icon] ?? Wrench
                    return (
                      <th key={type} className="px-2 py-3 text-center align-bottom">
                        <div className="flex flex-col items-center gap-1">
                          <Icon className="w-4 h-4 text-gray-400" />
                          <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 leading-tight">
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-gray-400 font-normal">
                            {matrix?.accountsByType[type] ?? 0} pro{(matrix?.accountsByType[type] ?? 0) === 1 ? "" : "s"}
                          </span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {PRO_MODULES.map((mod) => (
                  <tr key={mod.key} className="border-b border-gray-100 dark:border-gray-700/60 last:border-0">
                    <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-gray-800 z-10">
                      <p className="font-medium text-gray-900 dark:text-white text-xs flex items-center gap-1.5">
                        {mod.label}
                        {mod.core && <Lock className="w-3 h-3 text-gray-400" />}
                      </p>
                      <p className="text-[11px] text-gray-400 leading-snug">{mod.description}</p>
                    </td>
                    {PRO_BUSINESS_TYPES.map((type) => {
                      const cell = cellOf(type, mod.key)
                      const cellId = `${type}:${mod.key}`
                      const isBusy = busyId === cellId
                      if (mod.core) {
                        return (
                          <td key={type} className="px-2 py-2.5 text-center">
                            <span className="inline-flex w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-400 items-center justify-center">
                              <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            </span>
                          </td>
                        )
                      }
                      return (
                        <td key={type} className="px-2 py-2.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              disabled={!canEditMatrix || isBusy}
                              aria-label={`${cell?.enabled ? "Disable" : "Enable"} ${mod.label} for ${PRO_BUSINESS_TYPE_META[type].label}`}
                              aria-pressed={!!cell?.enabled}
                              onClick={() => toggleCell(type, mod.key, !cell?.enabled)}
                              className={`w-6 h-6 rounded-md flex items-center justify-center transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed ${
                                cell?.enabled
                                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                  : "border border-gray-300 dark:border-gray-600 text-transparent hover:border-emerald-400"
                              }`}
                            >
                              {isBusy ? <Loader2 className="w-3 h-3 animate-spin text-current" /> : <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                            </button>
                            {cell?.isOverride && canEditMatrix && (
                              <button
                                onClick={() => resetCell(type, mod.key)}
                                title="Reset to default"
                                aria-label={`Reset ${mod.label} for ${PRO_BUSINESS_TYPE_META[type].label} to default`}
                                className="text-gray-300 hover:text-gray-500 active:scale-90 transition-all"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
