"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CheckCircle2, ChevronRight, CircleDollarSign, Package, RefreshCw, Search, ShieldCheck, ShoppingCart, Sparkles, TrendingUp, Users, X, type LucideIcon } from "lucide-react"
import { getPosDashboard, type PosDashboard } from "@/backend/actions/pos-dashboard"
import { getPosWhoAmI, type PosWhoAmI } from "@/backend/actions/pos-access"
import { canOpenPosPage } from "@/frontend/lib/pos-navigation"

type ActionGroup = { title: string; blurb: string; items: { href: string; icon: LucideIcon; label: string }[] }
const money = (value: number) => `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`
const METHODS: Record<string, string> = { CASH: "Cash", MPESA: "M-Pesa", CARD: "Card", BANK: "Bank", CREDIT: "Credit", SPLIT: "Split payment", GIFT_CARD: "Gift card" }
const PANEL = "min-w-0 rounded-2xl border border-border bg-background shadow-sm"
const DATE_OPTIONS = { timeZone: "Africa/Nairobi", day: "numeric", month: "short" } as const

export function OverviewDashboard({ groups }: { groups: ActionGroup[] }) {
  const [data, setData] = useState<PosDashboard | null>(null)
  const [actor, setActor] = useState<PosWhoAmI | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [days, setDays] = useState<7 | 30>(7)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const request = useRef(0)
  const mounted = useRef(false)

  const refresh = useCallback(async (period: 7 | 30) => {
    const current = ++request.current
    setRefreshing(true)
    setError("")
    try {
      const [dashboard, identity] = await Promise.all([getPosDashboard({ days: period }), getPosWhoAmI()])
      if (!mounted.current || current !== request.current) return
      setData(dashboard)
      setActor(identity)
      setUpdatedAt(new Date())
    } catch {
      if (mounted.current && current === request.current) setError("Could not refresh Overview. Check your connection and try again. The last successful update stays visible below.")
    } finally {
      if (mounted.current && current === request.current) { setLoading(false); setRefreshing(false) }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void refresh(days)
    return () => { mounted.current = false }
  }, [days, refresh])

  if (loading) return <div role="status" aria-label="Loading Overview" className="w-full space-y-5 p-4 md:p-6"><div className="h-40 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" /><div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map(value => <div key={value} className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}</div><div className="h-80 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" /></div>
  if (!data) return <div className="w-full p-4 md:p-6"><div className={`${PANEL} p-10 text-center`}><ShoppingCart className="mx-auto h-12 w-12 text-blue-500" /><h1 className="mt-4 text-2xl font-semibold">{error ? "Overview is unavailable" : "Your business overview starts here"}</h1><p className="mt-2 text-sm text-muted-foreground">{error || "Sign in to your POS account or finish setting up your business to see your daily activity."}</p><div className="mt-5 flex flex-wrap justify-center gap-3"><button onClick={() => void refresh(days)} className="rounded-xl border border-border px-4 py-3 text-sm font-medium">Try again</button><Link href="/pos/setup" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white">Set up POS</Link></div></div></div>

  const can = (href: string) => canOpenPosPage(href, actor?.permissions ?? [])
  const availableGroups = groups.map(group => ({ ...group, items: group.items.filter(item => can(item.href)) })).filter(group => group.items.length)
  const totalRevenue = data.trend.reduce((sum, day) => sum + day.total, 0)
  const transactions = data.trend.reduce((sum, day) => sum + day.transactions, 0)
  const actualDays = data.periodDays ?? 7
  const bestDay = data.trend.reduce<PosDashboard["trend"][number] | null>((best, day) => !best || day.total > best.total ? day : best, null)
  const attention = data.alerts.filter(alert => alert.kind !== "shift-open")
  const search = query.trim().toLowerCase()
  const sales = data.recentSales.filter(sale => (status === "ALL" || (status === "ACTIVE" ? !["VOIDED", "REFUNDED"].includes(sale.status) : sale.status === status)) && (!search || [sale.saleNumber, sale.cashierName, METHODS[sale.paymentMethod] ?? sale.paymentMethod].some(value => value?.toLowerCase().includes(search))))
  const stockParts = [
    { label: "Healthy stock", value: data.stock.inStock, color: "var(--primary)", className: "bg-blue-500" },
    { label: "Running low", value: data.stock.lowStock, color: "#f59e0b", className: "bg-amber-500" },
    { label: "Out of stock", value: data.stock.outOfStock, color: "#f43f5e", className: "bg-rose-500" },
    { label: "Not monitored", value: data.stock.notTracked, color: "#cbd5e1", className: "bg-slate-300" },
  ]
  const stockTotal = stockParts.reduce((sum, part) => sum + part.value, 0)
  let progress = 0
  const segments = stockParts.map(part => { const start = progress; progress += stockTotal > 0 ? part.value / stockTotal * 100 : 0; return `${part.color} ${start}% ${progress}%` })
  const today = updatedAt?.toLocaleDateString("en-KE", { ...DATE_OPTIONS, weekday: "long", year: "numeric" })

  return <div className="w-full min-w-0 space-y-6 p-4 pb-10 md:p-6 xl:p-8">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white md:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full border-[48px] border-white/[0.03]" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300"><Sparkles className="h-3.5 w-3.5" />Your business at a glance</p><h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Business overview</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">A clear view of {data.shopName}. Keep an eye on performance, stock, and what needs your attention.</p><p className="mt-4 text-xs text-slate-400">{today}</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => void refresh(days)} disabled={refreshing} aria-label="Refresh Overview" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>{can("/pos/sell") && <Link href="/pos/sell" className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-500 px-4 text-xs font-semibold text-white hover:bg-blue-400"><PlusIcon />Open register<ArrowRight className="h-4 w-4" /></Link>}</div>
      </div>
      <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-[11px]"><span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${data.shiftOpen ? "bg-emerald-400" : "bg-slate-400"}`} />{data.shiftOpen ? "Shift open" : "No active shift"}{can("/pos/shifts") && <Link href="/pos/shifts" className="ml-2 text-blue-300 hover:text-white">Manage shift →</Link>}</span><span aria-live="polite" className="text-slate-400">{refreshing ? "Updating dashboard…" : updatedAt ? `Updated ${updatedAt.toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" })}` : ""}</span></div>
    </section>

    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{error}</div>}

    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Today’s snapshot</h2><span className="text-[11px] text-muted-foreground">Compared with yesterday</span></div>
    <section aria-label="Today's metrics" className={`grid grid-cols-2 gap-3 md:gap-4 ${data.stats.length > 3 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      {data.stats.map((stat, index) => {
        const Icon = stat.kind === "money" ? CircleDollarSign : stat.label.includes("ustomer") ? Users : stat.label.includes("stock") ? Package : ShoppingCart
        const good = ((stat.deltaPercent ?? 0) >= 0) === stat.riseIsGood
        const DeltaIcon = (stat.deltaPercent ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight
        return <article key={stat.label} className={`${PANEL} p-4 md:p-5`}><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{stat.label}</p><span className={`rounded-xl p-2 ${["bg-blue-50 text-blue-600 dark:bg-blue-950", "bg-violet-50 text-violet-600 dark:bg-violet-950", "bg-emerald-50 text-emerald-600 dark:bg-emerald-950", "bg-amber-50 text-amber-600 dark:bg-amber-950"][index % 4]}`}><Icon className="h-4 w-4" /></span></div><p className="mt-4 break-words text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">{stat.kind === "money" ? money(stat.value) : stat.value.toLocaleString("en-KE")}</p><p className={`mt-3 flex items-center gap-1 text-[10px] ${stat.deltaPercent === null ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{stat.deltaPercent === null ? <><Activity className="h-3 w-3" />{stat.label.includes("stock") ? "Low and out-of-stock items" : "No comparison available"}</> : <><DeltaIcon className="h-3.5 w-3.5" />{Math.abs(stat.deltaPercent)}% vs yesterday</>}</p></article>
      })}
    </section>

    <div className={`grid items-start gap-5 ${data.canSeeMoney ? "xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]" : ""}`}>
      {data.canSeeMoney && <section className={`${PANEL} p-5 md:p-6`} aria-label="Sales performance"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Sales performance</h2><p className="mt-1 text-xs text-muted-foreground">Sales recorded over the last {actualDays} days</p></div><div className="flex rounded-lg bg-muted p-1" aria-label="Sales chart period">{([7, 30] as const).map(period => <button key={period} disabled={refreshing} onClick={() => { if (period === days) void refresh(period); else setDays(period) }} aria-pressed={actualDays === period} className={`rounded-md px-3 py-2 text-[11px] font-medium ${actualDays === period ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{period} days</button>)}</div></div>
        <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2"><p className="text-3xl font-semibold tracking-tight tabular-nums">{money(totalRevenue)}</p><p className="text-xs text-muted-foreground">{transactions.toLocaleString("en-KE")} transactions</p></div>
        <div className="mt-5 h-60 w-full min-w-0" role="img" aria-label={`Sales for ${actualDays} days: ${money(totalRevenue)} across ${transactions} transactions`}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend} margin={{ top: 8, right: 4, left: -14, bottom: 0 }} accessibilityLayer><defs><linearGradient id="overview-sales-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeDasharray="4 4" /><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{ fontSize: 10, fill: "#94a3b8" }} dy={8} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={value => value >= 1000 ? `${value / 1000}k` : String(value)} /><Tooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border border-border bg-background p-3 text-xs shadow-lg"><p className="text-muted-foreground">{payload[0].payload.label}</p><p className="mt-1 font-semibold">{money(Number(payload[0].value))}</p><p className="mt-1 text-muted-foreground">{payload[0].payload.transactions} transactions</p></div> : null} /><Area type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={3} fill="url(#overview-sales-fill)" isAnimationActive={false} activeDot={{ r: 5, strokeWidth: 3, stroke: "white" }} /></AreaChart></ResponsiveContainer>
        </div><div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground"><span>Average sale <strong className="ml-1 font-semibold text-foreground">{transactions ? money(totalRevenue / transactions) : "—"}</strong></span><span>Best day <strong className="ml-1 font-semibold text-foreground">{bestDay && bestDay.total > 0 ? bestDay.label : "No sales yet"}</strong></span>{can("/pos/reports") && <Link href="/pos/reports" className="inline-flex items-center gap-1 font-medium text-blue-600">View reports<ArrowUpRight className="h-3.5 w-3.5" /></Link>}</div>
      </section>}

      <section className={`${PANEL} p-5 md:p-6`}><div className="flex items-center justify-between"><h2 className="text-base font-semibold">Needs attention</h2><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">{attention.length}</span></div><p className="mt-1 text-xs text-muted-foreground">Small actions that keep the day moving</p><div className="mt-5 space-y-3">{attention.length ? attention.map((alert, index) => <div key={alert.kind + index} className="flex items-start gap-3 rounded-xl bg-muted/60 p-3"><span className={`mt-0.5 rounded-lg p-2 ${alert.kind === "expired" ? "bg-rose-100 text-rose-600 dark:bg-rose-950" : "bg-amber-100 text-amber-600 dark:bg-amber-950"}`}><Package className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-relaxed">{alert.text}</p><p className="mt-1 text-[10px] text-muted-foreground">{alert.kind === "expired" ? "Review affected batches" : alert.kind === "expiring" ? "Review dates and plan stock rotation" : alert.kind === "unsynced" ? "Review sales awaiting sync" : "Review stock and replenishment"}</p>{can(alert.kind === "unsynced" ? "/pos/sell" : "/pos/stock") && <Link href={alert.kind === "unsynced" ? "/pos/queue" : "/pos/stock"} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600">Review<ChevronRight className="h-3 w-3" /></Link>}</div></div>) : <div className="rounded-xl bg-emerald-50 p-5 text-center dark:bg-emerald-950/30"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 text-sm font-semibold">All clear for now</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">No stock or expiry alerts in this update.</p></div>}</div><div className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-[10px] leading-relaxed text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" />Your view follows your role and the permissions set by your business owner.</div></section>
    </div>

    <div className={`grid items-start gap-5 lg:grid-cols-2 ${data.canSeeMoney ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.4fr)]" : ""}`}>
      <section className={`${PANEL} p-5`}><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Inventory health</h2><Boxes className="h-4 w-4 text-blue-500" /></div><div className="my-5 flex justify-center"><div role="img" aria-label={stockParts.map(part => `${part.label}: ${part.value}`).join(", ")} className="flex h-36 w-36 items-center justify-center rounded-full p-4" style={{ background: stockTotal ? `conic-gradient(${segments.join(",")})` : "#e2e8f0" }}><div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-background"><span className="text-3xl font-semibold tabular-nums">{stockTotal}</span><span className="mt-1 text-[10px] text-muted-foreground">stock records</span></div></div></div><div className="space-y-3">{stockParts.map(part => <div key={part.label} className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-2 text-muted-foreground"><span className={`h-2 w-2 rounded-full ${part.className}`} />{part.label}</span><strong className="font-semibold tabular-nums">{part.value}</strong></div>)}</div>{can("/pos/stock") && <Link href="/pos/stock" className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs font-semibold text-blue-600">Manage inventory<ArrowRight className="h-3.5 w-3.5" /></Link>}</section>

      {data.canSeeMoney && <section className={`${PANEL} p-5`}><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Top products</h2><TrendingUp className="h-4 w-4 text-blue-500" /></div><p className="mt-1 text-[11px] text-muted-foreground">Ranked by sales in the last {actualDays} days</p><div className="mt-5 space-y-5">{data.topProducts.length ? data.topProducts.map((product, index) => <div key={product.productId + index}><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-600 dark:bg-blue-950">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{product.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{product.quantity.toLocaleString("en-KE")} sold</p></div><span className="text-[11px] font-semibold tabular-nums">{money(product.total)}</span></div><div className="ml-11 mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, product.total / Math.max(1, ...data.topProducts.map(item => item.total)) * 100)}%` }} /></div></div>) : <div className="py-10 text-center text-xs text-muted-foreground">Your best sellers will appear after your first sales.</div>}</div></section>}

      <section className={`${PANEL} p-5`}><h2 className="text-sm font-semibold">Quick actions</h2><p className="mt-1 text-[11px] text-muted-foreground">Your everyday business tools</p><div className="mt-4 space-y-3">{availableGroups.map(group => <details key={group.title} open={group.title === "Selling" || group.title === "Stock"} className="group rounded-xl border border-border"><summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">{group.title}<ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" /></summary><div className="grid grid-cols-2 gap-1 border-t border-border p-2">{group.items.map(item => <Link key={item.href} href={item.href} className="flex items-center gap-2 rounded-lg p-2.5 text-[11px] text-muted-foreground hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950"><item.icon className="h-4 w-4 shrink-0 text-blue-500" />{item.label}</Link>)}</div></details>)}</div></section>
    </div>

    <section className={`${PANEL} overflow-hidden`}><div className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6"><div><h2 className="text-base font-semibold">Recent transactions</h2><p className="mt-1 text-[11px] text-muted-foreground">Search the latest {data.recentSales.length} sales in this update</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" /><input aria-label="Search recent sales" value={query} onChange={event => setQuery(event.target.value)} placeholder="Receipt, cashier or payment" className="h-10 w-full max-w-64 rounded-lg border border-border bg-background pl-9 pr-8 text-xs" />{query && <button aria-label="Clear sales search" onClick={() => setQuery("")} className="absolute right-2 top-2.5"><X className="h-4 w-4 text-muted-foreground" /></button>}</div><select aria-label="Filter sale status" value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-xs"><option value="ALL">All statuses</option><option value="ACTIVE">Not voided/refunded</option><option value="VOIDED">Voided</option><option value="REFUNDED">Refunded</option></select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-y border-border bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground"><tr>{["Receipt", "Time", "Cashier", "Payment", "Status", ...(data.canSeeMoney ? ["Amount"] : [])].map(label => <th key={label} className="px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{sales.map(sale => <tr key={sale.id} className="hover:bg-muted/30"><td className="px-5 py-4 font-semibold">{sale.saleNumber}<span className="mt-1 block text-[10px] font-normal text-muted-foreground">{sale.itemCount} line items</span></td><td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{new Date(sale.occurredAt).toLocaleDateString("en-KE", DATE_OPTIONS)}<span className="mt-1 block text-[10px]">{new Date(sale.occurredAt).toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" })}</span></td><td className="px-5 py-4 text-muted-foreground">{sale.cashierName || "Owner"}</td><td className="px-5 py-4 text-muted-foreground">{METHODS[sale.paymentMethod] ?? sale.paymentMethod}</td><td className="px-5 py-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium ${["VOIDED", "REFUNDED"].includes(sale.status) ? "bg-rose-50 text-rose-600 dark:bg-rose-950" : "bg-blue-50 text-blue-600 dark:bg-blue-950"}`}>{sale.status.toLowerCase().replaceAll("_", " ")}</span></td>{data.canSeeMoney && <td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums">{money(sale.total)}</td>}</tr>)}</tbody></table></div>{sales.length === 0 && <div role="status" className="p-10 text-center text-xs text-muted-foreground">{data.recentSales.length ? "No transactions match your search." : "Your recent sales will appear here once you start trading."}</div>}{can("/pos/reports") && <Link href="/pos/reports" className="flex items-center justify-center gap-2 border-t border-border py-4 text-xs font-semibold text-blue-600">View sales reports<ArrowRight className="h-3.5 w-3.5" /></Link>}
    </section>
  </div>
}

function PlusIcon() { return <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/15 text-base leading-none">+</span> }
