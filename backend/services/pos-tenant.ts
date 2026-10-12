import { db } from "@/backend/db"
import { primaryShopIdOf } from "@/backend/services/shopkeeper-scope"

/**
 * Which shop a till action is acting on.
 *
 * WHY THIS IS NOT "THEIR SHOP"
 *
 * Eight POS modules each resolved the tenant for themselves, and each did it
 * the same wrong way once a business could have two branches: they looked up
 * the profile belonging to the signed-in account. Meanwhile actions/pos-access
 * resolved the STORE the person is working in. With one branch those two
 * always agreed. With two they would not, and the disagreement would be
 * silent and awful: the cashier rings up a sale at the Kawangware branch
 * while stock comes off the Westlands shelf.
 *
 * So the question has one answer, here.
 *
 * THE ORDER
 *
 *   1. The store the owner has chosen, where they own a POS business.
 *   2. Their business's first store, where they have not chosen one.
 *   3. The store their staff seat belongs to, for everyone who is not an
 *      owner. A cashier does not choose; they work where they are posted.
 *   4. Failing all of that, the account's primary shop, which is the case
 *      for every shop that had a till before POS businesses existed and has
 *      not been backfilled yet.
 *
 * Step 4 is what makes this safe to roll out: an account with no PosBusiness
 * row resolves exactly as it did before.
 */
export async function posShopIdFor(userId: string): Promise<string | null> {
  const owned = await db.posBusiness.findUnique({
    where: { ownerUserId: userId },
    select: {
      activeStoreId: true,
      stores: {
        where: { isActive: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, shopkeeperId: true },
      },
    },
  })

  if (owned && owned.stores.length > 0) {
    // The chosen store, but only if it is still one of theirs and still
    // active: a store can be closed while it is the one selected.
    const chosen = owned.activeStoreId
      ? owned.stores.find((s) => s.id === owned.activeStoreId)
      : null
    return (chosen ?? owned.stores[0]).shopkeeperId
  }

  const seat = await db.posStaff.findFirst({
    where: { userId, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      store: { select: { shopkeeperId: true, isActive: true } },
      business: {
        select: {
          stores: {
            where: { isActive: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 1,
            select: { shopkeeperId: true },
          },
        },
      },
    },
  })
  if (seat) {
    if (seat.store?.isActive) return seat.store.shopkeeperId
    // A seat with no store of its own falls back to the business's first,
    // which is what a staff member posted "to the business" means.
    const first = seat.business.stores[0]
    if (first) return first.shopkeeperId
  }

  return primaryShopIdOf(userId)
}
