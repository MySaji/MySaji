"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import { ArrowLeft, Loader2, Plus, FileText, AlertTriangle, Check, X, Send } from "lucide-react"
import {
  getQuotes, createQuote, setQuoteStatus, prepareQuoteForTill,
  type QuoteRow,
} from "@/backend/actions/pos-quotes"

/**
 * Quotations and pro forma invoices.
 *
 * An expired quote is labelled as expired rather than merely dated, because
 * the figures on it are a promise the shop is no longer making and a cashier
 * reading a date has to do the arithmetic themselves mid-queue.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : null

const STATUS_META: Record<QuoteRow["status"], { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "bg-muted text-muted-foreground" },
  SENT: { label: "With the customer", tone: "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400" },
  ACCEPTED: { label: "Accepted", tone: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" },
  CONVERTED: { label: "Rung up", tone: "bg-muted text-muted-foreground" },
  EXPIRED: { label: "Expired", tone: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  CANCELLED: { label: "Withdrawn", tone: "bg-muted text-muted-foreground" },
}

export default function QuotesPage() {
  const [rows, setRows] = useState<QuoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ customerName: "", customerPhone: "", validForDays: "14" })
  const [draft, setDraft] = useState<{ name: string; quantity: string; unitPrice: string }[]>([
    { name: "", quantity: "1", unitPrice: "" },
  ])

  const refresh = async () => setRows(await getQuotes())

  useEffect(() => {
    getQuotes().then(setRows).finally(() => setLoading(false))
  }, [])

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true); setError("")
    const r = await fn()
    setBusy(false)
    if (!r.success) { setError(r.error ?? "That did not work."); return false }
    await refresh()
    return true
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 w-full min-w-0 space-y-5 pb-12">
      <Link
        href="/pos/sell"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      <div>
        <WorkspaceHeading title="Quotes" />
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          A price put in writing. The figures hold until the date on the quote,
          whatever the shelf does in the meantime.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => { setAdding(true); setError("") }}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> New quote
        </button>
      ) : (
        <Card className="p-4 rounded-2xl space-y-2">
          <h2 className="text-sm font-bold text-foreground">New quote</h2>
          <input
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            placeholder="Who it is for"
            className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <input
            value={form.customerPhone}
            onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
            placeholder="Phone"
            className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Figures hold for (days)</span>
            <input
              inputMode="numeric"
              value={form.validForDays}
              onChange={(e) => setForm({ ...form, validForDays: e.target.value.replace(/\D/g, "") })}
              className="mt-0.5 w-full h-11 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
            />
          </label>

          {draft.map((d, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={d.name}
                onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                placeholder="What it is for"
                className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm"
              />
              <input
                inputMode="decimal"
                value={d.quantity}
                onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                className="w-16 h-11 px-2 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
              />
              <input
                inputMode="decimal"
                value={d.unitPrice}
                onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                placeholder="Each"
                className="w-24 h-11 px-2 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
              />
            </div>
          ))}
          <button
            onClick={() => setDraft([...draft, { name: "", quantity: "1", unitPrice: "" }])}
            className="w-full h-10 rounded-lg border border-border text-xs font-semibold active:scale-95"
          >
            Another line
          </button>

          <div className="flex gap-2 pt-1">
            <button
              onClick={async () => {
                const ok = await run(() => createQuote({
                  customerName: form.customerName,
                  customerPhone: form.customerPhone || null,
                  validForDays: form.validForDays || null,
                  lines: draft
                    .filter((d) => d.name && d.unitPrice)
                    .map((d) => ({ name: d.name, quantity: d.quantity || "1", unitPrice: d.unitPrice })),
                }))
                if (ok) {
                  setAdding(false)
                  setForm({ customerName: "", customerPhone: "", validForDays: "14" })
                  setDraft([{ name: "", quantity: "1", unitPrice: "" }])
                }
              }}
              disabled={busy}
              className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Write it"}
            </button>
            <button
              onClick={() => { setAdding(false); setError("") }}
              className="h-11 px-4 rounded-lg border border-border text-sm font-semibold active:scale-95"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {rows.length === 0 && !adding && (
        <Card className="p-6 rounded-2xl text-center">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">No quotes</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Useful anywhere a customer asks what a job will cost before they buy.
          </p>
        </Card>
      )}

      {rows.map((q) => {
        const meta = STATUS_META[q.status]
        const isOpen = openId === q.id
        return (
          <Card key={q.id} className="rounded-2xl overflow-hidden">
            <button
              onClick={() => { setOpenId(isOpen ? null : q.id); setError("") }}
              className="w-full p-4 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {q.reference} &middot; {q.customerName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {q.lines.length} {q.lines.length === 1 ? "line" : "lines"}
                    {q.validUntil ? " · holds to " + day(q.validUntil) : " · open ended"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={"inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold " +
                    (q.expired ? STATUS_META.EXPIRED.tone : meta.tone)}>
                    {q.expired ? "Expired" : meta.label}
                  </span>
                  <p className="mt-1 text-sm font-bold tabular-nums text-foreground">{sh(q.total)}</p>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border p-4 space-y-3">
                <ul className="divide-y divide-border">
                  {q.lines.map((l) => (
                    <li key={l.id} className="py-2 flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-xs text-foreground truncate">{l.name}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {l.quantity} &times; {sh(l.unitPrice)}
                      </span>
                      <span className="w-24 text-right text-xs font-semibold tabular-nums text-foreground">{sh(l.total)}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-2">
                  {(q.status === "DRAFT" || q.status === "SENT") && !q.expired && (
                    <>
                      {q.status === "DRAFT" && (
                        <button
                          onClick={() => void run(() => setQuoteStatus({ id: q.id, status: "SENT" }))}
                          disabled={busy}
                          className="h-10 px-3 rounded-xl border border-border text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" /> Given to them
                        </button>
                      )}
                      <button
                        onClick={() => void run(() => setQuoteStatus({ id: q.id, status: "ACCEPTED" }))}
                        disabled={busy}
                        className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" /> They said yes
                      </button>
                    </>
                  )}
                  {q.status === "ACCEPTED" && !q.expired && (
                    <button
                      onClick={async () => {
                        setBusy(true); setError("")
                        const r = await prepareQuoteForTill({ id: q.id })
                        setBusy(false)
                        if (!r.success) { setError(r.error); return }
                        setError(
                          r.quote.unstocked.length > 0
                            ? "Ready for the till. " + r.quote.unstocked.length +
                              " line(s) are not in the catalogue and must be added by hand: " +
                              r.quote.unstocked.map((u) => u.name).join(", ")
                            : "Ready for the till.",
                        )
                      }}
                      disabled={busy}
                      className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-95 disabled:opacity-50"
                    >
                      Send to the till
                    </button>
                  )}
                  {q.status !== "CONVERTED" && q.status !== "CANCELLED" && (
                    <button
                      onClick={() => {
                        const why = window.prompt("Why is the quote being withdrawn?")
                        if (why) void run(() => setQuoteStatus({ id: q.id, status: "CANCELLED", reason: why }))
                      }}
                      disabled={busy}
                      className="h-10 px-3 rounded-xl border border-border text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Withdraw
                    </button>
                  )}
                  {q.status === "CONVERTED" && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Rung up. It is in the day&rsquo;s takings like any other sale.
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
