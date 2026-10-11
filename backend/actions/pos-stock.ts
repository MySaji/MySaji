"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { recordStockMovement } from "@/backend/services/pos-ledger"
import { parsePosConfig } from "@/backend/domain/pos-config"
import { effectiveTraits } from "@/backend/domain/pos-profiles"
import type { PosTrait } from "@/backend/domain/pos-traits"

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
  const config = parsePosConfig(shop.posConfig)
  return {
    userId: session.user.id,
    shopkeeperId: shop.id,
    listedOnMarketplace: shop.listedOnMarketplace,
    traits: effectiveTraits(shop.posProfileKey, shop.posTraits),
    negativeStock: config.negativeStock,
    expiryWarningDays: config.expiryWarningDays,
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
  /** Whether this product's stock is kept per delivery. */
  tracksBatches: boolean
  /** Needs an age check at the till, where the shop has the trait on. */
  ageRestricted: boolean
  /** What this part fits. */
  fitsWith: string[]
  /** Whether units of this product are tracked individually. */
  tracksSerials: boolean
  /** Must be written into the controlled register when sold. */
  controlled: boolean
  /** Unsold units on the register, for comparison with the stock figure. */
  serialsInStock: number
  /** What it arrives in, where that differs from what it sells in. */
  bulkUnit: string | null
  /** Selling units per bulk unit. */
  unitsPerBulk: number | null
  /** Live deliveries, soonest to expire first — the order the till uses. */
  batches: { id: string; batchNumber: string | null; expiryDate: string | null; variantId: string | null; onHand: number; expired: boolean; expiringSoon: boolean }[]
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
  /** Whether this shop asks for an age check at the till. */
  checksAge: boolean
  /** Whether this shop buys in bulk and sells in pieces. */
  breaksBulk: boolean
  /** Whether this shop records what its parts fit. */
  tracksFitment: boolean
  /** Whether this shop tracks units individually. */
  tracksSerials: boolean
  /** Whether this shop keeps a controlled-substances register. */
  keepsRegister: boolean
  /**
   * Products whose unsold-serial count does not match their stock figure.
   *
   * A serial register sits BESIDE the stock figure rather than holding it
   * (see ProductSerial in the schema), so the two can in principle
   * disagree — and a register nobody checks is a register that is quietly
   * wrong when a warranty claim arrives.
   */
  serialDrift: number
  /**
   * Whether this shop is on the marketplace at all. The "sellable on Saji"
   * line is meaningless — worse, misleading — for a counter-only shop, which
   * is most POS accounts.
   */
  listedOnMarketplace: boolean
  /** Deliveries past their date, with stock still in them. */
  expiredBatches: number
  /** Deliveries inside the warning window, with stock still in them. */
  expiringSoonBatches: number
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
        tracksBatches: true, ageRestricted: true, bulkUnit: true, unitsPerBulk: true, fitsWith: true,
        tracksSerials: true, controlled: true,
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

  // Same shape as the variants query, and ordered the way the till
  // allocates: soonest to expire first, undated last.
  const allBatches = await db.productBatch.findMany({
    where: { shopkeeperId: tenant.shopkeeperId, isActive: true },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
    select: { id: true, productId: true, variantId: true, batchNumber: true, expiryDate: true, stockOnHand: true, currentStock: true },
  })
  const batchesByProduct = new Map<string, typeof allBatches>()
  for (const b of allBatches) {
    const list = batchesByProduct.get(b.productId) ?? []
    list.push(b)
    batchesByProduct.set(b.productId, list)
  }
  // One grouped count rather than a query per product.
  const serialCounts = await db.productSerial.groupBy({
    by: ["productId"],
    where: { shopkeeperId: tenant.shopkeeperId, status: "IN_STOCK" },
    _count: true,
  })
  const serialsByProduct = new Map(serialCounts.map((c) => [c.productId, c._count]))

  const nowMs = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

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
      tracksBatches: p.tracksBatches,
      ageRestricted: p.ageRestricted,
      fitsWith: p.fitsWith,
      tracksSerials: p.tracksSerials,
      controlled: p.controlled,
      serialsInStock: serialsByProduct.get(p.id) ?? 0,
      bulkUnit: p.bulkUnit,
      unitsPerBulk: p.unitsPerBulk == null ? null : Number(p.unitsPerBulk),
      batches: (batchesByProduct.get(p.id) ?? []).map((b) => {
        const left = b.expiryDate ? Math.floor((b.expiryDate.getTime() - nowMs) / dayMs) : null
        return {
          id: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate?.toISOString() ?? null,
          variantId: b.variantId,
          onHand: Number((b.stockOnHand ?? new Prisma.Decimal(b.currentStock)).toString()),
          expired: left !== null && left < 0,
          expiringSoon: left !== null && left >= 0 && left <= tenant.expiryWarningDays,
        }
      }),
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
      checksAge: tenant.traits.includes("AGE_RESTRICTED"),
      breaksBulk: tenant.traits.includes("BULK_BREAK"),
      tracksFitment: tenant.traits.includes("FITMENT"),
      tracksSerials: tenant.traits.includes("SERIALISED"),
      keepsRegister: tenant.traits.includes("CONTROLLED"),
      serialDrift: rows.filter((r) => r.tracksSerials && r.serialsInStock !== r.sellableUnits).length,
      listedOnMarketplace: tenant.listedOnMarketplace,
      expiredBatches: rows.reduce((n, r) => n + r.batches.filter((b) => b.expired && b.onHand > 0).length, 0),
      expiringSoonBatches: rows.reduce((n, r) => n + r.batches.filter((b) => b.expiringSoon && b.onHand > 0).length, 0),
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
  /** Which delivery. The ledger refuses a batched product without it. */
  batchId: z.string().trim().min(1).optional(),
  /**
   * The quantity above is in BULK units, not selling units.
   *
   * A flag rather than two quantity fields, so a shopkeeper typing "10"
   * into one box cannot have it read as 10 bales when they meant 10
   * pieces. The server does the multiplication, and records both figures
   * in the movement's reason so the arithmetic is on the record.
   */
  inBulk: z.boolean().optional(),
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

  // --- bulk, converted to selling units -------------------------------
  //
  // Stock is ALWAYS held in the selling unit. A bale is how it arrived,
  // not a second kind of stock: tracking unopened bales as their own pool
  // would mean two figures per product and a "break one open" step before
  // anything could be sold, which is more ceremony than a mitumba stall
  // will do. What is kept instead is the arithmetic, written into the
  // movement's reason, so "where did 500 pieces come from" has an answer.
  let quantity = parsed.data.quantity
  let bulkNote: string | null = null

  if (parsed.data.inBulk) {
    if (!tenant.traits.includes("BULK_BREAK")) {
      return { success: false, error: 'Turn on "Buy in bulk, sell in pieces" in POS Settings first.' }
    }
    const product = await db.product.findFirst({
      where: { id: parsed.data.productId, shopkeeperId: tenant.shopkeeperId },
      select: { bulkUnit: true, unitsPerBulk: true, unit: true },
    })
    if (!product) return { success: false, error: "That product no longer exists." }
    if (product.unitsPerBulk == null || Number(product.unitsPerBulk) <= 0) {
      return { success: false, error: "Set how many pieces come out of one bulk unit before receiving in bulk." }
    }
    const bulk = new Prisma.Decimal(parsed.data.quantity)
    const per = new Prisma.Decimal(product.unitsPerBulk)
    quantity = bulk.times(per).toString()
    bulkNote = bulk.toString() + " " + (product.bulkUnit || "bulk") +
      " x " + per.toString() + " = " + quantity + " " + product.unit
  }

  return runMovement(tenant, {
    productId: parsed.data.productId,
    variantId: parsed.data.variantId ?? null,
    batchId: parsed.data.batchId ?? null,
    kind: "PURCHASE",
    quantity,
    unitCost: parsed.data.unitCost ?? null,
    // Both figures survive: what was ordered and what it became.
    reason: [bulkNote, parsed.data.reason].filter(Boolean).join(" - ") || null,
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
    batchId: parsed.data.batchId ?? null,
    kind: "WASTAGE",
    quantity: "-" + parsed.data.quantity,
    reason: parsed.data.reason.trim(),
  })
}

const countSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().min(1).optional(),
  batchId: z.string().trim().min(1).optional(),
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
    batchId: parsed.data.batchId ?? null,
    kind: "COUNT_ADJUSTMENT",
    quantity: delta.toString(),
    reason: parsed.data.reason?.trim()
      || `Counted ${counted.toString()}, records said ${expected.toString()} — ${delta.abs().toString()} ${direction}`,
  })
}

/** The shared write path, so every adjustment goes through the ledger. */
async function runMovement(
  tenant: { userId: string; shopkeeperId: string; negativeStock: ReturnType<typeof parsePosConfig>["negativeStock"] },
  move: { productId: string; variantId?: string | null; batchId?: string | null; kind: "PURCHASE" | "WASTAGE" | "COUNT_ADJUSTMENT"; quantity: string; reason: string | null; unitCost?: number | null },
): Promise<StockActionResult> {
  try {
    const result = await db.$transaction(
      (tx) => recordStockMovement(tx as never, {
        shopkeeperId: tenant.shopkeeperId,
        productId: move.productId,
        variantId: move.variantId ?? null,
        batchId: move.batchId ?? null,
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

// ---------------------------------------------------------------------------
// Deliveries and expiry dates
// ---------------------------------------------------------------------------

export type BatchRow = {
  id: string
  batchNumber: string | null
  expiryDate: string | null
  variantId: string | null
  variantLabel: string | null
  onHand: number
  costPrice: number | null
  isActive: boolean
  /** Past its date. */
  expired: boolean
  /** Inside the shop's warning window. */
  expiringSoon: boolean
  daysLeft: number | null
}

export async function getProductBatches(input: unknown): Promise<BatchRow[]> {
  const tenant = await requireStockTenant()
  if (!tenant) return []
  const parsed = z.object({ productId: z.string().trim().min(1) }).safeParse(input)
  if (!parsed.success) return []

  const rows = await db.productBatch.findMany({
    where: { shopkeeperId: tenant.shopkeeperId, productId: parsed.data.productId },
    // Soonest to expire first — the same order the till allocates in, so
    // the list reads as "this is what goes out next".
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
    include: { variant: { select: { label: true } } },
  })

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  return rows.map((b) => {
    const days = b.expiryDate ? Math.floor((b.expiryDate.getTime() - now) / day) : null
    return {
      id: b.id,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate?.toISOString() ?? null,
      variantId: b.variantId,
      variantLabel: b.variant?.label ?? null,
      onHand: Number((b.stockOnHand ?? new Prisma.Decimal(b.currentStock)).toString()),
      costPrice: b.costPrice == null ? null : Number(b.costPrice),
      isActive: b.isActive,
      expired: days !== null && days < 0,
      expiringSoon: days !== null && days >= 0 && days <= tenant.expiryWarningDays,
      daysLeft: days,
    }
  })
}

const receiveBatchSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().min(1).optional(),
  batchNumber: z.string().trim().max(60).optional(),
  /** ISO date. Optional: some things are tracked by delivery but never expire. */
  expiryDate: z.string().trim().min(1).optional(),
  quantity: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Enter a valid quantity"),
  unitCost: z.number().min(0).max(100_000_000).optional(),
  reason: z.string().trim().max(300).optional(),
})

export type BatchResult = { success: true; batchId: string; balance: number } | { success: false; error: string }

/**
 * Receive a delivery.
 *
 * Creating AND stocking in one action, deliberately — unlike a variant,
 * which is created empty. A batch with no stock is meaningless: the whole
 * point of the row is "these forty boxes, which expire in March", and
 * splitting that into two steps invites a shop to record the boxes and
 * forget the date, or the date and forget the boxes.
 *
 * The stock still arrives through the ledger, as a PURCHASE, so where it
 * came from is on the record like everything else.
 */
export async function receiveBatch(input: unknown): Promise<BatchResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = receiveBatchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const d = parsed.data

  if (Number(d.quantity) <= 0) return { success: false, error: "Enter how much arrived." }

  let expiry: Date | null = null
  if (d.expiryDate) {
    expiry = new Date(d.expiryDate)
    if (Number.isNaN(expiry.getTime())) return { success: false, error: "That expiry date could not be read." }
    // A date already past is allowed — a shop may be recording stock it
    // already has in order to write it off — but it is worth saying so
    // rather than letting it look like a typo that went through.
  }

  const product = await db.product.findFirst({
    where: { id: d.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true, hasVariants: true, tracksBatches: true },
  })
  if (!product) return { success: false, error: "That product no longer exists." }
  if (product.hasVariants && !d.variantId) {
    return { success: false, error: "This product is sold in sizes — say which one this delivery is for." }
  }
  if (d.variantId) {
    const v = await db.productVariant.findFirst({
      where: { id: d.variantId, shopkeeperId: tenant.shopkeeperId, productId: product.id },
      select: { id: true },
    })
    if (!v) return { success: false, error: "That option no longer exists." }
  }

  try {
    return await db.$transaction(async (tx) => {
      const batch = await tx.productBatch.create({
        data: {
          productId: product.id,
          variantId: d.variantId ?? null,
          shopkeeperId: tenant.shopkeeperId,
          batchNumber: d.batchNumber?.trim() || null,
          expiryDate: expiry,
          costPrice: d.unitCost ?? null,
        },
        select: { id: true },
      })

      // Flipping the flag makes the ledger start REQUIRING a batch on this
      // product, so it has to happen in the same transaction as the first
      // batch — otherwise a movement in between would be refused for naming
      // no batch, or accepted against a product that now has one.
      if (!product.tracksBatches) {
        await tx.product.update({ where: { id: product.id }, data: { tracksBatches: true } })
      }

      const moved = await recordStockMovement(tx as never, {
        shopkeeperId: tenant.shopkeeperId,
        productId: product.id,
        variantId: d.variantId ?? null,
        batchId: batch.id,
        kind: "PURCHASE",
        quantity: d.quantity,
        unitCost: d.unitCost == null ? null : String(d.unitCost),
        reason: d.reason?.trim()
          || (d.batchNumber ? `Delivery ${d.batchNumber.trim()}` : "Delivery received"),
        actorUserId: tenant.userId,
      }, tenant.negativeStock)

      if (!moved.ok) throw new Error(moved.message)
      return { success: true as const, batchId: batch.id, balance: Number(moved.balance.toString()) }
    }, { timeout: 30000, maxWait: 10000 })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "That delivery could not be recorded." }
  }
}

/**
 * Write a batch off — expired, recalled, damaged.
 *
 * A WASTAGE movement for whatever is left, then the batch is retired. Not a
 * delete: a recalled batch is precisely the one whose history matters most.
 */
export async function writeOffBatch(input: unknown): Promise<BatchResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    batchId: z.string().trim().min(1),
    reason: z.string().trim().min(3).max(300),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Say why this batch is being written off." }

  const batch = await db.productBatch.findFirst({
    where: { id: parsed.data.batchId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true, productId: true, variantId: true, stockOnHand: true, currentStock: true, batchNumber: true },
  })
  if (!batch) return { success: false, error: "That batch no longer exists." }

  const onHand = batch.stockOnHand ?? new Prisma.Decimal(batch.currentStock)

  try {
    return await db.$transaction(async (tx) => {
      let balance = Number(onHand.toString())
      if (onHand.greaterThan(0)) {
        const moved = await recordStockMovement(tx as never, {
          shopkeeperId: tenant.shopkeeperId,
          productId: batch.productId,
          variantId: batch.variantId,
          batchId: batch.id,
          kind: "WASTAGE",
          quantity: onHand.negated(),
          reason: parsed.data.reason,
          actorUserId: tenant.userId,
        }, "ALLOW")
        if (!moved.ok) throw new Error(moved.message)
        balance = Number(moved.balance.toString())
      }
      // Retired after the write-off, so the quantity is recorded as lost
      // rather than quietly disappearing with the row.
      await tx.productBatch.update({ where: { id: batch.id }, data: { isActive: false } })
      return { success: true as const, batchId: batch.id, balance }
    }, { timeout: 30000, maxWait: 10000 })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "That batch could not be written off." }
  }
}

export type ExpiringRow = BatchRow & { productId: string; productName: string; unit: string }

/**
 * Everything expiring soon or already expired, across the shop.
 *
 * The reason a shopkeeper opens this feature at all: not "what do I have"
 * but "what am I about to lose".
 */
export async function getExpiringStock(): Promise<{ expired: ExpiringRow[]; soon: ExpiringRow[] } | null> {
  const tenant = await requireStockTenant()
  if (!tenant) return null

  const horizon = new Date()
  horizon.setDate(horizon.getDate() + tenant.expiryWarningDays)

  const rows = await db.productBatch.findMany({
    where: {
      shopkeeperId: tenant.shopkeeperId,
      isActive: true,
      expiryDate: { not: null, lte: horizon },
    },
    orderBy: [{ expiryDate: "asc" }],
    include: {
      variant: { select: { label: true } },
      product: { select: { name: true, unit: true } },
    },
    take: 200,
  })

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const mapped: ExpiringRow[] = rows
    // Nothing left in it is nothing to worry about.
    .filter((b) => Number((b.stockOnHand ?? new Prisma.Decimal(b.currentStock)).toString()) > 0)
    .map((b) => {
      const days = Math.floor((b.expiryDate!.getTime() - now) / day)
      return {
        id: b.id,
        productId: b.productId,
        productName: b.product.name,
        unit: b.product.unit,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate!.toISOString(),
        variantId: b.variantId,
        variantLabel: b.variant?.label ?? null,
        onHand: Number((b.stockOnHand ?? new Prisma.Decimal(b.currentStock)).toString()),
        costPrice: b.costPrice == null ? null : Number(b.costPrice),
        isActive: b.isActive,
        expired: days < 0,
        expiringSoon: days >= 0,
        daysLeft: days,
      }
    })

  return {
    expired: mapped.filter((b) => b.expired),
    soon: mapped.filter((b) => !b.expired),
  }
}


/**
 * Mark a product as age-restricted, or clear it.
 *
 * Per product rather than per shop: a liquor store sells crisps and a
 * supermarket sells both, so a shop-wide setting would either nag on every
 * line or protect nothing.
 */
/**
 * Give a product its barcode, usually by scanning the thing itself.
 *
 * The uniqueness rule is the whole point. A barcode exists so that one scan
 * means one product; two products sharing one at the same shop turns every
 * scan of it into a guess, and the cashier would never know which way it
 * went. So a duplicate is refused and the clash is NAMED, because "that code
 * is taken" is useless when you are holding a tin and do not know by what.
 *
 * Scoped to this shop. Two different dukas may legitimately key the same
 * code to different things, and nothing here looks outside its own tenant.
 */
export async function setProductBarcode(input: unknown): Promise<StockActionResult & { clashWith?: string }> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    productId: z.string().trim().min(1),
    /** Empty clears it, which is how a mis-scan gets undone. */
    barcode: z.string().trim().max(40),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true },
  })
  if (!product) return { success: false, error: "That product no longer exists." }

  const code = parsed.data.barcode.trim()
  if (code) {
    const clash = await db.product.findFirst({
      where: { shopkeeperId: tenant.shopkeeperId, barcode: code, NOT: { id: product.id } },
      select: { name: true },
    })
    if (clash) {
      return { success: false, error: "That barcode is already on " + clash.name + ".", clashWith: clash.name }
    }
    // A size can carry its own code too, and the same reasoning applies.
    const variantClash = await db.productVariant.findFirst({
      where: { shopkeeperId: tenant.shopkeeperId, barcode: code },
      select: { label: true, product: { select: { name: true } } },
    })
    if (variantClash) {
      const where = variantClash.product.name + " (" + variantClash.label + ")"
      return { success: false, error: "That barcode is already on " + where + ".", clashWith: where }
    }
  }

  await db.product.update({ where: { id: product.id }, data: { barcode: code || null } })
  return { success: true, balance: 0 }
}

export async function setProductAgeRestricted(input: unknown): Promise<StockActionResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    productId: z.string().trim().min(1),
    ageRestricted: z.boolean(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true },
  })
  if (!product) return { success: false, error: "That product no longer exists." }

  await db.product.update({ where: { id: product.id }, data: { ageRestricted: parsed.data.ageRestricted } })
  // The balance is not what changed, but the result shape is shared; the
  // caller reloads the view rather than reading this.
  return { success: true, balance: 0 }
}


const bulkSchema = z.object({
  productId: z.string().trim().min(1),
  /** Null clears it, so a product can stop being bought in bulk. */
  bulkUnit: z.string().trim().max(30).nullable(),
  unitsPerBulk: z.number().min(0).max(1_000_000).nullable(),
})

/**
 * Say what this product arrives in, and how many it becomes.
 *
 * Both or neither: a bulk unit with no conversion cannot be used, and a
 * conversion with no unit has nothing to label it. Clearing one clears
 * both rather than leaving half a setting behind.
 */
export async function setProductBulkUnit(input: unknown): Promise<StockActionResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = bulkSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const d = parsed.data

  const clearing = !d.bulkUnit || d.unitsPerBulk == null || d.unitsPerBulk <= 0
  if (!clearing && (!d.bulkUnit?.trim() || !d.unitsPerBulk)) {
    return { success: false, error: "Give the bulk unit a name and say how many pieces are in one." }
  }

  const product = await db.product.findFirst({
    where: { id: d.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true },
  })
  if (!product) return { success: false, error: "That product no longer exists." }

  await db.product.update({
    where: { id: product.id },
    data: clearing
      ? { bulkUnit: null, unitsPerBulk: null }
      : { bulkUnit: d.bulkUnit!.trim(), unitsPerBulk: d.unitsPerBulk },
  })
  return { success: true, balance: 0 }
}


const fitmentSchema = z.object({
  productId: z.string().trim().min(1),
  /**
   * The whole list, replaced. Simpler than add/remove, and the UI edits it
   * as one comma-separated field anyway.
   *
   * Blanks are ALLOWED through validation and dropped below, rather than
   * rejected here. The field is split on commas, so "Probox, Succeed,"
   * with a trailing comma produces an empty entry — and refusing the whole
   * save over a trailing comma is the kind of thing that makes a
   * shopkeeper stop using a feature.
   */
  fitsWith: z.array(z.string().max(60)).max(50),
})

/**
 * Record what a part fits.
 *
 * Entries are trimmed, de-duplicated case-insensitively and kept in the
 * order given. Case is preserved as typed — "Toyota Probox" reads better
 * than "toyota probox" on a shelf label — but two spellings that differ
 * only in case are the same tag, or the list fills with near-duplicates
 * nobody can search.
 */
export async function setProductFitment(input: unknown): Promise<StockActionResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = fitmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true },
  })
  if (!product) return { success: false, error: "That product no longer exists." }

  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const raw of parsed.data.fitsWith) {
    const value = raw.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(value)
  }

  await db.product.update({ where: { id: product.id }, data: { fitsWith: cleaned } })
  return { success: true, balance: 0 }
}


// ---------------------------------------------------------------------------
// Serial numbers
// ---------------------------------------------------------------------------

export type SerialRow = {
  id: string
  serial: string
  status: string
  variantId: string | null
  variantLabel: string | null
  costPrice: number | null
  note: string | null
  receivedAt: string
  soldAt: string | null
}

export async function getProductSerials(input: unknown): Promise<SerialRow[]> {
  const tenant = await requireStockTenant()
  if (!tenant) return []
  const parsed = z.object({
    productId: z.string().trim().min(1),
    status: z.enum(["IN_STOCK", "SOLD", "RETURNED", "WRITTEN_OFF"]).optional(),
  }).safeParse(input)
  if (!parsed.success) return []

  const rows = await db.productSerial.findMany({
    where: {
      shopkeeperId: tenant.shopkeeperId,
      productId: parsed.data.productId,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    // Unsold first, then most recent: what is on the shelf is what a
    // cashier is usually looking for.
    orderBy: [{ status: "asc" }, { receivedAt: "desc" }],
    include: { variant: { select: { label: true } } },
    take: 500,
  })

  return rows.map((r) => ({
    id: r.id,
    serial: r.serial,
    status: r.status,
    variantId: r.variantId,
    variantLabel: r.variant?.label ?? null,
    costPrice: r.costPrice == null ? null : Number(r.costPrice),
    note: r.note,
    receivedAt: r.receivedAt.toISOString(),
    soldAt: r.soldAt?.toISOString() ?? null,
  }))
}

const receiveSerialsSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().min(1).optional(),
  /** One per unit. Blanks are dropped rather than refusing the batch. */
  serials: z.array(z.string().max(80)).min(1).max(500),
  unitCost: z.number().min(0).max(100_000_000).optional(),
  note: z.string().trim().max(200).optional(),
})

export type ReceiveSerialsResult =
  | { success: true; added: number; skipped: string[]; balance: number }
  | { success: false; error: string }

/**
 * Record units arriving, by their serial numbers.
 *
 * The count of serials IS the quantity — there is no separate number to
 * type, because a phone shop entering "10" and then nine IMEIs has
 * created a discrepancy the register exists to prevent.
 *
 * Duplicates already on the register are skipped and REPORTED rather than
 * failing the whole delivery: scanning twenty IMEIs and having the lot
 * refused because one was already entered is how a shop gives up on
 * serial tracking.
 */
export async function receiveSerials(input: unknown): Promise<ReceiveSerialsResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  if (!tenant.traits.includes("SERIALISED")) {
    return { success: false, error: 'Turn on "Track each item individually" in POS Settings first.' }
  }
  const parsed = receiveSerialsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const d = parsed.data

  const seen = new Set<string>()
  const wanted: string[] = []
  for (const raw of d.serials) {
    const value = raw.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue   // the same number twice in one paste
    seen.add(key)
    wanted.push(value)
  }
  if (wanted.length === 0) return { success: false, error: "Enter at least one serial or IMEI." }

  const product = await db.product.findFirst({
    where: { id: d.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true, hasVariants: true, tracksSerials: true },
  })
  if (!product) return { success: false, error: "That product no longer exists." }
  if (product.hasVariants && !d.variantId) {
    return { success: false, error: "This product is sold in sizes or options — say which one these are." }
  }

  const existing = await db.productSerial.findMany({
    where: { shopkeeperId: tenant.shopkeeperId, serial: { in: wanted } },
    select: { serial: true },
  })
  const taken = new Set(existing.map((e) => e.serial.toLowerCase()))
  const fresh = wanted.filter((w) => !taken.has(w.toLowerCase()))
  const skipped = wanted.filter((w) => taken.has(w.toLowerCase()))

  if (fresh.length === 0) {
    return { success: false, error: "Every one of those is already on the register." }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.productSerial.createMany({
        data: fresh.map((serial) => ({
          productId: product.id,
          variantId: d.variantId ?? null,
          shopkeeperId: tenant.shopkeeperId,
          serial,
          costPrice: d.unitCost ?? null,
          note: d.note?.trim() || null,
        })),
      })
      if (!product.tracksSerials) {
        await tx.product.update({ where: { id: product.id }, data: { tracksSerials: true } })
      }
      // The stock figure moves through the ledger like everything else; the
      // register is beside it, not instead of it.
      const moved = await recordStockMovement(tx as never, {
        shopkeeperId: tenant.shopkeeperId,
        productId: product.id,
        variantId: d.variantId ?? null,
        kind: "PURCHASE",
        quantity: String(fresh.length),
        unitCost: d.unitCost == null ? null : String(d.unitCost),
        reason: fresh.length + (fresh.length === 1 ? " unit received by serial" : " units received by serial"),
        actorUserId: tenant.userId,
      }, tenant.negativeStock)
      if (!moved.ok) throw new Error(moved.message)
      return { added: fresh.length, balance: Number(moved.balance.toString()) }
    }, { timeout: 30000, maxWait: 10000 })

    return { success: true, added: result.added, skipped, balance: result.balance }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Those could not be recorded." }
  }
}

/** Take a unit off the register — lost, damaged, returned to supplier. */
export async function writeOffSerial(input: unknown): Promise<StockActionResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    serialId: z.string().trim().min(1),
    reason: z.string().trim().min(3).max(300),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Say why this unit is being written off." }

  const unit = await db.productSerial.findFirst({
    where: { id: parsed.data.serialId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true, productId: true, variantId: true, serial: true, status: true },
  })
  if (!unit) return { success: false, error: "That unit is not on your register." }
  if (unit.status !== "IN_STOCK") {
    return { success: false, error: "That unit is not in stock, so there is nothing to write off." }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.productSerial.update({
        where: { id: unit.id },
        data: { status: "WRITTEN_OFF", note: parsed.data.reason },
      })
      const moved = await recordStockMovement(tx as never, {
        shopkeeperId: tenant.shopkeeperId,
        productId: unit.productId,
        variantId: unit.variantId,
        kind: "WASTAGE",
        quantity: "-1",
        reason: unit.serial + ": " + parsed.data.reason,
        actorUserId: tenant.userId,
      }, "ALLOW")
      if (!moved.ok) throw new Error(moved.message)
      return Number(moved.balance.toString())
    }, { timeout: 30000, maxWait: 10000 })
    return { success: true, balance: result }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "That unit could not be written off." }
  }
}

/**
 * Find which sale a serial went out on.
 *
 * The question a warranty claim asks, and the only reason most shops would
 * keep a register at all.
 */
export async function lookupSerial(input: unknown): Promise<{
  serial: string; status: string; productName: string; variantLabel: string | null
  soldAt: string | null; saleNumber: string | null; customerName: string | null
} | null> {
  const tenant = await requireStockTenant()
  if (!tenant) return null
  const parsed = z.object({ serial: z.string().trim().min(1).max(80) }).safeParse(input)
  if (!parsed.success) return null

  const unit = await db.productSerial.findFirst({
    where: { shopkeeperId: tenant.shopkeeperId, serial: parsed.data.serial },
    include: { product: { select: { name: true } }, variant: { select: { label: true } } },
  })
  if (!unit) return null

  let saleNumber: string | null = null
  let customerName: string | null = null
  if (unit.posSaleItemId) {
    const item = await db.posSaleItem.findUnique({
      where: { id: unit.posSaleItemId },
      select: { sale: { select: { saleNumber: true, customerName: true, shopkeeperId: true } } },
    })
    // Scoped again: a sale item id reached through a serial must still
    // belong to this shop.
    if (item?.sale && item.sale.shopkeeperId === tenant.shopkeeperId) {
      saleNumber = item.sale.saleNumber
      customerName = item.sale.customerName
    }
  }

  return {
    serial: unit.serial,
    status: unit.status,
    productName: unit.product.name,
    variantLabel: unit.variant?.label ?? null,
    soldAt: unit.soldAt?.toISOString() ?? null,
    saleNumber,
    customerName,
  }
}


/** Mark a product as needing a register entry when sold, or clear it. */
export async function setProductControlled(input: unknown): Promise<StockActionResult> {
  const tenant = await requireStockTenant()
  if (!tenant) return { success: false, error: "There is no till on this account." }
  const parsed = z.object({
    productId: z.string().trim().min(1),
    controlled: z.boolean(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, shopkeeperId: tenant.shopkeeperId },
    select: { id: true },
  })
  if (!product) return { success: false, error: "That product no longer exists." }

  await db.product.update({ where: { id: product.id }, data: { controlled: parsed.data.controlled } })
  return { success: true, balance: 0 }
}
