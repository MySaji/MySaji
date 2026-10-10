"use server"

import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { buildProviderSlug } from "@/backend/domain/provider-slug"
import { ROLE_APP_TO_DB } from "@/backend/services/role-map"

export type SwitchableRole = "customer" | "provider" | "shopkeeper"

const SWITCHABLE_ROLES: SwitchableRole[] = ["customer", "provider", "shopkeeper"]

function isSwitchableRole(role: string): role is SwitchableRole {
  return (SWITCHABLE_ROLES as string[]).includes(role)
}

export type MyRoleProfiles = {
  currentRole: SwitchableRole
  hasCustomer: boolean
  hasProvider: boolean
  hasShopkeeper: boolean
} | null

/** Powers the header account-switcher dropdown. Deliberately scoped to
 * customer/provider/shopkeeper only — distributor and every staff role
 * (agent/secretary/sub-admin/admin) are out of scope for self-service
 * switching, so this returns null for any of those. */
export async function getMyRoleProfiles(): Promise<MyRoleProfiles> {
  const session = await auth()
  if (!session?.user?.id || !isSwitchableRole(session.user.role)) return null

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      customerProfile: { select: { id: true } },
      providerProfile: { select: { id: true } },
      shopkeeperProfile: { select: { id: true } },
    },
  })
  if (!user) return null

  return {
    currentRole: session.user.role,
    hasCustomer: !!user.customerProfile,
    hasProvider: !!user.providerProfile,
    hasShopkeeper: !!user.shopkeeperProfile,
  }
}

export type SwitchRoleResult =
  | { success: true; isFirstTime: boolean }
  | { success: false; error: string }

/** Generalizes the old switchToShopkeeperAccount/switchToProviderAccount
 * pair (lib/actions/shop-upgrade-requests.ts) from that one pair to all 3
 * self-service roles, and — confirmed with the user — drops the
 * staff-approval-ticket requirement that used to gate creating a second
 * profile for the first time. Adding a role you don't have yet now works
 * exactly like a fresh signup choosing that role: the profile is created
 * immediately with the same defaults registerUser() uses, and the
 * destination portal's own KYC/pending screen (unchanged) takes it from
 * there. A User has exactly one `role` at a time, but customerProfile/
 * providerProfile/shopkeeperProfile are independent optional relations, so
 * the account keeps every profile it's ever created — `role` is just which
 * portal is active right now, free to flip back and forth.
 *
 * Deliberately writes `role` and nothing else. This used to rewrite
 * `kycStatus` on every switch — APPROVED when switching to customer, and
 * PENDING/APPROVED from the destination profile's own verified flag
 * otherwise — which made two false claims once progressive KYC gave that
 * field a single meaning: it said an account's identity documents had been
 * approved when none had been submitted, and it overwrote a genuine
 * APPROVED verdict with PENDING just because the profile being switched to
 * was new. Verification belongs to the person, not to whichever portal is
 * open, so neither `kycStatus` nor `verificationStatus` is touched here. The
 * per-portal registration banners now read their own profile's isVerified
 * flag instead (see app/shopkeeper/layout.tsx). */
export async function switchActiveRole(targetRole: SwitchableRole): Promise<SwitchRoleResult> {
  const session = await auth()
  if (!session?.user?.id || !isSwitchableRole(session.user.role)) {
    return { success: false, error: "You must be signed in as a customer, provider, or shopkeeper." }
  }
  if (!isSwitchableRole(targetRole)) {
    return { success: false, error: "Invalid role." }
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { customerProfile: true, providerProfile: true, shopkeeperProfile: true },
  })
  if (!user) return { success: false, error: "Account not found." }

  const dbRole = ROLE_APP_TO_DB[targetRole]

  if (targetRole === "customer") {
    if (user.customerProfile) {
      await db.user.update({ where: { id: user.id }, data: { role: dbRole } })
      return { success: true, isFirstTime: false }
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { role: dbRole } })
      await tx.customerProfile.create({ data: { userId: user.id } })
    })
    return { success: true, isFirstTime: true }
  }

  if (targetRole === "provider") {
    if (user.providerProfile) {
      await db.user.update({ where: { id: user.id }, data: { role: dbRole } })
      return { success: true, isFirstTime: false }
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { role: dbRole } })
      const providerProfile = await tx.providerProfile.create({ data: { userId: user.id } })
      await tx.providerProfile.update({
        where: { id: providerProfile.id },
        data: { slug: buildProviderSlug(user.name, user.email, providerProfile.id) },
      })
    })
    return { success: true, isFirstTime: true }
  }

  // targetRole === "shopkeeper"
  if (user.shopkeeperProfile) {
    await db.user.update({ where: { id: user.id }, data: { role: dbRole } })
    return { success: true, isFirstTime: false }
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: dbRole } })
    await tx.shopkeeperProfile.create({ data: { userId: user.id, shopName: `${user.name}'s Shop` } })
  })
  return { success: true, isFirstTime: true }
}
