"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Package, Clock, CheckCircle2, AlertCircle, Loader2, ShoppingCart } from "lucide-react"
import { getIncomingWholesaleOrders, type IncomingWholesaleOrder } from "@/lib/actions/wholesale-orders"
import { useLocalization } from "@/lib/hooks/useLocalization"

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  PROCESSING: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  SHIPPED: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  DELIVERED: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  REFUNDED: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400",
}

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  PENDING: AlertCircle, PROCESSING: Clock, SHIPPED: Package, DELIVERED: CheckCircle2, CANCELLED: AlertCircle, REFUNDED: AlertCircle,
}

const STATUS_KEY: Record<string, "distributor.common.statusPending" | "distributor.common.statusProcessing" | "distributor.common.statusShipped" | "distributor.common.statusDelivered" | "distributor.common.statusCancelled" | "distributor.common.statusRefunded"> = {
  PENDING: "distributor.common.statusPending",
  PROCESSING: "distributor.common.statusProcessing",
  SHIPPED: "distributor.common.statusShipped",
  DELIVERED: "distributor.common.statusDelivered",
  CANCELLED: "distributor.common.statusCancelled",
  REFUNDED: "distributor.common.statusRefunded",
}

export default function DistributorOrdersPage() {
  const { t, tn, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<IncomingWholesaleOrder[]>([])
  const [filter, setFilter] = useState("all")

  useEffect(() => {
    getIncomingWholesaleOrders().then(setOrders).finally(() => setIsLoading(false))
  }, [])

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status.toLowerCase() === filter)

  const filterTabs: { value: string; label: string }[] = [
    { value: "all", label: t("distributor.orders.filterAll") },
    { value: "pending", label: t("distributor.common.statusPending") },
    { value: "processing", label: t("distributor.common.statusProcessing") },
    { value: "shipped", label: t("distributor.common.statusShipped") },
    { value: "delivered", label: t("distributor.common.statusDelivered") },
    { value: "cancelled", label: t("distributor.common.statusCancelled") },
  ]

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="w-7 h-7 text-teal-600" />
            {t("distributor.orders.title")}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t("distributor.orders.subtitle")}</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {filterTabs.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors text-sm ${
                filter === f.value ? "bg-teal-600 text-white shadow-lg" : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card className="p-10 text-center border-0 shadow-lg">
            <Package className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">{t("distributor.orders.noOrdersFound")}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((o) => {
              const StatusIcon = STATUS_ICON[o.status] ?? Clock
              return (
                <Link key={o.id} href={`/distributor/orders/${o.id}`}>
                  <Card className="p-5 border-0 shadow-lg hover:shadow-xl transition-shadow">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 dark:text-white">{o.orderNumber}</p>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${STATUS_COLOR[o.status]}`}>
                            <StatusIcon className="w-3 h-3" /> {t(STATUS_KEY[o.status] ?? "distributor.common.statusPending")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{o.buyerShopName} · {o.locationName} · {tn("distributor.common.itemCount", o.itemCount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900 dark:text-white">{formatMoney(o.total)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(o.createdAt).toLocaleDateString()}</p>
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
