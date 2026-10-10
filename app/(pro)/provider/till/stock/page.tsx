"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, Search, Package, AlertTriangle, Plus,
  ClipboardCheck, Trash2, X, History, Check, Boxes, Calculator, Shapes, RotateCcw, CalendarClock,
  ShieldAlert,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getStockView, getProductMovements, receiveStock, recordWastage, recordStockCount,
  saveProductVariant, setVariantActive, receiveBatch, writeOffBatch, setProductAgeRestricted,
  setProductBulkUnit,
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
  | { mode: "options"; row: StockRow }
  | { mode: "batches"; row: StockRow }
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
  /**
   * Which size an adjustment applies to. A product with options has no
   * figure of its own to adjust — its number is the sum of its sizes — so
   * the sheet asks before it will accept anything.
   */
  const [targetVariant, setTargetVariant] = useState<string | null>(null)
  const [newOption, setNewOption] = useState({ label: "", sku: "", barcode: "", price: "" })
  /** Whether the quantity in the receive sheet is in bulk units. */
  const [receiveInBulk, setReceiveInBulk] = useState(false)
  const [bulkDraft, setBulkDraft] = useState({ unit: "", per: "" })
  const [newBatch, setNewBatch] = useState({ batchNumber: "", expiryDate: "", quantity: "", unitCost: "", variantId: "" })
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
    setNewOption({ label: "", sku: "", barcode: "", price: "" })
    setNewBatch({ batchNumber: "", expiryDate: "", quantity: "", unitCost: "", variantId: row.variants.length === 1 ? row.variants[0].id : "" })
    setReceiveInBulk(false)
    setBulkDraft({ unit: row.bulkUnit ?? "", per: row.unitsPerBulk == null ? "" : String(row.unitsPerBulk) })
    // Preselect where there is no choice to make.
    setTargetVariant(row.variants.length === 1 ? row.variants[0].id : null)
    if (mode === "history") {
      const m = await getProductMovements({ productId: row.productId })
      setMovements(m)
    }
  }

  /** Reload and keep the open options sheet pointed at the fresh row. */
  const refreshSheet = async (productId: string) => {
    const fresh = await getStockView()
    setView(fresh)
    const updated = fresh?.rows.find((x) => x.productId === productId)
    if (updated) setSheet({ mode: "options", row: updated })
  }

  const toggleOption = async (row: StockRow, variantId: string, isActive: boolean) => {
    setBusy(true); setError("")
    const r = await setVariantActive({ variantId, isActive })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refreshSheet(row.productId)
  }

  const addOption = async (row: StockRow) => {
    if (!newOption.label.trim()) { setError("Give the option a name."); return }
    setBusy(true); setError("")
    const r = await saveProductVariant({
      productId: row.productId,
      label: newOption.label.trim(),
      barcode: newOption.barcode.trim() || undefined,
      price: newOption.price ? Number(newOption.price) : null,
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setNewOption({ label: "", sku: "", barcode: "", price: "" })
    await refreshSheet(row.productId)
    flash("Option added")
  }

  const refreshBatches = async (productId: string) => {
    const fresh = await getStockView()
    setView(fresh)
    const updated = fresh?.rows.find((x) => x.productId === productId)
    if (updated) setSheet({ mode: "batches", row: updated })
  }

  const addBatch = async (row: StockRow) => {
    if (!newBatch.quantity || Number(newBatch.quantity) <= 0) { setError("Enter how much arrived."); return }
    if (row.variants.length > 0 && !newBatch.variantId) { setError("Choose which option this delivery is for."); return }
    setBusy(true); setError("")
    const r = await receiveBatch({
      productId: row.productId,
      variantId: newBatch.variantId || undefined,
      batchNumber: newBatch.batchNumber.trim() || undefined,
      expiryDate: newBatch.expiryDate || undefined,
      quantity: newBatch.quantity,
      unitCost: newBatch.unitCost ? Number(newBatch.unitCost) : undefined,
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setNewBatch({ batchNumber: "", expiryDate: "", quantity: "", unitCost: "", variantId: newBatch.variantId })
    await refreshBatches(row.productId)
    flash("Delivery recorded")
  }

  const discardBatch = async (row: StockRow, batchId: string) => {
    const why = window.prompt("Why is this delivery being written off? (expired, recalled, damaged)")
    if (!why || why.trim().length < 3) return
    setBusy(true); setError("")
    const r = await writeOffBatch({ batchId, reason: why.trim() })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refreshBatches(row.productId)
    flash("Written off")
  }

  const saveBulk = async (row: StockRow) => {
    if (!bulkDraft.unit.trim() || !bulkDraft.per) { setError("Name the bulk unit and say how many are in one."); return }
    setBusy(true); setError("")
    const r = await setProductBulkUnit({ productId: row.productId, bulkUnit: bulkDraft.unit.trim(), unitsPerBulk: Number(bulkDraft.per) })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refreshSheet(row.productId)
    flash("Bulk unit saved")
  }

  const clearBulk = async (row: StockRow) => {
    setBusy(true); setError("")
    const r = await setProductBulkUnit({ productId: row.productId, bulkUnit: null, unitsPerBulk: null })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setBulkDraft({ unit: "", per: "" })
    await refreshSheet(row.productId)
    flash("Bulk unit cleared")
  }

  const flash = (msg: string) => { setSaved(msg); setTimeout(() => setSaved(""), 2500) }

  const submit = async () => {
    if (!sheet || sheet.mode === "history") return
    if (sheet.row.variants.length > 0 && !targetVariant) {
      setError("Choose which option this applies to.")
      return
    }
    setBusy(true); setError("")
    const variantId = targetVariant ?? undefined
    const base = { productId: sheet.row.productId, variantId, reason: reason.trim() || undefined }
    const r =
      sheet.mode === "receive" ? await receiveStock({ ...base, quantity: amount, ...(receiveInBulk ? { inBulk: true } : {}) })
      : sheet.mode === "waste" ? await recordWastage({ ...base, quantity: amount })
      : await recordStockCount({ productId: sheet.row.productId, variantId, counted: amount, reason: reason.trim() || undefined })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await reload()
    const label = sheet.row.variants.find((v) => v.id === targetVariant)?.label
    flash(`${sheet.row.name}${label ? " " + label : ""} is now ${qty(r.balance)} ${sheet.row.unit}`)
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

      {(s.expiredBatches > 0 || s.expiringSoonBatches > 0) && (
        <Card className={
          s.expiredBatches > 0
            ? "p-3 rounded-2xl border-red-300 dark:border-red-900 bg-red-50/60 dark:bg-red-900/10"
            : "p-3 rounded-2xl border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10"
        }>
          <div className="flex items-start gap-2">
            <CalendarClock className={s.expiredBatches > 0 ? "w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" : "w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0"} />
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                {s.expiredBatches > 0 && (s.expiredBatches + (s.expiredBatches === 1 ? " delivery has expired" : " deliveries have expired"))}
                {s.expiredBatches > 0 && s.expiringSoonBatches > 0 && ", and "}
                {s.expiringSoonBatches > 0 && (s.expiringSoonBatches + (s.expiringSoonBatches === 1 ? " is expiring soon" : " are expiring soon"))}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
                The till sells the soonest-to-expire delivery first. Open Deliveries on a product
                to write a batch off, which records the loss rather than letting it vanish.
              </p>
            </div>
          </div>
        </Card>
      )}

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

              {r.variants.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.variants.map((v) => (
                    <span
                      key={v.id}
                      className={`inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10px] tabular-nums ${
                        !v.isActive
                          ? "bg-muted/50 text-gray-400 line-through"
                          : v.onHand <= 0
                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      <span className="font-semibold">{v.label}</span> {qty(v.onHand)}
                    </span>
                  ))}
                </div>
              )}

              {r.batches.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.batches.slice(0, 4).map((b) => (
                    <span
                      key={b.id}
                      className={
                        b.expired
                          ? "inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10px] tabular-nums bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                          : b.expiringSoon
                            ? "inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10px] tabular-nums bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                            : "inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10px] tabular-nums bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      }
                    >
                      <CalendarClock className="w-2.5 h-2.5" />
                      {b.batchNumber || "batch"} {qty(b.onHand)}
                      {b.expiryDate && " · " + new Date(b.expiryDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "2-digit" })}
                    </span>
                  ))}
                  {r.batches.length > 4 && (
                    <span className="text-[10px] text-gray-400 self-center">+{r.batches.length - 4} more</span>
                  )}
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                <SmallButton onClick={() => openSheet("batches", r)} icon={CalendarClock}>
                  {r.batches.length > 0 ? "Deliveries (" + r.batches.length + ")" : "Add a delivery"}
                </SmallButton>
                <SmallButton onClick={() => openSheet("options", r)} icon={Shapes}>
                  {r.variants.length > 0 ? `Options (${r.variants.length})` : "Add options"}
                </SmallButton>
                {s.checksAge && (
                  <button
                    onClick={async () => {
                      setBusy(true); setError("")
                      const res = await setProductAgeRestricted({ productId: r.productId, ageRestricted: !r.ageRestricted })
                      setBusy(false)
                      if (!res.success) { setError(res.error); return }
                      await reload()
                      flash(r.ageRestricted ? r.name + " no longer needs an age check" : r.name + " now needs an age check")
                    }}
                    disabled={busy}
                    className={
                      r.ageRestricted
                        ? "h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 active:scale-95 transition-transform border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                        : "h-8 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 active:scale-95 transition-transform border-gray-200 dark:border-gray-700 text-gray-500"
                    }
                  >
                    <ShieldAlert className="w-3 h-3" /> {r.ageRestricted ? "Age checked" : "No age check"}
                  </button>
                )}
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

              {sheet.mode === "batches" ? (
                <>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
                    Each delivery keeps its own stock and expiry date. The till always sells the
                    soonest-to-expire one first, so nobody at the counter has to choose.
                  </p>

                  {sheet.row.batches.length > 0 && (
                    <div className="space-y-1.5">
                      {sheet.row.batches.map((b) => {
                        const label = sheet.row.variants.find((v) => v.id === b.variantId)?.label
                        return (
                          <div
                            key={b.id}
                            className={
                              b.expired
                                ? "flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10 p-2.5"
                                : "flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 p-2.5"
                            }
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                                {b.batchNumber || "Unnumbered delivery"}
                                {label && <span className="font-normal text-gray-500"> · {label}</span>}
                              </p>
                              <p className="text-[10px] text-gray-400 tabular-nums">
                                {qty(b.onHand)} {sheet.row.unit === "piece" ? "left" : sheet.row.unit}
                                {b.expiryDate && " · expires " + new Date(b.expiryDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                                {!b.expiryDate && " · no expiry date"}
                              </p>
                              {b.expired && (
                                <p className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                                  Expired. The till refuses it unless POS Settings says otherwise.
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => void discardBatch(sheet.row, b.id)}
                              disabled={busy}
                              className="h-8 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 active:scale-95 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> Write off
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Record a delivery</p>
                    {sheet.row.variants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {sheet.row.variants.filter((v) => v.isActive).map((v) => (
                          <button
                            key={v.id}
                            onClick={() => setNewBatch((b) => ({ ...b, variantId: v.id }))}
                            aria-pressed={newBatch.variantId === v.id}
                            className={
                              newBatch.variantId === v.id
                                ? "h-9 px-3 rounded-lg border text-[11px] font-semibold active:scale-95 border-primary bg-primary/5 text-primary"
                                : "h-9 px-3 rounded-lg border text-[11px] font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                            }
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={newBatch.quantity}
                        onChange={(e) => setNewBatch((b) => ({ ...b, quantity: e.target.value.replace(/[^0-9.]/g, "") }))}
                        inputMode="decimal"
                        placeholder="How much arrived"
                        className="h-10 rounded-xl text-xs tabular-nums"
                      />
                      <Input
                        type="date"
                        value={newBatch.expiryDate}
                        onChange={(e) => setNewBatch((b) => ({ ...b, expiryDate: e.target.value }))}
                        className="h-10 rounded-xl text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={newBatch.batchNumber}
                        onChange={(e) => setNewBatch((b) => ({ ...b, batchNumber: e.target.value }))}
                        placeholder="Batch / lot number"
                        className="h-10 rounded-xl text-xs"
                      />
                      <Input
                        value={newBatch.unitCost}
                        onChange={(e) => setNewBatch((b) => ({ ...b, unitCost: e.target.value.replace(/[^0-9.]/g, "") }))}
                        inputMode="decimal"
                        placeholder="Cost each"
                        className="h-10 rounded-xl text-xs tabular-nums"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 leading-snug">
                      The expiry date is optional — leave it blank for something tracked by
                      delivery that does not go off. Cost can differ between deliveries, which is
                      most of the reason to track them.
                    </p>
                    <Button
                      onClick={() => void addBatch(sheet.row)}
                      disabled={busy || !newBatch.quantity}
                      className="w-full h-10 rounded-xl text-xs"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Record it"}
                    </Button>
                  </div>
                </>
              ) : sheet.mode === "options" ? (
                <>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
                    Sizes, colours or packs. Each one keeps its own stock and can carry its own
                    barcode, so scanning a size rings up that size rather than asking.
                  </p>

                  {sheet.row.variants.length > 0 && (
                    <div className="space-y-1.5">
                      {sheet.row.variants.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                          <div className="min-w-0 flex-1">
                            <p className={v.isActive ? "text-xs font-semibold text-gray-900 dark:text-white" : "text-xs font-semibold text-gray-400 line-through"}>
                              {v.label}
                            </p>
                            <p className="text-[10px] text-gray-400 tabular-nums">
                              {qty(v.onHand)} {sheet.row.unit === "piece" ? "in stock" : sheet.row.unit}
                            </p>
                          </div>
                          {/* Retired, never deleted: the size is on sale lines
                              and stock movements that have to stay readable,
                              and last year's figures must still make sense. */}
                          <button
                            onClick={() => void toggleOption(sheet.row, v.id, !v.isActive)}
                            disabled={busy}
                            className="h-8 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 active:scale-95 inline-flex items-center gap-1"
                          >
                            {v.isActive
                              ? <><Trash2 className="w-3 h-3" /> Retire</>
                              : <><RotateCcw className="w-3 h-3" /> Bring back</>}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.breaksBulk && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Bought in bulk?</p>
                      <p className="text-[10px] text-gray-500 leading-snug">
                        Stock is always counted in what you sell. This only lets you type
                        deliveries in the unit they arrive in, and records the sum.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={bulkDraft.unit}
                          onChange={(e) => setBulkDraft((b) => ({ ...b, unit: e.target.value }))}
                          placeholder="Bale, carton, bag"
                          className="h-10 rounded-xl text-xs"
                        />
                        <Input
                          value={bulkDraft.per}
                          onChange={(e) => setBulkDraft((b) => ({ ...b, per: e.target.value.replace(/[^0-9.]/g, "") }))}
                          inputMode="decimal"
                          placeholder={"How many " + (sheet.row.unit === "piece" ? "pieces" : sheet.row.unit)}
                          className="h-10 rounded-xl text-xs tabular-nums"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          onClick={() => void saveBulk(sheet.row)}
                          disabled={busy}
                          className="h-9 rounded-lg text-[11px] flex-1"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                        </Button>
                        {sheet.row.bulkUnit && (
                          <Button
                            variant="outline"
                            onClick={() => void clearBulk(sheet.row)}
                            disabled={busy}
                            className="h-9 rounded-lg text-[11px]"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Add an option</p>
                    <Input
                      value={newOption.label}
                      onChange={(e) => setNewOption((o) => ({ ...o, label: e.target.value }))}
                      placeholder="Name it - M, Red / 42, 500ml"
                      className="h-10 rounded-xl text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={newOption.barcode}
                        onChange={(e) => setNewOption((o) => ({ ...o, barcode: e.target.value }))}
                        placeholder="Barcode (optional)"
                        className="h-10 rounded-xl text-xs"
                      />
                      <Input
                        value={newOption.price}
                        onChange={(e) => setNewOption((o) => ({ ...o, price: e.target.value.replace(/[^0-9.]/g, "") }))}
                        inputMode="decimal"
                        placeholder={"Price (" + sh(sheet.row.price) + ")"}
                        className="h-10 rounded-xl text-xs tabular-nums"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 leading-snug">
                      Leave the price blank to charge the product&apos;s own. A new option starts
                      at zero stock - put stock in with Received, so there is a record of where it
                      came from.
                    </p>
                    <Button
                      onClick={() => void addOption(sheet.row)}
                      disabled={busy || !newOption.label.trim()}
                      className="w-full h-10 rounded-xl text-xs"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add it"}
                    </Button>
                  </div>
                </>
              ) : sheet.mode === "history" ? (
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
                  {/* Which size, where the product has them. A product with
                      options has no figure of its own to adjust - its number
                      is the sum of its sizes. */}
                  {sheet.row.variants.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1">Which option?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sheet.row.variants.filter((v) => v.isActive).map((v) => (
                          <button
                            key={v.id}
                            onClick={() => { setTargetVariant(v.id); setError("") }}
                            aria-pressed={targetVariant === v.id}
                            className={
                              targetVariant === v.id
                                ? "h-9 px-3 rounded-lg border text-[11px] font-semibold tabular-nums active:scale-95 border-primary bg-primary/5 text-primary"
                                : "h-9 px-3 rounded-lg border text-[11px] font-semibold tabular-nums active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                            }
                          >
                            {v.label} <span className="font-normal text-gray-400">{qty(v.onHand)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {sheet.mode === "receive" && s.breaksBulk && sheet.row.bulkUnit && sheet.row.unitsPerBulk && (
                    <div className="flex gap-1.5">
                      {[false, true].map((bulk) => (
                        <button
                          key={String(bulk)}
                          onClick={() => setReceiveInBulk(bulk)}
                          aria-pressed={receiveInBulk === bulk}
                          className={
                            receiveInBulk === bulk
                              ? "flex-1 h-10 rounded-xl border text-[11px] font-semibold active:scale-95 border-primary bg-primary/5 text-primary"
                              : "flex-1 h-10 rounded-xl border text-[11px] font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                          }
                        >
                          {bulk
                            ? "In " + sheet.row.bulkUnit + "s (x" + sheet.row.unitsPerBulk + ")"
                            : "In " + (sheet.row.unit === "piece" ? "pieces" : sheet.row.unit)}
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <label htmlFor="stock-amount" className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {sheet.mode === "receive" && (
                        receiveInBulk && sheet.row.bulkUnit
                          ? "How many " + sheet.row.bulkUnit + "s arrived"
                          : "How much arrived, in " + sheet.row.unit
                      )}
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
                    {sheet.mode === "receive" && receiveInBulk && amount && sheet.row.unitsPerBulk && (
                      <p className="mt-1 text-[10px] text-gray-500 leading-snug tabular-nums">
                        That is {qty(Number(amount) * sheet.row.unitsPerBulk)} {sheet.row.unit} going into stock.
                        The arithmetic is kept on the record.
                      </p>
                    )}
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
