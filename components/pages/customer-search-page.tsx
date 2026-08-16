"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Card } from "@/components/ui/card"
import { Search, Star, Loader2, Package, Wrench, Store, Crown } from "lucide-react"
import { unifiedSearch, type UnifiedSearchResult } from "@/lib/actions/search"
import { useLocalization } from "@/lib/hooks/useLocalization"

const EMPTY_RESULT: UnifiedSearchResult = { products: [], services: [], shops: [], offers: [], rentals: [] }

export function CustomerSearchPage() {
  const { t, formatMoney } = useLocalization()
  const searchParams = useSearchParams()
  const query = searchParams.get("q") ?? ""
  const [result, setResult] = useState<UnifiedSearchResult>(EMPTY_RESULT)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!query.trim()) { setResult(EMPTY_RESULT); setIsLoading(false); return }
    setIsLoading(true)
    unifiedSearch(query).then(setResult).finally(() => setIsLoading(false))
  }, [query])

  const hasAnyResults = result.products.length > 0 || result.services.length > 0 || result.shops.length > 0 || result.offers.length > 0 || result.rentals.length > 0

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8">
        <div className="mb-6 flex items-center gap-2">
          <Search className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">{t("customer.search.resultsFor", { query })}</h1>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !hasAnyResults ? (
          <Card className="p-8 text-center border-0 shadow-sm">
            <p className="text-sm text-muted-foreground">{t("customer.search.noResults")}</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {result.products.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground mb-3">
                  <Package className="w-4 h-4 text-primary" /> {t("customer.search.productsSection")}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.products.map((p) => (
                    <Link key={p.id} href={`/customer/products/${p.id}`}>
                      <Card className="p-0 overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
                        <div className="relative aspect-square bg-muted">
                          <Image src={p.image || "/placeholder.svg"} alt={p.name} fill className="object-cover" />
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.shopName}</p>
                          <p className="text-sm font-semibold text-foreground mt-1">{formatMoney(p.discountPrice ?? p.price)}</p>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {result.services.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground mb-3">
                  <Wrench className="w-4 h-4 text-primary" /> {t("customer.search.servicesSection")}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.services.map((s) => (
                    <Link key={s.serviceId} href={`/customer/services/${s.serviceId}`}>
                      <Card className="p-0 overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
                        <div className="relative aspect-square bg-muted">
                          <Image src={s.image || "/placeholder.svg"} alt={s.title} fill className="object-cover" />
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{s.providerName}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-sm font-semibold text-foreground">{formatMoney(s.price)}</span>
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{s.rating.toFixed(1)}</span>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {result.offers.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground mb-3">
                  <Crown className="w-4 h-4 text-amber-500" /> Saji Pro Offers
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.offers.map((o) => (
                    <Link key={o.offerId} href={`/customer/offers/${o.offerId}`}>
                      <Card className="p-0 overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
                        <div className="relative aspect-square bg-muted">
                          <Image src={o.image || "/placeholder.svg"} alt={o.title} fill className="object-cover" />
                          <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                            <Crown className="w-2.5 h-2.5" /> Pro
                          </span>
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium text-foreground truncate">{o.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{o.providerName}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-sm font-semibold text-foreground">{o.price != null ? formatMoney(o.price) : o.actionLabel}</span>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {result.rentals.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground mb-3">
                  <Package className="w-4 h-4 text-sky-600" /> Rentals
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.rentals.map((r) => (
                    <Link key={r.rentalId} href={`/customer/rentals/${r.rentalId}`}>
                      <Card className="p-0 overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
                        <div className="relative aspect-square bg-muted">
                          <Image src={r.image || "/placeholder.svg"} alt={r.title} fill className="object-cover" />
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.providerName}</p>
                          <p className="text-sm font-semibold text-foreground mt-1">{formatMoney(r.pricePerDay)}<span className="text-xs font-normal text-muted-foreground">/day</span></p>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {result.shops.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground mb-3">
                  <Store className="w-4 h-4 text-primary" /> {t("customer.search.shopsSection")}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {result.shops.map((s) => (
                    <Link key={s.id} href={`/customer/shops/${s.id}`}>
                      <Card className="p-3 flex items-center gap-3 border-0 shadow-sm hover:shadow-md transition-shadow">
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          <Image src={s.image || "/placeholder.svg"} alt={s.name} fill className="object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{s.rating.toFixed(1)}</span>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
