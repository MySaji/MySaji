"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Store, Search, Loader2, Star } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { getAllShops, type HomeFeaturedShop } from "@/lib/actions/home"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function CustomerShopsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [shops, setShops] = useState<HomeFeaturedShop[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    getAllShops().then(setShops).finally(() => setIsLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return shops
    return shops.filter((s) => s.name.toLowerCase().includes(q))
  }, [shops, search])

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="w-6 h-6 text-primary" />
          {t("customer.shops.allShops")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("customer.shops.browseSubtitle")}</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("customer.shops.searchPlaceholder")}
          className="pl-9 h-11 rounded-xl"
        />
      </div>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Store className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">{search ? t("customer.shops.noMatch") : t("customer.shops.noShops")}</p>
          {!search && <p className="text-sm text-muted-foreground mt-1">{t("customer.shops.checkBackSoon")}</p>}
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((shop) => (
            <Link key={shop.id} href={`/customer/shops/${shop.id}`}>
              <Card className="overflow-hidden border border-border hover:shadow-md transition-shadow rounded-2xl h-full">
                <div className="relative h-32">
                  <Image src={shop.image || "/placeholder.svg"} alt={shop.name} fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  {shop.isOpen ? (
                    <Badge className="absolute top-2 left-2 bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 border-0">
                      {t("customer.shops.openNow")}
                    </Badge>
                  ) : shop.hoursLabel ? (
                    <Badge className="absolute top-2 left-2 bg-black/60 hover:bg-black/60 text-white text-[10px] px-1.5 py-0.5 border-0">
                      {t("customer.shops.closed")}
                    </Badge>
                  ) : null}
                  {shop.hasSale && (
                    <Badge className="absolute top-2 right-2 bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 py-0.5 border-0">
                      {t("customer.shops.sale")}
                    </Badge>
                  )}
                </div>
                <div className="p-3">
                  <h4 className="font-semibold text-foreground text-sm truncate">{shop.name}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-3 h-3 ${i < Math.floor(shop.rating) ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">{shop.reviews}</span>
                  </div>
                  {shop.hoursLabel && <p className="text-[10px] text-muted-foreground mt-1 truncate">{shop.hoursLabel}</p>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
