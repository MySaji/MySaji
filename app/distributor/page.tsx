"use client"

import useSWR from "swr"
import { useState } from "react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { WorkflowGuide, WorkspaceRecovery, WorkspaceRefresh } from "@/frontend/components/workspace-panels"
import {
  Package, ShoppingCart, DollarSign, Warehouse,
  Plus, Eye, Clock, AlertCircle,
  CheckCircle2, ArrowUpRight, ArrowDownRight, TrendingUp, Loader2,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import Link from "next/link"
import { getDistributorDashboard } from "@/backend/actions/distributor-dashboard"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/frontend/lib/swr-utils"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  PROCESSING: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  SHIPPED: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  DELIVERED: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  REFUNDED: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400",
}

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  PENDING: AlertCircle,
  PROCESSING: Clock,
  SHIPPED: Package,
  DELIVERED: CheckCircle2,
  CANCELLED: AlertCircle,
  REFUNDED: AlertCircle,
}

const STATUS_KEY: Record<string, "distributor.common.statusPending" | "distributor.common.statusProcessing" | "distributor.common.statusShipped" | "distributor.common.statusDelivered" | "distributor.common.statusCancelled" | "distributor.common.statusRefunded"> = {
  PENDING: "distributor.common.statusPending",
  PROCESSING: "distributor.common.statusProcessing",
  SHIPPED: "distributor.common.statusShipped",
  DELIVERED: "distributor.common.statusDelivered",
  CANCELLED: "distributor.common.statusCancelled",
  REFUNDED: "distributor.common.statusRefunded",
}

export default function DistributorDashboard() {
  const { t, tn, formatMoney } = useLocalization()
  const { user } = useAuthContext()
  const [updatedAt, setUpdatedAt] = useState<number>()
  const { data, isLoading, error, mutate, isValidating } = useSWR(
    user?.id ? ["distributor-dashboard", user.id] : null, () => withTimeout(getDistributorDashboard(), DASHBOARD_FETCH_TIMEOUT_MS),
    { onSuccess: () => setUpdatedAt(Date.now()) },
  )

  const formatRelative = (iso: string): string => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const mins = Math.round(diffMs / 60000)
    if (mins < 60) return tn("distributor.dashboard.minutesAgo", mins)
    const hours = Math.round(mins / 60)
    if (hours < 24) return tn("distributor.dashboard.hoursAgo", hours)
    return tn("distributor.dashboard.daysAgo", Math.round(hours / 24))
  }

  if (error || (!isLoading && !data)) return <WorkspaceRecovery title="Supply workspace unavailable" retry={() => void mutate()} busy={isValidating} />

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const kpis = [
    { label: t("distributor.dashboard.kpiTotalRevenue"), value: formatMoney(data.totalRevenue), change: data.monthRevenueGrowthPct, icon: DollarSign, color: "from-emerald-600 to-emerald-700" },
    { label: t("distributor.dashboard.kpiOrdersToday"), value: String(data.ordersToday), change: data.ordersGrowthPct, icon: ShoppingCart, color: "from-blue-600 to-blue-700" },
    { label: t("distributor.dashboard.kpiActiveProducts"), value: `${data.activeProducts}`, change: null, icon: Package, color: "from-purple-600 to-purple-700" },
    { label: t("distributor.nav.locations"), value: String(data.totalLocations), change: null, icon: Warehouse, color: "from-teal-600 to-cyan-700" },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t("distributor.dashboard.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400">{t("distributor.dashboard.subtitle")}</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <Link href="/distributor/products">
              <Button className="bg-teal-600 hover:bg-teal-700 gap-2">
                <Plus className="w-4 h-4" />
                {t("distributor.common.addProduct")}
              </Button>
            </Link>
          </div>
        </div>

        <WorkspaceRefresh refreshing={isValidating} updatedAt={updatedAt} refresh={() => void mutate()} />
      <WorkflowGuide title="Supply workspace" steps={[{ title: "Review incoming orders", description: "Check quantities, customers and current order status." },{ title: "Manage fulfilment", description: "Keep the order record current as goods move through fulfilment." },{ title: "Monitor performance", description: "Use the dashboard and reports to review recorded activity." }]} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {kpis.map((kpi, idx) => {
            const Icon = kpi.icon
            const isPositive = kpi.change !== null && kpi.change >= 0
            return (
              <Card key={idx} className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${kpi.color}`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  {kpi.change !== null && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${isPositive ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" : "text-red-600 bg-red-100 dark:bg-red-900/30"}`}>
                      {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(kpi.change)}%
                    </div>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-xs font-medium mb-1">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
              </Card>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <Card className="p-6 border-0 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("distributor.dashboard.recentOrders")}</h2>
                <Link href="/distributor/orders">
                  <Button variant="outline" size="sm" className="bg-transparent">
                    {t("distributor.dashboard.viewAll")}
                  </Button>
                </Link>
              </div>

              {data.recentOrders.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("distributor.dashboard.noOrdersYet")}</p>
              ) : (
                <div className="space-y-3">
                  {data.recentOrders.map((order) => {
                    const StatusIcon = STATUS_ICON[order.status] ?? Clock
                    return (
                      <div key={order.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 dark:text-white">{order.orderNumber}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{order.buyer} • {tn("distributor.common.itemCount", order.itemCount)}</p>
                        </div>
                        <div className="text-right mr-4">
                          <p className="font-bold text-gray-900 dark:text-white">{formatMoney(order.amount)}</p>
                          <p className="text-[11px] text-gray-600 dark:text-gray-400">{formatRelative(order.createdAt)}</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 ${STATUS_COLOR[order.status]}`}>
                          <StatusIcon className="w-4 h-4" />
                          {t(STATUS_KEY[order.status] ?? "distributor.common.statusPending")}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-6 border-0 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("distributor.dashboard.topProducts")}</h2>
              <Link href="/distributor/products">
                <Button variant="outline" size="sm" className="bg-transparent">
                  <Eye className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {data.topProducts.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("distributor.dashboard.noSalesYet")}</p>
            ) : (
              <div className="space-y-4">
                {data.topProducts.map((product, idx) => (
                  <div key={product.id} className="pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center text-white font-bold text-xs">
                        {idx + 1}
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{product.name}</p>
                    </div>
                    <div className="ml-11">
                      <p className="text-xs text-gray-600 dark:text-gray-400">{t("distributor.dashboard.productSoldSummary", { sold: product.totalSold, revenue: formatMoney(product.revenue) })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-blue-100 text-xs font-medium mb-1">{t("distributor.dashboard.processingOrders")}</p>
                <p className="text-3xl font-bold">{data.processingOrders}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-200" />
            </div>
            <Link href="/distributor/orders?status=processing">
              <Button className="w-full bg-white hover:bg-blue-50 text-blue-600 font-semibold mt-4">
                {t("distributor.dashboard.processOrders")}
              </Button>
            </Link>
          </Card>

          <Card className="p-6 border-0 shadow-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-amber-100 text-xs font-medium mb-1">{t("distributor.dashboard.lowStockItems")}</p>
                <p className="text-3xl font-bold">{data.lowStockCount}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-amber-200" />
            </div>
            <Link href="/distributor/locations">
              <Button className="w-full bg-white hover:bg-amber-50 text-amber-600 font-semibold mt-4">
                {t("distributor.dashboard.restockNow")}
              </Button>
            </Link>
          </Card>

          <Card className="p-6 border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-emerald-100 text-xs font-medium mb-1">{t("distributor.dashboard.todaysRevenue")}</p>
                <p className="text-2xl font-bold">{formatMoney(data.todaysRevenue)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-emerald-200" />
            </div>
            <Link href="/distributor/analytics">
              <Button className="w-full bg-white hover:bg-emerald-50 text-emerald-600 font-semibold mt-4">
                {t("distributor.dashboard.viewAnalytics")}
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}
