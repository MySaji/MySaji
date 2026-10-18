"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import {
  ArrowLeft, Loader2, Plus, Tag, Users, AlertTriangle, Power,
} from "lucide-react"
import {
  getPromotions, createPromotion, setPromotionActive,
  getPriceLists, createPriceList,
  type PromotionRow, type PriceListRow,
} from "@/backend/actions/pos-pricing"

/**
 * Offers, and prices for customers who do not pay the shelf price.
 *
 * An offer that is switched on but not currently running is shown as such
 * rather than simply listed. A shopkeeper who thinks an offer is live when it
 * expired on Sunday will blame the till for the prices it charges.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : null

const KINDS = [
  { key: "PERCENT_OFF", label: "Percent off" },
  { key: "AMOUNT_OFF", label: "Amount off" },
  { key: "BUY_X_GET_Y", label: "Buy X get Y" },
  { key: "BUNDLE_PRICE", label: "N for a price" },
] as const

export default function PricingPage() {
  const [promos, setPromos] = useState<PromotionRow[]>([])
  const [lists, setLists] = useState<PriceListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [listName, setListName] = useState("")

  const [form, setForm] = useState({
    name: "", kind: "PERCENT_OFF" as (typeof KINDS)[number]["key"],
    percentOff: "", amountOff: "",
    buyQuantity: "", getQuantity: "", bundleQuantity: "", bundlePrice: "",
    endsAt: "",
  })

  const refresh = async () => {
    setPromos(await getPromotions())
    setLists(await getPriceLists())
  }

  useEffect(() => {
    Promise.all([getPromotions(), getPriceLists()])
      .then(([p, l]) => { setPromos(p); setLists(l) })
      .finally(() => setLoading(false))
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
        <WorkspaceHeading title="Prices and offers" />
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Offers apply themselves at the till: nobody types a code and the cashier
          does not have to remember. A price list is what one customer pays,
          which is not the same thing as a discount.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => { setAdding(true); setError("") }}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> New offer
        </button>
      ) : (
        <Card className="p-4 rounded-2xl space-y-2">
          <h2 className="text-sm font-bold text-foreground">New offer</h2>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="What the cashier will see, e.g. Soda Friday"
            className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => setForm({ ...form, kind: k.key })}
                className={"h-10 rounded-lg text-xs font-semibold active:scale-95 " +
                  (form.kind === k.key ? "bg-primary text-primary-foreground" : "border border-border text-foreground")}
              >
                {k.label}
              </button>
            ))}
          </div>

          {form.kind === "PERCENT_OFF" && (
            <Num label="Percent off" value={form.percentOff} onChange={(v) => setForm({ ...form, percentOff: v })} />
          )}
          {form.kind === "AMOUNT_OFF" && (
            <Num label="Amount off each" value={form.amountOff} onChange={(v) => setForm({ ...form, amountOff: v })} />
          )}
          {form.kind === "BUY_X_GET_Y" && (
            <div className="grid grid-cols-2 gap-2">
              <Num label="They buy" value={form.buyQuantity} onChange={(v) => setForm({ ...form, buyQuantity: v })} />
              <Num label="They get free" value={form.getQuantity} onChange={(v) => setForm({ ...form, getQuantity: v })} />
            </div>
          )}
          {form.kind === "BUNDLE_PRICE" && (
            <div className="grid grid-cols-2 gap-2">
              <Num label="How many" value={form.bundleQuantity} onChange={(v) => setForm({ ...form, bundleQuantity: v })} />
              <Num label="For how much" value={form.bundlePrice} onChange={(v) => setForm({ ...form, bundlePrice: v })} />
            </div>
          )}

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Runs until (optional)</span>
            <input
              type="date"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              className="mt-0.5 w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={async () => {
                const ok = await run(() => createPromotion({
                  name: form.name,
                  kind: form.kind,
                  percentOff: form.percentOff || null,
                  amountOff: form.amountOff || null,
                  buyQuantity: form.buyQuantity || null,
                  getQuantity: form.getQuantity || null,
                  getPercentOff: form.getQuantity ? 100 : null,
                  bundleQuantity: form.bundleQuantity || null,
                  bundlePrice: form.bundlePrice || null,
                  endsAt: form.endsAt || null,
                }))
                if (ok) {
                  setAdding(false)
                  setForm({ name: "", kind: "PERCENT_OFF", percentOff: "", amountOff: "", buyQuantity: "", getQuantity: "", bundleQuantity: "", bundlePrice: "", endsAt: "" })
                }
              }}
              disabled={busy}
              className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create it"}
            </button>
            <button
              onClick={() => { setAdding(false); setError("") }}
              className="h-11 px-4 rounded-lg border border-border text-sm font-semibold active:scale-95"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {promos.length === 0 && !adding && (
        <Card className="p-6 rounded-2xl text-center">
          <Tag className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">No offers</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            An offer here applies itself at the till, on every sale that qualifies.
          </p>
        </Card>
      )}

      {promos.map((p) => (
        <Card key={p.id} className="p-4 rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {p.summary}
                {p.productName ? " · " + p.productName : " · whole shop"}
                {p.endsAt ? " · until " + day(p.endsAt) : ""}
              </p>
              {/* Switched on and not running is the state that catches people
                  out, so it is said plainly rather than left to be worked out
                  from the dates. */}
              {p.isActive && !p.live && (
                <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Switched on, but not running today
                </p>
              )}
            </div>
            <button
              onClick={() => void run(() => setPromotionActive({ id: p.id, isActive: !p.isActive }))}
              disabled={busy}
              aria-label={p.isActive ? "Switch off" : "Switch on"}
              className={"h-9 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 flex-shrink-0 active:scale-95 disabled:opacity-50 " +
                (p.live ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground")}
            >
              <Power className="w-3.5 h-3.5" /> {p.live ? "Running" : p.isActive ? "On" : "Off"}
            </button>
          </div>
        </Card>
      ))}

      <div className="pt-2">
        <h2 className="text-sm font-bold text-foreground">Price lists</h2>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          A list of what one kind of customer pays. Set the prices from a
          customer&rsquo;s page once the list exists.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={listName}
          onChange={(e) => setListName(e.target.value)}
          placeholder="Wholesale"
          className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm"
        />
        <button
          onClick={async () => {
            const ok = await run(() => createPriceList({ name: listName }))
            if (ok) setListName("")
          }}
          disabled={busy || !listName}
          className="h-11 px-4 rounded-lg border border-border text-sm font-semibold active:scale-95 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {lists.map((l) => (
        <Card key={l.id} className="p-4 rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{l.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {l.itemCount} {l.itemCount === 1 ? "price" : "prices"} &middot;{" "}
                {l.customerCount} {l.customerCount === 1 ? "customer" : "customers"}
              </p>
            </div>
            <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>
          {l.items.length > 0 && (
            <ul className="mt-2 divide-y divide-border">
              {l.items.slice(0, 8).map((i) => (
                <li key={i.id} className="py-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs text-foreground truncate">{i.productName}</span>
                  {i.minQuantity > 1 && (
                    <span className="text-[10px] text-muted-foreground">from {i.minQuantity}</span>
                  )}
                  <span className="text-xs font-semibold tabular-nums text-foreground">{sh(i.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  )
}

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className="mt-0.5 w-full h-11 px-3 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
      />
    </label>
  )
}
