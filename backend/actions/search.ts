"use server"

import { db } from "@/backend/db"
import { OFFER_ACTION_LABEL } from "@/backend/domain/offer-constants"
import { distanceFrom, sortByDistance, toCoordinates } from "@/backend/domain/geo"
import { getMyLocationOrigin } from "@/backend/actions/geo"

export type SearchProductResult = {
  id: string
  name: string
  image: string | null
  price: number
  discountPrice: number | null
  shopName: string
}

export type SearchServiceResult = {
  serviceId: string
  title: string
  image: string | null
  providerName: string
  rating: number
  price: number
}

export type SearchShopResult = {
  id: string
  name: string
  image: string | null
  rating: number
  /** Straight-line km from the searcher, so matches they can actually reach
   *  come first. Null when either side is unlocated. */
  distanceKm: number | null
}

export type SearchOfferResult = {
  offerId: string
  title: string
  image: string | null
  providerName: string
  actionLabel: string
  price: number | null
}

export type SearchRentalResult = {
  rentalId: string
  title: string
  image: string | null
  providerName: string
  pricePerDay: number
}

export type UnifiedSearchResult = {
  products: SearchProductResult[]
  services: SearchServiceResult[]
  shops: SearchShopResult[]
  offers: SearchOfferResult[]
  rentals: SearchRentalResult[]
}

const RESULTS_PER_ENTITY = 6

/** Cross-entity search — the home hero's search bar previously only ever
 * searched Services (routing to /customer/services?search=...); Products
 * and Shops had no unified entry point at all. Reuses the same
 * `OR: [{ field: { contains, mode: "insensitive" } }]` pattern
 * lib/actions/products.ts already established, extended to Service and
 * ShopkeeperProfile. No new DB indexes — every existing search action in
 * this codebase accepts the same full-scan tradeoff at current scale. */
export async function unifiedSearch(query: string): Promise<UnifiedSearchResult> {
  const q = query.trim()
  if (!q) return { products: [], services: [], shops: [], offers: [], rentals: [] }

  // Resolved alongside the queries rather than before them — it is one
  // indexed lookup and must not add a serial round trip to a search.
  const [origin, [products, services, shops, offerRows]] = await Promise.all([
    getMyLocationOrigin(),
    Promise.all([
    db.product.findMany({
      where: {
        isActive: true,
        OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }],
      },
      include: { shopkeeper: { select: { shopName: true } } },
      take: RESULTS_PER_ENTITY,
    }),
    db.service.findMany({
      where: {
        isActive: true,
        approvalStatus: "APPROVED",
        OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }],
      },
      include: { provider: { include: { user: { select: { name: true } } } } },
      take: RESULTS_PER_ENTITY,
    }),
    db.shopkeeperProfile.findMany({
      where: {
        OR: [
          { shopName: { contains: q, mode: "insensitive" } },
          { shopDescription: { contains: q, mode: "insensitive" } },
          { shopCategory: { contains: q, mode: "insensitive" } },
        ],
      },
      take: RESULTS_PER_ENTITY,
    }),
    // One query covers both offers and rentals now that rental listings are
    // just RENT-actionType Offer rows — split into the two result arrays
    // below rather than a second DB round-trip.
    db.offer.findMany({
      where: {
        status: "LIVE",
        OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }],
      },
      include: { provider: { include: { user: { select: { name: true } } } } },
      take: RESULTS_PER_ENTITY * 2,
    }),
  ])])

  const offers = offerRows.filter((o) => o.actionType !== "RENT").slice(0, RESULTS_PER_ENTITY)
  const rentals = offerRows.filter((o) => o.actionType === "RENT").slice(0, RESULTS_PER_ENTITY)

  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.images[0] ?? null,
      price: Number(p.price),
      discountPrice: p.discountPrice != null ? Number(p.discountPrice) : null,
      shopName: p.shopkeeper.shopName,
    })),
    services: services.map((s) => ({
      serviceId: s.id,
      title: s.title,
      image: s.images[0] ?? null,
      providerName: s.provider.user.name,
      rating: Number(s.rating),
      price: Number(s.basePrice),
    })),
    // Nearest matching shop first — a name match 400 km away is almost never
    // the one the searcher meant. Unlocated shops keep their relevance order
    // at the end rather than being dropped.
    shops: sortByDistance(shops.map((s) => ({
      id: s.id,
      name: s.shopName,
      image: s.shopLogoUrl,
      rating: Number(s.rating),
      distanceKm: distanceFrom(origin, toCoordinates(s.latitude, s.longitude)),
    }))),
    offers: offers.map((o) => ({
      offerId: o.id,
      title: o.title,
      image: o.images[0] ?? null,
      providerName: o.provider.user.name,
      actionLabel: OFFER_ACTION_LABEL[o.actionType as keyof typeof OFFER_ACTION_LABEL],
      price: o.price != null ? Number(o.price) : null,
    })),
    rentals: rentals.map((r) => ({
      rentalId: r.id,
      title: r.title,
      image: r.images[0] ?? null,
      providerName: r.provider.user.name,
      pricePerDay: Number(r.price ?? 0),
    })),
  }
}
