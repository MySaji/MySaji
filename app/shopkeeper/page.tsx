"use client"

import useSWR from "swr"
import {
  Package, ShoppingCart, DollarSign, Users,
  Plus, Eye, Clock, AlertCircle,
  CheckCircle2, ArrowUpRight, ArrowDownRight, TrendingUp, Loader2,
  ImageIcon,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getShopkeeperDashboard } from "@/lib/actions/shopkeeper-dashboard"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/lib/swr-utils"
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
  PENDING: AlertCircle,
  PROCESSING: Clock,
  SHIPPED: Package,
  DELIVERED: CheckCircle2,
  CANCELLED: AlertCircle,
  REFUNDED: AlertCircle,
}

const STATUS_LABEL_KEY: Record<string, Parameters<ReturnType<typeof useLocalization>["t"]>[0]> = {
  PENDING: "shopkeeper.orders.statusPending",
  PROCESSING: "shopkeeper.orders.statusProcessing",
  SHIPPED: "shopkeeper.orders.statusShipped",
  DELIVERED: "shopkeeper.orders.statusDelivered",
  CANCELLED: "shopkeeper.orders.statusCancelled",
  REFUNDED: "shopkeeper.orders.statusRefunded",
}

function formatRelative(iso: string, tn: ReturnType<typeof useLocalization>["tn"]): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return tn("shopkeeper.dashboard.minsAgo", mins)
  const hours = Math.round(mins / 60)
  if (hours < 24) return tn("shopkeeper.dashboard.hoursAgo", hours)
  return tn("shopkeeper.dashboard.daysAgo", Math.round(hours / 24))
}

export default function ShopkeeperDashboard() {
  const { t, tn, formatMoney } = useLocalization()

  const { data, isLoading } = useSWR(
    "shopkeeper-dashboard", () => withTimeout(getShopkeeperDashboard(), DASHBOARD_FETCH_TIMEOUT_MS),
  )

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const kpis = [
    { label: t("shopkeeper.dashboard.kpiTotalRevenue"), value: formatMoney(data.totalRevenue), change: data.monthRevenueGrowthPct, icon: DollarSign, color: "from-emerald-600 to-emerald-700" },
    { label: t("shopkeeper.dashboard.kpiOrdersToday"), value: String(data.ordersToday), change: data.ordersGrowthPct, icon: ShoppingCart, color: "from-blue-600 to-blue-700" },
    { label: t("shopkeeper.dashboard.kpiActiveProducts"), value: `${data.activeProducts}`, change: null, icon: Package, color: "from-purple-600 to-purple-700" },
    { label: t("shopkeeper.dashboard.kpiTotalCustomers"), value: data.totalCustomers.toLocaleString(), change: null, icon: Users, color: "from-orange-600 to-orange-700" },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 md:p-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 sm:mb-8 gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2 truncate">{t("shopkeeper.dashboard.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm truncate">{t("shopkeeper.dashboard.subtitle")}</p>
          </div>
          <div className="flex gap-2 sm:gap-3 w-full md:w-auto">
            <Link href="/shopkeeper/products" className="flex-1 md:flex-none">
              <Button className="w-full bg-amber-600 hover:bg-amber-700 gap-2">
                <Plus className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{t("shopkeeper.dashboard.addProduct")}</span>
              </Button>
            </Link>
            <Link href="/shopkeeper/showcase" className="flex-1 md:flex-none">
              <Button className="w-full bg-orange-500 hover:bg-orange-600 gap-2">
                <ImageIcon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{t("shopkeeper.dashboard.shareWork")}</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-6 mb-6 sm:mb-8">
          {kpis.map((kpi, idx) => {
            const Icon = kpi.icon
            const isPositive = kpi.change !== null && kpi.change >= 0
            return (
              <Card key={idx} className="p-2.5 sm:p-6 border-0 shadow-lg hover:shadow-xl transition-shadow min-w-0">
                <div className="flex items-start justify-between gap-1.5 mb-2 sm:mb-4">
                  <div className={`p-1.5 sm:p-3 rounded-lg bg-gradient-to-br ${kpi.color} flex-shrink-0`}>
                    <Icon className="w-3.5 h-3.5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  {kpi.change !== null && (
                    <div className={`flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold flex-shrink-0 ${isPositive ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" : "text-red-600 bg-red-100 dark:bg-red-900/30"}`}>
                      {isPositive ? <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4" /> : <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4" />}
                      {Math.abs(kpi.change)}%
                    </div>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-[10px] sm:text-xs font-medium mb-1 truncate">{kpi.label}</p>
                <p className="text-sm sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{kpi.value}</p>
              </Card>
            )
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Recent Orders */}
          <div className="lg:col-span-2">
            <Card className="p-6 border-0 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("shopkeeper.dashboard.recentOrdersTitle")}</h2>
                <Link href="/shopkeeper/orders">
                  <Button variant="outline" size="sm" className="bg-transparent">
                    {t("shopkeeper.dashboard.viewAll")}
                  </Button>
                </Link>
              </div>

              {data.recentOrders.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("shopkeeper.dashboard.noOrdersYet")}</p>
              ) : (
                <div className="space-y-3">
                  {data.recentOrders.map((order) => {
                    const StatusIcon = STATUS_ICON[order.status] ?? Clock
                    return (
                      <div key={order.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 dark:text-white">{order.orderNumber}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{order.customer} • {tn("shopkeeper.dashboard.itemCount", order.itemCount)}</p>
                        </div>
                        <div className="text-right mr-4">
                          <p className="font-bold text-gray-900 dark:text-white">{formatMoney(order.amount)}</p>
                          <p className="text-[11px] text-gray-600 dark:text-gray-400">{formatRelative(order.createdAt, tn)}</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 ${STATUS_COLOR[order.status]}`}>
                          <StatusIcon className="w-4 h-4" />
                          {STATUS_LABEL_KEY[order.status] ? t(STATUS_LABEL_KEY[order.status]) : order.status}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Top Products */}
          <Card className="p-6 border-0 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("shopkeeper.dashboard.topProductsTitle")}</h2>
              <Link href="/shopkeeper/products">
                <Button variant="outline" size="sm" className="bg-transparent">
                  <Eye className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {data.topProducts.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("shopkeeper.dashboard.noSalesYet")}</p>
            ) : (
              <div className="space-y-4">
                {data.topProducts.map((product, idx) => (
                  <div key={product.id} className="pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white font-bold text-xs">
                        {idx + 1}
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{product.name}</p>
                    </div>
                    <div className="ml-11">
                      <p className="text-xs text-gray-600 dark:text-gray-400">{t("shopkeeper.dashboard.salesRevenue", { sales: product.totalSold, revenue: formatMoney(product.revenue) })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-6">
          <Card className="p-2.5 sm:p-6 border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white min-w-0">
            <div className="flex items-start justify-between gap-1.5 mb-2 sm:mb-4">
              <div className="min-w-0">
                <p className="text-blue-100 text-[10px] sm:text-xs font-medium mb-1 truncate">{t("shopkeeper.dashboard.processingOrders")}</p>
                <p className="text-lg sm:text-3xl font-bold truncate">{data.processingOrders}</p>
              </div>
              <Clock className="w-5 h-5 sm:w-8 sm:h-8 text-blue-200 flex-shrink-0" />
            </div>
            <Link href="/shopkeeper/orders?status=processing">
              <Button className="w-full bg-white hover:bg-blue-50 text-blue-600 font-semibold mt-2 sm:mt-4 h-7 sm:h-9 px-2 text-[10px] sm:text-xs">
                <span className="truncate">{t("shopkeeper.dashboard.processOrders")}</span>
              </Button>
            </Link>
          </Card>

          <Card className="p-2.5 sm:p-6 border-0 shadow-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white min-w-0">
            <div className="flex items-start justify-between gap-1.5 mb-2 sm:mb-4">
              <div className="min-w-0">
                <p className="text-amber-100 text-[10px] sm:text-xs font-medium mb-1 truncate">{t("shopkeeper.dashboard.lowStockItems")}</p>
                <p className="text-lg sm:text-3xl font-bold truncate">{data.lowStockCount}</p>
              </div>
              <AlertCircle className="w-5 h-5 sm:w-8 sm:h-8 text-amber-200 flex-shrink-0" />
            </div>
            <Link href="/shopkeeper/products?filter=low-stock">
              <Button className="w-full bg-white hover:bg-amber-50 text-amber-600 font-semibold mt-2 sm:mt-4 h-7 sm:h-9 px-2 text-[10px] sm:text-xs">
                <span className="truncate">{t("shopkeeper.dashboard.restockNow")}</span>
              </Button>
            </Link>
          </Card>

          <Card className="p-2.5 sm:p-6 border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white min-w-0 col-span-2 md:col-span-1">
            <div className="flex items-start justify-between gap-1.5 mb-2 sm:mb-4">
              <div className="min-w-0">
                <p className="text-emerald-100 text-[10px] sm:text-xs font-medium mb-1 truncate">{t("shopkeeper.dashboard.todaysRevenue")}</p>
                <p className="text-lg sm:text-2xl font-bold truncate">{formatMoney(data.todaysRevenue)}</p>
              </div>
              <TrendingUp className="w-5 h-5 sm:w-8 sm:h-8 text-emerald-200 flex-shrink-0" />
            </div>
            <Link href="/shopkeeper/analytics">
              <Button className="w-full bg-white hover:bg-emerald-50 text-emerald-600 font-semibold mt-2 sm:mt-4 h-7 sm:h-9 px-2 text-[10px] sm:text-xs">
                <span className="truncate">{t("shopkeeper.dashboard.viewAnalytics")}</span>
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}
