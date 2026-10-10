"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { ArrowLeft, MapPin, Phone, Star, Loader2, Package, AlertTriangle } from "lucide-react"
import { getLocationDetail, type DistributorLocationDetail } from "@/backend/actions/distributor-locations"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

const TYPE_LABEL_KEY: Record<string, "distributor.locations.typeWarehouse" | "distributor.locations.typeRetailStore" | "distributor.locations.typeWholesaler" | "distributor.locations.typeDistributor"> = {
  WAREHOUSE: "distributor.locations.typeWarehouse",
  RETAIL_STORE: "distributor.locations.typeRetailStore",
  WHOLESALER: "distributor.locations.typeWholesaler",
  DISTRIBUTOR: "distributor.locations.typeDistributor",
}

export default function DistributorLocationDetailPage() {
  const { t } = useLocalization()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [location, setLocation] = useState<DistributorLocationDetail>(null)

  useEffect(() => {
    getLocationDetail(params.id).then(setLocation).finally(() => setIsLoading(false))
  }, [params.id])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!location) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-gray-600 dark:text-gray-400">{t("distributor.locationDetail.notFound")}</p>
        <Link href="/distributor/locations"><Button variant="outline">{t("distributor.locationDetail.backToLocations")}</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => router.push("/distributor/locations")} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> {t("distributor.locationDetail.backToLocations")}
        </button>

        <Card className="p-6 border-0 shadow-lg mb-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{location.name}</h1>
                {location.isPrimary && <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{TYPE_LABEL_KEY[location.type] ? t(TYPE_LABEL_KEY[location.type]) : location.type}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${location.isActive ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"}`}>
              {location.isActive ? t("distributor.common.active") : t("distributor.common.inactive")}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 text-xs text-gray-600 dark:text-gray-400 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{[location.address, location.city].filter(Boolean).join(", ")}</div>
            {location.phone && <div className="flex items-center gap-1.5"><Phone className="w-4 h-4" />{location.phone}</div>}
          </div>
        </Card>

        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="p-6 pb-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">{t("distributor.locationDetail.inventoryTitle")}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t("distributor.locationDetail.inventorySubtitle")}</p>
          </div>
          {location.inventory.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("distributor.locationDetail.noStockYet")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("distributor.locationDetail.productColumn")}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("distributor.locationDetail.skuColumn")}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("distributor.locationDetail.stockColumn")}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {location.inventory.map((item) => {
                    const isLow = item.currentStock <= item.lowStockThreshold
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-6 py-4 text-xs font-medium text-gray-900 dark:text-white">{item.productName}</td>
                        <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">{item.sku}</td>
                        <td className="px-6 py-4 text-xs text-gray-900 dark:text-white">{item.currentStock} {item.unit ?? ""}</td>
                        <td className="px-6 py-4">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="w-3 h-3" /> {t("distributor.locationDetail.lowStock")}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">{t("distributor.locationDetail.inStock")}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
