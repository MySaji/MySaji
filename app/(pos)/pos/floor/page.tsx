"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, Plus, AlertTriangle, Send, Receipt, UtensilsCrossed, X, ChefHat,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import {
  getFloor, getTab, createTable, openTab, addTabLine, voidTabLine,
  sendToKitchen, markLineServed, cancelTab,
  type TableRow, type TabRow,
} from "@/backend/actions/pos-tables"

/**
 * The floor: which tables are sitting, for how long, and what they owe.
 *
 * A host looks at this to answer two questions, so those two are what each
 * tile leads with: is it free, and how long have they been there. The money
 * is secondary and sits underneath.
 *
 * Sitting time is coloured rather than merely printed. A table at ninety
 * minutes is a table that wants its bill, and nobody scans a grid of numbers
 * for it mid-service.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SIT_TONE = (m: number | null) =>
  m === null ? "bg-muted text-muted-foreground"
    : m >= 90 ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
    : m >= 45 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
    : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"

const STATE_LABEL: Record<string, string> = {
  ordered: "not sent", cooking: "with kitchen", ready: "ready", served: "served",
}

export default function FloorPage() {
  const [tables, setTables] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [newTable, setNewTable] = useState("")
  const [line, setLine] = useState({ name: "", quantity: "1", unitPrice: "", modifiers: "", course: "1" })

  const refresh = async (tabId?: string | null) => {
    setTables(await getFloor())
    if (tabId) setTab(await getTab(tabId))
  }

  useEffect(() => {
    getFloor().then(setTables).finally(() => setLoading(false))
  }, [])

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>, tabId?: string | null) => {
    setBusy(true); setError("")
    const r = await fn()
    setBusy(false)
    if (!r.success) { setError(r.error ?? "That did not work."); return false }
    await refresh(tabId ?? tab?.id)
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
    <div className="p-4 max-w-4xl mx-auto space-y-3 pb-24">
      <div className="flex items-center justify-between">
        <Link
          href="/pos/sell"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" /> Till
        </Link>
        <Link
          href="/pos/kitchen"
          className="h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-slate-900 text-white active:scale-95"
        >
          <ChefHat className="w-3.5 h-3.5" /> Kitchen screen
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground">Floor</h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Who is sitting, how long they have been there, and what is on their tab.
          Nothing reaches the kitchen until it is sent.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {tables.length === 0 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-foreground">No tables yet</h2>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Add the tables as the room is actually laid out. The names are what
            the waiters already call them.
          </p>
        </Card>
      )}

      <div className="flex gap-2">
        <input
          value={newTable}
          onChange={(e) => setNewTable(e.target.value)}
          placeholder="T1, Terrace 2, Counter"
          className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm"
        />
        <button
          onClick={async () => {
            const ok = await run(() => createTable({ name: newTable }))
            if (ok) setNewTable("")
          }}
          disabled={busy || !newTable}
          className="h-11 px-4 rounded-lg border border-border text-sm font-semibold active:scale-95 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {tables.map((t) => (
          <button
            key={t.id}
            onClick={async () => {
              if (t.openOrderId) setTab(await getTab(t.openOrderId))
              else await run(() => openTab({ tableId: t.id }))
            }}
            className={"rounded-2xl border p-3 text-left active:scale-[0.98] transition-transform " +
              (t.openOrderId ? "border-primary bg-primary/5" : "border-border bg-card")}
          >
            <p className="text-sm font-bold text-foreground truncate">{t.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {t.area ? t.area + " · " : ""}{t.seats} seats
            </p>
            <span className={"mt-1.5 inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold " + SIT_TONE(t.sittingMinutes)}>
              {t.sittingMinutes === null ? "Free" : t.sittingMinutes + " min"}
            </span>
            {t.openOrderId && (
              <p className="mt-1 text-xs font-bold tabular-nums text-foreground">{sh(t.runningTotal)}</p>
            )}
          </button>
        ))}
      </div>

      {tab && (
        <Card className="p-4 rounded-2xl space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {tab.tableName ?? (tab.isTakeaway ? "Takeaway" : tab.reference)} &middot; {tab.reference}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {tab.covers ? tab.covers + " covers · " : ""}opened by {tab.openedBy ?? "someone"}
              </p>
            </div>
            <button
              onClick={() => setTab(null)}
              aria-label="Close"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {tab.lines.length > 0 && (
            <ul className="divide-y divide-border">
              {tab.lines.map((l) => (
                <li key={l.id} className="py-2 flex items-start gap-2">
                  <span className="text-xs font-semibold tabular-nums w-7 text-muted-foreground">{l.quantity}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{l.name}</p>
                    {l.modifiers.length > 0 && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">{l.modifiers.join(" · ")}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      course {l.course} &middot; {STATE_LABEL[l.state]}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground">{sh(l.total)}</span>
                  {l.state === "ready" && (
                    <button
                      onClick={() => void run(() => markLineServed({ lineId: l.id }))}
                      className="h-8 px-2 rounded-lg text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 active:scale-95"
                    >
                      served
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const why = window.prompt("Why is this coming off?")
                      if (why) void run(() => voidTabLine({ lineId: l.id, reason: why }))
                    }}
                    aria-label="Take this off"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground active:scale-90"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
            <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
              <span>Food</span><span className="tabular-nums">{sh(tab.food)}</span>
            </div>
            {tab.serviceCharge > 0 && (
              <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                <span>Service {tab.serviceChargePercent}%</span>
                <span className="tabular-nums">{sh(tab.serviceCharge)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1 border-t border-border">
              <span className="text-xs font-semibold text-foreground">Total</span>
              <span className="text-base font-bold tabular-nums text-foreground">{sh(tab.total)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-2">
            <input
              value={line.name}
              onChange={(e) => setLine({ ...line, name: e.target.value })}
              placeholder="What they ordered"
              className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
            />
            <input
              value={line.modifiers}
              onChange={(e) => setLine({ ...line, modifiers: e.target.value })}
              placeholder="No chilli, extra ugali (comma separated)"
              className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
            />
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) => setLine({ ...line, quantity: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="Qty"
                className="w-16 h-11 px-2 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
              />
              <input
                inputMode="numeric"
                value={line.course}
                onChange={(e) => setLine({ ...line, course: e.target.value.replace(/\D/g, "") })}
                placeholder="Course"
                className="w-16 h-11 px-2 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
              />
              <input
                inputMode="decimal"
                value={line.unitPrice}
                onChange={(e) => setLine({ ...line, unitPrice: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="Price"
                className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
              />
              <button
                onClick={async () => {
                  const ok = await run(() => addTabLine({
                    orderId: tab.id,
                    name: line.name,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    course: line.course || "1",
                    modifiers: line.modifiers.split(",").map((m) => m.trim()).filter(Boolean),
                  }))
                  if (ok) setLine({ name: "", quantity: "1", unitPrice: "", modifiers: "", course: line.course })
                }}
                disabled={busy}
                className="h-11 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-95 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void run(() => sendToKitchen({ orderId: tab.id }))}
              disabled={busy}
              className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> Send to kitchen
            </button>
            <Link
              href={"/pos/sell?tab=" + tab.id}
              className="h-10 px-3 rounded-xl border border-border text-xs font-semibold flex items-center gap-1.5 active:scale-95"
            >
              <Receipt className="w-3.5 h-3.5" /> Bill it
            </Link>
            <button
              onClick={() => {
                const why = window.prompt("Why is the tab being cancelled?")
                if (why) void run(() => cancelTab({ orderId: tab.id, reason: why }), null).then(() => setTab(null))
              }}
              disabled={busy}
              className="h-10 px-3 rounded-xl border border-border text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <UtensilsCrossed className="w-3.5 h-3.5" /> Cancel tab
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
