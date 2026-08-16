"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"

type ProductWithRelations = Prisma.ProductGetPayload<{ include: { category: true; shopkeeper: true; inventory: true } }>

export type ProductCard = {
  id: string
  name: string
  description: string
  price: number
  discountPrice: number | null
  discountPercent: number | null
  shop: string
  shopId: string
  categoryName: string | null
  categorySlug: string | null
  rating: number
  reviewCount: number
  image: string | null
  images: string[]
  stock: number
  isFeatured: boolean
}

function toCard(p: ProductWithRelations): ProductCard {
  const price = Number(p.price)
  const discountPrice = p.discountPrice != null ? Number(p.discountPrice) : null
  const stock = p.inventory ? Math.max(p.inventory.currentStock - p.inventory.reservedStock, 0) : 0
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price,
    discountPrice,
    discountPercent: discountPrice != null && price > 0 ? Math.round((1 - discountPrice / price) * 100) : null,
    shop: p.shopkeeper.shopName,
    shopId: p.shopkeeperId,
    categoryName: p.category?.name ?? null,
    categorySlug: p.category?.slug ?? null,
    rating: Number(p.rating),
    reviewCount: p.reviewCount,
    image: p.images[0] ?? null,
    images: p.images,
    stock,
    isFeatured: p.isFeatured,
  }
}

export async function getProducts(params?: {
  category?: string
  search?: string
  shopId?: string
  take?: number
  onlyDiscounted?: boolean
  onlyFeatured?: boolean
  sortBy?: "recent" | "rating"
}): Promise<ProductCard[]> {
  const where: Prisma.ProductWhereInput = { isActive: true }
  if (params?.category && params.category !== "all") {
    where.category = { slug: params.category }
  }
  if (params?.shopId) {
    where.shopkeeperId = params.shopId
  }
  if (params?.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { description: { contains: params.search, mode: "insensitive" } },
    ]
  }
  if (params?.onlyDiscounted) {
    where.discountPrice = { not: null }
  }
  if (params?.onlyFeatured) {
    where.isFeatured = true
  }

  const products = await db.product.findMany({
    where,
    include: { category: true, shopkeeper: true, inventory: true },
    orderBy: params?.sortBy === "rating" ? { rating: "desc" } : { createdAt: "desc" },
    take: params?.take,
  })
  return products.map(toCard)
}

export type ProductCategoryOption = { id: string; name: string; slug: string }

export async function getProductCategories(): Promise<ProductCategoryOption[]> {
  const categories = await db.category.findMany({ where: { type: "PRODUCT", isActive: true }, orderBy: { name: "asc" } })
  return categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))
}

export type ProductShopOption = { id: string; name: string; productCount: number }

/** Real sellers, not a fabricated "Brand" list — Product has no brand field
 * in this schema, so filtering by trusted shop is the honest equivalent of
 * the brand-checkbox filter in the reference marketplace design. */
export async function getProductShops(): Promise<ProductShopOption[]> {
  const shops = await db.shopkeeperProfile.findMany({
    where: { products: { some: { isActive: true } } },
    select: { id: true, shopName: true, _count: { select: { products: { where: { isActive: true } } } } },
    orderBy: { shopName: "asc" },
  })
  return shops.map((s) => ({ id: s.id, name: s.shopName, productCount: s._count.products }))
}

export type MarketplaceSort = "popularity" | "price-asc" | "price-desc" | "rating"

export type MarketplaceProductsResult = { products: ProductCard[]; totalCount: number }

/** The real, full-catalog marketplace query — server-side filtering AND
 * pagination (unlike getProducts(), which every other caller in this app
 * uses for a capped preview row and must keep working exactly as-is). Sort
 * "popularity" uses the real Product.totalSold running counter, not an
 * invented view-count. */
export async function getMarketplaceProducts(params?: {
  category?: string
  shopIds?: string[]
  search?: string
  priceMin?: number
  priceMax?: number
  minRating?: number
  sortBy?: MarketplaceSort
  page?: number
  perPage?: number
}): Promise<MarketplaceProductsResult> {
  const where: Prisma.ProductWhereInput = { isActive: true }
  if (params?.category && params.category !== "all") {
    where.category = { slug: params.category }
  }
  if (params?.shopIds && params.shopIds.length > 0) {
    where.shopkeeperId = { in: params.shopIds }
  }
  if (params?.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { description: { contains: params.search, mode: "insensitive" } },
    ]
  }
  if (params?.priceMin != null || params?.priceMax != null) {
    where.price = {
      ...(params.priceMin != null ? { gte: params.priceMin } : {}),
      ...(params.priceMax != null ? { lte: params.priceMax } : {}),
    }
  }
  if (params?.minRating != null) {
    where.rating = { gte: params.minRating }
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params?.sortBy === "price-asc" ? { price: "asc" }
    : params?.sortBy === "price-desc" ? { price: "desc" }
    : params?.sortBy === "rating" ? { rating: "desc" }
    : { totalSold: "desc" }

  const perPage = params?.perPage ?? 24
  const page = Math.max(1, params?.page ?? 1)

  const [products, totalCount] = await Promise.all([
    db.product.findMany({
      where,
      include: { category: true, shopkeeper: true, inventory: true },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.product.count({ where }),
  ])

  return { products: products.map(toCard), totalCount }
}

/** Real price bounds from the actual catalog — the price-range slider's
 * min/max come from here rather than a guessed hardcoded range. */
export async function getProductPriceBounds(): Promise<{ min: number; max: number }> {
  const agg = await db.product.aggregate({ where: { isActive: true }, _min: { price: true }, _max: { price: true } })
  return { min: agg._min.price != null ? Math.floor(Number(agg._min.price)) : 0, max: agg._max.price != null ? Math.ceil(Number(agg._max.price)) : 100_000 }
}

export type ProductReview = {
  id: string
  customerId: string
  customerName: string
  rating: number
  comment: string
  photos: string[]
  createdAt: string
  updatedAt: string
  isMine: boolean
}

export type ProductDetail = (ProductCard & { reviews: ProductReview[]; relatedProducts: ProductCard[] }) | null

export async function getProductById(id: string): Promise<ProductDetail> {
  const session = await auth()

  const product = await db.product.findUnique({
    where: { id },
    include: {
      category: true,
      shopkeeper: true,
      inventory: true,
      reviews: { orderBy: { createdAt: "desc" }, include: { customer: true } },
    },
  })
  if (!product) return null

  const related = await db.product.findMany({
    where: { id: { not: product.id }, isActive: true, ...(product.categoryId ? { categoryId: product.categoryId } : {}) },
    take: 3,
    include: { category: true, shopkeeper: true, inventory: true },
  })

  return {
    ...toCard(product),
    reviews: product.reviews.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerName: r.customer.name,
      rating: r.rating,
      comment: r.comment,
      photos: r.photos,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      isMine: r.customerId === session?.user?.id,
    })),
    relatedProducts: related.map(toCard),
  }
}

export type ProductActionResult = { success: true } | { success: false; error: string }

const reviewSchema = z.object({
  productId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1, "Please write a comment").max(1000),
  photos: z.array(z.string()).max(4, "You can attach up to 4 photos").optional().default([]),
})

/** Recomputes the product's real aggregate rating/reviewCount from its
 * actual Review rows — the same reconciliation submitProductReview,
 * updateProductReview, and deleteProductReview all need after touching a
 * review, so a single shared step can't drift between them. */
async function recomputeProductRating(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  const agg = await tx.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: true })
  await tx.product.update({
    where: { id: productId },
    data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count },
  })
}

export async function submitProductReview(input: unknown): Promise<ProductActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in to leave a review." }

  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { productId, rating, comment, photos } = parsed.data

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) return { success: false, error: "Product not found." }

  const existing = await db.review.findFirst({ where: { productId, customerId: session.user.id } })
  if (existing) return { success: false, error: "You've already reviewed this product — edit your existing review instead." }

  await db.$transaction(async (tx) => {
    await tx.review.create({ data: { customerId: session.user!.id, productId, rating, comment, photos } })
    await recomputeProductRating(tx, productId)
  })

  return { success: true }
}

const updateReviewSchema = z.object({
  reviewId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1, "Please write a comment").max(1000),
  photos: z.array(z.string()).max(4, "You can attach up to 4 photos").optional().default([]),
})

export async function updateProductReview(input: unknown): Promise<ProductActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updateReviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const review = await db.review.findUnique({ where: { id: parsed.data.reviewId } })
  if (!review || !review.productId) return { success: false, error: "Review not found." }
  if (review.customerId !== session.user.id) return { success: false, error: "You can only edit your own review." }

  await db.$transaction(async (tx) => {
    await tx.review.update({
      where: { id: review.id },
      data: { rating: parsed.data.rating, comment: parsed.data.comment, photos: parsed.data.photos },
    })
    await recomputeProductRating(tx, review.productId!)
  })

  return { success: true }
}

const deleteReviewSchema = z.object({ reviewId: z.string().trim().min(1) })

export async function deleteProductReview(input: unknown): Promise<ProductActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = deleteReviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const review = await db.review.findUnique({ where: { id: parsed.data.reviewId } })
  if (!review || !review.productId) return { success: false, error: "Review not found." }
  if (review.customerId !== session.user.id) return { success: false, error: "You can only delete your own review." }

  await db.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: review.id } })
    await recomputeProductRating(tx, review.productId!)
  })

  return { success: true }
}
