"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search, SlidersHorizontal, MapPin, Clock, Star, Heart, CalendarDays, Loader2, Crown, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { getAllServices, type ServiceListItem } from "@/lib/actions/services"
import { getLiveOffers, type PublicOfferListItem } from "@/lib/actions/offers"
import { OFFER_ACTION_LABEL } from "@/lib/offer-constants"
import { getWishlistIds, toggleWishlist } from "@/lib/actions/wishlist"
import { useLocalization } from "@/lib/hooks/useLocalization"

type FeedCard = {
  id: string
  kind: "service" | "offer" | "rental"
  title: string
  image: string | null
  providerName: string
  providerAvatar: string | null
  categoryId: string | null
  categoryName: string | null
  rating: number
  reviewCount: number
  price: number | null
  responseTime: string | null
  location: string
  status: ServiceListItem["status"] | null
  badges: string[]
  actionLabel: string | null
}

function toServiceCard(s: ServiceListItem): FeedCard {
  return {
    id: s.serviceId, kind: "service", title: s.title, image: s.image, providerName: s.providerName, providerAvatar: s.providerAvatar,
    categoryId: s.categoryId, categoryName: s.categoryName, rating: s.rating, reviewCount: s.reviewCount, price: s.price,
    responseTime: s.responseTime, location: s.location, status: s.status, badges: s.badges, actionLabel: null,
  }
}

// RENT-actionType offers are still just Offer rows (see the Offer model's
// doc comment in schema.prisma — RentalListing was folded in here) but read
// as "rental" cards client-side so filtering/badges/routing stay exactly
// what they were when rentals had their own separate fetch.
function toOfferCard(o: PublicOfferListItem): FeedCard {
  const isRental = o.actionType === "RENT"
  return {
    id: o.offerId, kind: isRental ? "rental" : "offer", title: o.title, image: o.image, providerName: o.providerName, providerAvatar: o.providerAvatar,
    categoryId: o.categoryId, categoryName: o.categoryName, rating: o.rating, reviewCount: o.reviewCount, price: o.price,
    responseTime: null, location: o.location, status: null,
    badges: isRental ? (o.verified ? ["Rental", "Verified"] : ["Rental"]) : (o.verified ? ["Saji Pro Offer", "Verified"] : ["Saji Pro Offer"]),
    actionLabel: isRental ? "Rent" : OFFER_ACTION_LABEL[o.actionType],
  }
}

export default function MoreServicesPage() {
  const { t, formatMoney } = useLocalization()
  const STATUS_STYLE: Record<ServiceListItem["status"], { label: string; badge: string }> = {
    available: { label: t("customer.services.statusAvailable"), badge: "bg-emerald-500" },
    busy: { label: t("customer.services.statusBusy"), badge: "bg-red-500" },
    booked: { label: t("customer.services.statusBookedToday"), badge: "bg-amber-500" },
  }
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState("")
  const [cards, setCards] = useState<FeedCard[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Seeded from ?type=<kind> (e.g. a home-page "Rentals" tile) — same
  // one-way-seed convention as the products marketplace's ?category=.
  const initialType = searchParams.get("type")
  const [typeFilter, setTypeFilter] = useState<"all" | "service" | "offer" | "rental">(
    initialType === "service" || initialType === "offer" || initialType === "rental" ? initialType : "all",
  )

  useEffect(() => {
    Promise.all([getAllServices(), getLiveOffers(), getWishlistIds("SERVICE")])
      .then(([serviceList, offerList, wishlistIds]) => {
        setCards([...serviceList.map(toServiceCard), ...offerList.map(toOfferCard)])
        setFavorites(wishlistIds)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (typeFilter !== "all" && card.kind !== typeFilter) return false
      const haystack = `${card.title} ${card.providerName} ${card.categoryName ?? ""}`.toLowerCase()
      return haystack.includes(query.toLowerCase())
    })
  }, [cards, query, typeFilter])

  const TYPE_TABS: { key: typeof typeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "service", label: "Services" },
    { key: "offer", label: "Offers" },
    { key: "rental", label: "Rentals" },
  ]

  const toggleFavorite = async (serviceId: string) => {
    setFavorites((prev) => (prev.includes(serviceId) ? prev.filter((value) => value !== serviceId) : [...prev, serviceId]))
    const result = await toggleWishlist({ targetType: "SERVICE", targetId: serviceId })
    if (!result.success) {
      setFavorites((prev) => (prev.includes(serviceId) ? prev.filter((value) => value !== serviceId) : [...prev, serviceId]))
    }
  }

  const openCardDetail = (card: FeedCard) => {
    if (card.kind === "offer") router.push(`/customer/offers/${card.id}`)
    else if (card.kind === "rental") router.push(`/customer/rentals/${card.id}`)
    else if (card.categoryId) router.push(`/customer/services/${card.categoryId}`)
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
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link href="/customer/services">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {typeFilter === "rental" ? "Rentals" : typeFilter === "offer" ? "Offers" : typeFilter === "service" ? "Services" : t("customer.services.moreTitle")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {typeFilter === "rental" ? "Equipment and tools providers have listed for rent" : t("customer.services.moreSubtitle")}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${typeFilter === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("customer.services.searchPlaceholder")} className="pl-10" />
          </div>
          <Button variant="outline" className="gap-2 bg-transparent rounded-xl">
            <SlidersHorizontal className="h-4 w-4" />
            {t("common.filter")}
          </Button>
        </div>

        {filteredCards.length === 0 ? (
          <Card className="border-dashed p-10 text-center">
            <p className="text-lg font-semibold text-foreground">{t("customer.services.noMatch")}</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCards.map((card) => (
              <Card key={`${card.kind}-${card.id}`} className="cursor-pointer overflow-hidden border border-border/70 bg-card/80 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg" onClick={() => openCardDetail(card)}>
                <div className="relative aspect-[16/10] bg-muted/30">
                  <Image src={card.kind !== "service" ? (card.image || card.providerAvatar || "/placeholder.svg") : (card.providerAvatar || "/placeholder.svg")} alt={card.title} fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  {card.kind === "service" && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleFavorite(card.id)
                      }}
                      className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow-sm"
                    >
                      <Heart className={`h-4 w-4 ${favorites.includes(card.id) ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
                    </button>
                  )}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    {card.status && (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${STATUS_STYLE[card.status].badge}`}>
                        {STATUS_STYLE[card.status].label}
                      </span>
                    )}
                    {card.kind === "offer" && (
                      <span className="ml-auto flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                        <Crown className="h-3 w-3" /> Saji Pro
                      </span>
                    )}
                    {card.kind === "rental" && (
                      <span className="ml-auto flex items-center gap-1 rounded-full bg-gradient-to-r from-sky-600 to-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                        <Package className="h-3 w-3" /> Rental
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-foreground">{card.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{card.providerName}</p>
                    </div>
                    {card.price != null && <div className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">{formatMoney(card.price)}{card.kind === "rental" && <span className="font-normal">/day</span>}</div>}
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-medium text-foreground">{card.rating.toFixed(1)}</span>
                      <span>({card.reviewCount})</span>
                    </div>
                    {card.responseTime && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {card.responseTime}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {card.badges.map((badge) => (
                      <span key={badge} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{badge}</span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {card.location}
                    </div>
                    <Button size="sm" className="rounded-full" onClick={(event) => {
                      event.stopPropagation()
                      openCardDetail(card)
                    }}>
                      <CalendarDays className="mr-1 h-4 w-4" />
                      {card.actionLabel ?? t("common.viewDetails")}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
