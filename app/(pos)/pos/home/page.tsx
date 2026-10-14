"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, ArrowRight, BadgeCheck, BarChart3, Boxes, ClipboardCheck, ClipboardList, Clock, FileText, Gift, Hammer, HandCoins, Loader2, Monitor, Package, Plus, Receipt, Settings, ShoppingCart, Smartphone, Star, Store, Tag, TrendingDown, TrendingUp, Truck, UserCog, Users, UtensilsCrossed, Wallet, Wrench,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { getPosDashboard, type PosDashboard } from "@/backend/actions/pos-dashboard"

/**
 * Where a shopkeeper lands.
 *
 * Four questions, answered in the order they get asked: did we take more
 * than yesterday, what is about to run out, what is selling, and did
 * anything go wrong. Everything on this page answers one of them.
 *
 * WHAT IT SHOWS DEPENDS ON WHO IS LOOKING
 *
 * The server omits takings entirely for a role that may not see them, so
 * this page has nothing to hide and no chance of leaking a figure through a
 * forgotten branch. A cashier opening it gets a real, useful screen: what is
 * low, what sold, and a way to the till.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shShort = (n: number) =>
  n >= 1000 ? Math.round(n).toLocaleString("en-KE") : n.toLocaleString("en-KE", { maximumFractionDigits: 0 })

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash", MPESA: "M-Pesa", CARD: "Card", BANK: "Bank", CREDIT: "Credit", SPLIT: "Split",
}

/**
 * What the shop does, in four groups.
 *
 * Ordered by how often a counter reaches for them, not alphabetically and not
 * by how much work each one took to build. Setting up comes last because it
 * is the only group a shopkeeper stops needing once they are running.
 */
const GROUPS: { title: string; blurb: string; items: { href: string; icon: typeof ShoppingCart; label: string }[] }[] = [
  {
    title: "Selling",
    blurb: "The counter, and the ways money comes in.",
    items: [
      { href: "/pos/sell", icon: ShoppingCart, label: "New sale" },
      { href: "/pos/floor", icon: UtensilsCrossed, label: "Floor" },
      { href: "/pos/jobs", icon: Wrench, label: "Jobs" },
      { href: "/pos/quotes", icon: FileText, label: "Quotes" },
      { href: "/pos/cards", icon: Gift, label: "Gift cards" },
      { href: "/pos/credit", icon: HandCoins, label: "On the book" },
    ],
  },
  {
    title: "Stock",
    blurb: "What is on the shelf, and what is coming in.",
    items: [
      { href: "/pos/products", icon: Package, label: "Products" },
      { href: "/pos/stock", icon: Boxes, label: "Stock" },
      { href: "/pos/stocktake", icon: ClipboardCheck, label: "Count" },
      { href: "/pos/purchasing", icon: ClipboardList, label: "Buying" },
      { href: "/pos/transfers", icon: Truck, label: "Transfers" },
      { href: "/pos/pricing", icon: Tag, label: "Prices" },
    ],
  },
  {
    title: "Money",
    blurb: "The drawer, the costs, and what the month actually did.",
    items: [
      { href: "/pos/shifts", icon: Clock, label: "Shifts" },
      { href: "/pos/expenses", icon: Wallet, label: "Costs" },
      { href: "/pos/reports", icon: BarChart3, label: "Reports" },
      { href: "/pos/orders", icon: Hammer, label: "Deposits" },
      { href: "/pos/mpesa", icon: Smartphone, label: "M-Pesa" },
      { href: "/pos/etims", icon: Receipt, label: "Tax" },
    ],
  },
  {
    title: "Setting up",
    blurb: "Your people, your branches and how the till behaves.",
    items: [
      { href: "/pos/team", icon: UserCog, label: "Team" },
      { href: "/pos/people", icon: Users, label: "Till PINs" },
      { href: "/pos/stores", icon: Store, label: "Branches" },
      { href: "/pos/devices", icon: Monitor, label: "Devices" },
      { href: "/pos/settings", icon: Settings, label: "Settings" },
      { href: "/pos/subscription", icon: BadgeCheck, label: "Plan" },
    ],
  },
]

export default function TillDashboardPage() {
  const [data, setData] = useState<PosDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPosDashboard({}).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!data) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <ShoppingCart className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <h1 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">No till on this account</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            A till is for serving customers at your own counter.
          </p>
          <Link href="/provider/business-types">
            <span className="mt-4 inline-flex h-11 px-5 items-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              Go to My Business
            </span>
          </Link>
        </Card>
      </div>
    )
  }

  // The real peak, and separately the divisor. Keeping them apart matters:
  // the divisor must never be zero, but the LABEL must never claim a figure
  // the shop did not take.
  const peakReal = data.trend.length > 0 ? Math.max(...data.trend.map((t) => t.total)) : 0
  const peak = Math.max(1, peakReal)
  const stockTotal = Math.max(1, data.stock.inStock + data.stock.lowStock + data.stock.outOfStock + data.stock.notTracked)

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-3 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{data.shopName}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Link href="/pos/sell" className="flex-shrink-0">
          <span className="inline-flex h-11 px-4 items-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform">
            <ShoppingCart className="w-4 h-4" /> New sale
          </span>
        </Link>
      </div>

      {/* --- what needs doing ------------------------------------------- */}
      {data.alerts.length > 0 && (
        <Card className="p-3 rounded-2xl border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/15">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              {data.alerts.map((a, i) => (
                <p key={i} className="text-xs text-amber-900 dark:text-amber-300 leading-snug">{a.text}</p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* --- the four figures -------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2">
        {data.stats.map((s) => {
          const up = (s.deltaPercent ?? 0) >= 0
          const good = up === s.riseIsGood
          return (
            <Card key={s.label} className="p-3 rounded-2xl gap-0 py-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{s.label}</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white tabular-nums leading-tight">
                {s.kind === "money" ? "KSh " + shShort(s.value) : s.value.toLocaleString("en-KE")}
              </p>
              {s.deltaPercent !== null ? (
                <p className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold ${
                  good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(s.deltaPercent)}% vs yesterday
                </p>
              ) : (
                /* No yesterday to compare with is not the same as no change,
                   and showing 0% on a shop's first day would be a small lie. */
                <p className="mt-0.5 text-[11px] text-gray-400">no comparison yet</p>
              )}
            </Card>
          )
        })}
      </div>

      {/* --- the week ----------------------------------------------------- */}
      {data.canSeeMoney && (
        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Last seven days</h2>
            <Link href="/pos/reports" className="h-9 inline-flex items-center px-2 -mr-2 text-[11px] font-semibold text-primary active:scale-95">
              Reports
            </Link>
          </div>
          <div className="mt-3 flex items-end gap-1.5 h-28">
            {data.trend.map((t) => (
              <div key={t.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t bg-primary/80 min-h-[2px] transition-all"
                    style={{ height: `${Math.max(2, (t.total / peak) * 100)}%` }}
                    title={t.label + ": KSh " + sh(t.total)}
                  />
                </div>
                <span className="text-[9px] text-gray-400 truncate w-full text-center">{t.label.split(" ")[0]}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
            {peakReal > 0
              ? `Tallest bar is KSh ${shShort(peakReal)}. Voided and refunded sales are left out.`
              : "Nothing sold in the last seven days."}
          </p>
        </Card>
      )}

      {/* --- stock at a glance --------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Stock</h2>
          <Link href="/pos/stock" className="h-9 inline-flex items-center px-2 -mr-2 text-[11px] font-semibold text-primary active:scale-95">
            Manage
          </Link>
        </div>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          {data.stock.totalProducts} {data.stock.totalProducts === 1 ? "product" : "products"} on the shelf
        </p>
        {/* A bar rather than a ring: four numbers that add to a whole read
            faster side by side, and a ring at this size is a decoration. */}
        <div className="mt-3 flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
          {([
            ["bg-emerald-500", data.stock.inStock],
            ["bg-amber-500", data.stock.lowStock],
            ["bg-red-500", data.stock.outOfStock],
            ["bg-gray-300 dark:bg-gray-600", data.stock.notTracked],
          ] as const).map(([cls, n], i) => (
            n > 0 ? <div key={i} className={cls} style={{ width: `${(n / stockTotal) * 100}%` }} /> : null
          ))}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Legend colour="bg-emerald-500" label="In stock" value={data.stock.inStock} />
          <Legend colour="bg-amber-500" label="Running low" value={data.stock.lowStock} />
          <Legend colour="bg-red-500" label="Out of stock" value={data.stock.outOfStock} />
          <Legend colour="bg-gray-300 dark:bg-gray-600" label="Not tracked" value={data.stock.notTracked} />
        </div>
      </Card>

      {/* --- what is selling ------------------------------------------------ */}
      {data.canSeeMoney && data.topProducts.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Selling best this week</h2>
          <div className="mt-2.5 space-y-1.5">
            {data.topProducts.map((p, i) => (
              <div key={p.productId || i} className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-md bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-500 flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-xs text-gray-900 dark:text-white truncate">{p.name}</span>
                <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">{shShort(p.quantity)} sold</span>
                <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums flex-shrink-0 w-20 text-right">
                  {shShort(p.total)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* --- what just happened ---------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Recent sales</h2>
          <Link href="/pos/reports" className="h-9 inline-flex items-center px-2 -mr-2 text-[11px] font-semibold text-primary active:scale-95">
            All
          </Link>
        </div>
        {data.recentSales.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Nothing rung up yet. The first sale will show here.
          </p>
        ) : (
          <div className="mt-2.5 space-y-1">
            {data.recentSales.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-[11px]">
                <span className="text-gray-400 tabular-nums w-11 flex-shrink-0">
                  {new Date(s.occurredAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0 truncate">{s.saleNumber}</span>
                <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">
                  {s.itemCount} {s.itemCount === 1 ? "item" : "items"}
                  <span className="text-gray-400"> &middot; {METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</span>
                </span>
                {s.status === "VOIDED" || s.status === "REFUNDED" ? (
                  <span className="text-[10px] font-bold uppercase text-red-500 flex-shrink-0">{s.status.toLowerCase()}</span>
                ) : null}
                {data.canSeeMoney && (
                  <span className={`tabular-nums font-semibold flex-shrink-0 ${
                    s.status === "VOIDED" || s.status === "REFUNDED"
                      ? "text-gray-400 line-through"
                      : "text-gray-900 dark:text-white"
                  }`}>
                    {sh(s.total)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* --- everything else, grouped -----------------------------------------
          Seventeen identical tiles in one grid is a wall, not a menu: the
          shopkeeper has to read every label to find the one they want. The
          groups are the four things a shop actually does, and Setting up is
          last because it is the one you stop needing. */}
      {GROUPS.map((group) => (
        <Card key={group.title} className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{group.title}</h2>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{group.blurb}</p>
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {group.items.map((item) => (
              <Action key={item.href} href={item.href} icon={item.icon} label={item.label} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

function Legend({ colour, label, value }: { colour: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colour}`} />
      <span className="text-[11px] text-gray-500 dark:text-gray-400 min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[11px] font-semibold text-gray-900 dark:text-white tabular-nums">{value}</span>
    </div>
  )
}

function Action({ href, icon: Icon, label }: { href: string; icon: typeof ShoppingCart; label: string }) {
  return (
    <Link href={href}>
      <span className="h-20 w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 active:scale-95 transition-transform">
        <Icon className="w-5 h-5 text-primary" />
        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{label}</span>
      </span>
    </Link>
  )
}
