"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Check, Clock, Loader2, Plus, ShieldCheck, X, XCircle,
  Wrench, Store, Package, Laptop, GraduationCap, Briefcase, Layers,
  Calculator, Lock,
} from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import {
  getMyProCapabilities, requestProCapability, cancelProCapabilityRequest,
  type MyProCapabilities,
} from "@/backend/actions/pro-capabilities"
import {
  PRO_BUSINESS_TYPES, PRO_BUSINESS_TYPE_META, PRO_MODULE_BY_KEY,
  DEFAULT_MODULES_BY_TYPE, isTypeSelectable, type ProBusinessType,
} from "@/backend/domain/pro-modules"

const TYPE_ICON: Record<string, typeof Wrench> = {
  Wrench, Store, Package, Laptop, GraduationCap, Briefcase, Calculator,
}

const ACCENT: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

/**
 * My Business — what this Saji Pro account offers, and how it asks for more.
 *
 * Adding a business type is a staff decision, so this page files a request and
 * shows where it got to. Deliberately no modal anywhere: the request form
 * opens inline, under the card it belongs to, which reads the same on a phone
 * as on a desktop and never traps the keyboard behind an overlay.
 */
export default function BusinessTypesPage() {
  const [data, setData] = useState<MyProCapabilities | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [openRequest, setOpenRequest] = useState<ProBusinessType | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")

  const refresh = () => getMyProCapabilities().then(setData)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(""), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const statusOf = (type: ProBusinessType): "ACTIVE" | "PENDING" | "REJECTED" | "NONE" => {
    if (!data) return "NONE"
    if (data.active.includes(type)) return "ACTIVE"
    if (data.pending.includes(type)) return "PENDING"
    if (data.rejected.includes(type)) return "REJECTED"
    return "NONE"
  }

  const submitRequest = async (type: ProBusinessType) => {
    setBusy(type)
    setError("")
    const result = await requestProCapability({ type, note: note.trim() || undefined })
    setBusy(null)
    if (!result.success) {
      setError(result.error)
      return
    }
    setOpenRequest(null)
    setNote("")
    setToast(`Request sent — our team will review "${PRO_BUSINESS_TYPE_META[type].label}" shortly.`)
    await refresh()
  }

  const withdraw = async (type: ProBusinessType) => {
    setBusy(type)
    setError("")
    const result = await cancelProCapabilityRequest({ type })
    setBusy(null)
    if (!result.success) {
      setError(result.error)
      return
    }
    setToast("Request withdrawn.")
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  const rejectedNote = (type: ProBusinessType) =>
    data?.rows.find((r) => r.type === type && r.status === "REJECTED")?.reviewNote

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link
          href="/provider"
          aria-label="Back"
          className="lg:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600 flex-shrink-0" />
            My Business
          </h1>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 lg:ml-0 ml-9">
        What you offer on Saji. Each one adds its own pages to your menu.
      </p>

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

      <div className="space-y-3">
        {PRO_BUSINESS_TYPES.map((type) => {
          const meta = PRO_BUSINESS_TYPE_META[type]
          const Icon = TYPE_ICON[meta.icon] ?? Wrench
          const status = statusOf(type)
          const isOpen = openRequest === type
          const isBusy = busy === type
          // POS does not compose with anything but Sell Products, so a type
          // this account cannot hold must not offer a "Request to add"
          // button that the server would only refuse. Measured against what
          // the account holds AND what it has already asked for, which is
          // the same set requestProCapability validates — the two would
          // otherwise disagree and the button would look broken.
          const held = [...(data?.active ?? []), ...(data?.pending ?? [])].filter((t) => t !== type)
          const { selectable, reason } = isTypeSelectable(type, held)
          const blocked = status !== "ACTIVE" && status !== "PENDING" && !selectable
          // Which pages this type would add, named so the ask is concrete
          // rather than "trust us, you get more menu items".
          const unlocks = (DEFAULT_MODULES_BY_TYPE[type] ?? [])
            .map((k) => PRO_MODULE_BY_KEY[k]?.label)
            .filter(Boolean)
            .slice(0, 4)

          return (
            <div
              key={type}
              className={`rounded-2xl border bg-white dark:bg-gray-800 transition-colors ${
                status === "ACTIVE"
                  ? "border-emerald-300 dark:border-emerald-800"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ACCENT[meta.accent]}`}>
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{meta.label}</p>
                    {status === "ACTIVE" && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full flex-shrink-0">
                        <Check className="w-3 h-3" strokeWidth={3} /> Active
                      </span>
                    )}
                    {status === "PENDING" && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full flex-shrink-0">
                        <Clock className="w-3 h-3" /> In review
                      </span>
                    )}
                    {status === "REJECTED" && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full flex-shrink-0">
                        <X className="w-3 h-3" strokeWidth={3} /> Declined
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">{meta.description}</p>

                  {unlocks.length > 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 leading-snug">
                      Adds: {unlocks.join(" · ")}
                    </p>
                  )}

                  {/* Why there is no button, stated rather than implied. */}
                  {blocked && reason && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-snug flex items-start gap-1.5">
                      <Lock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{reason}</span>
                    </p>
                  )}

                  {status === "REJECTED" && rejectedNote(type) && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5 leading-snug">
                      Our team said: {rejectedNote(type)}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {status === "ACTIVE" && (
                      <Link
                        href={meta.workHref}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline active:scale-95 transition-transform inline-flex items-center gap-1"
                      >
                        Open {meta.workLabel}
                      </Link>
                    )}

                    {status === "PENDING" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => withdraw(type)}
                        className="h-8 rounded-lg text-xs"
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Withdraw request"}
                      </Button>
                    )}

                    {(status === "NONE" || status === "REJECTED") && !isOpen && !blocked && (
                      <Button
                        size="sm"
                        onClick={() => { setOpenRequest(type); setNote(""); setError("") }}
                        className="h-8 rounded-lg text-xs gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {status === "REJECTED" ? "Ask again" : "Request to add"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline request form — no dialog, so the keyboard on a phone
                  pushes the page rather than covering a floating panel. */}
              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/40 rounded-b-2xl">
                  <label htmlFor={`note-${type}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Tell our team about it <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    id={`note-${type}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder={`e.g. I already ${meta.label.toLowerCase()} offline and want to bring it onto Saji`}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">{note.length}/500</p>
                  <div className="flex gap-2 mt-2.5">
                    <Button
                      size="sm"
                      disabled={isBusy}
                      onClick={() => submitRequest(type)}
                      className="flex-1 h-9 rounded-lg text-xs font-semibold"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Send request"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => { setOpenRequest(null); setNote("") }}
                      className="h-9 rounded-lg text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-5 leading-relaxed">
        Adding a business type is reviewed by our team so your new pages match what you
        really do. You keep everything you already have while a request is in review.
      </p>
    </div>
  )
}
