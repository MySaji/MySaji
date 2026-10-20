"use server"

import { resolvePosActor } from "@/backend/services/pos-access-core"

import { POS_ROLE_META, type PosRole, type PosPermission } from "@/backend/domain/pos-permissions"

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

export type PermissionCheck =
  | { ok: true; actor: PosActor }
  | { ok: false; error: string; reason: "no-business" | "forbidden" }

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

export async function getPosWhoAmI(staffId?: string | null): Promise<PosWhoAmI | null> {
  const actor = await resolvePosActor(staffId)
  if (!actor) return null
  const { POS_PERMISSIONS } = await import("@/backend/domain/pos-permissions")
  return {
    businessId: actor.businessId,
    businessName: actor.businessName,
    name: actor.name,
    role: actor.role,
    roleLabel: POS_ROLE_META[actor.role].label,
    roleDescription: POS_ROLE_META[actor.role].description,
    permissions: POS_PERMISSIONS.filter(p => actor.can(p)),
    storeId: actor.storeId,
    isOwner: actor.role === "OWNER",
  }
}
