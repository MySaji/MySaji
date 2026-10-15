"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"
import { promotionIsLive } from "@/backend/domain/pos-pricing"

/**
 * Managing what things cost: price lists for customers, offers for everyone.
 *
 * The rules themselves live in backend/domain/pos-pricing.ts, which is pure
 * and tested on its own. This is the part that reads and writes them.
 *
 * Both are gated on product.price rather than anything at the till. Deciding
 * what a thing sells for is a decision about margin, and the existing role
 * matrix already draws that line: a stock controller handles goods and
 * deliberately does not have product.price.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

export type PriceListRow = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  itemCount: number
  customerCount: number
  items: { id: string; productId: string; productName: string; price: number; minQuantity: number }[]
}

export async function getPriceLists(staffId?: string | null): Promise<PriceListRow[]> {
  const g = await gate("product.view", staffId)
  if (!g.ok) return []

  const rows = await db.posPriceList.findMany({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: { name: "asc" },
    include: {
      items: {
        orderBy: [{ productId: "asc" }, { minQuantity: "asc" }],
        include: { product: { select: { name: true } } },
      },
      _count: { select: { customers: true } },
    },
  })

  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    isActive: l.isActive,
    itemCount: l.items.length,
    customerCount: l._count.customers,
    items: l.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      price: money(i.price),
      minQuantity: Number(i.minQuantity.toFixed(3)),
    })),
  }))
}

export type PricingResult = { success: true; id: string } | { success: false; error: string }

const listSchema = z.object({
  name: z.string().trim().min(2, "Give the list a name."),
  description: z.string().trim().max(300).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

export async function createPriceList(input: unknown): Promise<PricingResult> {
  const parsed = listSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { name, description, staffId } = parsed.data

  const g = await gate("product.price", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const clash = await db.posPriceList.findFirst({
    where: { shopkeeperId: g.shopkeeperId, name },
    select: { id: true },
  })
  if (clash) return { success: false, error: "There is already a list called " + name + "." }

  const created = await db.posPriceList.create({
    data: { shopkeeperId: g.shopkeeperId, name, description: description || null },
    select: { id: true },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "pricing.list_create",
    entityType: "price_list",
    entityId: created.id,
    summary: "Created the price list " + name,
  })

  return { success: true, id: created.id }
}

const itemSchema = z.object({
  priceListId: z.string().min(1),
  productId: z.string().min(1),
  price: z.coerce.number().min(0, "A price cannot be negative."),
  minQuantity: z.coerce.number().positive().default(1),
  staffId: z.string().optional().nullable(),
})

/** Set what one product costs on one list, at one quantity break. */
export async function setPriceListItem(input: unknown): Promise<PricingResult> {
  const parsed = itemSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { priceListId, productId, price, minQuantity, staffId } = parsed.data

  const g = await gate("product.price", staffId)
  if (!g.ok) return { success: false, error: g.error }

  // Both scoped to the shop, so neither id arriving from a browser can reach
  // another shop's list or catalogue.
  const [list, product] = await Promise.all([
    db.posPriceList.findFirst({ where: { id: priceListId, shopkeeperId: g.shopkeeperId }, select: { id: true } }),
    db.product.findFirst({ where: { id: productId, shopkeeperId: g.shopkeeperId }, select: { id: true, name: true } }),
  ])
  if (!list) return { success: false, error: "That price list was not found." }
  if (!product) return { success: false, error: "That product is not in this shop's catalogue." }

  const row = await db.posPriceListItem.upsert({
    where: { priceListId_productId_minQuantity: { priceListId, productId, minQuantity: D(minQuantity) } },
    create: { priceListId, productId, price: D(price), minQuantity: D(minQuantity) },
    update: { price: D(price) },
    select: { id: true },
  })

  return { success: true, id: row.id }
}

export async function removePriceListItem(
  input: { itemId: string; staffId?: string | null },
): Promise<PricingResult> {
  const g = await gate("product.price", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const item = await db.posPriceListItem.findFirst({
    where: { id: input.itemId, priceList: { shopkeeperId: g.shopkeeperId } },
    select: { id: true },
  })
  if (!item) return { success: false, error: "That line was not found." }

  await db.posPriceListItem.delete({ where: { id: input.itemId } })
  return { success: true, id: input.itemId }
}

const assignSchema = z.object({
  posCustomerId: z.string().min(1),
  /** Null puts them back on shelf prices. */
  priceListId: z.string().nullable(),
  staffId: z.string().optional().nullable(),
})

/** Put a customer on a list, or take them off it. */
export async function assignPriceList(input: unknown): Promise<PricingResult> {
  const parsed = assignSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the details." }
  const { posCustomerId, priceListId, staffId } = parsed.data

  const g = await gate("product.price", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const customer = await db.posCustomer.findFirst({
    where: { id: posCustomerId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true },
  })
  if (!customer) return { success: false, error: "That customer was not found." }

  if (priceListId) {
    const list = await db.posPriceList.findFirst({
      where: { id: priceListId, shopkeeperId: g.shopkeeperId },
      select: { id: true },
    })
    if (!list) return { success: false, error: "That price list was not found." }
  }

  await db.posCustomer.update({ where: { id: posCustomerId }, data: { priceListId } })

  await recordPosAudit({
    actor: g.actor,
    action: "pricing.list_assign",
    entityType: "pos_customer",
    entityId: posCustomerId,
    summary: priceListId
      ? customer.name + " moved onto a price list"
      : customer.name + " moved back to shelf prices",
  })

  return { success: true, id: posCustomerId }
}

export type PromotionRow = {
  id: string
  name: string
  kind: "PERCENT_OFF" | "AMOUNT_OFF" | "BUY_X_GET_Y" | "BUNDLE_PRICE"
  /** Written out the way a shopkeeper would say it. */
  summary: string
  isActive: boolean
  live: boolean
  productName: string | null
  startsAt: string | null
  endsAt: string | null
  priority: number
  stackable: boolean
}

function describe(p: {
  kind: string; percentOff: Prisma.Decimal | null; amountOff: Prisma.Decimal | null
  buyQuantity: number | null; getQuantity: number | null; getPercentOff: Prisma.Decimal | null
  bundleQuantity: number | null; bundlePrice: Prisma.Decimal | null
}): string {
  switch (p.kind) {
    case "PERCENT_OFF": return Number(p.percentOff ?? 0) + "% off"
    case "AMOUNT_OFF": return money(D(p.amountOff ?? 0)) + " off each"
    case "BUY_X_GET_Y": {
      const off = Number(p.getPercentOff ?? 100)
      return "Buy " + (p.buyQuantity ?? 0) + ", get " + (p.getQuantity ?? 0) +
        (off >= 100 ? " free" : " at " + off + "% off")
    }
    case "BUNDLE_PRICE":
      return (p.bundleQuantity ?? 0) + " for " + money(D(p.bundlePrice ?? 0))
    default: return ""
  }
}

export async function getPromotions(staffId?: string | null): Promise<PromotionRow[]> {
  const g = await gate("product.view", staffId)
  if (!g.ok) return []

  const rows = await db.posPromotion.findMany({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }],
    include: { product: { select: { name: true } } },
  })

  const now = new Date()
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    summary: describe(p),
    isActive: p.isActive,
    live: promotionIsLive(p, now),
    productName: p.product?.name ?? null,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    priority: p.priority,
    stackable: p.stackable,
  }))
}

const promoSchema = z.object({
  name: z.string().trim().min(2, "Give the offer a name the cashier will recognise."),
  kind: z.enum(["PERCENT_OFF", "AMOUNT_OFF", "BUY_X_GET_Y", "BUNDLE_PRICE"]),
  productId: z.string().trim().optional().nullable(),
  categoryId: z.string().trim().optional().nullable(),
  percentOff: z.coerce.number().min(0).max(100).optional().nullable(),
  amountOff: z.coerce.number().min(0).optional().nullable(),
  buyQuantity: z.coerce.number().int().min(1).optional().nullable(),
  getQuantity: z.coerce.number().int().min(1).optional().nullable(),
  getPercentOff: z.coerce.number().min(0).max(100).optional().nullable(),
  bundleQuantity: z.coerce.number().int().min(2).optional().nullable(),
  bundlePrice: z.coerce.number().min(0).optional().nullable(),
  startsAt: z.string().trim().optional().nullable(),
  endsAt: z.string().trim().optional().nullable(),
  priority: z.coerce.number().int().min(1).max(999).default(100),
  stackable: z.coerce.boolean().default(false),
  staffId: z.string().optional().nullable(),
})

export async function createPromotion(input: unknown): Promise<PricingResult> {
  const parsed = promoSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const d = parsed.data

  const g = await gate("product.price", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  // Each kind needs its own numbers. Refused here rather than silently
  // creating an offer that can never fire, which is worse than no offer at
  // all because the shop believes it is running.
  if (d.kind === "PERCENT_OFF" && d.percentOff == null) {
    return { success: false, error: "Say what percentage comes off." }
  }
  if (d.kind === "AMOUNT_OFF" && d.amountOff == null) {
    return { success: false, error: "Say how much comes off each one." }
  }
  if (d.kind === "BUY_X_GET_Y" && (d.buyQuantity == null || d.getQuantity == null)) {
    return { success: false, error: "Say how many they buy and how many they get." }
  }
  if (d.kind === "BUNDLE_PRICE" && (d.bundleQuantity == null || d.bundlePrice == null)) {
    return { success: false, error: "Say how many, and for how much." }
  }
  if (d.productId && d.categoryId) {
    return { success: false, error: "An offer is on one product or one category, not both." }
  }

  if (d.productId) {
    const owned = await db.product.findFirst({
      where: { id: d.productId, shopkeeperId: g.shopkeeperId }, select: { id: true },
    })
    if (!owned) return { success: false, error: "That product is not in this shop's catalogue." }
  }

  const starts = d.startsAt ? new Date(d.startsAt) : null
  const ends = d.endsAt ? new Date(d.endsAt) : null
  if (starts && ends && ends < starts) {
    return { success: false, error: "The offer cannot end before it starts." }
  }

  const created = await db.posPromotion.create({
    data: {
      shopkeeperId: g.shopkeeperId,
      name: d.name,
      kind: d.kind,
      productId: d.productId || null,
      categoryId: d.categoryId || null,
      percentOff: d.percentOff == null ? null : D(d.percentOff),
      amountOff: d.amountOff == null ? null : D(d.amountOff),
      buyQuantity: d.buyQuantity ?? null,
      getQuantity: d.getQuantity ?? null,
      getPercentOff: d.getPercentOff == null ? null : D(d.getPercentOff),
      bundleQuantity: d.bundleQuantity ?? null,
      bundlePrice: d.bundlePrice == null ? null : D(d.bundlePrice),
      startsAt: starts,
      endsAt: ends,
      priority: d.priority,
      stackable: d.stackable,
    },
    select: { id: true },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "pricing.promo_create",
    entityType: "promotion",
    entityId: created.id,
    summary: "Created the offer " + d.name + " (" + describe({
      kind: d.kind,
      percentOff: d.percentOff == null ? null : D(d.percentOff),
      amountOff: d.amountOff == null ? null : D(d.amountOff),
      buyQuantity: d.buyQuantity ?? null,
      getQuantity: d.getQuantity ?? null,
      getPercentOff: d.getPercentOff == null ? null : D(d.getPercentOff),
      bundleQuantity: d.bundleQuantity ?? null,
      bundlePrice: d.bundlePrice == null ? null : D(d.bundlePrice),
    }) + ")",
  })

  return { success: true, id: created.id }
}

/** Switch an offer on or off without deleting its history. */
export async function setPromotionActive(
  input: { id: string; isActive: boolean; staffId?: string | null },
): Promise<PricingResult> {
  const g = await gate("product.price", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const p = await db.posPromotion.findFirst({
    where: { id: input.id, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true },
  })
  if (!p) return { success: false, error: "That offer was not found." }

  await db.posPromotion.update({ where: { id: input.id }, data: { isActive: input.isActive } })

  await recordPosAudit({
    actor: g.actor,
    action: "pricing.promo_toggle",
    entityType: "promotion",
    entityId: input.id,
    summary: p.name + (input.isActive ? " switched on" : " switched off"),
  })

  return { success: true, id: input.id }
}
