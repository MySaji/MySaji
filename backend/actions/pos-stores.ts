"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { auth } from "@/backend/auth"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"
import { posShopIdFor } from "@/backend/services/pos-tenant"
import { parsePosConfig } from "@/backend/domain/pos-config"

/**
 * Branches.
 *
 * WHAT A BRANCH IS HERE
 *
 * Its own stock, its own till sessions, its own staff, its own takings. The
 * shopkeeper who owns three dukas wants three sets of those and one place to
 * stand and look at all of them, which is what a POS business is: one
 * business, several stores, one owner.
 *
 * In this schema a store's stock lives against a ShopkeeperProfile, so a
 * branch gets one of its own. That is what the `userId` unique constraint on
 * that table used to prevent, and relaxing it is the whole reason this file
 * can exist. See services/shopkeeper-scope.ts for what changed on the
 * marketplace side.
 *
 * WHAT A BRANCH DELIBERATELY SHARES
 *
 * The owner, the staff list, the subscription, and the catalogue's shape but
 * not its stock. Nothing here copies products: a new branch starts empty and
 * the shopkeeper receives stock into it, because pretending a branch has
 * twenty crates it has never seen is how a stock figure stops meaning
 * anything. What it does copy is the SETTINGS, since a shopkeeper opening a
 * second duka wants it to behave like the first.
 *
 * WHY A BRANCH IS NEVER A STOREFRONT
 *
 * It is created unlisted. A shop sells on SAJI as one business with one
 * storefront, and three branches appearing as three sellers of the same
 * goods would be a worse marketplace. The original shop keeps whatever
 * listing it had.
 */

export type StoreRow = {
  id: string
  name: string
  shopkeeperId: string
  /** True for the store this person is working in right now. */
  active: boolean
  /** The first store, which cannot be closed and is the marketplace's shop. */
  isMain: boolean
  productCount: number
  staffCount: number
  /** What this branch took today, so the switcher is worth looking at. */
  takingsToday: number
  createdAt: string
}

export type StoresView = {
  businessName: string
  rows: StoreRow[]
  canManage: boolean
} | null

export async function getMyStores(input?: unknown): Promise<StoresView> {
  const parsed = z.object({ staffId: z.string().trim().max(60).optional() }).safeParse(input ?? {})
  const g = await requirePosPermission("settings.store", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return null

  const business = await db.posBusiness.findUnique({
    where: { id: g.actor.businessId },
    select: {
      name: true,
      activeStoreId: true,
      stores: {
        where: { isActive: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, shopkeeperId: true, createdAt: true },
      },
    },
  })
  if (!business) return null

  const shopIds = business.stores.map((s) => s.shopkeeperId)
  const since = new Date()
  since.setHours(0, 0, 0, 0)

  const [products, staff, takings] = await Promise.all([
    db.product.groupBy({ by: ["shopkeeperId"], where: { shopkeeperId: { in: shopIds } }, _count: { id: true } }),
    db.posStaff.groupBy({
      by: ["storeId"],
      where: { businessId: g.actor.businessId, isActive: true },
      _count: { id: true },
    }),
    db.posSale.groupBy({
      by: ["shopkeeperId"],
      where: {
        shopkeeperId: { in: shopIds },
        occurredAt: { gte: since },
        status: { notIn: ["VOIDED", "PARKED"] },
      },
      _sum: { total: true },
    }),
  ])

  const productBy = new Map(products.map((p) => [p.shopkeeperId, p._count.id]))
  const staffBy = new Map(staff.map((s) => [s.storeId, s._count.id]))
  const takingsBy = new Map(takings.map((t) => [t.shopkeeperId, Number(t._sum.total ?? 0)]))

  const activeId = business.activeStoreId ?? business.stores[0]?.id ?? null

  return {
    businessName: business.name,
    rows: business.stores.map((s, i) => ({
      id: s.id,
      name: s.name,
      shopkeeperId: s.shopkeeperId,
      active: s.id === activeId,
      isMain: i === 0,
      productCount: productBy.get(s.shopkeeperId) ?? 0,
      staffCount: staffBy.get(s.id) ?? 0,
      takingsToday: takingsBy.get(s.shopkeeperId) ?? 0,
      createdAt: s.createdAt.toISOString(),
    })),
    canManage: g.actor.can("settings.business"),
  }
}

export type StoreResult = { success: true; storeId: string } | { success: false; error: string }

/**
 * Open another branch.
 *
 * Owner only, deliberately: a manager runs a shop, they do not decide the
 * business has another one. The new branch copies the first store's settings
 * and starts with no stock.
 */
export async function addStore(input: unknown): Promise<StoreResult> {
  const parsed = z.object({
    name: z.string().trim().min(2, "Give the branch a name").max(80),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the name" }
  const body = parsed.data

  const g = await requirePosPermission("settings.business", body.staffId)
  if (!g.ok) return { success: false, error: g.error }
  if (!g.actor.userId) return { success: false, error: "Only the owner can open a branch." }

  const business = await db.posBusiness.findUnique({
    where: { id: g.actor.businessId },
    select: {
      id: true,
      ownerUserId: true,
      stores: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, shopkeeperId: true },
      },
    },
  })
  if (!business) return { success: false, error: "There is no POS business on this account." }
  if (business.ownerUserId !== g.actor.userId) {
    return { success: false, error: "Only the owner of the business can open a branch." }
  }
  if (business.stores.some((s) => s.name.toLowerCase() === body.name.toLowerCase())) {
    return { success: false, error: "There is already a branch called " + body.name + "." }
  }
  // A limit that exists to catch a loop, not to ration branches.
  if (business.stores.length >= 25) {
    return { success: false, error: "That is a lot of branches. Talk to support before adding more." }
  }

  const first = business.stores[0]
  const template = first
    ? await db.shopkeeperProfile.findUnique({
        where: { id: first.shopkeeperId },
        select: { posProfileKey: true, posTraits: true, posConfig: true },
      })
    : null

  try {
    const created = await db.$transaction(async (tx) => {
      // The branch's own shop. Unlisted: branches are not separate sellers.
      const profile = await tx.shopkeeperProfile.create({
        data: {
          userId: business.ownerUserId,
          shopName: body.name,
          listedOnMarketplace: false,
          posEnabled: true,
          posActivatedAt: new Date(),
          posProfileKey: template?.posProfileKey ?? "GENERAL",
          posTraits: template?.posTraits ?? [],
          posConfig: (template ? parsePosConfig(template.posConfig) : parsePosConfig(undefined)) as never,
        },
        select: { id: true },
      })

      const store = await tx.posStore.create({
        data: { businessId: business.id, shopkeeperId: profile.id, name: body.name },
        select: { id: true },
      })
      return store
    }, { timeout: 30000, maxWait: 10000 })

    await recordPosAudit({
      actor: g.actor,
      action: "store.add",
      summary: g.actor.name + " opened a branch called " + body.name,
      entityType: "store",
      entityId: created.id,
    })

    return { success: true, storeId: created.id }
  } catch {
    return { success: false, error: "The branch could not be created. Try again." }
  }
}

/**
 * Work in a different branch.
 *
 * Everything the till does afterwards, from the product list to the shift to
 * the takings, follows this. Staff never call it: their seat says where they
 * work, and a cashier who could move themselves between branches could move
 * a sale too.
 */
export async function switchStore(input: unknown): Promise<StoreResult> {
  const parsed = z.object({
    storeId: z.string().trim().min(1),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const body = parsed.data

  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Sign in first." }

  const business = await db.posBusiness.findUnique({
    where: { ownerUserId: session.user.id },
    select: { id: true, stores: { where: { isActive: true }, select: { id: true, name: true } } },
  })
  if (!business) return { success: false, error: "Only the owner can move between branches." }

  const target = business.stores.find((s) => s.id === body.storeId)
  if (!target) return { success: false, error: "That branch is not part of this business." }

  await db.posBusiness.update({ where: { id: business.id }, data: { activeStoreId: target.id } })
  return { success: true, storeId: target.id }
}

/**
 * Close a branch.
 *
 * Never a delete, for the same reason a product is never deleted: its sales,
 * its stock movements and its shifts are the business's record. Closing takes
 * it out of the switcher and off the staff postings, and the figures stay.
 */
export async function closeStore(input: unknown): Promise<StoreResult> {
  const parsed = z.object({
    storeId: z.string().trim().min(1),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const body = parsed.data

  const g = await requirePosPermission("settings.business", body.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const business = await db.posBusiness.findUnique({
    where: { id: g.actor.businessId },
    select: {
      id: true,
      ownerUserId: true,
      activeStoreId: true,
      stores: {
        where: { isActive: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, shopkeeperId: true },
      },
    },
  })
  if (!business) return { success: false, error: "There is no POS business on this account." }
  if (business.ownerUserId !== g.actor.userId) {
    return { success: false, error: "Only the owner of the business can close a branch." }
  }

  const index = business.stores.findIndex((s) => s.id === body.storeId)
  if (index === -1) return { success: false, error: "That branch is not part of this business." }
  if (index === 0) {
    return { success: false, error: "The first branch cannot be closed. It is the business's own shop." }
  }

  // A shift still open means somebody is at that counter with a drawer that
  // has not been counted.
  const openShift = await db.tillSession.findFirst({
    where: { shopkeeperId: business.stores[index].shopkeeperId, closedAt: null },
    select: { id: true },
  })
  if (openShift) {
    return { success: false, error: "Close the till at " + business.stores[index].name + " first." }
  }

  await db.$transaction(async (tx) => {
    await tx.posStore.update({ where: { id: body.storeId }, data: { isActive: false } })
    // Nobody is left working in a branch that is closed.
    await tx.posStaff.updateMany({ where: { storeId: body.storeId }, data: { storeId: null } })
    if (business.activeStoreId === body.storeId) {
      await tx.posBusiness.update({ where: { id: business.id }, data: { activeStoreId: business.stores[0].id } })
    }
  }, { timeout: 30000, maxWait: 10000 })

  await recordPosAudit({
    actor: g.actor,
    action: "store.close",
    summary: g.actor.name + " closed the branch " + business.stores[index].name,
    entityType: "store",
    entityId: body.storeId,
  })

  return { success: true, storeId: body.storeId }
}

/** Which branch this person is in, for the header on every till screen. */
export async function getCurrentStore(): Promise<{ name: string; isOnlyOne: boolean } | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const shopId = await posShopIdFor(session.user.id)
  if (!shopId) return null

  const store = await db.posStore.findFirst({
    where: { shopkeeperId: shopId, isActive: true },
    select: { name: true, businessId: true },
  })
  if (!store) return null

  const count = await db.posStore.count({ where: { businessId: store.businessId, isActive: true } })
  return { name: store.name, isOnlyOne: count <= 1 }
}
