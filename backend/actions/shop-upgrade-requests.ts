"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { logAdminAction } from "@/backend/actions/admin-dashboard"
import { pushToUser } from "@/backend/actions/push"

// Providers request this from /provider/shop, which files a real
// SupportTicket (category "shop_upgrade") rather than a dedicated model —
// reviewing it here is what actually turns the ticket into a real role
// change. Admin, Sub-Admin, and Agent all see the same queue; whichever of
// them acts on it first resolves it for the other two.
async function requireShopUpgradeReviewer(): Promise<{ userId: string; name: string } | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (!["admin", "sub-admin", "agent"].includes(session.user.role)) return null
  return { userId: session.user.id, name: session.user.name ?? "Staff" }
}

const SHOP_UPGRADE_CATEGORY = "shop_upgrade"

export type ShopUpgradeRequest = {
  id: string
  userId: string
  providerName: string
  email: string
  phone: string | null
  message: string
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
  createdAt: string
}

export async function getShopUpgradeRequests(): Promise<ShopUpgradeRequest[]> {
  const reviewer = await requireShopUpgradeReviewer()
  if (!reviewer) return []

  const tickets = await db.supportTicket.findMany({
    where: { category: SHOP_UPGRADE_CATEGORY },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true, phone: true, role: true } } },
  })

  return tickets.map((t) => ({
    id: t.id,
    userId: t.userId,
    providerName: t.user.name,
    email: t.user.email,
    phone: t.user.phone,
    message: t.message,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
  }))
}

export type ShopUpgradeActionResult = { success: true } | { success: false; error: string }

const ticketIdSchema = z.object({ ticketId: z.string().trim().min(1) })

/** Approving marks the request eligible — it does **not** touch the
 * account's role or create a `ShopkeeperProfile` itself. That real account
 * conversion (a User has exactly one Role in this schema — no dual-role
 * support anywhere else in the app) only happens when the provider
 * deliberately triggers it themselves via `switchToShopkeeperAccount()`
 * (from their own Shop page, whenever they're ready), not automatically
 * the instant staff approve the request. Logging in with provider
 * credentials keeps landing them in the Provider portal, unchanged, until
 * they actively choose to switch. */
export async function approveShopUpgradeRequest(input: unknown): Promise<ShopUpgradeActionResult> {
  const reviewer = await requireShopUpgradeReviewer()
  if (!reviewer) return { success: false, error: "You must be signed in as Admin, Sub-Admin, or Agent." }

  const parsed = ticketIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const ticket = await db.supportTicket.findUnique({ where: { id: parsed.data.ticketId }, include: { user: true } })
  if (!ticket || ticket.category !== SHOP_UPGRADE_CATEGORY) return { success: false, error: "Request not found." }
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") return { success: false, error: "This request has already been reviewed." }
  if (ticket.user.role !== "PROVIDER") return { success: false, error: "This account is no longer a provider. It may have already been converted." }

  await db.$transaction(async (tx) => {
    await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: "RESOLVED" } })
    await tx.notification.create({
      data: {
        userId: ticket.userId,
        title: "Shop owner upgrade approved!",
        message: "Your request to become a shop owner has been approved. Visit your Shop page whenever you're ready to switch to your new Shopkeeper account.",
        type: "SYSTEM",
        actionUrl: "/provider/shop",
      },
    })
  })

  await pushToUser(ticket.userId, {
    title: "Shop owner upgrade approved!",
    body: "Visit your Shop page whenever you're ready to switch to your new Shopkeeper account.",
    url: "/provider/shop",
  })

  await logAdminAction({
    userId: reviewer.userId,
    action: "shop_upgrade.approve",
    entityType: "SupportTicket",
    entityId: ticket.id,
    oldValues: { ticketStatus: ticket.status },
    newValues: { ticketStatus: "RESOLVED" },
  })

  return { success: true }
}

export type SwitchAccountResult =
  | { success: true; isFirstTime: boolean }
  | { success: false; error: string }

/** Triggered by the provider themselves — either the first time, from their
 * own Shop page once their request shows as approved (this is the actual
 * account conversion that used to happen automatically at admin-approval
 * time — moved here so it's a deliberate action the provider takes when
 * *they're* ready), or any time after that, from the persistent portal
 * switcher, once both a provider and shopkeeper profile already exist on
 * the account. A User has exactly one `Role` at a time, but
 * `providerProfile`/`shopkeeperProfile` are independent optional relations
 * — so the same account keeps both profiles permanently once created, and
 * `role` is really just "which portal is active right now," free to flip
 * back and forth via this and `switchToProviderAccount()` below. */
export async function switchToShopkeeperAccount(): Promise<SwitchAccountResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") {
    return { success: false, error: "You must be signed in as a provider." }
  }

  const user = await db.user.findUnique({ where: { id: session.user.id }, include: { shopkeeperProfile: true } })
  if (!user || user.role !== "PROVIDER") return { success: false, error: "This account is no longer a provider." }

  // Already been through the one-time conversion before — just flip the
  // active portal back, no re-approval needed.
  //
  // This used to also rewrite `kycStatus` from the shop profile's own
  // isVerified flag, to undo whatever the provider side had left it at. That
  // shuffling is no longer needed or correct: under progressive KYC
  // `kycStatus` is the verdict on submitted identity documents and belongs
  // to the person, not to whichever portal is active, and each portal's
  // registration banner now reads its own profile's isVerified directly
  // (see app/shopkeeper/layout.tsx). Same reasoning as switchActiveRole in
  // lib/actions/account-switch.ts.
  if (user.shopkeeperProfile) {
    await db.user.update({
      where: { id: user.id },
      data: { role: "SHOPKEEPER" },
    })
    return { success: true, isFirstTime: false }
  }

  const ticket = await db.supportTicket.findFirst({
    where: { userId: session.user.id, category: SHOP_UPGRADE_CATEGORY, status: "RESOLVED" },
    orderBy: { createdAt: "desc" },
  })
  if (!ticket) return { success: false, error: "No approved shop upgrade request was found for your account." }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { role: "SHOPKEEPER" },
    })
    await tx.shopkeeperProfile.create({
      data: { userId: user.id, shopName: `${user.name}'s Shop` },
    })
  })

  return { success: true, isFirstTime: true }
}

/** The reverse direction of the switch above — always a repeat action,
 * since every account starts as a provider, so there's no "first time" case
 * to gate here. */
export async function switchToProviderAccount(): Promise<ShopUpgradeActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "shopkeeper") {
    return { success: false, error: "You must be signed in as a shopkeeper." }
  }

  const user = await db.user.findUnique({ where: { id: session.user.id }, include: { providerProfile: true } })
  if (!user || user.role !== "SHOPKEEPER") return { success: false, error: "This account is no longer a shopkeeper." }
  if (!user.providerProfile) return { success: false, error: "This account doesn't have a provider profile to switch back to." }

  await db.user.update({
    where: { id: user.id },
    data: { role: "PROVIDER" },
  })

  return { success: true }
}

export type PortalSwitchEligibility = {
  canSwitchToShopkeeper: boolean
  canSwitchToProvider: boolean
}

/** Tells each portal's sidebar whether to show its "switch to the other
 * portal" control at all — only once the account genuinely has both
 * profiles (a brand-new provider who's never gone through the shop-upgrade
 * flow has no shopkeeper side to switch to yet). */
export async function getPortalSwitchEligibility(): Promise<PortalSwitchEligibility> {
  const session = await auth()
  if (!session?.user?.id) return { canSwitchToShopkeeper: false, canSwitchToProvider: false }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { providerProfile: { select: { id: true } }, shopkeeperProfile: { select: { id: true } } },
  })
  return {
    canSwitchToShopkeeper: session.user.role === "provider" && !!user?.shopkeeperProfile,
    canSwitchToProvider: session.user.role === "shopkeeper" && !!user?.providerProfile,
  }
}

const rejectSchema = z.object({
  ticketId: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional(),
})

export async function rejectShopUpgradeRequest(input: unknown): Promise<ShopUpgradeActionResult> {
  const reviewer = await requireShopUpgradeReviewer()
  if (!reviewer) return { success: false, error: "You must be signed in as Admin, Sub-Admin, or Agent." }

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const ticket = await db.supportTicket.findUnique({ where: { id: parsed.data.ticketId } })
  if (!ticket || ticket.category !== SHOP_UPGRADE_CATEGORY) return { success: false, error: "Request not found." }
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") return { success: false, error: "This request has already been reviewed." }

  const reason = parsed.data.reason || "Your request did not meet our current requirements."

  await db.$transaction(async (tx) => {
    await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: "CLOSED" } })
    await tx.notification.create({
      data: {
        userId: ticket.userId,
        title: "Shop owner upgrade request declined",
        message: `Your request to become a shop owner was not approved: ${reason}`,
        type: "SYSTEM",
      },
    })
  })

  await pushToUser(ticket.userId, {
    title: "Shop owner upgrade request declined",
    body: reason,
    url: "/provider/shop",
  })

  await logAdminAction({
    userId: reviewer.userId,
    action: "shop_upgrade.reject",
    entityType: "SupportTicket",
    entityId: ticket.id,
    oldValues: { ticketStatus: ticket.status },
    newValues: { ticketStatus: "CLOSED", reason },
  })

  return { success: true }
}
