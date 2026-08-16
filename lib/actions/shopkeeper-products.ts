"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireShopkeeper } from "@/lib/actions/shopkeeper-dashboard"

export type ShopkeeperProductStatus = "active" | "low_stock" | "out_of_stock" | "inactive"

export type ShopkeeperProduct = {
  id: string
  name: string
  description: string
  images: string[]
  price: number
  discountPrice: number | null
  stock: number
  sold: number
  categoryId: string | null
  categoryName: string | null
  status: ShopkeeperProductStatus
  rating: number
  reviewCount: number
}

function deriveStatus(isActive: boolean, stock: number): ShopkeeperProductStatus {
  if (!isActive) return "inactive"
  if (stock <= 0) return "out_of_stock"
  if (stock <= 5) return "low_stock"
  return "active"
}

export async function getMyProducts(): Promise<ShopkeeperProduct[]> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return []

  const products = await db.product.findMany({
    where: { shopkeeperId: shopkeeper.shopkeeperId },
    orderBy: { createdAt: "desc" },
    include: { category: true, inventory: true },
  })

  return products.map((p) => {
    const stock = p.inventory ? p.inventory.currentStock : 0
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      images: p.images,
      price: Number(p.price),
      discountPrice: p.discountPrice ? Number(p.discountPrice) : null,
      stock,
      sold: p.totalSold,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      status: deriveStatus(p.isActive, stock),
      rating: Number(p.rating),
      reviewCount: p.reviewCount,
    }
  })
}

export type ShopkeeperProductCategoryOption = { id: string; name: string }

export async function getProductCategoryOptions(): Promise<ShopkeeperProductCategoryOption[]> {
  const categories = await db.category.findMany({ where: { type: "PRODUCT", isActive: true }, orderBy: { name: "asc" } })
  return categories.map((c) => ({ id: c.id, name: c.name }))
}

export type ShopkeeperProductActionResult = { success: true } | { success: false; error: string }

const productShape = {
  name: z.string().trim().min(1, "Product name is required"),
  description: z.string().trim().min(1, "Description is required"),
  price: z.number().positive("Enter a valid price"),
  discountPrice: z.number().positive().optional(),
  stock: z.number().int().min(0),
  categoryId: z.string().trim().min(1, "Please select a category"),
  images: z.array(z.string()).min(1, "At least one product photo is required"),
}

const discountBelowPrice = (data: { discountPrice?: number; price: number }) => data.discountPrice == null || data.discountPrice < data.price
const discountRefinement = { message: "Discount price must be lower than the regular price", path: ["discountPrice"] }

const productSchema = z.object(productShape).refine(discountBelowPrice, discountRefinement)

function generateSku(): string {
  return `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export async function createMyProduct(input: unknown): Promise<ShopkeeperProductActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = productSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  await db.product.create({
    data: {
      shopkeeperId: shopkeeper.shopkeeperId,
      categoryId: data.categoryId,
      name: data.name,
      description: data.description,
      sku: generateSku(),
      price: data.price,
      discountPrice: data.discountPrice,
      images: data.images,
      inventory: { create: { currentStock: data.stock } },
    },
  })

  return { success: true }
}

const updateProductSchema = z.object({ ...productShape, id: z.string().trim().min(1) }).refine(discountBelowPrice, discountRefinement)

export async function updateMyProduct(input: unknown): Promise<ShopkeeperProductActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = updateProductSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  const product = await db.product.findUnique({ where: { id: data.id }, include: { inventory: true } })
  if (!product || product.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Product not found." }

  await db.product.update({
    where: { id: data.id },
    data: {
      name: data.name,
      description: data.description,
      price: data.price,
      discountPrice: data.discountPrice ?? null,
      categoryId: data.categoryId,
      images: data.images,
    },
  })

  // A restock is specifically stock moving from empty to available — not
  // just any inventory edit — so the weekly subscriber digest (which reads
  // this field) only surfaces genuine "back in stock" news, not routine
  // price/quantity tweaks on an already-stocked item.
  const wasOutOfStock = !product.inventory || product.inventory.currentStock <= 0
  const isRestock = wasOutOfStock && data.stock > 0

  await db.inventory.upsert({
    where: { productId: data.id },
    update: { currentStock: data.stock, ...(isRestock ? { lastRestockedAt: new Date() } : {}) },
    create: { productId: data.id, currentStock: data.stock, ...(isRestock ? { lastRestockedAt: new Date() } : {}) },
  })

  return { success: true }
}

const productIdSchema = z.object({ id: z.string().trim().min(1) })

export async function toggleMyProductActive(input: unknown): Promise<ShopkeeperProductActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = productIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const product = await db.product.findUnique({ where: { id: parsed.data.id } })
  if (!product || product.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Product not found." }

  await db.product.update({ where: { id: product.id }, data: { isActive: !product.isActive } })
  return { success: true }
}

const bulkRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().min(1, "Description is required"),
  price: z.coerce.number().positive("Invalid price"),
  discountPrice: z.union([z.coerce.number().positive(), z.literal(""), z.undefined()]).optional(),
  stock: z.coerce.number().int().min(0, "Invalid stock"),
  category: z.string().trim().min(1, "Category is required"),
  imageUrl: z.union([z.string().trim().url(), z.literal(""), z.undefined()]).optional(),
})

export type BulkImportRowError = { row: number; name: string; error: string }
export type BulkImportResult =
  | { success: true; createdCount: number; errors: BulkImportRowError[] }
  | { success: false; error: string }

export async function bulkImportProducts(rows: unknown): Promise<BulkImportResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: "No rows to import." }
  if (rows.length > 500) return { success: false, error: "A single import is limited to 500 rows." }

  const categories = await db.category.findMany({ where: { type: "PRODUCT", isActive: true } })
  const categoryIdByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]))

  const errors: BulkImportRowError[] = []
  let createdCount = 0

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2 // header is row 1, data starts at row 2
    const rawName = typeof rows[i] === "object" && rows[i] !== null ? (rows[i] as Record<string, unknown>).name : undefined
    const displayName = typeof rawName === "string" ? rawName : `Row ${rowNumber}`

    const parsed = bulkRowSchema.safeParse(rows[i])
    if (!parsed.success) {
      errors.push({ row: rowNumber, name: displayName, error: parsed.error.issues[0]?.message ?? "Invalid row" })
      continue
    }
    const data = parsed.data
    if (data.discountPrice !== undefined && data.discountPrice !== "" && Number(data.discountPrice) >= data.price) {
      errors.push({ row: rowNumber, name: data.name, error: "Discount price must be lower than the regular price" })
      continue
    }
    const categoryId = categoryIdByName.get(data.category.trim().toLowerCase())
    if (!categoryId) {
      errors.push({ row: rowNumber, name: data.name, error: `Unknown category "${data.category}"` })
      continue
    }

    await db.product.create({
      data: {
        shopkeeperId: shopkeeper.shopkeeperId,
        categoryId,
        name: data.name,
        description: data.description,
        sku: generateSku(),
        price: data.price,
        discountPrice: data.discountPrice ? Number(data.discountPrice) : undefined,
        images: data.imageUrl ? [data.imageUrl] : [],
        inventory: { create: { currentStock: data.stock } },
      },
    })
    createdCount++
  }

  return { success: true, createdCount, errors }
}

export async function deleteMyProduct(input: unknown): Promise<ShopkeeperProductActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = productIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const product = await db.product.findUnique({ where: { id: parsed.data.id } })
  if (!product || product.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Product not found." }

  try {
    await db.product.delete({ where: { id: product.id } })
    return { success: true }
  } catch {
    return { success: false, error: "This product can't be deleted because it's part of existing orders. Try marking it inactive instead." }
  }
}
