"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import {
  ArrowLeft, Loader2, Truck, AlertTriangle, Send, PackageCheck, ArrowRight,
} from "lucide-react"
import {
  getTransfers, dispatchTransfer, receiveTransfer, cancelTransfer,
  type TransferRow,
} from "@/backend/actions/pos-transfers"

/**
 * Stock moving between branches.
 *
 * A dispatched transfer is shown as in transit rather than as arrived,
 * because that is the truth and because it is the state people forget. The
 * receiving branch counts in what actually turned up, and anything missing
 * stays missing: it left one branch and never reached the other, which is
 * exactly what the ledger should say.
 */

const q = (v: number) => v.toLocaleString("en-KE", { maximumFractionDigits: 3 })

const STATUS_META: Record<TransferRow["status"], { label: string; tone: string }> = {
  DRAFT: { label: "Being picked", tone: "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400" },
  DISPATCHED: { label: "On the way", tone: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  RECEIVED: { label: "Arrived", tone: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" },
  CANCELLED: { label: "Dropped", tone: "bg-muted text-muted-foreground" },
}

export default function TransfersPage() {
  const [rows, setRows] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const refresh = async () => setRows(await getTransfers())

  useEffect(() => {
    getTransfers().then(setRows).finally(() => setLoading(false))
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
        <WorkspaceHeading title="Branch transfers" />
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Stock leaves when it is sent and arrives when the other branch counts
          it in. In between it belongs to neither, which is where it actually is.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {rows.length === 0 && (
        <Card className="p-6 rounded-2xl text-center">
          <Truck className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">No transfers</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Transfers are picked from the Stock page of the branch sending them.
          </p>
        </Card>
      )}

      {rows.map((t) => {
        const meta = STATUS_META[t.status]
        const isOpen = openId === t.id
        return (
          <Card key={t.id} className="rounded-2xl overflow-hidden">
            <button
              onClick={() => { setOpenId(isOpen ? null : t.id); setError(""); setCounts({}) }}
              className="w-full p-4 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{t.reference}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                    {t.fromName} <ArrowRight className="w-3 h-3 flex-shrink-0" /> {t.toName}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={"inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold " + meta.tone}>
                    {meta.label}
                  </span>
                  <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    {q(t.totalSent)} sent
                  </p>
                  {t.totalShort > 0 && (
                    <p className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                      {q(t.totalShort)} short
                    </p>
                  )}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border p-4 space-y-3">
                <ul className="divide-y divide-border">
                  {t.lines.map((l) => (
                    <li key={l.id} className="py-2 flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-xs text-foreground truncate">{l.name}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {q(l.quantitySent)} {l.unit}
                      </span>
                      {t.status === "DISPATCHED" && !t.outgoing ? (
                        <input
                          inputMode="decimal"
                          value={counts[l.id] ?? String(l.quantitySent)}
                          onChange={(e) => setCounts({ ...counts, [l.id]: e.target.value.replace(/[^\d.]/g, "") })}
                          className="w-20 h-10 px-2 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
                        />
                      ) : l.quantityReceived !== null ? (
                        <span className={"w-20 text-right text-xs font-semibold tabular-nums " +
                          ((l.shortBy ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                          {q(l.quantityReceived)}
                        </span>
                      ) : (
                        <span className="w-20 text-right text-[11px] text-muted-foreground">in transit</span>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-2">
                  {t.status === "DRAFT" && t.outgoing && (
                    <>
                      <button
                        onClick={() => void run(() => dispatchTransfer({ id: t.id }))}
                        disabled={busy}
                        className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" /> Send it
                      </button>
                      <button
                        onClick={() => {
                          const why = window.prompt("Why is this being dropped?")
                          if (why) void run(() => cancelTransfer({ id: t.id, reason: why }))
                        }}
                        disabled={busy}
                        className="h-10 px-3 rounded-xl border border-border text-xs font-semibold active:scale-95 disabled:opacity-50"
                      >
                        Drop it
                      </button>
                    </>
                  )}
                  {t.status === "DISPATCHED" && !t.outgoing && (
                    <button
                      onClick={() => void run(() => receiveTransfer({
                        id: t.id,
                        lines: t.lines.map((l) => ({
                          lineId: l.id,
                          quantityReceived: counts[l.id] ?? String(l.quantitySent),
                        })),
                      }))}
                      disabled={busy}
                      className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <PackageCheck className="w-3.5 h-3.5" /> Count it in
                    </button>
                  )}
                  {t.status === "DISPATCHED" && t.outgoing && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Gone from this branch. {t.toName} counts it in at their end.
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
