"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, ClipboardList, Loader2, Check, X, Send, Plus, AlertTriangle,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import {
  getStockCounts, getStockCount, startStockCount, enterCountedQuantity,
  submitStockCount, approveStockCount, cancelStockCount,
  type StockCountRow, type StockCountLineRow,
} from "@/backend/actions/pos-stocktake"

/**
 * Counting the shelves.
 *
 * The page leads with the variance in money, not in units, because that is
 * the number a shopkeeper acts on. "93 items" is a fact; "14,000 shillings"
 * is a decision about whether to change who has keys to the store room.
 *
 * A line nobody has counted is drawn differently from a line counted as
 * zero, everywhere. Those two are completely different facts and the moment
 * the screen blurs them the count stops being trustworthy.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q = (v: number) => v.toLocaleString("en-KE", { maximumFractionDigits: 3 })

const STATUS_META: Record<StockCountRow["status"], { label: string; tone: string }> = {
  DRAFT: { label: "Being counted", tone: "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400" },
  SUBMITTED: { label: "Waiting for approval", tone: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  APPROVED: { label: "Posted", tone: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" },
  CANCELLED: { label: "Dropped", tone: "bg-muted text-muted-foreground" },
}

export default function StocktakePage() {
  const [counts, setCounts] = useState<StockCountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ count: StockCountRow; lines: StockCountLineRow[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [scope, setScope] = useState("")

  const loadList = async () => setCounts(await getStockCounts())

  useEffect(() => {
    getStockCounts().then(setCounts).finally(() => setLoading(false))
  }, [])

  const open = async (id: string) => {
    setOpenId(id)
    setDetail(null)
    setDetail(await getStockCount(id))
  }

  const start = async () => {
    setBusy(true); setError("")
    const r = await startStockCount({ scope: scope.trim() || "Whole shop" })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setScope("")
    await loadList()
    await open(r.id)
  }

  const enter = async (lineId: string, value: string) => {
    const counted = value.trim() === "" ? null : Number(value)
    const r = await enterCountedQuantity({ lineId, counted })
    if (!r.success) { setError(r.error); return }
    if (openId) setDetail(await getStockCount(openId))
  }

  const act = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true); setError("")
    const r = await fn()
    setBusy(false)
    if (!r.success) { setError(r.error ?? "That did not work."); return }
    await loadList()
    if (openId) setDetail(await getStockCount(openId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3 pb-24">
      <Link
        href="/provider/till"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      <div>
        <h1 className="text-xl font-bold text-foreground">Stock counts</h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          What the ledger says should be on the shelf, against what is actually
          there. Nothing moves until a count is approved, so a count can be
          abandoned halfway with no harm done.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-foreground">Start a count</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
          Say what you are counting. It is as often one shelf as the whole shop.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="Whole shop"
            className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <button
            onClick={() => void start()}
            disabled={busy}
            className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Start
          </button>
        </div>
      </Card>

      {counts.length === 0 && (
        <Card className="p-6 rounded-2xl text-center">
          <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">No counts yet</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            The gap between what the ledger says and what is on the shelf is your
            shrinkage. It is the number most shops never have.
          </p>
        </Card>
      )}

      {counts.map((c) => {
        const meta = STATUS_META[c.status]
        const isOpen = openId === c.id
        return (
          <Card key={c.id} className="rounded-2xl overflow-hidden">
            <button
              onClick={() => (isOpen ? setOpenId(null) : void open(c.id))}
              className="w-full p-4 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {c.reference} &middot; {c.scope}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.countedLines} of {c.lineCount} counted
                    {c.countedBy ? " · " + c.countedBy : ""}
                    {c.approvedBy ? " · approved by " + c.approvedBy : ""}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={"inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold " + meta.tone}>
                    {meta.label}
                  </span>
                  {c.countedLines > 0 && (
                    <p className={"mt-1 text-sm font-bold tabular-nums " +
                      (c.netVarianceValue < 0 ? "text-red-600 dark:text-red-400"
                        : c.netVarianceValue > 0 ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground")}>
                      {c.netVarianceValue > 0 ? "+" : ""}{sh(c.netVarianceValue)}
                    </p>
                  )}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border p-4">
                {!detail ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <ul className="divide-y divide-border">
                      {detail.lines.map((l) => (
                        <li key={l.id} className="py-2 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">
                              {l.name}{l.variantLabel ? " · " + l.variantLabel : ""}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Ledger says {q(l.expected)} {l.unit}
                            </p>
                          </div>

                          {detail.count.status === "DRAFT" ? (
                            <input
                              inputMode="decimal"
                              defaultValue={l.counted === null ? "" : String(l.counted)}
                              onBlur={(e) => void enter(l.id, e.target.value)}
                              placeholder="count"
                              className="w-20 h-10 px-2 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
                            />
                          ) : (
                            <span className="w-20 text-right text-sm tabular-nums text-foreground">
                              {/* Never shown as 0: not counted is not zero. */}
                              {l.counted === null ? <span className="text-muted-foreground">not counted</span> : q(l.counted)}
                            </span>
                          )}

                          <span className={"w-20 text-right text-xs font-semibold tabular-nums " +
                            (l.variance === null ? "text-muted-foreground"
                              : l.variance < 0 ? "text-red-600 dark:text-red-400"
                              : l.variance > 0 ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground")}>
                            {l.variance === null ? "—" : (l.variance > 0 ? "+" : "") + q(l.variance)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {detail.count.status === "DRAFT" && (
                        <>
                          <button
                            onClick={() => void act(() => submitStockCount({ id: c.id }))}
                            disabled={busy}
                            className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" /> Submit for approval
                          </button>
                          <button
                            onClick={() => {
                              const why = window.prompt("Why is this count being dropped?")
                              if (why) void act(() => cancelStockCount({ id: c.id, reason: why }))
                            }}
                            disabled={busy}
                            className="h-10 px-3 rounded-xl border border-border text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" /> Drop it
                          </button>
                        </>
                      )}
                      {detail.count.status === "SUBMITTED" && (
                        <button
                          onClick={() => void act(() => approveStockCount({ id: c.id }))}
                          disabled={busy}
                          className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve and post to stock
                        </button>
                      )}
                      {detail.count.status === "APPROVED" && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Posted to the stock ledger. The adjustments appear in stock
                          history against each product.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
