"use server"

import { z } from "zod"
import bcrypt from "bcryptjs"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { posShopIdFor } from "@/backend/services/pos-tenant"
import { parsePosConfig } from "@/backend/domain/pos-config"

/**
 * The people allowed to work the till, and the PINs that identify them.
 *
 * WHY CASHIERS ARE NOT USERS
 *
 * A shop assistant should be able to ring up a sale without a SAJI
 * account, an email address or a password they will forget — and the
 * shopkeeper should be able to revoke them the same afternoon they leave,
 * without that touching anything else. A `User` is a heavier thing than
 * that: it carries a wallet, a role, notifications and a login.
 *
 * So a cashier is a name and a PIN belonging to one shop. `userId` links
 * the row to a real account where the person happens to have one, which is
 * usually only the owner.
 *
 * WHAT A PIN IS AND IS NOT
 *
 * Four digits identify who is at the counter. They do not protect anything
 * valuable against someone who already has the till open, and are not
 * treated as if they did: they are hashed because they must not be
 * recoverable from the database, and that is the whole claim. Anyone who
 * can reach this page is already signed in as the shop.
 */

async function requireShopOwner() {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null
  // The store this person is working in, which for a business with branches
  // is not simply "the shop on their account". See services/pos-tenant.ts.
  const shopId = await posShopIdFor(session.user.id)
  if (!shopId) return null
  const shop = await db.shopkeeperProfile.findUnique({
    where: { id: shopId },
    select: { id: true, posEnabled: true, posConfig: true },
  })
  if (!shop || !shop.posEnabled) return null
  return {
    userId: session.user.id,
    userName: session.user.name ?? "Owner",
    shopkeeperId: shop.id,
    config: parsePosConfig(shop.posConfig),
  }
}

export type CashierRow = {
  id: string
  name: string
  role: string
  isActive: boolean
  /** True where this row is the owner's own. */
  isOwner: boolean
  createdAt: string
}

export async function getCashiers(): Promise<CashierRow[]> {
  const shop = await requireShopOwner()
  if (!shop) return []
  const rows = await db.posCashier.findMany({
    where: { shopkeeperId: shop.shopkeeperId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  })
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    isActive: c.isActive,
    isOwner: c.userId === shop.userId,
    createdAt: c.createdAt.toISOString(),
    // NOTE: pinHash is never returned. There is no path anywhere in this
    // module that reads a PIN back out — only ones that compare against it.
  }))
}

export type CashierResult = { success: true; cashierId: string } | { success: false; error: string }

const PIN = z.string().trim().regex(/^\d{4,6}$/, "A PIN is 4 to 6 digits")

const saveSchema = z.object({
  cashierId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2).max(60),
  role: z.enum(["cashier", "manager"]),
  /** Optional when editing: left blank, the existing PIN stands. */
  pin: PIN.optional(),
})

export async function saveCashier(input: unknown): Promise<CashierResult> {
  const shop = await requireShopOwner()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const d = parsed.data

  if (d.cashierId) {
    const existing = await db.posCashier.findFirst({
      where: { id: d.cashierId, shopkeeperId: shop.shopkeeperId },
      select: { id: true },
    })
    if (!existing) return { success: false, error: "That person is not on your till." }
    await db.posCashier.update({
      where: { id: existing.id },
      data: {
        name: d.name,
        role: d.role,
        ...(d.pin ? { pinHash: await bcrypt.hash(d.pin, 10) } : {}),
      },
    })
    return { success: true, cashierId: existing.id }
  }

  if (!d.pin) return { success: false, error: "Give them a PIN to sign in with." }

  // A duplicate PIN within one shop would make "who sold this" ambiguous,
  // which is the only thing a PIN is for. Checked by comparing against each
  // hash rather than by looking one up, because that is what a hash costs.
  const siblings = await db.posCashier.findMany({
    where: { shopkeeperId: shop.shopkeeperId, isActive: true },
    select: { pinHash: true },
  })
  for (const s of siblings) {
    if (await bcrypt.compare(d.pin, s.pinHash)) {
      return { success: false, error: "Someone on this till already uses that PIN. Choose another." }
    }
  }

  const created = await db.posCashier.create({
    data: {
      shopkeeperId: shop.shopkeeperId,
      name: d.name,
      role: d.role,
      pinHash: await bcrypt.hash(d.pin, 10),
    },
    select: { id: true },
  })
  return { success: true, cashierId: created.id }
}

/**
 * Take someone off the till.
 *
 * Deactivated, never deleted: their name is on sales, shifts and register
 * entries that have to stay readable. An ex-employee's sales do not stop
 * having happened.
 */
export async function setCashierActive(input: unknown): Promise<CashierResult> {
  const shop = await requireShopOwner()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    cashierId: z.string().trim().min(1),
    isActive: z.boolean(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const row = await db.posCashier.findFirst({
    where: { id: parsed.data.cashierId, shopkeeperId: shop.shopkeeperId },
    select: { id: true, userId: true },
  })
  if (!row) return { success: false, error: "That person is not on your till." }

  // Locking the owner out of their own till is not a thing to allow by
  // accident; there would be no way back in from the till itself.
  if (!parsed.data.isActive && row.userId === shop.userId) {
    return { success: false, error: "You cannot take yourself off your own till." }
  }

  await db.posCashier.update({ where: { id: row.id }, data: { isActive: parsed.data.isActive } })
  return { success: true, cashierId: row.id }
}

export type SignInResult =
  | { success: true; cashierId: string; name: string; role: string }
  | { success: false; error: string }

/**
 * Identify who is at the counter, by PIN.
 *
 * Returns WHICH cashier matched, so the till can put their name on the
 * sales they ring up. Compares against every active row because a PIN is
 * not a username — there is nothing to look the row up by.
 */
export async function signInCashier(input: unknown): Promise<SignInResult> {
  const shop = await requireShopOwner()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({ pin: PIN }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Enter your PIN." }

  const rows = await db.posCashier.findMany({
    where: { shopkeeperId: shop.shopkeeperId, isActive: true },
    select: { id: true, name: true, role: true, pinHash: true },
  })
  for (const c of rows) {
    if (await bcrypt.compare(parsed.data.pin, c.pinHash)) {
      return { success: true, cashierId: c.id, name: c.name, role: c.role }
    }
  }
  // Deliberately not "no such PIN" versus "wrong PIN": there is nothing to
  // distinguish, and a till that says which would let someone enumerate.
  return { success: false, error: "That PIN was not recognised." }
}

/**
 * Check a MANAGER's PIN, for an action the shop has restricted.
 *
 * Separate from signInCashier because the answer is different: this one
 * refuses a correct PIN belonging to someone without the authority, and
 * says so, which a sign-in must never do.
 */
export async function verifyManagerPin(input: unknown): Promise<SignInResult> {
  const shop = await requireShopOwner()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({ pin: PIN }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Enter a manager PIN." }

  const rows = await db.posCashier.findMany({
    where: { shopkeeperId: shop.shopkeeperId, isActive: true },
    select: { id: true, name: true, role: true, pinHash: true },
  })
  for (const c of rows) {
    if (await bcrypt.compare(parsed.data.pin, c.pinHash)) {
      if (c.role !== "manager") {
        return { success: false, error: `${c.name} is not a manager. Ask someone who is.` }
      }
      return { success: true, cashierId: c.id, name: c.name, role: c.role }
    }
  }
  return { success: false, error: "That PIN was not recognised." }
}

/**
 * Whether this shop has anyone on the till yet.
 *
 * Used to decide whether to ask for a PIN at all: a one-person duka that
 * has never added a cashier must not be locked out of its own till by a
 * sign-in screen with no valid PIN behind it.
 */
export async function getCashierMode(): Promise<{
  anyCashiers: boolean
  /**
   * Whether a void will actually be challenged.
   *
   * managerPinToVoid on with nobody to approve is not enforced, so the till
   * must not ask for a PIN that cannot exist. The two conditions are
   * reported together because the till has no business recomputing the rule.
   */
  voidNeedsManager: boolean
  requirePinPerSale: boolean
  managerPinToVoid: boolean
  /** Shown on the sign-in screen, so the owner can get past it. */
  ownerName: string
} | null> {
  const shop = await requireShopOwner()
  if (!shop) return null
  const [count, managers] = await Promise.all([
    db.posCashier.count({ where: { shopkeeperId: shop.shopkeeperId, isActive: true } }),
    db.posCashier.count({ where: { shopkeeperId: shop.shopkeeperId, isActive: true, role: "manager" } }),
  ])
  return {
    anyCashiers: count > 0,
    voidNeedsManager: shop.config.managerPinToVoid && managers > 0,
    requirePinPerSale: shop.config.requirePinPerSale,
    managerPinToVoid: shop.config.managerPinToVoid,
    ownerName: shop.userName,
  }
}
