"use client"

import { useEffect, useState, type ComponentType } from "react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Package, Clock, Truck, CheckCircle2, XCircle, RotateCcw } from "lucide-react"
import Link from "next/link"
import { getCustomerOrders, type CustomerOrder } from "@/lib/actions/orders"

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

  const ORDER_STATUS_STYLE: Record<string, { label: string; className: string; icon: ComponentType<{ className?: string }> }> = {
    PENDING: { label: t("customer.orders.statusPending"), className: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400", icon: Clock },
    PROCESSING: { label: t("customer.orders.statusProcessing"), className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400", icon: Package },
    SHIPPED: { label: t("customer.orders.statusShipped"), className: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400", icon: Truck },
    DELIVERED: { label: t("customer.orders.statusDelivered"), className: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
    CANCELLED: { label: t("customer.orders.statusCancelled"), className: "bg-muted text-muted-foreground", icon: XCircle },
    REFUNDED: { label: t("customer.orders.statusRefunded"), className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400", icon: RotateCcw },
  }

  useEffect(() => {
    getCustomerOrders().then(setOrders).finally(() => setIsLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        <div className="mb-6">
          <h1 className="text-lg lg:text-xl font-bold text-foreground">{t("customer.orders.title")}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t("customer.orders.subtitle")}</p>
        </div>

        {isLoading ? (
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
          <div className="space-y-3">
            {orders.map((order) => {
              const status = ORDER_STATUS_STYLE[order.status] ?? ORDER_STATUS_STYLE.PENDING
              const StatusIcon = status.icon
              return (
                <Link key={order.id} href={`/customer/orders/${order.id}`}>
                  <Card className="p-4 border border-border rounded-2xl hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-foreground truncate">{order.itemSummary}</p>
                          <p className="text-[11px] text-muted-foreground">{order.shopName} &middot; #{order.orderNumber}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(order.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-xs text-foreground">{formatMoney(order.total)}</p>
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
