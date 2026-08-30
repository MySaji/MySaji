"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { requirePro } from "@/lib/actions/provider-subscription"

async function requireProvider(): Promise<{ userId: string; providerId: string; isBusinessOwner: boolean } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id }, select: { id: true, isBusinessOwner: true } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id, isBusinessOwner: profile.isBusinessOwner }
}

export type ProviderShopStatus = { hasShop: boolean; shopName: string | null }

/** A Business-owner provider already has their own shop-setup path
 * (setupBusinessShop, from the Business Dashboard) — this page is Solo
 * Pro's equivalent, so hasShop only reports what THIS flow set up, not
 * whichever path actually created it (either way it's the same
 * ShopkeeperProfile row, this just avoids a business owner seeing a
 * duplicate "set up your shop" prompt from the wrong entry point). */
export async function getMyProviderShopStatus(): Promise<ProviderShopStatus> {
  const provider = await requireProvider()
  if (!provider) return { hasShop: false, shopName: null }

  const shop = await db.shopkeeperProfile.findUnique({ where: { userId: provider.userId }, select: { shopName: true } })
  return { hasShop: !!shop, shopName: shop?.shopName ?? null }
}

const setupShopSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name must be at least 2 characters").max(80),
})

export type ProviderShopActionResult = { success: true } | { success: false; error: string; requiresPro?: true }

/**
 * Lets a Solo Pro provider sell physical products through their own portal
 * without opening a separate Shopkeeper account. Reuses the exact same
 * linked-ShopkeeperProfile pattern setupBusinessShop() established for
 * Business owners (see lib/actions/provider-business.ts) — same DB write,
 * just without the isBusinessOwner restriction. role stays "provider"; the
 * new ShopkeeperProfile is purely a data container the provider portal's
 * shop pages read and write via requireShopkeeper()'s matching carve-out
 * (lib/actions/shopkeeper-dashboard.ts).
 *
 * Pro-gated: this is the concrete, tangible commerce capability Saji Pro
 * subscribers get that free Solo providers don't. Business owners aren't
 * gated here — they already get shop-setup for free via their own account
 * tier, so this action refuses them and points back to that existing flow
 * instead of creating a second, redundant path to the same DB row.
 */
export async function setupProviderShop(input: unknown): Promise<ProviderShopActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  if (provider.isBusinessOwner) {
    return { success: false, error: "Set up your shop from the Business Dashboard instead." }
  }

  const denied = await requirePro()
  if (denied) return denied

  const parsed = setupShopSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.shopkeeperProfile.findUnique({ where: { userId: provider.userId } })
  if (existing) return { success: false, error: "You already have a shop set up." }

  await db.shopkeeperProfile.create({
    data: { userId: provider.userId, shopName: parsed.data.shopName },
  })

  return { success: true }
}
