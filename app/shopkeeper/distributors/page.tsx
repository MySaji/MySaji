"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Truck, Search, Loader2, Star, Warehouse, Package } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { browseDistributors, type BuyerDistributorSummary } from "@/lib/actions/wholesale-orders"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ShopkeeperDistributorsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [distributors, setDistributors] = useState<BuyerDistributorSummary[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    browseDistributors().then(setDistributors).finally(() => setIsLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return distributors
    return distributors.filter((d) => d.companyName.toLowerCase().includes(q))
  }, [distributors, search])

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" />
          {t("shopkeeper.distributors.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("shopkeeper.distributors.subtitle")}</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("shopkeeper.distributors.searchPlaceholder")} className="pl-9 h-11 rounded-xl" />
      </div>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">{search ? t("shopkeeper.distributors.noMatchSearch") : t("shopkeeper.distributors.noDistributorsYet")}</p>
          {!search && <p className="text-sm text-muted-foreground mt-1">{t("shopkeeper.distributors.checkBackHint")}</p>}
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((d) => (
            <Link key={d.id} href={`/shopkeeper/distributors/${d.id}`}>
              <Card className="overflow-hidden border border-border hover:shadow-md transition-shadow rounded-2xl h-full">
                <div className="relative h-32 bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center">
                  {d.logoUrl ? (
                    <Image src={d.logoUrl} alt={d.companyName} fill className="object-cover" />
                  ) : (
                    <Truck className="w-10 h-10 text-white/70" />
                  )}
                </div>
                <div className="p-3">
                  <h4 className="font-semibold text-foreground text-sm truncate">{d.companyName}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-3 h-3 ${i < Math.floor(d.rating) ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">{d.reviewCount}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Warehouse className="w-3 h-3" />{d.locationCount}</span>
                    <span className="flex items-center gap-1"><Package className="w-3 h-3" />{d.productCount}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
