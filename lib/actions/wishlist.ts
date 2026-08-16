"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"

export type WishlistTargetKind = "PROVIDER" | "SERVICE" | "PRODUCT"

const ID_FIELD: Record<WishlistTargetKind, "providerId" | "serviceId" | "productId"> = {
  PROVIDER: "providerId",
  SERVICE: "serviceId",
  PRODUCT: "productId",
}

export async function getWishlistIds(targetType: WishlistTargetKind): Promise<string[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const idField = ID_FIELD[targetType]
  const items = await db.wishlistItem.findMany({ where: { customerId: session.user.id, targetType } })
  return items.map((item) => item[idField]).filter((value): value is string => !!value)
}

const toggleSchema = z.object({
  targetType: z.enum(["PROVIDER", "SERVICE", "PRODUCT"]),
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
