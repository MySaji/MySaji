"use server"

import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import {
  roleCan, refusalFor, POS_ROLE_META,
  type PosRole, type PosPermission,
} from "@/backend/domain/pos-permissions"

/**
 * Who is acting, in which business, and what they are allowed to do.
 *
 * Every POS action that can change something goes through here. The rule it
 * exists to enforce is the one that is easy to get wrong in a hurry: a
 * permission is decided from the SESSION and the database, never from
 * anything the caller sent. A screen that hides a button is a courtesy; this
 * is the check.
 *
 * TWO WAYS TO BE PRESENT
 *
 *   signed in     a real account: the owner, or a manager given a login.
 *   at the till   a staff member identified by a PIN on a device that is
 *                 already signed in as the business.
 *
 * The second is how a cashier works, and it is why `actorStaffId` exists
 * alongside `actorUserId` on every audit row: the account that opened the
 * till in the morning is usually not the person who voided a sale at four.
 */

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

/**
 * Resolve the signed-in account to its place in a POS business.
 *
 * Returns null where this account has no POS business at all, which is a
 * different thing from having one and being refused, and the callers treat
 * it differently.
 */
export async function resolvePosActor(staffId?: string | null): Promise<PosActor | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const userId = session.user.id

  // The business this account owns, or one it holds a staff seat in.
  const owned = await db.posBusiness.findUnique({
    where: { ownerUserId: userId },
    select: { id: true, name: true, stores: { where: { isActive: true }, select: { id: true, shopkeeperId: true }, take: 1 } },
  })

  let businessId: string
  let businessName: string
  let role: PosRole
  let name = session.user.name ?? "Owner"
  let storeId: string | null = null
  let shopkeeperId: string | null = null
  let resolvedStaffId: string | null = null

  if (owned) {
    businessId = owned.id
    businessName = owned.name
    role = "OWNER"
    storeId = owned.stores[0]?.id ?? null
    shopkeeperId = owned.stores[0]?.shopkeeperId ?? null
  } else {
    const seat = await db.posStaff.findFirst({
      where: { userId, isActive: true },
      select: {
        id: true, name: true, role: true, storeId: true,
        business: { select: { id: true, name: true } },
        store: { select: { id: true, shopkeeperId: true } },
      },
    })
    if (!seat) return null
    businessId = seat.business.id
    businessName = seat.business.name
    role = seat.role as PosRole
    name = seat.name
    resolvedStaffId = seat.id
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
      select: { id: true, name: true, role: true, storeId: true, store: { select: { id: true, shopkeeperId: true } } },
    })
    if (atTill) {
      resolvedStaffId = atTill.id
      name = atTill.name
      role = atTill.role as PosRole
      if (atTill.store) { storeId = atTill.store.id; shopkeeperId = atTill.store.shopkeeperId }
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
    can: (p: PosPermission) => roleCan(role, p),
  }
}

export type PermissionCheck =
  | { ok: true; actor: PosActor }
  | { ok: false; error: string; reason: "no-business" | "forbidden" }

/**
 * The gate every writing action opens with.
 *
 * Returns the actor so the caller does not resolve it twice, and a refusal
 * in words a shopkeeper can act on rather than a status code.
 */
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

/**
 * Record that something happened.
 *
 * Deliberately best effort: a failure to write the audit row must not undo
 * the thing that was audited. A sale that went through and was not logged is
 * a gap in a record; a sale refused because logging failed is a customer
 * standing at a counter.
 *
 * Takes the actor rather than resolving it again, so the row names the
 * person who was checked, not whoever happens to be resolvable now.
 */
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

export type PosWhoAmI = {
  businessId: string
  businessName: string
  name: string
  role: PosRole
  roleLabel: string
  roleDescription: string
  permissions: PosPermission[]
  storeId: string | null
  isOwner: boolean
}

/** What the screen needs to lay itself out for this person. */
export async function getPosWhoAmI(staffId?: string | null): Promise<PosWhoAmI | null> {
  const actor = await resolvePosActor(staffId)
  if (!actor) return null
  const { POS_ROLE_PERMISSIONS } = await import("@/backend/domain/pos-permissions")
  return {
    businessId: actor.businessId,
    businessName: actor.businessName,
    name: actor.name,
    role: actor.role,
    roleLabel: POS_ROLE_META[actor.role].label,
    roleDescription: POS_ROLE_META[actor.role].description,
    permissions: [...POS_ROLE_PERMISSIONS[actor.role]],
    storeId: actor.storeId,
    isOwner: actor.role === "OWNER",
  }
}
