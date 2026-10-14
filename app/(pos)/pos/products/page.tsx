"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Package, Plus, Search, X,
  Pencil, Pause, Play, Camera, Tag, CalendarClock, History, Coins, ShieldAlert,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { ScanButton } from "@/frontend/components/pos/barcode-scanner"
import {
  getCatalogue, saveProduct, setProductSelling, setProductCost, getCatalogueHistory,
  type CatalogueView, type CatalogueRow, type PriceChangeRow,
} from "@/backend/actions/pos-products"

/**
 * The catalogue: what this shop sells, and what it makes on each line.
 *
 * WHY THE COST IS AS PROMINENT AS THE PRICE
 *
 * A shopkeeper knows what they charge. What they usually cannot tell you is
 * which lines are actually worth the shelf space, because that needs the
 * cost beside the price and nobody does that arithmetic over four hundred
 * products. So the margin is shown per row, the lines with no cost recorded
 * are counted at the top, and filling one in is a single tap rather than a
 * trip through the whole form.
 *
 * WHY NOTHING HERE DELETES
 *
 * A product that has ever been sold is named on receipts, in the stock
 * ledger and in last month's figures. Deleting the row would tear holes in
 * all three, so the strongest thing on offer is to stop selling it, which
 * takes it off the till and leaves the history standing.
 *
 * WHERE STOCK IS NOT EDITED
 *
 * Here. A quantity on this page would be a number somebody typed, and the
 * whole point of the ledger is that stock figures have movements behind
 * them. Opening stock is the one exception, because a product being added
 * for the first time has a quantity on the shelf and no history to break,
 * and even that is written as an OPENING_BALANCE movement.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = (n: number) => n.toLocaleString("en-KE", { maximumFractionDigits: 3 })

const STATUS: Record<CatalogueRow["status"], { text: string; cls: string }> = {
  selling: { text: "Selling", cls: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" },
  low: { text: "Running low", cls: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  out: { text: "Out of stock", cls: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
  paused: { text: "Not selling", cls: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" },
}

type Tab = "all" | "low" | "paused" | "nocost"

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "low", label: "Running low" },
  { key: "nocost", label: "No cost yet" },
  { key: "paused", label: "Not selling" },
]

/** The form, as it is held while being typed. */
type Draft = {
  id?: string
  name: string
  sku: string
  barcode: string
  price: string
  costPrice: string
  unit: string
  categoryId: string
  description: string
  image: string
  ageRestricted: boolean
  lowStockThreshold: string
  openingStock: string
}

function emptyDraft(unit: string): Draft {
  return {
    name: "", sku: "", barcode: "", price: "", costPrice: "", unit,
    categoryId: "", description: "", image: "", ageRestricted: false,
    lowStockThreshold: "", openingStock: "",
  }
}

function draftOf(row: CatalogueRow): Draft {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode ?? "",
    price: String(row.price),
    costPrice: row.costPrice === null ? "" : String(row.costPrice),
    unit: row.unit,
    categoryId: row.categoryId ?? "",
    description: "",
    image: row.image ?? "",
    ageRestricted: row.ageRestricted,
    lowStockThreshold: String(row.lowStockThreshold),
    openingStock: "",
  }
}

export default function TillProductsPage() {
  const [view, setView] = useState<CatalogueView>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<Tab>("all")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const [draft, setDraft] = useState<Draft | null>(null)
  const [costFor, setCostFor] = useState<CatalogueRow | null>(null)
  const [costValue, setCostValue] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<PriceChangeRow[]>([])

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 3500) }

  const reload = async () => {
    const v = await getCatalogue({ query: query.trim() || undefined })
    setView(v)
  }

  useEffect(() => {
    getCatalogue({}).then((v) => { setView(v); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Search runs on the server, because a shop with four hundred products
  // should not ship all four hundred to filter three of them in the browser.
  useEffect(() => {
    const t = setTimeout(() => { void reload() }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const rows = useMemo(() => {
    const all = view?.rows ?? []
    if (tab === "low") return all.filter((r) => r.status === "low" || r.status === "out")
    if (tab === "paused") return all.filter((r) => r.status === "paused")
    if (tab === "nocost") return all.filter((r) => r.costPrice === null)
    return all
  }, [view, tab])

  const submit = async () => {
    if (!draft) return
    setBusy("save"); setError("")
    const r = await saveProduct({
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name.trim(),
      ...(draft.sku.trim() ? { sku: draft.sku.trim() } : {}),
      ...(draft.barcode.trim() ? { barcode: draft.barcode.trim() } : {}),
      price: Number(draft.price) || 0,
      ...(draft.costPrice.trim() ? { costPrice: Number(draft.costPrice) } : {}),
      unit: draft.unit.trim() || "piece",
      ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      ...(draft.image.trim() ? { image: draft.image.trim() } : {}),
      ageRestricted: draft.ageRestricted,
      ...(draft.lowStockThreshold.trim() ? { lowStockThreshold: Math.floor(Number(draft.lowStockThreshold)) } : {}),
      ...(!draft.id && draft.openingStock.trim() ? { openingStock: Number(draft.openingStock) } : {}),
    })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await reload()
    flash(draft.id ? draft.name + " saved" : draft.name + " added to the catalogue")
    setDraft(null)
  }

  const toggleSelling = async (row: CatalogueRow) => {
    setBusy(row.id); setError("")
    const r = await setProductSelling({ productId: row.id, selling: !row.isActive })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await reload()
    flash(row.isActive ? row.name + " is off the till" : row.name + " is back on the till")
  }

  const submitCost = async () => {
    if (!costFor) return
    setBusy("cost"); setError("")
    const r = await setProductCost({ productId: costFor.id, costPrice: Number(costValue) || 0 })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await reload()
    flash(costFor.name + " costs KSh " + sh(Number(costValue) || 0))
    setCostFor(null); setCostValue("")
  }

  const openHistory = async () => {
    setHistoryOpen(true)
    setHistory(await getCatalogueHistory({}).catch(() => []))
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!view) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <Package className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            There is no till on this account, or your role does not include the catalogue.
          </p>
          <Link href="/pos/sell"><Button variant="outline" className="mt-4 h-10 rounded-xl">Back to the till</Button></Link>
        </Card>
      </div>
    )
  }

  const s = view.summary

  return (
    <div className="p-3 max-w-3xl mx-auto space-y-3 pb-24">
      <div className="flex items-center justify-between gap-2">
        <Link href="/pos/sell" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
          <ArrowLeft className="w-4 h-4" /> Till
        </Link>
        <button
          onClick={() => void openHistory()}
          className="inline-flex items-center gap-1 h-9 px-2.5 rounded-xl text-[11px] font-semibold text-gray-500 dark:text-gray-400 active:scale-95"
        >
          <History className="w-3.5 h-3.5" /> What changed
        </button>
      </div>

      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{saved}</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {/* ---- what the catalogue is worth --------------------------------- */}
      <div className="grid grid-cols-2 min-[460px]:grid-cols-4 gap-2">
        <Stat label="Products" value={String(s.products)} />
        <Stat label="Selling" value={String(s.selling)} />
        <Stat
          label="Stock at cost"
          value={"KSh " + sh(s.stockValue)}
          note={s.missingCost > 0 ? s.missingCost + " with no cost" : undefined}
        />
        <Stat label="At shelf price" value={"KSh " + sh(s.retailValue)} />
      </div>

      {s.missingCost > 0 && (
        <button
          onClick={() => setTab("nocost")}
          className="w-full text-left rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/15 px-3 py-2.5 active:scale-[0.99]"
        >
          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            {s.missingCost} product{s.missingCost === 1 ? " has" : "s have"} no cost recorded
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug mt-0.5">
            Until they do, the stock value above and every margin figure in your reports is
            counting them as costing nothing. Tap to fill them in.
          </p>
        </button>
      )}

      {/* ---- search and add ---------------------------------------------- */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a name, code or barcode"
            className="pl-9 h-11 rounded-xl text-sm"
          />
        </div>
        <ScanButton onScanned={(code) => setQuery(code)} label="code of a product to find" />
        {view.canCreate && (
          <Button
            onClick={() => { setDraft(emptyDraft(view.defaultUnit)); setError("") }}
            className="h-11 px-3 rounded-xl flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="ml-1 text-xs hidden min-[420px]:inline">Add product</span>
          </Button>
        )}
      </div>

      {/* ---- the tabs ----------------------------------------------------- */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {TABS.map((t) => {
          const count =
            t.key === "low" ? s.low + s.out
            : t.key === "paused" ? s.paused
            : t.key === "nocost" ? s.missingCost
            : s.products
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={
                tab === t.key
                  ? "h-10 px-3 rounded-xl border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 active:scale-95 border-primary bg-primary/5 text-primary"
                  : "h-10 px-3 rounded-xl border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              }
            >
              {t.label}
              <span className="ml-1 tabular-nums opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {view.listedOnMarketplace && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug px-0.5">
          This shop also sells on SAJI, so a product you add here appears in your storefront
          as well. Stop selling it to take it off both.
        </p>
      )}

      {/* ---- the list ----------------------------------------------------- */}
      {rows.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl">
          <Package className="w-9 h-9 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {query
              ? "Nothing matches " + query + "."
              : tab === "all"
                ? "Nothing in the catalogue yet."
                : "Nothing here, which is the good answer."}
          </p>
          {view.canCreate && tab === "all" && !query && (
            <Button onClick={() => setDraft(emptyDraft(view.defaultUnit))} className="mt-4 h-11 rounded-xl text-xs">
              Add the first product
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.id} className="p-3 rounded-2xl">
              <div className="flex items-start gap-3">
                {/* The picture, where there is one. No empty grey box where
                    there is not: a shop with no photographs should not be
                    shown four hundred placeholders. */}
                {row.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-800"
                  />
                ) : (
                  <span className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-bold text-gray-900 dark:text-white leading-snug">
                      {row.name}
                      {row.ageRestricted && (
                        <ShieldAlert className="inline-block w-3.5 h-3.5 ml-1 text-amber-500 align-text-top" />
                      )}
                    </p>
                    <span className={"h-6 px-2 rounded-md text-[10px] font-semibold flex items-center flex-shrink-0 " + STATUS[row.status].cls}>
                      {STATUS[row.status].text}
                    </span>
                  </div>

                  <p className="mt-0.5 text-[11px] text-gray-400 tabular-nums truncate">
                    {row.sku}
                    {row.barcode ? " · " + row.barcode : ""}
                    {row.categoryName ? " · " + row.categoryName : ""}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                      KSh {sh(row.price)}
                      <span className="text-[11px] font-normal text-gray-400"> / {row.unit}</span>
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                      {qty(row.stock)} {row.unit} on hand
                    </span>
                  </div>

                  {/* The margin, or an invitation to make one possible. */}
                  <div className="mt-1.5">
                    {row.costPrice === null ? (
                      <button
                        onClick={() => { setCostFor(row); setCostValue("") }}
                        disabled={!view.canEdit}
                        className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-[11px] font-semibold text-gray-500 active:scale-95 disabled:opacity-50"
                      >
                        <Coins className="w-3 h-3" /> What does it cost you?
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums">
                        <span className="text-gray-400">Costs KSh {sh(row.costPrice)}</span>
                        <span className={
                          (row.margin ?? 0) <= 0
                            ? "font-semibold text-red-600 dark:text-red-400"
                            : "font-semibold text-emerald-700 dark:text-emerald-400"
                        }>
                          {(row.margin ?? 0) <= 0 ? "Losing " : "Makes "}
                          KSh {sh(Math.abs(row.margin ?? 0))}
                          {row.marginPercent !== null ? " (" + Math.abs(row.marginPercent) + "%)" : ""}
                        </span>
                      </span>
                    )}
                  </div>

                  {row.expiresOn && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                      <CalendarClock className="w-3 h-3" />
                      Soonest expiry {new Date(row.expiresOn).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}

                  <div className="mt-2 flex gap-1.5">
                    {view.canEdit && (
                      <button
                        onClick={() => { setDraft(draftOf(row)); setError("") }}
                        className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                    {view.canEdit && (
                      <button
                        onClick={() => void toggleSelling(row)}
                        disabled={busy === row.id}
                        className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 disabled:opacity-60"
                      >
                        {busy === row.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : row.isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {row.isActive ? "Stop selling" : "Sell again"}
                      </button>
                    )}
                    <Link
                      href="/pos/stock"
                      className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95"
                    >
                      <Tag className="w-3 h-3" /> Stock
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---- the form ----------------------------------------------------- */}
      {draft && (
        <Sheet title={draft.id ? "Edit " + draft.name : "Add a product"} onClose={() => setDraft(null)}>
          <div className="space-y-2.5">
            <Field label="What is it called?">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Blue Band 500g"
                className="h-11 rounded-xl text-sm"
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="You sell it for (KSh)">
                <Input
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^0-9.]/g, "") })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-11 rounded-xl text-sm tabular-nums"
                />
              </Field>
              <Field
                label="It costs you (KSh)"
                hint="Optional, but no margin can be worked out without it. Deliveries keep it up to date afterwards, as an average of what is on the shelf."
              >
                <Input
                  value={draft.costPrice}
                  onChange={(e) => setDraft({ ...draft, costPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-11 rounded-xl text-sm tabular-nums"
                />
              </Field>
            </div>

            {/* Said plainly, because a price below cost is nearly always a
                typing slip and the moment to catch it is now. */}
            {Number(draft.costPrice || 0) > 0 && Number(draft.price || 0) > 0 &&
              Number(draft.price) < Number(draft.costPrice) && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/15 px-3 py-2">
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  You would lose KSh {sh(Number(draft.costPrice) - Number(draft.price))} on every one sold.
                </p>
              </div>
            )}
            {Number(draft.costPrice || 0) > 0 && Number(draft.price || 0) > Number(draft.costPrice) && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                Makes KSh {sh(Number(draft.price) - Number(draft.costPrice))} a sale
                {" ("}{(((Number(draft.price) - Number(draft.costPrice)) / Number(draft.price)) * 100).toFixed(1)}%
                {" of the price)."}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Field label="Sold by the" hint="piece, kg, litre, metre">
                <Input
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  placeholder="piece"
                  className="h-11 rounded-xl text-sm"
                />
              </Field>
              <Field label="Your own code" hint="Left blank, one is made from the name.">
                <Input
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value.toUpperCase() })}
                  placeholder="Optional"
                  className="h-11 rounded-xl text-sm tabular-nums"
                />
              </Field>
            </div>

            <Field label="Barcode" hint="What the scanner reads. Scan it rather than typing it.">
              <div className="flex gap-2">
                <Input
                  value={draft.barcode}
                  onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                  inputMode="numeric"
                  placeholder="Optional"
                  className="h-11 rounded-xl text-sm tabular-nums"
                />
                <ScanButton onScanned={(code) => setDraft({ ...draft, barcode: code })} label="barcode on this product" />
              </div>
            </Field>

            {!draft.id && (
              <Field label="On the shelf right now" hint="Written into the stock history as an opening balance.">
                <Input
                  value={draft.openingStock}
                  onChange={(e) => setDraft({ ...draft, openingStock: e.target.value.replace(/[^0-9.]/g, "") })}
                  inputMode="decimal"
                  placeholder="0"
                  className="h-11 rounded-xl text-sm tabular-nums"
                />
              </Field>
            )}

            <Field label="Tell me when it drops to" hint="A nudge on the stock page, not a block on selling.">
              <Input
                value={draft.lowStockThreshold}
                onChange={(e) => setDraft({ ...draft, lowStockThreshold: e.target.value.replace(/[^0-9]/g, "") })}
                inputMode="numeric"
                placeholder="5"
                className="h-11 rounded-xl text-sm tabular-nums"
              />
            </Field>

            <Field label="Picture" hint="A web address, or leave it empty. The till shows the name either way.">
              <div className="flex gap-2">
                <Input
                  value={draft.image}
                  onChange={(e) => setDraft({ ...draft, image: e.target.value })}
                  placeholder="https://"
                  className="h-11 rounded-xl text-sm"
                />
                {draft.image.trim().length > 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.image} alt="" className="w-11 h-11 rounded-xl object-cover bg-gray-100 dark:bg-gray-800 flex-shrink-0" />
                )}
                {draft.image.trim().length === 0 && (
                  <span className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <Camera className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  </span>
                )}
              </div>
            </Field>

            {view.listedOnMarketplace && (
              <>
                <Field label="What to say about it on SAJI" hint="Only the storefront uses this. The till never shows it.">
                  <Input
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="Optional"
                    className="h-11 rounded-xl text-sm"
                  />
                </Field>
                {view.categories.length > 0 && (
                  <Field label="Shelf it sits on, on SAJI">
                    <select
                      value={draft.categoryId}
                      onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                      className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 text-sm text-gray-900 dark:text-white"
                    >
                      <option value="">Not on a shelf yet</option>
                      {view.categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}

            <button
              type="button"
              role="switch"
              aria-checked={draft.ageRestricted}
              onClick={() => setDraft({ ...draft, ageRestricted: !draft.ageRestricted })}
              className={
                draft.ageRestricted
                  ? "w-full flex items-center gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15"
                  : "w-full flex items-center gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] border-gray-200 dark:border-gray-700"
              }
            >
              <span className={
                draft.ageRestricted
                  ? "w-9 h-5 rounded-full bg-amber-500 flex items-center px-0.5 flex-shrink-0 justify-end"
                  : "w-9 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center px-0.5 flex-shrink-0"
              }>
                <span className="w-4 h-4 rounded-full bg-white block" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-gray-900 dark:text-white">
                  Only for buyers old enough
                </span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
                  The till asks the cashier to confirm, and records that they did.
                </span>
              </span>
            </button>

            {error && (
              <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
                <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
              </div>
            )}

            <Button
              onClick={() => void submit()}
              disabled={busy === "save" || draft.name.trim().length < 1 || !draft.price}
              className="w-full h-12 rounded-xl text-sm font-semibold"
            >
              {busy === "save"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : draft.id ? "Save the changes" : "Add it to the catalogue"}
            </Button>
          </div>
        </Sheet>
      )}

      {/* ---- the one number form ------------------------------------------ */}
      {costFor && (
        <Sheet title={"What does " + costFor.name + " cost you?"} onClose={() => setCostFor(null)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            What you pay for one {costFor.unit}, before you add anything on. You sell it for
            KSh {sh(costFor.price)}.
          </p>
          <p className="mt-1.5 text-[11px] text-gray-400 leading-snug">
            From here on this figure keeps itself up to date: when a delivery arrives at a new
            price, the cost becomes the average across what is on the shelf, so one expensive
            crate does not reprice the whole lot.
          </p>
          <Input
            value={costValue}
            onChange={(e) => setCostValue(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-3 h-12 rounded-xl text-base tabular-nums"
            autoFocus
          />
          {Number(costValue || 0) > 0 && (
            <p className={
              Number(costValue) >= costFor.price
                ? "mt-2 text-[11px] font-semibold text-red-600 dark:text-red-400"
                : "mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
            }>
              {Number(costValue) >= costFor.price
                ? "At that cost you make nothing on it."
                : "Makes KSh " + sh(costFor.price - Number(costValue)) + " a sale."}
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
          <Button
            onClick={() => void submitCost()}
            disabled={busy === "cost" || !costValue}
            className="mt-3 w-full h-12 rounded-xl text-sm font-semibold"
          >
            {busy === "cost" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record it"}
          </Button>
        </Sheet>
      )}

      {/* ---- what changed -------------------------------------------------- */}
      {historyOpen && (
        <Sheet title="What changed in the catalogue" onClose={() => setHistoryOpen(false)}>
          {history.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-900 dark:text-white leading-snug">{h.what}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400 tabular-nums">
                    {new Date(h.at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="p-3 rounded-2xl">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
      {note && <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug mt-0.5">{note}</p>}
    </Card>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">{label}</span>
      <span className="block mt-1">{children}</span>
      {hint && <span className="block mt-1 text-[11px] text-gray-400 leading-snug">{hint}</span>}
    </label>
  )
}

/**
 * A bottom sheet on a phone, a centred panel on a desktop.
 *
 * The close button is top right and full thumb size, because the alternative
 * on a phone is a customer waiting while the cashier hunts for a way out.
 */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-4 pb-8 sm:pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="min-w-0 text-sm font-bold text-gray-900 dark:text-white leading-snug">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-gray-400 active:scale-95 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
