"use server"

import { createHash } from "crypto"
import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

/**
 * The devices that ring up sales.
 *
 * WHY A SHOP WANTS THIS
 *
 * A duka with two counters has two phones, and a sale that went wrong is
 * easier to find when the till can say which one it came from. More
 * usefully: a phone that stops syncing is holding sales nobody can see, and
 * the only way to notice is to know the phone exists and when it was last
 * heard from.
 *
 * WHAT A DEVICE ID IS
 *
 * The device mints its own secret once, keeps it, and sends it on. The
 * server stores only its SHA-256, so a dump of this table hands over
 * nothing — the same contract as every other credential here.
 *
 * It is NOT an authentication mechanism and is not treated as one. The
 * browser is already signed in as the shop; the secret answers "which of
 * your counters", not "may you sell". A fast hash is right for exactly that
 * reason, and because the row has to be found BY the hash — which bcrypt,
 * salted per row, could not do.
 *
 * Revoking is the one place it bites: a revoked device is refused, including
 * for sales it queued before it was revoked. That is the point of revoking
 * a phone that walked out of the shop.
 */

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex")
}

async function requireShop() {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null
  const shop = await db.shopkeeperProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, posEnabled: true },
  })
  if (!shop || !shop.posEnabled) return null
  return { shopkeeperId: shop.id }
}

export type DeviceRow = {
  id: string
  name: string
  platform: string
  lastSeenAt: string | null
  revokedAt: string | null
  createdAt: string
  /** Sales this device has put through, so an idle one can be told from an unused one. */
  saleCount: number
}

export async function getTillDevices(): Promise<DeviceRow[]> {
  const shop = await requireShop()
  if (!shop) return []
  const rows = await db.posDevice.findMany({
    where: { shopkeeperId: shop.shopkeeperId },
    orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }],
  })
  // One grouped count rather than a query per device.
  const counts = await db.posSale.groupBy({
    by: ["deviceId"],
    where: { shopkeeperId: shop.shopkeeperId, deviceId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  })
  const byId = new Map(counts.map((c) => [c.deviceId, c._count._all]))
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    platform: d.platform,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    revokedAt: d.revokedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    saleCount: byId.get(d.id) ?? 0,
  }))
}

export type RegisterResult =
  | { success: true; deviceId: string; name: string; revoked: boolean }
  | { success: false; error: string }

const registerSchema = z.object({
  /** Minted by the device. Long enough that two tills never collide. */
  secret: z.string().trim().min(16).max(200),
  name: z.string().trim().min(1).max(60).optional(),
  platform: z.string().trim().max(20).optional(),
})

/**
 * Say hello, on every load of the till.
 *
 * Creates the row the first time and touches lastSeenAt after that, so a
 * device that has stopped checking in is visible as such. A revoked device
 * is told it is revoked rather than quietly re-created — it must not be able
 * to un-revoke itself by reloading.
 */
export async function registerTillDevice(input: unknown): Promise<RegisterResult> {
  const shop = await requireShop()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid device" }
  const { secret, name, platform } = parsed.data
  const tokenHash = hashSecret(secret)

  const existing = await db.posDevice.findUnique({
    where: { tokenHash },
    select: { id: true, name: true, shopkeeperId: true, revokedAt: true },
  })

  if (existing) {
    // tokenHash is unique across the whole table, so a secret that somehow
    // belonged to another shop must not be adopted into this one.
    if (existing.shopkeeperId !== shop.shopkeeperId) {
      return { success: false, error: "That device belongs to another shop." }
    }
    if (existing.revokedAt) {
      return { success: true, deviceId: existing.id, name: existing.name, revoked: true }
    }
    await db.posDevice.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } })
    return { success: true, deviceId: existing.id, name: existing.name, revoked: false }
  }

  const created = await db.posDevice.create({
    data: {
      shopkeeperId: shop.shopkeeperId,
      // A name the shopkeeper will recognise comes later, from the devices
      // page. "This phone" is honest until then.
      name: name?.trim() || "This device",
      platform: platform?.trim() || "web",
      tokenHash,
      lastSeenAt: new Date(),
    },
    select: { id: true, name: true },
  })
  return { success: true, deviceId: created.id, name: created.name, revoked: false }
}

export type DeviceResult = { success: true } | { success: false; error: string }

export async function renameTillDevice(input: unknown): Promise<DeviceResult> {
  const shop = await requireShop()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    deviceId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(60),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Give it a name." }

  const row = await db.posDevice.findFirst({
    where: { id: parsed.data.deviceId, shopkeeperId: shop.shopkeeperId },
    select: { id: true },
  })
  if (!row) return { success: false, error: "That device is not on your till." }
  await db.posDevice.update({ where: { id: row.id }, data: { name: parsed.data.name } })
  return { success: true }
}

/**
 * Stop a device selling.
 *
 * The row stays: its sales have to keep pointing somewhere, and a device
 * that is gone for good should still be visible in the list of what sold
 * what. Reversible, because the commonest reason to revoke is a phone that
 * was mislaid and then found.
 */
export async function setTillDeviceRevoked(input: unknown): Promise<DeviceResult> {
  const shop = await requireShop()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    deviceId: z.string().trim().min(1),
    revoked: z.boolean(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const row = await db.posDevice.findFirst({
    where: { id: parsed.data.deviceId, shopkeeperId: shop.shopkeeperId },
    select: { id: true },
  })
  if (!row) return { success: false, error: "That device is not on your till." }
  await db.posDevice.update({
    where: { id: row.id },
    data: { revokedAt: parsed.data.revoked ? new Date() : null },
  })
  return { success: true }
}
