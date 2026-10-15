"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"

/**
 * Quotations and pro forma invoices.
 *
 * WHY NOT JUST A PARKED SALE
 *
 * A parked sale is a basket somebody walked away from, priced at whatever the
 * shelf says when it is resumed. A quote is a figure the shop put in writing.
 * A hardware merchant who quotes 180,000 for a roof cannot have that become
 * 186,000 because cement moved on Tuesday. So the prices are frozen on the
 * line and converting carries them across rather than re-pricing, and the
 * validity date is how the shop limits how long it is held to them.
 *
 * WHY CONVERTING DOES NOT RING UP THE SALE ITSELF
 *
 * It would have to decide the tender, the change, the shift, the stock and
 * the tax, and all of that already exists once, correctly, in recordPosSale.
 * A second copy here would drift from it within a month. Converting hands
 * back the lines at their quoted prices for the till to ring up, and records
 * which sale came of it.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))
const qty = (d: Prisma.Decimal) => Number(d.toFixed(3))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

export type QuoteLineRow = {
  id: string
  productId: string | null
  name: string
  sku: string | null
  unit: string
  quantity: number
  unitPrice: number
  total: number
}

export type QuoteRow = {
  id: string
  reference: string
  status: "DRAFT" | "SENT" | "ACCEPTED" | "CONVERTED" | "EXPIRED" | "CANCELLED"
  customerName: string
  customerPhone: string | null
  validUntil: string | null
  /** Past its date and not yet acted on. */
  expired: boolean
  note: string | null
  posSaleId: string | null
  preparedBy: string | null
  createdAt: string
  lines: QuoteLineRow[]
  total: number
}

function toRow(q: {
  id: string; reference: string; status: string; customerName: string; customerPhone: string | null
  validUntil: Date | null; note: string | null; posSaleId: string | null
  preparedByName: string | null; createdAt: Date
  lines: { id: string; productId: string | null; name: string; sku: string | null; unit: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; total: Prisma.Decimal }[]
}): QuoteRow {
  const settled = q.status === "CONVERTED" || q.status === "CANCELLED"
  return {
    id: q.id,
    reference: q.reference,
    status: q.status as QuoteRow["status"],
    customerName: q.customerName,
    customerPhone: q.customerPhone,
    validUntil: q.validUntil?.toISOString() ?? null,
    // Derived rather than stored: a quote does not need a job to mark it
    // expired, it just stops being valid, and asking the question when
    // somebody looks is both simpler and always right.
    expired: !settled && !!q.validUntil && q.validUntil < new Date(),
    note: q.note,
    posSaleId: q.posSaleId,
    preparedBy: q.preparedByName,
    createdAt: q.createdAt.toISOString(),
    lines: q.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      name: l.name,
      sku: l.sku,
      unit: l.unit,
      quantity: qty(l.quantity),
      unitPrice: money(l.unitPrice),
      total: money(l.total),
    })),
    total: money(q.lines.reduce((a, l) => a.add(l.total), D(0))),
  }
}

export async function getQuotes(staffId?: string | null): Promise<QuoteRow[]> {
  const g = await gate("till.sell", staffId)
  if (!g.ok) return []

  const rows = await db.posQuote.findMany({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { lines: { orderBy: { createdAt: "asc" } } },
  })
  return rows.map(toRow)
}

export type QuoteResult = { success: true; id: string } | { success: false; error: string }

const createSchema = z.object({
  customerName: z.string().trim().min(2, "Who is it for?"),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  posCustomerId: z.string().trim().optional().nullable(),
  /** Days the figures hold for. Omitted means open ended. */
  validForDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(z.object({
    productId: z.string().trim().optional().nullable(),
    /** Required for a line the shop does not stock, which is half a builder's quote. */
    name: z.string().trim().max(200).optional().nullable(),
    quantity: z.coerce.number().positive(),
    unitPrice: z.coerce.number().min(0),
  })).min(1, "A quote needs at least one line."),
  staffId: z.string().optional().nullable(),
})

export async function createQuote(input: unknown): Promise<QuoteResult> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const d = parsed.data

  const g = await gate("till.sell", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const ids = d.lines.map((l) => l.productId).filter((x): x is string => !!x)
  const products = ids.length
    ? await db.product.findMany({
        where: { shopkeeperId: g.shopkeeperId, id: { in: ids } },
        select: { id: true, name: true, sku: true, unit: true },
      })
    : []
  const byId = new Map(products.map((p) => [p.id, p]))

  const lines: Prisma.PosQuoteLineCreateManyQuoteInput[] = []
  for (const l of d.lines) {
    const p = l.productId ? byId.get(l.productId) : undefined
    if (l.productId && !p) {
      return { success: false, error: "One of those products is not in this shop's catalogue." }
    }
    const name = p?.name ?? (l.name ?? "").trim()
    if (!name) {
      return { success: false, error: "Every line needs either a product or a description." }
    }
    lines.push({
      productId: p?.id ?? null,
      name,
      sku: p?.sku ?? null,
      unit: p?.unit ?? "piece",
      quantity: D(l.quantity),
      unitPrice: D(l.unitPrice),
      total: D(l.quantity).mul(D(l.unitPrice)),
    })
  }

  const last = await db.posQuote.findFirst({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: { createdAt: "desc" },
    select: { reference: true },
  })
  const n = last ? Number(last.reference.replace(/\D/g, "")) + 1 : 1
  const reference = "QT-" + String(Number.isFinite(n) ? n : 1).padStart(4, "0")

  let validUntil: Date | null = null
  if (d.validForDays) {
    validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + d.validForDays)
  }

  const created = await db.posQuote.create({
    data: {
      shopkeeperId: g.shopkeeperId,
      reference,
      customerName: d.customerName,
      customerPhone: d.customerPhone || null,
      posCustomerId: d.posCustomerId || null,
      validUntil,
      note: d.note || null,
      preparedByName: g.actor.name,
      lines: { createMany: { data: lines } },
    },
    select: { id: true },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "quote.create",
    entityType: "quote",
    entityId: created.id,
    summary: "Quoted " + d.customerName + " on " + reference + " over " + lines.length + " lines",
  })

  return { success: true, id: created.id }
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["SENT", "ACCEPTED", "CANCELLED"]),
  reason: z.string().trim().max(300).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

export async function setQuoteStatus(input: unknown): Promise<QuoteResult> {
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the details." }
  const { id, status, reason, staffId } = parsed.data

  const g = await gate("till.sell", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const q = await db.posQuote.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    select: { status: true, reference: true },
  })
  if (!q) return { success: false, error: "That quote was not found." }
  if (q.status === "CONVERTED") {
    return { success: false, error: "Quote " + q.reference + " has already been rung up." }
  }
  if (status === "CANCELLED" && !reason) {
    return { success: false, error: "Say why the quote is being withdrawn." }
  }

  const now = new Date()
  await db.posQuote.update({
    where: { id },
    data: {
      status,
      sentAt: status === "SENT" ? now : undefined,
      acceptedAt: status === "ACCEPTED" ? now : undefined,
      cancelledAt: status === "CANCELLED" ? now : undefined,
      cancelReason: status === "CANCELLED" ? reason : undefined,
    },
  })

  return { success: true, id }
}

export type QuoteForTill = {
  quoteId: string
  reference: string
  customerName: string
  customerPhone: string | null
  posCustomerId: string | null
  lines: { productId: string; quantity: string; unitPriceOverride: number }[]
  /** Lines the till cannot ring up, because the shop does not stock them. */
  unstocked: { name: string; quantity: number; unitPrice: number }[]
}

/**
 * Hand a quote to the till at the prices that were quoted.
 *
 * The prices come across as line overrides, which is exactly what they are: a
 * figure a person committed to, outranking the shelf and any offer. That is
 * already how the pricing engine treats an override, so nothing special is
 * needed at the other end.
 */
export async function prepareQuoteForTill(
  input: { id: string; staffId?: string | null },
): Promise<{ success: true; quote: QuoteForTill } | { success: false; error: string }> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const q = await db.posQuote.findFirst({
    where: { id: input.id, shopkeeperId: g.shopkeeperId },
    include: { lines: true },
  })
  if (!q) return { success: false, error: "That quote was not found." }
  if (q.status === "CONVERTED") {
    return { success: false, error: "Quote " + q.reference + " has already been rung up on sale " + q.posSaleId + "." }
  }
  if (q.status === "CANCELLED") {
    return { success: false, error: "Quote " + q.reference + " was withdrawn." }
  }
  // Refused rather than silently honoured: the whole purpose of the date is
  // that the shop stops being held to the figures. Re-quoting is a decision
  // somebody should take knowingly.
  if (q.validUntil && q.validUntil < new Date()) {
    return {
      success: false,
      error: "Quote " + q.reference + " expired on " + q.validUntil.toLocaleDateString("en-KE") +
        ". Prepare a new one if the prices still stand.",
    }
  }

  return {
    success: true,
    quote: {
      quoteId: q.id,
      reference: q.reference,
      customerName: q.customerName,
      customerPhone: q.customerPhone,
      posCustomerId: q.posCustomerId,
      lines: q.lines
        .filter((l) => l.productId)
        .map((l) => ({
          productId: l.productId as string,
          quantity: l.quantity.toString(),
          unitPriceOverride: money(l.unitPrice),
        })),
      // Surfaced rather than dropped. A quote that silently loses three of its
      // eight lines on the way to the till is how a customer is charged for
      // less than they agreed to buy.
      unstocked: q.lines
        .filter((l) => !l.productId)
        .map((l) => ({ name: l.name, quantity: qty(l.quantity), unitPrice: money(l.unitPrice) })),
    },
  }
}

/** Record which sale a quote became, once the till has rung it up. */
export async function markQuoteConverted(
  input: { id: string; posSaleId: string; staffId?: string | null },
): Promise<QuoteResult> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const q = await db.posQuote.findFirst({
    where: { id: input.id, shopkeeperId: g.shopkeeperId },
    select: { status: true, reference: true },
  })
  if (!q) return { success: false, error: "That quote was not found." }
  if (q.status === "CONVERTED") {
    return { success: false, error: "Quote " + q.reference + " was already rung up." }
  }

  const sale = await db.posSale.findFirst({
    where: { id: input.posSaleId, shopkeeperId: g.shopkeeperId },
    select: { id: true },
  })
  if (!sale) return { success: false, error: "That sale was not found in this shop." }

  await db.posQuote.update({
    where: { id: input.id },
    data: { status: "CONVERTED", convertedAt: new Date(), posSaleId: sale.id },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "quote.convert",
    entityType: "quote",
    entityId: input.id,
    summary: "Quote " + q.reference + " was rung up",
  })

  return { success: true, id: input.id }
}
