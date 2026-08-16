import type { UserRole } from "@/lib/types"

// Confirmed access matrix (2026-07-13, revised 2026-07-22): Admin is
// reachable by everyone and can reach everyone; internal staff (Admin/
// Sub-Admin/Agent/Secretary) can all message each other; the public-facing
// roles (Customer/Provider/Shopkeeper) can message each other plus Admin.
// Distributor is deliberately NOT a general public-role peer — a Distributor
// may only message Shopkeeper (their wholesale buyers) or Admin, never
// Customer/Provider/another Distributor (confirmed with the user: wholesale
// relationships are Shopkeeper<->Distributor only). Sub-Admin/Agent/
// Secretary are deliberately NOT directly reachable by the public-facing
// roles — Admin is the one funnel point, by design, not an oversight.
const INTERNAL_ROLES: UserRole[] = ["admin", "sub-admin", "agent", "secretary"]
const PUBLIC_ROLES: UserRole[] = ["customer", "provider", "shopkeeper"]

function isInternal(role: UserRole): boolean {
  return INTERNAL_ROLES.includes(role)
}

function isPublic(role: UserRole): boolean {
  return PUBLIC_ROLES.includes(role)
}

export function canMessage(a: UserRole, b: UserRole): boolean {
  if (a === b) return isInternal(a) // same-role DMs only make sense among staff peers
  if (a === "admin" || b === "admin") return true
  if (isInternal(a) && isInternal(b)) return true
  if (a === "distributor" || b === "distributor") {
    const other = a === "distributor" ? b : a
    return other === "shopkeeper"
  }
  if (isPublic(a) && isPublic(b)) return true
  return false
}

/** Roles the given role is allowed to start a new conversation with. */
export function messageableRolesFor(role: UserRole): UserRole[] {
  if (role === "admin") return ["customer", "provider", "shopkeeper", "distributor", "sub-admin", "agent", "secretary", "admin"]
  if (isInternal(role)) return INTERNAL_ROLES
  if (role === "distributor") return ["shopkeeper", "admin"]
  if (role === "shopkeeper") return [...PUBLIC_ROLES.filter((r) => r !== role), "distributor", "admin"]
  return [...PUBLIC_ROLES.filter((r) => r !== role), "admin"]
}

export const ROLE_LABEL: Record<UserRole, string> = {
  customer: "Customer",
  provider: "Provider",
  shopkeeper: "Shopkeeper",
  distributor: "Distributor",
  admin: "Admin",
  "sub-admin": "Sub-Admin",
  agent: "Agent",
  secretary: "Secretary",
}
