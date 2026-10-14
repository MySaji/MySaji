"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, Calculator, Hammer, AlertTriangle, Check, Banknote,
  Smartphone, CreditCard, Landmark, HandCoins,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { getOpenDeposits, settleDeposit, type OpenDeposit } from "@/backend/actions/pos-sales"
import { TillReceipt } from "@/frontend/components/pos/till-receipt"
import type { Receipt } from "@/backend/actions/pos-sales"

/**
 * Orders taken and not yet handed over.
 *
 * Deliberately separate from the register: this is not a sale in progress,
 * it is a promise the shop has already been paid against. A shopkeeper
 * opens this to answer "what do I owe people" and "has this customer
 * finished paying", which are different questions from anything the till
 * screen answers.
 *
 * Shillings, unconverted, like every other POS screen.
 */

function sh(n: number): string {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const METHODS = ["CASH", "MPESA", "CARD", "BANK"] as const
const METHOD_ICON: Record<string, typeof Banknote> = {
  CASH: Banknote, MPESA: Smartphone, CARD: CreditCard, BANK: Landmark, CREDIT: HandCoins,
}

export default function TillOrdersPage() {
  const [orders, setOrders] = useState<OpenDeposit[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH")
  const [reference, setReference] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  const reload = () => getOpenDeposits().then(setOrders)
  useEffect(() => { void reload() }, [])

  const settle = async (order: OpenDeposit, fulfil: boolean) => {
    setBusy(true); setError("")
    const r = await settleDeposit({
      saleId: order.saleId,
      payments: [{ method, amount: Number(amount || 0), ...(reference.trim() ? { reference: reference.trim() } : {}) }],
      ...(fulfil ? { fulfil: true } : {}),
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    if (fulfil) setReceipt(r.data)
    setOpenId(null); setAmount(""); setReference("")
    await reload()
  }

  if (receipt) {
    return (
      <div className="p-4">
        <TillReceipt receipt={receipt} onNewSale={() => setReceipt(null)} />
      </div>
    )
  }

  if (orders === null) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="p-3 max-w-2xl mx-auto space-y-3 pb-24">
      <Link href="/pos/sell" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Orders to deliver</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Paid for in part and not yet handed over. Nothing has come off your stock for these —
          it moves when the customer takes them.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {orders.length === 0 ? (
        <Card className="p-6 text-center rounded-2xl">
          <Check className="w-8 h-8 mx-auto text-emerald-500" strokeWidth={2.5} />
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Nothing outstanding</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Every order has been handed over.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Card
              key={o.saleId}
              className={o.overdue
                ? "p-3 rounded-2xl border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10"
                : "p-3 rounded-2xl"}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {o.customerName || "Walk-in"}
                    <span className="ml-1.5 text-[10px] font-normal text-gray-400">#{o.saleNumber}</span>
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {o.lines.map((l) => l.quantity + " x " + l.name + (l.variantLabel ? " (" + l.variantLabel + ")" : "")).join(", ")}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {o.dueDate
                      ? (o.overdue ? "was due " : "due ") + new Date(o.dueDate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })
                      : "no date agreed"}
                    {o.customerPhone && " · " + o.customerPhone}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">owed</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{sh(o.balanceDue)}</p>
                  <p className="text-[10px] text-gray-400 tabular-nums">paid {sh(o.paid)} of {sh(o.total)}</p>
                </div>
              </div>

              {openId === o.saleId ? (
                <div className="mt-2.5 border-t border-gray-100 dark:border-gray-700 pt-2.5 space-y-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {METHODS.map((m) => {
                      const Icon = METHOD_ICON[m]
                      const on = method === m
                      return (
                        <button
                          key={m}
                          onClick={() => setMethod(m)}
                          aria-pressed={on}
                          className={`h-11 rounded-lg border flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                            on ? "border-primary bg-primary/5 text-primary" : "border-gray-200 dark:border-gray-700 text-gray-500"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-[9px] font-semibold">{m === "MPESA" ? "M-Pesa" : m[0] + m.slice(1).toLowerCase()}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      placeholder="Amount"
                      className="h-11 rounded-xl tabular-nums text-base"
                    />
                    <Button
                      variant="outline"
                      onClick={() => setAmount(String(o.balanceDue))}
                      className="h-11 rounded-xl text-[11px] whitespace-nowrap"
                    >
                      Balance
                    </Button>
                  </div>
                  {method !== "CASH" && (
                    <Input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder={method === "MPESA" ? "M-Pesa code" : "Reference"}
                      className="h-10 rounded-xl text-xs"
                    />
                  )}
                  <div className="flex gap-1.5">
                    <Button
                      onClick={() => void settle(o, true)}
                      disabled={busy || !amount}
                      className="h-11 rounded-xl text-xs flex-1"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Pay & hand over"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void settle(o, false)}
                      disabled={busy || !amount}
                      className="h-11 rounded-xl text-xs"
                    >
                      Part payment
                    </Button>
                  </div>
                  <button onClick={() => { setOpenId(null); setError("") }} className="w-full py-2 text-[11px] text-gray-400 underline">
                    Cancel
                  </button>
                </div>
              ) : (
                <Button
                  onClick={() => { setOpenId(o.saleId); setAmount(""); setReference(""); setMethod("CASH"); setError("") }}
                  className="mt-2.5 w-full h-10 rounded-xl text-xs gap-1.5"
                >
                  <Hammer className="w-3.5 h-3.5" /> Take payment
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {orders.length === 0 && (
        <Link href="/pos/sell">
          <Button variant="outline" className="w-full h-11 rounded-xl text-xs">Back to the till</Button>
        </Link>
      )}
    </div>
  )
}
