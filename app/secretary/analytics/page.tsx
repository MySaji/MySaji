"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Download, ArrowUpRight, Loader2 } from "lucide-react"
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { getSecretaryAnalytics, getSecretaryRevenueTrend, type SecretaryAnalytics, type SecretaryRevenueTrend } from "@/backend/actions/secretary-analytics"
import { getYearOptions, MONTH_OPTIONS } from "@/backend/domain/revenue-period-options"

const COLORS = ["#2563eb", "#0891b2", "#6366f1", "#a3a3a3", "#f59e0b"]
const CURRENT_YEAR = new Date().getFullYear()

export default function SecretaryAnalyticsPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<SecretaryAnalytics | null>(null)
  const yearOptions = useMemo(() => getYearOptions(), [])
  const [draftYear, setDraftYear] = useState(CURRENT_YEAR)
  const [draftMonth, setDraftMonth] = useState<number | "">("")
  const [appliedYear, setAppliedYear] = useState(CURRENT_YEAR)
  const [appliedMonth, setAppliedMonth] = useState<number | undefined>(undefined)
  const [revenueTrend, setRevenueTrend] = useState<SecretaryRevenueTrend | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(true)

  const load = useCallback(async () => {
    const result = await getSecretaryAnalytics()
    setData(result)
    setIsLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setRevenueLoading(true)
    getSecretaryRevenueTrend({ year: appliedYear, month: appliedMonth }).then((result) => {
      setRevenueTrend(result)
      setRevenueLoading(false)
    })
  }, [appliedYear, appliedMonth])

  const applyRevenueFilter = () => {
    setAppliedYear(draftYear)
    setAppliedMonth(draftMonth === "" ? undefined : draftMonth)
  }

  const handleExport = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `secretary-analytics-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const metrics = [
    { label: t("secretary.analytics.statTotalTransactions"), value: data.metrics.totalTransactions.toLocaleString() },
    { label: t("secretary.analytics.statTransactionVolume"), value: formatMoney(data.metrics.transactionVolume) },
    { label: t("secretary.analytics.statAvgTransaction"), value: formatMoney(data.metrics.avgTransaction) },
    { label: t("secretary.analytics.statSuccessRate"), value: `${data.metrics.successRatePct}%` },
  ]

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("secretary.analytics.title")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("secretary.analytics.subtitle")}</p>
        </div>
        <Button size="sm" onClick={handleExport} className="bg-blue-600 hover:bg-blue-700 gap-1.5 text-[11px]">
          <Download size={14} />
          {t("secretary.analytics.export")}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m, i) => (
          <Card key={i} className="p-4">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">{m.label}</p>
            <p className="text-lg lg:text-xl font-bold text-gray-900 dark:text-white">{m.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 lg:p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">{t("secretary.analytics.revenueTrendTitle")}</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{revenueTrend?.periodLabel ?? ""}</p>
          </div>
        </div>
        <div className="flex items-end justify-center gap-2 mb-4 flex-wrap">
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">{t("secretary.analytics.yearLabel")}</label>
            <select
              value={draftYear}
              onChange={(e) => setDraftYear(Number(e.target.value))}
              className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">{t("secretary.analytics.monthLabel")}</label>
            <select
              value={draftMonth}
              onChange={(e) => setDraftMonth(e.target.value === "" ? "" : Number(e.target.value))}
              className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t("secretary.analytics.wholeYear")}</option>
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <Button onClick={applyRevenueFilter} className="bg-blue-600 hover:bg-blue-700 h-[38px]">
            {t("secretary.analytics.applyFilter")}
          </Button>
        </div>
        <div className="h-64 lg:h-80">
          {revenueLoading || !revenueTrend ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueTrend.chart}>
              <defs>
                <linearGradient id="secRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={appliedMonth !== undefined ? 3 : 0} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid #e5e7eb" }} formatter={(val: number) => [formatMoney(val), t("secretary.analytics.revenueTooltipLabel")]} />
              <Area type="monotone" dataKey="revenue" name={t("secretary.analytics.revenueTooltipLabel")} stroke="#2563eb" strokeWidth={2} fill="url(#secRevGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 lg:p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("secretary.analytics.paymentChannelsTitle")}</h2>
          {data.channelBreakdown.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.analytics.noCompletedPayments")}</p>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.channelBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                      {data.channelBreakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number, name: string) => [`${val}%`, name]} contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {data.channelBreakdown.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-700 dark:text-gray-300">{c.name}</span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">{formatMoney(c.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-4 lg:p-6">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("secretary.analytics.weeklyTransactionsTitle")}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weeklyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="transactions" name={t("secretary.analytics.transactionsLabel")} fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4 lg:p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("secretary.analytics.topEarningAccountsTitle")}</h2>
        {data.topAccounts.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t("secretary.analytics.noEarningsRecorded")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400 text-[11px]">{t("secretary.analytics.colAccount")}</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400 text-[11px]">{t("secretary.analytics.colType")}</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-400 text-[11px]">{t("secretary.analytics.colTotalEarned")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topAccounts.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">{row.name}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${row.role === "SHOPKEEPER" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"}`}>
                        {row.role.charAt(0) + row.role.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-gray-900 dark:text-white flex items-center justify-end gap-1">
                      {formatMoney(row.earnings)}
                      <ArrowUpRight size={12} className="text-emerald-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
