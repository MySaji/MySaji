"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { recordStockMovement } from "@/backend/services/pos-ledger"
import { requirePosPermission, recordPosAudit, type PosActor } from "@/backend/actions/pos-access"

/**
 * Buying goods: who from, what was ordered, and what actually turned up.
 *
 * THE ONE IDEA THIS MODULE IS BUILT ON
 *
 * An order and a delivery are different facts and they routinely disagree. A
 * shop orders twenty crates; fourteen come on Tuesday, six on Friday, and
 * two of those are broken. A system where ordering and receiving are the
 * same record forces the shopkeeper to either lie about what arrived or lose
 * track of what is still owed. So an order is a promise, a goods receipt is
 * the lorry at the door, and only the second one moves stock.
 *
 * A receipt can exist with NO order, because a shopkeeper who buys three
 * crates off a passing lorry still needs that stock counted.
 *
 * WHAT RECEIVING DOES TO COST
 *
 * The receipt carries what was actually paid, and that updates the product's
 * cost price. Every margin figure in the reports is downstream of this, so
 * it is the receipt and never the order that writes it: what a supplier
 * quoted is not what the shop paid.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))
const qty = (d: Prisma.Decimal) => Number(d.toString())

type Tenant = { shopkeeperId: string; actor: PosActor }

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null): Promise<
  { ok: true; t: Tenant } | { ok: false; error: string }
> {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false, error: "This business has no shop set up yet." }
  return { ok: true, t: { shopkeeperId: g.actor.shopkeeperId, actor: g.actor } }
}

// ------------------------------------------------------------------ suppliers

export type SupplierRow = {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  location: string | null
  paymentTerms: string | null
  isActive: boolean
  orderCount: number
  lastReceivedAt: string | null
}

export async function getSuppliers(input?: unknown): Promise<SupplierRow[]> {
  const staffId = (input as { staffId?: string } | undefined)?.staffId
  const g = await gate("supplier.view", staffId)
  if (!g.ok) return []

  const rows = await db.posSupplier.findMany({
    where: { shopkeeperId: g.t.shopkeeperId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, contactName: true, phone: true, email: true,
      location: true, paymentTerms: true, isActive: true,
      _count: { select: { orders: true } },
      receipts: { select: { occurredAt: true }, orderBy: { occurredAt: "desc" }, take: 1 },
    },
  })

  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    contactName: s.contactName,
    phone: s.phone,
    email: s.email,
    location: s.location,
    paymentTerms: s.paymentTerms,
    isActive: s.isActive,
    orderCount: s._count.orders,
    lastReceivedAt: s.receipts[0]?.occurredAt.toISOString() ?? null,
  }))
}

export type SupplierResult = { success: true; supplierId: string } | { success: false; error: string }

const supplierSchema = z.object({
  supplierId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2).max(100),
  contactName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  paymentTerms: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  staffId: z.string().trim().max(60).optional(),
})

export async function saveSupplier(input: unknown): Promise<SupplierResult> {
  const parsed = supplierSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const g = await gate("supplier.manage", parsed.data.staffId)
  if (!g.ok) return { success: false, error: g.error }
  const d = parsed.data

  const data = {
    name: d.name,
    contactName: d.contactName || null,
    phone: d.phone || null,
    email: d.email || null,
    location: d.location || null,
    paymentTerms: d.paymentTerms || null,
    notes: d.notes || null,
  }

  try {
    if (d.supplierId) {
      const own = await db.posSupplier.findFirst({
        where: { id: d.supplierId, shopkeeperId: g.t.shopkeeperId },
        select: { id: true },
      })
      if (!own) return { success: false, error: "That supplier is not on your list." }
      await db.posSupplier.update({ where: { id: own.id }, data })
      await recordPosAudit({ actor: g.t.actor, action: "supplier.update", summary: `${g.t.actor.name} updated supplier ${d.name}`, entityType: "PosSupplier", entityId: own.id })
      return { success: true, supplierId: own.id }
    }

    const created = await db.posSupplier.create({
      data: { shopkeeperId: g.t.shopkeeperId, ...data },
      select: { id: true },
    })
    await recordPosAudit({ actor: g.t.actor, action: "supplier.create", summary: `${g.t.actor.name} added supplier ${d.name}`, entityType: "PosSupplier", entityId: created.id })
    return { success: true, supplierId: created.id }
  } catch (e) {
    // The unique is (shopkeeperId, name): two suppliers with one name make
    // every "who did we buy this from" answer ambiguous.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "You already have a supplier called " + d.name + "." }
    }
    return { success: false, error: "That supplier could not be saved." }
  }
}

export async function setSupplierActive(input: unknown): Promise<SupplierResult> {
  const parsed = z.object({
    supplierId: z.string().trim().min(1),
    isActive: z.boolean(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const g = await gate("supplier.manage", parsed.data.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const own = await db.posSupplier.findFirst({
    where: { id: parsed.data.supplierId, shopkeeperId: g.t.shopkeeperId },
    select: { id: true, name: true },
  })
  if (!own) return { success: false, error: "That supplier is not on your list." }
  // Deactivated, never deleted: their name is on past orders and receipts
  // that have to stay readable.
  await db.posSupplier.update({ where: { id: own.id }, data: { isActive: parsed.data.isActive } })
  return { success: true, supplierId: own.id }
}

// ------------------------------------------------------------------- ordering

export type PurchaseOrderRow = {
  id: string
  orderNumber: string
  supplierName: string
  status: string
  expectedTotal: number
  expectedAt: string | null
  createdAt: string
  itemCount: number
  /** How much of what was ordered has arrived, as a fraction of lines. */
  receivedLines: number
}

export async function getPurchaseOrders(input?: unknown): Promise<PurchaseOrderRow[]> {
  const staffId = (input as { staffId?: string } | undefined)?.staffId
  const g = await gate("purchase.view", staffId)
  if (!g.ok) return []

  const rows = await db.posPurchaseOrder.findMany({
    where: { shopkeeperId: g.t.shopkeeperId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, orderNumber: true, status: true, expectedTotal: true,
      expectedAt: true, createdAt: true,
      supplier: { select: { name: true } },
      items: { select: { id: true } },
      receipts: { select: { items: { select: { orderItemId: true } } } },
    },
  })

  return rows.map((o) => {
    const received = new Set<string>()
    for (const r of o.receipts) for (const i of r.items) if (i.orderItemId) received.add(i.orderItemId)
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      supplierName: o.supplier.name,
      status: String(o.status),
      expectedTotal: money(o.expectedTotal),
      expectedAt: o.expectedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      itemCount: o.items.length,
      receivedLines: received.size,
    }
  })
}

export type OrderResult = { success: true; orderId: string; orderNumber: string } | { success: false; error: string }

const orderSchema = z.object({
  supplierId: z.string().trim().min(1),
  expectedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),
  staffId: z.string().trim().max(60).optional(),
  lines: z.array(z.object({
    productId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(160),
    variantId: z.string().trim().min(1).optional(),
    quantity: z.union([z.number(), z.string()]),
    unit: z.string().trim().max(20).optional(),
    unitCost: z.number().min(0).max(10_000_000),
  })).min(1).max(300),
})

export async function createPurchaseOrder(input: unknown): Promise<OrderResult> {
  const parsed = orderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the order." }
  const g = await gate("purchase.create", parsed.data.staffId)
  if (!g.ok) return { success: false, error: g.error }
  const d = parsed.data

  const supplier = await db.posSupplier.findFirst({
    where: { id: d.supplierId, shopkeeperId: g.t.shopkeeperId, isActive: true },
    select: { id: true, name: true },
  })
  if (!supplier) return { success: false, error: "That supplier is not on your list." }

  let total = D(0)
  const lines = d.lines.map((l) => {
    const q = D(l.quantity)
    if (q.lessThanOrEqualTo(0)) throw new Error("quantity")
    const cost = D(l.unitCost)
    total = total.plus(q.times(cost))
    return { productId: l.productId ?? null, variantId: l.variantId ?? null, name: l.name, quantity: q, unit: l.unit || "piece", unitCost: cost }
  })

  const count = await db.posPurchaseOrder.count({ where: { shopkeeperId: g.t.shopkeeperId } })
  const orderNumber = "PO-" + String(count + 1).padStart(4, "0")

  const created = await db.posPurchaseOrder.create({
    data: {
      shopkeeperId: g.t.shopkeeperId,
      supplierId: supplier.id,
      orderNumber,
      // Draft, because an order a shopkeeper is still typing is not a
      // commitment and must not show as money owed.
      status: "DRAFT",
      expectedTotal: total,
      expectedAt: d.expectedAt ? new Date(d.expectedAt) : null,
      notes: d.notes || null,
      createdByUserId: g.t.actor.userId,
      createdByName: g.t.actor.name,
      items: { create: lines },
    },
    select: { id: true, orderNumber: true },
  })

  await recordPosAudit({
    actor: g.t.actor, action: "purchase.create",
    summary: `${g.t.actor.name} drafted ${created.orderNumber} for ${supplier.name}, ${money(total)}`,
    entityType: "PosPurchaseOrder", entityId: created.id,
  })
  return { success: true, orderId: created.id, orderNumber: created.orderNumber }
}

/**
 * Send it. Needs approval, because this is the moment the shop commits money.
 */
export async function approvePurchaseOrder(input: unknown): Promise<OrderResult> {
  const parsed = z.object({
    orderId: z.string().trim().min(1),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const g = await gate("purchase.approve", parsed.data.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const order = await db.posPurchaseOrder.findFirst({
    where: { id: parsed.data.orderId, shopkeeperId: g.t.shopkeeperId },
    select: { id: true, orderNumber: true, status: true, expectedTotal: true, supplier: { select: { name: true } } },
  })
  if (!order) return { success: false, error: "That order was not found." }
  if (order.status !== "DRAFT") return { success: false, error: "That order has already been sent." }

  await db.posPurchaseOrder.update({
    where: { id: order.id },
    data: { status: "ORDERED", approvedByName: g.t.actor.name, approvedAt: new Date() },
  })
  await recordPosAudit({
    actor: g.t.actor, action: "purchase.approve",
    summary: `${g.t.actor.name} approved ${order.orderNumber} for ${order.supplier.name}, ${money(order.expectedTotal)}`,
    entityType: "PosPurchaseOrder", entityId: order.id,
  })
  return { success: true, orderId: order.id, orderNumber: order.orderNumber }
}

// ------------------------------------------------------------------ receiving

export type ReceiptResult =
  | { success: true; receiptId: string; receiptNumber: string; totalCost: number; linesReceived: number }
  | { success: false; error: string }

const receiveSchema = z.object({
  /** Optional: goods bought off a lorry have no order behind them. */
  orderId: z.string().trim().min(1).optional(),
  supplierId: z.string().trim().min(1).optional(),
  supplierRef: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
  staffId: z.string().trim().max(60).optional(),
  lines: z.array(z.object({
    productId: z.string().trim().min(1),
    variantId: z.string().trim().min(1).optional(),
    orderItemId: z.string().trim().min(1).optional(),
    quantity: z.union([z.number(), z.string()]),
    unitCost: z.number().min(0).max(10_000_000),
    batchNumber: z.string().trim().max(60).optional(),
    expiryDate: z.string().datetime().optional(),
  })).min(1).max(300),
})

/**
 * The lorry at the door.
 *
 * This is the only thing here that moves stock, and it moves it through the
 * same ledger as everything else, so a delivery is as auditable as a sale.
 */
export async function receiveGoods(input: unknown): Promise<ReceiptResult> {
  const parsed = receiveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the delivery." }
  const g = await gate("stock.receive", parsed.data.staffId)
  if (!g.ok) return { success: false, error: g.error }
  const d = parsed.data
  const shopkeeperId = g.t.shopkeeperId

  let order: { id: string; supplierId: string; orderNumber: string } | null = null
  if (d.orderId) {
    const found = await db.posPurchaseOrder.findFirst({
      where: { id: d.orderId, shopkeeperId },
      select: { id: true, supplierId: true, orderNumber: true, status: true },
    })
    if (!found) return { success: false, error: "That order was not found." }
    if (found.status === "CANCELLED") return { success: false, error: "That order was cancelled." }
    order = { id: found.id, supplierId: found.supplierId, orderNumber: found.orderNumber }
  }

  const supplierId = order?.supplierId ?? d.supplierId ?? null
  if (supplierId) {
    const own = await db.posSupplier.findFirst({ where: { id: supplierId, shopkeeperId }, select: { id: true } })
    if (!own) return { success: false, error: "That supplier is not on your list." }
  }

  // Products must be this shop's. A delivery that could name another shop's
  // product would move their stock.
  const productIds = [...new Set(d.lines.map((l) => l.productId))]
  const products = await db.product.findMany({
    where: { id: { in: productIds }, shopkeeperId },
    select: { id: true, name: true, unit: true },
  })
  if (products.length !== productIds.length) {
    return { success: false, error: "One of those products is not in your shop." }
  }
  const byId = new Map(products.map((p) => [p.id, p]))

  let total = D(0)
  const lines = d.lines.map((l) => {
    const q = D(l.quantity)
    const cost = D(l.unitCost)
    total = total.plus(q.times(cost))
    const p = byId.get(l.productId)!
    return {
      productId: l.productId,
      variantId: l.variantId ?? null,
      orderItemId: l.orderItemId ?? null,
      name: p.name,
      quantity: q,
      unit: p.unit || "piece",
      unitCost: cost,
      batchNumber: l.batchNumber || null,
      expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
    }
  })
  if (lines.some((l) => l.quantity.lessThanOrEqualTo(0))) {
    return { success: false, error: "A delivery line has to be more than nothing." }
  }

  const occurredAt = new Date()

  try {
    const result = await db.$transaction(async (tx) => {
      const count = await tx.posGoodsReceipt.count({ where: { shopkeeperId } })
      const receiptNumber = "GRN-" + String(count + 1).padStart(4, "0")

      const receipt = await tx.posGoodsReceipt.create({
        data: {
          shopkeeperId,
          supplierId,
          orderId: order?.id ?? null,
          receiptNumber,
          supplierRef: d.supplierRef || null,
          totalCost: total,
          notes: d.notes || null,
          receivedByUserId: g.t.actor.userId,
          receivedByName: g.t.actor.name,
          occurredAt,
          items: { create: lines },
        },
        select: { id: true, receiptNumber: true },
      })

      for (const [i, l] of lines.entries()) {
        // A batch row where the delivery carried one, so FEFO has something
        // to sell first and expiry has something to warn about.
        let batchId: string | null = null
        // A product that already tracks batches needs one on every movement,
        // so a delivery whose boxes carry no number still gets a batch. It is
        // labelled for what it is rather than given an invented number: a
        // made-up batch number is worse than an honest blank, because
        // somebody will later try to trace it.
        const needsBatch =
          l.batchNumber || l.expiryDate ||
          (await tx.productBatch.count({ where: { productId: l.productId, variantId: l.variantId } })) > 0
        if (needsBatch) {
          // THE TRAP, and it costs a shop real stock on paper.
          //
          // Once a product has any batch, the ledger takes the product's
          // figure to be the SUM OF ITS BATCHES. So the first batched
          // delivery for a product that already holds unbatched stock would
          // silently drop that stock out of the count: twenty crates on the
          // floor become three the moment a dated delivery arrives.
          //
          // So before starting batch tracking, whatever is already on hand
          // is carried into a batch of its own. It has no number and no
          // expiry because nobody recorded one, which is exactly what it
          // should say.
          const batchCount = await tx.productBatch.count({
            where: { productId: l.productId, variantId: l.variantId },
          })
          if (batchCount === 0) {
            const inv = await tx.inventory.findUnique({
              where: { productId: l.productId },
              select: { stockOnHand: true, currentStock: true },
            })
            const existing = inv ? (inv.stockOnHand ?? D(inv.currentStock)) : D(0)
            if (existing.greaterThan(0)) {
              const carried = await tx.productBatch.create({
                data: {
                  shopkeeperId,
                  productId: l.productId,
                  variantId: l.variantId,
                  batchNumber: "Stock on hand",
                  currentStock: 0,
                },
                select: { id: true },
              })
              const seeded = await recordStockMovement(tx as never, {
                shopkeeperId,
                productId: l.productId,
                variantId: l.variantId,
                batchId: carried.id,
                kind: "OPENING_BALANCE",
                quantity: existing,
                unit: l.unit,
                actorUserId: g.t.actor.userId,
                reason: "Stock already on hand when batch tracking began",
                idempotencyKey: `grn:${receipt.id}:carry:${l.productId}`,
                occurredAt,
              }, "ALLOW")
              if (!seeded.ok) throw new Error(seeded.message)
            }
          }

          const batch = await tx.productBatch.create({
            data: {
              shopkeeperId,
              productId: l.productId,
              variantId: l.variantId,
              batchNumber: l.batchNumber || (d.supplierRef ? "Delivery " + d.supplierRef : "Unmarked delivery"),
              expiryDate: l.expiryDate,
              currentStock: 0,
              costPrice: l.unitCost,
            },
            select: { id: true },
          })
          batchId = batch.id
          // So the till knows to ask for a batch and to sell the oldest first.
          await tx.product.update({ where: { id: l.productId }, data: { tracksBatches: true } })
        }

        const moved = await recordStockMovement(tx as never, {
          shopkeeperId,
          productId: l.productId,
          variantId: l.variantId,
          batchId,
          kind: "PURCHASE",
          quantity: l.quantity,
          unit: l.unit,
          unitCost: l.unitCost,
          actorUserId: g.t.actor.userId,
          reason: order ? "Received against " + order.orderNumber : "Goods received",
          idempotencyKey: `grn:${receipt.id}:${i}`,
          occurredAt,
        }, "ALLOW")
        if (!moved.ok) throw new Error(moved.message)

        // What the shop actually paid, which is what every margin figure
        // downstream is computed from. The ORDER's figure is a quote and
        // never writes this.
        await tx.product.update({ where: { id: l.productId }, data: { costPrice: l.unitCost } })
      }

      // Does the order still have anything outstanding?
      //
      // Compared by QUANTITY, not by whether a line was touched. Fourteen of
      // twenty crates is a line that has been delivered against and is not a
      // line that has arrived, and a shop chasing the other six needs the
      // order to still say so.
      if (order) {
        const all = await tx.posPurchaseOrderItem.findMany({
          where: { orderId: order.id },
          select: { id: true, quantity: true },
        })
        const got = await tx.posGoodsReceiptItem.findMany({
          where: { receipt: { orderId: order.id }, orderItemId: { not: null } },
          select: { orderItemId: true, quantity: true },
        })
        const received = new Map<string, Prisma.Decimal>()
        for (const x of got) {
          if (!x.orderItemId) continue
          received.set(x.orderItemId, (received.get(x.orderItemId) ?? D(0)).plus(D(x.quantity)))
        }
        const complete = all.every((line) =>
          (received.get(line.id) ?? D(0)).greaterThanOrEqualTo(D(line.quantity)))
        await tx.posPurchaseOrder.update({
          where: { id: order.id },
          data: { status: complete ? "RECEIVED" : "PART_RECEIVED" },
        })
      }

      return receipt
    }, { timeout: 40000 })

    await recordPosAudit({
      actor: g.t.actor, action: "stock.receive",
      summary: `${g.t.actor.name} received ${lines.length} line${lines.length === 1 ? "" : "s"} worth ${money(total)} (${result.receiptNumber})`,
      entityType: "PosGoodsReceipt", entityId: result.id,
      detail: { orderNumber: order?.orderNumber ?? null, supplierRef: d.supplierRef ?? null },
    })

    return {
      success: true,
      receiptId: result.id,
      receiptNumber: result.receiptNumber,
      totalCost: money(total),
      linesReceived: lines.length,
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : "The delivery could not be recorded."
    return { success: false, error: why.slice(0, 200) }
  }
}

export type GoodsReceiptRow = {
  id: string
  receiptNumber: string
  supplierName: string | null
  orderNumber: string | null
  supplierRef: string | null
  totalCost: number
  occurredAt: string
  receivedByName: string | null
  itemCount: number
}

export async function getGoodsReceipts(input?: unknown): Promise<GoodsReceiptRow[]> {
  const staffId = (input as { staffId?: string } | undefined)?.staffId
  const g = await gate("purchase.view", staffId)
  if (!g.ok) return []

  const rows = await db.posGoodsReceipt.findMany({
    where: { shopkeeperId: g.t.shopkeeperId },
    orderBy: { occurredAt: "desc" },
    take: 100,
    select: {
      id: true, receiptNumber: true, supplierRef: true, totalCost: true,
      occurredAt: true, receivedByName: true,
      supplier: { select: { name: true } },
      order: { select: { orderNumber: true } },
      items: { select: { id: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    supplierName: r.supplier?.name ?? null,
    orderNumber: r.order?.orderNumber ?? null,
    supplierRef: r.supplierRef,
    totalCost: money(r.totalCost),
    occurredAt: r.occurredAt.toISOString(),
    receivedByName: r.receivedByName,
    itemCount: r.items.length,
  }))
}

/** One order with its lines, for receiving against. */
export async function getPurchaseOrderDetail(input: unknown): Promise<{
  id: string
  orderNumber: string
  supplierId: string
  supplierName: string
  status: string
  lines: { id: string; productId: string | null; name: string; quantity: number; unit: string; unitCost: number; receivedQuantity: number }[]
} | null> {
  const parsed = z.object({
    orderId: z.string().trim().min(1),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return null
  const g = await gate("purchase.view", parsed.data.staffId)
  if (!g.ok) return null

  const o = await db.posPurchaseOrder.findFirst({
    where: { id: parsed.data.orderId, shopkeeperId: g.t.shopkeeperId },
    select: {
      id: true, orderNumber: true, status: true, supplierId: true,
      supplier: { select: { name: true } },
      items: { select: { id: true, productId: true, name: true, quantity: true, unit: true, unitCost: true } },
      receipts: { select: { items: { select: { orderItemId: true, quantity: true } } } },
    },
  })
  if (!o) return null

  const got = new Map<string, Prisma.Decimal>()
  for (const r of o.receipts) {
    for (const i of r.items) {
      if (!i.orderItemId) continue
      got.set(i.orderItemId, (got.get(i.orderItemId) ?? D(0)).plus(D(i.quantity)))
    }
  }

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    supplierId: o.supplierId,
    supplierName: o.supplier.name,
    status: String(o.status),
    lines: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      quantity: qty(i.quantity),
      unit: i.unit,
      unitCost: money(i.unitCost),
      receivedQuantity: qty(got.get(i.id) ?? D(0)),
    })),
  }
}
