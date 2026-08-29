"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Search, SlidersHorizontal, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { OfferCard, OfferCardGrid, type OfferCardData } from "@/components/offers/offer-card"
import { getAllServices, type ServiceListItem } from "@/lib/actions/services"
import { getLiveOffers, type PublicOfferListItem } from "@/lib/actions/offers"
import type { OfferActionType } from "@/lib/offer-constants"
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
  verified: boolean
  badges: string[]
  actionType: OfferActionType
}

function toServiceCard(s: ServiceListItem): FeedCard {
  return {
    id: s.serviceId, kind: "service", title: s.title, image: s.image, providerName: s.providerName, providerAvatar: s.providerAvatar,
    categoryId: s.categoryId, categoryName: s.categoryName, rating: s.rating, reviewCount: s.reviewCount, price: s.price,
    responseTime: s.responseTime, location: s.location, status: s.status, verified: s.verified, badges: s.badges,
    // A plain Service predates the Offer model's action types; booking is the
    // only thing a customer can do with one, so it maps to BOOK.
    actionType: "BOOK",
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
    responseTime: null, location: o.location, status: null, verified: o.verified,
    // "Verified" is no longer a chip: the card renders it as a tick beside the
    // provider name, which leaves the chip row for what the offer actually is.
    badges: [isRental ? "Rental" : "Saji Pro Offer", o.categoryName].filter((b): b is string => Boolean(b)),
    actionType: o.actionType,
  }
}

export default function MoreServicesPage() {
  const { t, formatMoney } = useLocalization()
  const STATUS_LABEL: Record<ServiceListItem["status"], string> = {
    available: t("customer.services.statusAvailable"),
    busy: t("customer.services.statusBusy"),
    booked: t("customer.services.statusBookedToday"),
  }
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

  // The card is a real <Link> now rather than an onClick, so this returns the
  // destination instead of pushing it: middle-click and "open in new tab"
  // work, and the browser shows the URL on hover.
  const cardHref = (card: FeedCard): string => {
    if (card.kind === "offer") return `/customer/offers/${card.id}`
    if (card.kind === "rental") return `/customer/rentals/${card.id}`
    return card.categoryId ? `/customer/services/${card.categoryId}` : "/customer/services"
  }

  const toCardData = (card: FeedCard): OfferCardData => ({
    id: card.id,
    href: cardHref(card),
    title: card.title,
    image: card.image,
    providerName: card.providerName,
    providerAvatar: card.providerAvatar,
    verified: card.verified,
    rating: card.rating,
    reviewCount: card.reviewCount,
    location: card.location,
    tags: card.badges,
    price: card.price,
    // Services quote an hourly rate and rentals a daily one, so both are a
    // floor rather than the final figure. A fixed-price offer is not.
    priceIsFrom: card.kind !== "offer",
    priceSuffix: card.kind === "rental" ? "/day" : card.kind === "service" ? t("customer.favorites.perHour") : null,
    responseTime: card.responseTime,
    availabilityLabel: card.status ? STATUS_LABEL[card.status] : null,
    actionType: card.actionType,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 lg:px-6">
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
          <OfferCardGrid>
            {filteredCards.map((card) => (
              <OfferCard
                key={`${card.kind}-${card.id}`}
                data={toCardData(card)}
                isFavorite={favorites.includes(card.id)}
                onToggleFavorite={card.kind === "service" ? toggleFavorite : undefined}
              />
            ))}
          </OfferCardGrid>
        )}
      </div>
    </div>
  )
}
