"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireVerified } from "@/backend/services/verification-gate"
import { requireDistributor } from "@/backend/actions/distributor-dashboard"

export type DistributorProductLocationStock = { locationId: string; locationName: string; currentStock: number }

export type DistributorProductRow = {
  id: string
  name: string
  description: string
  images: string[]
  sku: string
  retailPrice: number
  wholesalePrice: number
  minWholesaleQty: number
  unit: string | null
  isActive: boolean
  totalSoldWholesale: number
  categoryId: string | null
  categoryName: string | null
  totalStock: number
  locationStock: DistributorProductLocationStock[]
}

export async function getMyDistributorProducts(): Promise<DistributorProductRow[]> {
  const distributor = await requireDistributor()
  if (!distributor) return []

  const products = await db.distributorProduct.findMany({
    where: { distributorId: distributor.distributorId },
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      inventories: { include: { location: { select: { id: true, name: true } } } },
    },
  })

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    images: p.images,
    sku: p.sku,
    retailPrice: Number(p.retailPrice),
    wholesalePrice: Number(p.wholesalePrice),
    minWholesaleQty: p.minWholesaleQty,
    unit: p.unit,
    isActive: p.isActive,
    totalSoldWholesale: p.totalSoldWholesale,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    totalStock: p.inventories.reduce((sum, i) => sum + i.currentStock, 0),
    locationStock: p.inventories.map((i) => ({ locationId: i.location.id, locationName: i.location.name, currentStock: i.currentStock })),
  }))
}

export type DistributorProductCategoryOption = { id: string; name: string }

export async function getDistributorProductCategoryOptions(): Promise<DistributorProductCategoryOption[]> {
  const categories = await db.category.findMany({ where: { type: "PRODUCT", isActive: true }, orderBy: { name: "asc" } })
  return categories.map((c) => ({ id: c.id, name: c.name }))
}

export type DistributorLocationOption = { id: string; name: string }

export async function getMyLocationOptions(): Promise<DistributorLocationOption[]> {
  const distributor = await requireDistributor()
  if (!distributor) return []
  const locations = await db.distributorLocation.findMany({
    where: { distributorId: distributor.distributorId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
  return locations
}

export type DistributorProductActionResult = { success: true } | { success: false; error: string }

function generateSku(): string {
  return `DSKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

const createProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  description: z.string().trim().min(1, "Description is required"),
  categoryId: z.string().trim().min(1, "Please select a category"),
  images: z.array(z.string()).min(1, "At least one product photo is required"),
  retailPrice: z.number().positive("Enter a valid retail price"),
  wholesalePrice: z.number().positive("Enter a valid wholesale price"),
  minWholesaleQty: z.number().int().positive("Enter a valid minimum wholesale quantity"),
  unit: z.string().trim().optional(),
  initialStock: z.array(z.object({ locationId: z.string().trim().min(1), quantity: z.number().int().min(0) })).optional(),
})

export async function createDistributorProduct(input: unknown): Promise<DistributorProductActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = createProductSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  if (data.wholesalePrice >= data.retailPrice) {
    return { success: false, error: "Wholesale price should be lower than retail price." }
  }

  // Progressive KYC: mirrors createMyProduct for shopkeepers — an
  // unverified distributor builds their wholesale catalogue freely and it
  // lands inactive, rather than being refused outright.
  //
  // Unlike Product, DistributorProduct has no publishedAt yet, so a draft and
  // a deliberately paused item are indistinguishable here. That column is
  // worth adding alongside the distributor catalogue UI that needs to tell
  // them apart; nothing today reads the difference.
  const gate = await requireVerified("product.publish")

  await db.distributorProduct.create({
    data: {
      isActive: gate.ok,
      distributorId: distributor.distributorId,
      categoryId: data.categoryId,
      name: data.name,
      description: data.description,
      sku: generateSku(),
      images: data.images,
      retailPrice: data.retailPrice,
      wholesalePrice: data.wholesalePrice,
      minWholesaleQty: data.minWholesaleQty,
      unit: data.unit || undefined,
      inventories: data.initialStock && data.initialStock.length > 0
        ? { create: data.initialStock.map((s) => ({ locationId: s.locationId, currentStock: s.quantity })) }
        : undefined,
    },
  })

  return { success: true }
}

const updateProductSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Product name is required"),
  description: z.string().trim().min(1, "Description is required"),
  categoryId: z.string().trim().min(1, "Please select a category"),
  images: z.array(z.string()).min(1, "At least one product photo is required"),
  retailPrice: z.number().positive("Enter a valid retail price"),
  wholesalePrice: z.number().positive("Enter a valid wholesale price"),
  minWholesaleQty: z.number().int().positive("Enter a valid minimum wholesale quantity"),
  unit: z.string().trim().optional(),
})

export async function updateDistributorProduct(input: unknown): Promise<DistributorProductActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = updateProductSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  if (data.wholesalePrice >= data.retailPrice) {
    return { success: false, error: "Wholesale price should be lower than retail price." }
  }

  const product = await db.distributorProduct.findUnique({ where: { id: data.id } })
  if (!product || product.distributorId !== distributor.distributorId) return { success: false, error: "Product not found." }

  await db.distributorProduct.update({
    where: { id: data.id },
    data: {
      name: data.name,
      description: data.description,
      categoryId: data.categoryId,
      images: data.images,
      retailPrice: data.retailPrice,
      wholesalePrice: data.wholesalePrice,
      minWholesaleQty: data.minWholesaleQty,
      unit: data.unit || undefined,
    },
  })

  return { success: true }
}

const productIdSchema = z.object({ id: z.string().trim().min(1) })

export async function toggleDistributorProductActive(input: unknown): Promise<DistributorProductActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = productIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const product = await db.distributorProduct.findUnique({ where: { id: parsed.data.id } })
  if (!product || product.distributorId !== distributor.distributorId) return { success: false, error: "Product not found." }

  // Progressive KYC: listing goes live only for a verified distributor;
  // taking one down stays available regardless, so nobody is trapped with a
  // listing they cannot withdraw.
  if (!product.isActive) {
    const gate = await requireVerified("product.publish")
    if (!gate.ok) return { success: false, error: gate.error }
  }

  await db.distributorProduct.update({ where: { id: product.id }, data: { isActive: !product.isActive } })
  return { success: true }
}

export async function deleteDistributorProduct(input: unknown): Promise<DistributorProductActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = productIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const product = await db.distributorProduct.findUnique({ where: { id: parsed.data.id } })
  if (!product || product.distributorId !== distributor.distributorId) return { success: false, error: "Product not found." }

  try {
    await db.distributorProduct.delete({ where: { id: product.id } })
    return { success: true }
  } catch {
    return { success: false, error: "This product can't be deleted because it's part of existing orders. Try marking it inactive instead." }
  }
}

const adjustStockSchema = z.object({
  distributorProductId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  newStock: z.number().int().min(0, "Stock can't be negative"),
})

export async function adjustLocationStock(input: unknown): Promise<DistributorProductActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = adjustStockSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { distributorProductId, locationId, newStock } = parsed.data

  const [product, location] = await Promise.all([
    db.distributorProduct.findUnique({ where: { id: distributorProductId } }),
    db.distributorLocation.findUnique({ where: { id: locationId } }),
  ])
  if (!product || product.distributorId !== distributor.distributorId) return { success: false, error: "Product not found." }
  if (!location || location.distributorId !== distributor.distributorId) return { success: false, error: "Location not found." }

  await db.distributorInventory.upsert({
    where: { distributorProductId_locationId: { distributorProductId, locationId } },
    create: { distributorProductId, locationId, currentStock: newStock, lastRestockedAt: new Date() },
    update: { currentStock: newStock, lastRestockedAt: new Date() },
  })

  return { success: true }
}
