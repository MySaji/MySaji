"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, TrendingUp } from "lucide-react"
import { getCompanyRevenue, type CompanyRevenueResult } from "@/lib/actions/provider-business"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function CompanyRevenuePage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<CompanyRevenueResult>({ isBusinessOwner: false })

  useEffect(() => {
    getCompanyRevenue().then(setData).finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center gap-4 max-w-4xl mx-auto min-w-0">
          <Link href="/provider/business/dashboard" className="lg:hidden flex-shrink-0">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{t("provider.business.revenue.title")}</h1>
            <p className="text-blue-100 text-xs truncate">{t("provider.business.revenue.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-4xl mx-auto space-y-4">
        {!data.isBusinessOwner ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
            {t("provider.business.staff.notBusinessAccount")}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-5 border dark:border-gray-700 min-w-0">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">{t("provider.business.revenue.thisMonth")}</p>
                <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(data.totalThisMonth)}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-5 border dark:border-gray-700 min-w-0">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">{t("provider.business.revenue.allTime")}</p>
                <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(data.totalAllTime)}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> {t("provider.business.revenue.breakdownTitle")}
              </h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">{t("provider.business.revenue.breakdownNote")}</p>
              <div className="space-y-2">
                {data.members.map((m) => (
                  <div key={m.providerId} className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-900 dark:text-white font-medium truncate">{m.name}</span>
                      {m.isOwner && <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">({t("provider.business.dashboard.ownerBadge")})</span>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(m.totalEarned)}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatMoney(m.earnedThisMonth)} {t("provider.business.revenue.thisMonthSuffix")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
