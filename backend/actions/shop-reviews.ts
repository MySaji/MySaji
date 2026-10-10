"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import type { Prisma } from "@prisma/client"

export type ReviewableShopOrder = { orderId: string; orderNumber: string } | null

/** A shop review is tied to one specific delivered order (Review.orderId is
 * unique) — this is distinct from product reviews, which review the item
 * rather than the overall buying/shop experience. Returns the customer's
 * most recent delivered, not-yet-reviewed order from this shop, if any. */
export async function getReviewableOrderForShop(shopkeeperId: string): Promise<ReviewableShopOrder> {
  const session = await auth()
  if (!session?.user?.id) return null

  const order = await db.order.findFirst({
    where: { shopkeeperId, customerId: session.user.id, status: "DELIVERED", review: null },
    orderBy: { deliveredAt: "desc" },
  })
  if (!order) return null
  return { orderId: order.id, orderNumber: order.orderNumber }
}

export type PublicShopReview = {
  id: string
  customerName: string
  customerAvatar: string | null
  rating: number
  comment: string
  photos: string[]
  response: string | null
  respondedAt: string | null
  createdAt: string
}

export async function getShopReviews(shopkeeperId: string): Promise<PublicShopReview[]> {
  const reviews = await db.review.findMany({
    where: { shopkeeperId },
    orderBy: { createdAt: "desc" },
    include: { customer: true },
  })
  return reviews.map((r) => ({
    id: r.id,
    customerName: r.customer.name,
    customerAvatar: r.customer.image,
    rating: r.rating,
    comment: r.comment,
    photos: r.photos,
    response: r.response,
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export type ShopReviewActionResult = { success: true } | { success: false; error: string }

const submitShopReviewSchema = z.object({
  orderId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1, "Please write a comment").max(1000),
  photos: z.array(z.string()).max(4, "You can attach up to 4 photos").optional().default([]),
})

/** Recomputes ShopkeeperProfile.rating/reviewCount from real Review rows.
 * Review.shopkeeperId is only ever set by shop-level reviews (product
 * reviews only set productId), so this aggregate can't be polluted by
 * per-product ratings — the two stay genuinely distinct signals. */
async function recomputeShopRating(tx: Prisma.TransactionClient, shopkeeperId: string): Promise<void> {
  const agg = await tx.review.aggregate({ where: { shopkeeperId }, _avg: { rating: true }, _count: true })
  await tx.shopkeeperProfile.update({
    where: { id: shopkeeperId },
    data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count },
  })
}

export async function submitShopReview(input: unknown): Promise<ShopReviewActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in to leave a review." }

  const parsed = submitShopReviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { orderId, rating, comment, photos } = parsed.data

  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order || order.customerId !== session.user.id) return { success: false, error: "Order not found." }
  if (order.status !== "DELIVERED") return { success: false, error: "You can only review delivered orders." }

  const existing = await db.review.findUnique({ where: { orderId } })
  if (existing) return { success: false, error: "You've already reviewed this order." }

  await db.$transaction(async (tx) => {
    await tx.review.create({
      data: { customerId: session.user!.id, orderId, shopkeeperId: order.shopkeeperId, rating, comment, photos },
    })
    await recomputeShopRating(tx, order.shopkeeperId)
  })

  return { success: true }
}
