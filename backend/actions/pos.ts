"use server"

import { z } from "zod"
import { requirePosPermission } from "@/backend/services/pos-access-core"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { posShopIdFor } from "@/backend/services/pos-tenant"
import {
  POS_PROFILES, POS_PROFILE_BY_KEY, DEFAULT_POS_PROFILE_KEY,
  effectiveTraits, resolvePosProfile,
} from "@/backend/domain/pos-profiles"
import { POS_TRAITS, POS_TRAIT_META, normaliseTraits, type PosTrait } from "@/backend/domain/pos-traits"
import { parsePosConfig, posConfigSchema, type PosConfig } from "@/backend/domain/pos-config"

/**
 * Reading and configuring a shop's till.
 *
 * Every function here resolves the tenant from the SESSION and never from an
 * argument. There is no `shopkeeperId` parameter anywhere in this file, which
 * is deliberate: the moment one exists, every caller becomes a place where
 * tenant isolation can be got wrong, and this is a module about money.
 *
 * Only exports async functions — a "use server" module may not export
 * anything else. The types and tables live in lib/pos-*.ts.
 */

// ---------------------------------------------------------------------------
// Tenant resolution
// ---------------------------------------------------------------------------

/**
 * The signed-in user's shop, if they have one and the till is theirs to
 * configure.
 *
 * Returns null rather than throwing, because every caller already has to
 * render something sensible for an account with no till — a Services Pro who
 * typed the URL, a signed-out visitor, a shopkeeper mid-provisioning.
 */
async function resolveMyShop() {
  const session = await auth()
  if (!session?.user?.id) return null
  const shopId = await posShopIdFor(session.user.id)
  if (!shopId) return null
  return db.shopkeeperProfile.findUnique({
    where: { id: shopId },
    select: {
      id: true, shopName: true,
      posEnabled: true, posProfileKey: true, posTraits: true, posConfig: true,
      posActivatedAt: true, listedOnMarketplace: true,
    },
  })
}

export type PosSetup = {
  shopId: string
  shopName: string
  enabled: boolean
  listedOnMarketplace: boolean
  profileKey: string
  profileLabel: string
  /** Traits actually in force, preset merged with any saved override. */
  traits: PosTrait[]
  /** Of those, the ones the till can actually do today. */
  liveTraits: PosTrait[]
  /** Switched on but not implemented yet. Named so nothing is over-promised. */
  plannedTraits: PosTrait[]
  config: PosConfig
  activatedAt: string | null
  /** Catalogue size, because a till with no products is the first thing to fix. */
  productCount: number
  /** How many products have never had a stock movement recorded. */
  productsWithoutLedger: number
}

export async function getMyPosSetup(): Promise<PosSetup | null> {
  const shop = await resolveMyShop()
  if (!shop) return null

  const profile = resolvePosProfile(shop.posProfileKey)
  // posTraits is written explicitly when POS is enabled, so for a POS shop
  // the array is authoritative — including when it is empty, which means the
  // shopkeeper switched everything off. For a shop with the till off there is
  // nothing saved, so the preset answers instead.
  const traits = effectiveTraits(shop.posProfileKey, shop.posEnabled ? shop.posTraits : null)

  const [productCount, withLedger] = await Promise.all([
    db.product.count({ where: { shopkeeperId: shop.id } }),
    db.stockMovement.findMany({
      where: { shopkeeperId: shop.id },
      select: { productId: true },
      distinct: ["productId"],
    }),
  ])

  return {
    shopId: shop.id,
    shopName: shop.shopName,
    enabled: shop.posEnabled,
    listedOnMarketplace: shop.listedOnMarketplace,
    profileKey: profile.key,
    profileLabel: profile.label,
    traits,
    liveTraits: traits.filter((t) => POS_TRAIT_META[t].stage === "live"),
    plannedTraits: traits.filter((t) => POS_TRAIT_META[t].stage === "planned"),
    config: parsePosConfig(shop.posConfig, profile.defaultUnit),
    activatedAt: shop.posActivatedAt?.toISOString() ?? null,
    productCount,
    productsWithoutLedger: productCount - withLedger.length,
  }
}

export type PosActionResult = { success: true } | { success: false; error: string }

// ---------------------------------------------------------------------------
// Changing the configuration
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  profileKey: z.string().trim().min(1),
  /**
   * Whether to overwrite the traits with the new profile's preset.
   *
   * Separate from the key on purpose. A shop that has spent a month tuning
   * its traits and then corrects its shop type from Grocery to Supermarket
   * must not silently lose that tuning — but a shop that picked wrong on day
   * one wants exactly the reset. Neither default is right for both, so it is
   * asked.
   */
  applyPreset: z.boolean(),
})

export async function setPosProfile(input: unknown): Promise<PosActionResult> {
  const permission = await requirePosPermission("settings.store")
  if (!permission.ok) return { success: false, error: permission.error }
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const shop = await resolveMyShop()
  if (!shop) return { success: false, error: "You do not have a shop on this account." }
  if (!shop.posEnabled) return { success: false, error: "The till is not switched on for this shop." }

  const profile = POS_PROFILE_BY_KEY[parsed.data.profileKey]
  if (!profile) return { success: false, error: "That is not a shop type we know." }

  const config = parsePosConfig(shop.posConfig, profile.defaultUnit)

  await db.shopkeeperProfile.update({
    where: { id: shop.id },
    data: {
      posProfileKey: profile.key,
      ...(parsed.data.applyPreset ? { posTraits: profile.traits } : {}),
      // The default unit follows the shop type either way: it describes the
      // trade rather than a preference, and a butchery whose new products
      // default to "piece" is a butchery whose staff fight the till.
      posConfig: { ...config, defaultUnit: profile.defaultUnit },
    },
  })
  return { success: true }
}

const traitsSchema = z.object({
  traits: z.array(z.string()).max(POS_TRAITS.length),
})

export async function setPosTraits(input: unknown): Promise<PosActionResult> {
  const permission = await requirePosPermission("settings.store")
  if (!permission.ok) return { success: false, error: permission.error }
  const parsed = traitsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const shop = await resolveMyShop()
  if (!shop) return { success: false, error: "You do not have a shop on this account." }
  if (!shop.posEnabled) return { success: false, error: "The till is not switched on for this shop." }

  // normaliseTraits drops anything unrecognised rather than rejecting the
  // whole call: an older client sending a trait this build has removed should
  // still be able to save the ones it does know.
  await db.shopkeeperProfile.update({
    where: { id: shop.id },
    data: { posTraits: normaliseTraits(parsed.data.traits) },
  })
  return { success: true }
}

export async function updatePosConfig(input: unknown): Promise<PosActionResult> {
  const permission = await requirePosPermission("settings.store")
  if (!permission.ok) return { success: false, error: permission.error }
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { success: false, error: "Invalid settings" }
  if (Object.hasOwn(input, "installLogo")) return { success: false, error: "Use the owner business-logo upload to change the installation icon." }
  if (Object.hasOwn(input, "primaryColor") && permission.actor.role !== "OWNER") {
    return { success: false, error: "Only the POS owner can change the Till theme colour." }
  }
  const shop = await resolveMyShop()
  if (!shop) return { success: false, error: "You do not have a shop on this account." }
  if (!shop.posEnabled) return { success: false, error: "The till is not switched on for this shop." }

  // Merge over what is stored rather than replacing it, so a settings page
  // that only knows about some fields cannot wipe the rest.
  const current = parsePosConfig(shop.posConfig)
  const merged = posConfigSchema.safeParse({ ...current, ...(input as object) })
  if (!merged.success) {
    return { success: false, error: merged.error.issues[0]?.message ?? "Invalid settings" }
  }

  await db.shopkeeperProfile.update({
    where: { id: shop.id },
    data: { posConfig: merged.data },
  })
  return { success: true }
}

/**
 * Every shop type, for the settings picker.
 *
 * A server action rather than a direct import so the settings page does not
 * have to bundle the whole registry twice — and so this stays the single
 * answer to "what shop types exist", wherever it is asked.
 */
export async function listPosProfiles(): Promise<{
  key: string; label: string; description: string; group: string; icon: string
  traits: string[]; defaultUnit: string
}[]> {
  return POS_PROFILES.map((p) => ({
    key: p.key, label: p.label, description: p.description, group: p.group,
    icon: p.icon, traits: p.traits, defaultUnit: p.defaultUnit,
  }))
}

/** The default, exposed so a caller never has to hardcode the string. */
export async function defaultPosProfileKey(): Promise<string> {
  return DEFAULT_POS_PROFILE_KEY
}
