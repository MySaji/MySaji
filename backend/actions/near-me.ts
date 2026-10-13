"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { getMyLocationOrigin } from "@/backend/actions/geo"
import { getAllShops, type HomeFeaturedShop } from "@/backend/actions/home"
import { searchOutward, describeDistance, directionsUrl, NEIGHBOURHOOD_KM } from "@/backend/services/proximity"
import { PUBLIC_SHOP_WHERE } from "@/backend/domain/public-catalog"
import { distanceFrom } from "@/backend/domain/geo"

/**
 * What is actually near the customer.
 *
 * The honest version of "near you". Everything here steps outward from the
 * estate rather than casting one wide net, and says which step answered, so
 * a customer is never shown a shop in another part of the city under a
 * heading that claims it is around the corner.
 *
 * The no-result case is a first-class answer, not an empty list. "There is
 * nobody within 2 km, these are 8 km away" is useful; a blank screen is
 * what makes somebody delete the app.
 */

export type NearbyShop = {
  id: string
  name: string
  image: string | null
  category: string | null
  rating: number
  reviews: number
  isOpen: boolean
  hoursLabel: string | null
  hasSale: boolean
  distanceKm: number | null
  /** "400 m away", "3.2 km away". Null without coordinates on both sides. */
  distanceLabel: string | null
  /** Opens the phone's own map app. Null for a shop with no coordinates. */
  directionsUrl: string | null
  /** For a product search: what this shop has that matched the words. */
  matches?: { id: string; name: string; price: number; image: string | null }[]
}

export type NearbyProvider = {
  id: string
  name: string
  businessName: string | null
  categoryName: string | null
  rating: number
  reviewCount: number
  completedJobs: number
  image: string | null
  slug: string | null
  distanceKm: number | null
  distanceLabel: string | null
  directionsUrl: string | null
  isAvailable: boolean
}

export type NearMeResult<T> = {
  items: T[]
  /** The radius that produced these, in km. */
  radiusKm: number
  band: "NEIGHBOURHOOD" | "NEARBY" | "WIDER" | "FAR" | "NONE"
  widened: boolean
  empty: boolean
  message: string | null
  /** False where the customer has not shared a location at all. */
  located: boolean
}

const EMPTY_UNLOCATED = {
  items: [],
  radiusKm: 0,
  band: "NONE" as const,
  widened: false,
  empty: true,
  located: false,
  message:
    "We do not know where you are yet, so we cannot show what is nearby. Set your location to " +
    "see shops and providers around you.",
}

/**
 * Shops, nearest first, stepping outward until some are found.
 *
 * `minResults` defaults to three because the home page shows a row: one shop
 * in the estate with nothing beside it reads as a broken page, where three a
 * little further out reads as a choice.
 */
export async function getShopsNearMe(input?: unknown): Promise<NearMeResult<NearbyShop>> {
  const parsed = z.object({
    minResults: z.number().int().min(1).max(20).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).safeParse(input ?? {})
  const minResults = (parsed.success ? parsed.data.minResults : undefined) ?? 3
  const limit = (parsed.success ? parsed.data.limit : undefined) ?? 12

  const origin = await getMyLocationOrigin()
  if (!origin) return { ...EMPTY_UNLOCATED, items: [] }

  const search = await searchOutward<HomeFeaturedShop>(
    (radiusKm) => getAllShops({ radiusKm, origin }),
    { minResults, noun: "a shop", distanceOf: (s) => s.distanceKm },
  )

  // Coordinates are not on the shop card type, so they are fetched once for
  // the handful being shown rather than widening a type several other pages
  // already render.
  const shown = search.results.slice(0, limit)
  const coords = shown.length
    ? await db.shopkeeperProfile.findMany({
        where: { id: { in: shown.map((s) => s.id) } },
        select: { id: true, latitude: true, longitude: true },
      })
    : []
  const coordById = new Map(coords.map((c) => [c.id, c]))

  return {
    items: shown.map((shop) => {
      const c = coordById.get(shop.id)
      return {
        id: shop.id,
        name: shop.name,
        image: shop.image,
        category: shop.category,
        rating: shop.rating,
        reviews: shop.reviews,
        isOpen: shop.isOpen,
        hoursLabel: shop.hoursLabel,
        hasSale: shop.hasSale,
        distanceKm: shop.distanceKm,
        distanceLabel: describeDistance(shop.distanceKm),
        directionsUrl:
          c?.latitude != null && c?.longitude != null
            ? directionsUrl({ latitude: Number(c.latitude), longitude: Number(c.longitude) }, shop.name)
            : null,
      }
    }),
    radiusKm: search.radiusKm,
    band: search.band,
    widened: search.widened,
    empty: search.empty,
    message: search.message,
    located: true,
  }
}

/**
 * Providers, the same way.
 *
 * Availability matters more than distance here: a plumber round the corner
 * who is on another job is worse than one two kilometres away who can come
 * now, so the ones who can work are listed first within each step.
 */
export async function getProvidersNearMe(input?: unknown): Promise<NearMeResult<NearbyProvider>> {
  const parsed = z.object({
    categoryId: z.string().trim().min(1).optional(),
    minResults: z.number().int().min(1).max(20).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).safeParse(input ?? {})
  const categoryId = parsed.success ? parsed.data.categoryId : undefined
  const minResults = (parsed.success ? parsed.data.minResults : undefined) ?? 3
  const limit = (parsed.success ? parsed.data.limit : undefined) ?? 12

  const origin = await getMyLocationOrigin()
  if (!origin) return { ...EMPTY_UNLOCATED, items: [] }

  const fetchAt = async (radiusKm: number): Promise<NearbyProvider[]> => {
    // A bounding box first, then an exact measurement: the box is an indexed
    // comparison on two columns, and measuring every provider in the country
    // to throw almost all of them away would not be.
    const latDelta = radiusKm / 111
    const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((origin.latitude * Math.PI) / 180)))

    const rows = await db.providerProfile.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        latitude: { gte: origin.latitude - latDelta, lte: origin.latitude + latDelta },
        longitude: { gte: origin.longitude - lngDelta, lte: origin.longitude + lngDelta },
        user: { isActive: true },
        OR: [{ availability: null }, { availability: { isOnVacation: false } }],
      },
      take: 60,
      select: {
        id: true, businessName: true, rating: true, reviewCount: true, completedJobs: true,
        latitude: true, longitude: true, slug: true,
        user: { select: { name: true, image: true } },
        category: { select: { name: true } },
        availability: { select: { isOnVacation: true } },
      },
    })

    return rows
      .map((p) => {
        const distanceKm =
          p.latitude != null && p.longitude != null
            ? distanceFrom(origin, { latitude: Number(p.latitude), longitude: Number(p.longitude) })
            : null
        return {
          id: p.id,
          name: p.user.name,
          businessName: p.businessName,
          categoryName: p.category?.name ?? null,
          rating: Number(p.rating),
          reviewCount: p.reviewCount,
          completedJobs: p.completedJobs,
          image: p.user.image,
          slug: p.slug,
          distanceKm,
          distanceLabel: describeDistance(distanceKm),
          directionsUrl:
            p.latitude != null && p.longitude != null
              ? directionsUrl({ latitude: Number(p.latitude), longitude: Number(p.longitude) }, p.businessName)
              : null,
          isAvailable: !p.availability?.isOnVacation,
        }
      })
      // The box has corners further away than the radius; this is the circle.
      .filter((p) => p.distanceKm != null && p.distanceKm <= radiusKm)
      .sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1
        return (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
      })
  }

  const search = await searchOutward<NearbyProvider>(fetchAt, {
    minResults,
    noun: categoryId ? "anyone for that" : "a provider",
    distanceOf: (p) => p.distanceKm,
  })

  return {
    items: search.results.slice(0, limit),
    radiusKm: search.radiusKm,
    band: search.band,
    widened: search.widened,
    empty: search.empty,
    message: search.message,
    located: true,
  }
}

/** The neighbourhood radius, for anything that wants to say the number. */
export async function neighbourhoodRadiusKm(): Promise<number> {
  return NEIGHBOURHOOD_KM
}

/** Shops that sell a given thing, nearest first. Used by product search. */
export async function getShopsSellingNearMe(input: unknown): Promise<NearMeResult<NearbyShop>> {
  const parsed = z.object({
    query: z.string().trim().min(1).max(80),
    limit: z.number().int().min(1).max(50).optional(),
  }).safeParse(input)
  if (!parsed.success) return { ...EMPTY_UNLOCATED, items: [], located: true, message: "Search for something first." }

  const origin = await getMyLocationOrigin()
  if (!origin) return { ...EMPTY_UNLOCATED, items: [] }

  const q = parsed.data.query
  const limit = parsed.data.limit ?? 12

  const fetchAt = async (radiusKm: number): Promise<NearbyShop[]> => {
    const latDelta = radiusKm / 111
    const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((origin.latitude * Math.PI) / 180)))

    const shops = await db.shopkeeperProfile.findMany({
      where: {
        ...PUBLIC_SHOP_WHERE,
        latitude: { gte: origin.latitude - latDelta, lte: origin.latitude + latDelta },
        longitude: { gte: origin.longitude - lngDelta, lte: origin.longitude + lngDelta },
        // Only shops that actually have the thing on the shelf. A shop that
        // stocks it but has none left is a wasted journey.
        products: {
          some: {
            isActive: true,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      },
      take: 60,
      select: {
        id: true, shopName: true, shopLogoUrl: true, shopCategory: true,
        rating: true, reviewCount: true, latitude: true, longitude: true,
        openingTime: true, closingTime: true,
        products: {
          where: {
            isActive: true,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 3,
          orderBy: { price: "asc" },
          select: { id: true, name: true, price: true, images: true },
        },
      },
    })

    return shops
      .map((s) => {
        const distanceKm =
          s.latitude != null && s.longitude != null
            ? distanceFrom(origin, { latitude: Number(s.latitude), longitude: Number(s.longitude) })
            : null
        const shop: NearbyShop = {
          id: s.id,
          name: s.shopName,
          image: s.shopLogoUrl,
          category: s.shopCategory,
          rating: Number(s.rating),
          reviews: s.reviewCount,
          // Opening hours are not what this list is for, and claiming a shop
          // is open without checking would be worse than saying nothing.
          isOpen: true,
          hoursLabel: null,
          hasSale: false,
          distanceKm,
          distanceLabel: describeDistance(distanceKm),
          directionsUrl:
            s.latitude != null && s.longitude != null
              ? directionsUrl({ latitude: Number(s.latitude), longitude: Number(s.longitude) }, s.shopName)
              : null,
          matches: s.products.map((p) => ({
            id: p.id,
            name: p.name,
            price: Number(p.price),
            image: p.images[0] ?? null,
          })),
        }
        return shop
      })
      .filter((s) => s.distanceKm != null && s.distanceKm <= radiusKm)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
  }

  const search = await searchOutward<NearbyShop>(fetchAt, {
    minResults: 3,
    noun: "a shop with that",
    distanceOf: (s) => s.distanceKm,
  })

  return {
    items: search.results.slice(0, limit),
    radiusKm: search.radiusKm,
    band: search.band,
    widened: search.widened,
    empty: search.empty,
    message: search.message,
    located: true,
  }
}
