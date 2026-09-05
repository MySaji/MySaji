"use server"

import type { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { isShopCurrentlyOpen, formatShopHours } from "@/lib/format"

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

function mapShop(s: ShopWithPromotions): HomeFeaturedShop {
  return {
    id: s.id,
    name: s.shopName,
    image: s.shopLogoUrl,
    category: s.shopCategory,
    rating: Number(s.rating),
    reviews: s.reviewCount,
    isOpen: isShopCurrentlyOpen(s.openingTime, s.closingTime),
    hoursLabel: formatShopHours(s.openingTime, s.closingTime),
    hasSale: s.promotions.length > 0,
    distanceKm: null,
  }
}

const EARTH_RADIUS_KM = 6371

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Fills in distanceKm for whichever shops have coordinates, measured from
 * the customer's default saved address. Straight-line, not travel distance
 * — there's no routing service wired up, and this is only ever used to
 * order/label "near me", never to quote a delivery. Returns the list
 * untouched when the customer has no coordinates saved. */
async function withShopDistances(shops: HomeFeaturedShop[], customerId: string): Promise<HomeFeaturedShop[]> {
  if (shops.length === 0) return shops

  const home = await db.address.findFirst({
    where: { userId: customerId, latitude: { not: null }, longitude: { not: null } },
    orderBy: { isDefault: "desc" },
  })
  if (!home?.latitude || !home?.longitude) return shops

  const owners = await db.shopkeeperProfile.findMany({
    where: { id: { in: shops.map((s) => s.id) } },
    select: { id: true, userId: true },
  })
  const userIdByShop = new Map(owners.map((o) => [o.id, o.userId]))

  const shopAddresses = await db.address.findMany({
    where: {
      userId: { in: owners.map((o) => o.userId) },
      type: "OFFICE",
      latitude: { not: null },
      longitude: { not: null },
    },
  })
  const coordsByUser = new Map(shopAddresses.map((a) => [a.userId, a]))

  const originLat = Number(home.latitude)
  const originLng = Number(home.longitude)

  return shops.map((shop) => {
    const userId = userIdByShop.get(shop.id)
    const addr = userId ? coordsByUser.get(userId) : undefined
    if (!addr?.latitude || !addr?.longitude) return shop
    const km = haversineKm(originLat, originLng, Number(addr.latitude), Number(addr.longitude))
    return { ...shop, distanceKm: Math.round(km * 10) / 10 }
  })
}

const SHOP_INCLUDE = { promotions: { where: { status: "ACTIVE" as const }, take: 1 } }
const RECOMMENDED_SHOP_COUNT = 6

async function topRatedShops(excludeIds: string[], take: number): Promise<HomeFeaturedShop[]> {
  if (take <= 0) return []
  const shops = await db.shopkeeperProfile.findMany({
    where: excludeIds.length > 0 ? { id: { notIn: excludeIds } } : undefined,
    orderBy: [{ isFeatured: "desc" }, { rating: "desc" }],
    take,
    include: SHOP_INCLUDE,
  })
  return shops.map(mapShop)
}

/** Real, activity-based shop recommendations: ranks shops by the customer's
 * own real orders, wishlisted products, recently viewed products, and jobs
 * booked with providers affiliated to a shop — genuine ledger data, not a
 * synthetic score. Any remaining slots (including for signed-out visitors or
 * customers with no activity yet) are filled with featured/top-rated shops
 * so the section always shows at least RECOMMENDED_SHOP_COUNT shops. */
export async function getRecommendedShops(): Promise<HomeFeaturedShop[]> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return topRatedShops([], RECOMMENDED_SHOP_COUNT)
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
    shops = rankedIds.map((id) => byId.get(id)).filter((r): r is ShopWithPromotions => Boolean(r)).map(mapShop)
  }

  if (shops.length < RECOMMENDED_SHOP_COUNT) {
    shops = [...shops, ...(await topRatedShops(shops.map((s) => s.id), RECOMMENDED_SHOP_COUNT - shops.length))]
  }

  return withShopDistances(shops, customerId)
}

export type MixedFeedShop = {
  kind: "shop"
  id: string
  name: string
  image: string | null
  rating: number
  reviews: number
  isOpen: boolean
  hoursLabel: string | null
  hasSale: boolean
}

export type MixedFeedProvider = {
  kind: "provider"
  providerId: string
  name: string
  avatar: string | null
  verified: boolean
  categoryName: string | null
  rating: number
  reviewCount: number
  hourlyRate: number
  location: string
  specialties: string[]
}

export type MixedFeedBusiness = {
  kind: "business"
  providerId: string
  name: string
  avatar: string | null
  verified: boolean
  categoryName: string | null
  rating: number
  reviewCount: number
  location: string
  specialties: string[]
  branchCount: number
  staffCount: number
  completedJobs: number
}

export type MixedFeedItem = MixedFeedShop | MixedFeedProvider | MixedFeedBusiness

/** Interleaves the three real entity types the home page's "nearby"/
 * "recommended" rows show — shops, solo providers, and business-owner
 * providers — into one feed. There's no real geolocation on any of these
 * models, so (like getNearbyProviders) this is a top-rated preview, not an
 * actual distance sort. Business cards show real stats (branches, staff,
 * completed jobs) rather than the "Projects" concept, since Business-account
 * Projects has no real backing feature yet. */
export async function getNearbyMixedFeed(take = 9, skip = 0): Promise<MixedFeedItem[]> {
  const perKind = Math.max(2, Math.ceil(take / 3))
  const perKindSkip = Math.floor(skip / 3)

  const [shops, providers, businesses] = await Promise.all([
    db.shopkeeperProfile.findMany({ orderBy: [{ isFeatured: "desc" }, { rating: "desc" }], take: perKind, skip: perKindSkip, include: SHOP_INCLUDE }),
    db.providerProfile.findMany({
      where: { verified: true, isBusinessOwner: false },
      include: { user: true, category: true },
      orderBy: { rating: "desc" },
      take: perKind,
      skip: perKindSkip,
    }),
    db.providerProfile.findMany({
      where: { isBusinessOwner: true },
      include: { user: true, category: true, _count: { select: { staff: true, branches: true } } },
      orderBy: { rating: "desc" },
      take: perKind,
      skip: perKindSkip,
    }),
  ])

  const shopItems: MixedFeedItem[] = shops.map((s) => ({ kind: "shop", ...mapShop(s) }))
  const providerItems: MixedFeedItem[] = providers.map((p) => ({
    kind: "provider",
    providerId: p.id,
    name: p.user.name,
    avatar: p.user.image,
    verified: p.verified,
    categoryName: p.category?.name ?? null,
    rating: Number(p.rating),
    reviewCount: p.reviewCount,
    hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : 0,
    location: p.workAreas[0] ?? p.location ?? "Nairobi",
    specialties: p.skills.slice(0, 3),
  }))
  const businessItems: MixedFeedItem[] = businesses.map((b) => ({
    kind: "business",
    providerId: b.id,
    name: b.businessName ?? b.user.name,
    avatar: b.user.image,
    verified: b.verified,
    categoryName: b.category?.name ?? null,
    rating: Number(b.rating),
    reviewCount: b.reviewCount,
    location: b.workAreas[0] ?? b.location ?? "Nairobi",
    specialties: b.skills.slice(0, 3),
    branchCount: b._count.branches,
    staffCount: b._count.staff,
    completedJobs: b.completedJobs,
  }))

  // Round-robin interleave (shop, provider, business, shop, ...) so the row
  // reads as genuinely mixed rather than three blocks stitched together.
  const merged: MixedFeedItem[] = []
  const lanes = [shopItems, providerItems, businessItems]
  for (let i = 0; merged.length < take && lanes.some((l) => l.length > i); i++) {
    for (const lane of lanes) {
      if (lane[i]) merged.push(lane[i])
      if (merged.length >= take) break
    }
  }
  return merged
}

export async function getAllShops(): Promise<HomeFeaturedShop[]> {
  const shops = await db.shopkeeperProfile.findMany({
    orderBy: [{ isFeatured: "desc" }, { rating: "desc" }],
    include: SHOP_INCLUDE,
  })
  return shops.map(mapShop)
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

export type NearbyProvider = {
  providerId: string
  name: string
  avatar: string | null
  verified: boolean
  categoryName: string | null
  rating: number
  reviewCount: number
  hourlyRate: number
  location: string
}

/** Named for what customers actually browse for ("Nearby Providers" reads
 * naturally in the UI), but this is really a top-rated preview —
 * ProviderProfile has no latitude/longitude (only free-text
 * location/workAreas), so there is no real distance to sort or display by.
 * Shows the provider's real work-area text instead of a fabricated "X km
 * away". Mirrors lib/actions/specialists.ts's getSpecialists() query shape,
 * trimmed to what a homepage preview row needs. */
export async function getNearbyProviders(take = 5): Promise<NearbyProvider[]> {
  const providers = await db.providerProfile.findMany({
    where: { verified: true },
    include: { user: true, category: true },
    orderBy: { rating: "desc" },
    take,
  })

  return providers.map((p) => ({
    providerId: p.id,
    name: p.user.name,
    avatar: p.user.image,
    verified: p.verified,
    categoryName: p.category?.name ?? null,
    rating: Number(p.rating),
    reviewCount: p.reviewCount,
    hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : 0,
    location: p.workAreas[0] ?? p.location ?? "Nairobi",
  }))
}
