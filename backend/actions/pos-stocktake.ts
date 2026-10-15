"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"

/**
 * Counting what is actually on the shelf.
 *
 * WHY THIS IS A DOCUMENT AND NOT A FIELD EDIT
 *
 * The till could already adjust stock: somebody types a new figure and the
 * ledger takes it. That loses the only thing worth keeping. Afterwards there
 * is no record of what the ledger claimed, who disagreed with it, by how
 * much, or whether anybody with authority signed it off. Shrinkage, which is
 * the number a shopkeeper most wants and most rarely has, is invisible.
 *
 * So a count is a document. It is started, the sheet is drawn up from the
 * ledger, somebody walks the shelves and enters what they found, and only
 * when it is APPROVED does anything post to the stock ledger. Up to that
 * moment it has changed nothing, which means a count can be abandoned
 * halfway with no consequences at all.
 *
 * WHY expected IS FROZEN WHEN THE SHEET IS DRAWN UP
 *
 * If the expected figure were read at approval time instead, a sale rung up
 * while the counting was happening would silently move it, and the shop
 * would chase a discrepancy that never existed. The sheet records what the
 * ledger said at the moment it was drawn, and the variance is measured
 * against that. Sales during the count are real movements and stay in the
 * ledger on their own; the adjustment posted here is only the difference the
 * counter found.
 *
 * WHY COUNTING AND APPROVING ARE TWO PERMISSIONS
 *
 * A stock controller who counts their own shelf and then signs off the
 * shrinkage they found is not a control. "stock.count" draws up and fills in
 * the sheet; "stock.count_approve" posts it, and the stock controller role
 * deliberately does not have the second one.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const qty = (d: Prisma.Decimal) => Number(d.toFixed(3))
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

export type StockCountLineRow = {
  id: string
  productId: string
  variantId: string | null
  name: string
  variantLabel: string | null
  sku: string | null
  unit: string
  expected: number
  counted: number | null
  variance: number | null
  /** The variance valued at cost, so loss reads in money as well as units. */
  varianceValue: number | null
  reason: string | null
}

export type StockCountRow = {
  id: string
  reference: string
  scope: string
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "CANCELLED"
  note: string | null
  countedBy: string | null
  approvedBy: string | null
  startedAt: string
  submittedAt: string | null
  approvedAt: string | null
  lineCount: number
  countedLines: number
  /** Net units found over or short. */
  netVariance: number
  /** That variance at cost. Negative is loss. */
  netVarianceValue: number
}

function summarise(lines: { expected: Prisma.Decimal; counted: Prisma.Decimal | null; variance: Prisma.Decimal | null; unitCost: Prisma.Decimal | null }[]) {
  let net = D(0)
  let value = D(0)
  let counted = 0
  for (const l of lines) {
    if (l.counted === null) continue
    counted++
    const v = l.variance ?? D(0)
    net = net.add(v)
    if (l.unitCost) value = value.add(v.mul(l.unitCost))
  }
  return { net, value, counted }
}

// ------------------------------------------------------------------- reading

export async function getStockCounts(staffId?: string | null): Promise<StockCountRow[]> {
  const g = await gate("stock.count", staffId)
  if (!g.ok) return []

  const rows = await db.posStockCount.findMany({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { lines: { select: { expected: true, counted: true, variance: true, unitCost: true } } },
  })

  return rows.map((c) => {
    const s = summarise(c.lines)
    return {
      id: c.id,
      reference: c.reference,
      scope: c.scope,
      status: c.status,
      note: c.note,
      countedBy: c.countedByName,
      approvedBy: c.approvedByName,
      startedAt: c.startedAt.toISOString(),
      submittedAt: c.submittedAt?.toISOString() ?? null,
      approvedAt: c.approvedAt?.toISOString() ?? null,
      lineCount: c.lines.length,
      countedLines: s.counted,
      netVariance: qty(s.net),
      netVarianceValue: money(s.value),
    }
  })
}

export async function getStockCount(
  id: string,
  staffId?: string | null,
): Promise<{ count: StockCountRow; lines: StockCountLineRow[] } | null> {
  const g = await gate("stock.count", staffId)
  if (!g.ok) return null

  const c = await db.posStockCount.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    include: { lines: { orderBy: { name: "asc" } } },
  })
  if (!c) return null

  const s = summarise(c.lines)
  return {
    count: {
      id: c.id,
      reference: c.reference,
      scope: c.scope,
      status: c.status,
      note: c.note,
      countedBy: c.countedByName,
      approvedBy: c.approvedByName,
      startedAt: c.startedAt.toISOString(),
      submittedAt: c.submittedAt?.toISOString() ?? null,
      approvedAt: c.approvedAt?.toISOString() ?? null,
      lineCount: c.lines.length,
      countedLines: s.counted,
      netVariance: qty(s.net),
      netVarianceValue: money(s.value),
    },
    lines: c.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      variantId: l.variantId,
      name: l.name,
      variantLabel: l.variantLabel,
      sku: l.sku,
      unit: l.unit,
      expected: qty(l.expected),
      counted: l.counted === null ? null : qty(l.counted),
      variance: l.variance === null ? null : qty(l.variance),
      varianceValue:
        l.variance === null || l.unitCost === null ? null : money(l.variance.mul(l.unitCost)),
      reason: l.reason,
    })),
  }
}

// ------------------------------------------------------------------- writing

export type CountResult = { success: true; id: string } | { success: false; error: string }

const startSchema = z.object({
  scope: z.string().trim().min(1, "Say what is being counted.").max(120),
  /** Empty means the whole catalogue. */
  categoryId: z.string().trim().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

/**
 * Draw up a sheet from the ledger.
 *
 * Every active product in scope gets a line, including the ones the ledger
 * says are at zero. Leaving those off would make the count unable to find
 * the commonest discrepancy of all: stock on the shelf that the system
 * thinks it sold.
 */
export async function startStockCount(input: unknown): Promise<CountResult> {
  const parsed = startSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { scope, categoryId, note, staffId } = parsed.data

  const g = await gate("stock.count", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const open = await db.posStockCount.findFirst({
    where: { shopkeeperId: g.shopkeeperId, status: { in: ["DRAFT", "SUBMITTED"] } },
    select: { id: true, reference: true },
  })
  // Two open counts would each have frozen an expected figure from a
  // different moment, and approving both would post the same difference
  // twice.
  if (open) {
    return {
      success: false,
      error: "Count " + open.reference + " is still open. Finish or cancel it before starting another.",
    }
  }

  const products = await db.product.findMany({
    where: {
      shopkeeperId: g.shopkeeperId,
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
    },
    select: {
      id: true, name: true, sku: true, unit: true, costPrice: true,
      inventory: { select: { currentStock: true, stockOnHand: true } },
      variants: { where: { isActive: true }, select: { id: true, label: true, sku: true, currentStock: true, stockOnHand: true } },
    },
    take: 2000,
  })
  if (products.length === 0) {
    return { success: false, error: "There is nothing in that part of the catalogue to count." }
  }

  const last = await db.posStockCount.findFirst({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: { startedAt: "desc" },
    select: { reference: true },
  })
  const nextNumber = last ? Number(last.reference.replace(/\D/g, "")) + 1 : 1
  const reference = "SC-" + String(Number.isFinite(nextNumber) ? nextNumber : 1).padStart(4, "0")

  const lines: Prisma.PosStockCountLineCreateManyCountInput[] = []
  for (const p of products) {
    if (p.variants.length > 0) {
      // A variant product is counted per size: "nine shirts" is not a
      // countable fact when three of them are medium and six are large.
      for (const v of p.variants) {
        lines.push({
          productId: p.id,
          variantId: v.id,
          name: p.name,
          variantLabel: v.label,
          sku: v.sku ?? p.sku,
          unit: p.unit,
          expected: v.stockOnHand ?? D(v.currentStock),
          unitCost: p.costPrice ?? null,
        })
      }
    } else {
      lines.push({
        productId: p.id,
        variantId: null,
        name: p.name,
        variantLabel: null,
        sku: p.sku,
        unit: p.unit,
        expected: p.inventory?.stockOnHand ?? D(p.inventory?.currentStock ?? 0),
        unitCost: p.costPrice ?? null,
      })
    }
  }

  const created = await db.posStockCount.create({
    data: {
      shopkeeperId: g.shopkeeperId,
      reference,
      scope,
      note: note || null,
      countedByUserId: g.actor.userId ?? null,
      countedByName: g.actor.name,
      lines: { createMany: { data: lines } },
    },
    select: { id: true },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "stock.count_start",
    entityType: "stock_count",
    entityId: created.id,
    summary: "Started count " + reference + " (" + scope + ") over " + lines.length + " lines",
  })

  return { success: true, id: created.id }
}

const enterSchema = z.object({
  lineId: z.string().min(1),
  /** Null clears a line back to "nobody counted this". */
  counted: z.coerce.number().min(0).nullable(),
  reason: z.string().trim().max(200).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

/** Enter what was found on one line. */
export async function enterCountedQuantity(input: unknown): Promise<CountResult> {
  const parsed = enterSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { lineId, counted, reason, staffId } = parsed.data

  const g = await gate("stock.count", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const line = await db.posStockCountLine.findFirst({
    where: { id: lineId, count: { shopkeeperId: g.shopkeeperId } },
    include: { count: { select: { id: true, status: true, reference: true } } },
  })
  if (!line) return { success: false, error: "That line was not found." }
  if (line.count.status !== "DRAFT") {
    return { success: false, error: "Count " + line.count.reference + " is no longer being counted." }
  }

  await db.posStockCountLine.update({
    where: { id: lineId },
    data: {
      counted: counted === null ? null : D(counted),
      variance: counted === null ? null : D(counted).sub(line.expected),
      reason: reason || null,
      countedAt: counted === null ? null : new Date(),
    },
  })

  return { success: true, id: lineId }
}

const submitSchema = z.object({
  id: z.string().min(1),
  staffId: z.string().optional().nullable(),
})

/** Counting is finished. Nothing has moved yet. */
export async function submitStockCount(input: unknown): Promise<CountResult> {
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the details." }
  const { id, staffId } = parsed.data

  const g = await gate("stock.count", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const c = await db.posStockCount.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    include: { lines: { select: { counted: true } } },
  })
  if (!c) return { success: false, error: "That count was not found." }
  if (c.status !== "DRAFT") return { success: false, error: "That count has already been submitted." }

  const counted = c.lines.filter((l) => l.counted !== null).length
  if (counted === 0) {
    return { success: false, error: "Nothing has been counted yet." }
  }

  await db.posStockCount.update({
    where: { id },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "stock.count_submit",
    entityType: "stock_count",
    entityId: id,
    summary: "Submitted count " + c.reference + " with " + counted + " of " + c.lines.length + " lines counted",
  })

  return { success: true, id }
}

const approveSchema = z.object({
  id: z.string().min(1),
  staffId: z.string().optional().nullable(),
})

/**
 * Post the variances to the stock ledger.
 *
 * This is the only step that changes stock. Each counted line with a
 * non-zero variance becomes one COUNT_ADJUSTMENT movement, signed, so the
 * balance stays a plain sum. Lines nobody counted are skipped entirely:
 * "not counted" is not "counted as zero", and treating it as zero would
 * write off the whole shelf.
 */
export async function approveStockCount(input: unknown): Promise<CountResult> {
  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the details." }
  const { id, staffId } = parsed.data

  const g = await gate("stock.count_approve", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const c = await db.posStockCount.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    include: { lines: true },
  })
  if (!c) return { success: false, error: "That count was not found." }
  if (c.status === "APPROVED") return { success: false, error: "That count was already approved." }
  if (c.status !== "SUBMITTED") {
    return { success: false, error: "That count has not been submitted for approval yet." }
  }

  const toPost = c.lines.filter((l) => l.counted !== null && l.variance !== null && !l.variance.isZero())
  const now = new Date()

  try {
    await db.$transaction(
      async (tx) => {
        for (const l of toPost) {
          const variance = l.variance as Prisma.Decimal
          await tx.stockMovement.create({
            data: {
              shopkeeperId: c.shopkeeperId,
              productId: l.productId,
              variantId: l.variantId,
              kind: "COUNT_ADJUSTMENT",
              quantity: variance,
              unit: l.unit,
              unitCost: l.unitCost,
              reason: "Count " + c.reference + (l.reason ? ": " + l.reason : ""),
              actorUserId: g.actor.userId ?? null,
              occurredAt: now,
            },
          })

          // The projection the rest of the app reads. The ledger above is the
          // authority; this keeps the fast figure in step with it.
          if (l.variantId) {
            await tx.productVariant.update({
              where: { id: l.variantId },
              data: { stockOnHand: (l.counted as Prisma.Decimal), currentStock: Math.round(Number(l.counted)) },
            })
          } else {
            await tx.inventory.updateMany({
              where: { productId: l.productId },
              data: { stockOnHand: (l.counted as Prisma.Decimal), currentStock: Math.round(Number(l.counted)) },
            })
          }
        }

        await tx.posStockCount.update({
          where: { id },
          data: {
            status: "APPROVED",
            approvedAt: now,
            approvedByUserId: g.actor.userId ?? null,
            approvedByName: g.actor.name,
          },
        })
      },
      // A full-shop count posts one movement and one projection update per
      // line. Several hundred lines is ordinary, and the default 5s timeout
      // is nowhere near enough against a pooled connection.
      { timeout: 120000, maxWait: 20000 },
    )
  } catch (e) {
    return {
      success: false,
      error: "The count could not be posted, so nothing was changed. " + (e instanceof Error ? e.message : ""),
    }
  }

  await recordPosAudit({
    actor: g.actor,
    action: "stock.count_approve",
    entityType: "stock_count",
    entityId: id,
    summary: "Approved count " + c.reference + ", posting " + toPost.length + " adjustments",
  })

  return { success: true, id }
}

const cancelSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, "Say why this count is being dropped."),
  staffId: z.string().optional().nullable(),
})

/** Abandon a count. Nothing was posted, so nothing is unwound. */
export async function cancelStockCount(input: unknown): Promise<CountResult> {
  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { id, reason, staffId } = parsed.data

  const g = await gate("stock.count", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const c = await db.posStockCount.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    select: { status: true, reference: true, note: true },
  })
  if (!c) return { success: false, error: "That count was not found." }
  if (c.status === "APPROVED") {
    return { success: false, error: "That count has already been posted to the ledger." }
  }
  if (c.status === "CANCELLED") return { success: false, error: "That count was already dropped." }

  await db.posStockCount.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      note: (c.note ? c.note + " | " : "") + "Dropped: " + reason,
    },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "stock.count_cancel",
    entityType: "stock_count",
    entityId: id,
    summary: "Dropped count " + c.reference + ": " + reason,
  })

  return { success: true, id }
}
