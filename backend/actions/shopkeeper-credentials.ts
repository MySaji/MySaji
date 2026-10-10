"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

/** Owning a ShopkeeperProfile is what makes an account a shop, not `role` —
 *  a Saji Pro that sells products is role PROVIDER and owns one too. Same
 *  rule as the shared guard in shopkeeper-dashboard.ts; without it this
 *  page's data came back empty for every Saji Pro. */
async function requireShopkeeper(): Promise<{ userId: string; shopkeeperId: string } | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "shopkeeper" && session.user.role !== "provider") return null
  const profile = await db.shopkeeperProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, shopkeeperId: profile.id }
}

export type ShopkeeperCredentialsActionResult = { success: true } | { success: false; error: string }

// ============================= SHOP SHOWCASE (ShopPortfolioItem) =============
// Shopkeeper equivalent of provider-credentials.ts's Proof of Work section —
// photo/video samples of completed work, shown to customers browsing the shop.

export type ShopPortfolioItemData = {
  id: string
  title: string
  description: string | null
  imageUrl: string
  videoUrl: string | null
  createdAt: string
}

export async function getMyShopPortfolio(): Promise<ShopPortfolioItemData[]> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return []

  const items = await db.shopPortfolioItem.findMany({ where: { shopkeeperId: shopkeeper.shopkeeperId }, orderBy: { createdAt: "desc" } })
  return items.map((i) => ({ id: i.id, title: i.title, description: i.description, imageUrl: i.imageUrl, videoUrl: i.videoUrl, createdAt: i.createdAt.toISOString() }))
}

const addPortfolioSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  imageUrl: z.string().min(1, "An image is required"),
  videoUrl: z.string().trim().optional(),
})

export async function addMyShopPortfolioItem(input: unknown): Promise<ShopkeeperCredentialsActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }
  const parsed = addPortfolioSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.shopPortfolioItem.create({
    data: {
      shopkeeperId: shopkeeper.shopkeeperId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      imageUrl: parsed.data.imageUrl,
      videoUrl: parsed.data.videoUrl || null,
    },
  })
  return { success: true }
}

const updatePortfolioSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
})

export async function updateMyShopPortfolioItem(input: unknown): Promise<ShopkeeperCredentialsActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }
  const parsed = updatePortfolioSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.shopPortfolioItem.updateMany({
    where: { id: parsed.data.id, shopkeeperId: shopkeeper.shopkeeperId },
    data: { title: parsed.data.title, description: parsed.data.description || null },
  })
  return { success: true }
}

const portfolioIdSchema = z.object({ id: z.string().trim().min(1) })

export async function removeMyShopPortfolioItem(input: unknown): Promise<ShopkeeperCredentialsActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }
  const parsed = portfolioIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.shopPortfolioItem.deleteMany({ where: { id: parsed.data.id, shopkeeperId: shopkeeper.shopkeeperId } })
  return { success: true }
}

// ============================= PUBLIC READ (customer-facing shop page) =======

export type PublicShopPortfolioItem = { id: string; title: string; description: string | null; imageUrl: string; videoUrl: string | null }

export async function getShopPortfolioForCustomer(shopkeeperId: string): Promise<PublicShopPortfolioItem[]> {
  const items = await db.shopPortfolioItem.findMany({ where: { shopkeeperId }, orderBy: { createdAt: "desc" } })
  return items.map((i) => ({ id: i.id, title: i.title, description: i.description, imageUrl: i.imageUrl, videoUrl: i.videoUrl }))
}
