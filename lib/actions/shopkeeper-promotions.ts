"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireShopkeeper } from "@/lib/actions/shopkeeper-dashboard"

export type ShopkeeperPromotionType = "percentage" | "fixed" | "bogo"
export type ShopkeeperPromotionStatus = "active" | "scheduled" | "expired" | "paused"

export type ShopkeeperPromotion = {
  id: string
  name: string
  code: string
  type: ShopkeeperPromotionType
  value: number
  minOrder: number
  maxUses: number | null
  usedCount: number
  startDate: string
  endDate: string | null
  status: ShopkeeperPromotionStatus
  categoryId: string | null
  categoryName: string | null
  description: string | null
}

export async function getMyPromotions(): Promise<ShopkeeperPromotion[]> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return []

  const promotions = await db.promotion.findMany({
    where: { shopkeeperId: shopkeeper.shopkeeperId },
    orderBy: { createdAt: "desc" },
    include: { category: true },
  })

  return promotions.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    type: p.type.toLowerCase() as ShopkeeperPromotionType,
    value: Number(p.value),
    minOrder: Number(p.minOrder),
    maxUses: p.maxUses,
    usedCount: p.usedCount,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate ? p.endDate.toISOString() : null,
    status: p.status.toLowerCase() as ShopkeeperPromotionStatus,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    description: p.description,
  }))
}

export type ShopkeeperPromotionActionResult = { success: true } | { success: false; error: string }

const TYPE_TO_DB: Record<string, "PERCENTAGE" | "FIXED" | "BOGO"> = {
  percentage: "PERCENTAGE",
  fixed: "FIXED",
  bogo: "BOGO",
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Promotion name is required"),
  code: z.string().trim().min(1, "Coupon code is required"),
  type: z.enum(["percentage", "fixed", "bogo"]),
  value: z.number().positive("Enter a valid discount value"),
  minOrder: z.number().min(0),
  maxUses: z.number().int().positive().optional(),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  description: z.string().trim().optional(),
})

function deriveStatus(startDate: Date, endDate: Date | null): "ACTIVE" | "SCHEDULED" | "EXPIRED" {
  const now = new Date()
  if (startDate > now) return "SCHEDULED"
  if (endDate && endDate < now) return "EXPIRED"
  return "ACTIVE"
}

export async function createMyPromotion(input: unknown): Promise<ShopkeeperPromotionActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  const existing = await db.promotion.findUnique({ where: { code: data.code.toUpperCase() } })
  if (existing) return { success: false, error: "This coupon code is already in use." }

  const startDate = new Date(data.startDate)
  const endDate = data.endDate ? new Date(data.endDate) : null

  await db.promotion.create({
    data: {
      shopkeeperId: shopkeeper.shopkeeperId,
      name: data.name,
      code: data.code.toUpperCase(),
      type: TYPE_TO_DB[data.type],
      value: data.value,
      minOrder: data.minOrder,
      maxUses: data.maxUses,
      startDate,
      endDate,
      status: deriveStatus(startDate, endDate),
      categoryId: data.categoryId || null,
      description: data.description || null,
    },
  })

  return { success: true }
}

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function deleteMyPromotion(input: unknown): Promise<ShopkeeperPromotionActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const promo = await db.promotion.findUnique({ where: { id: parsed.data.id } })
  if (!promo || promo.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Promotion not found." }

  await db.promotion.delete({ where: { id: promo.id } })
  return { success: true }
}

export async function togglePromotionPause(input: unknown): Promise<ShopkeeperPromotionActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const promo = await db.promotion.findUnique({ where: { id: parsed.data.id } })
  if (!promo || promo.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Promotion not found." }
  if (promo.status !== "ACTIVE" && promo.status !== "PAUSED") return { success: false, error: "Only active or paused promotions can be toggled." }

  await db.promotion.update({
    where: { id: promo.id },
    data: { status: promo.status === "ACTIVE" ? "PAUSED" : deriveStatus(promo.startDate, promo.endDate) },
  })

  return { success: true }
}
