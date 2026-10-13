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

/** No longer wired to any UI: the account-switcher dropdown it fed was
 * removed. Left in place because it only reads which profiles the caller's own
 * account already has, which grants nothing, and it is what a restored
 * switcher would read first.
 *
 * Previously: powered the header account-switcher dropdown. Deliberately scoped to
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
      // One branch is enough to answer "do they have a shop".
      shopkeeperProfiles: { select: { id: true }, take: 1 },
    },
  })
  if (!user) return null

  return {
    currentRole: session.user.role,
    hasCustomer: !!user.customerProfile,
    hasProvider: !!user.providerProfile,
    hasShopkeeper: user.shopkeeperProfiles.length > 0,
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
/** Self-service role switching was removed on request, so this refuses.
 *
 * Hiding the dropdown would not have been enough. A "use server" export is
 * reachable by anyone who knows its action id, and this particular one both
 * rewrote User.role and created a provider or shopkeeper profile out of
 * nothing, so leaving it live would have left the whole capability live
 * behind a missing button.
 *
 * The implementation is kept directly below, unreferenced, because the
 * decision here is a product one rather than a defect: deleting it would mean
 * rebuilding the profile-creation and KYC reasoning from scratch if switching
 * ever comes back. To restore it, call performRoleSwitch from here and put the
 * switcher back in frontend/components/account-menu.tsx. */
export async function switchActiveRole(_targetRole: SwitchableRole): Promise<SwitchRoleResult> {
  return {
    success: false,
    error: "Switching between customer, provider and shopkeeper accounts is no longer available. Each account keeps the role it signed up with.",
  }
}

async function performRoleSwitch(targetRole: SwitchableRole): Promise<SwitchRoleResult> {
  const session = await auth()
  if (!session?.user?.id || !isSwitchableRole(session.user.role)) {
    return { success: false, error: "You must be signed in as a customer, provider, or shopkeeper." }
  }
  if (!isSwitchableRole(targetRole)) {
    return { success: false, error: "Invalid role." }
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      customerProfile: true,
      providerProfile: true,
      shopkeeperProfiles: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1 },
    },
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
  //
  // Switching into the shop portal needs a shop to switch into, and any
  // branch proves there is one. A second branch never makes this a first
  // time again.
  if (user.shopkeeperProfiles.length > 0) {
    await db.user.update({ where: { id: user.id }, data: { role: dbRole } })
    return { success: true, isFirstTime: false }
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: dbRole } })
    await tx.shopkeeperProfile.create({ data: { userId: user.id, shopName: `${user.name}'s Shop` } })
  })
  return { success: true, isFirstTime: true }
}
