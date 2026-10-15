"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { posShopIdFor } from "@/backend/services/pos-tenant"
import { recordStockMovement } from "@/backend/services/pos-ledger"
import {
  approveWithManagerPin, aboveThresholdOrAlways, aboveThresholdOrNever,
} from "@/backend/services/pos-approval"
import {
  priceLine, type PriceListEntry, type Promotion as PricingPromotion,
} from "@/backend/domain/pos-pricing"
import { parsePosConfig, type NegativeStockPolicy, type ExpiredStockPolicy } from "@/backend/domain/pos-config"
import bcrypt from "bcryptjs"
import { createHash } from "crypto"
import { checkPromptStatus } from "@/backend/actions/pos-mpesa"
import { queueSaleForEtims } from "@/backend/services/etims-queue-core"
import { getTillBillingGate } from "@/backend/actions/pos-billing-shop"
import { effectiveTraits } from "@/backend/domain/pos-profiles"
import type { PosTrait } from "@/backend/domain/pos-traits"

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
  managerPinToVoid: boolean
  discountApprovalAbove: number | null
  voidApprovalAbove: number | null
  loyaltyEnabled: boolean
  loyaltyPointsPerHundred: number
  loyaltyShillingsPerPoint: number
  loyaltyMinRedeem: number
  receiptHeader: string
  receiptFooter: string | null
  taxPin: string | null
}

/** The signed-in user's till, or null if they have not got one. */
async function requireTill(): Promise<TillTenant | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null

  // The store this person is working in, which for a business with branches
  // is not simply "the shop on their account". See services/pos-tenant.ts.
  const shopId = await posShopIdFor(session.user.id)
  if (!shopId) return null
  const shop = await db.shopkeeperProfile.findUnique({
    where: { id: shopId },
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
    managerPinToVoid: config.managerPinToVoid,
    discountApprovalAbove: config.discountApprovalAbove,
    voidApprovalAbove: config.voidApprovalAbove,
    loyaltyEnabled: config.loyaltyEnabled,
    loyaltyPointsPerHundred: config.loyaltyPointsPerHundred,
    loyaltyShillingsPerPoint: config.loyaltyShillingsPerPoint,
    loyaltyMinRedeem: config.loyaltyMinRedeem,
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
  /**
   * One picture, where the product has any.
   *
   * Only the first. The till is a grid read at arm's length by someone
   * holding the goods, so a picture is there to be recognised in a glance,
   * not browsed, and a gallery would cost space the name and price need.
   */
  image: string | null
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
  /** Whether each unit of this product is tracked by serial or IMEI. */
  tracksSerials: boolean
  /** Work rather than goods: sellable with no stock behind it. */
  isService: boolean
  /** Must be written into the controlled register when sold. */
  controlled: boolean
  /** Ordered now, handed over later. */
  madeToOrder: boolean
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
  /** Whether the shop tracks units by serial. */
  tracksSerials: boolean
  /** Whether the shop keeps a controlled-substances register. */
  keepsRegister: boolean
  /** Whether the shop can take a deposit against a made-to-order item. */
  takesDeposits: boolean
  /** Orders taken and not yet handed over. */
  openDeposits: number
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
    // DEPOSIT sales count too, and that is not a detail.
    //
    // A deposit is money physically in the drawer against goods not yet
    // handed over. Counting only COMPLETED sales would leave every deposit
    // taken that day as an unexplained surplus at close, and a cashier
    // being told they are 40,000/- over is a cashier who stops trusting
    // the reconciliation.
    //
    // Summed from the PAYMENT rows rather than from the sale's total,
    // because on a deposit the total is the full price and only part of it
    // has been handed over. This is also more exact than the old
    // approximation for a split sale, where the whole total used to be
    // attributed to whichever method was not cash.
    const sales = await db.posSale.findMany({
      where: {
        shopkeeperId: till.shopkeeperId,
        tillSessionId: shiftRow.id,
        status: { in: ["COMPLETED", "DEPOSIT"] },
      },
      select: { changeGiven: true, payments: { select: { method: true, amount: true } } },
    })
    let cash = D(0)
    let other = D(0)
    for (const s of sales) {
      for (const p of s.payments) {
        if (p.method === "CASH") cash = cash.plus(p.amount)
        else other = other.plus(p.amount)
      }
      cash = cash.minus(s.changeGiven)
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
    tracksSerials: till.traits.includes("SERIALISED"),
    keepsRegister: till.traits.includes("CONTROLLED"),
    takesDeposits: till.traits.includes("MADE_TO_ORDER"),
    openDeposits: await db.posSale.count({ where: { shopkeeperId: till.shopkeeperId, status: "DEPOSIT" } }),
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
    id: true, name: true, sku: true, barcode: true, unit: true, images: true,
    price: true, discountPrice: true, hasVariants: true, ageRestricted: true, fitsWith: true, tracksSerials: true, controlled: true, madeToOrder: true, isService: true,
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
    image: p.images?.[0] ?? null,
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
    tracksSerials: p.tracksSerials,
    isService: p.isService,
    controlled: p.controlled,
    madeToOrder: p.madeToOrder,
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
  /** Which counter is opening it. Same contract as a sale's. */
  deviceSecret: z.string().trim().max(200).optional(),
})

/**
 * Which counter a request came from, by the device's own secret.
 *
 * Returns the row id to stamp on whatever is being written, or a refusal
 * where the shop has stopped that device. A secret that matches nothing
 * resolves to null: the till still works, it just cannot say where it is.
 */
async function resolveDevice(
  shopkeeperId: string,
  secret: string | undefined,
): Promise<{ ok: true; deviceId: string | null } | { ok: false; error: string }> {
  if (!secret) return { ok: true, deviceId: null }
  const hash = createHash("sha256").update(secret).digest("hex")
  const device = await db.posDevice.findUnique({
    where: { tokenHash: hash },
    select: { id: true, name: true, shopkeeperId: true, revokedAt: true },
  })
  if (!device || device.shopkeeperId !== shopkeeperId) return { ok: true, deviceId: null }
  if (device.revokedAt) {
    return {
      ok: false,
      error: device.name + " has been stopped from selling. Turn it back on under Settings \u2192 Devices, or use another till.",
    }
  }
  // Last heard from. Deliberately not awaited inside a transaction: a slow
  // write here must not widen the window on the stock rows.
  void db.posDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  return { ok: true, deviceId: device.id }
}

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

  // Which counter opened it. A shift that ends short is the first thing a
  // shopkeeper asks about, and "which till was this" is half the answer.
  const device = await resolveDevice(till.shopkeeperId, parsed.data.deviceSecret)
  if (!device.ok) return { success: false, error: device.error }

  await db.tillSession.create({
    data: {
      shopkeeperId: till.shopkeeperId,
      cashierUserId: till.userId,
      cashierName: parsed.data.cashierName?.trim() || till.userName,
      openingFloat: D(parsed.data.openingFloat),
      deviceId: device.deviceId,
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

  // Same rule as getTillState: deposits are real money in the drawer, and
  // the figures come from the payment rows rather than the sale totals.
  const sales = await db.posSale.findMany({
    where: {
      shopkeeperId: till.shopkeeperId,
      tillSessionId: shift.id,
      status: { in: ["COMPLETED", "DEPOSIT"] },
    },
    select: { changeGiven: true, payments: { select: { method: true, amount: true } } },
  })

  let cash = D(0)
  let other = D(0)
  for (const s of sales) {
    for (const p of s.payments) {
      if (p.method === "CASH") cash = cash.plus(p.amount)
      else other = other.plus(p.amount)
    }
    cash = cash.minus(s.changeGiven)
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

// GIFT_CARD is a tender like any other: the card's number travels in the
// payment's reference. SPLIT is deliberately absent, here and before: it is
// what the SALE is when there are several of these, never a method a cashier
// picks for one payment.
const PAYMENT_METHODS = ["CASH", "MPESA", "CARD", "BANK", "CREDIT", "GIFT_CARD"] as const

const saleSchema = z.object({
  expectedShopId: z.string().optional(),
  expectedUserId: z.string().optional(),
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
    /**
     * Which physical units are leaving, for a product tracked individually.
     *
     * Required for such a product, and the count must equal the quantity:
     * selling "2" while naming one IMEI is exactly the discrepancy the
     * register exists to prevent.
     */
    serials: z.array(z.string().max(80)).max(200).optional(),
  })).min(1).max(200),
  payments: z.array(z.object({
    method: z.enum(PAYMENT_METHODS),
    amount: z.number().min(0).max(100_000_000),
    reference: z.string().trim().max(60).optional(),
    /**
     * Set only where the till sent an STK prompt and Safaricom answered.
     *
     * Re-checked against Safaricom below rather than believed. The flag
     * decides whether a receipt may say a payment was CONFIRMED rather than
     * merely recorded, and a browser must not be able to assert that about
     * money by sending a boolean.
     */
    stkCheckoutId: z.string().trim().max(80).optional(),
    stkPhone: z.string().trim().max(16).optional(),
  })).min(1).max(5),
  saleDiscount: z.number().min(0).max(100_000_000).optional(),
  /**
   * A manager's PIN, where the discount on this sale is over the shop's
   * threshold. Ignored entirely when it is not.
   */
  managerPin: z.string().trim().max(10).optional(),
  /**
   * The cashier confirmed the buyer is old enough. Required when any line
   * is age-restricted and the shop has the trait on; ignored otherwise, so
   * a till that sends it spuriously cannot mark an ordinary sale as
   * age-checked.
   */
  ageVerified: z.boolean().optional(),
  /**
   * Who the controlled goods went to, and on whose authority.
   *
   * Required when any line is a controlled product and the shop has the
   * trait on. A register entry with no name on it is not a register entry.
   */
  /**
   * Take this as a deposit: part paid now, the rest when it is handed over.
   *
   * Only honoured when the shop has MADE_TO_ORDER on and at least one line
   * is a made-to-order product. A shop without it that sends this gets an
   * ordinary sale, not a silent half-payment.
   */
  deposit: z.object({
    /** ISO date the customer is told to expect it. */
    dueDate: z.string().trim().max(40).optional(),
  }).optional(),
  controlledBuyer: z.object({
    name: z.string().trim().min(2).max(120),
    idNumber: z.string().trim().max(40).optional(),
    phone: z.string().trim().max(30).optional(),
    prescriberName: z.string().trim().max(120).optional(),
    prescriptionRef: z.string().trim().max(60).optional(),
  }).optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  /** The loyalty member this is rung up for, chosen at the till. */
  posCustomerId: z.string().trim().max(60).optional(),
  /**
   * Points the customer is spending on this sale.
   *
   * A REQUEST, not a decision. The server checks the balance, the minimum
   * and the shop's rate before any of it becomes a discount, because a
   * browser that could set this would be printing money.
   */
  redeemPoints: z.number().int().min(0).max(10_000_000).optional(),
  /**
   * Which counter this came from.
   *
   * The device's own secret, not its row id: the server looks the device up
   * by the hash, so a device that has been revoked cannot go on selling by
   * quoting an id it already knows. A sale that names no device is still
   * taken — that is a till whose storage was cleared, not an intruder.
   */
  deviceSecret: z.string().trim().max(200).optional(),
  /**
   * Who is at the counter, from the till's PIN sign-in.
   *
   * Verified against this shop's own cashiers rather than trusted: the id
   * comes from a browser, and a sale attributed to the wrong person is
   * worse than one attributed to nobody.
   */
  cashierId: z.string().trim().max(60).optional(),
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
  if (body.expectedShopId !== till.shopkeeperId || body.expectedUserId !== till.userId) return { success: false, error: "This sale belongs to a different account or store. Return to its original store to synchronize." }
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date()

  // --- a replay returns the original receipt, not an error -----------------
  const already = await db.posSale.findUnique({
    where: { shopkeeperId_idempotencyKey: { shopkeeperId: till.shopkeeperId, idempotencyKey: body.idempotencyKey } },
    include: { items: true, payments: true },
  })
  if (already) {
    return { success: true, data: buildReceipt(till, already, already.items, already.payments, true, []) }
  }

  // --- is this till paid up ------------------------------------------------
  //
  // Checked on the SERVER, not only in the UI, because a banner is a request
  // and this is the rule. Deliberately AFTER the replay above: a sale that
  // already went through must still return its receipt even if the
  // subscription lapsed in the meantime, or an offline till coming back
  // would lose sales it had genuinely taken.
  const gate = await getTillBillingGate()
  if (!gate.canSell) {
    return {
      success: false,
      error: gate.message ?? "This till is paused. Settle the subscription to start selling again.",
    }
  }

  // --- price it on the server ---------------------------------------------
  const products = await db.product.findMany({
    where: { shopkeeperId: till.shopkeeperId, id: { in: body.lines.map((l) => l.productId) } },
    select: {
      id: true, name: true, sku: true, barcode: true, unit: true,
      price: true, discountPrice: true, costPrice: true, hasVariants: true, tracksBatches: true,
      ageRestricted: true, tracksSerials: true, controlled: true, madeToOrder: true, isService: true,
      categoryId: true,
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
    /** The units leaving, resolved to register rows. Empty when not tracked. */
    serialIds: string[]
    serialNumbers: string[]
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
    /** Work rather than goods, so the ledger is left alone for this line. */
    isService: boolean
  }

  // ---- what things cost today --------------------------------------------
  //
  // Loaded once for the whole sale rather than per line: a basket of twenty
  // items would otherwise make twenty round trips for the same two answers.
  // Both are empty for a shop that uses neither, and the engine then returns
  // the shelf price, so this costs nothing where it is not used.
  const pricingNow = new Date()
  const [livePromotions, customerPriceList] = await Promise.all([
    db.posPromotion.findMany({
      where: {
        shopkeeperId: till.shopkeeperId,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: pricingNow } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: pricingNow } }] },
        ],
      },
      orderBy: { priority: "asc" },
    }),
    body.posCustomerId
      ? db.posCustomer.findFirst({
          where: { id: body.posCustomerId, shopkeeperId: till.shopkeeperId },
          select: { priceList: { select: { isActive: true, items: { select: { productId: true, price: true, minQuantity: true } } } } },
        })
      : Promise.resolve(null),
  ])

  const priceListEntries: PriceListEntry[] =
    customerPriceList?.priceList && customerPriceList.priceList.isActive
      ? customerPriceList.priceList.items.map((i) => ({
          productId: i.productId,
          price: Number(i.price),
          minQuantity: Number(i.minQuantity),
        }))
      : []

  const promotionRules: PricingPromotion[] = livePromotions.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    productId: p.productId,
    categoryId: p.categoryId,
    percentOff: p.percentOff === null ? null : Number(p.percentOff),
    amountOff: p.amountOff === null ? null : Number(p.amountOff),
    buyQuantity: p.buyQuantity,
    getQuantity: p.getQuantity,
    getPercentOff: p.getPercentOff === null ? null : Number(p.getPercentOff),
    bundleQuantity: p.bundleQuantity,
    bundlePrice: p.bundlePrice === null ? null : Number(p.bundlePrice),
    priority: p.priority,
    stackable: p.stackable,
  }))

  const priced: PricedLine[] = []
  /** Shown on the receipt, like the negative-stock ones. */
  const expiryWarnings: string[] = []
  /** What the customer saved, and why. A saving nobody can see is not one. */
  const promotionSavings: { name: string; saved: number }[] = []
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

    // --- the customer's price, and whatever is on offer -------------------
    //
    // Run even when the cashier typed a price: the engine checks the override
    // first and returns it untouched, so there is one place that decides what
    // a line costs rather than two that can disagree.
    const breakdown = priceLine(
      {
        productId: product.id,
        categoryId: product.categoryId ?? null,
        quantity: Number(quantity.toString()),
        basePrice: Number(D(variant?.price ?? product.discountPrice ?? product.price).toString()),
        override: overridden ? Number(unitPrice.toString()) : null,
      },
      priceListEntries,
      promotionRules,
    )
    // The line total is what the engine says. The unit price is derived back
    // from it so the receipt still adds up line by line, which matters more
    // to a customer reading it than carrying the pre-offer figure around.
    const pricedTotal = D(breakdown.lineTotal)
    unitPrice = quantity.isZero() ? D(0) : pricedTotal.dividedBy(quantity)
    for (const applied of breakdown.appliedPromotions) {
      promotionSavings.push({ name: applied.name, saved: applied.saved })
    }

    const lineDiscount = D(line.lineDiscount ?? 0)
    const gross = pricedTotal
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

    // --- which physical units are leaving -------------------------------
    const serialIds: string[] = []
    const serialNumbers: string[] = []
    if (product.tracksSerials) {
      const given = (line.serials ?? []).map((x) => x.trim()).filter(Boolean)
      if (!quantity.isInteger()) {
        return { success: false, error: `${product.name} is tracked by serial, so it can only be sold in whole units.` }
      }
      const want = Number(quantity.toString())
      if (given.length !== want) {
        return {
          success: false,
          error: given.length === 0
            ? `${product.name} is tracked individually — scan the serial or IMEI of each unit.`
            : `${product.name}: ${want} being sold but ${given.length} ${given.length === 1 ? "serial" : "serials"} named.`,
        }
      }

      const units = await db.productSerial.findMany({
        // Scoped to the shop AND the product: a serial from another product
        // must not be sellable against this line.
        where: { shopkeeperId: till.shopkeeperId, productId: product.id, serial: { in: given } },
        select: { id: true, serial: true, status: true, variantId: true },
      })
      const byNumber = new Map(units.map((u) => [u.serial.toLowerCase(), u]))

      for (const g of given) {
        const unit = byNumber.get(g.toLowerCase())
        if (!unit) return { success: false, error: `${g} is not on the register for ${product.name}.` }
        if (unit.status !== "IN_STOCK") {
          return {
            success: false,
            error: unit.status === "SOLD"
              ? `${g} has already been sold.`
              : `${g} is not in stock (${unit.status.toLowerCase().replace("_", " ")}).`,
          }
        }
        if ((unit.variantId ?? null) !== (variant?.id ?? null)) {
          return { success: false, error: `${g} is not that option of ${product.name}.` }
        }
        serialIds.push(unit.id)
        serialNumbers.push(unit.serial)
      }
    } else if ((line.serials ?? []).length > 0) {
      return { success: false, error: `${product.name} is not tracked by serial.` }
    }

    priced.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantLabel: variant?.label ?? null,
      allocations,
      isService: product.isService,
      serialIds,
      serialNumbers,
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

  // --- controlled goods need a named buyer ----------------------------
  //
  // Gated on the trait as well as the product flag, like the age check: a
  // shop that has not switched it on is not stopped by a flag somebody
  // once ticked on a product.
  const controlledLines = body.lines
    .map((l) => ({ line: l, product: byId.get(l.productId) }))
    .filter((x) => x.product?.controlled)
  const needsRegister = till.traits.includes("CONTROLLED") && controlledLines.length > 0

  if (needsRegister && !body.controlledBuyer?.name) {
    return {
      success: false,
      error: `${controlledLines[0].product!.name} must be written into your controlled register. Record who it is going to before taking payment.`,
    }
  }

  // --- the loyalty member, and what they may actually spend -------------
  //
  // Everything about points is decided here, from the shop's settings and
  // the ledger, and nothing from the request is trusted beyond "this
  // customer, these points". The three refusals below are each a way a
  // scheme leaks money if it is missed.
  let loyaltyCustomer: { id: string; name: string; pointsBalance: number } | null = null
  let redeemPoints = 0
  let redeemValue = D(0)
  const loyalty = {
    enabled: till.loyaltyEnabled,
    perHundred: till.loyaltyPointsPerHundred,
    perPoint: till.loyaltyShillingsPerPoint,
    minRedeem: till.loyaltyMinRedeem,
  }

  if (body.posCustomerId && loyalty.enabled) {
    const found = await db.posCustomer.findFirst({
      where: { id: body.posCustomerId, shopkeeperId: till.shopkeeperId, isActive: true },
      select: { id: true, name: true, pointsBalance: true },
    })
    // A customer id from another shop is ignored rather than refused: the
    // sale is real and the queue is waiting. They simply earn nothing.
    if (found) loyaltyCustomer = found
  }

  // ---- paying with money the shop already has -----------------------------
  //
  // A gift card or credit note tendered at the till. The code travels in the
  // payment's reference field, which is where a cashier would type it anyway.
  // Checked here and spent inside the sale transaction, for the same reason
  // the credit charge is: a sale that commits while the redemption fails
  // would let the same card be spent twice.
  const giftTenders = body.payments
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.method === "GIFT_CARD")

  const giftRedemptions: { cardId: string; code: string; amount: Prisma.Decimal; after: Prisma.Decimal }[] = []

  if (giftTenders.length > 0) {
    const now = new Date()
    for (const tender of giftTenders) {
      const code = (tender.reference ?? "").trim().toUpperCase()
      if (!code) {
        return { success: false, error: "Enter the number from the card to pay with it." }
      }
      const card = await db.posGiftCard.findFirst({
        where: { shopkeeperId: till.shopkeeperId, code },
      })
      if (!card) return { success: false, error: "No card in this shop has the number " + code + "." }
      if (!card.isActive) {
        return { success: false, error: "Card " + code + " was cancelled." }
      }
      if (card.expiresAt && card.expiresAt < now) {
        return { success: false, error: "Card " + code + " expired on " + card.expiresAt.toLocaleDateString("en-KE") + "." }
      }
      // Already counted within this same basket: two tenders on one card
      // must not both see the opening balance.
      const alreadyHere = giftRedemptions
        .filter((r) => r.cardId === card.id)
        .reduce((a, r) => a.plus(r.amount), D(0))
      const available = D(card.balance).minus(alreadyHere)
      const wanted = D(tender.amount)
      if (wanted.greaterThan(available)) {
        return {
          success: false,
          error: "Card " + code + " has " + available.toFixed(2) + " left, not " + wanted.toFixed(2) + ".",
        }
      }
      giftRedemptions.push({
        cardId: card.id, code, amount: wanted, after: available.minus(wanted),
      })
    }
  }

  // ---- selling on the book ----------------------------------------------
  //
  // CREDIT used to be a label on a payment with nothing behind it: any
  // amount, to anybody, with no record of who owed what. A credit sale now
  // needs a named customer with a limit, and the charge is written inside the
  // same transaction as the sale. If the two could come apart, the shop would
  // hand over goods with no record of the debt, which is the exact failure
  // this was built to end.
  const creditAmount = body.payments
    .filter((p) => p.method === "CREDIT")
    .reduce((a, p) => a.plus(D(p.amount)), D(0))

  let creditCustomer: { id: string; name: string; creditLimit: Prisma.Decimal; creditBalance: Prisma.Decimal; creditTermDays: number } | null = null

  if (creditAmount.greaterThan(0)) {
    if (!body.posCustomerId) {
      return { success: false, error: "A sale on the book needs a named customer. Pick one, or take payment another way." }
    }
    const found = await db.posCustomer.findFirst({
      where: { id: body.posCustomerId, shopkeeperId: till.shopkeeperId, isActive: true },
      select: { id: true, name: true, creditLimit: true, creditBalance: true, creditTermDays: true },
    })
    if (!found) return { success: false, error: "That customer was not found in this shop." }
    if (D(found.creditLimit).isZero()) {
      return { success: false, error: found.name + " is not set up for credit. Set a limit on their account first." }
    }
    const after = D(found.creditBalance).plus(creditAmount)
    if (after.greaterThan(D(found.creditLimit))) {
      return {
        success: false,
        error: found.name + " can take " + D(found.creditLimit).minus(found.creditBalance).toFixed(2) +
          " more on the book, not " + creditAmount.toFixed(2) + ".",
      }
    }
    creditCustomer = found
  }

  if (loyaltyCustomer && body.redeemPoints && body.redeemPoints > 0) {
    const want = Math.floor(body.redeemPoints)
    if (want > loyaltyCustomer.pointsBalance) {
      return { success: false, error: loyaltyCustomer.name + " has " + loyaltyCustomer.pointsBalance + " points, not " + want + "." }
    }
    if (loyalty.minRedeem > 0 && want < loyalty.minRedeem) {
      return { success: false, error: "Points are spent " + loyalty.minRedeem + " at a time or more." }
    }
    redeemPoints = want
    redeemValue = D(want).times(D(loyalty.perPoint))
  }

  const saleDiscount = D(body.saleDiscount ?? 0)
  if (saleDiscount.greaterThan(subtotal)) {
    return { success: false, error: "The discount is more than the sale is worth." }
  }

  // ---- a discount somebody should see ------------------------------------
  //
  // Measured on everything knocked off, not only the sale-level figure: a
  // cashier splitting 2,000 across twenty lines to stay under a threshold is
  // precisely the behaviour this exists to catch.
  const discountGiven = priced
    .reduce((a, l) => a.plus(l.lineDiscount), saleDiscount)
  const discountApproval = await approveWithManagerPin({
    shopkeeperId: till.shopkeeperId,
    required: aboveThresholdOrNever(till.discountApprovalAbove, Number(discountGiven.toString())),
    pin: body.managerPin,
    what: "a discount of " + discountGiven.toFixed(2),
  })
  if (!discountApproval.ok) return { success: false, error: discountApproval.error }

  // Points come off the bill as a DISCOUNT, not as a payment.
  //
  // The distinction decides whether the day's takings tell the truth. As
  // tender, two hundred points would look like two hundred shillings that
  // ought to be in the drawer at close, and the cashier would be told they
  // are short every time anyone redeemed. As a discount, the shop simply
  // sold for less, which is what happened.
  //
  // Capped at what is left after any other discount, so a sale can never go
  // negative and hand money back.
  const headroom = subtotal.minus(saleDiscount)
  const pointsDiscount = redeemValue.greaterThan(headroom) ? headroom : redeemValue
  // What was not spendable is not spent. Charging a customer points that
  // bought nothing is the worst possible rounding error.
  if (pointsDiscount.lessThan(redeemValue) && loyalty.perPoint > 0) {
    redeemPoints = Math.floor(Number(pointsDiscount.dividedBy(D(loyalty.perPoint)).toString()))
    redeemValue = D(redeemPoints).times(D(loyalty.perPoint))
  }

  const net = headroom.minus(pointsDiscount)

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

  // --- a deposit, where the goods do not exist yet ---------------------
  //
  // Allowed only on a basket that actually contains something made to
  // order. Letting any basket be part-paid would turn the till into an
  // informal credit book with no record of what is owed against what.
  const madeToOrderLines = body.lines
    .map((l) => byId.get(l.productId))
    .filter((pr) => pr?.madeToOrder)
  const isDeposit =
    !!body.deposit &&
    till.traits.includes("MADE_TO_ORDER") &&
    madeToOrderLines.length > 0 &&
    amountPaid.lessThan(rounded)

  if (body.deposit && !isDeposit && amountPaid.lessThan(rounded)) {
    return {
      success: false,
      error: madeToOrderLines.length === 0
        ? "Nothing in this sale is made to order, so it cannot be part-paid."
        : 'Turn on "Deposits and later delivery" in POS Settings to take a deposit.',
    }
  }

  const balanceDue = isDeposit ? rounded.minus(amountPaid) : D(0)
  if (isDeposit && amountPaid.lessThanOrEqualTo(0)) {
    return { success: false, error: "A deposit of nothing is not a deposit. Take something now, or park the sale." }
  }
  if (!isDeposit && amountPaid.lessThan(rounded)) {
    return {
      success: false,
      error: `Short by ${rounded.minus(amountPaid).toFixed(2)}. Take the full amount or record the rest as credit.`,
    }
  }
  // Change is only ever cash. Overpaying by card is not change, it is a
  // mistake, and the till should not quietly hand shillings back for it.
  const hasCash = body.payments.some((p) => p.method === "CASH")
  // No change on a deposit: every shilling handed over stays with the shop
  // against the balance.
  const changeGiven = isDeposit ? D(0) : hasCash ? amountPaid.minus(rounded) : D(0)

  const paymentMethod = body.payments.length > 1 ? "SPLIT" : body.payments[0].method

  // --- was the prompt actually paid? ------------------------------------
  //
  // Asked of Safaricom, not of the browser. The till sends a checkout id
  // that it believes succeeded; this is where that belief is checked, so a
  // hand-written request cannot mark money as confirmed.
  //
  // Done BEFORE the transaction opens: it is a network call to Safaricom,
  // and holding stock rows open across one would be the longest lock in the
  // system.
  //
  // A check that fails to get an answer does NOT fail the sale. The goods
  // are going out of the door either way, and the payment simply stays
  // recorded rather than confirmed, which is what the till does for every
  // other M-Pesa payment anyway.
  const confirmedStk: boolean[] = []
  for (const p of body.payments) {
    if (!p.stkCheckoutId) { confirmedStk.push(false); continue }
    try {
      const status = await checkPromptStatus({ checkoutId: p.stkCheckoutId })
      confirmedStk.push(status.state === "paid")
    } catch {
      confirmedStk.push(false)
    }
  }

  // --- which counter ---------------------------------------------------
  //
  // Resolved before anything is written, because a revoked device must be
  // turned away rather than have its sale half-recorded. A secret that
  // matches nothing is ignored: the shop still gets its sale, and the
  // devices page will show the counter next time it checks in.
  const device = await resolveDevice(till.shopkeeperId, body.deviceSecret)
  if (!device.ok) return { success: false, error: device.error }
  const deviceId = device.deviceId

  // --- who served -----------------------------------------------------
  //
  // Falls back to the account holder, which is correct for the one-person
  // duka that has never added a cashier. An id that does not belong to this
  // shop is ignored rather than refused: the sale is real and the customer
  // is waiting, and "served by the owner" is a better record than no sale.
  let cashierName = till.userName
  if (body.cashierId) {
    const c = await db.posCashier.findFirst({
      where: { id: body.cashierId, shopkeeperId: till.shopkeeperId, isActive: true },
      select: { name: true },
    })
    if (c) cashierName = c.name
  }

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
            cashierName,
            subtotal,
            // The rounding comes off as a discount rather than being hidden
            // inside the total, so the receipt still adds up line by line
            // and the shopkeeper can see what rounding cost them.
            // Points off and rounding off are both discounts on the bill.
            discount: saleDiscount.plus(pointsDiscount).minus(roundingAdjustment),
            tax,
            total: rounded,
            amountPaid,
            changeGiven,
            status: isDeposit ? "DEPOSIT" : "COMPLETED",
            balanceDue,
            dueDate: isDeposit && body.deposit?.dueDate ? new Date(body.deposit.dueDate) : null,
            paymentMethod,
            ageVerified,
            // Null unless a manager actually had to approve it, so the
            // presence of a name means something.
            discountApprovedBy: discountApproval.approvedBy,
            customerName: body.customerName?.trim() || loyaltyCustomer?.name || null,
            customerPhone: body.customerPhone?.trim() || null,
            // Falls back to the credit customer: loyalty can be switched
            // off while credit is in use, and a credit sale with no customer
            // on it cannot be traced back from the statement.
            posCustomerId: loyaltyCustomer?.id ?? creditCustomer?.id ?? null,
            idempotencyKey: body.idempotencyKey,
            deviceId,
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
                serials: l.serialNumbers,
                notes: l.notes,
              })),
            },
            payments: {
              create: body.payments.map((p, i) => ({
                method: p.method,
                amount: D(p.amount),
                reference: p.reference?.trim() || null,
                stkCheckoutId: p.stkCheckoutId?.trim() || null,
                stkPhone: p.stkPhone?.trim() || null,
                // Verified above against Safaricom, never taken from the
                // request.
                stkConfirmed: confirmedStk[i] === true,
              })),
            },
          },
          include: { items: true, payments: true },
        })

        // STOCK DOES NOT MOVE ON A DEPOSIT.
        //
        // A sofa that has not been built cannot come off a shelf, and
        // taking it off would show a shop as holding one fewer than it
        // does for however many weeks the order takes. The stock moves
        // when the goods are handed over — see settleDeposit.
        //
        // Stock, in the same transaction. A line's movement key is derived
        // from the sale's, so a replayed sale replays its movements to the
        // same keys and the ledger refuses them individually too.
        for (let i = 0; i < priced.length && !isDeposit; i++) {
          const l = priced[i]

          // A batched line becomes ONE MOVEMENT PER DELIVERY it came out
          // of. That is what makes a recall answerable: "which sales touched
          // batch X" is a query on these rows, and a single movement against
          // the product would not be able to answer it.
          //
          // The idempotency key gains the allocation index, so a replayed
          // sale replays each piece to its own key and the ledger refuses
          // them individually too.
          // Work never touches the stock ledger: there is nothing to take
          // out, and posting a movement for it would invent a negative
          // balance for a product that has no balance.
          if (l.isService) continue

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
              deviceId,
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

        // Mark the units sold, inside the same transaction as the sale.
        //
        // updateMany with a status guard rather than a plain update: two
        // tills selling the same IMEI in the same instant would both have
        // read it as IN_STOCK, and the guard makes the second write affect
        // nothing so the count below catches it.
        for (let i = 0; i < priced.length; i++) {
          const l = priced[i]
          if (l.serialIds.length === 0) continue
          const item = sale.items.find(
            (it) => it.productId === l.productId && (it.variantId ?? null) === (l.variantId ?? null),
          )
          const claimed = await tx.productSerial.updateMany({
            where: { id: { in: l.serialIds }, shopkeeperId: till.shopkeeperId, status: "IN_STOCK" },
            data: { status: "SOLD", soldAt: occurredAt, posSaleItemId: item?.id ?? null },
          })
          if (claimed.count !== l.serialIds.length) {
            throw new PosSaleError(
              `${l.name}: one of those units was sold on another till just now. Nothing was recorded.`,
            )
          }
        }

        // The register, written in the same transaction as the sale.
        //
        // Everything is SNAPSHOTTED rather than joined: a register read
        // three years from now must not depend on a product row still
        // existing under the same name, or on the staff member still
        // working here.
        if (needsRegister && body.controlledBuyer) {
          const buyer = body.controlledBuyer
          for (const { line, product } of controlledLines) {
            const pricedLine = priced.find(
              (pl) => pl.productId === line.productId && (pl.variantId ?? null) === (line.variantId ?? null),
            )
            if (!pricedLine) continue
            const item = sale.items.find(
              (it) => it.productId === pricedLine.productId && (it.variantId ?? null) === (pricedLine.variantId ?? null),
            )
            await tx.controlledSaleRecord.create({
              data: {
                shopkeeperId: till.shopkeeperId,
                posSaleItemId: item?.id ?? null,
                posSaleId: sale.id,
                productName: product!.name,
                variantLabel: pricedLine.variantLabel,
                batchNumber: pricedLine.allocations[0]?.batchNumber ?? null,
                serials: pricedLine.serialNumbers,
                quantity: pricedLine.quantity,
                unit: pricedLine.unit,
                buyerName: buyer.name,
                buyerIdNumber: buyer.idNumber?.trim() || null,
                buyerPhone: buyer.phone?.trim() || null,
                prescriberName: buyer.prescriberName?.trim() || null,
                prescriptionRef: buyer.prescriptionRef?.trim() || null,
                recordedByUserId: till.userId,
                // The person at the counter, not the account holder. On a
                // controlled register that distinction is the point.
                recordedByName: cashierName,
                occurredAt,
              },
            })
          }
        }

        // totalSold is a display counter on Product and is not stock. Kept in
        // step so the till's "best sellers" ordering reflects counter sales
        // too, which for a POS-only shop is the only sales it has.
        for (const l of isDeposit ? [] : priced) {
          await tx.product.update({
            where: { id: l.productId },
            data: { totalSold: { increment: Math.max(1, Math.round(Number(l.quantity.toString()))) } },
          })
        }

        // --- points -------------------------------------------------------
        //
        // Inside the same transaction as the sale, which is the point: a
        // sale that recorded but failed to spend the points would hand the
        // customer the discount AND leave the points in their account.
        //
        // Spending is written before earning so the balance it is checked
        // against is the one before this sale, and the two rows read in the
        // order they happened on the statement.
        //
        // A DEPOSIT earns nothing: the goods have not gone out and the sale
        // is not finished. Points come when it is handed over.
        if (loyaltyCustomer && loyalty.enabled) {
          let balance = loyaltyCustomer.pointsBalance

          if (redeemPoints > 0) {
            balance -= redeemPoints
            await tx.posLoyaltyEntry.create({
              data: {
                shopkeeperId: till.shopkeeperId,
                customerId: loyaltyCustomer.id,
                kind: "REDEEM",
                points: -redeemPoints,
                balanceAfter: balance,
                saleId: sale.id,
                amount: redeemValue,
                reason: "Spent on " + sale.saleNumber,
                actorName: cashierName,
                // Replaying a queued sale must not spend the points twice.
                idempotencyKey: "redeem:" + body.idempotencyKey,
              },
            })
          }

          // Earned on what was actually PAID, not on the shelf price. A
          // customer who paid less because they used points earns on the
          // smaller figure, or the scheme pays for itself twice.
          const earned = loyalty.perHundred > 0
            ? Math.floor(Number(rounded.toString()) / 100) * loyalty.perHundred
            : 0

          if (earned > 0 && !isDeposit) {
            balance += earned
            await tx.posLoyaltyEntry.create({
              data: {
                shopkeeperId: till.shopkeeperId,
                customerId: loyaltyCustomer.id,
                kind: "EARN",
                points: earned,
                balanceAfter: balance,
                saleId: sale.id,
                amount: rounded,
                reason: sale.saleNumber,
                actorName: cashierName,
                idempotencyKey: "earn:" + body.idempotencyKey,
              },
            })
          }

          await tx.posCustomer.update({
            where: { id: loyaltyCustomer.id },
            data: {
              pointsBalance: balance,
              pointsEarned: { increment: earned },
              totalSpent: { increment: rounded },
              visits: { increment: 1 },
              lastSeenAt: occurredAt,
            },
          })
        }

        // ---- the cards, spent with the sale -------------------------------
        for (const r of giftRedemptions) {
          await tx.posGiftCardEntry.create({
            data: {
              cardId: r.cardId,
              kind: "REDEEM",
              amount: r.amount.negated(),
              balanceAfter: r.after,
              posSaleId: sale.id,
              actorUserId: till.userId,
              actorName: till.userName,
              occurredAt,
            },
          })
          await tx.posGiftCard.update({
            where: { id: r.cardId },
            data: { balance: r.after },
          })
        }

        // ---- the debt, in the same transaction as the sale ---------------
        //
        // Written here rather than afterwards on purpose. A sale that commits
        // while the charge fails means goods left the shop with no record of
        // who owes for them, and the balance the till checks limits against
        // would start lying. Either both happen or neither does.
        if (creditCustomer && creditAmount.greaterThan(0)) {
          const after = D(creditCustomer.creditBalance).plus(creditAmount)
          const dueOn = new Date(occurredAt)
          dueOn.setDate(dueOn.getDate() + creditCustomer.creditTermDays)

          await tx.posCreditEntry.create({
            data: {
              shopkeeperId: till.shopkeeperId,
              posCustomerId: creditCustomer.id,
              kind: "CHARGE",
              amount: creditAmount,
              balanceAfter: after,
              posSaleId: sale.id,
              dueOn,
              actorUserId: till.userId,
              actorName: till.userName,
              occurredAt,
            },
          })
          await tx.posCustomer.update({
            where: { id: creditCustomer.id },
            data: { creditBalance: after },
          })
        }

        return sale
      }, { timeout: 30000, maxWait: 10000 })

      // --- tell KRA, eventually ------------------------------------------
      //
      // Outside the transaction and deliberately not awaited for its result:
      // a sale that has taken money must never be rolled back because a tax
      // authority is slow, and the counter must never wait for one. The row
      // this writes is picked up and sent afterwards. A shop that does not
      // file gets a SKIPPED row, which is a record rather than a gap.
      void queueSaleForEtims({ saleId: result.id, kind: "INVOICE" }).catch(() => {})

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
  /** Required when the shop has managerPinToVoid on and has managers. */
  managerPin: z.string().trim().max(10).optional(),
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

  // --- a manager's say-so, where the shop asks for it -------------------
  //
  // Voiding is the one till action that removes money from the day's
  // takings, so it is the one a shop most often wants a second person on.
  // Enforced only where managers actually EXIST: a setting that is on by
  // default must not lock a one-person duka out of correcting its own
  // mistake.
  // The switch says whether to ask at all; the threshold says when it is
  // worth asking. A shop that wants every void approved simply leaves the
  // threshold unset.
  const voidApproval = await approveWithManagerPin({
    shopkeeperId: till.shopkeeperId,
    required: till.managerPinToVoid && aboveThresholdOrAlways(till.voidApprovalAbove, Number(sale.total)),
    pin: parsed.data.managerPin,
    what: "a void of " + Number(sale.total).toFixed(2),
  })
  if (!voidApproval.ok) return { success: false, error: voidApproval.error }

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

      // --- points go back -------------------------------------------------
      //
      // Both directions. Points EARNED on a voided sale are taken back,
      // because otherwise anyone could ring up sales and void them to farm
      // a balance, and it costs them nothing. Points SPENT are returned,
      // because the customer paid with them for goods they are not getting.
      //
      // Written as new rows rather than by deleting the old ones: the
      // ledger is append only, and a statement that shows the earn, the
      // spend and the reversal is one a customer can follow.
      const points = await tx.posLoyaltyEntry.findMany({
        where: { saleId: sale.id, kind: { in: ["EARN", "REDEEM"] } },
        select: { id: true, customerId: true, points: true, kind: true },
      })
      if (points.length > 0) {
        const customerId = points[0].customerId
        const customer = await tx.posCustomer.findUnique({
          where: { id: customerId },
          select: { pointsBalance: true, pointsEarned: true },
        })
        let balance = customer?.pointsBalance ?? 0
        let earnedBack = 0

        for (const entry of points) {
          // Already reversed? Then this is a second void of the same sale,
          // which the status check above should have stopped, and doing it
          // twice would corrupt the balance.
          const already = await tx.posLoyaltyEntry.findFirst({
            where: { saleId: sale.id, kind: "REVERSAL", reason: { contains: entry.id } },
            select: { id: true },
          })
          if (already) continue

          balance -= entry.points
          if (entry.kind === "EARN") earnedBack += entry.points
          await tx.posLoyaltyEntry.create({
            data: {
              shopkeeperId: till.shopkeeperId,
              customerId,
              kind: "REVERSAL",
              points: -entry.points,
              balanceAfter: balance,
              saleId: sale.id,
              reason: (entry.kind === "EARN" ? "Points taken back, sale voided" : "Points returned, sale voided")
                + " (" + entry.id + ")",
              actorName: till.userName,
            },
          })
        }

        await tx.posCustomer.update({
          where: { id: customerId },
          data: {
            pointsBalance: balance,
            pointsEarned: { decrement: earnedBack },
          },
        })
      }
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

      // Units go back on the register before the stock movements, so a
      // failure in either rolls both back together.
      const soldSerials = await tx.productSerial.findMany({
        where: { shopkeeperId: till.shopkeeperId, posSaleItemId: { in: sale.items.map((i) => i.id) }, status: "SOLD" },
        select: { id: true },
      })
      if (soldSerials.length > 0) {
        await tx.productSerial.updateMany({
          where: { id: { in: soldSerials.map((u) => u.id) } },
          // RETURNED, not IN_STOCK: a unit that went out and came back is
          // not the same as one that never left, and a shop looking at a
          // phone with a scuffed box wants to know which it is.
          data: { status: "RETURNED", soldAt: null },
        })
      }

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

  // A voided sale that was already declared needs a credit note: the invoice
  // KRA hold stays a live declaration until one cancels it. Queued like the
  // invoice was, and for the same reason.
  void queueSaleForEtims({ saleId: sale.id, kind: "CREDIT_NOTE" }).catch(() => {})

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

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export type OpenDeposit = {
  saleId: string
  saleNumber: string
  customerName: string | null
  customerPhone: string | null
  total: number
  paid: number
  balanceDue: number
  dueDate: string | null
  occurredAt: string
  overdue: boolean
  lines: { name: string; variantLabel: string | null; quantity: string; unit: string }[]
}

/** Orders taken and not yet handed over, soonest due first. */
export async function getOpenDeposits(): Promise<OpenDeposit[]> {
  const till = await requireTill()
  if (!till) return []

  const rows = await db.posSale.findMany({
    where: { shopkeeperId: till.shopkeeperId, status: "DEPOSIT" },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { occurredAt: "asc" }],
    include: { items: true },
    take: 200,
  })

  const now = Date.now()
  return rows.map((r) => ({
    saleId: r.id,
    saleNumber: r.saleNumber,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    total: money(D(r.total)),
    paid: money(D(r.amountPaid)),
    balanceDue: money(D(r.balanceDue)),
    dueDate: r.dueDate?.toISOString() ?? null,
    occurredAt: r.occurredAt.toISOString(),
    overdue: r.dueDate !== null && r.dueDate.getTime() < now,
    lines: r.items.map((i) => ({
      name: i.name,
      variantLabel: i.variantLabel,
      quantity: i.quantity.toString(),
      unit: i.unit,
    })),
  }))
}

const settleSchema = z.object({
  saleId: z.string().trim().min(1),
  /** What is being paid now. May be less than the balance — part payments
   *  on a long build are normal — in which case the order stays open. */
  payments: z.array(z.object({
    method: z.enum(PAYMENT_METHODS),
    amount: z.number().min(0).max(100_000_000),
    reference: z.string().trim().max(60).optional(),
  })).min(1).max(5),
  /** Hand the goods over now. Requires the balance to be fully settled. */
  fulfil: z.boolean().optional(),
})

/**
 * Take money against an open order, and hand it over.
 *
 * THIS IS WHERE THE STOCK MOVES. Nothing came off the shelf when the
 * deposit was taken, because the goods did not exist yet; they leave when
 * the customer does. Doing it any earlier would show a shop as holding one
 * fewer sofa than it does for however many weeks the build takes.
 */
export async function settleDeposit(input: unknown): Promise<TillActionResult<Receipt>> {
  const till = await requireTill()
  if (!till) return { success: false, error: "There is no till on this account." }
  const parsed = settleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const sale = await db.posSale.findFirst({
    // Scoped to this shop: a sale id alone must never be enough.
    where: { id: parsed.data.saleId, shopkeeperId: till.shopkeeperId },
    include: { items: true, payments: true },
  })
  if (!sale) return { success: false, error: "That order was not found." }
  if (sale.status !== "DEPOSIT") {
    return { success: false, error: "That order is not waiting on a balance." }
  }

  const paying = parsed.data.payments.reduce((acc, p) => acc.plus(D(p.amount)), D(0))
  if (paying.lessThanOrEqualTo(0)) return { success: false, error: "Enter what is being paid." }

  const owed = D(sale.balanceDue)
  const fulfil = parsed.data.fulfil === true
  // Change only ever comes out of an overpayment on the FINAL settlement.
  const hasCash = parsed.data.payments.some((p) => p.method === "CASH")
  const overpaid = paying.minus(owed)
  const changeGiven = hasCash && overpaid.greaterThan(0) ? overpaid : D(0)
  const applied = paying.minus(changeGiven)
  const remaining = owed.minus(applied)

  if (fulfil && remaining.greaterThan(0)) {
    return {
      success: false,
      error: `Still ${remaining.toFixed(2)} outstanding. Take the balance before handing the goods over, or record this as a part payment.`,
    }
  }

  const occurredAt = new Date()
  const stockWarnings: string[] = []

  try {
    const updated = await db.$transaction(async (tx) => {
      for (const p of parsed.data.payments) {
        await tx.posPayment.create({
          data: {
            saleId: sale.id,
            method: p.method,
            amount: D(p.amount),
            reference: p.reference?.trim() || null,
          },
        })
      }

      // Handing over: the stock leaves now, through the ledger, exactly as
      // an ordinary sale would have moved it at the counter.
      if (fulfil) {
        for (let i = 0; i < sale.items.length; i++) {
          const item = sale.items[i]
          if (!item.productId) continue
          const moved = await recordStockMovement(tx as never, {
            shopkeeperId: till.shopkeeperId,
            productId: item.productId,
            variantId: item.variantId,
            batchId: item.batchId,
            kind: "SALE",
            quantity: D(item.quantity).negated(),
            unit: item.unit,
            unitCost: item.costAtSale,
            posSaleId: sale.id,
            actorUserId: till.userId,
            // Derived from the SALE id, not a device key: this movement
            // happens once, when the goods go, and replaying a settlement
            // must not take the stock twice.
            idempotencyKey: `fulfil:${sale.id}:L${i}`,
            occurredAt,
          }, till.negativeStock)

          if (!moved.ok) {
            throw new PosSaleError(
              moved.code === "INSUFFICIENT_STOCK"
                ? `${item.name}: ${moved.message}`
                : `${item.name} could not be taken out of stock. Nothing was recorded.`,
            )
          }
          if (moved.balance.lessThan(0)) {
            stockWarnings.push(`${item.name} is now ${moved.balance.toString()} ${item.unit} — below zero.`)
          }
        }

        for (const item of sale.items) {
          if (!item.productId) continue
          await tx.product.update({
            where: { id: item.productId },
            data: { totalSold: { increment: Math.max(1, Math.round(Number(item.quantity.toString()))) } },
          })
        }
      }

      return tx.posSale.update({
        where: { id: sale.id },
        data: {
          amountPaid: { increment: Number(applied.toString()) },
          changeGiven: { increment: Number(changeGiven.toString()) },
          balanceDue: remaining.lessThan(0) ? 0 : remaining,
          ...(fulfil ? { status: "COMPLETED" as const, fulfilledAt: occurredAt } : {}),
        },
        include: { items: true, payments: true },
      })
    }, { timeout: 30000, maxWait: 10000 })

    return { success: true, data: buildReceipt(till, updated, updated.items, updated.payments, false, stockWarnings) }
  } catch (e) {
    if (e instanceof PosSaleError) return { success: false, error: e.message }
    return { success: false, error: "That payment could not be saved. Nothing was changed — try again." }
  }
}
