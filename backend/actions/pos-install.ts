"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

/**
 * Getting the till onto the machine at the counter.
 *
 * WHY A SHOP NEEDS ITS OWN ADDRESS
 *
 * The till is installed once per device and then used by whoever is on
 * shift. The person doing the installing is often not the account holder —
 * it is whoever is in the shop when the tablet arrives — and they will be
 * typing the address into a phone with one thumb. So each shop gets a short
 * address of its own, `/till/<slug>`, which a shopkeeper can read down the
 * phone or print and stick to the counter.
 *
 * WHAT IT IS NOT
 *
 * It is NOT a way in. Opening it signs nobody in and reveals nothing but
 * the shop's own name: it is a signpost to the login, which still wants a
 * password and a code like every other way into this account. Treating a
 * guessable URL as a credential is how shops lose their takings.
 */

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

async function requireShop() {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null
  const shop = await db.shopkeeperProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, shopName: true, posEnabled: true, tillSlug: true },
  })
  if (!shop || !shop.posEnabled) return null
  return shop
}

export type TillAddress = {
  /** e.g. "mwangi-choice-butchery" */
  slug: string
  shopName: string
  /** The address to type, without a scheme: "saji.co.ke/till/mwangi-choice-butchery" */
  display: string
  /** The full URL, for a QR code and for copying. */
  url: string
}

/**
 * The shop's till address, minting one on first use.
 *
 * Derived from the shop's name so it is recognisable, with a short suffix
 * only where that name is already taken. Not regenerated afterwards: a
 * shopkeeper who has written the address on the counter must not find it
 * has changed because they renamed the shop.
 */
export async function getTillAddress(): Promise<TillAddress | null> {
  const shop = await requireShop()
  if (!shop) return null

  let slug = shop.tillSlug
  if (!slug) {
    const base = slugify(shop.shopName) || "till"
    slug = base
    // A handful of tries, then give up on prettiness rather than loop: the
    // address only has to be unique and typeable, not perfect.
    for (let i = 0; i < 8; i++) {
      const taken = await db.shopkeeperProfile.findFirst({ where: { tillSlug: slug }, select: { id: true } })
      if (!taken) break
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
    }
    try {
      await db.shopkeeperProfile.update({ where: { id: shop.id }, data: { tillSlug: slug } })
    } catch {
      // Lost a race with another tab claiming the same slug. Re-read rather
      // than fail: the shop has an address either way.
      const again = await db.shopkeeperProfile.findUnique({ where: { id: shop.id }, select: { tillSlug: true } })
      slug = again?.tillSlug ?? slug
    }
  }

  const origin = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "")
  return {
    slug,
    shopName: shop.shopName,
    display: `${origin.replace(/^https?:\/\//, "")}/till/${slug}`,
    url: `${origin}/till/${slug}`,
  }
}

export type RenameTillAddressResult = { success: true; address: TillAddress } | { success: false; error: string }

/**
 * Change the address, where the one we guessed is not what they would say.
 *
 * Offered because the generated slug comes from a shop name that may be a
 * legal name rather than the name on the sign.
 */
export async function setTillSlug(input: unknown): Promise<RenameTillAddressResult> {
  const shop = await requireShop()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({ slug: z.string().trim().min(3).max(40) }).safeParse(input)
  if (!parsed.success) return { success: false, error: "An address is 3 to 40 characters." }

  const slug = slugify(parsed.data.slug)
  if (slug.length < 3) return { success: false, error: "Use letters and numbers, at least three of them." }
  // Addresses that would collide with a route of our own, now or later.
  if (["new", "login", "install", "api", "admin", "settings", "app"].includes(slug)) {
    return { success: false, error: "That address is reserved. Try another." }
  }

  const taken = await db.shopkeeperProfile.findFirst({
    where: { tillSlug: slug, NOT: { id: shop.id } },
    select: { id: true },
  })
  if (taken) return { success: false, error: "Another shop already uses that address." }

  await db.shopkeeperProfile.update({ where: { id: shop.id }, data: { tillSlug: slug } })
  const address = await getTillAddress()
  if (!address) return { success: false, error: "Could not read the new address back." }
  return { success: true, address }
}

/**
 * What the public till page is allowed to say about a shop.
 *
 * Deliberately three fields. Anyone can open `/till/<slug>`, so this is the
 * whole surface: enough to confirm you are at the right shop's door, and
 * nothing that would help someone through it.
 */
export type PublicTillShop = { shopName: string; slug: string }

export async function getPublicTillShop(slug: string): Promise<PublicTillShop | null> {
  const clean = slugify(slug)
  if (!clean) return null
  const shop = await db.shopkeeperProfile.findFirst({
    where: { tillSlug: clean, posEnabled: true },
    select: { shopName: true, tillSlug: true },
  })
  if (!shop?.tillSlug) return null
  return { shopName: shop.shopName, slug: shop.tillSlug }
}
