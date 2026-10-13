"use client"

import { useEffect, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, Loader2, Ban, Plus } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import {
  getShiftCash, recordCashMovement, voidCashMovement, type ShiftCashSummary,
} from "@/backend/actions/pos-cash"

/**
 * The open shift's drawer: what should be in it, and why.
 *
 * The expected figure is built in front of the shopkeeper rather than simply
 * stated, because the whole value of this panel is that a variance stops
 * being a mystery. "You should have 2,050" is an assertion; "1,000 float plus
 * 750 taken plus 500 in less 200 out" is an argument they can check against
 * the chits in the drawer.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })

export function DrawerPanel() {
  const [data, setData] = useState<ShiftCashSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<"PAY_IN" | "PAY_OUT" | null>(null)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [reference, setReference] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const refresh = async () => {
    const next = await getShiftCash()
    setData(next)
  }

  useEffect(() => {
    getShiftCash().then(setData).finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    if (!form) return
    setBusy(true)
    setError("")
    const r = await recordCashMovement({ kind: form, amount, reason, reference })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setAmount(""); setReason(""); setReference(""); setForm(null)
    await refresh()
  }

  const cancel = async (id: string) => {
    const why = window.prompt("Why is this being cancelled?")
    if (!why) return
    const r = await voidCashMovement({ id, reason: why })
    if (!r.success) { setError(r.error); return }
    await refresh()
  }

  if (loading) {
    return (
      <Card className="p-4 rounded-2xl">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  if (!data || !data.shiftId) {
    return (
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-foreground">The drawer</h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          No shift is open. Money in and out of the drawer is recorded against a
          shift, so that it can be reconciled at the end of one. Open a shift at
          the till first.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">The drawer</h2>
          <p className="text-[11px] text-muted-foreground">
            Shift opened {time(data.openedAt!)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Should be in the drawer</p>
          <p className="text-xl font-bold tabular-nums text-foreground">KSh {sh(data.expectedCash)}</p>
        </div>
      </div>

      {/* The sum, shown rather than asserted. */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Fig label="Opening float" value={data.openingFloat} />
        <Fig label="Cash taken" value={data.cashFromSales} />
        <Fig label="Paid in" value={data.paidIn} tint="text-emerald-600 dark:text-emerald-400" />
        <Fig label="Paid out" value={data.paidOut} tint="text-amber-600 dark:text-amber-400" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => { setForm(form === "PAY_IN" ? null : "PAY_IN"); setError("") }}
          className="h-10 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 active:scale-95"
        >
          <ArrowDownLeft className="w-4 h-4" /> Money in
        </button>
        <button
          onClick={() => { setForm(form === "PAY_OUT" ? null : "PAY_OUT"); setError("") }}
          className="h-10 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 active:scale-95"
        >
          <ArrowUpRight className="w-4 h-4" /> Money out
        </button>
      </div>

      {form && (
        <div className="mt-3 rounded-xl border border-border p-3 space-y-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="How much"
            className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={form === "PAY_IN" ? "What is this, for example change brought in" : "What was it for, for example boda to the depot"}
            className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Receipt or M-Pesa code, if there is one"
            className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Record it
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
      )}

      {data.movements.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {data.movements.map((m) => (
            <li key={m.id} className="py-2 flex items-start gap-2">
              <span className={"mt-0.5 " + (m.kind === "PAY_IN" ? "text-emerald-600" : "text-amber-600")}>
                {m.kind === "PAY_IN" ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={"text-xs font-medium text-foreground " + (m.voided ? "line-through opacity-60" : "")}>
                  {m.reason}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {time(m.occurredAt)} &middot; {m.recordedBy}
                  {m.reference ? " · " + m.reference : ""}
                  {m.voided && m.voidReason ? " · cancelled: " + m.voidReason : ""}
                </p>
              </div>
              <span className={"text-xs font-semibold tabular-nums " + (m.voided ? "line-through opacity-60 text-muted-foreground" : "text-foreground")}>
                {m.kind === "PAY_IN" ? "+" : "-"}{sh(m.amount)}
              </span>
              {!m.voided && (
                <button
                  onClick={() => void cancel(m.id)}
                  aria-label="Cancel this movement"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground active:scale-90"
                >
                  <Ban className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Fig({ label, value, tint }: { label: string; value: number; tint?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={"text-sm font-semibold tabular-nums " + (tint ?? "text-foreground")}>{sh(value)}</p>
    </div>
  )
}
