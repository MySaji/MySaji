"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import type { Prisma } from "@prisma/client"

export type WishlistTargetKind = "PROVIDER" | "SERVICE" | "PRODUCT" | "SHOP"

const ID_FIELD: Record<WishlistTargetKind, "providerId" | "serviceId" | "productId" | "shopId"> = {
  PROVIDER: "providerId",
  SERVICE: "serviceId",
  PRODUCT: "productId",
  SHOP: "shopId",
}

export async function getWishlistIds(targetType: WishlistTargetKind): Promise<string[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const idField = ID_FIELD[targetType]
  const items = await db.wishlistItem.findMany({ where: { customerId: session.user.id, targetType } })
  return items.map((item) => item[idField]).filter((value): value is string => !!value)
}

const toggleSchema = z.object({
  targetType: z.enum(["PROVIDER", "SERVICE", "PRODUCT", "SHOP"]),
  targetId: z.string().trim().min(1),
})

export type ToggleWishlistResult = { success: true; isWishlisted: boolean } | { success: false; error: string }

export async function toggleWishlist(input: unknown): Promise<ToggleWishlistResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = toggleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { targetType, targetId } = parsed.data
  const idField = ID_FIELD[targetType]

  const existing = await db.wishlistItem.findFirst({
    where: { customerId: session.user.id, targetType, [idField]: targetId } as Prisma.WishlistItemWhereInput,
  })

  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } })
    return { success: true, isWishlisted: false }
  }

  await db.wishlistItem.create({
    data: { customerId: session.user.id, targetType, [idField]: targetId } as Prisma.WishlistItemUncheckedCreateInput,
  })
  return { success: true, isWishlisted: true }
}

export type WishlistedProvider = {
  id: string
  name: string
  avatar: string | null
  bio: string | null
  rating: number
  reviewCount: number
  hourlyRate: number | null
  verified: boolean
  completedJobs: number
}

export async function getWishlistedProviders(): Promise<WishlistedProvider[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const items = await db.wishlistItem.findMany({
    where: { customerId: session.user.id, targetType: "PROVIDER" },
    include: { provider: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  })

  return items
    .filter((item) => item.provider)
    .map((item) => ({
      id: item.provider!.id,
      name: item.provider!.user.name,
      avatar: item.provider!.user.image,
      bio: item.provider!.bio,
      rating: Number(item.provider!.rating),
      reviewCount: item.provider!.reviewCount,
      hourlyRate: item.provider!.hourlyRate != null ? Number(item.provider!.hourlyRate) : null,
      verified: item.provider!.verified,
      completedJobs: item.provider!.completedJobs,
    }))
}

export type WishlistedShop = {
  id: string
  name: string
  image: string | null
  category: string | null
  rating: number
  reviewCount: number
  isVerified: boolean
}

/** The shop equivalent of getWishlistedProviders — powers the saved-shops
 * view on /customer/favorites and lets the home page's Shop local hearts
 * persist, which they previously couldn't: WishlistTargetType had no SHOP
 * member, so a shop simply had nowhere to be saved to. */
export async function getWishlistedShops(): Promise<WishlistedShop[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const items = await db.wishlistItem.findMany({
    where: { customerId: session.user.id, targetType: "SHOP" },
    include: { shop: true },
    orderBy: { createdAt: "desc" },
  })

  return items
    .filter((item) => item.shop)
    .map((item) => ({
      id: item.shop!.id,
      name: item.shop!.shopName,
      image: item.shop!.shopLogoUrl,
      category: item.shop!.shopCategory,
      rating: Number(item.shop!.rating),
      reviewCount: item.shop!.reviewCount,
      isVerified: item.shop!.isVerified,
    }))
}
