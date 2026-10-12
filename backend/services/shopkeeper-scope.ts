import { db } from "@/backend/db"

/**
 * Which shop belongs to this account.
 *
 * WHY THIS EXISTS
 *
 * It used to be a constraint: `ShopkeeperProfile.userId` was unique, so
 * "their shop" was a `findUnique` and could only ever mean one thing. That
 * also meant a shopkeeper with two branches could not have two branches,
 * because a branch needs its own stock, its own till sessions and its own
 * staff, which in this schema is its own ShopkeeperProfile.
 *
 * With the constraint relaxed, the question has more than one answer, and
 * the dangerous outcome is not an error: it is twenty call sites each
 * picking whichever row the database happened to return first, so a
 * shopkeeper's payout lands against one branch on Monday and another on
 * Tuesday. So the question is asked in exactly one place, here, and the
 * answer is defined rather than incidental.
 *
 * THE RULE
 *
 * The oldest profile is the primary one. Every account that existed before
 * branches did has exactly one, so it is the same row those callers were
 * already getting, and a branch added later can never displace it.
 *
 * WHAT THE TILL USES INSTEAD
 *
 * Not this. A till acts on the store the person is working in, which
 * actions/pos-access.ts resolves from their POS business and staff seat.
 * This helper answers the MARKETPLACE's question, which is about the
 * account rather than the counter.
 */

/** Columns every caller of this helper has needed so far. */
const PRIMARY_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }]

/**
 * The account's main shop, or null where it has none.
 *
 * Takes an optional `select` so callers can ask for the same columns they
 * did before. Ordered by age, then by id, so two profiles created in the
 * same millisecond still resolve to the same one every time.
 */
export async function primaryShopOf(userId: string) {
  return db.shopkeeperProfile.findFirst({
    where: { userId },
    orderBy: PRIMARY_ORDER,
  })
}

/** The same, but only the id, for the many callers that need nothing else. */
export async function primaryShopIdOf(userId: string): Promise<string | null> {
  const shop = await db.shopkeeperProfile.findFirst({
    where: { userId },
    orderBy: PRIMARY_ORDER,
    select: { id: true },
  })
  return shop?.id ?? null
}

/** Whether this account has a shop at all. */
export async function hasShop(userId: string): Promise<boolean> {
  return (await db.shopkeeperProfile.count({ where: { userId } })) > 0
}

/**
 * The `include` a query uses to pull the primary shop alongside a user.
 *
 * Spread into an existing include so the relation comes back as a
 * one-element array holding the same row `primaryShopOf` would return, and
 * callers read `user.shopkeeperProfiles[0]`. Written as a helper so the
 * ordering lives in one place rather than being retyped, and mistyped, at
 * each call site.
 */
export function primaryShopInclude<T>(select?: T) {
  return {
    orderBy: PRIMARY_ORDER,
    take: 1,
    ...(select ? { select } : {}),
  }
}
