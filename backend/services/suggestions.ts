import { db } from "@/backend/db"
import type { Coordinates } from "@/backend/domain/geo"
import { distanceFrom } from "@/backend/domain/geo"
import { describeDistance, NEIGHBOURHOOD_KM } from "@/backend/services/proximity"

/**
 * What to put in front of this particular customer.
 *
 * WHY EVERY SUGGESTION CARRIES ITS REASON
 *
 * A feed that cannot say why something is in it is indistinguishable from an
 * advert, and people treat it as one. "Because you ordered from Mama Njeri"
 * and "open now, 600 m away" are both checkable: the customer knows whether
 * they ordered there, and they know how far 600 m is. A card that says
 * neither is asking to be scrolled past.
 *
 * It also keeps this honest internally. Every signal below has to produce a
 * sentence a person would accept, which rules out the kind of ranking that
 * works but cannot be explained.
 *
 * WHAT THIS IS NOT
 *
 * A model. There is nothing learned here and nothing trained: it is a set of
 * signals the customer themselves generated, weighted by how strongly each
 * one predicts what they want next, and decayed by how long ago it happened.
 * Calling that "AI" would be a stretch, so none of the copy does.
 *
 * THE ORDER THE SIGNALS ARE WORTH
 *
 *   bought it before      strongest. they spent money on this already
 *   saved it              deliberate, and still sitting there unbought
 *   looked at it          interest, but cheap to express, so weighted lower
 *   near and open now     not about them, but about whether they can act
 *   popular around here   weakest. other people, not this person
 */

export type SuggestionKind =
  | "REORDER"
  | "SAVED"
  | "VIEWED"
  | "NEARBY_OPEN"
  | "POPULAR_LOCAL"
  | "FROM_SHOP_YOU_USE"

export type Suggestion = {
  id: string
  kind: SuggestionKind
  title: string
  subtitle: string | null
  image: string | null
  href: string
  /** The sentence shown on the card. Never null: a card without one is cut. */
  reason: string
  /** Higher sorts first. Only meaningful within one response. */
  score: number
  /** Where it is, when that is part of why it is being shown. */
  distanceKm?: number | null
  distanceLabel?: string | null
}

/**
 * How much each kind of signal is worth before decay.
 *
 * These are judgements, not measurements, and they are in one place so they
 * can be argued with. The gap between buying and viewing is deliberately
 * wide: a tap costs nothing and money costs money.
 */
const WEIGHT: Record<SuggestionKind, number> = {
  REORDER: 100,
  SAVED: 70,
  FROM_SHOP_YOU_USE: 55,
  VIEWED: 40,
  NEARBY_OPEN: 35,
  POPULAR_LOCAL: 20,
}

/**
 * How much a signal fades with age.
 *
 * Half its value every three weeks. Something looked at this morning should
 * outrank something looked at in March, but March should not vanish: people
 * come back to things.
 */
function recencyFactor(at: Date | null | undefined, halfLifeDays = 21): number {
  if (!at) return 0.5
  const days = Math.max(0, (Date.now() - at.getTime()) / 86400000)
  return Math.pow(0.5, days / halfLifeDays)
}

/** Nearer is better, and sharply so inside the neighbourhood. */
function proximityFactor(distanceKm: number | null | undefined): number {
  if (distanceKm == null) return 1
  if (distanceKm <= NEIGHBOURHOOD_KM) return 1.4
  if (distanceKm <= 5) return 1.15
  if (distanceKm <= 15) return 1
  return 0.8
}

/**
 * Is this shop open at this moment?
 *
 * Opening hours are stored as "HH:MM" strings. A shop with none recorded is
 * treated as open rather than hidden: most dukas never fill this in, and
 * hiding them would empty the feed for an honest reason nobody would guess.
 */
function isOpenNow(opening: string | null, closing: string | null, now = new Date()): boolean {
  if (!opening || !closing) return true
  const [oh, om] = opening.split(":").map(Number)
  const [ch, cm] = closing.split(":").map(Number)
  if ([oh, om, ch, cm].some((n) => !Number.isFinite(n))) return true
  const mins = now.getHours() * 60 + now.getMinutes()
  const open = oh * 60 + om
  const close = ch * 60 + cm
  // A shop that closes after midnight, e.g. 18:00 to 02:00.
  return close < open ? mins >= open || mins <= close : mins >= open && mins <= close
}

export type SuggestionContext = {
  userId: string
  origin: Coordinates | null
  limit: number
}

/**
 * Everything the customer has told us by doing, gathered in one pass.
 *
 * One batch of queries rather than one per signal: this runs on the home
 * page, which is the most-loaded screen in the app, and the pooler on this
 * deployment does not forgive chatty pages.
 */
export async function buildSuggestions(ctx: SuggestionContext): Promise<Suggestion[]> {
  const { userId, origin } = ctx

  const [orders, wishlist, viewed] = await Promise.all([
    db.order.findMany({
      where: { customerId: userId, status: "DELIVERED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        createdAt: true,
        shopkeeperId: true,
        items: {
          take: 5,
          select: {
            productId: true,
            product: {
              select: {
                id: true, name: true, price: true, images: true, isActive: true,
                shopkeeper: { select: { id: true, shopName: true, listedOnMarketplace: true } },
              },
            },
          },
        },
      },
    }),
    db.wishlistItem.findMany({
      where: { customerId: userId, targetType: "PRODUCT", productId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        createdAt: true,
        product: {
          select: {
            id: true, name: true, price: true, discountPrice: true, images: true, isActive: true,
            shopkeeper: { select: { shopName: true, listedOnMarketplace: true } },
            inventory: { select: { currentStock: true } },
          },
        },
      },
    }),
    db.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: "desc" },
      take: 20,
      select: { targetType: true, targetId: true, title: true, subtitle: true, image: true, href: true, viewedAt: true },
    }),
  ])

  const out: Suggestion[] = []
  const seen = new Set<string>()

  const push = (s: Suggestion) => {
    if (seen.has(s.href)) return
    seen.add(s.href)
    out.push(s)
  }

  // ---- bought before -----------------------------------------------------
  //
  // The strongest signal there is, and the one a customer most expects to
  // see: the thing they buy every month should not have to be searched for.
  for (const order of orders) {
    for (const item of order.items) {
      const p = item.product
      if (!p || !p.isActive || !p.shopkeeper.listedOnMarketplace) continue
      push({
        id: "reorder-" + p.id,
        kind: "REORDER",
        title: p.name,
        subtitle: p.shopkeeper.shopName,
        image: p.images[0] ?? null,
        href: "/customer/products/" + p.id,
        reason: "You ordered this from " + p.shopkeeper.shopName + " before",
        score: WEIGHT.REORDER * recencyFactor(order.createdAt, 45),
      })
    }
  }

  // ---- saved and still unbought -------------------------------------------
  for (const w of wishlist) {
    const p = w.product
    if (!p || !p.isActive || !p.shopkeeper.listedOnMarketplace) continue
    const outOfStock = (p.inventory?.currentStock ?? 0) <= 0
    const onOffer = p.discountPrice != null && Number(p.discountPrice) < Number(p.price)
    push({
      id: "saved-" + p.id,
      kind: "SAVED",
      title: p.name,
      subtitle: p.shopkeeper.shopName,
      image: p.images[0] ?? null,
      href: "/customer/products/" + p.id,
      reason: outOfStock
        ? "You saved this. It is out of stock at the moment"
        : onOffer
          ? "You saved this, and the price has come down"
          : "You saved this for later",
      // Something saved and now cheaper is the most useful card on the page;
      // something saved and unavailable is the least, but still worth saying
      // so they stop waiting for it.
      score: WEIGHT.SAVED * recencyFactor(w.createdAt) * (onOffer ? 1.5 : outOfStock ? 0.4 : 1),
    })
  }

  // ---- looked at -----------------------------------------------------------
  for (const v of viewed) {
    push({
      id: "viewed-" + v.targetType + "-" + v.targetId,
      kind: "VIEWED",
      title: v.title,
      subtitle: v.subtitle,
      image: v.image,
      href: v.href,
      reason: "You were looking at this",
      score: WEIGHT.VIEWED * recencyFactor(v.viewedAt, 7),
    })
  }

  // ---- shops they already buy from ------------------------------------------
  //
  // Not the same product, but the shop. Somebody who buys from a duka every
  // week has a relationship with it, and what else it has is worth a look.
  const shopIds = [...new Set(orders.map((o) => o.shopkeeperId).filter(Boolean))].slice(0, 5) as string[]
  if (shopIds.length > 0) {
    const theirShops = await db.shopkeeperProfile.findMany({
      where: { id: { in: shopIds }, listedOnMarketplace: true },
      select: {
        id: true, shopName: true, shopLogoUrl: true, latitude: true, longitude: true,
        openingTime: true, closingTime: true,
      },
    })
    for (const shop of theirShops) {
      const distanceKm =
        origin && shop.latitude != null && shop.longitude != null
          ? distanceFrom(origin, { latitude: Number(shop.latitude), longitude: Number(shop.longitude) })
          : null
      const open = isOpenNow(shop.openingTime, shop.closingTime)
      push({
        id: "shop-" + shop.id,
        kind: "FROM_SHOP_YOU_USE",
        title: shop.shopName,
        subtitle: open ? "Open now" : "Closed at the moment",
        image: shop.shopLogoUrl,
        href: "/customer/shops/" + shop.id,
        reason: "You buy from here" + (distanceKm != null ? ", " + describeDistance(distanceKm) : ""),
        score: WEIGHT.FROM_SHOP_YOU_USE * proximityFactor(distanceKm) * (open ? 1 : 0.5),
        distanceKm,
        distanceLabel: describeDistance(distanceKm),
      })
    }
  }

  // ---- near, and open right now ----------------------------------------------
  //
  // Nothing to do with who they are, and everything to do with whether they
  // can act in the next ten minutes. Only shown when we know where they are;
  // guessing would make the distances wrong, and a wrong distance is worse
  // than no card.
  if (origin) {
    const latDelta = 5 / 111
    const lngDelta = 5 / (111 * Math.max(0.2, Math.cos((origin.latitude * Math.PI) / 180)))
    const close = await db.shopkeeperProfile.findMany({
      where: {
        listedOnMarketplace: true,
        latitude: { gte: origin.latitude - latDelta, lte: origin.latitude + latDelta },
        longitude: { gte: origin.longitude - lngDelta, lte: origin.longitude + lngDelta },
      },
      take: 25,
      select: {
        id: true, shopName: true, shopLogoUrl: true, rating: true,
        latitude: true, longitude: true, openingTime: true, closingTime: true,
      },
    })

    for (const shop of close) {
      if (shop.latitude == null || shop.longitude == null) continue
      const distanceKm = distanceFrom(origin, {
        latitude: Number(shop.latitude),
        longitude: Number(shop.longitude),
      })
      if (distanceKm == null || distanceKm > 5) continue
      if (!isOpenNow(shop.openingTime, shop.closingTime)) continue
      push({
        id: "near-" + shop.id,
        kind: "NEARBY_OPEN",
        title: shop.shopName,
        subtitle: Number(shop.rating) > 0 ? Number(shop.rating).toFixed(1) + "★" : null,
        image: shop.shopLogoUrl,
        href: "/customer/shops/" + shop.id,
        reason: "Open now, " + describeDistance(distanceKm),
        score: WEIGHT.NEARBY_OPEN * proximityFactor(distanceKm),
        distanceKm,
        distanceLabel: describeDistance(distanceKm),
      })
    }
  }

  // ---- what people around here are buying --------------------------------------
  //
  // The weakest signal, and last for that reason: it is about other people.
  // Worth having for somebody brand new, who has generated no signals of
  // their own and would otherwise see an empty page.
  if (out.length < ctx.limit) {
    const popular = await db.product.findMany({
      where: { isActive: true, shopkeeper: { listedOnMarketplace: true }, totalSold: { gt: 0 } },
      orderBy: { totalSold: "desc" },
      take: 10,
      select: {
        id: true, name: true, images: true, totalSold: true,
        shopkeeper: { select: { shopName: true } },
      },
    })
    for (const p of popular) {
      push({
        id: "popular-" + p.id,
        kind: "POPULAR_LOCAL",
        title: p.name,
        subtitle: p.shopkeeper.shopName,
        image: p.images[0] ?? null,
        href: "/customer/products/" + p.id,
        reason: "People are buying this",
        score: WEIGHT.POPULAR_LOCAL,
      })
    }
  }

  return diversify(out.sort((a, b) => b.score - a.score), ctx.limit)
}

/**
 * Stop one shop owning the whole page.
 *
 * Pure ranking puts five things from the same duka at the top, which is both
 * dull and a worse answer: the point of a feed is to show a customer the
 * range of what they could do next. At most two cards of a kind run
 * together before something else gets a turn.
 */
function diversify(ranked: Suggestion[], limit: number): Suggestion[] {
  const out: Suggestion[] = []
  const pool = [...ranked]

  /** Would adding this make three of the same kind in a row? */
  const wouldRun = (s: Suggestion) =>
    out.length >= 2 && out[out.length - 1].kind === s.kind && out[out.length - 2].kind === s.kind

  while (out.length < limit && pool.length > 0) {
    // The best-ranked thing that does not make a run of three. Taken from
    // the pool each time rather than held back to the end: an earlier
    // version appended the skipped ones afterwards, which simply moved the
    // block of identical cards to the bottom of the row instead of
    // breaking it up.
    let pick = pool.findIndex((s) => !wouldRun(s))
    // Everything left is the same kind. Better a run than a short page.
    if (pick === -1) pick = 0
    out.push(pool.splice(pick, 1)[0])
  }

  return out
}
