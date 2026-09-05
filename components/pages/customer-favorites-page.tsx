"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Heart, Star, CheckCircle, Briefcase, X, Loader2, Store } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { getWishlistedProviders, getWishlistedShops, toggleWishlist, type WishlistedProvider, type WishlistedShop } from "@/lib/actions/wishlist"
import { useLocalization } from "@/lib/hooks/useLocalization"

export function CustomerFavoritesPage() {
  const { t, tn, formatMoney } = useLocalization()
  const [favorites, setFavorites] = useState<WishlistedProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastRemoved, setLastRemoved] = useState<WishlistedProvider | null>(null)
  // Shops are a separate wishlist target from providers, so they load and
  // unsave independently of the list above.
  const [savedShops, setSavedShops] = useState<WishlistedShop[]>([])

  useEffect(() => {
    Promise.all([getWishlistedProviders(), getWishlistedShops()])
      .then(([providers, shops]) => {
        setFavorites(providers)
        setSavedShops(shops)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const removeShop = async (id: string) => {
    const previous = savedShops
    setSavedShops((prev) => prev.filter((s) => s.id !== id))
    const result = await toggleWishlist({ targetType: "SHOP", targetId: id })
    if (!result.success) setSavedShops(previous)
  }

  const removeFavorite = async (id: string) => {
    const fav = favorites.find((f) => f.id === id)
    if (!fav) return
    setLastRemoved(fav)
    setFavorites((prev) => prev.filter((f) => f.id !== id))
    await toggleWishlist({ targetType: "PROVIDER", targetId: id })
  }

  const restoreFavorite = async () => {
    if (!lastRemoved) return
    setFavorites((prev) => [...prev, lastRemoved])
    setLastRemoved(null)
    await toggleWishlist({ targetType: "PROVIDER", targetId: lastRemoved.id })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-bold text-foreground flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500" /> {t("customer.favorites.title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{tn("customer.favorites.savedCount", favorites.length)}</p>
        </div>

        {/* Undo bar */}
        {lastRemoved && (
          <div className="flex items-center justify-between bg-muted/50 p-3 rounded-xl mb-4">
            <p className="text-xs text-muted-foreground">{t("customer.favorites.removed", { name: lastRemoved.name })}</p>
            <Button size="sm" variant="ghost" onClick={restoreFavorite} className="gap-1.5 text-[11px]">
              {t("customer.favorites.undo")}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {favorites.length > 0 ? favorites.map(provider => (
            <Card key={provider.id} className="p-4 border-0 shadow-sm hover:shadow-md transition-all group">
              <div className="flex gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-border group-hover:ring-primary/30 transition-all">
                    <Image src={provider.avatar || "/placeholder.svg"} alt={provider.name} width={64} height={64} className="object-cover" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-foreground">{provider.name}</h3>
                      {provider.verified && (
                        <span className="bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <CheckCircle className="w-3 h-3 text-blue-600 fill-blue-600" />
                          <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">{t("customer.favorites.verified")}</span>
                        </span>
                      )}
                    </div>
                    <button onClick={() => removeFavorite(provider.id)} aria-label={t("customer.products.removeFromWishlist")} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{provider.bio || t("customer.favorites.defaultBio")}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mb-3">
                    <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /><strong className="text-foreground">{provider.rating.toFixed(1)}</strong> ({provider.reviewCount})</span>
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{tn("customer.favorites.jobsCount", provider.completedJobs)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-foreground">{formatMoney(provider.hourlyRate ?? 0)}<span className="text-[11px] font-normal text-muted-foreground">{t("customer.favorites.perHour")}</span></p>
                    <div className="flex gap-2">
                      <Link href={`/customer/find-specialists`}>
                        <Button size="sm" variant="outline" className="rounded-xl bg-transparent text-[11px] h-8">{t("common.viewDetails")}</Button>
                      </Link>
                      <Link href="/customer/services">
                        <Button size="sm" className="rounded-xl text-[11px] h-8">{t("customer.favorites.rebook")}</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )) : (
            <Card className="p-12 text-center border-0 shadow-sm">
              <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Heart className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">{t("customer.favorites.emptyTitle")}</p>
              <p className="text-xs text-muted-foreground mb-4">{t("customer.favorites.emptySubtitle")}</p>
              <Link href="/customer/find-specialists"><Button className="rounded-xl">{t("customer.favorites.findProviders")}</Button></Link>
            </Card>
          )}
        </div>

        {/* Saved shops */}
        {savedShops.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <Store className="h-4 w-4 text-primary" /> {t("customer.favorites.savedShopsTitle")}
            </h2>
            <div className="space-y-3">
              {savedShops.map((shop) => (
                <Card key={shop.id} className="group border-0 p-4 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-muted ring-2 ring-border">
                      <Image src={shop.image || "/placeholder.svg"} alt={shop.name} width={56} height={56} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-bold text-foreground">{shop.name}</h3>
                        {shop.isVerified && <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 fill-blue-600 text-white" />}
                      </div>
                      {shop.category && <p className="truncate text-xs text-muted-foreground">{shop.category}</p>}
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <strong className="text-foreground">{shop.rating.toFixed(1)}</strong> ({shop.reviewCount})
                      </span>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Link href={`/customer/shops/${shop.id}`}>
                        <Button size="sm" className="h-8 rounded-xl text-[11px]">{t("common.viewDetails")}</Button>
                      </Link>
                      <button
                        onClick={() => removeShop(shop.id)}
                        aria-label={t("customer.products.removeFromWishlist")}
                        className="rounded-lg p-1.5 opacity-0 transition-colors hover:bg-red-50 group-hover:opacity-100 dark:hover:bg-red-900/10"
                      >
                        <X className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
