"use server"

import type { Prisma } from "@prisma/client"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { getProviderAvailabilityStatuses, getProviderAvailabilityStatus, type ProviderAvailabilityStatus } from "@/backend/actions/provider-status"
import {
  boundingBox, boundingBoxWhere, distanceFrom, sortByDistance, toCoordinates,
  type Coordinates,
} from "@/backend/domain/geo"
import {
  distanceKmSql, withinRadiusSql,
  noteSpatialFailure, noteSpatialSuccess, postgisUnavailable,
} from "@/backend/services/geo-sql"
import { getMyLocationOrigin } from "@/backend/actions/geo"

function computeBadges(verified: boolean, rating: number, responseTimeMinutes: number | null): string[] {
  const badges: string[] = []
  if (verified) badges.push("Verified")
  if (rating >= 4.8) badges.push("Top Rated")
  if (responseTimeMinutes != null && responseTimeMinutes <= 10) badges.push("Fast Responder")
  return badges
}

export type SpecialistCard = {
  providerId: string
  userId: string
  name: string
  avatar: string | null
  verified: boolean
  status: ProviderAvailabilityStatus
  rating: number
  reviewCount: number
  completedJobs: number
  /** Declared by the provider. Null when unset — previously this was
   *  derived from completedJobs, which showed someone with no jobs at all
   *  as having a year of experience. The UI omits the line when null. */
  yearsExperience: number | null
  hourlyRate: number
  skills: string[]
  location: string
  workPreference: "REMOTE" | "ONSITE" | "HYBRID"
  /** Public storefront address, when the provider has one. */
  slug: string | null
  badges: string[]
  /** Straight-line km from the customer to this provider. Null whenever
   *  either side is unlocated, or the provider works REMOTE and so has no
   *  meaningful distance — the UI omits the line rather than showing 0 km. */
  distanceKm: number | null
}

export type OnlineProviderCard = {
  providerId: string
  userId: string
  name: string
  avatar: string | null
  verified: boolean
  rating: number
  reviewCount: number
  completedJobs: number
  categoryName: string | null
  location: string | null
  hourlyRate: number | null
  slug: string | null
  /** Straight-line km from the viewer. Null when either side is unlocated. */
  distanceKm: number | null
}

/**
 * Providers who have actively flipped themselves on with the "Go Online"
 * toggle on their work page — the customer dashboard's "available right now"
 * suggestions.
 *
 * Deliberately NOT ProviderAvailabilityStatus (lib/actions/provider-status.ts).
 * That one is inferred from job rows and says "nothing is booked against
 * them", which is true of every provider who has never worked. This is the
 * provider's own statement that they are working now, which is what makes it
 * worth putting in front of a customer.
 *
 * Providers already on a job are dropped: they are online, but suggesting
 * someone mid-job as available wastes the customer's time. Blocked-out days
 * count the same way, which is what getProviderAvailabilityStatuses already
 * computes, so that logic is not duplicated here.
 */
export async function getOnlineProviders(limit = 8): Promise<OnlineProviderCard[]> {
  // "Available right now" is the row where distance matters most — someone
  // online but 400 km away is not actually available to this customer.
  const origin = await getMyLocationOrigin()

  const providers = await db.providerProfile.findMany({
    where: {
      availability: { isOnline: true },
      user: { isActive: true },
      // Staff of a business are dispatched by their employer rather than
      // booked directly, so they do not belong in a customer's suggestions.
      parentBusinessId: null,
    },
    include: { user: { select: { id: true, name: true, image: true } }, category: { select: { name: true } } },
    orderBy: [{ rating: "desc" }, { completedJobs: "desc" }],
    // Over-fetch a little so dropping the busy ones below still leaves a
    // full row rather than a short one. Deliberately NOT restricted to the
    // proximity window: online providers are scarce, and an empty
    // "available now" row is worse than a distant one, so this sorts by
    // distance rather than filtering by it.
    take: limit * 3,
  })
  if (providers.length === 0) return []

  const statuses = await getProviderAvailabilityStatuses(providers.map((p) => p.id))

  const available = providers
    .filter((p) => statuses.get(p.id) !== "busy")
    .map((p) => ({
      providerId: p.id,
      userId: p.userId,
      name: p.businessName || p.user.name,
      avatar: p.user.image,
      verified: p.verified,
      rating: Number(p.rating),
      reviewCount: p.reviewCount,
      completedJobs: p.completedJobs,
      categoryName: p.category?.name ?? null,
      location: p.location,
      hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : null,
      slug: p.slug,
      distanceKm: p.workPreference === "REMOTE"
        ? null
        : distanceFrom(origin, toCoordinates(p.latitude, p.longitude)),
    }))

  // Sort before trimming, so the nearest online providers survive the cut
  // rather than whoever happened to rank highest by rating.
  return (origin ? sortByDistance(available) : available).slice(0, limit)
}

/** The flat row both branches of getSpecialists produce — the spatial SQL
 *  query and the unfiltered Prisma read are normalised to this so the card
 *  mapping below has exactly one shape to handle. */
type SpecialistRow = {
  id: string
  userId: string
  verified: boolean
  rating: number
  reviewCount: number
  completedJobs: number
  yearsExperience: number
  hourlyRate: number | null
  skills: string[]
  workAreas: string[]
  location: string | null
  workPreference: "REMOTE" | "ONSITE" | "HYBRID"
  slug: string | null
  responseTimeMinutes: number | null
  userName: string
  userImage: string | null
  categoryName: string | null
  distanceKm: number | null
}

/** Options for the find-specialists "near me" filter — same shape and same
 *  fallback rules as ShopBrowseOptions in lib/actions/home.ts. */
export type SpecialistBrowseOptions = {
  radiusKm?: number | null
  origin?: Coordinates | null
}

/** Normalises a Prisma provider row into the flat shape the cards expect,
 *  so the spatial and non-spatial branches below converge on one type. */
function toRow(
  p: Prisma.ProviderProfileGetPayload<{ include: { user: true; category: true } }>,
  origin: Coordinates | null,
): SpecialistRow {
  return {
    id: p.id, userId: p.userId, verified: p.verified,
    rating: Number(p.rating), reviewCount: p.reviewCount,
    completedJobs: p.completedJobs, yearsExperience: p.yearsExperience,
    hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : null,
    skills: p.skills, workAreas: p.workAreas, location: p.location,
    workPreference: p.workPreference, slug: p.slug,
    responseTimeMinutes: p.responseTimeMinutes,
    userName: p.user.name, userImage: p.user.image,
    categoryName: p.category?.name ?? null,
    distanceKm: p.workPreference === "REMOTE"
      ? null
      : distanceFrom(origin, toCoordinates(p.latitude, p.longitude)),
  }
}

/**
 * Providers within `radiusKm`, measured and ordered by the database.
 *
 * ST_DWithin against the GiST index filters, ST_Distance measures and
 * ORDER BY sorts, so only providers genuinely inside the circle cross the
 * wire. A REMOTE provider has no coordinates and so falls out of a radius
 * search by construction rather than needing a special case.
 *
 * PostGIS is database state this repo cannot guarantee — it is enabled by
 * scripts/enable-postgis.js, not by a migration — so a deploy against an
 * instance without it degrades to a bounding-box prefilter plus an exact
 * refine in JS rather than failing outright. Same results, more rows over
 * the wire. The capability is cached after the first failure, so this costs
 * at most one failed query per cold start.
 */
async function nearbyProviderRows(origin: Coordinates, radiusKm: number): Promise<SpecialistRow[]> {
  if (!postgisUnavailable()) {
    try {
      const rows = await db.$queryRaw<SpecialistRow[]>`
        SELECT
          p."id", p."userId", p."verified",
          p."rating"::float8 AS "rating",
          p."reviewCount", p."completedJobs", p."yearsExperience",
          p."hourlyRate"::float8 AS "hourlyRate",
          -- Prisma's client turns a NULL text[] into [], raw SQL does not,
          -- and a provider with null arrays would crash the mapping above.
          COALESCE(p."skills", '{}')    AS "skills",
          COALESCE(p."workAreas", '{}') AS "workAreas",
          p."location", p."workPreference",
          p."slug", p."responseTimeMinutes",
          u."name" AS "userName", u."image" AS "userImage",
          c."name" AS "categoryName",
          ${distanceKmSql(origin.latitude, origin.longitude)} AS "distanceKm"
        FROM "provider_profiles" p
        JOIN "users" u ON u."id" = p."userId"
        LEFT JOIN "categories" c ON c."id" = p."categoryId"
        WHERE ${withinRadiusSql(origin.latitude, origin.longitude, radiusKm)}
        ORDER BY ${distanceKmSql(origin.latitude, origin.longitude)} ASC
      `
      noteSpatialSuccess()
      return rows
    } catch (error) {
      if (!noteSpatialFailure(error)) throw error
    }
  }

  const rows = await db.providerProfile.findMany({
    where: boundingBoxWhere(boundingBox(origin.latitude, origin.longitude, radiusKm)),
    include: { user: true, category: true },
    orderBy: { rating: "desc" },
  })
  return sortByDistance(
    rows.map((p) => toRow(p, origin)).filter((r) => r.distanceKm != null && r.distanceKm <= radiusKm),
  )
}

export async function getSpecialists(options: SpecialistBrowseOptions = {}): Promise<SpecialistCard[]> {
  const radiusKm = options.radiusKm ?? null
  // Resolved even when no radius was requested, so an unfiltered listing
  // still labels each card with how far away the provider is — same
  // behaviour as getAllShops. One indexed lookup by userId.
  const origin = options.origin ?? (await getMyLocationOrigin())
  const filterByRadius = origin != null && radiusKm != null

  // Radius searches run in Postgres (see nearbyProviderRows); the
  // unfiltered listing is a whole-table read with distances measured here,
  // because without a radius there is no spatial predicate to hang a query
  // on. Both branches produce the same flat SpecialistRow shape.
  const providers: SpecialistRow[] = filterByRadius
    ? await nearbyProviderRows(origin, radiusKm)
    : (await db.providerProfile.findMany({
        include: { user: true, category: true },
        orderBy: { rating: "desc" },
      })).map((p) => toRow(p, origin))

  const statuses = await getProviderAvailabilityStatuses(providers.map((p) => p.id))

  const cards = providers.map((p) => ({
    providerId: p.id,
    userId: p.userId,
    name: p.userName,
    avatar: p.userImage,
    verified: p.verified,
    status: statuses.get(p.id) ?? "available",
    rating: Number(p.rating),
    reviewCount: p.reviewCount,
    completedJobs: p.completedJobs,
    // Prefer what the provider actually declared. The completedJobs/25
    // heuristic below is the old behaviour, kept only as a fallback so
    // profiles nobody has filled in yet don't suddenly read "0 years" — it is
    // a guess, and should be deleted once declared experience is widespread.
    yearsExperience: p.yearsExperience > 0 ? p.yearsExperience : null,
    hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : 0,
    skills: p.skills.length > 0 ? p.skills : p.categoryName ? [p.categoryName] : [],
    // A remote provider has no meaningful travel area, and showing them under
    // a town (or the old hardcoded "Nairobi") is what made every provider look
    // like they drive to you.
    location: p.workPreference === "REMOTE" ? "Remote" : p.workAreas[0] ?? "Nairobi",
    workPreference: p.workPreference,
    slug: p.slug,
    badges: computeBadges(p.verified, Number(p.rating), p.responseTimeMinutes),
    distanceKm: p.distanceKm == null ? null : Math.round(p.distanceKm * 10) / 10,
  }))

  // Proximity is the default ordering even when no radius was chosen: the
  // list stays complete (so it can never come back empty) but the closest
  // providers lead. REMOTE providers carry no distance and sort last, which
  // is right — they are the ones for whom distance genuinely doesn't matter.
  if (!filterByRadius) return origin ? sortByDistance(cards) : cards

  return sortByDistance(
    cards.filter((c) => c.distanceKm != null && c.distanceKm <= radiusKm),
  )
}

export type SpecialistDetail = SpecialistCard & {
  bio: string | null
  phone: string | null
  /// The provider's work samples — what they photographed or filmed on a
  /// finished job. `description` is carried so the customer can read what the
  /// job actually involved rather than just seeing a caption-less thumbnail.
  portfolio: { id: string; title: string; description: string | null; imageUrl: string; videoUrl: string | null }[]
  endorsements: { id: string; shopName: string; ownerName: string; message: string; avatar: string | null }[]
  bookableCategoryId: string | null
  isWishlisted: boolean
  shop: { id: string; name: string; logoUrl: string | null; rating: number } | null
} | null

export async function getSpecialistDetail(providerId: string): Promise<SpecialistDetail> {
  const session = await auth()

  const provider = await db.providerProfile.findUnique({
    where: { id: providerId },
    include: {
      user: true,
      category: true,
      portfolio: { orderBy: { createdAt: "desc" } },
      services: { where: { isActive: true }, take: 1 },
      affiliatedShop: true,
    },
  })
  if (!provider) return null

  const status = await getProviderAvailabilityStatus(provider.id)

  const endorsements = await db.endorsement.findMany({
    where: { toUserId: provider.userId },
    // The endorser's main shop, for the name on the endorsement. Only the
    // first: an account may own several branches now, and an endorsement is
    // signed by a business rather than by one of its counters.
    include: {
      fromUser: {
        include: { shopkeeperProfiles: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1 } },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  let isWishlisted = false
  if (session?.user?.id) {
    const existing = await db.wishlistItem.findFirst({
      where: { customerId: session.user.id, targetType: "PROVIDER", providerId },
    })
    isWishlisted = !!existing
  }

  return {
    providerId: provider.id,
    userId: provider.userId,
    name: provider.user.name,
    avatar: provider.user.image,
    verified: provider.verified,
    status,
    rating: Number(provider.rating),
    reviewCount: provider.reviewCount,
    completedJobs: provider.completedJobs,
    yearsExperience: provider.yearsExperience > 0 ? provider.yearsExperience : null,
    hourlyRate: provider.hourlyRate != null ? Number(provider.hourlyRate) : 0,
    skills: provider.skills.length > 0 ? provider.skills : provider.category ? [provider.category.name] : [],
    location: provider.workPreference === "REMOTE" ? "Remote" : provider.workAreas[0] ?? "Nairobi",
    workPreference: provider.workPreference,
    slug: provider.slug,
    badges: computeBadges(provider.verified, Number(provider.rating), provider.responseTimeMinutes),
    // The detail view is opened from a card that already showed the
    // distance; recomputing it here would mean another origin lookup for a
    // number the caller is holding.
    distanceKm: null,
    bio: provider.bio,
    // Real phone numbers never leave the server to another user — Call and
    // Message both go through the in-app conversation/voice-call system
    // (userId above), never a raw tel: link.
    phone: null,
    portfolio: provider.portfolio.map((item) => ({ id: item.id, title: item.title, description: item.description, imageUrl: item.imageUrl, videoUrl: item.videoUrl })),
    endorsements: endorsements.map((e) => ({
      id: e.id,
      shopName: e.fromUser.shopkeeperProfiles[0]?.shopName ?? e.fromUser.name,
      ownerName: e.fromUser.name,
      message: e.message,
      avatar: e.fromUser.image,
    })),
    bookableCategoryId: provider.services[0]?.categoryId ?? provider.categoryId,
    isWishlisted,
    shop: provider.affiliatedShop
      ? { id: provider.affiliatedShop.id, name: provider.affiliatedShop.shopName, logoUrl: provider.affiliatedShop.shopLogoUrl, rating: Number(provider.affiliatedShop.rating) }
      : null,
  }
}
