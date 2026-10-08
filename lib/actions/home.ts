"use server"

import type { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { isShopCurrentlyOpen, formatShopHours, resolveShopHoursForToday } from "@/lib/format"
import {
  boundingBox, boundingBoxWhere, distanceFrom, proximityWhere, sortByDistance,
  toCoordinates, type Coordinates,
} from "@/lib/geo"
import { distanceKmSql, withinRadiusSql, noteSpatialFailure, noteSpatialSuccess, postgisUnavailable } from "@/lib/geo-sql"
import { getMyLocationOrigin, resolveLocationOrigin } from "@/lib/actions/geo"

export type HomeServiceCategory = {
  id: string
  name: string
  slug: string
  tier: string | null
}

export async function getServiceCategories(): Promise<HomeServiceCategory[]> {
  const categories = await db.category.findMany({
    where: { type: "SERVICE", isActive: true },
    orderBy: { name: "asc" },
  })
  return categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, tier: c.tier }))
}

export type LandingStats = {
  categoryCount: number
  verifiedProviderCount: number
  shopCount: number
}

// Public landing page — no auth required. Deliberately leads with supply-side
// breadth (categories/providers/shops) rather than usage-volume metrics
// (jobs completed, transaction counts): those are genuinely low this early
// and would look broken rather than honest.
export async function getLandingStats(): Promise<LandingStats> {
  const [categoryCount, verifiedProviderCount, shopCount] = await Promise.all([
    db.category.count({ where: { type: "SERVICE", isActive: true } }),
    db.providerProfile.count({ where: { verified: true } }),
    db.shopkeeperProfile.count(),
  ])
  return { categoryCount, verifiedProviderCount, shopCount }
}

export type HomeFeaturedShop = {
  id: string
  name: string
  image: string | null
  category: string | null
  rating: number
  reviews: number
  isOpen: boolean
  hoursLabel: string | null
  hasSale: boolean
  /** Straight-line km from the customer's default address to this shop's
   * saved coordinates. Null whenever either side is missing — which is the
   * common case until shopkeepers set their location — so the UI must be
   * able to render a shop card without it. */
  distanceKm: number | null
}

type ShopWithPromotions = Prisma.ShopkeeperProfileGetPayload<{ include: { promotions: true } }>

function mapShop(s: ShopWithPromotions, origin: Coordinates | null = null): HomeFeaturedShop {
  return {
    id: s.id,
    name: s.shopName,
    image: s.shopLogoUrl,
    category: s.shopCategory,
    rating: Number(s.rating),
    reviews: s.reviewCount,
    isOpen: isShopCurrentlyOpen(resolveShopHoursForToday(s).openingTime, resolveShopHoursForToday(s).closingTime, s.timeZoneOffsetMinutes),
    hoursLabel: formatShopHours(resolveShopHoursForToday(s).openingTime, resolveShopHoursForToday(s).closingTime),
    hasSale: s.promotions.length > 0,
    distanceKm: distanceFrom(origin, toCoordinates(s.latitude, s.longitude)),
  }
}

const SHOP_INCLUDE = { promotions: { where: { status: "ACTIVE" as const }, take: 1 } }
const RECOMMENDED_SHOP_COUNT = 6

/** Fills the Recommended Shops row, nearest-first when we know where the
 *  viewer is. Falls back to a nationwide top-up when the proximity window
 *  can't fill the row, so the section is never short — the same
 *  near-then-widen shape as getNearbyProviders. */
async function topRatedShops(
  excludeIds: string[],
  take: number,
  origin: Coordinates | null = null,
): Promise<HomeFeaturedShop[]> {
  if (take <= 0) return []
  const exclude = [...excludeIds]
  const order = [{ isFeatured: "desc" as const }, { rating: "desc" as const }]

  let shops: HomeFeaturedShop[] = []

  if (origin) {
    const near = await db.shopkeeperProfile.findMany({
      where: { ...(exclude.length > 0 ? { id: { notIn: exclude } } : {}), ...proximityWhere(origin) },
      orderBy: order,
      take: take * 4,
      include: SHOP_INCLUDE,
    })
    shops = sortByDistance(near.map((shop) => mapShop(shop, origin))).slice(0, take)
    exclude.push(...shops.map((s) => s.id))
  }

  if (shops.length < take) {
    const fill = await db.shopkeeperProfile.findMany({
      where: exclude.length > 0 ? { id: { notIn: exclude } } : undefined,
      orderBy: order,
      take: take - shops.length,
      include: SHOP_INCLUDE,
    })
    shops = [...shops, ...fill.map((shop) => mapShop(shop, origin))]
  }

  return shops
}

/** Real, activity-based shop recommendations: ranks shops by the customer's
 * own real orders, wishlisted products, recently viewed products, and jobs
 * booked with providers affiliated to a shop — genuine ledger data, not a
 * synthetic score. Any remaining slots (including for signed-out visitors or
 * customers with no activity yet) are filled with featured/top-rated shops
 * so the section always shows at least RECOMMENDED_SHOP_COUNT shops. */
export async function getRecommendedShops(): Promise<HomeFeaturedShop[]> {
  const session = await auth()
  const origin = await getMyLocationOrigin()
  if (!session?.user?.id || session.user.role !== "customer") {
    // Signed-out and non-customer viewers still get proximity: the origin
    // above falls back to this request's IP geolocation.
    return topRatedShops([], RECOMMENDED_SHOP_COUNT, origin)
  }

  const customerId = session.user.id

  const [orders, viewedProducts, wishlistProducts, jobs] = await Promise.all([
    db.order.findMany({ where: { customerId }, select: { shopkeeperId: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.recentlyViewed.findMany({ where: { userId: customerId, targetType: "PRODUCT" }, select: { targetId: true }, orderBy: { viewedAt: "desc" }, take: 30 }),
    db.wishlistItem.findMany({ where: { customerId, targetType: "PRODUCT", productId: { not: null } }, select: { productId: true }, take: 30 }),
    db.job.findMany({ where: { customerId, providerId: { not: null } }, select: { provider: { select: { affiliatedShopId: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ])

  const productIds = [...new Set([...viewedProducts.map((v) => v.targetId), ...wishlistProducts.map((w) => w.productId!)])]
  const products = productIds.length > 0
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, shopkeeperId: true } })
    : []
  const productShopMap = new Map(products.map((p) => [p.id, p.shopkeeperId]))

  const scores = new Map<string, number>()
  const bump = (shopId: string | null | undefined, weight: number) => {
    if (!shopId) return
    scores.set(shopId, (scores.get(shopId) ?? 0) + weight)
  }
  orders.forEach((o) => bump(o.shopkeeperId, 3))
  wishlistProducts.forEach((w) => bump(productShopMap.get(w.productId!), 2))
  jobs.forEach((j) => bump(j.provider?.affiliatedShopId, 2))
  viewedProducts.forEach((v) => bump(productShopMap.get(v.targetId), 1))

  const rankedIds = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, RECOMMENDED_SHOP_COUNT)

  let shops: HomeFeaturedShop[] = []
  if (rankedIds.length > 0) {
    const rows = await db.shopkeeperProfile.findMany({ where: { id: { in: rankedIds } }, include: SHOP_INCLUDE })
    const byId = new Map(rows.map((r) => [r.id, r]))
    shops = rankedIds.map((id) => byId.get(id)).filter((r): r is ShopWithPromotions => Boolean(r)).map((shop) => mapShop(shop, origin))
  }

  if (shops.length < RECOMMENDED_SHOP_COUNT) {
    shops = [...shops, ...(await topRatedShops(shops.map((s) => s.id), RECOMMENDED_SHOP_COUNT - shops.length, origin))]
  }

  // Every path above already measured its own distance while mapping, so the
  // separate backfill query this used to end with is gone — it was a whole
  // extra sequential round trip for numbers we were holding anyway.
  return shops
}

/** Options for the shops browse page's "near me" filter.
 *  `radiusKm` null means no distance filter — the full list, in the
 *  featured/rating order it has always used. `origin` lets the page pass
 *  the browser's own navigator.geolocation position, which is more accurate
 *  than the saved address and is the only origin available to a signed-out
 *  visitor; omitting it falls back to the saved default address. */
export type ShopBrowseOptions = {
  radiusKm?: number | null
  origin?: Coordinates | null
}

export async function getAllShops(options: ShopBrowseOptions = {}): Promise<HomeFeaturedShop[]> {
  const origin = options.origin ?? (await getMyLocationOrigin())
  const radiusKm = options.radiusKm ?? null

  // No usable origin means no distance to filter or sort on, so this stays
  // exactly the query it was before the radius filter existed rather than
  // silently returning nothing.
  if (!origin || radiusKm == null) {
    const shops = await db.shopkeeperProfile.findMany({
      orderBy: [{ isFeatured: "desc" }, { rating: "desc" }],
      include: SHOP_INCLUDE,
    })
    const mapped = shops.map((shop) => mapShop(shop, origin))
    // Proximity is the default *ordering* even with no radius chosen: the
    // list stays complete (nobody is filtered out, so it can never come back
    // empty) but the shops the customer can actually walk to come first.
    // Unlocated shops sort last rather than being hidden.
    return origin ? sortByDistance(mapped) : mapped
  }

  // Radius search runs entirely in Postgres: ST_DWithin filters against the
  // GiST index, ST_Distance measures, and ORDER BY sorts, so only the shops
  // actually inside the circle cross the wire — already in order. Raw rather
  // than Prisma because no ORM query language here can express a spatial
  // predicate. See lib/geo-sql.ts.
  //
  // PostGIS is database state this repo cannot guarantee is present (it is
  // enabled by scripts/enable-postgis.js), so a deploy against an instance
  // without it degrades to the bounding-box path below instead of failing.
  if (!postgisUnavailable()) {
    const within = withinRadiusSql(origin.latitude, origin.longitude, radiusKm)
    const distance = distanceKmSql(origin.latitude, origin.longitude)
    try {
      const rows = await db.$queryRaw<NearbyShopRow[]>`
        SELECT
          s."id",
          s."shopName",
          s."shopLogoUrl",
          s."shopCategory",
          s."rating"::float8 AS "rating",
          s."reviewCount",
          s."openingTime", s."closingTime",
          s."sundayOpeningTime", s."sundayClosingTime",
          s."holidayOpeningTime", s."holidayClosingTime",
          EXISTS (
            SELECT 1 FROM "promotions" pr
            WHERE pr."shopkeeperId" = s."id" AND pr."status" = 'ACTIVE'
          ) AS "hasSale",
          ${distance} AS "distanceKm"
        FROM "shopkeeper_profiles" s
        WHERE ${within}
        ORDER BY ${distance} ASC
      `
      noteSpatialSuccess()
      return rows.map(mapNearbyShopRow)
    } catch (error) {
      if (!noteSpatialFailure(error)) throw error
    }
  }

  // Fallback: narrow on the plain latitude/longitude B-tree index, then
  // discard the bounding box's corners with an exact measurement in JS.
  // Same results as the query above, just more rows over the wire.
  const shops = await db.shopkeeperProfile.findMany({
    where: boundingBoxWhere(boundingBox(origin.latitude, origin.longitude, radiusKm)),
    orderBy: [{ isFeatured: "desc" }, { rating: "desc" }],
    include: SHOP_INCLUDE,
  })
  return sortByDistance(
    shops
      .map((shop) => mapShop(shop, origin))
      .filter((shop) => shop.distanceKm != null && shop.distanceKm <= radiusKm),
  )
}

/** The shape the radius query above selects. Hand-written because a raw
 *  query has no generated Prisma type to lean on. */
type NearbyShopRow = {
  id: string
  shopName: string
  shopLogoUrl: string | null
  shopCategory: string | null
  /** Carried only so the open/closed check can use the shop's own local
   *  time; never returned to the client. */
  timeZoneOffsetMinutes: number | null
  rating: number
  reviewCount: number
  openingTime: string | null
  closingTime: string | null
  sundayOpeningTime: string | null
  sundayClosingTime: string | null
  holidayOpeningTime: string | null
  holidayClosingTime: string | null
  hasSale: boolean
  distanceKm: number
}

/** Same output shape as mapShop, but fed by the raw spatial query — the
 *  trading-hours logic is shared so both paths describe a shop identically. */
function mapNearbyShopRow(row: NearbyShopRow): HomeFeaturedShop {
  const hours = resolveShopHoursForToday(row)
  return {
    id: row.id,
    name: row.shopName,
    image: row.shopLogoUrl,
    category: row.shopCategory,
    rating: Number(row.rating),
    reviews: row.reviewCount,
    isOpen: isShopCurrentlyOpen(hours.openingTime, hours.closingTime, row.timeZoneOffsetMinutes),
    hoursLabel: formatShopHours(hours.openingTime, hours.closingTime),
    hasSale: row.hasSale,
    distanceKm: Math.round(row.distanceKm * 10) / 10,
  }
}

export type RecommendedService = {
  serviceId: string
  title: string
  image: string | null
  providerName: string
  providerAvatar: string | null
  price: number
  rating: number
  categoryName: string
}

export type RecommendedServices = { categoryName: string; services: RecommendedService[] } | null

/** Real, content-based "recommendation": looks at the customer's most
 * recently booked real Job, finds its Service's real category, and
 * surfaces other active real Services in that same category (excluding the
 * one already booked). No ML/recommendation engine — just a direct,
 * honest reuse of the customer's own real booking history. */
export async function getRecommendedServices(): Promise<RecommendedServices> {
  const session = await auth()
  if (!session?.user?.id) return null

  const lastJob = await db.job.findFirst({
    where: { customerId: session.user.id, serviceId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { service: { select: { categoryId: true, id: true } } },
  })
  const categoryId = lastJob?.service?.categoryId
  if (!categoryId) return null

  const category = await db.category.findUnique({ where: { id: categoryId } })
  if (!category) return null

  const services = await db.service.findMany({
    where: { categoryId, isActive: true, approvalStatus: "APPROVED", id: { not: lastJob?.service?.id } },
    orderBy: { rating: "desc" },
    take: 3,
    include: { provider: { include: { user: { select: { name: true, image: true } } } } },
  })
  if (services.length === 0) return null

  return {
    categoryName: category.name,
    services: services.map((s) => ({
      serviceId: s.id,
      title: s.title,
      image: s.images[0] ?? null,
      providerName: s.provider.user.name,
      providerAvatar: s.provider.user.image,
      price: Number(s.basePrice),
      rating: Number(s.rating),
      categoryName: category.name,
    })),
  }
}
