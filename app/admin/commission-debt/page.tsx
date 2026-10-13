"use client"

import { useEffect, useState } from "react"
import { Search, Loader2, Check, X, AlertTriangle, Ban } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getCommissionDebtors, recordCommissionSettlement, writeOffCommissionDebt,
  type DebtorsView, type DebtorRow,
} from "@/backend/actions/admin-commission-debt"

/**
 * Providers who owe commission.
 *
 * The page exists for one question: who is blocked, and what do we do about
 * it. So the blocked ones are visible at a glance and the two things an
 * admin can do about a debt, record a payment that arrived another way or
 * write it off, are one tap from the row.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AdminCommissionDebtPage() {
  const [view, setView] = useState<DebtorsView>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const [payFor, setPayFor] = useState<DebtorRow | null>(null)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("M-Pesa")
  const [reference, setReference] = useState("")

  const [writeOffFor, setWriteOffFor] = useState<DebtorRow | null>(null)
  const [reason, setReason] = useState("")

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 5000) }

  const load = async () => setView(await getCommissionDebtors({ query: query.trim() || undefined }))

  useEffect(() => {
    load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const settle = async () => {
    if (!payFor) return
    setBusy("pay"); setError("")
    const r = await recordCommissionSettlement({
      userId: payFor.userId,
      amount: Number(amount) || 0,
      method,
      reference: reference.trim() || undefined,
    })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    setPayFor(null); setAmount(""); setReference("")
    await load()
    flash(r.message)
  }

  const writeOff = async () => {
    if (!writeOffFor) return
    setBusy("writeoff"); setError("")
    const r = await writeOffCommissionDebt({ userId: writeOffFor.userId, reason: reason.trim() })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    setWriteOffFor(null); setReason("")
    await load()
    flash(r.message)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!view) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center rounded-2xl">
          <p className="text-sm text-gray-500 dark:text-gray-400">This page is for admins.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Commission owed</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Providers whose customers paid them directly, and who owe the platform its share.
        </p>
      </div>

      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-snug">{saved}</p>
        </div>
      )}
      {error && !payFor && !writeOffFor && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Providers owing" value={String(view.rows.length)} />
        <Stat label="Blocked" value={String(view.blockedCount)} tone={view.blockedCount > 0 ? "bad" : undefined} />
        <Stat label="Owed in total" value={"KSh " + sh(view.totalOwed)} />
      </div>

      <Card className="p-4 rounded-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a name, an email or a phone number"
            className="pl-9 h-11 rounded-xl text-sm"
          />
        </div>

        {view.rows.length === 0 ? (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Nobody owes anything. {query ? "Nothing matches that search." : ""}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {view.rows.map((row) => (
              <div key={row.userId} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{row.name}</span>
                      {row.blocked && (
                        <span className="h-5 px-2 rounded-md text-[10px] font-semibold flex items-center bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          Cannot accept work
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {row.email}{row.phone ? " · " + row.phone : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400 tabular-nums">
                      {row.completedJobs} job{row.completedJobs === 1 ? "" : "s"} done
                      {row.rating > 0 ? " · " + row.rating.toFixed(1) + "★" : ""}
                      {row.lastChargeAt
                        ? " · last charge " + new Date(row.lastChargeAt).toLocaleDateString("en-KE", { dateStyle: "medium" })
                        : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Owes</p>
                    <p className={
                      row.blocked
                        ? "text-sm font-bold text-red-600 dark:text-red-400 tabular-nums"
                        : "text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums"
                    }>
                      KSh {sh(row.owed)}
                    </p>
                    <p className="text-[10px] text-gray-400 tabular-nums">of {sh(view.cap)}</p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => { setPayFor(row); setAmount(String(row.owed)); setReference(""); setError("") }}
                    className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95"
                  >
                    Record a payment
                  </button>
                  <button
                    onClick={() => { setWriteOffFor(row); setReason(""); setError("") }}
                    className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 inline-flex items-center gap-1"
                  >
                    <Ban className="w-3 h-3" /> Write it off
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug px-0.5">
        Providers can pay this themselves from their wallet by M-Pesa. Recording one here is for
        money that reached the platform another way, so that somebody who has genuinely paid is
        never left blocked waiting for the system to catch up.
      </p>

      {payFor && (
        <Sheet title={"Record a payment from " + payFor.name} onClose={() => setPayFor(null)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            They owe KSh {sh(payFor.owed)}. This lands on their own statement in the same words,
            with your name against it.
          </p>
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">How much (KSh)</span>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="mt-1 h-11 rounded-xl text-sm tabular-nums"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {["M-Pesa", "Cash", "Bank", "Other"].map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={
                    method === m
                      ? "h-10 px-3 rounded-xl border text-[11px] font-semibold border-primary bg-primary/5 text-primary"
                      : "h-10 px-3 rounded-xl border text-[11px] font-semibold border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                  }
                >
                  {m}
                </button>
              ))}
            </div>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Reference, e.g. the M-Pesa code"
              className="h-11 rounded-xl text-sm"
            />
          </div>
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
          <Button
            onClick={() => void settle()}
            disabled={busy === "pay" || !amount}
            className="mt-3 w-full h-11 rounded-xl text-xs"
          >
            {busy === "pay" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record it"}
          </Button>
        </Sheet>
      )}

      {writeOffFor && (
        <Sheet title={"Write off " + writeOffFor.name + "'s debt"} onClose={() => setWriteOffFor(null)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Clears the whole KSh {sh(writeOffFor.owed)} and lets them work again. This is not the
            same as being paid, and the statement says so, because revenue that was forgiven and
            revenue that arrived should never be counted together.
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is it being written off?"
            className="mt-3 h-11 rounded-xl text-sm"
            autoFocus
          />
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
          <Button
            onClick={() => void writeOff()}
            disabled={busy === "writeoff" || reason.trim().length < 3}
            className="mt-3 w-full h-11 rounded-xl text-xs"
          >
            {busy === "writeoff" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Write it off"}
          </Button>
        </Sheet>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card className="p-3 rounded-2xl">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className={
        tone === "bad"
          ? "mt-0.5 text-sm font-bold text-red-600 dark:text-red-400 tabular-nums"
          : "mt-0.5 text-sm font-bold text-gray-900 dark:text-white tabular-nums"
      }>
        {value}
      </p>
    </Card>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-4 pb-8 sm:pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="min-w-0 text-sm font-bold text-gray-900 dark:text-white leading-snug">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-gray-400 active:scale-95 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
