"use server"

import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import {
  DEFAULT_RADIUS_KM, boundingBox, boundingBoxWhere, distanceFrom,
  sortByDistance, toCoordinates, type Coordinates,
} from "@/lib/geo"
import {
  distanceKmSql, withinRadiusSql,
  noteSpatialFailure, noteSpatialSuccess, postgisUnavailable,
} from "@/lib/geo-sql"
import { auth } from "@/auth"
import { resolveLocationOrigin, type OriginSource } from "@/lib/actions/geo"

/**
 * A circular fence to query inside — a centre and a radius.
 *
 * The client owns this. That is the point of the pull model: rather than
 * every section independently asking the server "where am I, and what is
 * near me", the page holds one position, declares one fence, and pulls
 * everything inside it in a single request. The server still resolves a
 * fallback centre (IP, saved address, last known fix) for the first pull,
 * before the browser has produced a position of its own.
 */
export type Geofence = Coordinates & { radiusKm: number }

export type GeofenceKind = "shops" | "providers" | "requests"

export type FencedShop = {
  id: string
  /** Where to draw the pin. Always present: a row without coordinates
   *  cannot match a geofence in the first place. */
  latitude: number
  longitude: number
  name: string
  image: string | null
  category: string | null
  rating: number
  reviewCount: number
  isVerified: boolean
  distanceKm: number | null
}

export type FencedProvider = {
  providerId: string
  latitude: number
  longitude: number
  userId: string
  name: string
  avatar: string | null
  verified: boolean
  categoryName: string | null
  rating: number
  reviewCount: number
  hourlyRate: number | null
  slug: string | null
  isOnline: boolean
  distanceKm: number | null
}

export type FencedRequest = {
  id: string
  latitude: number
  longitude: number
  title: string
  categoryName: string
  location: string
  budgetMin: number | null
  budgetMax: number | null
  responseCount: number
  createdAt: string
  distanceKm: number | null
}

export type GeofenceQuery = {
  /** The fence to search. Omit to let the server pick a centre — the first
   *  pull of a session, before the browser has a position to offer. */
  fence?: Partial<Geofence> | null
  /** Which collections to pull. Defaults to all three; a page that only
   *  renders shops should ask only for shops rather than paying for the
   *  other two. */
  kinds?: GeofenceKind[]
  /** Per-kind cap on returned rows. */
  limit?: number
}

export type GeofenceResult = {
  /** The fence actually used, echoed back so the client can display it and
   *  reuse it on the next pull without recomputing. */
  fence: Geofence | null
  /** Where the centre came from. "CLIENT" means the caller supplied it,
   *  which is the steady state once the browser has a GPS fix. */
  centreFrom: OriginSource | "CLIENT" | null
  shops: FencedShop[]
  providers: FencedProvider[]
  requests: FencedRequest[]
}

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 50
/** Past this the "fence" stops meaning anything local, and the bounding box
 *  stops excluding enough rows to be worth indexing against. */
const MAX_RADIUS_KM = 1000

const ALL_KINDS: GeofenceKind[] = ["shops", "providers", "requests"]

const EMPTY: GeofenceResult = { fence: null, centreFrom: null, shops: [], providers: [], requests: [] }

function isFiniteCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Pull everything inside one geofence, in one round trip.
 *
 * This is the pull half of the location story: the caller says where it is
 * and how far it cares about, and gets back every nearby entity type at
 * once. The alternative — each section resolving its own origin and issuing
 * its own query — multiplies the single most expensive thing a request does
 * (a database round trip) by the number of sections on the page.
 *
 * The distance work is the database's, not this function's. The incoming
 * coordinates are bound as query parameters and PostGIS does the rest:
 * `ST_DWithin` filters against a GiST index, `ST_Distance` computes the
 * kilometres, and `ORDER BY ... LIMIT` means only the rows actually wanted
 * ever cross the wire. This replaced a bounding-box prefilter plus a
 * JavaScript haversine refine — correct, but it shipped rows only to throw
 * them away and could not use an index to sort.
 *
 * The three queries are issued concurrently, so the whole pull costs one
 * round trip of latency rather than three.
 */
export async function queryGeofence(input: GeofenceQuery = {}): Promise<GeofenceResult> {
  const kinds = input.kinds?.length ? input.kinds : ALL_KINDS
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)

  // A client-supplied centre wins: it is the browser's own fix, which is
  // both more accurate and more current than anything the server can infer.
  const supplied = input.fence
  let centre: Coordinates | null = null
  let centreFrom: GeofenceResult["centreFrom"] = null

  if (supplied && isFiniteCoord(supplied.latitude) && isFiniteCoord(supplied.longitude)) {
    centre = { latitude: supplied.latitude, longitude: supplied.longitude }
    centreFrom = "CLIENT"
  } else {
    const resolved = await resolveLocationOrigin()
    if (resolved) {
      centre = { latitude: resolved.latitude, longitude: resolved.longitude }
      centreFrom = resolved.source
    }
  }

  // No centre anywhere means there is no fence to query. Callers render
  // their own unfenced fallback rather than being handed a fabricated one.
  if (!centre) return EMPTY

  const suppliedRadius = supplied?.radiusKm
  const radiusKm = isFiniteCoord(suppliedRadius) && suppliedRadius > 0
    ? Math.min(suppliedRadius, MAX_RADIUS_KM)
    : DEFAULT_RADIUS_KM

  const { latitude, longitude } = centre
  const fence: Geofence = { ...centre, radiusKm }

  const within = withinRadiusSql(latitude, longitude, radiusKm)
  const distance = distanceKmSql(latitude, longitude)

  const wantShops = kinds.includes("shops")
  const wantProviders = kinds.includes("providers")
  const wantRequests = kinds.includes("requests")

  // Open requests are other people's jobs — only pulled for a signed-in
  // caller, never for an anonymous visitor.
  const session = wantRequests ? await auth() : null
  const maySeeRequests = Boolean(session?.user?.id)

  // PostGIS is database state this repo cannot guarantee is present — it is
  // enabled by scripts/enable-postgis.js, not by a migration — so an
  // instance without it degrades to the Prisma bounding-box path below
  // instead of failing every pull. Cached after the first failure.
  if (postgisUnavailable()) {
    return fallbackGeofence({ centre, radiusKm, fence, centreFrom, limit, wantShops, wantProviders, wantRequests: wantRequests && maySeeRequests })
  }

  try {
  const [shops, providers, requests] = await Promise.all([
    wantShops
      ? db.$queryRaw<FencedShop[]>`
          SELECT
            s."id",
            s."latitude"::float8  AS "latitude",
            s."longitude"::float8 AS "longitude",
            s."shopName"      AS "name",
            s."shopLogoUrl"   AS "image",
            s."shopCategory"  AS "category",
            s."rating"::float8      AS "rating",
            s."reviewCount"         AS "reviewCount",
            s."isVerified"          AS "isVerified",
            ${distance}             AS "distanceKm"
          FROM "shopkeeper_profiles" s
          WHERE ${within}
          ORDER BY ${distance} ASC
          LIMIT ${limit}
        `
      : Promise.resolve([] as FencedShop[]),
    wantProviders
      ? db.$queryRaw<FencedProvider[]>`
          SELECT
            p."id"            AS "providerId",
            p."latitude"::float8  AS "latitude",
            p."longitude"::float8 AS "longitude",
            p."userId"        AS "userId",
            u."name"          AS "name",
            u."image"         AS "avatar",
            p."verified"      AS "verified",
            c."name"          AS "categoryName",
            p."rating"::float8        AS "rating",
            p."reviewCount"           AS "reviewCount",
            p."hourlyRate"::float8    AS "hourlyRate",
            p."slug"                  AS "slug",
            COALESCE(a."isOnline", false) AS "isOnline",
            ${distance}               AS "distanceKm"
          FROM "provider_profiles" p
          JOIN "users" u ON u."id" = p."userId"
          LEFT JOIN "categories" c ON c."id" = p."categoryId"
          LEFT JOIN "provider_availability" a ON a."providerId" = p."id"
          WHERE ${within}
            -- Staff are dispatched by their employer rather than booked
            -- directly, so they do not belong in a customer's results.
            AND p."parentBusinessId" IS NULL
            AND u."isActive" = true
          ORDER BY ${distance} ASC
          LIMIT ${limit}
        `
      : Promise.resolve([] as FencedProvider[]),
    wantRequests && maySeeRequests
      ? db.$queryRaw<FencedRequest[]>`
          SELECT
            r."id",
            r."latitude"::float8  AS "latitude",
            r."longitude"::float8 AS "longitude",
            r."title",
            c."name"      AS "categoryName",
            r."location"  AS "location",
            r."budgetMin"::float8 AS "budgetMin",
            r."budgetMax"::float8 AS "budgetMax",
            (SELECT COUNT(*)::int FROM "request_responses" rr WHERE rr."requestId" = r."id") AS "responseCount",
            r."createdAt" AS "createdAt",
            ${distance}   AS "distanceKm"
          FROM "customer_requests" r
          JOIN "categories" c ON c."id" = r."categoryId"
          WHERE ${within}
            AND r."status" = 'OPEN'
            AND r."expiresAt" > NOW()
          ORDER BY ${distance} ASC
          LIMIT ${limit}
        `
      : Promise.resolve([] as FencedRequest[]),
  ])

  noteSpatialSuccess()
  return {
    fence,
    centreFrom,
    // Rounded here rather than in SQL so the rounding rule lives in one
    // place alongside distanceFrom's.
    shops: shops.map(roundDistance),
    providers: providers.map(roundDistance),
    requests: requests.map((r) => ({
      ...roundDistance(r),
      // node-postgres hands back a Date for timestamptz; the API contract
      // is an ISO string.
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  }
  } catch (error) {
    if (!noteSpatialFailure(error)) throw error
    return fallbackGeofence({ centre, radiusKm, fence, centreFrom, limit, wantShops, wantProviders, wantRequests: wantRequests && maySeeRequests })
  }
}

/**
 * The same pull, expressed in Prisma, for a database without PostGIS.
 *
 * Narrows on the plain latitude/longitude B-tree index and refines in JS,
 * which means the bounding box's corners come over the wire before being
 * discarded. Identical results, just less efficient — which is the right
 * trade for a fallback nobody should be hitting.
 */
async function fallbackGeofence(args: {
  centre: Coordinates
  radiusKm: number
  fence: Geofence
  centreFrom: GeofenceResult["centreFrom"]
  limit: number
  wantShops: boolean
  wantProviders: boolean
  wantRequests: boolean
}): Promise<GeofenceResult> {
  const { centre, radiusKm, fence, centreFrom, limit } = args
  const within = boundingBoxWhere(boundingBox(centre.latitude, centre.longitude, radiusKm))
  const take = limit * 3

  const [shopRows, providerRows, requestRows] = await Promise.all([
    args.wantShops
      ? db.shopkeeperProfile.findMany({
          where: within,
          orderBy: [{ isFeatured: "desc" }, { rating: "desc" }],
          take,
          select: {
            id: true, shopName: true, shopLogoUrl: true, shopCategory: true,
            rating: true, reviewCount: true, isVerified: true, latitude: true, longitude: true,
          },
        })
      : Promise.resolve([]),
    args.wantProviders
      ? db.providerProfile.findMany({
          where: { ...within, parentBusinessId: null, user: { isActive: true } },
          orderBy: [{ rating: "desc" }, { completedJobs: "desc" }],
          take,
          select: {
            id: true, userId: true, rating: true, reviewCount: true, verified: true,
            hourlyRate: true, slug: true, latitude: true, longitude: true,
            user: { select: { name: true, image: true } },
            category: { select: { name: true } },
            availability: { select: { isOnline: true } },
          },
        })
      : Promise.resolve([]),
    args.wantRequests
      ? db.customerRequest.findMany({
          where: { status: "OPEN", expiresAt: { gt: new Date() }, ...within },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true, title: true, location: true, budgetMin: true, budgetMax: true,
            createdAt: true, latitude: true, longitude: true,
            category: { select: { name: true } },
            _count: { select: { responses: true } },
          },
        })
      : Promise.resolve([]),
  ])

  /** Drops the bounding box's corners and orders what is genuinely inside. */
  const inFence = <T extends { distanceKm: number | null }>(rows: T[]): T[] =>
    sortByDistance(rows.filter((r) => r.distanceKm != null && r.distanceKm <= radiusKm)).slice(0, limit)

  return {
    fence,
    centreFrom,
    shops: inFence(shopRows.map((s) => ({
      id: s.id,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      name: s.shopName,
      image: s.shopLogoUrl,
      category: s.shopCategory,
      rating: Number(s.rating),
      reviewCount: s.reviewCount,
      isVerified: s.isVerified,
      distanceKm: distanceFrom(centre, toCoordinates(s.latitude, s.longitude)),
    }))),
    providers: inFence(providerRows.map((p) => ({
      providerId: p.id,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      userId: p.userId,
      name: p.user.name,
      avatar: p.user.image,
      verified: p.verified,
      categoryName: p.category?.name ?? null,
      rating: Number(p.rating),
      reviewCount: p.reviewCount,
      hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : null,
      slug: p.slug,
      isOnline: p.availability?.isOnline ?? false,
      distanceKm: distanceFrom(centre, toCoordinates(p.latitude, p.longitude)),
    }))),
    requests: inFence(requestRows.map((r) => ({
      id: r.id,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      title: r.title,
      categoryName: r.category.name,
      location: r.location,
      budgetMin: r.budgetMin != null ? Number(r.budgetMin) : null,
      budgetMax: r.budgetMax != null ? Number(r.budgetMax) : null,
      responseCount: r._count.responses,
      createdAt: r.createdAt.toISOString(),
      distanceKm: distanceFrom(centre, toCoordinates(r.latitude, r.longitude)),
    }))),
  }
}

/** One decimal place — the precision the UI actually renders ("2.4 km"). */
function roundDistance<T extends { distanceKm: number | null }>(row: T): T {
  return row.distanceKm == null ? row : { ...row, distanceKm: Math.round(row.distanceKm * 10) / 10 }
}
