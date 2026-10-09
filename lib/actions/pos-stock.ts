"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { recordStockMovement } from "@/lib/pos-ledger"
import { parsePosConfig } from "@/lib/pos-config"
import { effectiveTraits } from "@/lib/pos-profiles"
import type { PosTrait } from "@/lib/pos-traits"

/**
 * Stock on hand, and why it is what it is.
 *
 * This is the screen the ledger was built for. A stock figure on its own is
 * an assertion a shopkeeper can only accept or distrust; a figure with the
 * movements behind it is one they can check. Everything here reads or writes
 * through lib/pos-ledger.ts — nothing sets a stock number directly, which is
 * the invariant that makes the history complete rather than merely usually
 * complete.
 *
 * As everywhere in the POS, the tenant comes from the session and no
 * function takes a shopkeeperId.
 */

async function requireStockTenant() {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null

  const shop = await db.shopkeeperProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, posEnabled: true, posProfileKey: true, posTraits: true, posConfig: true, listedOnMarketplace: true },
  })
  if (!shop || !shop.posEnabled) return null
  return {
    userId: session.user.id,
    shopkeeperId: shop.id,
    listedOnMarketplace: shop.listedOnMarketplace,
    traits: effectiveTraits(shop.posProfileKey, shop.posTraits),
    negativeStock: parsePosConfig(shop.posConfig).negativeStock,
  }
}

const num = (v: Prisma.Decimal | null | undefined, fallback = 0) =>
  v === null || v === undefined ? fallback : Number(v.toString())

export type StockRow = {
  productId: string
  name: string
  sku: string
  barcode: string | null
  unit: string
  /** The exact figure the ledger holds. */
  onHand: number
  /** What the marketplace sees. Differs from onHand only by the fraction. */
  sellableUnits: number
  costPrice: number | null
  price: number
  /** onHand x costPrice, where a cost is known. */
  stockValue: number | null
  lowStockThreshold: number
  isLow: boolean
  /** True where the ledger and the cached figure disagree — see below. */
  drifted: boolean
  lastMovementAt: string | null
  movementCount: number
  /**
   * Sizes, colours or packs, with each one's own figure. Empty for a product
   * that sells as itself.
   *
   * Returned with the row rather than fetched on demand: the per-size
   * figures are the reason to open this page for a clothes shop, and making
   * them a second request would mean the list shows a total that cannot be
   * acted on.
   */
  variants: { id: string; label: string; onHand: number; isActive: boolean }[]
}

export type StockSummary = {
  products: number
  /** Total value of stock on hand, across products with a known cost. */
  totalValue: number
  /** How many products have no cost price, so are missing from that total. */
  withoutCost: number
  lowStock: number
  outOfStock: number
  drifted: number
  canRecordWastage: boolean
  /**
   * Whether this shop is on the marketplace at all. The "sellable on Saji"
   * line is meaningless — worse, misleading — for a counter-only shop, which
   * is most POS accounts.
   */
  listedOnMarketplace: boolean
  traits: PosTrait[]
}

export type StockView = { summary: StockSummary; rows: StockRow[] } | null

/**
 * Every product with its stock position.
 *
 * `drifted` is the interesting column. Inventory.stockOnHand is a projection
 * of the ledger, maintained on every write, so the two should never disagree
 * — and a projection nobody checks is a projection that is eventually wrong.
 * This compares them on read and says so, because the difference between
 * "the ledger is missing a movement" and "the cached number went stale" is
 * the difference between two completely different investigations, and they
 * look identical from the shop floor.
 */
export async function getStockView(): Promise<StockView> {
  const tenant = await requireStockTenant()
  if (!tenant) return null

  const [products, sums] = await Promise.all([
    db.product.findMany({
      where: { shopkeeperId: tenant.shopkeeperId },
      select: {
        id: true, name: true, sku: true, barcode: true, unit: true, price: true, costPrice: true,
        inventory: { select: { currentStock: true, stockOnHand: true, lowStockThreshold: true } },
      },
      orderBy: { name: "asc" },
    }),
    // One grouped aggregate rather than a query per product: a shop with
    // several hundred lines would otherwise make this page unusable.
    db.stockMovement.groupBy({
      by: ["productId"],
      where: { shopkeeperId: tenant.shopkeeperId },
      _sum: { quantity: true },
      _count: true,
      _max: { occurredAt: true },
    }),
  ])

  // One query for every variant in the shop, grouped in JS. A shop has tens
  // of products and a handful of sizes each; a query per product would turn
  // this page into a hundred round trips.
  const allVariants = await db.productVariant.findMany({
    where: { shopkeeperId: tenant.shopkeeperId },
    orderBy: [{ position: "asc" }, { label: "asc" }],
    select: { id: true, productId: true, label: true, stockOnHand: true, currentStock: true, isActive: true },
  })
  const variantsByProduct = new Map<string, typeof allVariants>()
  for (const v of allVariants) {
    const list = variantsByProduct.get(v.productId) ?? []
    list.push(v)
    variantsByProduct.set(v.productId, list)
  }

  const ledgerByProduct = new Map(sums.map((s) => [s.productId, s]))

  let totalValue = 0
  let withoutCost = 0
  let lowStock = 0
  let outOfStock = 0
  let drifted = 0

  const rows: StockRow[] = products.map((p) => {
    const agg = ledgerByProduct.get(p.id)
    const ledger = agg ? num(agg._sum.quantity) : null
    const projection = p.inventory?.stockOnHand != null ? num(p.inventory.stockOnHand) : null
    // No ledger yet means this product predates the till; its integer figure
    // is still the truth and is NOT drift.
    const onHand = ledger ?? projection ?? p.inventory?.currentStock ?? 0
    const hasDrift = ledger !== null && projection !== null && Math.abs(ledger - projection) > 1e-9

    const costPrice = p.costPrice != null ? Number(p.costPrice) : null
    const stockValue = costPrice != null ? costPrice * onHand : null
    if (stockValue != null) totalValue += stockValue
    else withoutCost++

    const threshold = p.inventory?.lowStockThreshold ?? 5
    const isLow = onHand > 0 && onHand <= threshold
    if (onHand <= 0) outOfStock++
    else if (isLow) lowStock++
    if (hasDrift) drifted++

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      unit: p.unit,
      onHand,
      sellableUnits: Math.max(0, Math.floor(onHand)),
      costPrice,
      price: Number(p.price),
      stockValue,
      lowStockThreshold: threshold,
      isLow,
      drifted: hasDrift,
      lastMovementAt: agg?._max.occurredAt?.toISOString() ?? null,
      movementCount: agg?._count ?? 0,
      variants: (variantsByProduct.get(p.id) ?? []).map((v) => ({
        id: v.id,
        label: v.label,
        onHand: Number((v.stockOnHand ?? new Prisma.Decimal(v.currentStock)).toString()),
        isActive: v.isActive,
      })),
    }
  })

  return {
    summary: {
      products: products.length,
      totalValue,
      withoutCost,
      lowStock,
      outOfStock,
      drifted,
      canRecordWastage: tenant.traits.includes("WASTAGE"),
      listedOnMarketplace: tenant.listedOnMarketplace,
      traits: tenant.traits,
    },
    rows,
  }
}

export type MovementRow = {
  id: string
  kind: string
  quantity: number
  unit: string
  balanceAfter: number | null
  reason: string | null
  occurredAt: string
  /** What caused it, for the few kinds that point somewhere. */
  posSaleId: string | null
  orderId: string | null
  actorName: string | null
}

/** One product's history, newest first. The answer to "where did it go". */
export async function getProductMovements(input: unknown): Promise<MovementRow[]> {
  const tenant = await requireStockTenant()
  if (!tenant) return []
  const parsed = z.object({ productId: z.string().trim().min(1), limit: z.number().int().min(1).max(200).optional() })
    .safeParse(input)
  if (!parsed.success) return []

  const rows = await db.stockMovement.findMany({
    // Scoped to the shop as well as the product: a product id alone must
    // never be enough to read another shop's history.
    where: { shopkeeperId: tenant.shopkeeperId, productId: parsed.data.productId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: parsed.data.limit ?? 60,
  })

  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean) as string[])]
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : []
  const nameById = new Map(actors.map((a) => [a.id, a.name]))

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    quantity: num(r.quantity),
    unit: r.unit,
    balanceAfter: r.balanceAfter === null ? null : num(r.balanceAfter),
    reason: r.reason,
    occurredAt: r.occurredAt.toISOString(),
    posSaleId: r.posSaleId,
    orderId: r.orderId,
    actorName: r.actorUserId ? nameById.get(r.actorUserId) ?? null : null,
  }))
}

export type StockActionResult = { success: true; balance: number } | { success: false; error: string }

const adjustSchema = z.object({
  productId: z.string().trim().min(1),
  /** Which size or option. The ledger refuses a variant product without it. */
  variantId: z.string().trim().min(1).optional(),
  /** A positive magnitude. The action decides the direction. */
  quantity: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Enter a valid quantity"),
  reason: z.string().trim().max(300).optional(),
  unitCost: z.number().min(0).max(100_000_000).optional(),
})

/** Stock arriving from a supplier. */
export async function receiveStock(input: unknown): Promise<StockActionResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  if (Number(parsed.data.quantity) <= 0) return { success: false, error: "Enter how much arrived." }

  return runMovement(tenant, {
    productId: parsed.data.productId,
    variantId: parsed.data.variantId ?? null,
    kind: "PURCHASE",
    quantity: parsed.data.quantity,
    unitCost: parsed.data.unitCost ?? null,
    reason: parsed.data.reason ?? null,
  })
}

/**
 * Stock lost rather than sold.
 *
 * Gated on the WASTAGE trait, because a shop that has not switched it on has
 * said this is not part of how they work, and the server must agree with the
 * settings page rather than merely hiding a button.
 */
export async function recordWastage(input: unknown): Promise<StockActionResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  if (!tenant.traits.includes("WASTAGE")) {
    return { success: false, error: 'Turn on "Record spoilage and loss" in POS Settings first.' }
  }
  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  if (Number(parsed.data.quantity) <= 0) return { success: false, error: "Enter how much was lost." }
  if (!parsed.data.reason?.trim()) {
    // Unreasoned loss is the one adjustment worth refusing: "stock went
    // down" with no explanation is exactly the record this whole ledger
    // exists to replace.
    return { success: false, error: "Say what happened to it — spoiled, broken, expired, taken." }
  }

  return runMovement(tenant, {
    productId: parsed.data.productId,
    variantId: parsed.data.variantId ?? null,
    kind: "WASTAGE",
    quantity: "-" + parsed.data.quantity,
    reason: parsed.data.reason.trim(),
  })
}

const countSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().min(1).optional(),
  /** What was actually on the shelf. Not a delta. */
  counted: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Enter a valid count"),
  reason: z.string().trim().max(300).optional(),
})

/**
 * A physical count. Takes what was counted and works out the correction.
 *
 * Deliberately NOT "set the stock to this". The difference matters: setting
 * a figure erases the discrepancy, while recording the correction keeps both
 * the old number and the size of the gap, which is the thing worth looking
 * at when it happens three weeks running.
 */
export async function recordStockCount(input: unknown): Promise<StockActionResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = countSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true, unit: true, inventory: { select: { currentStock: true, stockOnHand: true } } },
  })
  if (!product) return { success: false, error: "That product no longer exists." }

  // Counting a SIZE compares against that size's own figure, not the
  // product's. Counting four mediums against a product total that also
  // includes smalls and larges would record a correction the size of the
  // other sizes.
  let variantHolder: { stockOnHand: Prisma.Decimal | null; currentStock: number } | null = null
  if (parsed.data.variantId) {
    variantHolder = await db.productVariant.findFirst({
      where: { id: parsed.data.variantId, shopkeeperId: tenant.shopkeeperId, productId: product.id },
      select: { stockOnHand: true, currentStock: true },
    })
    if (!variantHolder) return { success: false, error: "That option no longer exists." }
  }

  const agg = await db.stockMovement.aggregate({
    where: {
      shopkeeperId: tenant.shopkeeperId,
      productId: product.id,
      variantId: parsed.data.variantId ?? null,
    },
    _sum: { quantity: true },
  })
  const holder = variantHolder ?? product.inventory
  const expected = agg._sum.quantity !== null
    ? new Prisma.Decimal(agg._sum.quantity)
    : new Prisma.Decimal(holder?.stockOnHand ?? holder?.currentStock ?? 0)

  const counted = new Prisma.Decimal(parsed.data.counted)
  const delta = counted.minus(expected)
  if (delta.isZero()) {
    return { success: false, error: `The count already matches: ${expected.toString()} ${product.unit}.` }
  }

  const direction = delta.greaterThan(0) ? "more" : "fewer"
  return runMovement(tenant, {
    productId: product.id,
    variantId: parsed.data.variantId ?? null,
    kind: "COUNT_ADJUSTMENT",
    quantity: delta.toString(),
    reason: parsed.data.reason?.trim()
      || `Counted ${counted.toString()}, records said ${expected.toString()} — ${delta.abs().toString()} ${direction}`,
  })
}

/** The shared write path, so every adjustment goes through the ledger. */
async function runMovement(
  tenant: { userId: string; shopkeeperId: string; negativeStock: ReturnType<typeof parsePosConfig>["negativeStock"] },
  move: { productId: string; variantId?: string | null; kind: "PURCHASE" | "WASTAGE" | "COUNT_ADJUSTMENT"; quantity: string; reason: string | null; unitCost?: number | null },
): Promise<StockActionResult> {
  try {
    const result = await db.$transaction(
      (tx) => recordStockMovement(tx as never, {
        shopkeeperId: tenant.shopkeeperId,
        productId: move.productId,
        variantId: move.variantId ?? null,
        kind: move.kind,
        quantity: move.quantity,
        // A string, not a number: the ledger takes Decimal-safe values so a
        // cost never arrives already rounded by binary floating point.
        unitCost: move.unitCost == null ? null : String(move.unitCost),
        reason: move.reason,
        actorUserId: tenant.userId,
      }, tenant.negativeStock),
      { timeout: 30000, maxWait: 10000 },
    )
    if (!result.ok) return { success: false, error: result.message }
    return { success: true, balance: Number(result.balance.toString()) }
  } catch {
    return { success: false, error: "That could not be saved. Nothing was changed — try again." }
  }
}

// ---------------------------------------------------------------------------
// Sizes, colours and packs
// ---------------------------------------------------------------------------

export type VariantRow = {
  id: string
  label: string
  sku: string | null
  barcode: string | null
  /** Null means "same as the product". */
  price: number | null
  costPrice: number | null
  onHand: number
  isActive: boolean
  position: number
}

export async function getProductVariants(input: unknown): Promise<VariantRow[]> {
  const tenant = await requireStockTenant()
  if (!tenant) return []
  const parsed = z.object({ productId: z.string().trim().min(1) }).safeParse(input)
  if (!parsed.success) return []

  const rows = await db.productVariant.findMany({
    where: { shopkeeperId: tenant.shopkeeperId, productId: parsed.data.productId },
    orderBy: [{ position: "asc" }, { label: "asc" }],
  })
  return rows.map((v) => ({
    id: v.id,
    label: v.label,
    sku: v.sku,
    barcode: v.barcode,
    price: v.price == null ? null : Number(v.price),
    costPrice: v.costPrice == null ? null : Number(v.costPrice),
    onHand: Number((v.stockOnHand ?? new Prisma.Decimal(v.currentStock)).toString()),
    isActive: v.isActive,
    position: v.position,
  }))
}

const saveVariantSchema = z.object({
  productId: z.string().trim().min(1),
  /** Absent to create, present to edit. */
  variantId: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).max(60),
  sku: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(40).optional(),
  price: z.number().min(0).max(100_000_000).nullable().optional(),
  costPrice: z.number().min(0).max(100_000_000).nullable().optional(),
})

export type VariantResult = { success: true; variantId: string } | { success: false; error: string }

/**
 * Create or rename one option.
 *
 * Creating the first one flips Product.hasVariants, which is what makes the
 * till start asking which size — so the two can never disagree.
 *
 * Stock is NOT settable here. A new option starts at zero and gets its stock
 * through the ledger like everything else, because a figure typed straight
 * into a row is a figure with no explanation behind it, which is the thing
 * this whole design exists to avoid.
 */
export async function saveProductVariant(input: unknown): Promise<VariantResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = saveVariantSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const d = parsed.data

  const product = await db.product.findFirst({
    where: { id: d.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true, hasVariants: true },
  })
  if (!product) return { success: false, error: "That product no longer exists." }

  try {
    const result = await db.$transaction(async (tx) => {
      if (d.variantId) {
        const existing = await tx.productVariant.findFirst({
          where: { id: d.variantId, shopkeeperId: tenant.shopkeeperId, productId: product.id },
          select: { id: true },
        })
        if (!existing) throw new Error("That option no longer exists.")
        await tx.productVariant.update({
          where: { id: existing.id },
          data: {
            label: d.label,
            sku: d.sku?.trim() || null,
            barcode: d.barcode?.trim() || null,
            price: d.price ?? null,
            costPrice: d.costPrice ?? null,
          },
        })
        return existing.id
      }

      const count = await tx.productVariant.count({ where: { productId: product.id } })
      const created = await tx.productVariant.create({
        data: {
          productId: product.id,
          shopkeeperId: tenant.shopkeeperId,
          label: d.label,
          sku: d.sku?.trim() || null,
          barcode: d.barcode?.trim() || null,
          price: d.price ?? null,
          costPrice: d.costPrice ?? null,
          position: count,
        },
        select: { id: true },
      })
      if (!product.hasVariants) {
        await tx.product.update({ where: { id: product.id }, data: { hasVariants: true } })
      }
      return created.id
    }, { timeout: 30000 })

    return { success: true, variantId: result }
  } catch (e) {
    const message = e instanceof Error ? e.message : ""
    // The per-shop unique on sku. Worth naming, because the shopkeeper can
    // fix it and a generic failure gives them nothing to act on.
    if (message.includes("Unique constraint") || (e as { code?: string })?.code === "P2002") {
      return { success: false, error: "Another product or option in this shop already uses that code." }
    }
    return { success: false, error: message || "That could not be saved. Try again." }
  }
}

/**
 * Retire an option, or bring it back.
 *
 * Deactivates rather than deletes, always. The option is on sale lines and
 * stock movements that have to stay readable, and a shop that stops stocking
 * size XL in March still needs last year's figures to make sense.
 *
 * Deactivating the LAST active option does not clear hasVariants: a product
 * whose sizes are all retired has nothing sellable, and silently turning it
 * back into a single sellable unit would hand the cashier the sum of several
 * retired size counts.
 */
export async function setVariantActive(input: unknown): Promise<VariantResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    variantId: z.string().trim().min(1),
    isActive: z.boolean(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const variant = await db.productVariant.findFirst({
    where: { id: parsed.data.variantId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true },
  })
  if (!variant) return { success: false, error: "That option no longer exists." }

  await db.productVariant.update({ where: { id: variant.id }, data: { isActive: parsed.data.isActive } })
  return { success: true, variantId: variant.id }
}
