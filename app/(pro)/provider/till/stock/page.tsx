"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, Search, Package, AlertTriangle, TrendingDown, Plus,
  ClipboardCheck, Trash2, X, History, Check, Boxes, Calculator,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getStockView, getProductMovements, receiveStock, recordWastage, recordStockCount,
  type StockView, type StockRow, type MovementRow,
} from "@/lib/actions/pos-stock"

/**
 * Stock on hand, and the history behind every figure.
 *
 * The drill-in is the point of this page. Any system can show a number; this
 * one can show that the number is 11 because it was 24, nine were sold, three
 * broke on Tuesday and a count on Friday found one short. A shopkeeper who
 * can see that stops arguing with the system and starts using it.
 *
 * Money and quantities are in shillings and the product's own unit, with no
 * currency conversion — same rule as the till. See components/pos/till-receipt.
 */

function sh(n: number): string {
  return n.toLocaleString("en-KE", { maximumFractionDigits: 2 })
}
function qty(n: number): string {
  // Trailing zeros dropped: 2 reads as "2", 1.35 as "1.35". A stock figure
  // padded to "2.000" looks like a precision nobody measured.
  return n.toLocaleString("en-KE", { maximumFractionDigits: 3 })
}

const KIND_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  PURCHASE: "Received",
  SALE: "Sold at the till",
  SALE_REVERSAL: "Till sale voided",
  ORDER_FULFILMENT: "Sold on Saji",
  ORDER_RESTOCK: "Saji order returned",
  RETURN: "Customer returned",
  COUNT_ADJUSTMENT: "Stock count",
  WASTAGE: "Lost or spoiled",
  TRANSFER_IN: "Transferred in",
  TRANSFER_OUT: "Transferred out",
  BULK_BREAK_IN: "Broken down into pieces",
  BULK_BREAK_OUT: "Bulk unit broken",
}

type Sheet =
  | { mode: "history"; row: StockRow }
  | { mode: "receive" | "waste" | "count"; row: StockRow }
  | null

export default function StockPage() {
  const [view, setView] = useState<StockView>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "low" | "out">("all")
  const [sheet, setSheet] = useState<Sheet>(null)
  const [movements, setMovements] = useState<MovementRow[] | null>(null)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const reload = () => getStockView().then(setView)

  useEffect(() => { reload().finally(() => setLoading(false)) }, [])

  const rows = useMemo(() => {
    if (!view) return []
    const q = query.trim().toLowerCase()
    return view.rows.filter((r) => {
      if (filter === "low" && !r.isLow) return false
      if (filter === "out" && r.onHand > 0) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || (r.barcode ?? "").includes(q)
    })
  }, [view, query, filter])

  const openSheet = async (mode: Exclude<Sheet, null>["mode"], row: StockRow) => {
    setSheet({ mode, row } as Sheet)
    setAmount(""); setReason(""); setError(""); setMovements(null)
    if (mode === "history") {
      const m = await getProductMovements({ productId: row.productId })
      setMovements(m)
    }
  }

  const flash = (msg: string) => { setSaved(msg); setTimeout(() => setSaved(""), 2500) }

  const submit = async () => {
    if (!sheet || sheet.mode === "history") return
    setBusy(true); setError("")
    const base = { productId: sheet.row.productId, reason: reason.trim() || undefined }
    const r =
      sheet.mode === "receive" ? await receiveStock({ ...base, quantity: amount })
      : sheet.mode === "waste" ? await recordWastage({ ...base, quantity: amount })
      : await recordStockCount({ productId: sheet.row.productId, counted: amount, reason: reason.trim() || undefined })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await reload()
    flash(`${sheet.row.name} is now ${qty(r.balance)} ${sheet.row.unit}`)
    setSheet(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!view) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <Calculator className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">There is no till on this account.</p>
          <Link href="/provider/business-types"><Button variant="outline" className="mt-4 h-10 rounded-xl">My Business</Button></Link>
        </Card>
      </div>
    )
  }

  const s = view.summary

  return (
    <div className="p-3 max-w-3xl mx-auto space-y-3 pb-24">
      <Link href="/provider/till" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{saved}</p>
        </div>
      )}

      {/* ---- the position, in four numbers ------------------------------- */}
      <div className="grid grid-cols-2 min-[460px]:grid-cols-4 gap-2">
        <Stat label="Products" value={String(s.products)} />
        <Stat
          label="Stock value"
          value={`KSh ${sh(s.totalValue)}`}
          // Said rather than quietly understated: a total that silently
          // omits half the catalogue is worse than no total.
          note={s.withoutCost > 0 ? `${s.withoutCost} without a cost price` : undefined}
        />
        <Stat label="Running low" value={String(s.lowStock)} tone={s.lowStock > 0 ? "amber" : undefined} />
        <Stat label="Out of stock" value={String(s.outOfStock)} tone={s.outOfStock > 0 ? "red" : undefined} />
      </div>

      {s.drifted > 0 && (
        <Card className="p-3 rounded-2xl border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                {s.drifted} {s.drifted === 1 ? "product's" : "products'"} history does not match the stored figure
              </p>
              <p className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
                The movements add up to something different from the number held against the
                product. A stock count will set both straight and record the difference.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ---- search and filters ------------------------------------------ */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, code or barcode"
          className="h-11 pl-9 rounded-xl"
          autoComplete="off"
        />
      </div>
      <div className="flex gap-1.5">
        {([["all", "All"], ["low", "Running low"], ["out", "Out of stock"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`h-9 px-3 rounded-lg text-[11px] font-semibold active:scale-95 transition-all ${
              filter === key
                ? "bg-primary text-primary-foreground"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---- the list ----------------------------------------------------- */}
      {rows.length === 0 ? (
        <Card className="p-6 text-center rounded-2xl">
          <Package className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {view.rows.length === 0 ? "Your catalogue is empty." : "Nothing matches that."}
          </p>
          {view.rows.length === 0 && (
            <Link href="/shopkeeper/products">
              <Button variant="outline" size="sm" className="mt-3 h-9 rounded-lg text-xs">Add products</Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.productId}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{r.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {r.sku}
                    {r.costPrice != null && <> &middot; cost {sh(r.costPrice)}</>}
                    {r.stockValue != null && <> &middot; worth {sh(r.stockValue)}</>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${
                    r.onHand <= 0 ? "text-red-600 dark:text-red-400"
                    : r.isLow ? "text-amber-600 dark:text-amber-400"
                    : "text-gray-900 dark:text-white"
                  }`}>
                    {qty(r.onHand)}
                    <span className="ml-0.5 text-[10px] font-normal text-gray-400">{r.unit === "piece" ? "" : r.unit}</span>
                  </p>
                  {/* Only where it means something: the figure actually
                      differs AND this shop is on the marketplace at all.
                      Telling a counter-only butchery that 12 of its 12.25 kg
                      are "sellable on Saji" describes a shopfront it does
                      not have. */}
                  {s.listedOnMarketplace && r.onHand !== r.sellableUnits && (
                    <p className="text-[10px] text-gray-400">{r.sellableUnits} sellable on Saji</p>
                  )}
                  {r.drifted && <p className="text-[10px] font-semibold text-amber-600">history disagrees</p>}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <SmallButton onClick={() => openSheet("history", r)} icon={History}>
                  History{r.movementCount > 0 ? ` (${r.movementCount})` : ""}
                </SmallButton>
                <SmallButton onClick={() => openSheet("receive", r)} icon={Plus}>Received</SmallButton>
                <SmallButton onClick={() => openSheet("count", r)} icon={ClipboardCheck}>Count</SmallButton>
                {s.canRecordWastage && (
                  <SmallButton onClick={() => openSheet("waste", r)} icon={Trash2}>Loss</SmallButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- sheet --------------------------------------------------------- */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-black/40">
          <div className="w-full lg:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{sheet.row.name}</p>
                <p className="text-[11px] text-gray-500 tabular-nums">
                  {qty(sheet.row.onHand)} {sheet.row.unit} on hand
                </p>
              </div>
              <button
                onClick={() => setSheet(null)}
                aria-label="Close"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-90 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 space-y-3">
              {error && (
                <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
                </div>
              )}

              {sheet.mode === "history" ? (
                movements === null ? (
                  <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                ) : movements.length === 0 ? (
                  <p className="py-8 text-center text-xs text-gray-500">
                    Nothing recorded yet. The first sale, delivery or count will appear here.
                  </p>
                ) : (
                  <ol className="space-y-1.5">
                    {movements.map((m) => (
                      <li key={m.id} className="flex items-start gap-2.5 rounded-xl border border-gray-100 dark:border-gray-700 p-2.5">
                        <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          m.quantity >= 0 ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-gray-900 dark:text-white">
                            {KIND_LABEL[m.kind] ?? m.kind}
                          </p>
                          {m.reason && <p className="text-[10px] text-gray-500 leading-snug">{m.reason}</p>}
                          <p className="text-[10px] text-gray-400">
                            {new Date(m.occurredAt).toLocaleString("en-KE", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                            {m.actorName && ` · ${m.actorName}`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xs font-bold tabular-nums ${
                            m.quantity >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-700 dark:text-gray-300"
                          }`}>
                            {m.quantity >= 0 ? "+" : ""}{qty(m.quantity)}
                          </p>
                          {/* Null on movements written by checkout, which
                              adjusts atomically and so cannot know the
                              balance without locking. Shown as a dash
                              rather than as zero. */}
                          <p className="text-[10px] text-gray-400 tabular-nums">
                            {m.balanceAfter === null ? "—" : qty(m.balanceAfter)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )
              ) : (
                <>
                  <div>
                    <label htmlFor="stock-amount" className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {sheet.mode === "receive" && `How much arrived, in ${sheet.row.unit}`}
                      {sheet.mode === "waste" && `How much was lost, in ${sheet.row.unit}`}
                      {sheet.mode === "count" && `How much is actually on the shelf, in ${sheet.row.unit}`}
                    </label>
                    <Input
                      id="stock-amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
                      inputMode="decimal"
                      placeholder="0"
                      className="h-12 rounded-xl tabular-nums text-base"
                      autoFocus
                    />
                    {sheet.mode === "count" && (
                      <p className="mt-1 text-[10px] text-gray-500 leading-snug">
                        Records the difference rather than overwriting the figure, so the size of
                        the gap stays on the record.
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="stock-reason" className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {sheet.mode === "waste" ? "What happened to it" : "Note"}
                      {sheet.mode !== "waste" && <span className="text-gray-400"> (optional)</span>}
                    </label>
                    <Input
                      id="stock-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={
                        sheet.mode === "receive" ? "Supplier, delivery note…"
                        : sheet.mode === "waste" ? "Spoiled, broken, expired, taken…"
                        : "Who counted it, anything unusual…"
                      }
                      className="h-11 rounded-xl text-sm"
                    />
                  </div>

                  <Button
                    onClick={submit}
                    disabled={busy || amount === ""}
                    className="w-full h-12 rounded-xl font-semibold"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" />
                      : sheet.mode === "receive" ? "Add to stock"
                      : sheet.mode === "waste" ? "Record the loss"
                      : "Save the count"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A plain div, not <Card>. Card ships `flex flex-col gap-6 py-6`, which on a
 * two-line tile leaves most of the box empty — four of them filled half a
 * 390px screen before any stock was visible.
 */
function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "amber" | "red" }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${
        tone === "red" ? "text-red-600 dark:text-red-400"
        : tone === "amber" ? "text-amber-600 dark:text-amber-400"
        : "text-gray-900 dark:text-white"
      }`}>
        {value}
      </p>
      {note && <p className="text-[9px] text-gray-400 leading-snug mt-0.5">{note}</p>}
    </div>
  )
}

function SmallButton({
  onClick, icon: Icon, children,
}: { onClick: () => void; icon: typeof Boxes; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-medium text-gray-600 dark:text-gray-300 inline-flex items-center gap-1 active:scale-95 transition-transform"
    >
      <Icon className="w-3 h-3" /> {children}
    </button>
  )
}
