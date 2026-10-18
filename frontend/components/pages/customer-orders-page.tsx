"use client"

import { useEffect, useState, useCallback, type ComponentType } from "react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { Card } from "@/frontend/components/ui/card"
import { Skeleton } from "@/frontend/components/ui/skeleton"
import { Package, Clock, Truck, CheckCircle2, XCircle, RotateCcw } from "lucide-react"
import Link from "next/link"
import { getCustomerOrders, type CustomerOrder } from "@/backend/actions/orders"

function OrdersSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
    </div>
  )
}

export function CustomerOrdersPage() {
  const { t, formatMoney } = useLocalization()
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [sort, setSort] = useState("newest")
  const refresh = useCallback(async () => {
    setIsLoading(true); setError("")
    try { setOrders(await getCustomerOrders()) }
    catch { setError("We could not load your orders. Check your connection and try again.") }
    finally { setIsLoading(false) }
  }, [])
  const visibleOrders = orders.filter(order => (statusFilter === "ALL" || order.status === statusFilter) && `${order.orderNumber} ${order.itemSummary} ${order.shopName}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "value" ? b.total - a.total : sort === "oldest" ? +new Date(a.createdAt) - +new Date(b.createdAt) : +new Date(b.createdAt) - +new Date(a.createdAt))

  const ORDER_STATUS_STYLE: Record<string, { label: string; className: string; icon: ComponentType<{ className?: string }> }> = {
    PENDING: { label: t("customer.orders.statusPending"), className: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", icon: Clock },
    PROCESSING: { label: t("customer.orders.statusProcessing"), className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400", icon: Package },
    SHIPPED: { label: t("customer.orders.statusShipped"), className: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400", icon: Truck },
    DELIVERED: { label: t("customer.orders.statusDelivered"), className: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
    CANCELLED: { label: t("customer.orders.statusCancelled"), className: "bg-muted text-muted-foreground", icon: XCircle },
    REFUNDED: { label: t("customer.orders.statusRefunded"), className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400", icon: RotateCcw },
  }

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8">
        <div className="mb-6">
          <h1 className="text-lg lg:text-xl font-bold text-foreground">{t("customer.orders.title")}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t("customer.orders.subtitle")}</p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3" aria-label="Order summary">
          {[{ label: "All orders", value: orders.length }, { label: "In progress", value: orders.filter(order => ["PENDING", "PROCESSING", "SHIPPED"].includes(order.status)).length }, { label: "Delivered", value: orders.filter(order => order.status === "DELIVERED").length }].map(item => <div key={item.label} className="rounded-xl border bg-card p-4"><p className="text-2xl font-semibold text-primary">{isLoading ? "..." : item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></div>)}
        </div>
        <div className="mb-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold sm:col-span-2">Search orders<input type="search" placeholder="Product, shop or order number" value={query} onChange={event => setQuery(event.target.value)} className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-base font-normal" /></label>
          <label className="text-xs font-semibold">Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-sm font-normal"><option value="ALL">All statuses</option>{Object.entries(ORDER_STATUS_STYLE).map(([value, status]) => <option key={value} value={value}>{status.label}</option>)}</select></label>
          <label className="text-xs font-semibold">Sort by<select value={sort} onChange={event => setSort(event.target.value)} className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-sm font-normal"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="value">Highest amount</option></select></label>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p role="status">{!isLoading && !error && `${visibleOrders.length} of ${orders.length} orders`}</p><button disabled={isLoading} onClick={() => void refresh()} className="min-h-11 rounded-lg border px-4 text-primary disabled:opacity-50">Refresh orders</button></div>
        {error ? <div role="alert" className="rounded-xl border border-red-200 p-5 text-sm text-red-700">{error}<button onClick={() => void refresh()} className="ml-3 underline">Try again</button></div> : isLoading ? (
          <OrdersSkeleton />
        ) : orders.length === 0 ? (
          <Card className="p-10 text-center border-0 shadow-sm rounded-2xl">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">{t("customer.orders.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground mb-4">{t("customer.orders.emptySubtitle")}</p>
            <Link href="/customer/products" className="text-xs font-medium text-primary hover:underline">
              {t("customer.orders.browseProducts")}
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleOrders.length === 0 && <div className="rounded-xl border p-8 text-center"><p className="text-sm">No orders match your search.</p><button onClick={() => { setQuery(""); setStatusFilter("ALL") }} className="mt-3 min-h-11 text-sm text-primary underline">Clear filters</button></div>}
            {visibleOrders.map((order) => {
              const status = ORDER_STATUS_STYLE[order.status] ?? ORDER_STATUS_STYLE.PENDING
              const StatusIcon = status.icon
              return (
                <Link key={order.id} href={order.detailHref}>
                  <Card className="p-4 border border-border rounded-2xl hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{order.itemSummary}</p>
                          <p className="text-[11px] text-muted-foreground">{order.shopName} &middot; #{order.orderNumber}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(order.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm text-foreground">{formatMoney(order.total)}</p>
                        <div className={`mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${status.className}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
