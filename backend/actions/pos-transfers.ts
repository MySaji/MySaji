"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/actions/pos-access"
import { recordStockMovement } from "@/backend/services/pos-ledger"

/**
 * Moving stock between branches.
 *
 * WHY IN-TRANSIT IS A REAL STATE
 *
 * The obvious design makes a transfer instant: take it off one branch, add it
 * to the other, done. That is wrong for anywhere goods travel by matatu. For
 * the hours or days in between, the sending branch is short and the receiving
 * branch is over, every stock count in that window disagrees with the system,
 * and nobody can say why. So stock leaves on dispatch and arrives on receipt,
 * and in between it belongs to neither branch.
 *
 * WHY THE PRODUCT MATCH IS FROZEN AT DISPATCH
 *
 * Branches are separate ShopkeeperProfiles with separate catalogues, so "the
 * same product" is two rows sharing a SKU. If that match were made when the
 * goods arrived, a branch that renamed or re-SKU'd something mid-journey
 * would strand them with nowhere to put them. The match is resolved when the
 * goods leave, and refused loudly there if the far branch does not stock it,
 * which is a problem somebody can still fix before the lorry goes.
 *
 * WHY A SHORT DELIVERY IS NOT AVERAGED AWAY
 *
 * If ten leave and nine arrive, the honest record is nine in and one lost.
 * Quietly receiving ten keeps the books tidy and loses the shop an item a
 * week forever without anyone noticing.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const qty = (d: Prisma.Decimal) => Number(d.toFixed(3))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, businessId: g.actor.businessId, actor: g.actor }
}

export type TransferLineRow = {
  id: string
  productId: string
  name: string
  sku: string | null
  unit: string
  quantitySent: number
  quantityReceived: number | null
  /** sent less received. Positive means it went missing on the way. */
  shortBy: number | null
  discrepancyNote: string | null
}

export type TransferRow = {
  id: string
  reference: string
  status: "DRAFT" | "DISPATCHED" | "RECEIVED" | "CANCELLED"
  fromName: string
  toName: string
  /** True when the signed-in branch is the one sending. */
  outgoing: boolean
  note: string | null
  dispatchedAt: string | null
  receivedAt: string | null
  lines: TransferLineRow[]
  totalSent: number
  totalShort: number
}

export async function getTransfers(staffId?: string | null): Promise<TransferRow[]> {
  const g = await gate("stock.view", staffId)
  if (!g.ok) return []

  const rows = await db.posStockTransfer.findMany({
    where: {
      businessId: g.businessId,
      OR: [{ fromShopkeeperId: g.shopkeeperId }, { toShopkeeperId: g.shopkeeperId }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      lines: true,
      from: { select: { shopName: true } },
      to: { select: { shopName: true } },
    },
  })

  return rows.map((t) => {
    const lines = t.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      name: l.name,
      sku: l.sku,
      unit: l.unit,
      quantitySent: qty(l.quantitySent),
      quantityReceived: l.quantityReceived === null ? null : qty(l.quantityReceived),
      shortBy: l.quantityReceived === null ? null : qty(l.quantitySent.sub(l.quantityReceived)),
      discrepancyNote: l.discrepancyNote,
    }))
    return {
      id: t.id,
      reference: t.reference,
      status: t.status,
      fromName: t.from.shopName,
      toName: t.to.shopName,
      outgoing: t.fromShopkeeperId === g.shopkeeperId,
      note: t.note,
      dispatchedAt: t.dispatchedAt?.toISOString() ?? null,
      receivedAt: t.receivedAt?.toISOString() ?? null,
      lines,
      totalSent: lines.reduce((a, l) => a + l.quantitySent, 0),
      totalShort: lines.reduce((a, l) => a + Math.max(0, l.shortBy ?? 0), 0),
    }
  })
}

/** The other branches this one can send to. */
export async function getTransferDestinations(
  staffId?: string | null,
): Promise<{ shopkeeperId: string; name: string }[]> {
  const g = await gate("stock.view", staffId)
  if (!g.ok) return []

  const stores = await db.posStore.findMany({
    where: { businessId: g.businessId, isActive: true, shopkeeperId: { not: g.shopkeeperId } },
    select: { shopkeeperId: true, name: true, shopkeeper: { select: { shopName: true } } },
  })
  return stores.map((s) => ({ shopkeeperId: s.shopkeeperId, name: s.name || s.shopkeeper.shopName }))
}

export type TransferResult = { success: true; id: string } | { success: false; error: string }

const createSchema = z.object({
  toShopkeeperId: z.string().min(1, "Which branch is it going to?"),
  note: z.string().trim().max(500).optional().nullable(),
  lines: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().positive(),
  })).min(1, "Add something to send."),
  staffId: z.string().optional().nullable(),
})

/** Start a transfer. Nothing moves until it is dispatched. */
export async function createTransfer(input: unknown): Promise<TransferResult> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { toShopkeeperId, note, lines, staffId } = parsed.data

  const g = await gate("stock.adjust", staffId)
  if (!g.ok) return { success: false, error: g.error }

  if (toShopkeeperId === g.shopkeeperId) {
    return { success: false, error: "That is this branch. Pick a different one." }
  }
  // Scoped to the business, so a shopkeeper id from a browser cannot be used
  // to push stock into somebody else's shop.
  const destination = await db.posStore.findFirst({
    where: { businessId: g.businessId, shopkeeperId: toShopkeeperId, isActive: true },
    select: { shopkeeperId: true },
  })
  if (!destination) return { success: false, error: "That branch is not part of this business." }

  const products = await db.product.findMany({
    where: { shopkeeperId: g.shopkeeperId, id: { in: lines.map((l) => l.productId) } },
    select: { id: true, name: true, sku: true, unit: true, costPrice: true },
  })
  const byId = new Map(products.map((p) => [p.id, p]))
  for (const l of lines) {
    if (!byId.has(l.productId)) {
      return { success: false, error: "One of those products is not in this branch's catalogue." }
    }
  }

  const last = await db.posStockTransfer.findFirst({
    where: { businessId: g.businessId },
    orderBy: { createdAt: "desc" },
    select: { reference: true },
  })
  const n = last ? Number(last.reference.replace(/\D/g, "")) + 1 : 1
  const reference = "TR-" + String(Number.isFinite(n) ? n : 1).padStart(4, "0")

  const created = await db.posStockTransfer.create({
    data: {
      businessId: g.businessId,
      reference,
      fromShopkeeperId: g.shopkeeperId,
      toShopkeeperId,
      note: note || null,
      lines: {
        createMany: {
          data: lines.map((l) => {
            const p = byId.get(l.productId)!
            return {
              productId: p.id,
              name: p.name,
              sku: p.sku,
              unit: p.unit,
              quantitySent: D(l.quantity),
              unitCost: p.costPrice ?? null,
            }
          }),
        },
      },
    },
    select: { id: true },
  })

  return { success: true, id: created.id }
}

const dispatchSchema = z.object({
  id: z.string().min(1),
  staffId: z.string().optional().nullable(),
})

/**
 * Send it. Stock leaves here now and is in transit until the far end counts
 * it in.
 */
export async function dispatchTransfer(input: unknown): Promise<TransferResult> {
  const parsed = dispatchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the details." }
  const { id, staffId } = parsed.data

  const g = await gate("stock.adjust", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const t = await db.posStockTransfer.findFirst({
    where: { id, businessId: g.businessId, fromShopkeeperId: g.shopkeeperId },
    include: { lines: true },
  })
  if (!t) return { success: false, error: "That transfer was not found, or it is not this branch's to send." }
  if (t.status !== "DRAFT") return { success: false, error: "That transfer has already been sent." }

  // Resolve each line to the receiving branch's own product row, by SKU.
  // Refused here, before the goods leave, because this is the last moment
  // anybody can still fix it.
  const skus = t.lines.map((l) => l.sku).filter((x): x is string => !!x)
  const theirs = await db.product.findMany({
    where: { shopkeeperId: t.toShopkeeperId, sku: { in: skus } },
    select: { id: true, sku: true },
  })
  const bySku = new Map(theirs.map((p) => [p.sku, p.id]))

  const unmatched = t.lines.filter((l) => !l.sku || !bySku.has(l.sku))
  if (unmatched.length > 0) {
    return {
      success: false,
      error: "The receiving branch has no product with the code " +
        unmatched.map((l) => l.sku || l.name).slice(0, 3).join(", ") +
        ". Add it there first, with the same code.",
    }
  }

  const now = new Date()
  try {
    await db.$transaction(async (tx) => {
      for (const [i, l] of t.lines.entries()) {
        const moved = await recordStockMovement(tx as never, {
          shopkeeperId: t.fromShopkeeperId,
          productId: l.productId,
          kind: "TRANSFER_OUT",
          quantity: l.quantitySent.negated(),
          unit: l.unit,
          unitCost: l.unitCost,
          reason: "Transfer " + t.reference,
          actorUserId: g.actor.userId ?? null,
          idempotencyKey: "tr-out:" + t.id + ":" + i,
          occurredAt: now,
        } as never)
        if (!moved.ok) {
          throw new Error(l.name + ": " + (moved.message ?? "could not leave stock") + " Nothing was sent.")
        }
        await tx.posStockTransferLine.update({
          where: { id: l.id },
          data: { toProductId: bySku.get(l.sku!) ?? null },
        })
      }
      await tx.posStockTransfer.update({
        where: { id },
        data: { status: "DISPATCHED", dispatchedAt: now, dispatchedByName: g.actor.name },
      })
    }, { timeout: 60000, maxWait: 15000 })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Nothing was sent." }
  }

  await recordPosAudit({
    actor: g.actor,
    action: "transfer.dispatch",
    entityType: "stock_transfer",
    entityId: id,
    summary: "Sent " + t.reference + " with " + t.lines.length + " lines",
  })

  return { success: true, id }
}

const receiveSchema = z.object({
  id: z.string().min(1),
  lines: z.array(z.object({
    lineId: z.string().min(1),
    quantityReceived: z.coerce.number().min(0),
    note: z.string().trim().max(200).optional().nullable(),
  })).min(1),
  staffId: z.string().optional().nullable(),
})

/**
 * Count it in at the far end.
 *
 * Only what was actually counted arrives. Anything missing stays missing: it
 * left the sending branch and never reached this one, which is exactly what
 * the ledger should say.
 */
export async function receiveTransfer(input: unknown): Promise<TransferResult> {
  const parsed = receiveSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { id, lines, staffId } = parsed.data

  const g = await gate("stock.receive", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const t = await db.posStockTransfer.findFirst({
    where: { id, businessId: g.businessId, toShopkeeperId: g.shopkeeperId },
    include: { lines: true },
  })
  if (!t) return { success: false, error: "That transfer was not found, or it is not coming to this branch." }
  if (t.status === "RECEIVED") return { success: false, error: "That transfer was already received." }
  if (t.status !== "DISPATCHED") return { success: false, error: "That transfer has not been sent yet." }

  const counted = new Map(lines.map((l) => [l.lineId, l]))
  for (const l of t.lines) {
    const c = counted.get(l.id)
    if (!c) return { success: false, error: "Count every line before receiving." }
    if (D(c.quantityReceived).greaterThan(l.quantitySent)) {
      return {
        success: false,
        error: l.name + ": " + c.quantityReceived + " counted but only " + qty(l.quantitySent) +
          " was sent. Check the delivery note.",
      }
    }
  }

  const now = new Date()
  try {
    await db.$transaction(async (tx) => {
      for (const [i, l] of t.lines.entries()) {
        const c = counted.get(l.id)!
        const received = D(c.quantityReceived)

        await tx.posStockTransferLine.update({
          where: { id: l.id },
          data: { quantityReceived: received, discrepancyNote: c.note || null },
        })

        // Nothing arrived, nothing to post. The units are still recorded as
        // having left the other branch, which is the point.
        if (received.isZero() || !l.toProductId) continue

        const moved = await recordStockMovement(tx as never, {
          shopkeeperId: t.toShopkeeperId,
          productId: l.toProductId,
          kind: "TRANSFER_IN",
          quantity: received,
          unit: l.unit,
          unitCost: l.unitCost,
          reason: "Transfer " + t.reference,
          actorUserId: g.actor.userId ?? null,
          idempotencyKey: "tr-in:" + t.id + ":" + i,
          occurredAt: now,
        } as never)
        if (!moved.ok) throw new Error(l.name + " could not be taken into stock. Nothing was received.")
      }
      await tx.posStockTransfer.update({
        where: { id },
        data: { status: "RECEIVED", receivedAt: now, receivedByName: g.actor.name },
      })
    }, { timeout: 60000, maxWait: 15000 })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Nothing was received." }
  }

  const short = t.lines.reduce((a, l) => {
    const c = counted.get(l.id)!
    return a + Math.max(0, qty(l.quantitySent) - c.quantityReceived)
  }, 0)

  await recordPosAudit({
    actor: g.actor,
    action: "transfer.receive",
    entityType: "stock_transfer",
    entityId: id,
    summary: "Received " + t.reference + (short > 0 ? ", short by " + short : " in full"),
  })

  return { success: true, id }
}

const cancelSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, "Say why."),
  staffId: z.string().optional().nullable(),
})

/** Drop a transfer that has not left yet. */
export async function cancelTransfer(input: unknown): Promise<TransferResult> {
  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { id, reason, staffId } = parsed.data

  const g = await gate("stock.adjust", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const t = await db.posStockTransfer.findFirst({
    where: { id, businessId: g.businessId, fromShopkeeperId: g.shopkeeperId },
    select: { status: true, reference: true },
  })
  if (!t) return { success: false, error: "That transfer was not found." }
  // Deliberately not allowed after dispatch: the stock has already left and
  // cancelling would leave it nowhere. A dispatch that never arrives is
  // received as zero, which records the loss honestly.
  if (t.status !== "DRAFT") {
    return {
      success: false,
      error: "That transfer has already been sent. Receive it as zero at the other branch to record what was lost.",
    }
  }

  await db.posStockTransfer.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  })

  return { success: true, id }
}
