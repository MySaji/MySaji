"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Calculator, Loader2, Search, Plus, Minus, Trash2, X, ArrowRight, ArrowLeft,
  SlidersHorizontal, Package, AlertTriangle, Clock, Banknote, Smartphone,
  CreditCard, Landmark, HandCoins, ShoppingCart, CloudOff, RefreshCw,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getTillState, findTillProducts, recordPosSale, openTillShift, closeTillShift, voidPosSale,
  type TillState, type TillProduct, type TillVariant, type Receipt, type ShiftCloseSummary,
} from "@/lib/actions/pos-sales"
import { TillReceipt } from "@/components/pos/till-receipt"
import { TillInstall } from "@/components/pos/till-install"
import { usePosOffline } from "@/lib/hooks/usePosOffline"
import { searchCached } from "@/lib/pos-offline"

/**
 * The register.
 *
 * Built for one hand on a phone at a counter, which drives every layout
 * decision here. The catalogue and the cart cannot both be on screen at 390px,
 * so the catalogue owns the screen and the cart is a sticky bar that expands —
 * a cashier's thumb lives at the bottom of the phone, not the top. From
 * `lg` up the two sit side by side, because a shop with a counter machine has
 * the width and should not have to tap to see the basket.
 *
 * MONEY IS SHILLINGS, NOT THE VIEWER'S CURRENCY. See the note in
 * components/pos/till-receipt.tsx — this page deliberately does not use
 * useLocalization's formatMoney, which would convert.
 *
 * What this screen does NOT do yet, and does not pretend to: work offline.
 * Every action here is a round trip. The groundwork is in place (each sale
 * carries an idempotency key, so a retry cannot double-charge) but there is no
 * local catalogue and no queue, so a dropped connection means a failed sale
 * rather than a queued one. Saying so is better than a cashier discovering it.
 */

function sh(n: number): string {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
/** Totals, without the trailing zeros, for buttons and chips. */
function shShort(n: number): string {
  return n.toLocaleString("en-KE", { maximumFractionDigits: 2 })
}

type CartLine = {
  product: TillProduct
  /** The chosen size or option, for a product that has them. */
  variant: TillVariant | null
  /** A string throughout, so "1.3" mid-typing is not coerced to 1.3 and back. */
  quantity: string
  unitPriceOverride?: number
  lineDiscount?: number
}

/** A cart line is identified by product AND variant: two sizes of the same
 *  shirt are two lines, not one with a quantity of two. */
const lineKey = (productId: string, variantId: string | null) => `${productId}::${variantId ?? ""}`

type PaymentDraft = { method: "CASH" | "MPESA" | "CARD" | "BANK" | "CREDIT"; amount: string; reference: string }

const METHOD_META: Record<PaymentDraft["method"], { label: string; icon: typeof Banknote }> = {
  CASH: { label: "Cash", icon: Banknote },
  MPESA: { label: "M-Pesa", icon: Smartphone },
  CARD: { label: "Card", icon: CreditCard },
  BANK: { label: "Bank", icon: Landmark },
  CREDIT: { label: "Credit", icon: HandCoins },
}

/**
 * Plausible amounts a customer actually hands over for a given total.
 *
 * A fixed list of notes does not work: for a 1,462.50 sale, every note up to
 * 1,000 is too small and the cashier is left typing. Rounding the total up to
 * the next 100, 500 and 1,000 gives the three tenders that are actually
 * likely — 1,500 and 2,000 here — whatever the sale is worth.
 */
function quickCash(total: number): number[] {
  if (total <= 0) return []
  const up = (step: number) => Math.ceil(total / step) * step
  return [...new Set([up(100), up(500), up(1000)])]
    .filter((n) => n > total)
    .slice(0, 3)
}

export default function TillPage() {
  const [state, setState] = useState<TillState | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"sell" | "pay" | "receipt">("sell")

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<TillProduct[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [saleDiscount, setSaleDiscount] = useState("")
  const [customerName, setCustomerName] = useState("")

  const [payments, setPayments] = useState<PaymentDraft[]>([{ method: "CASH", amount: "", reference: "" }])
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // Generated once per sale attempt and resent unchanged on every retry, so a
  // dropped response cannot ring the same sale up twice. Replaced only after a
  // sale is successfully recorded.
  const [idempotencyKey, setIdempotencyKey] = useState(() => newKey())

  const offline = usePosOffline()
  // A sale that was queued rather than sent. The customer is standing
  // there and the sale DID happen, so a receipt is still shown — what
  // changes is the wording on it.
  const [queuedReceipt, setQueuedReceipt] = useState<{ total: number; change: number; items: number } | null>(null)
  /** The product whose size is being chosen, if any. */
  const [pickVariantFor, setPickVariantFor] = useState<TillProduct | null>(null)

  const [shiftOpening, setShiftOpening] = useState("")
  const [shiftCounted, setShiftCounted] = useState("")
  const [shiftNote, setShiftNote] = useState("")
  const [showShift, setShowShift] = useState(false)
  const [closeSummary, setCloseSummary] = useState<ShiftCloseSummary | null>(null)

  const reload = useCallback(() => getTillState().then(setState), [])

  useEffect(() => {
    Promise.all([
      getTillState().then(setState),
      findTillProducts({ query: "" }).then((p) => { setResults(p); return p }),
    ])
      .then(([, products]) => { void offline.saveCatalogue(products) })
      .catch(() => { /* the offline effect below renders what is cached */ })
      .finally(() => setLoading(false))
    // offline.saveCatalogue is stable; this must run once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced, because a barcode scanner types a whole code in milliseconds
  // and a request per keystroke would both hammer the server and let an
  // earlier response land after a later one.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearching(true)
      findTillProducts({ query })
        .then((p) => {
          setResults(p)
          // Only a full, unfiltered result is worth caching — caching a
          // search result would shrink the local catalogue to whatever was
          // last typed.
          if (query.trim() === "") void offline.saveCatalogue(p)
        })
        .catch(() => {
          // Unreachable. Serve the last catalogue this till saw rather than
          // an empty screen, and let the banner say which it is.
          setResults(searchCached(offline.catalogue, query))
        })
        .finally(() => setSearching(false))
    }, 180)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, offline.catalogue])

  // ---- cart maths. Mirrors the server, which prices the sale for real. ----
  const lineTotal = (l: CartLine) => {
    const qty = Number(l.quantity || 0)
    // The variant's price where there is one — it may differ from the
    // product's, and charging the product's would undercharge silently.
    const price = l.unitPriceOverride ?? l.variant?.price ?? l.product.price
    return Math.max(0, qty * price - (l.lineDiscount ?? 0))
  }
  const subtotal = useMemo(() => cart.reduce((a, l) => a + lineTotal(l), 0), [cart])
  const discountNum = Math.min(Number(saleDiscount || 0), subtotal)
  const net = subtotal - discountNum
  const taxRate = state?.taxRate ?? 0
  const taxInclusive = state?.taxInclusive ?? true
  const tax = taxRate === 0 ? 0 : taxInclusive ? net - net / (1 + taxRate / 100) : net * (taxRate / 100)
  const total = taxInclusive ? net : net + tax
  const paid = payments.reduce((a, p) => a + Number(p.amount || 0), 0)
  const hasCash = payments.some((p) => p.method === "CASH")
  const change = hasCash ? Math.max(0, paid - total) : 0
  const shortBy = Math.max(0, total - paid)

  const itemCount = cart.length

  // ---- cart actions -------------------------------------------------------
  const addProduct = (product: TillProduct, variant?: TillVariant | null) => {
    setError("")

    // A product sold in sizes cannot be added without one. If the scan
    // already identified the size, use it and skip the question; otherwise
    // ask, because "a shirt" is not something that can be handed over.
    if (product.variants.length > 0 && !variant) {
      const scanned = product.matchedVariantId
        ? product.variants.find((v) => v.id === product.matchedVariantId)
        : undefined
      if (scanned) return addProduct(product, scanned)
      setPickVariantFor(product)
      return
    }

    const chosen = variant ?? null
    setPickVariantFor(null)
    setCart((prev) => {
      const key = lineKey(product.id, chosen?.id ?? null)
      const at = prev.findIndex((l) => lineKey(l.product.id, l.variant?.id ?? null) === key)
      if (at === -1) return [...prev, { product, variant: chosen, quantity: "1" }]
      // A second scan of the same barcode means one more of it, which is what
      // a cashier scanning three identical tins expects. For a measured
      // product that is still +1 of the unit; they can type the weight after.
      const next = [...prev]
      next[at] = { ...next[at], quantity: String(Number(next[at].quantity || 0) + 1) }
      return next
    })
  }

  const setQuantity = (key: string, quantity: string) => {
    // Only digits and at most one dot, and only a dot at all where the shop
    // actually sells by measure.
    const cleaned = state?.canSellFractional
      ? quantity.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
      : quantity.replace(/\D/g, "")
    setCart((prev) => prev.map((l) => (lineKey(l.product.id, l.variant?.id ?? null) === key ? { ...l, quantity: cleaned } : l)))
  }

  const bumpQuantity = (key: string, by: number) => {
    setCart((prev) => prev.map((l) => {
      if (lineKey(l.product.id, l.variant?.id ?? null) !== key) return l
      const next = Math.max(0, Number(l.quantity || 0) + by)
      return { ...l, quantity: next === 0 ? "" : String(Number(next.toFixed(3))) }
    }))
  }

  const setOverride = (key: string, raw: string) => {
    const value = raw.replace(/[^\d.]/g, "")
    setCart((prev) => prev.map((l) =>
      lineKey(l.product.id, l.variant?.id ?? null) === key
        ? { ...l, unitPriceOverride: value === "" ? undefined : Number(value) }
        : l))
  }

  const removeLine = (key: string) =>
    setCart((prev) => prev.filter((l) => lineKey(l.product.id, l.variant?.id ?? null) !== key))

  const clearSale = () => {
    setCart([]); setSaleDiscount(""); setCustomerName(""); setPickVariantFor(null)
    setPayments([{ method: "CASH", amount: "", reference: "" }])
    setReceipt(null); setError(""); setCartOpen(false)
    setIdempotencyKey(newKey())
    setView("sell")
    searchRef.current?.focus()
  }

  // ---- submitting ---------------------------------------------------------
  const takePayment = async () => {
    setBusy(true); setError("")
    const payload = {
      idempotencyKey,
      lines: cart
        // A line left at empty or zero is a line the cashier backed out of.
        .filter((l) => Number(l.quantity || 0) > 0)
        .map((l) => ({
          productId: l.product.id,
          ...(l.variant ? { variantId: l.variant.id } : {}),
          quantity: String(Number(l.quantity)),
          ...(l.unitPriceOverride !== undefined ? { unitPriceOverride: l.unitPriceOverride } : {}),
          ...(l.lineDiscount ? { lineDiscount: l.lineDiscount } : {}),
        })),
      payments: payments
        .filter((p) => Number(p.amount || 0) > 0)
        .map((p) => ({
          method: p.method,
          amount: Number(p.amount),
          ...(p.reference.trim() ? { reference: p.reference.trim() } : {}),
        })),
      ...(discountNum > 0 ? { saleDiscount: discountNum } : {}),
      ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
    }

    const r = await offline.submitSale(payload, { total, itemCount: cart.length })
    setBusy(false)

    if (!r.ok && !r.queued) { setError(r.error); return }

    if (r.ok) {
      setReceipt(r.receipt)
      setQueuedReceipt(null)
      void reload()
      void findTillProducts({ query }).then(setResults).catch(() => {})
    } else {
      // Queued. No receipt number yet — the server assigns those, and
      // inventing one here would collide with a real one later.
      setQueuedReceipt({ total, change, items: cart.length })
      setReceipt(null)
    }
    setView("receipt")
    // Rotated only once the sale is either confirmed OR safely queued under
    // this key. Rotating after a plain failure would turn the cashier's
    // retry into a second sale.
    setIdempotencyKey(newKey())
  }

  const doVoid = async () => {
    if (!receipt) return
    const reason = window.prompt("Why is this sale being voided?")
    if (!reason || reason.trim().length < 3) return
    setBusy(true)
    const r = await voidPosSale({ saleId: receipt.saleId, reason: reason.trim() })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    void reload()
    clearSale()
  }

  const doOpenShift = async () => {
    setBusy(true); setError("")
    const r = await openTillShift({ openingFloat: Number(shiftOpening || 0) })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setShiftOpening(""); setShowShift(false); void reload()
  }

  const doCloseShift = async () => {
    setBusy(true); setError("")
    const r = await closeTillShift({ countedCash: Number(shiftCounted || 0), note: shiftNote.trim() || undefined })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setCloseSummary(r.data)
    setShiftCounted(""); setShiftNote(""); setShowShift(false); void reload()
  }

  // ---- render -------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!state) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <Calculator className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <h1 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">No till on this account</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            A till is for serving customers at your own counter. You can add it from My Business,
            as long as this account does not also offer services, rentals, tutoring or consulting.
          </p>
          <Link href="/provider/business-types">
            <Button className="mt-4 h-11 rounded-xl gap-1.5">
              Go to My Business <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (view === "receipt" && receipt) {
    return (
      <div className="p-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <TillReceipt receipt={receipt} onNewSale={clearSale} onVoid={busy ? undefined : doVoid} />
      </div>
    )
  }

  // Queued, not sent. Deliberately a different screen from a real receipt:
  // there is no receipt number yet, nothing has been voided or can be, and
  // saying "Sale recorded" would be a claim about a server that has not
  // heard of it.
  if (view === "receipt" && queuedReceipt) {
    return (
      <div className="p-4 mx-auto w-full max-w-sm">
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 p-4 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center">
            <CloudOff className="w-5 h-5" />
          </div>
          <p className="mt-2 text-xs font-semibold text-amber-900 dark:text-amber-300">Saved on this device</p>
          {queuedReceipt.change > 0 ? (
            <>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-amber-800/70 dark:text-amber-400/70">Change</p>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-200 tabular-nums">
                KSh {sh(queuedReceipt.change)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-amber-800/70 dark:text-amber-400/70">Total</p>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-200 tabular-nums">
                KSh {sh(queuedReceipt.total)}
              </p>
            </>
          )}
          <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
            There is no connection, so this sale is waiting on this device. It will go through
            on its own when the line comes back. Do not ring it up again.
          </p>
          <p className="mt-1.5 text-[10px] text-amber-700/80 dark:text-amber-400/70 leading-snug">
            A receipt number is given when it reaches the server, so there is none to print yet.
          </p>
        </div>
        <button
          onClick={clearSale}
          className="mt-3 w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          Next sale
        </button>
      </div>
    )
  }

  return (
    <div className="pb-28 lg:pb-4">
      {/* ---- shift and takings bar ---------------------------------------- */}
      <div className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-3 py-2">
        {/* Connection, stated before anything else. A cashier must never
            have to infer it from a sale failing. */}
        {(offline.connection === "offline" || offline.pendingCount > 0 || offline.failedCount > 0) && (
          <div className="max-w-5xl mx-auto mb-2 flex flex-wrap items-center gap-1.5">
            {offline.connection === "offline" && (
              <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">
                <CloudOff className="w-3 h-3" /> No connection — sales are saved here
              </span>
            )}
            {offline.pendingCount > 0 && (
              <button
                onClick={() => void offline.sync()}
                disabled={offline.syncing}
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] font-semibold active:scale-95"
              >
                <RefreshCw className={`w-3 h-3 ${offline.syncing ? "animate-spin" : ""}`} />
                {offline.pendingCount} waiting to send
              </button>
            )}
            {offline.failedCount > 0 && (
              <Link
                href="/provider/till/queue"
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[11px] font-semibold active:scale-95"
              >
                <AlertTriangle className="w-3 h-3" /> {offline.failedCount} need attention
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 max-w-5xl mx-auto">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{state.shopName}</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              KSh {shShort(state.takingsToday)}
              {/* Separated by a dot, not only by a margin: "KSh 0" followed by
                  "0 sales today" ran together as "KSh 0 0 sales today" and
                  read like one broken number. */}
              <span className="ml-1.5 text-[11px] font-normal text-gray-400">
                &middot; {state.salesToday} {state.salesToday === 1 ? "sale" : "sales"} today
              </span>
            </p>
          </div>
          <button
            onClick={() => { setShowShift((v) => !v); setCloseSummary(null) }}
            className={`h-9 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform ${
              state.shift
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {state.shift ? "Shift open" : "No shift"}
          </button>
          <Link href="/provider/till/settings" className="flex-shrink-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 active:scale-95 transition-transform">
              <SlidersHorizontal className="w-4 h-4" />
            </span>
          </Link>
        </div>

        {showShift && (
          <div className="max-w-5xl mx-auto mt-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3">
            {state.shift ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <ShiftStat label="Float" value={state.shift.openingFloat} />
                  <ShiftStat label="Cash taken" value={state.shift.cashTaken} />
                  <ShiftStat label="Expected" value={state.shift.openingFloat + state.shift.cashTaken} />
                </div>
                {state.shift.nonCashTaken > 0 && (
                  <p className="mt-1.5 text-center text-[11px] text-gray-500 dark:text-gray-400">
                    Plus KSh {shShort(state.shift.nonCashTaken)} not in the drawer (M-Pesa, card, bank)
                  </p>
                )}
                <label className="mt-2.5 block text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  Count the drawer and enter what is in it
                </label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={shiftCounted}
                    onChange={(e) => setShiftCounted(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-10 rounded-xl tabular-nums"
                  />
                  <Button onClick={doCloseShift} disabled={busy || shiftCounted === ""} className="h-10 rounded-xl text-xs whitespace-nowrap">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Close shift"}
                  </Button>
                </div>
                <Input
                  value={shiftNote}
                  onChange={(e) => setShiftNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="mt-1.5 h-9 rounded-xl text-xs"
                />
              </>
            ) : (
              <>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
                  Opening a shift records the cash you start with, so the drawer can be checked
                  against it later. Sales still work without one.
                </p>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={shiftOpening}
                    onChange={(e) => setShiftOpening(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    placeholder="Cash in the drawer now"
                    className="h-10 rounded-xl tabular-nums"
                  />
                  <Button onClick={doOpenShift} disabled={busy} className="h-10 rounded-xl text-xs whitespace-nowrap">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Open shift"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {closeSummary && (
          <div className={`max-w-5xl mx-auto mt-2 rounded-xl border p-3 ${
            closeSummary.variance === 0
              ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20"
              : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10"
          }`}>
            <p className="text-xs font-bold text-gray-900 dark:text-white">
              Shift closed &middot; {closeSummary.saleCount} {closeSummary.saleCount === 1 ? "sale" : "sales"}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
              <ShiftStat label="Expected" value={closeSummary.expectedCash} />
              <ShiftStat label="Counted" value={closeSummary.countedCash} />
              <ShiftStat label="Difference" value={closeSummary.variance} highlight={closeSummary.variance !== 0} />
            </div>
            <button onClick={() => setCloseSummary(null)} className="mt-2 text-[11px] text-gray-500 underline">Dismiss</button>
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto p-3 lg:grid lg:grid-cols-[1fr_360px] lg:gap-4 lg:items-start">
        {/* ---- catalogue -------------------------------------------------- */}
        <div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // A barcode scanner ends its input with Enter. One result is
                // an unambiguous scan, so add it and clear for the next item
                // without the cashier touching anything.
                if (e.key === "Enter" && results.length === 1) {
                  addProduct(results[0])
                  setQuery("")
                }
              }}
              placeholder="Scan a barcode, or search by name"
              className="h-12 pl-9 pr-9 rounded-xl text-base"
              autoComplete="off"
              autoFocus
            />
            {query !== "" && (
              <button
                onClick={() => { setQuery(""); searchRef.current?.focus() }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {error && view === "sell" && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}

          {results.length === 0 && !searching && (
            <Card className="mt-3 p-5 text-center rounded-2xl">
              <Package className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {query ? "Nothing matches that" : "Your catalogue is empty"}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {query
                  ? "Check the spelling, or add this product to your catalogue first."
                  : "A till needs something to ring up. Add your products and their prices."}
              </p>
              <Link href="/shopkeeper/products">
                <Button variant="outline" size="sm" className="mt-3 h-9 rounded-lg text-xs gap-1">
                  <Package className="w-3.5 h-3.5" /> Products &amp; Stock
                </Button>
              </Link>
            </Card>
          )}

          {/* Two columns even at 390px, three from lg.
              This started as one column below 420px and that was wrong: a
              cashier could see six products at a time, so finding anything
              meant scrolling mid-queue. Two columns roughly doubles what is
              reachable without a scroll, and the tiles are still comfortably
              above the 32px tap floor. */}
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-3 gap-2">
            {results.map((p) => {
              const inCart = cart.find((l) => l.product.id === p.id)
              const out = p.stock <= 0
              return (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className={`relative text-left p-2.5 rounded-xl border min-h-[72px] active:scale-[0.98] transition-all ${
                    inCart
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary/50"
                  }`}
                >
                  <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">{p.name}</p>
                  <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                    {shShort(p.price)}
                    {p.unit !== "piece" && <span className="text-[10px] font-normal text-gray-400">/{p.unit}</span>}
                  </p>
                  <p className={`mt-0.5 text-[10px] tabular-nums ${out ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                    {out ? "out of stock" : `${shShort(p.stock)} ${p.unit === "piece" ? "left" : p.unit}`}
                    {/* The total across sizes, with the count, so a cashier
                        knows a tap opens a choice rather than adding
                        something. */}
                    {p.variants.length > 0 && (
                      <span className="text-gray-400"> &middot; {p.variants.length} options</span>
                    )}
                  </p>
                  {inCart && (
                    <span className="absolute top-2 right-2 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {inCart.quantity || "0"}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {results.length > 0 && (
            <div className="mt-3">
              <TillInstall />
            </div>
          )}
        </div>

        {/* ---- cart: a sheet on a phone, a column on a counter machine ---- */}
        <div
          className={`${
            cartOpen
              ? "fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl"
              : "hidden"
          } lg:static lg:block lg:inset-auto lg:z-auto lg:overflow-visible lg:rounded-none lg:shadow-none lg:bg-transparent lg:dark:bg-transparent`}
        >
          <div className="p-3 lg:p-0">
            <div className="flex items-center justify-between lg:hidden">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">This sale</h2>
              <button
                onClick={() => setCartOpen(false)}
                aria-label="Close basket"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <Card className="mt-2 lg:mt-0 rounded-2xl overflow-hidden">
              {cart.length === 0 ? (
                <div className="p-5 text-center">
                  <ShoppingCart className="w-7 h-7 mx-auto text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Scan or tap a product to start.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {cart.map((l) => {
                    const key = lineKey(l.product.id, l.variant?.id ?? null)
                    return (
                    <div key={key} className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                            {l.product.name}
                            {l.variant && <span className="text-gray-500 font-normal"> &middot; {l.variant.label}</span>}
                          </p>
                          <p className="text-[10px] text-gray-400 tabular-nums">
                            {shShort(l.unitPriceOverride ?? l.variant?.price ?? l.product.price)}
                            {l.product.unit !== "piece" && `/${l.product.unit}`}
                            {l.unitPriceOverride !== undefined && " (price set)"}
                          </p>
                        </div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{sh(lineTotal(l))}</p>
                        <button
                          onClick={() => removeLine(key)}
                          aria-label={`Remove ${l.product.name}${l.variant ? " " + l.variant.label : ""}`}
                          className="-m-1 w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 active:scale-90"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          onClick={() => bumpQuantity(key, -1)}
                          aria-label="One less"
                          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 active:scale-90"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        {/* A keypad where the shop sells by measure, a stepper
                            where it does not — the trait decides, and the
                            server enforces the same rule. */}
                        <Input
                          value={l.quantity}
                          onChange={(e) => setQuantity(key, e.target.value)}
                          inputMode={state.canSellFractional ? "decimal" : "numeric"}
                          aria-label={`Quantity of ${l.product.name}${l.variant ? " " + l.variant.label : ""}`}
                          className="h-9 w-16 rounded-lg text-center tabular-nums px-1"
                        />
                        <span className="text-[10px] text-gray-400 w-8">{l.product.unit === "piece" ? "" : l.product.unit}</span>
                        <button
                          onClick={() => bumpQuantity(key, 1)}
                          aria-label="One more"
                          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 active:scale-90"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        {state.canOverridePrice && (
                          <Input
                            value={l.unitPriceOverride ?? ""}
                            onChange={(e) => setOverride(key, e.target.value)}
                            inputMode="decimal"
                            placeholder="price"
                            aria-label={`Price for ${l.product.name}${l.variant ? " " + l.variant.label : ""}`}
                            className="h-9 flex-1 min-w-0 rounded-lg text-center tabular-nums px-1 text-xs"
                          />
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}

              {cart.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-1.5 bg-gray-50/60 dark:bg-gray-800/40">
                  <Row label="Subtotal" value={sh(subtotal)} />
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="sale-discount" className="text-[11px] text-gray-500 dark:text-gray-400">Discount</label>
                    <Input
                      id="sale-discount"
                      value={saleDiscount}
                      onChange={(e) => setSaleDiscount(e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      placeholder="0"
                      className="h-8 w-24 rounded-lg text-right tabular-nums text-xs"
                    />
                  </div>
                  {taxRate > 0 && (
                    <Row
                      label={`Tax ${taxRate}%${taxInclusive ? " (included)" : ""}`}
                      value={sh(tax)}
                    />
                  )}
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Total</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">KSh {sh(total)}</span>
                  </div>
                  <Button
                    onClick={() => { setView("pay"); setPayments([{ method: "CASH", amount: "", reference: "" }]); setError("") }}
                    disabled={total <= 0}
                    className="w-full h-12 rounded-xl font-semibold mt-1"
                  >
                    Take payment <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                  <button onClick={clearSale} className="w-full py-2.5 text-[11px] text-gray-400 underline">
                    Cancel this sale
                  </button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* ---- sticky basket bar (phones only) ------------------------------ */}
      {itemCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-16 inset-x-3 z-30 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg flex items-center justify-between px-4 active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="w-4 h-4" />
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="text-base font-bold tabular-nums">KSh {sh(total)}</span>
        </button>
      )}

      {/* ---- which size? ---------------------------------------------------
          Only ever opened by tapping a product that has options. A scan that
          matched a size's own barcode skips this entirely, which is the whole
          reason each size can carry its own barcode. */}
      {pickVariantFor && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-black/40">
          <div className="w-full lg:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{pickVariantFor.name}</p>
                <p className="text-[11px] text-gray-500">Which one?</p>
              </div>
              <button
                onClick={() => setPickVariantFor(null)}
                aria-label="Close"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-90 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 grid grid-cols-2 min-[460px]:grid-cols-3 gap-2">
              {pickVariantFor.variants.map((v) => {
                const none = v.stock <= 0
                return (
                  <button
                    key={v.id}
                    onClick={() => addProduct(pickVariantFor, v)}
                    className={`min-h-[72px] p-2.5 rounded-xl border text-left active:scale-[0.98] transition-all ${
                      none
                        ? "border-dashed border-gray-300 dark:border-gray-600 bg-muted/30"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary/50"
                    }`}
                  >
                    <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{v.label}</p>
                    <p className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                      {shShort(v.price)}
                    </p>
                    {/* Out-of-stock sizes stay tappable. A shopkeeper holding
                        the thing in their hand must be able to sell it; the
                        negative-stock policy decides what happens, not this
                        button. */}
                    <p className={`text-[10px] tabular-nums ${none ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                      {none ? "none left" : `${shShort(v.stock)} left`}
                    </p>
                  </button>
                )
              })}
            </div>
            {pickVariantFor.variants.length === 0 && (
              <p className="px-3 pb-4 text-xs text-gray-500">
                This product is marked as having options but none are set up yet. Add them under
                Stock before selling it.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---- payment sheet ------------------------------------------------ */}
      {view === "pay" && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-black/40">
          <div className="w-full lg:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-3 py-2.5 flex items-center gap-2">
              <button
                onClick={() => { setView("sell"); setError("") }}
                aria-label="Back to the sale"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 active:scale-90"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Amount due</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums leading-none">KSh {sh(total)}</p>
              </div>
            </div>

            <div className="p-3 space-y-3">
              {error && <ErrorNote>{error}</ErrorNote>}

              {payments.map((p, idx) => {
                const Icon = METHOD_META[p.method].icon
                return (
                  <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        {payments.length > 1 ? `Payment ${idx + 1}` : "How are they paying?"}
                      </p>
                      {payments.length > 1 && (
                        <button
                          onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Remove this payment"
                          className="text-gray-300 hover:text-red-500 active:scale-90"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {(Object.keys(METHOD_META) as PaymentDraft["method"][]).map((m) => {
                        const MIcon = METHOD_META[m].icon
                        const on = p.method === m
                        return (
                          <button
                            key={m}
                            onClick={() => setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, method: m } : q)))}
                            aria-pressed={on}
                            className={`h-14 rounded-lg border flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all ${
                              on ? "border-primary bg-primary/5 text-primary" : "border-gray-200 dark:border-gray-700 text-gray-500"
                            }`}
                          >
                            <MIcon className="w-4 h-4" />
                            <span className="text-[9px] font-semibold">{METHOD_META[m].label}</span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <Input
                        value={p.amount}
                        onChange={(e) => setPayments((prev) => prev.map((q, i) =>
                          i === idx ? { ...q, amount: e.target.value.replace(/[^\d.]/g, "") } : q))}
                        inputMode="decimal"
                        placeholder="Amount"
                        className="h-11 rounded-xl tabular-nums text-base"
                      />
                    </div>

                    {p.method === "CASH" && (
                      <>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {/* Exact first, because "they gave me the exact
                              money" is the commonest case and deserves one
                              tap rather than typing. */}
                          <button
                            onClick={() => setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, amount: String(total) } : q)))}
                            className="h-9 px-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-700 dark:text-gray-200 active:scale-95"
                          >
                            Exact
                          </button>
                          {quickCash(total).map((d) => (
                            <button
                              key={d}
                              onClick={() => setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, amount: String(d) } : q)))}
                              className="h-9 px-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-700 dark:text-gray-200 tabular-nums active:scale-95"
                            >
                              {shShort(d)}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {(p.method === "MPESA" || p.method === "CARD" || p.method === "BANK") && (
                      <Input
                        value={p.reference}
                        onChange={(e) => setPayments((prev) => prev.map((q, i) => (i === idx ? { ...q, reference: e.target.value } : q)))}
                        placeholder={p.method === "MPESA" ? "M-Pesa code (e.g. QGR7XK2LMN)" : "Reference"}
                        className="mt-2 h-10 rounded-xl text-xs"
                      />
                    )}

                    {p.method === "MPESA" && (
                      /* Said plainly. Nothing here talks to Safaricom: the
                         cashier is reading a code off the customer's phone and
                         recording it. Implying the till confirmed the payment
                         would be a lie with money attached. */
                      <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        This records the code you were given. It does not check with M-Pesa that
                        the money arrived — confirm that on your own phone.
                      </p>
                    )}

                    {p.method === "CREDIT" && (
                      <p className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                        Recorded as taken on your own book. Saji does not chase it or guarantee it.
                      </p>
                    )}
                  </div>
                )
              })}

              {payments.length < 3 && (
                <button
                  onClick={() => setPayments((prev) => [...prev, { method: "MPESA", amount: "", reference: "" }])}
                  className="w-full h-10 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-[11px] font-semibold text-gray-500 active:scale-[0.99]"
                >
                  + Split across another payment
                </button>
              )}

              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
                className="h-10 rounded-xl text-xs"
              />

              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 space-y-1">
                <Row label="Total" value={sh(total)} />
                <Row label="Paid" value={sh(paid)} />
                {shortBy > 0 ? (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Short by</span>
                    <span className="text-base font-bold text-amber-700 dark:text-amber-400 tabular-nums">{sh(shortBy)}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Change</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{sh(change)}</span>
                  </div>
                )}
                {!hasCash && paid > total && (
                  <p className="text-[10px] text-gray-500 leading-snug pt-0.5">
                    No cash in this payment, so there is no change to give.
                  </p>
                )}
              </div>

              <Button
                onClick={takePayment}
                disabled={busy || shortBy > 0 || cart.length === 0}
                className="w-full h-14 rounded-xl text-base font-bold"
              >
                {busy
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : shortBy > 0 ? `Short by ${shShort(shortBy)}` : "Record the sale"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function newKey(): string {
  // randomUUID is unavailable on http:// origins in some browsers, and this
  // key is the only thing standing between a retry and a double charge, so it
  // falls back rather than throwing.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-xs text-gray-900 dark:text-white tabular-nums">{value}</span>
    </div>
  )
}

function ShiftStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-xs font-bold tabular-nums ${
        highlight
          ? value < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
          : "text-gray-900 dark:text-white"
      }`}>
        {shShort(value)}
      </p>
    </div>
  )
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{children}</p>
    </div>
  )
}
