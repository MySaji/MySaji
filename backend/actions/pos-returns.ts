"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { recordStockMovement } from "@/backend/services/pos-ledger"
import { parsePosConfig } from "@/backend/domain/pos-config"
import { requirePosPermission, recordPosAudit } from "@/backend/actions/pos-access"
import { approveWithManagerPin, aboveThresholdOrNever } from "@/backend/services/pos-approval"

/**
 * Goods brought back over the counter.
 *
 * WHY A RETURN IS NOT A VOID
 *
 * A void says the sale should not have happened and is made in the same
 * breath, before the drawer closes. A return says the sale was real, the
 * customer took the goods home, and some came back. The till has had voids
 * from the start and no returns, which meant every genuine return was being
 * recorded as a mistake, and a shop could not answer the one question this
 * data exists to answer: how much of what we sell comes back, and why.
 *
 * WHY IT MUST START FROM THE ORIGINAL SALE
 *
 * Because the alternative is paying out on goods never sold. The original
 * line does three jobs here and each one prevents a real loss:
 *
 *   it CAPS the quantity, so nobody returns four of something they bought
 *   three of, across two visits;
 *
 *   it FIXES the price, so a thing bought on offer at 80 is refunded at 80
 *   and not at today's 120;
 *
 *   it NAMES the sale, so the refund has a receipt behind it when the
 *   figures are checked at the end of the month.
 *
 * RESTOCKING IS A SEPARATE DECISION
 *
 * A refunded item is not necessarily a sellable item. Spoiled milk is
 * refunded and thrown away. So each line says whether it went back on the
 * shelf, and only the ones that did move stock; the rest are recorded as
 * wastage so the loss lands somewhere visible rather than nowhere.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

type ReturnTenant = {
  shopkeeperId: string
  userId: string
  userName: string
  businessId: string
  storeId: string | null
  actorName: string
  actorStaffId: string | null
}

async function requireReturnTill(staffId?: string | null): Promise<{ ok: true; t: ReturnTenant } | { ok: false; error: string }> {
  const gate = await requirePosPermission("till.refund", staffId)
  if (!gate.ok) return { ok: false, error: gate.error }
  const session = await auth()
  if (!gate.actor.shopkeeperId) {
    return { ok: false, error: "This business has no shop set up yet." }
  }
  return {
    ok: true,
    t: {
      shopkeeperId: gate.actor.shopkeeperId,
      userId: gate.actor.userId ?? "",
      userName: session?.user?.name ?? "Owner",
      businessId: gate.actor.businessId,
      storeId: gate.actor.storeId,
      actorName: gate.actor.name,
      actorStaffId: gate.actor.staffId,
    },
  }
}

// ----------------------------------------------------------- looking it up

export type ReturnableLine = {
  saleItemId: string
  productId: string | null
  variantId: string | null
  name: string
  unit: string
  unitPrice: number
  /** How many were sold on this line. */
  soldQuantity: number
  /** How many have already come back, across every earlier return. */
  returnedQuantity: number
  /** What is still returnable. Zero means this line is finished. */
  remainingQuantity: number
  serials: string[]
}

export type ReturnableSale = {
  saleId: string
  saleNumber: string
  occurredAt: string
  total: number
  status: string
  cashierName: string | null
  customerName: string | null
  paymentMethods: string[]
  lines: ReturnableLine[]
  /** Nothing left to bring back. */
  fullyReturned: boolean
  /** Why this sale cannot be returned against at all, where that is so. */
  blockedReason: string | null
}

const lookupSchema = z.object({
  /** A receipt number, or the tail of one. What a customer actually hands over. */
  query: z.string().trim().min(1).max(40),
  staffId: z.string().trim().max(60).optional(),
})

/**
 * Find the sale a customer is returning against.
 *
 * Searches by receipt number, because that is what is printed on the slip in
 * their hand. Scoped to this shop, so a receipt from another branch of
 * nothing in particular finds nothing.
 */
export async function findSaleForReturn(input: unknown): Promise<ReturnableSale[]> {
  const parsed = lookupSchema.safeParse(input)
  if (!parsed.success) return []
  const gate = await requirePosPermission("till.refund", parsed.data.staffId)
  if (!gate.ok || !gate.actor.shopkeeperId) return []
  const shopkeeperId = gate.actor.shopkeeperId

  const q = parsed.data.query.trim()
  const sales = await db.posSale.findMany({
    where: {
      shopkeeperId,
      // An exact receipt first, then a tail match, because a cashier often
      // types only the digits after the dash.
      OR: [{ saleNumber: q }, { saleNumber: { endsWith: q } }, { customerPhone: q }],
    },
    orderBy: { occurredAt: "desc" },
    take: 10,
    select: {
      id: true, saleNumber: true, occurredAt: true, total: true, status: true,
      cashierName: true, customerName: true,
      payments: { select: { method: true } },
      items: {
        select: {
          id: true, productId: true, variantId: true, name: true, unit: true,
          quantity: true, unitPrice: true, serials: true,
          returnItems: { select: { quantity: true } },
        },
      },
    },
  })

  return sales.map((s) => {
    const lines: ReturnableLine[] = s.items.map((it) => {
      const sold = Number(it.quantity.toString())
      const back = it.returnItems.reduce((a, r) => a + Number(r.quantity.toString()), 0)
      return {
        saleItemId: it.id,
        productId: it.productId,
        variantId: it.variantId,
        name: it.name,
        unit: it.unit,
        unitPrice: money(it.unitPrice),
        soldQuantity: sold,
        returnedQuantity: back,
        remainingQuantity: Math.max(0, Number((sold - back).toFixed(3))),
        serials: it.serials ?? [],
      }
    })

    // A voided sale was never a sale, so there is nothing to bring back from
    // it. Said as a reason rather than by hiding the row, because a customer
    // holding that receipt needs an answer.
    let blocked: string | null = null
    if (s.status === "VOIDED") blocked = "That sale was voided, so there is nothing to return."
    else if (s.status === "PARKED") blocked = "That sale was never paid for."

    return {
      saleId: s.id,
      saleNumber: s.saleNumber,
      occurredAt: s.occurredAt.toISOString(),
      total: money(s.total),
      status: String(s.status),
      cashierName: s.cashierName,
      customerName: s.customerName,
      paymentMethods: [...new Set(s.payments.map((p) => String(p.method)))],
      lines,
      fullyReturned: lines.every((l) => l.remainingQuantity <= 0),
      blockedReason: blocked,
    }
  })
}

// ------------------------------------------------------------ taking it back

export type ReturnResult =
  | { success: true; returnId: string; returnNumber: string; refunded: number }
  | { success: false; error: string }

const PAYMENT_METHODS = ["CASH", "MPESA", "CARD", "BANK", "CREDIT"] as const

const returnSchema = z.object({
  saleId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(200),
  note: z.string().trim().max(300).optional(),
  method: z.enum(PAYMENT_METHODS).default("CASH"),
  staffId: z.string().trim().max(60).optional(),
  approvedByName: z.string().trim().max(80).optional(),
  /**
   * A manager's PIN, where the refund is over the shop's threshold.
   *
   * Separate from approvedByName above, which is a name somebody typed and
   * proves nothing. This one is checked.
   */
  managerPin: z.string().trim().max(10).optional(),
  deviceSecret: z.string().trim().max(200).optional(),
  lines: z.array(z.object({
    saleItemId: z.string().trim().min(1),
    quantity: z.union([z.number(), z.string()]),
    /** False where the goods cannot go back on the shelf. */
    restock: z.boolean().default(true),
    /** Why not, when not: "spoiled", "broken", "opened". */
    condition: z.string().trim().max(60).optional(),
    serials: z.array(z.string().trim().max(80)).max(200).optional(),
  })).min(1).max(100),
})

export async function recordPosReturn(input: unknown): Promise<ReturnResult> {
  const parsed = returnSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the return and try again." }
  }
  const body = parsed.data

  const gate = await requireReturnTill(body.staffId)
  if (!gate.ok) return { success: false, error: gate.error }
  const t = gate.t

  const sale = await db.posSale.findFirst({
    where: { id: body.saleId, shopkeeperId: t.shopkeeperId },
    select: {
      id: true, saleNumber: true, status: true,
      items: {
        select: {
          id: true, productId: true, variantId: true, batchId: true, name: true,
          unit: true, quantity: true, unitPrice: true, serials: true,
          returnItems: { select: { quantity: true } },
        },
      },
    },
  })
  if (!sale) return { success: false, error: "That sale was not found." }
  if (sale.status === "VOIDED") return { success: false, error: "That sale was voided, so there is nothing to return." }
  if (sale.status === "PARKED") return { success: false, error: "That sale was never paid for." }

  const byId = new Map(sale.items.map((i) => [i.id, i]))

  // Price and quantity both come from the ORIGINAL line. Nothing the caller
  // sent about money is used.
  const priced: {
    saleItemId: string
    productId: string | null
    variantId: string | null
    batchId: string | null
    name: string
    unit: string
    quantity: Prisma.Decimal
    unitPrice: Prisma.Decimal
    lineRefund: Prisma.Decimal
    restock: boolean
    condition: string | null
    serials: string[]
  }[] = []

  for (const l of body.lines) {
    const orig = byId.get(l.saleItemId)
    if (!orig) return { success: false, error: "One of those lines is not on that sale." }

    const qty = D(l.quantity)
    if (qty.lessThanOrEqualTo(0)) continue

    const sold = D(orig.quantity)
    const already = orig.returnItems.reduce((a, r) => a.plus(D(r.quantity)), D(0))
    const remaining = sold.minus(already)
    if (qty.greaterThan(remaining)) {
      return {
        success: false,
        error:
          `Only ${remaining.toFixed(remaining.isInteger() ? 0 : 3)} ${orig.unit} of ${orig.name} ` +
          `can still be returned on that receipt.`,
      }
    }

    priced.push({
      saleItemId: orig.id,
      productId: orig.productId,
      variantId: orig.variantId,
      batchId: orig.batchId,
      name: orig.name,
      unit: orig.unit,
      quantity: qty,
      unitPrice: D(orig.unitPrice),
      lineRefund: qty.times(D(orig.unitPrice)),
      restock: l.restock !== false,
      condition: l.condition?.trim() || null,
      serials: l.serials ?? [],
    })
  }

  if (priced.length === 0) return { success: false, error: "Nothing was marked to come back." }

  const totalRefunded = priced.reduce((a, l) => a.plus(l.lineRefund), D(0))

  // ---- a refund somebody should see ---------------------------------------
  //
  // Money leaving the drawer against goods coming back is the easiest thing
  // in a shop to invent, which is why the spec asks for it and why the
  // threshold is read here rather than trusted from the request.
  const shopConfig = await db.shopkeeperProfile.findUnique({
    where: { id: t.shopkeeperId },
    select: { posConfig: true },
  })
  const refundApproval = await approveWithManagerPin({
    shopkeeperId: t.shopkeeperId,
    required: aboveThresholdOrNever(
      parsePosConfig(shopConfig?.posConfig).refundApprovalAbove,
      Number(totalRefunded.toString()),
    ),
    pin: body.managerPin,
    what: "a refund of " + totalRefunded.toFixed(2),
  })
  if (!refundApproval.ok) return { success: false, error: refundApproval.error }

  const occurredAt = new Date()

  try {
    const result = await db.$transaction(async (tx) => {
      // Numbered per shop, like receipts, because a customer may be handed
      // this and a shop may be asked about it later.
      const count = await tx.posReturn.count({ where: { shopkeeperId: t.shopkeeperId } })
      const returnNumber = "R-" + String(count + 1).padStart(4, "0")

      const row = await tx.posReturn.create({
        data: {
          shopkeeperId: t.shopkeeperId,
          saleId: sale.id,
          returnNumber,
          totalRefunded,
          method: body.method,
          reason: body.reason.trim(),
          note: body.note?.trim() || null,
          handledByUserId: t.userId || null,
          handledByName: t.actorName,
          // The checked approver wins over a typed name: one is evidence,
          // the other is whatever the cashier felt like writing.
          approvedByName: refundApproval.approvedBy ?? body.approvedByName?.trim() ?? null,
          occurredAt,
          items: {
            create: priced.map((l) => ({
              saleItemId: l.saleItemId,
              productId: l.productId,
              variantId: l.variantId,
              name: l.name,
              quantity: l.quantity,
              unit: l.unit,
              unitPrice: l.unitPrice,
              lineRefund: l.lineRefund,
              restocked: l.restock,
              condition: l.condition,
              serials: l.serials,
            })),
          },
        },
        select: { id: true, returnNumber: true },
      })

      // Stock moves ONLY for what actually went back on the shelf.
      //
      // A line that is refunded but not restocked moves nothing, and that is
      // not an oversight. Those goods left stock when they were sold and
      // never came back, so the figure is already right; recording wastage
      // on top would take them off a second time and leave the shop short on
      // paper for something it never had.
      //
      // The loss is real but it is financial, not a stock loss, and it shows
      // where it belongs: the returns report marks any return that was not
      // restocked, so money paid out for goods the shop cannot resell is
      // visible without corrupting the count.
      for (const [i, l] of priced.entries()) {
        if (!l.productId || !l.restock) continue
        const moved = await recordStockMovement(tx as never, {
          shopkeeperId: t.shopkeeperId,
          productId: l.productId,
          variantId: l.variantId,
          batchId: l.batchId,
          kind: "RETURN",
          quantity: l.quantity,
          unit: l.unit,
          actorUserId: t.userId || null,
          reason: body.reason.trim(),
          idempotencyKey: `return:${row.id}:${i}`,
          occurredAt,
        }, "ALLOW")
        if (!moved.ok) throw new Error(moved.message)
      }

      // Serials that came back are on the register again, or written off.
      for (const l of priced) {
        if (l.serials.length === 0) continue
        await tx.productSerial.updateMany({
          where: { shopkeeperId: t.shopkeeperId, serial: { in: l.serials } },
          data: l.restock ? { status: "RETURNED", soldAt: null } : { status: "WRITTEN_OFF" },
        })
      }

      // Does anything remain sold on this receipt?
      const after = await tx.posSaleItem.findMany({
        where: { saleId: sale.id },
        select: { quantity: true, returnItems: { select: { quantity: true } } },
      })
      const allBack = after.every((it) => {
        const sold = D(it.quantity)
        const back = it.returnItems.reduce((a, r) => a.plus(D(r.quantity)), D(0))
        return back.greaterThanOrEqualTo(sold)
      })
      await tx.posSale.update({
        where: { id: sale.id },
        data: { status: allBack ? "REFUNDED" : "PART_REFUNDED" },
      })

      return row
    }, { timeout: 30000 })

    await recordPosAudit({
      actor: { businessId: t.businessId, storeId: t.storeId, userId: t.userId || null, staffId: t.actorStaffId, name: t.actorName },
      action: "sale.return",
      summary: `${t.actorName} refunded ${money(totalRefunded)} on ${sale.saleNumber} (${result.returnNumber})`,
      entityType: "PosReturn",
      entityId: result.id,
      detail: { saleNumber: sale.saleNumber, reason: body.reason, lines: priced.length },
    })

    return {
      success: true,
      returnId: result.id,
      returnNumber: result.returnNumber,
      refunded: money(totalRefunded),
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : "The return could not be recorded."
    return { success: false, error: why.slice(0, 200) }
  }
}

// --------------------------------------------------------------- the history

export type ReturnRow = {
  id: string
  returnNumber: string
  saleNumber: string
  occurredAt: string
  totalRefunded: number
  method: string
  reason: string
  handledByName: string | null
  itemCount: number
  restockedAll: boolean
}

export async function getReturnHistory(input: unknown): Promise<ReturnRow[]> {
  const parsed = z.object({
    limit: z.number().int().min(1).max(200).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input ?? {})
  const staffId = parsed.success ? parsed.data.staffId : undefined
  const gate = await requirePosPermission("report.sales", staffId)
  if (!gate.ok || !gate.actor.shopkeeperId) return []

  const rows = await db.posReturn.findMany({
    where: { shopkeeperId: gate.actor.shopkeeperId },
    orderBy: { occurredAt: "desc" },
    take: parsed.success ? parsed.data.limit ?? 50 : 50,
    select: {
      id: true, returnNumber: true, occurredAt: true, totalRefunded: true,
      method: true, reason: true, handledByName: true,
      sale: { select: { saleNumber: true } },
      items: { select: { restocked: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    saleNumber: r.sale.saleNumber,
    occurredAt: r.occurredAt.toISOString(),
    totalRefunded: money(r.totalRefunded),
    method: String(r.method),
    reason: r.reason,
    handledByName: r.handledByName,
    itemCount: r.items.length,
    restockedAll: r.items.every((i) => i.restocked),
  }))
}
