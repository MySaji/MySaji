/**
 * Who the marketplace is allowed to show.
 *
 * A shop reaches SAJI two ways. Most signed up to sell to the public, and
 * belong in the browse grid, the search results and the feed. Some signed up
 * only for the till, and their catalogue is a private stock list: unit costs,
 * supplier names, the crate of sodas behind the counter. `listedOnMarketplace`
 * is the flag that separates the two, and a till only shop has it false.
 *
 * Every customer facing product query filtered on `isActive` alone, which is
 * a property of the PRODUCT, not of the shop. A till product has to be active
 * or the till cannot sell it, so a duka that had never heard of the
 * marketplace was publishing its stock to it: in the browse grid, in the shop
 * filter list, in search, and in the weekly email to every subscriber.
 *
 * These two fragments are the fix, in one place so there is one answer to
 * "can a customer see this". They live in a plain module rather than beside
 * the actions, because a "use server" file may export only async functions.
 *
 * Both are deliberately a tightening of what is shown. Nothing widens: a
 * shop that was listed before is listed now, since the flag defaults to true
 * and every existing storefront has it.
 */

import type { Prisma } from "@prisma/client"

/** A shop a customer is allowed to see. */
export const PUBLIC_SHOP_WHERE = { listedOnMarketplace: true } as const

/**
 * A product a customer is allowed to see: on sale, and sold by a shop that
 * is actually a storefront.
 *
 * Returned fresh each call rather than shared as a constant, because callers
 * spread it into a `where` they then add their own filters to.
 */
export function publicProductWhere(): Prisma.ProductWhereInput {
  return { isActive: true, shopkeeper: PUBLIC_SHOP_WHERE }
}

/*
 * The spatial shop query in actions/home.ts writes this predicate out by
 * hand. A $queryRaw template takes only Prisma.sql fragments and values, not
 * a string, and the predicate there has to name the alias that one query
 * gives the table, so a shared string helper would only invite someone to
 * interpolate it unsafely.
 */
