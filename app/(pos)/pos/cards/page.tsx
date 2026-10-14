"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Plus, Gift, AlertTriangle, Ban } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import {
  getGiftCards, issueGiftCard, topUpGiftCard, voidGiftCard,
  type GiftCardRow,
} from "@/backend/actions/pos-gift-cards"

/**
 * Gift cards and store credit.
 *
 * The code is the biggest thing on each row, because the only reason anybody
 * opens this page is to read one out or type one in. A card that is expired
 * or cancelled says so in words: a balance with no explanation is how a
 * cashier ends up arguing with a customer at the counter.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "2-digit" }) : null

export default function CardsPage() {
  const [rows, setRows] = useState<GiftCardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [issued, setIssued] = useState<string | null>(null)
  const [form, setForm] = useState({ value: "", issuedToName: "", issuedToPhone: "", expiresInDays: "" })
  const [topUp, setTopUp] = useState<Record<string, string>>({})

  const refresh = async () => setRows(await getGiftCards())

  useEffect(() => {
    getGiftCards().then(setRows).finally(() => setLoading(false))
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

  const outstanding = rows.filter((c) => c.isActive && !c.expired).reduce((a, c) => a + c.balance, 0)

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3 pb-24">
      <Link
        href="/pos/sell"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      <div>
        <h1 className="text-xl font-bold text-foreground">Gift cards and credit</h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Money the shop is holding for somebody. Spent at the till by choosing
          Gift card and typing the number from the card.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      <Card className="p-4 rounded-2xl">
        <p className="text-[11px] text-muted-foreground">Still owed to customers</p>
        <p className="text-2xl font-bold tabular-nums text-foreground">KSh {sh(outstanding)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
          This is a liability, not takings. The money was paid in already.
        </p>
      </Card>

      <Card className="p-4 rounded-2xl space-y-2">
        <h2 className="text-sm font-bold text-foreground">Issue one</h2>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Selling a gift card is an ordinary sale of a gift-card product. This
          only creates the card, so the money is not counted twice.
        </p>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value.replace(/[^\d.]/g, "") })}
            placeholder="Value"
            className="w-28 h-11 px-3 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
          />
          <input
            value={form.issuedToName}
            onChange={(e) => setForm({ ...form, issuedToName: e.target.value })}
            placeholder="Who it is for"
            className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            value={form.expiresInDays}
            onChange={(e) => setForm({ ...form, expiresInDays: e.target.value.replace(/\D/g, "") })}
            placeholder="Expires in days (optional)"
            className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <button
            onClick={async () => {
              setBusy(true); setError(""); setIssued(null)
              const r = await issueGiftCard({
                value: form.value,
                issuedToName: form.issuedToName || null,
                expiresInDays: form.expiresInDays || null,
              })
              setBusy(false)
              if (!r.success) { setError(r.error); return }
              setIssued(r.code)
              setForm({ value: "", issuedToName: "", issuedToPhone: "", expiresInDays: "" })
              await refresh()
            }}
            disabled={busy || !form.value}
            className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Issue
          </button>
        </div>
        {issued && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Write this on the card</p>
            <p className="text-2xl font-bold tracking-wider tabular-nums text-emerald-800 dark:text-emerald-300">
              {issued}
            </p>
          </div>
        )}
      </Card>

      {rows.length === 0 && (
        <Card className="p-6 rounded-2xl text-center">
          <Gift className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">No cards yet</p>
        </Card>
      )}

      {rows.map((c) => (
        <Card key={c.id} className="p-4 rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold tracking-wider text-foreground">{c.code}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {c.kind === "STORE_CREDIT" ? "Store credit" : "Gift card"}
                {c.issuedToName ? " · " + c.issuedToName : ""}
                {c.expiresAt ? " · expires " + day(c.expiresAt) : ""}
              </p>
              {!c.isActive && (
                <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  Cancelled{c.voidReason ? ": " + c.voidReason : ""}
                </p>
              )}
              {c.isActive && c.expired && (
                <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Expired. It will not be accepted at the till.
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold tabular-nums text-foreground">{sh(c.balance)}</p>
              <p className="text-[10px] text-muted-foreground">of {sh(c.initialValue)}</p>
            </div>
          </div>

          {c.isActive && !c.expired && (
            <div className="mt-2 flex gap-2">
              <input
                inputMode="decimal"
                value={topUp[c.id] ?? ""}
                onChange={(e) => setTopUp({ ...topUp, [c.id]: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="Top up"
                className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
              />
              <button
                onClick={async () => {
                  const ok = await run(() => topUpGiftCard({ code: c.code, amount: topUp[c.id] ?? "" }))
                  if (ok) setTopUp({ ...topUp, [c.id]: "" })
                }}
                disabled={busy || !topUp[c.id]}
                className="h-10 px-3 rounded-lg border border-border text-xs font-semibold active:scale-95 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => {
                  const why = window.prompt("Why is this card being cancelled?")
                  if (why) void run(() => voidGiftCard({ id: c.id, reason: why }))
                }}
                disabled={busy}
                aria-label="Cancel this card"
                className="h-10 w-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground active:scale-95 disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
              </button>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
