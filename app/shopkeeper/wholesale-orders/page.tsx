"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Package, Clock, CheckCircle2, AlertCircle, Loader2, Truck } from "lucide-react"
import { getMyWholesaleOrders, cancelMyWholesaleOrder, type MyWholesaleOrder } from "@/lib/actions/wholesale-orders"
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

export default function ShopkeeperWholesaleOrdersPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [orders, setOrders] = useState<MyWholesaleOrder[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    const data = await getMyWholesaleOrders()
    setOrders(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleCancel = async (id: string) => {
    if (!confirm(t("shopkeeper.wholesaleOrders.cancelConfirm"))) return
    setBusyId(id)
    const result = await cancelMyWholesaleOrder({ wholesaleOrderId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: t("shopkeeper.wholesaleOrders.statusPending"),
      PROCESSING: t("shopkeeper.wholesaleOrders.statusProcessing"),
      SHIPPED: t("shopkeeper.wholesaleOrders.statusShipped"),
      DELIVERED: t("shopkeeper.wholesaleOrders.statusDelivered"),
      CANCELLED: t("shopkeeper.wholesaleOrders.statusCancelled"),
      REFUNDED: t("shopkeeper.wholesaleOrders.statusRefunded"),
    }
    return labels[status] ?? status
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" />
          {t("shopkeeper.wholesaleOrders.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("shopkeeper.wholesaleOrders.subtitle")}</p>
      </div>

      {orders.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">{t("shopkeeper.wholesaleOrders.noOrdersYet")}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const StatusIcon = STATUS_ICON[o.status] ?? Clock
            return (
              <Card key={o.id} className="p-5 border-0 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{o.orderNumber}</p>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${STATUS_COLOR[o.status]}`}>
                        <StatusIcon className="w-3 h-3" /> {getStatusLabel(o.status)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{o.distributorName} · {o.locationName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{formatMoney(o.total)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  {o.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{it.productName} × {it.quantity}</span>
                      <span>{formatMoney(it.totalPrice)}</span>
                    </div>
                  ))}
                </div>

                {o.status === "PENDING" && (
                  <Button size="sm" variant="outline" onClick={() => handleCancel(o.id)} disabled={busyId === o.id} className="text-red-600 border-red-200 hover:bg-red-50">
                    {busyId === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("shopkeeper.wholesaleOrders.cancelOrder")}
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
