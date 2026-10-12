"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { parsePosConfig } from "@/backend/domain/pos-config"
import { effectiveTraits } from "@/backend/domain/pos-profiles"
import { requirePosPermission, recordPosAudit } from "@/backend/actions/pos-access"
import { refusalFor } from "@/backend/domain/pos-permissions"
import { recordStockMovement } from "@/backend/services/pos-ledger"

/**
 * The catalogue, as a shop keeps it.
 *
 * WHY THIS IS NOT THE MARKETPLACE PRODUCT FORM
 *
 * actions/shopkeeper-products.ts exists and creates products perfectly
 * well, for a merchant building a storefront: it insists on a description,
 * a marketplace category and at least one photograph, because a listing
 * without those does not sell to a stranger.
 *
 * None of that is true at a counter. A duka adding "Unga 2kg, 180 bob" has
 * no photograph, no prose and no interest in a category tree, and asking
 * for them means the product gets added in the ledger's margins instead, or
 * not at all. What a till needs is a name, a price and a unit. Everything
 * else is optional and can be filled in later.
 *
 * WHAT IT ASKS FOR THAT THE MARKETPLACE DOES NOT
 *
 * The cost price, because a till that cannot say what a thing cost cannot
 * report a margin, value the stock on the shelves, or cost what was lost
 * when something broke. It stays optional, since a shop that does not know
 * its costs should see empty figures rather than confident wrong ones.
 *
 * ON NOT PUBLISHING A SHOP'S STOCK LIST BY ACCIDENT
 *
 * A product has to be active for the till to sell it. Until
 * domain/public-catalog.ts, active also meant publicly browsable, so a till
 * only shop was publishing its stock list, costs and all, to the SAJI
 * marketplace. The visibility rule now lives with the shop, so this page
 * can mark things active without a duka ever becoming a storefront. A shop
 * that IS a storefront is told plainly that what it adds here will show
 * there too.
 *
 * As everywhere in the POS, the tenant comes from the session and no
 * function takes a shopkeeperId.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const num = (v: Prisma.Decimal | null | undefined, fallback = 0) =>
  v === null || v === undefined ? fallback : Number(v.toString())

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return {
    ok: true as const,
    shopkeeperId: g.actor.shopkeeperId,
    businessId: g.actor.businessId,
    actor: g.actor,
  }
}

// ------------------------------------------------------------------- reading

export type CatalogueStatus = "selling" | "low" | "out" | "paused"

export type CatalogueRow = {
  id: string
  name: string
  sku: string
  barcode: string | null
  image: string | null
  unit: string
  price: number
  /** Null where the shop has never recorded what it pays. */
  costPrice: number | null
  /** Shillings made on one unit at the current prices, null without a cost. */
  margin: number | null
  /** The same as a percentage of the selling price. */
  marginPercent: number | null
  stock: number
  lowStockThreshold: number
  status: CatalogueStatus
  categoryId: string | null
  categoryName: string | null
  ageRestricted: boolean
  isActive: boolean
  /** True where stock is kept per delivery, which changes where it is edited. */
  tracksBatches: boolean
  tracksSerials: boolean
  hasVariants: boolean
  /** The soonest expiry across this product's batches, where it has any. */
  expiresOn: string | null
  soldAllTime: number
  createdAt: string
}

export type CatalogueSummary = {
  products: number
  selling: number
  paused: number
  low: number
  out: number
  /** What the stock on hand cost the shop, over the products that have a cost. */
  stockValue: number
  /** What it would fetch at the shelf price. */
  retailValue: number
  /** How many products have no cost recorded, so the figures above are partial. */
  missingCost: number
}

export type CatalogueView = {
  summary: CatalogueSummary
  rows: CatalogueRow[]
  /** Marketplace categories, for the shops that do sell on SAJI. */
  categories: { id: string; name: string }[]
  /** True where this shop is a storefront, so adding a product also lists it. */
  listedOnMarketplace: boolean
  /** The shop's own default unit, so the form starts where it usually ends. */
  defaultUnit: string
  canEdit: boolean
  canPrice: boolean
  canCreate: boolean
} | null

function statusOf(isActive: boolean, stock: number, low: number): CatalogueStatus {
  if (!isActive) return "paused"
  if (stock <= 0) return "out"
  if (stock <= low) return "low"
  return "selling"
}

export async function getCatalogue(input?: unknown): Promise<CatalogueView> {
  const parsed = z.object({
    query: z.string().trim().max(80).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input ?? {})
  const q = parsed.success ? parsed.data.query : undefined
  const staffId = parsed.success ? parsed.data.staffId : undefined

  const g = await gate("product.view", staffId)
  if (!g.ok) return null

  const shop = await db.shopkeeperProfile.findUnique({
    where: { id: g.shopkeeperId },
    select: { posProfileKey: true, posTraits: true, posConfig: true, listedOnMarketplace: true },
  })
  if (!shop) return null
  const config = parsePosConfig(shop.posConfig)

  const where: Prisma.ProductWhereInput = { shopkeeperId: g.shopkeeperId }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
    ]
  }

  const products = await db.product.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, sku: true, barcode: true, images: true, unit: true,
      price: true, costPrice: true, categoryId: true, ageRestricted: true, isActive: true,
      tracksBatches: true, tracksSerials: true, hasVariants: true, totalSold: true, createdAt: true,
      category: { select: { name: true } },
      inventory: { select: { currentStock: true, stockOnHand: true, lowStockThreshold: true } },
    },
  })

  // The soonest expiry per product, for the products that keep batches. One
  // grouped query rather than a lookup per row.
  const batchedIds = products.filter((p) => p.tracksBatches).map((p) => p.id)
  const expiries = batchedIds.length
    ? await db.productBatch.groupBy({
        by: ["productId"],
        where: {
          productId: { in: batchedIds },
          isActive: true,
          currentStock: { gt: 0 },
          expiryDate: { not: null },
        },
        _min: { expiryDate: true },
      })
    : []
  const expiryBy = new Map(expiries.map((e) => [e.productId, e._min?.expiryDate ?? null]))

  const rows: CatalogueRow[] = products.map((p) => {
    // stockOnHand is the fractional truth where the ledger has written one;
    // null MEANS currentStock is authoritative here. See the Inventory model.
    const stock = p.inventory
      ? p.inventory.stockOnHand !== null ? num(p.inventory.stockOnHand) : p.inventory.currentStock
      : 0
    const low = p.inventory?.lowStockThreshold ?? 5
    const price = num(p.price)
    const cost = p.costPrice === null ? null : num(p.costPrice)
    const margin = cost === null ? null : Number((price - cost).toFixed(2))
    const expiresOn = expiryBy.get(p.id) ?? null
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      image: p.images[0] ?? null,
      unit: p.unit,
      price,
      costPrice: cost,
      margin,
      marginPercent: margin === null || price <= 0 ? null : Number(((margin / price) * 100).toFixed(1)),
      stock,
      lowStockThreshold: low,
      status: statusOf(p.isActive, stock, low),
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
      ageRestricted: p.ageRestricted,
      isActive: p.isActive,
      tracksBatches: p.tracksBatches,
      tracksSerials: p.tracksSerials,
      hasVariants: p.hasVariants,
      expiresOn: expiresOn ? expiresOn.toISOString() : null,
      soldAllTime: p.totalSold,
      createdAt: p.createdAt.toISOString(),
    }
  })

  const summary: CatalogueSummary = {
    products: rows.length,
    selling: rows.filter((r) => r.status === "selling").length,
    paused: rows.filter((r) => r.status === "paused").length,
    low: rows.filter((r) => r.status === "low").length,
    out: rows.filter((r) => r.status === "out").length,
    stockValue: Number(rows.reduce((t, r) => t + (r.costPrice === null ? 0 : r.costPrice * r.stock), 0).toFixed(2)),
    retailValue: Number(rows.reduce((t, r) => t + r.price * r.stock, 0).toFixed(2)),
    missingCost: rows.filter((r) => r.costPrice === null && r.stock > 0).length,
  }

  // Only a storefront needs the category list, and it is a table scan nobody
  // else should pay for.
  const categories = shop.listedOnMarketplace
    ? (await db.category.findMany({
        where: { type: "PRODUCT", isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }))
    : []

  return {
    summary,
    rows,
    categories,
    listedOnMarketplace: shop.listedOnMarketplace,
    defaultUnit: config.defaultUnit,
    canEdit: g.actor.can("product.edit"),
    canPrice: g.actor.can("product.price"),
    canCreate: g.actor.can("product.create"),
  }
}

// ------------------------------------------------------------------- writing

export type CatalogueResult = { success: true; productId: string } | { success: false; error: string }

const saveShape = z.object({
  /** Absent to create, present to edit. */
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, "Give the product a name").max(120),
  /** Blank is allowed: one is generated from the name. */
  sku: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(60).optional(),
  price: z.number().min(0, "A price cannot be negative").max(100_000_000),
  costPrice: z.number().min(0).max(100_000_000).optional(),
  unit: z.string().trim().min(1).max(20),
  /** Only set by a shop that sells on SAJI. */
  categoryId: z.string().trim().min(1).optional(),
  description: z.string().trim().max(2000).optional(),
  image: z.string().trim().max(2_000_000).optional(),
  ageRestricted: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
  /** Stock to open with. Only honoured on create, and written as a movement. */
  openingStock: z.number().min(0).max(10_000_000).optional(),
  isActive: z.boolean().optional(),
  staffId: z.string().trim().max(60).optional(),
})

/**
 * A code the shopkeeper will recognise, from the name they just typed.
 *
 * "Blue Band 500g" becomes BLU-BAN-4F2A. Readable, because a shopkeeper
 * reading a stock sheet should be able to tell which line is which, and
 * suffixed at random because two products can start with the same words.
 */
function skuFrom(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
  const stem = words.slice(0, 2).map((w) => w.slice(0, 3)).join("-") || "ITEM"
  return stem + "-" + Math.random().toString(36).slice(2, 6).toUpperCase()
}

export async function saveProduct(input: unknown): Promise<CatalogueResult> {
  const parsed = saveShape.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form" }
  const body = parsed.data

  // Creating and editing are different permissions, and changing a price is
  // a third: a stock controller may add a product without setting what the
  // shop charges for it.
  const g = await gate(body.id ? "product.edit" : "product.create", body.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const existing = body.id
    ? await db.product.findFirst({
        where: { id: body.id, shopkeeperId: g.shopkeeperId },
        select: {
          id: true, name: true, price: true, costPrice: true, sku: true, isActive: true,
          tracksBatches: true, images: true, description: true,
        },
      })
    : null
  if (body.id && !existing) return { success: false, error: "That product is not in this shop." }

  const priceChanged = existing ? !D(existing.price).equals(D(body.price)) : body.price > 0
  if (priceChanged && !g.actor.can("product.price")) {
    return { success: false, error: refusalFor("product.price", g.actor.role) }
  }

  // A barcode that already belongs to another product in this shop is almost
  // always a mis-scan, and allowing it would make one scan ambiguous at the
  // till. Said plainly, with the name of the product that holds it.
  if (body.barcode) {
    const clash = await db.product.findFirst({
      where: { shopkeeperId: g.shopkeeperId, barcode: body.barcode, ...(body.id ? { id: { not: body.id } } : {}) },
      select: { name: true },
    })
    if (clash) return { success: false, error: "That barcode is already on " + clash.name + "." }
  }

  const sku = body.sku && body.sku.length > 0 ? body.sku : existing?.sku ?? skuFrom(body.name)
  const skuClash = await db.product.findFirst({
    where: { shopkeeperId: g.shopkeeperId, sku, ...(body.id ? { id: { not: body.id } } : {}) },
    select: { name: true },
  })
  if (skuClash) return { success: false, error: "The code " + sku + " is already on " + skuClash.name + "." }

  const data: Prisma.ProductUncheckedUpdateInput = {
    name: body.name,
    sku,
    barcode: body.barcode && body.barcode.length > 0 ? body.barcode : null,
    price: D(body.price),
    unit: body.unit,
    ...(body.costPrice !== undefined ? { costPrice: D(body.costPrice) } : {}),
    ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
    ...(body.ageRestricted !== undefined ? { ageRestricted: body.ageRestricted } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    ...(body.image !== undefined ? { images: body.image.length > 0 ? [body.image] : [] } : {}),
    // The marketplace insists on a description. A till does not, so one is
    // kept only if given, and the column is not null, so new rows get the
    // name rather than an empty string that reads as a bug on a listing.
    ...(body.description !== undefined && body.description.length > 0 ? { description: body.description } : {}),
  }

  if (existing) {
    await db.product.update({ where: { id: existing.id }, data })
    if (body.lowStockThreshold !== undefined) {
      await db.inventory.updateMany({
        where: { productId: existing.id },
        data: { lowStockThreshold: body.lowStockThreshold },
      })
    }
    await recordPosAudit({
      actor: g.actor,
      action: "product.edit",
      summary: g.actor.name + " changed " + (existing.name === body.name
        ? existing.name
        : existing.name + ", now called " + body.name),
      entityType: "product",
      entityId: existing.id,
      detail: {
        name: body.name,
        priceWas: Number(existing.price.toString()),
        priceNow: body.price,
        costWas: existing.costPrice === null ? null : Number(existing.costPrice.toString()),
        costNow: body.costPrice ?? null,
      },
    })
    return { success: true, productId: existing.id }
  }

  const created = await db.product.create({
    data: {
      shopkeeperId: g.shopkeeperId,
      name: body.name,
      description: body.description && body.description.length > 0 ? body.description : body.name,
      sku,
      barcode: body.barcode && body.barcode.length > 0 ? body.barcode : null,
      price: D(body.price),
      costPrice: body.costPrice !== undefined ? D(body.costPrice) : null,
      unit: body.unit,
      categoryId: body.categoryId ?? null,
      ageRestricted: body.ageRestricted ?? false,
      images: body.image && body.image.length > 0 ? [body.image] : [],
      isActive: body.isActive ?? true,
      // A product added at a counter is on sale from the moment it is added.
      // publishedAt is the marketplace's record of going live, so it is set
      // only for a shop that is actually a storefront.
      publishedAt: null,
      inventory: {
        create: {
          currentStock: 0,
          ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold } : {}),
        },
      },
    },
    select: { id: true },
  })

  // Opening stock goes through the ledger like everything else, so the first
  // figure has a movement behind it rather than appearing from nowhere.
  if (body.openingStock !== undefined && body.openingStock > 0) {
    try {
      const moved = await db.$transaction(
        (tx) => recordStockMovement(tx as never, {
          shopkeeperId: g.shopkeeperId,
          productId: created.id,
          kind: "OPENING_BALANCE",
          quantity: String(body.openingStock),
          // A string, not a number: the ledger takes Decimal-safe values so a
          // cost never arrives already rounded by binary floating point.
          unitCost: body.costPrice === undefined ? null : String(body.costPrice),
          reason: "Stock on hand when the product was added",
          actorUserId: g.actor.userId ?? undefined,
        }),
        { timeout: 30000, maxWait: 10000 },
      )
      if (!moved.ok) {
        // The product is real and saved; only the opening figure failed. Said
        // as it is, rather than reporting a clean success over a half result.
        return { success: false, error: "Saved " + body.name + ", but the opening stock did not post: " + moved.message }
      }
    } catch {
      return { success: false, error: "Saved " + body.name + ", but the opening stock did not post. Set it from the stock page." }
    }
  }

  await recordPosAudit({
    actor: g.actor,
    action: "product.create",
    summary: g.actor.name + " added " + body.name + " at KSh " + body.price.toFixed(2),
    entityType: "product",
    entityId: created.id,
    detail: { name: body.name, price: body.price, cost: body.costPrice ?? null, openingStock: body.openingStock ?? 0 },
  })
  return { success: true, productId: created.id }
}

/**
 * Stop selling something, or start again.
 *
 * Never a delete. A product that has been sold is named on receipts, in the
 * stock ledger and in last month's figures, and removing the row would tear
 * holes in all three. Pausing takes it off the till and leaves the history
 * standing.
 */
export async function setProductSelling(input: unknown): Promise<CatalogueResult> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    selling: z.boolean(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const body = parsed.data

  const g = await gate("product.edit", body.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const product = await db.product.findFirst({
    where: { id: body.productId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true },
  })
  if (!product) return { success: false, error: "That product is not in this shop." }

  await db.product.update({ where: { id: product.id }, data: { isActive: body.selling } })
  await recordPosAudit({
    actor: g.actor,
    action: body.selling ? "product.resume" : "product.pause",
    summary: g.actor.name + (body.selling ? " started selling " : " stopped selling ") + product.name,
    entityType: "product",
    entityId: product.id,
  })
  return { success: true, productId: product.id }
}

/**
 * What a product costs the shop, on its own.
 *
 * Separate from saveProduct because this is the figure a shopkeeper comes
 * back to fill in later, product by product, once they have the invoice in
 * front of them. Asking them through the whole form for one number is how
 * costs stay empty.
 */
export async function setProductCost(input: unknown): Promise<CatalogueResult> {
  const parsed = z.object({
    productId: z.string().trim().min(1),
    costPrice: z.number().min(0).max(100_000_000),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const body = parsed.data

  const g = await gate("product.edit", body.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const product = await db.product.findFirst({
    where: { id: body.productId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true, price: true },
  })
  if (!product) return { success: false, error: "That product is not in this shop." }

  await db.product.update({ where: { id: product.id }, data: { costPrice: D(body.costPrice) } })
  await recordPosAudit({
    actor: g.actor,
    action: "product.cost",
    summary: g.actor.name + " recorded that " + product.name + " costs KSh " + body.costPrice.toFixed(2),
    entityType: "product",
    entityId: product.id,
    detail: { cost: body.costPrice, price: Number(product.price.toString()) },
  })
  return { success: true, productId: product.id }
}

export type PriceChangeRow = {
  id: string
  at: string
  who: string
  what: string
}

/**
 * What has been done to the catalogue lately.
 *
 * Read from the audit log, which records who did it, so a shopkeeper
 * wondering why a price is what it is has an answer that names somebody.
 */
export async function getCatalogueHistory(input?: unknown): Promise<PriceChangeRow[]> {
  const parsed = z.object({ staffId: z.string().trim().max(60).optional() }).safeParse(input ?? {})
  const g = await gate("product.view", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return []

  // Keyed on the business, not the shop: the audit log follows the business,
  // because that is the thing a second store belongs to.
  const rows = await db.posAuditEvent.findMany({
    where: { businessId: g.businessId, action: { startsWith: "product." } },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, createdAt: true, summary: true, actorUserId: true, actorStaffId: true },
  })

  // The row stores who acted by id. The summary already names them, so this
  // is only the fallback for a row written before that was true.
  const staffIds = [...new Set(rows.map((r) => r.actorStaffId).filter(Boolean))] as string[]
  const userIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))] as string[]
  const [staff, users] = await Promise.all([
    staffIds.length
      ? db.posStaff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])
  const staffBy = new Map(staff.map((x) => [x.id, x.name]))
  const userBy = new Map(users.map((x) => [x.id, x.name]))

  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    who: (r.actorStaffId ? staffBy.get(r.actorStaffId) : null)
      ?? (r.actorUserId ? userBy.get(r.actorUserId) : null)
      ?? "Somebody",
    what: r.summary,
  }))
}
