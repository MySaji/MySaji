import "server-only"

import { activeUser } from "@/backend/services/active-user"

import { db } from "@/backend/db"

import { roleCan, refusalFor, type PosRole, type PosPermission } from "@/backend/domain/pos-permissions"

export type PosActor = {
  businessId: string
  businessName: string
  /** The store being acted on, where the business has settled on one. */
  storeId: string | null
  shopkeeperId: string | null
  userId: string | null
  staffId: string | null
  name: string
  role: PosRole
  can: (p: PosPermission) => boolean
}

export async function resolvePosActor(staffId?: string | null): Promise<PosActor | null> {
  const user = await activeUser()
  if (!user) return null
  const session = { user }
  const userId = user.id

  // The business this account owns, or one it holds a staff seat in.
  const owned = await db.posBusiness.findUnique({
    where: { ownerUserId: userId },
    select: {
      id: true, name: true,
      // activeStoreId, not simply the first store.
      //
      // This used to take stores[0], which meant an owner who had switched to
      // another branch still had every POS action land on the first one:
      // expenses filed against the wrong shop, a stock count drawn from the
      // wrong catalogue, a transfer that could never be received because the
      // actor was always the sending branch. The till never had the bug
      // because it resolves through posShopIdFor, which has always honoured
      // the choice. This now matches it.
      activeStoreId: true,
      stores: {
        where: { isActive: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, shopkeeperId: true },
      },
    },
  })

  let businessId: string
  let businessName: string
  let role: PosRole
  let name = session.user.name ?? "Owner"
  let storeId: string | null = null
  let shopkeeperId: string | null = null
  let resolvedStaffId: string | null = null
  /** Per-seat overrides. Empty means "whatever the role says". */
  let seatFeatures: string[] = []

  if (owned) {
    businessId = owned.id
    businessName = owned.name
    role = "OWNER"
    // Only if the chosen store is still one of theirs and still active: a
    // branch can be closed while it is the one selected.
    const chosen = owned.activeStoreId
      ? owned.stores.find((st) => st.id === owned.activeStoreId)
      : null
    const store = chosen ?? owned.stores[0]
    storeId = store?.id ?? null
    shopkeeperId = store?.shopkeeperId ?? null
  } else {
    let seat = await db.posStaff.findFirst({
      where: { userId, isActive: true },
      select: {
        id: true, name: true, role: true, storeId: true, features: true,
        business: { select: { id: true, name: true } },
        store: { select: { id: true, shopkeeperId: true, isActive: true } },
      },
    })

    // No seat under this user id, but there may be one waiting on the
    // address they signed in with. Claiming it here means an employee simply
    // signs in and is in, with no invite code to lose and nothing granted
    // until the address the owner invited matches the one they used.
    if (!seat) {
      const me = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, phone: true },
      })
      const identifiers = [me?.email, me?.phone].filter((x): x is string => !!x)
      if (identifiers.length > 0) {
        const waiting = await db.posStaff.findFirst({
          where: {
            userId: null,
            isActive: true,
            OR: [
              { email: { in: identifiers, mode: "insensitive" } },
              { phone: { in: identifiers } },
            ],
          },
          select: { id: true },
        })
        if (waiting) {
          const claimed = await db.posStaff.updateMany({
            where: { id: waiting.id, userId: null, isActive: true },
            data: { userId, claimedAt: new Date() },
          })
          if (claimed.count !== 1) return null
          seat = await db.posStaff.findFirst({
            where: { id: waiting.id, userId, isActive: true },
            select: {
              id: true, name: true, role: true, storeId: true, features: true,
              business: { select: { id: true, name: true } },
              store: { select: { id: true, shopkeeperId: true, isActive: true } },
            },
          })
        }
      }
    }

    if (!seat || (seat.store && seat.store.isActive === false)) return null
    businessId = seat.business.id
    businessName = seat.business.name
    role = seat.role as PosRole
    name = seat.name
    resolvedStaffId = seat.id
    seatFeatures = seat.features
    storeId = seat.store?.id ?? null
    shopkeeperId = seat.store?.shopkeeperId ?? null
    if (!storeId) {
      const first = await db.posStore.findFirst({
        where: { businessId, isActive: true },
        select: { id: true, shopkeeperId: true },
      })
      storeId = first?.id ?? null
      shopkeeperId = first?.shopkeeperId ?? null
    }
  }

  // A PIN sign-in at the till narrows WHO is acting, and can only ever
  // narrow: a cashier's PIN on the owner's device acts as the cashier.
  // Checked against this business, so a staff id from elsewhere is ignored
  // rather than honoured.
  if (staffId) {
    const atTill = await db.posStaff.findFirst({
      where: { id: staffId, businessId, isActive: true },
      select: { id: true, name: true, role: true, storeId: true, features: true, store: { select: { id: true, shopkeeperId: true, isActive: true } } },
    })
    if (!atTill || (role !== "OWNER" && atTill.id !== resolvedStaffId)) return null
    if (atTill) {
      resolvedStaffId = atTill.id
      name = atTill.name
      role = atTill.role as PosRole
      seatFeatures = atTill.features
      if (atTill.store) {
        if (!atTill.store.isActive) return null
        storeId = atTill.store.id; shopkeeperId = atTill.store.shopkeeperId
      }
    }
  }

  return {
    businessId,
    businessName,
    storeId,
    shopkeeperId,
    userId,
    staffId: resolvedStaffId,
    name,
    role,
    // A seat with its own list REPLACES the role's set rather than adding to
    // it, so what the owner ticked is exactly what this person has. An empty
    // list falls back to the role, which is what almost every seat uses.
    can: (p: PosPermission) =>
      seatFeatures.length > 0 ? seatFeatures.includes(p) : roleCan(role, p),
  }
}

export type PermissionCheck =
  | { ok: true; actor: PosActor }
  | { ok: false; error: string; reason: "no-business" | "forbidden" }

export async function requirePosPermission(
  permission: PosPermission,
  staffId?: string | null,
): Promise<PermissionCheck> {
  const actor = await resolvePosActor(staffId)
  if (!actor) {
    return { ok: false, reason: "no-business", error: "There is no POS business on this account." }
  }
  if (!actor.can(permission)) {
    return { ok: false, reason: "forbidden", error: refusalFor(permission, actor.role) }
  }
  return { ok: true, actor }
}

export async function recordPosAudit(input: {
  actor: Pick<PosActor, "businessId" | "storeId" | "userId" | "staffId" | "name">
  action: string
  summary: string
  entityType?: string
  entityId?: string
  detail?: unknown
}): Promise<void> {
  try {
    await db.posAuditEvent.create({
      data: {
        businessId: input.actor.businessId,
        storeId: input.actor.storeId,
        actorUserId: input.actor.userId,
        actorStaffId: input.actor.staffId,
        action: input.action.slice(0, 60),
        summary: input.summary.slice(0, 400),
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        detail: (input.detail ?? undefined) as never,
      },
    })
  } catch {
    // Logged nowhere else on purpose: this is already the logging path, and
    // a loop of failures writing about failures helps nobody.
  }
}
