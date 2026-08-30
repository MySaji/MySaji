"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, CheckCircle2, Clock, Package, AlertCircle, Truck } from "lucide-react"
import { getIncomingWholesaleOrders, advanceWholesaleOrderStatus, type IncomingWholesaleOrder } from "@/lib/actions/wholesale-orders"
import { useLocalization } from "@/lib/hooks/useLocalization"

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  PROCESSING: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  SHIPPED: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  DELIVERED: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  REFUNDED: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400",
}

const STATUS_KEY: Record<string, "distributor.common.statusPending" | "distributor.common.statusProcessing" | "distributor.common.statusShipped" | "distributor.common.statusDelivered" | "distributor.common.statusCancelled" | "distributor.common.statusRefunded"> = {
  PENDING: "distributor.common.statusPending",
  PROCESSING: "distributor.common.statusProcessing",
  SHIPPED: "distributor.common.statusShipped",
  DELIVERED: "distributor.common.statusDelivered",
  CANCELLED: "distributor.common.statusCancelled",
  REFUNDED: "distributor.common.statusRefunded",
}

const NEXT_STATUS: Record<string, { labelKey: "distributor.orderDetail.markProcessing" | "distributor.orderDetail.markShipped" | "distributor.orderDetail.markDelivered"; value: "processing" | "shipped" | "delivered" } | null> = {
  PENDING: { labelKey: "distributor.orderDetail.markProcessing", value: "processing" },
  PROCESSING: { labelKey: "distributor.orderDetail.markShipped", value: "shipped" },
  SHIPPED: { labelKey: "distributor.orderDetail.markDelivered", value: "delivered" },
  DELIVERED: null,
  CANCELLED: null,
  REFUNDED: null,
}

export default function DistributorOrderDetailPage() {
  const { t, formatMoney } = useLocalization()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [order, setOrder] = useState<IncomingWholesaleOrder | null>(null)
  const [isAdvancing, setIsAdvancing] = useState(false)

  const refresh = async () => {
    const orders = await getIncomingWholesaleOrders()
    setOrder(orders.find((o) => o.id === params.id) ?? null)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [params.id])

  const handleAdvance = async () => {
    if (!order) return
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setIsAdvancing(true)
    const result = await advanceWholesaleOrderStatus({ wholesaleOrderId: order.id, status: next.value })
    setIsAdvancing(false)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-gray-600 dark:text-gray-400">{t("distributor.orderDetail.orderNotFound")}</p>
        <Button variant="outline" onClick={() => router.push("/distributor/orders")}>{t("distributor.orderDetail.backToOrders")}</Button>
      </div>
    )
  }

  const next = NEXT_STATUS[order.status]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push("/distributor/orders")} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> {t("distributor.orderDetail.backToOrders")}
        </button>

        <Card className="p-6 border-0 shadow-lg mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{order.orderNumber}</h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">{order.buyerShopName} · <Truck className="inline w-3.5 h-3.5" /> {order.locationName}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${STATUS_COLOR[order.status]}`}>
              {t(STATUS_KEY[order.status] ?? "distributor.common.statusPending")}
            </span>
          </div>

          <div className="space-y-2 mb-4">
            {order.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs">
                <span className="text-gray-900 dark:text-white">{it.productName} × {it.quantity}</span>
                <span className="text-gray-600 dark:text-gray-400">{t("distributor.orderDetail.priceEach", { price: formatMoney(it.unitPrice), total: formatMoney(it.totalPrice) })}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-xs border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>{t("distributor.orderDetail.subtotalLabel")}</span><span>{formatMoney(order.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>{t("distributor.orderDetail.deliveryFeeLabel")}</span><span>{formatMoney(order.deliveryFee)}</span></div>
            <div className="flex justify-between font-bold text-gray-900 dark:text-white text-sm"><span>{t("payment.total")}</span><span>{formatMoney(order.total)}</span></div>
          </div>

          {order.notes && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-white">{t("distributor.orderDetail.notesLabel")} </span>{order.notes}
            </div>
          )}
        </Card>

        {next && (
          <Card className="p-6 border-0 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              {order.status === "SHIPPED" ? <CheckCircle2 className="w-5 h-5 text-teal-600" /> : <Clock className="w-5 h-5 text-teal-600" />}
              {t("distributor.orderDetail.advanceOrderPrompt")}
            </div>
            <Button onClick={handleAdvance} disabled={isAdvancing} className="bg-teal-600 hover:bg-teal-700">
              {isAdvancing ? <Loader2 className="w-4 h-4 animate-spin" /> : t(next.labelKey)}
            </Button>
          </Card>
        )}

        {order.status === "DELIVERED" && (
          <Card className="p-4 border-0 shadow-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            <Package className="w-4 h-4" /> {t("distributor.orderDetail.deliveredNotice")}
          </Card>
        )}
        {(order.status === "CANCELLED" || order.status === "REFUNDED") && (
          <Card className="p-4 border-0 shadow-lg bg-red-50 dark:bg-red-900/20 flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4" /> {t("distributor.orderDetail.cancelledNotice")}
          </Card>
        )}
      </div>
    </div>
  )
}
