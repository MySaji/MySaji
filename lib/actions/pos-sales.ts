"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { recordStockMovement } from "@/lib/pos-ledger"
import { parsePosConfig, type NegativeStockPolicy, type ExpiredStockPolicy } from "@/lib/pos-config"
import { effectiveTraits } from "@/lib/pos-profiles"
import type { PosTrait } from "@/lib/pos-traits"

/**
 * Taking money across the counter.
 *
 * Three rules govern this file, and every one of them is here because the
 * obvious shortcut is wrong:
 *
 * 1. THE TENANT COMES FROM THE SESSION. No function takes a shopkeeperId.
 *
 * 2. THE SERVER PRICES THE SALE. The till sends what was scanned and how
 *    much of it; it does not send what anything costs or what the total is.
 *    A client-supplied total is a client-supplied discount.
 *
 * 3. A SALE IS ONE TRANSACTION OR IT IS NOTHING. The PosSale, its lines, its
 *    tenders and the stock movements for every line commit together. A sale
 *    recorded with stock untouched is a shop whose figures silently rot; a
 *    stock movement with no sale behind it is worse.
 *
 * Deliberately NOT built on checkout() in lib/actions/cart.ts, which looks
 * close enough and is not: it debits a customer wallet and holds funds in
 * escrow. A counter sale is a shopkeeper recording money already in their
 * hand. Reusing it would be the most damaging bug available in this project.
 */

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

type TillTenant = {
  userId: string
  userName: string
  shopkeeperId: string
  shopName: string
  traits: PosTrait[]
  negativeStock: NegativeStockPolicy
  expiredStock: ExpiredStockPolicy
  expiryWarningDays: number
  taxRate: number
  taxInclusive: boolean
  cashRounding: number
  receiptHeader: string
  receiptFooter: string | null
  taxPin: string | null
}

/** The signed-in user's till, or null if they have not got one. */
async function requireTill(): Promise<TillTenant | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null

  const shop = await db.shopkeeperProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true, shopName: true, posEnabled: true,
      posProfileKey: true, posTraits: true, posConfig: true,
    },
  })
  if (!shop || !shop.posEnabled) return null

  const config = parsePosConfig(shop.posConfig)
  return {
    userId: session.user.id,
    userName: session.user.name ?? "Cashier",
    shopkeeperId: shop.id,
    shopName: shop.shopName,
    traits: effectiveTraits(shop.posProfileKey, shop.posTraits),
    negativeStock: config.negativeStock,
    expiredStock: config.expiredStock,
    expiryWarningDays: config.expiryWarningDays,
    taxRate: config.taxRate,
    taxInclusive: config.taxInclusive,
    cashRounding: config.cashRounding,
    receiptHeader: config.receiptHeader?.trim() || shop.shopName,
    receiptFooter: config.receiptFooter?.trim() || null,
    taxPin: config.taxPin?.trim() || null,
  }
}

const D = (v: Prisma.Decimal | string | number) => new Prisma.Decimal(v)
const money = (v: Prisma.Decimal) => Number(v.toFixed(2))

// ---------------------------------------------------------------------------
// Reading the till
// ---------------------------------------------------------------------------

export type TillVariant = {
  id: string
  label: string
  sku: string | null
  barcode: string | null
  /** The variant's own price, or the product's where it has none. */
  price: number
  stock: number
}

export type TillProduct = {
  id: string
  name: string
  sku: string
  barcode: string | null
  unit: string
  /** What the till should charge: the discount price if one is set. */
  price: number
  /** The undiscounted price, so the till can show what was knocked off. */
  listPrice: number
  /** Exact stock where the ledger knows it, else the integer figure. */
  stock: number
  categoryName: string | null
  /** May only be sold to someone old enough. */
  ageRestricted: boolean
  /** What this part fits, where the shop records that. */
  fitsWith: string[]
  /**
   * Sizes, colours or packs. Empty for a product that sells as itself.
   *
   * The till must not let a variant product be added without one of these
   * chosen: "three shirts" across four sizes is not something a cashier can
   * hand to a customer.
   */
  variants: TillVariant[]
  /**
   * Set when a scan matched a VARIANT barcode rather than the product's.
   * The till uses it to skip the picker and ring up that size directly —
   * which is the whole value of barcoding each size.
   */
  matchedVariantId: string | null
}

export type TillShift = {
  id: string
  cashierName: string | null
  openedAt: string
  openingFloat: number
  /** Completed sales in this shift so far. */
  saleCount: number
  /** Cash tendered less change, i.e. what should be in the drawer. */
  cashTaken: number
  /** Everything else, by method, for the close-out screen. */
  nonCashTaken: number
}

export type TillState = {
  shopName: string
  traits: PosTrait[]
  canSellFractional: boolean
  canOverridePrice: boolean
  canRecordWastage: boolean
  /** Whether the shop asks for an age check at all. */
  checksAge: boolean
  negativeStock: NegativeStockPolicy
  taxRate: number
  taxInclusive: boolean
  cashRounding: number
  shift: TillShift | null
  /** Today's completed sales for this shop, newest first. */
  recentSales: TillSaleSummary[]
  takingsToday: number
  salesToday: number
}

export type TillSaleSummary = {
  id: string
  saleNumber: string
  total: number
  paymentMethod: string
  status: string
  itemCount: number
  occurredAt: string
  customerName: string | null
}

export async function getTillState(): Promise<TillState | null> {
  const till = await requireTill()
  if (!till) return null

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [shiftRow, recent, todayAgg] = await Promise.all([
    db.tillSession.findFirst({
      where: { shopkeeperId: till.shopkeeperId, closedAt: null },
      orderBy: { openedAt: "desc" },
    }),
    db.posSale.findMany({
      where: { shopkeeperId: till.shopkeeperId, occurredAt: { gte: startOfToday } },
      orderBy: { occurredAt: "desc" },
      take: 20,
      select: {
        id: true, saleNumber: true, total: true, paymentMethod: true, status: true,
        occurredAt: true, customerName: true, _count: { select: { items: true } },
      },
    }),
    db.posSale.aggregate({
      where: { shopkeeperId: till.shopkeeperId, occurredAt: { gte: startOfToday }, status: "COMPLETED" },
      _sum: { total: true },
      _count: true,
    }),
  ])

  let shift: TillShift | null = null
  if (shiftRow) {
    // Computed rather than stored while the shift is open: a running figure
    // that is only correct at close time is a figure the cashier cannot
    // check against the drawer mid-shift, which is exactly when they want to.
    const sales = await db.posSale.findMany({
      where: { shopkeeperId: till.shopkeeperId, tillSessionId: shiftRow.id, status: "COMPLETED" },
      select: { total: true, amountPaid: true, changeGiven: true, paymentMethod: true },
    })
    let cash = D(0)
    let other = D(0)
    for (const s of sales) {
      if (s.paymentMethod === "CASH") cash = cash.plus(s.amountPaid).minus(s.changeGiven)
      else other = other.plus(s.total)
    }
    shift = {
      id: shiftRow.id,
      cashierName: shiftRow.cashierName,
      openedAt: shiftRow.openedAt.toISOString(),
      openingFloat: money(D(shiftRow.openingFloat)),
      saleCount: sales.length,
      cashTaken: money(cash),
      nonCashTaken: money(other),
    }
  }

  return {
    shopName: till.shopName,
    traits: till.traits,
    canSellFractional: till.traits.includes("MEASURED"),
    canOverridePrice: till.traits.includes("OPEN_PRICE"),
    canRecordWastage: till.traits.includes("WASTAGE"),
    checksAge: till.traits.includes("AGE_RESTRICTED"),
    negativeStock: till.negativeStock,
    taxRate: till.taxRate,
    taxInclusive: till.taxInclusive,
    cashRounding: till.cashRounding,
    shift,
    recentSales: recent.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      total: money(D(s.total)),
      paymentMethod: s.paymentMethod,
      status: s.status,
      itemCount: s._count.items,
      occurredAt: s.occurredAt.toISOString(),
      customerName: s.customerName,
    })),
    takingsToday: money(D(todayAgg._sum.total ?? 0)),
    salesToday: todayAgg._count,
  }
}

const searchSchema = z.object({
  query: z.string().trim().max(120),
  limit: z.number().int().min(1).max(50).optional(),
})

/**
 * The till's product lookup: barcode first, then name and SKU.
 *
 * Barcode is checked as an exact match before anything else, because that is
 * what a scanner produces and a scan must never land on a fuzzy match — a
 * cashier scanning a tin of milk and getting "Milk, fresh 500ml" because it
 * sorted first is how a shop loses money quietly.
 */
export async function findTillProducts(input: unknown): Promise<TillProduct[]> {
  const till = await requireTill()
  if (!till) return []
  const parsed = searchSchema.safeParse(input)
  if (!parsed.success) return []
  const { query } = parsed.data
  const limit = parsed.data.limit ?? 20

  const select = {
    id: true, name: true, sku: true, barcode: true, unit: true,
    price: true, discountPrice: true, hasVariants: true, ageRestricted: true, fitsWith: true,
    category: { select: { name: true } },
    inventory: { select: { currentStock: true, stockOnHand: true } },
    variants: {
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: { id: true, label: true, sku: true, barcode: true, price: true, currentStock: true, stockOnHand: true },
    },
  } as const

  // Every query below is scoped to this shop. A till that could see another
  // shop's catalogue is a till that could sell from it.
  const base = { shopkeeperId: till.shopkeeperId }

  let rows
  // Which variant a scan landed on, where it was a variant's own barcode.
  let matchedVariantId: string | null = null

  if (query.length > 0) {
    const exact = await db.product.findMany({
      where: { ...base, barcode: query },
      select,
      take: limit,
    })
    if (exact.length > 0) {
      rows = exact
    } else {
      // A VARIANT barcode. Checked before any fuzzy search, for the same
      // reason the product barcode is: a scan must land exactly, and
      // barcoding each size is pointless if scanning one opens a picker.
      const variantHit = await db.productVariant.findFirst({
        where: { shopkeeperId: till.shopkeeperId, barcode: query, isActive: true },
        select: { id: true, productId: true },
      })
      if (variantHit) {
        matchedVariantId = variantHit.id
        rows = await db.product.findMany({ where: { ...base, id: variantHit.productId }, select, take: 1 })
      } else {
      rows = await db.product.findMany({
        where: {
          ...base,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { sku: { contains: query, mode: "insensitive" } },
            // What it fits. A spares shop types "Probox" and wants every
            // part for one, not the parts with Probox in their name.
            // `has` is exact per entry, so this finds a product tagged
            // "Toyota Probox" only on that exact string — hence the
            // contains fallback below it.
            { fitsWith: { hasSome: [query] } },
          ],
        },
        select,
        orderBy: [{ totalSold: "desc" }, { name: "asc" }],
        take: limit,
      })
      }
    }
  } else {
    // An empty query is the till's opening screen. Best sellers first is the
    // right default: it is what the cashier reaches for most.
    rows = await db.product.findMany({
      where: base,
      select,
      orderBy: [{ totalSold: "desc" }, { name: "asc" }],
      take: limit,
    })
  }

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    unit: p.unit,
    price: money(D(p.discountPrice ?? p.price)),
    listPrice: money(D(p.price)),
    // stockOnHand null means the ledger has nothing for this product yet and
    // currentStock is the truth — NOT that there is no stock.
    stock: p.inventory
      ? Number((p.inventory.stockOnHand ?? D(p.inventory.currentStock)).toString())
      : 0,
    categoryName: p.category?.name ?? null,
    ageRestricted: p.ageRestricted,
    fitsWith: p.fitsWith,
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.label,
      sku: v.sku,
      barcode: v.barcode,
      // Falls back to the product's price: most sizes cost the same, and
      // copying the price onto every variant would mean a price change had
      // to be written to all of them.
      price: money(D(v.price ?? p.discountPrice ?? p.price)),
      stock: Number((v.stockOnHand ?? D(v.currentStock)).toString()),
    })),
    matchedVariantId: p.id === rows[0]?.id ? matchedVariantId : null,
  }))
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export type TillActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? Record<string, never> : { data: T }))
  | { success: false; error: string }

const openShiftSchema = z.object({
  openingFloat: z.number().min(0).max(10_000_000),
  cashierName: z.string().trim().max(80).optional(),
})

export async function openTillShift(input: unknown): Promise<TillActionResult> {
  const till = await requireTill()
  if (!till) return { success: false, error: "There is no till on this account." }
  const parsed = openShiftSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Enter the cash you are starting with." }

  const existing = await db.tillSession.findFirst({
    where: { shopkeeperId: till.shopkeeperId, closedAt: null },
    select: { id: true },
  })
  if (existing) return { success: false, error: "A shift is already open. Close it before starting another." }

  await db.tillSession.create({
    data: {
      shopkeeperId: till.shopkeeperId,
      cashierUserId: till.userId,
      cashierName: parsed.data.cashierName?.trim() || till.userName,
      openingFloat: D(parsed.data.openingFloat),
    },
  })
  return { success: true } as TillActionResult
}

const closeShiftSchema = z.object({
  countedCash: z.number().min(0).max(10_000_000),
  note: z.string().trim().max(300).optional(),
})

export type ShiftCloseSummary = {
  openingFloat: number
  cashTaken: number
  nonCashTaken: number
  expectedCash: number
  countedCash: number
  variance: number
  saleCount: number
}

export async function closeTillShift(input: unknown): Promise<TillActionResult<ShiftCloseSummary>> {
  const till = await requireTill()
  if (!till) return { success: false, error: "There is no till on this account." }
  const parsed = closeShiftSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Enter the cash you counted." }

  const shift = await db.tillSession.findFirst({
    where: { shopkeeperId: till.shopkeeperId, closedAt: null },
    orderBy: { openedAt: "desc" },
  })
  if (!shift) return { success: false, error: "No shift is open." }

  const sales = await db.posSale.findMany({
    where: { shopkeeperId: till.shopkeeperId, tillSessionId: shift.id, status: "COMPLETED" },
    select: { total: true, amountPaid: true, changeGiven: true, paymentMethod: true },
  })

  let cash = D(0)
  let other = D(0)
  for (const s of sales) {
    if (s.paymentMethod === "CASH") cash = cash.plus(s.amountPaid).minus(s.changeGiven)
    else other = other.plus(s.total)
  }

  const expected = D(shift.openingFloat).plus(cash)
  const counted = D(parsed.data.countedCash)
  const variance = counted.minus(expected)

  // Stored, not recomputed on read. A void or a correction tomorrow must not
  // retroactively change what this shift reported tonight — a variance is a
  // fact about a moment, and the cashier signed off on this number.
  await db.tillSession.update({
    where: { id: shift.id },
    data: {
      closedAt: new Date(),
      expectedCash: expected,
      countedCash: counted,
      variance,
      note: parsed.data.note?.trim() || null,
    },
  })

  return {
    success: true,
    data: {
      openingFloat: money(D(shift.openingFloat)),
      cashTaken: money(cash),
      nonCashTaken: money(other),
      expectedCash: money(expected),
      countedCash: money(counted),
      variance: money(variance),
      saleCount: sales.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Recording a sale
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = ["CASH", "MPESA", "CARD", "BANK", "CREDIT"] as const

const saleSchema = z.object({
  /**
   * Generated once by the till for this sale attempt, and resent unchanged on
   * every retry. The reason a dropped connection cannot ring a sale up twice.
   */
  idempotencyKey: z.string().trim().min(8).max(100),
  lines: z.array(z.object({
    productId: z.string().trim().min(1),
    /** Which size or option. Required where the product has them. */
    variantId: z.string().trim().min(1).optional(),
    /** A string, not a number — see the note on quantity in pos-ledger.ts. */
    quantity: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Enter a valid quantity"),
    /** Only honoured when the OPEN_PRICE trait is on. */
    unitPriceOverride: z.number().min(0).max(100_000_000).optional(),
    lineDiscount: z.number().min(0).max(100_000_000).optional(),
    notes: z.string().trim().max(200).optional(),
  })).min(1).max(200),
  payments: z.array(z.object({
    method: z.enum(PAYMENT_METHODS),
    amount: z.number().min(0).max(100_000_000),
    reference: z.string().trim().max(60).optional(),
  })).min(1).max(5),
  saleDiscount: z.number().min(0).max(100_000_000).optional(),
  /**
   * The cashier confirmed the buyer is old enough. Required when any line
   * is age-restricted and the shop has the trait on; ignored otherwise, so
   * a till that sends it spuriously cannot mark an ordinary sale as
   * age-checked.
   */
  ageVerified: z.boolean().optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  deviceId: z.string().trim().max(60).optional(),
  /** When it happened at the counter. An offline till sends its own time. */
  occurredAt: z.string().datetime().optional(),
})

export type ReceiptLine = {
  name: string
  /** "Red / M". Null for a product that sells as itself. */
  variantLabel: string | null
  sku: string | null
  quantity: string
  unit: string
  unitPrice: number
  lineDiscount: number
  totalPrice: number
  priceOverridden: boolean
}

export type Receipt = {
  saleId: string
  saleNumber: string
  shopName: string
  header: string
  footer: string | null
  taxPin: string | null
  cashierName: string | null
  occurredAt: string
  lines: ReceiptLine[]
  subtotal: number
  discount: number
  tax: number
  taxRate: number
  taxInclusive: boolean
  total: number
  amountPaid: number
  changeGiven: number
  payments: { method: string; amount: number; reference: string | null }[]
  customerName: string | null
  /** True when this was a replay of a sale already recorded. */
  replayed: boolean
  /** Lines that went below zero stock under a WARN policy. */
  stockWarnings: string[]
}

/** Zero-padded so lexicographic order is numeric order. */
function formatSaleNumber(n: number): string {
  return String(n).padStart(6, "0")
}

export async function recordPosSale(input: unknown): Promise<TillActionResult<Receipt>> {
  const till = await requireTill()
  if (!till) return { success: false, error: "There is no till on this account." }

  const parsed = saleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "That sale could not be read." }
  }
  const body = parsed.data
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date()

  // --- a replay returns the original receipt, not an error -----------------
  const already = await db.posSale.findUnique({
    where: { shopkeeperId_idempotencyKey: { shopkeeperId: till.shopkeeperId, idempotencyKey: body.idempotencyKey } },
    include: { items: true, payments: true },
  })
  if (already) {
    return { success: true, data: buildReceipt(till, already, already.items, already.payments, true, []) }
  }

  // --- price it on the server ---------------------------------------------
  const products = await db.product.findMany({
    where: { shopkeeperId: till.shopkeeperId, id: { in: body.lines.map((l) => l.productId) } },
    select: {
      id: true, name: true, sku: true, barcode: true, unit: true,
      price: true, discountPrice: true, costPrice: true, hasVariants: true, tracksBatches: true,
      ageRestricted: true,
    },
  })
  const byId = new Map(products.map((p) => [p.id, p]))

  // Scoped to the shop, like everything else here. A variant id from a till
  // is a value from a browser.
  const variantIds = body.lines.map((l) => l.variantId).filter(Boolean) as string[]
  const variants = variantIds.length
    ? await db.productVariant.findMany({
        where: { shopkeeperId: till.shopkeeperId, id: { in: variantIds } },
        select: { id: true, productId: true, label: true, sku: true, barcode: true, price: true, costPrice: true },
      })
    : []
  const variantById = new Map(variants.map((v) => [v.id, v]))

  // Every live batch of every product on this sale, soonest to expire
  // first. One query rather than one per line, and the ORDER here IS the
  // allocation policy: first-expired-first-out, with undated batches last
  // because a batch that never goes off should be used after ones that do.
  const batchedProductIds = products.filter((p) => p.tracksBatches).map((p) => p.id)
  const batches = batchedProductIds.length
    ? await db.productBatch.findMany({
        where: { shopkeeperId: till.shopkeeperId, productId: { in: batchedProductIds }, isActive: true },
        orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
        select: {
          id: true, productId: true, variantId: true, batchNumber: true, expiryDate: true,
          stockOnHand: true, currentStock: true, costPrice: true,
        },
      })
    : []

  const allowFractional = till.traits.includes("MEASURED")
  const allowOverride = till.traits.includes("OPEN_PRICE")

  /** One batch's share of a line, after FEFO allocation. */
  type Allocation = { batchId: string; batchNumber: string | null; expiryDate: Date | null; quantity: Prisma.Decimal }

  type PricedLine = {
    productId: string
    variantId: string | null
    variantLabel: string | null
    /**
     * Which deliveries this line came out of, soonest-to-expire first.
     * Empty for a product whose stock is not batched.
     *
     * A line CAN span several batches — nine boxes when the oldest delivery
     * has four left — and that is normal rather than an edge case. The sale
     * line records a single batch only when the whole line came from one;
     * the stock movements carry the per-batch detail either way, and those
     * are what a recall is traced through.
     */
    allocations: Allocation[]
    name: string
    sku: string
    barcode: string | null
    unit: string
    quantity: Prisma.Decimal
    unitPrice: Prisma.Decimal
    lineDiscount: Prisma.Decimal
    totalPrice: Prisma.Decimal
    costAtSale: Prisma.Decimal | null
    priceOverridden: boolean
    notes: string | null
  }

  const priced: PricedLine[] = []
  /** Shown on the receipt, like the negative-stock ones. */
  const expiryWarnings: string[] = []
  let subtotal = D(0)

  for (const line of body.lines) {
    const product = byId.get(line.productId)
    // Scoped to this shop above, so a miss means either gone or not ours.
    // Same message for both, deliberately.
    if (!product) return { success: false, error: "One of those products is no longer in your catalogue." }

    // --- the variant, where the product has them ------------------------
    //
    // Refusing a variant product with no variant chosen is not pedantry: the
    // stock figure for such a product is the SUM across its sizes, so
    // selling against it would take a shirt off a total without saying which
    // size left the shelf, and the shop could not restock from its own
    // records.
    const variant = line.variantId ? variantById.get(line.variantId) : undefined
    if (line.variantId && (!variant || variant.productId !== product.id)) {
      return { success: false, error: `That option is no longer available for ${product.name}.` }
    }
    if (product.hasVariants && !variant) {
      return { success: false, error: `${product.name} is sold in sizes or options — choose one.` }
    }

    const quantity = D(line.quantity)
    if (quantity.lessThanOrEqualTo(0)) {
      return { success: false, error: `Enter how much ${product.name} to sell.` }
    }
    // A shop that has not switched on "sell by weight or measure" must not be
    // able to ring up 1.5 of something through a crafted request, or its
    // integer marketplace stock figure stops meaning anything.
    if (!allowFractional && !quantity.isInteger()) {
      return {
        success: false,
        error: `${product.name} is sold in whole ${product.unit === "piece" ? "pieces" : product.unit}. Turn on "Sell by weight or measure" in POS Settings to sell parts of one.`,
      }
    }

    // A variant's own price where it has one, otherwise the product's. Most
    // sizes cost the same and carrying the price on every variant would mean
    // a price change had to be written to all of them.
    let unitPrice = D(variant?.price ?? product.discountPrice ?? product.price)
    let overridden = false
    if (line.unitPriceOverride !== undefined) {
      if (!allowOverride) {
        return {
          success: false,
          error: `Prices are fixed for this shop. Turn on "Cashier sets the price" in POS Settings to change one at the till.`,
        }
      }
      unitPrice = D(line.unitPriceOverride)
      overridden = true
    }

    const lineDiscount = D(line.lineDiscount ?? 0)
    const gross = unitPrice.times(quantity)
    if (lineDiscount.greaterThan(gross)) {
      return { success: false, error: `The discount on ${product.name} is more than the line is worth.` }
    }
    const totalPrice = gross.minus(lineDiscount)

    // --- which deliveries this comes out of ----------------------------
    const allocations: Allocation[] = []
    if (product.tracksBatches) {
      const now = new Date()
      const candidates = batches.filter(
        (b) => b.productId === product.id && (b.variantId ?? null) === (variant?.id ?? null),
      )
      if (candidates.length === 0) {
        return { success: false, error: `${product.name} has no deliveries recorded. Receive stock before selling it.` }
      }

      let remaining = quantity
      for (const b of candidates) {
        if (remaining.lessThanOrEqualTo(0)) break
        const available = b.stockOnHand ?? D(b.currentStock)
        if (available.lessThanOrEqualTo(0)) continue

        const expired = b.expiryDate !== null && b.expiryDate.getTime() < now.getTime()
        if (expired && till.expiredStock === "BLOCK") continue

        const take = available.lessThan(remaining) ? available : remaining
        allocations.push({ batchId: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, quantity: take })
        if (expired) {
          expiryWarnings.push(
            `${product.name}${variant ? " " + variant.label : ""}: sold from a batch that expired on ` +
            b.expiryDate!.toLocaleDateString("en-KE") + ".",
          )
        }
        // Spent within this sale, so a second line of the same product does
        // not allocate the same units twice.
        b.stockOnHand = available.minus(take)
        b.currentStock = Math.max(0, Math.floor(Number(b.stockOnHand.toString())))
        remaining = remaining.minus(take)
      }

      if (remaining.greaterThan(0)) {
        // Under BLOCK, unexpired stock ran out. Naming the policy matters:
        // the shopkeeper may be looking at boxes on the shelf and needs to
        // know the till is refusing them on purpose.
        const blocked = till.expiredStock === "BLOCK" &&
          candidates.some((b) => b.expiryDate !== null && b.expiryDate.getTime() < now.getTime())
        return {
          success: false,
          error: blocked
            ? `${product.name} only has expired stock left, and this till is set to refuse it. Change it in POS Settings, or write the stock off.`
            : `${product.name}: only ${quantity.minus(remaining).toString()} available across all deliveries.`,
        }
      }
    }

    priced.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantLabel: variant?.label ?? null,
      allocations,
      name: product.name,
      // The variant's own code where it has one: that is what was scanned
      // and what the shopkeeper will look for on the receipt.
      sku: variant?.sku ?? product.sku,
      barcode: variant?.barcode ?? product.barcode,
      unit: product.unit,
      quantity,
      unitPrice,
      lineDiscount,
      totalPrice,
      costAtSale: variant?.costPrice != null
        ? D(variant.costPrice)
        : product.costPrice != null ? D(product.costPrice) : null,
      priceOverridden: overridden,
      notes: line.notes?.trim() || null,
    })
    subtotal = subtotal.plus(totalPrice)
  }

  // --- age-restricted lines -------------------------------------------
  //
  // Enforced on the server, like every other trait: the till asks, but a
  // request that simply omits the answer must not go through. Gated on the
  // trait as well as the flag, so a shop that has not switched it on is not
  // blocked by a product somebody once ticked.
  const restricted = body.lines
    .map((l) => byId.get(l.productId))
    .filter((p) => p?.ageRestricted)
  if (till.traits.includes("AGE_RESTRICTED") && restricted.length > 0 && body.ageVerified !== true) {
    return {
      success: false,
      error: `${restricted[0]!.name} is age-restricted. Confirm the buyer is old enough before taking payment.`,
    }
  }
  // Only true where it MEANT something. A sale with no restricted line is
  // recorded as unverified rather than carrying a confirmation nobody made.
  const ageVerified = restricted.length > 0 && body.ageVerified === true

  const saleDiscount = D(body.saleDiscount ?? 0)
  if (saleDiscount.greaterThan(subtotal)) {
    return { success: false, error: "The discount is more than the sale is worth." }
  }
  const net = subtotal.minus(saleDiscount)

  // Tax, and what it is not.
  //
  // taxInclusive means the prices already contain it, so the figure is
  // informational and is NOT added — back-computed for the receipt only.
  // This is arithmetic, not compliance: see the note in lib/pos-config.ts.
  const rate = D(till.taxRate).dividedBy(100)
  const tax = till.taxRate === 0
    ? D(0)
    : till.taxInclusive
      ? net.minus(net.dividedBy(rate.plus(1)))
      : net.times(rate)
  const total = till.taxInclusive ? net : net.plus(tax)

  // Cash rounding, which until now was read from config, carried into the
  // till state and never applied to anything.
  //
  // Kenya has no coin below 1/- and many shops round to 5/-. Rounded DOWN,
  // never up: rounding up is the shop taking money the customer did not
  // agree to, and over a day of sales that is a real amount quietly
  // collected. The rounding is applied to the payable total only — the
  // subtotal, tax and line figures all stay exact, so the receipt still
  // adds up and the difference is visible rather than smeared across lines.
  const roundingStep = D(till.cashRounding)
  const rounded = roundingStep.greaterThan(0)
    ? total.dividedBy(roundingStep).floor().times(roundingStep)
    : total
  const roundingAdjustment = rounded.minus(total)

  const amountPaid = body.payments.reduce((acc, p) => acc.plus(D(p.amount)), D(0))
  if (amountPaid.lessThan(rounded)) {
    return {
      success: false,
      error: `Short by ${rounded.minus(amountPaid).toFixed(2)}. Take the full amount or record the rest as credit.`,
    }
  }
  // Change is only ever cash. Overpaying by card is not change, it is a
  // mistake, and the till should not quietly hand shillings back for it.
  const hasCash = body.payments.some((p) => p.method === "CASH")
  const changeGiven = hasCash ? amountPaid.minus(rounded) : D(0)

  const paymentMethod = body.payments.length > 1 ? "SPLIT" : body.payments[0].method

  const openShift = await db.tillSession.findFirst({
    where: { shopkeeperId: till.shopkeeperId, closedAt: null },
    orderBy: { openedAt: "desc" },
    select: { id: true },
  })

  // --- write it, all or nothing -------------------------------------------
  const stockWarnings: string[] = []

  // Sale numbers are sequential per shop, so two tills closing a sale in the
  // same instant can collide on the unique index. That is a retry, not an
  // error: the second attempt reads the number the first one took.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.$transaction(async (tx) => {
        const last = await tx.posSale.findFirst({
          where: { shopkeeperId: till.shopkeeperId },
          orderBy: { saleNumber: "desc" },
          select: { saleNumber: true },
        })
        const nextNumber = formatSaleNumber((last ? parseInt(last.saleNumber, 10) : 0) + 1)

        const sale = await tx.posSale.create({
          data: {
            shopkeeperId: till.shopkeeperId,
            saleNumber: nextNumber,
            tillSessionId: openShift?.id ?? null,
            cashierUserId: till.userId,
            cashierName: till.userName,
            subtotal,
            // The rounding comes off as a discount rather than being hidden
            // inside the total, so the receipt still adds up line by line
            // and the shopkeeper can see what rounding cost them.
            discount: saleDiscount.minus(roundingAdjustment),
            tax,
            total: rounded,
            amountPaid,
            changeGiven,
            status: "COMPLETED",
            paymentMethod,
            ageVerified,
            customerName: body.customerName?.trim() || null,
            customerPhone: body.customerPhone?.trim() || null,
            idempotencyKey: body.idempotencyKey,
            deviceId: body.deviceId?.trim() || null,
            occurredAt,
            syncedAt: new Date(),
            items: {
              create: priced.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                // Snapshotted beside the id, for the same reason the name
                // is: a receipt must stay readable after a size is
                // discontinued and the row is gone.
                variantLabel: l.variantLabel,
                // Only when the WHOLE line came from one delivery. A line
                // split across two batches has no single answer, and the
                // stock movements carry the detail in that case.
                batchId: l.allocations.length === 1 ? l.allocations[0].batchId : null,
                batchNumber: l.allocations.length === 1 ? l.allocations[0].batchNumber : null,
                batchExpiry: l.allocations.length === 1 ? l.allocations[0].expiryDate : null,
                name: l.name,
                sku: l.sku,
                barcode: l.barcode,
                quantity: l.quantity,
                unit: l.unit,
                unitPrice: l.unitPrice,
                lineDiscount: l.lineDiscount,
                totalPrice: l.totalPrice,
                costAtSale: l.costAtSale,
                priceOverridden: l.priceOverridden,
                notes: l.notes,
              })),
            },
            payments: {
              create: body.payments.map((p) => ({
                method: p.method,
                amount: D(p.amount),
                reference: p.reference?.trim() || null,
              })),
            },
          },
          include: { items: true, payments: true },
        })

        // Stock, in the same transaction. A line's movement key is derived
        // from the sale's, so a replayed sale replays its movements to the
        // same keys and the ledger refuses them individually too.
        for (let i = 0; i < priced.length; i++) {
          const l = priced[i]

          // A batched line becomes ONE MOVEMENT PER DELIVERY it came out
          // of. That is what makes a recall answerable: "which sales touched
          // batch X" is a query on these rows, and a single movement against
          // the product would not be able to answer it.
          //
          // The idempotency key gains the allocation index, so a replayed
          // sale replays each piece to its own key and the ledger refuses
          // them individually too.
          const pieces = l.allocations.length > 0
            ? l.allocations.map((a, j) => ({ batchId: a.batchId, quantity: a.quantity, suffix: `L${i}B${j}` }))
            : [{ batchId: null as string | null, quantity: l.quantity, suffix: `L${i}` }]

          for (const piece of pieces) {
            const moved = await recordStockMovement(tx as never, {
              shopkeeperId: till.shopkeeperId,
              productId: l.productId,
              variantId: l.variantId,
              batchId: piece.batchId,
              kind: "SALE",
              quantity: piece.quantity.negated(),
              unit: l.unit,
              unitCost: l.costAtSale,
              posSaleId: sale.id,
              actorUserId: till.userId,
              idempotencyKey: `${body.idempotencyKey}:${piece.suffix}`,
              deviceId: body.deviceId?.trim() || null,
              occurredAt,
            }, till.negativeStock)

            if (!moved.ok) {
              // BLOCK, or a product that vanished mid-transaction. Throwing
              // rolls back the sale entirely — a receipt the shop cannot
              // account for is worse than a refused sale.
              throw new PosSaleError(
                moved.code === "INSUFFICIENT_STOCK"
                  ? `${l.name}: ${moved.message}`
                  : `${l.name} could not be taken out of stock. Nothing was recorded.`,
              )
            }
            if (moved.balance.lessThan(0)) {
              stockWarnings.push(`${l.name} is now ${moved.balance.toString()} ${l.unit} — below zero.`)
            }
          }
        }

        // totalSold is a display counter on Product and is not stock. Kept in
        // step so the till's "best sellers" ordering reflects counter sales
        // too, which for a POS-only shop is the only sales it has.
        for (const l of priced) {
          await tx.product.update({
            where: { id: l.productId },
            data: { totalSold: { increment: Math.max(1, Math.round(Number(l.quantity.toString()))) } },
          })
        }

        return sale
      }, { timeout: 30000, maxWait: 10000 })

      return {
        success: true,
        data: buildReceipt(till, result, result.items, result.payments, false, [...expiryWarnings, ...stockWarnings]),
      }
    } catch (e) {
      if (e instanceof PosSaleError) return { success: false, error: e.message }
      // A clash on saleNumber is retryable; a clash on idempotencyKey means
      // another request for this same sale won the race, so read it back.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String((e.meta as { target?: string[] } | undefined)?.target ?? "")
        if (target.includes("idempotencyKey")) {
          const winner = await db.posSale.findUnique({
            where: { shopkeeperId_idempotencyKey: { shopkeeperId: till.shopkeeperId, idempotencyKey: body.idempotencyKey } },
            include: { items: true, payments: true },
          })
          if (winner) return { success: true, data: buildReceipt(till, winner, winner.items, winner.payments, true, []) }
        }
        stockWarnings.length = 0
        continue
      }
      return { success: false, error: "That sale could not be saved. Nothing was recorded — try again." }
    }
  }

  return { success: false, error: "The till is busy. Try that sale again." }
}

/** Thrown to abort a sale transaction with a message worth showing a cashier. */
class PosSaleError extends Error {}

function buildReceipt(
  till: TillTenant,
  sale: {
    id: string; saleNumber: string; cashierName: string | null; occurredAt: Date
    subtotal: Prisma.Decimal; discount: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal
    amountPaid: Prisma.Decimal; changeGiven: Prisma.Decimal; customerName: string | null
  },
  items: {
    name: string; variantLabel: string | null; sku: string | null; quantity: Prisma.Decimal; unit: string
    unitPrice: Prisma.Decimal; lineDiscount: Prisma.Decimal; totalPrice: Prisma.Decimal
    priceOverridden: boolean
  }[],
  payments: { method: string; amount: Prisma.Decimal; reference: string | null }[],
  replayed: boolean,
  stockWarnings: string[],
): Receipt {
  return {
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    shopName: till.shopName,
    header: till.receiptHeader,
    footer: till.receiptFooter,
    taxPin: till.taxPin,
    cashierName: sale.cashierName,
    occurredAt: sale.occurredAt.toISOString(),
    lines: items.map((i) => ({
      name: i.name,
      variantLabel: i.variantLabel,
      sku: i.sku,
      // A string, so 1.350 kg does not become 1.35 and 2 does not become 2.000
      // on the printed line. The stored Decimal already carries the scale.
      quantity: i.quantity.toString(),
      unit: i.unit,
      unitPrice: money(D(i.unitPrice)),
      lineDiscount: money(D(i.lineDiscount)),
      totalPrice: money(D(i.totalPrice)),
      priceOverridden: i.priceOverridden,
    })),
    subtotal: money(D(sale.subtotal)),
    discount: money(D(sale.discount)),
    tax: money(D(sale.tax)),
    taxRate: till.taxRate,
    taxInclusive: till.taxInclusive,
    total: money(D(sale.total)),
    amountPaid: money(D(sale.amountPaid)),
    changeGiven: money(D(sale.changeGiven)),
    payments: payments.map((p) => ({ method: p.method, amount: money(D(p.amount)), reference: p.reference })),
    customerName: sale.customerName,
    replayed,
    stockWarnings,
  }
}

const voidSchema = z.object({
  saleId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(300),
})

/**
 * Void a completed sale and put the stock back.
 *
 * The sale row is NOT deleted and its lines are NOT edited. A voided sale is
 * a sale that happened and was reversed, and a shopkeeper looking at a gap in
 * the receipt numbers deserves to find out why rather than wonder.
 */
export async function voidPosSale(input: unknown): Promise<TillActionResult> {
  const till = await requireTill()
  if (!till) return { success: false, error: "There is no till on this account." }
  const parsed = voidSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Say why this sale is being voided." }

  const sale = await db.posSale.findFirst({
    // Scoped to this shop: a sale id alone must never be enough.
    where: { id: parsed.data.saleId, shopkeeperId: till.shopkeeperId },
    include: { items: true },
  })
  if (!sale) return { success: false, error: "That sale was not found." }
  if (sale.status !== "COMPLETED") return { success: false, error: "That sale is not completed, so there is nothing to void." }

  try {
    await db.$transaction(async (tx) => {
      await tx.posSale.update({
        where: { id: sale.id },
        data: {
          status: "VOIDED",
          voidedAt: new Date(),
          voidReason: parsed.data.reason,
          voidedByUserId: till.userId,
        },
      })
      // Reverse the MOVEMENTS, not the lines.
      //
      // A line filled from two deliveries — nine boxes when the oldest had
      // four left — has to go back to both, in the amounts it took from
      // each. The movements are the only record of that split, so reading
      // them is the only way to undo it correctly. Reversing the line
      // instead would put all nine onto whichever batch the line happened
      // to name, and silently move four boxes between deliveries.
      const sold = await tx.stockMovement.findMany({
        where: { shopkeeperId: till.shopkeeperId, posSaleId: sale.id, kind: "SALE" },
        select: { id: true, productId: true, variantId: true, batchId: true, quantity: true, unit: true },
        orderBy: { createdAt: "asc" },
      })

      for (const m of sold) {
        const back = await recordStockMovement(tx as never, {
          shopkeeperId: till.shopkeeperId,
          productId: m.productId,
          // Back onto the size and the delivery it came off, not onto the
          // product. Restocking a generic shirt after selling a medium is
          // how a count goes wrong in a way nobody notices for weeks.
          variantId: m.variantId,
          batchId: m.batchId,
          kind: "SALE_REVERSAL",
          quantity: D(m.quantity).negated(),
          unit: m.unit,
          reason: `Sale ${sale.saleNumber} voided: ${parsed.data.reason}`,
          posSaleId: sale.id,
          actorUserId: till.userId,
          // Derived from the MOVEMENT id, so voiding is replay-safe per
          // piece and cannot restock any of them twice.
          idempotencyKey: `void:${m.id}`,
          occurredAt: new Date(),
        }, "ALLOW")
        // A reversal adds stock, so no policy can refuse it; a failure here
        // means something structural and must roll the void back.
        if (!back.ok) throw new PosSaleError(`Sale ${sale.saleNumber} could not be returned to stock. Nothing was changed.`)
      }
    }, { timeout: 30000, maxWait: 10000 })
  } catch (e) {
    if (e instanceof PosSaleError) return { success: false, error: e.message }
    return { success: false, error: "That sale could not be voided. Nothing was changed — try again." }
  }

  return { success: true } as TillActionResult
}

/** One sale, for reprinting a receipt. */
export async function getPosReceipt(saleId: string): Promise<Receipt | null> {
  const till = await requireTill()
  if (!till) return null
  const sale = await db.posSale.findFirst({
    where: { id: saleId, shopkeeperId: till.shopkeeperId },
    include: { items: true, payments: true },
  })
  if (!sale) return null
  return buildReceipt(till, sale, sale.items, sale.payments, false, [])
}
