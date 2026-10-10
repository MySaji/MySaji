"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireShopkeeper } from "@/backend/actions/shopkeeper-dashboard"

export type ShopkeeperReview = {
  id: string
  customerName: string
  customerAvatar: string | null
  productId: string | null
  productName: string | null
  orderNumber: string | null
  rating: number
  comment: string
  createdAt: string
  response: string | null
  respondedAt: string | null
}

export type ShopkeeperReviewsData = {
  shopName: string
  reviews: ShopkeeperReview[]
  avgRating: number
  totalReviews: number
  ratingDistribution: { star: number; count: number; percent: number }[]
  unrepliedCount: number
  avgReplyTimeHours: number | null
}

export async function getMyReviews(): Promise<ShopkeeperReviewsData> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) {
    return { shopName: "", reviews: [], avgRating: 0, totalReviews: 0, ratingDistribution: [], unrepliedCount: 0, avgReplyTimeHours: null }
  }

  // Product reviews (review a specific item) and shop reviews (review the
  // overall delivered-order experience, Review.shopkeeperId set directly)
  // are two distinct signals — shown together here since a shopkeeper needs
  // one inbox to reply to feedback from, however it was left.
  const [profile, productReviews, shopReviews] = await Promise.all([
    db.shopkeeperProfile.findUnique({ where: { id: shopkeeper.shopkeeperId } }),
    db.review.findMany({
      where: { product: { shopkeeperId: shopkeeper.shopkeeperId } },
      orderBy: { createdAt: "desc" },
      include: { customer: true, product: true },
    }),
    db.review.findMany({
      where: { shopkeeperId: shopkeeper.shopkeeperId },
      orderBy: { createdAt: "desc" },
      include: { customer: true, order: true },
    }),
  ])

  const reviews = [
    ...productReviews.map((r) => ({
      id: r.id,
      customerName: r.customer.name,
      customerAvatar: r.customer.image,
      productId: r.productId as string | null,
      productName: r.product?.name ?? null,
      orderNumber: null as string | null,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      response: r.response,
      respondedAt: r.respondedAt,
    })),
    ...shopReviews.map((r) => ({
      id: r.id,
      customerName: r.customer.name,
      customerAvatar: r.customer.image,
      productId: null as string | null,
      productName: null as string | null,
      orderNumber: r.order?.orderNumber ?? null,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      response: r.response,
      respondedAt: r.respondedAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const totalReviews = reviews.length
  const avgRating = totalReviews > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0
  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length
    return { star, count, percent: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0 }
  })
  const unrepliedCount = reviews.filter((r) => !r.response).length

  const repliedReviews = reviews.filter((r) => r.response && r.respondedAt)
  const avgReplyTimeHours = repliedReviews.length > 0
    ? repliedReviews.reduce((sum, r) => sum + (r.respondedAt!.getTime() - r.createdAt.getTime()), 0) / repliedReviews.length / 3600000
    : null

  return {
    shopName: profile?.shopName ?? "Shop",
    reviews: reviews.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    })),
    avgRating,
    totalReviews,
    ratingDistribution,
    unrepliedCount,
    avgReplyTimeHours,
  }
}

export type ShopkeeperReviewActionResult = { success: true } | { success: false; error: string }

const replySchema = z.object({
  reviewId: z.string().trim().min(1),
  response: z.string().trim().min(10, "Reply must be at least 10 characters"),
})

export async function replyToReview(input: unknown): Promise<ShopkeeperReviewActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = replySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const review = await db.review.findUnique({ where: { id: parsed.data.reviewId }, include: { product: true } })
  const ownsReview = review && (review.product?.shopkeeperId === shopkeeper.shopkeeperId || review.shopkeeperId === shopkeeper.shopkeeperId)
  if (!ownsReview) return { success: false, error: "Review not found." }

  await db.review.update({
    where: { id: review.id },
    data: { response: parsed.data.response, respondedAt: new Date() },
  })

  return { success: true }
}
