"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { BarChart3, TrendingUp, TrendingDown, Users, DollarSign, Calendar, Download, FileText, ShoppingCart, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { getDistributorAnalytics, type DistributorAnalytics, type DistributorAnalyticsRange } from "@/lib/actions/distributor-analytics"
import { useLocalization } from "@/lib/hooks/useLocalization"

const LOCATION_COLORS = ["#0d9488", "#2563eb", "#059669", "#7c3aed", "#dc2626", "#0891b2"]

const STATUS_LABEL_KEY: Record<string, "distributor.common.statusPending" | "distributor.common.statusProcessing" | "distributor.common.statusShipped" | "distributor.common.statusDelivered" | "distributor.common.statusRefunded"> = {
  PENDING: "distributor.common.statusPending",
  PROCESSING: "distributor.common.statusProcessing",
  SHIPPED: "distributor.common.statusShipped",
  DELIVERED: "distributor.common.statusDelivered",
  REFUNDED: "distributor.common.statusRefunded",
}

export default function DistributorAnalyticsPage() {
  const { t, formatMoney } = useLocalization()

  const RANGE_LABEL: Record<DistributorAnalyticsRange, string> = {
    "7d": t("distributor.analytics.rangeLast7Days"),
    "30d": t("distributor.analytics.rangeLast30Days"),
    "90d": t("distributor.analytics.rangeLast90Days"),
    "year": t("distributor.analytics.rangeThisYear"),
  }
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DistributorAnalyticsRange>("7d")
  const [data, setData] = useState<DistributorAnalytics>(null)
  const [showExportModal, setShowExportModal] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    getDistributorAnalytics(dateRange).then(setData).finally(() => setIsLoading(false))
  }, [dateRange])

  const handleExportCsv = () => {
    if (!data) return
    const rows = [
      ["Report", RANGE_LABEL[dateRange]],
      [],
      ["Metric", "Value"],
      ["Total Revenue", data.totalRevenue],
      ["Total Orders", data.totalOrders],
      ["Avg Order Value", data.avgOrderValue.toFixed(2)],
      ["Total Buyers", data.totalBuyers],
      [],
      ["Top Products", "Units Sold", "Revenue"],
      ...data.topProducts.map((p) => [p.name, p.sales, p.revenue]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `distributor-analytics-${dateRange}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const kpis = [
    { label: t("distributor.analytics.kpiTotalRevenue"), value: formatMoney(data.totalRevenue), change: data.revenueChangePct, icon: DollarSign, color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" },
    { label: t("distributor.analytics.kpiTotalOrders"), value: String(data.totalOrders), change: data.ordersChangePct, icon: ShoppingCart, color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
    { label: t("distributor.analytics.kpiAvgOrderValue"), value: formatMoney(data.avgOrderValue), change: data.avgOrderValueChangePct, icon: BarChart3, color: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
    { label: t("distributor.analytics.kpiBuyers"), value: String(data.totalBuyers), change: data.buyersChangePct, icon: Users, color: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400" },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("distributor.analytics.title")}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("distributor.analytics.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-teal-600" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DistributorAnalyticsRange)}
                className="bg-transparent text-xs outline-none text-gray-700 dark:text-gray-200"
              >
                <option value="7d">{t("distributor.analytics.rangeLast7Days")}</option>
                <option value="30d">{t("distributor.analytics.rangeLast30Days")}</option>
                <option value="90d">{t("distributor.analytics.rangeLast90Days")}</option>
                <option value="year">{t("distributor.analytics.rangeThisYear")}</option>
              </select>
            </div>
            <Button onClick={() => setShowExportModal(true)} className="bg-teal-600 hover:bg-teal-700 gap-2 text-xs h-9">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t("distributor.analytics.exportButton")}</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          {kpis.map((kpi, idx) => {
            const Icon = kpi.icon
            const isUp = kpi.change >= 0
            return (
              <Card key={idx} className="p-4 lg:p-5 border-0 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${kpi.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${isUp ? "text-emerald-600" : "text-red-500"}`}>
                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(kpi.change)}%
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{kpi.label}</p>
                <p className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white mt-0.5">{kpi.value}</p>
              </Card>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="lg:col-span-2 p-4 lg:p-5 border-0 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t("distributor.analytics.revenueTrend")}</h2>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{RANGE_LABEL[dateRange]}</span>
            </div>
            <div className="h-64 lg:h-72">
              {data.revenueTrend.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">{t("distributor.analytics.noOrdersInPeriod")}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip
                      formatter={(value: number) => [formatMoney(value), t("distributor.analytics.revenueTooltipLabel")]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="p-4 lg:p-5 border-0 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{t("distributor.analytics.revenueByLocation")}</h2>
            {data.locationBreakdown.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-gray-400">{t("distributor.analytics.noSalesYet")}</div>
            ) : (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.locationBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {data.locationBreakdown.map((entry, index) => (
                          <Cell key={entry.name} fill={LOCATION_COLORS[index % LOCATION_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [formatMoney(value), t("distributor.analytics.salesTooltipLabel")]} contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {data.locationBreakdown.map((loc, index) => (
                    <div key={loc.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LOCATION_COLORS[index % LOCATION_COLORS.length] }} />
                        <span className="text-gray-700 dark:text-gray-300">{loc.name}</span>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">{loc.percent}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <Card className="p-4 lg:p-5 border-0 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t("distributor.analytics.monthlyRevenue")}</h2>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{t("distributor.analytics.last6Months")}</span>
            </div>
            <div className="h-56 lg:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyRevenue} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    formatter={(value: number) => [formatMoney(value), t("distributor.analytics.revenueTooltipLabel")]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4 lg:p-5 border-0 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t("distributor.analytics.ordersByStatus")}</h2>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{RANGE_LABEL[dateRange]}</span>
            </div>
            <div className="h-56 lg:h-64">
              {data.statusBreakdown.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">{t("distributor.analytics.noOrdersInPeriod")}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.statusBreakdown.map((s) => ({ name: STATUS_LABEL_KEY[s.status] ? t(STATUS_LABEL_KEY[s.status]) : s.status, count: s.count }))}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="#9ca3af" width={70} />
                    <Tooltip
                      formatter={(value: number) => [value.toLocaleString(), t("distributor.analytics.ordersTooltipLabel")]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>

        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="p-4 lg:p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t("distributor.analytics.topPerformingProducts")}</h2>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">{t("distributor.analytics.allTimeByUnitsSold")}</span>
          </div>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-12">{t("distributor.analytics.noSalesYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 lg:px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("distributor.analytics.colRank")}</th>
                    <th className="text-left px-4 lg:px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("distributor.analytics.colProduct")}</th>
                    <th className="text-left px-4 lg:px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("distributor.analytics.colUnitsSold")}</th>
                    <th className="text-left px-4 lg:px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("distributor.analytics.colRevenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((product, idx) => (
                    <tr key={product.name} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 lg:px-5 py-3">
                        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-cyan-700 text-white text-[11px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 lg:px-5 py-3 text-xs font-medium text-gray-900 dark:text-white">{product.name}</td>
                      <td className="px-4 lg:px-5 py-3 text-xs text-gray-600 dark:text-gray-400">{product.sales}</td>
                      <td className="px-4 lg:px-5 py-3 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(product.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("distributor.analytics.exportModalTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <button
              onClick={handleExportCsv}
              className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left flex items-center gap-3"
            >
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-medium text-xs text-gray-900 dark:text-white">{t("distributor.analytics.csvFileLabel")}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("distributor.analytics.csvFileDesc")}</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
