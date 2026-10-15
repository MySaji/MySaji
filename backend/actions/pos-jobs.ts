"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"
import { recordStockMovement } from "@/backend/services/pos-ledger"

/**
 * Work taken in, worked on, and given back.
 *
 * WHY ONE MODULE FOR FOUR TRADES
 *
 * A garage, a phone repair bench, a dry cleaner and a car wash look like four
 * different businesses and are the same shape: something is left with you, it
 * gets a ticket, work and parts go into it, and the customer comes back for
 * it. The differences are vocabulary, not structure. Building four of these
 * would have meant four places to fix the same bug and four half-maintained
 * copies of the awkward part, which is the money.
 *
 * So the profile decides what the fields are called on screen; this decides
 * what actually happens. That is the spec's own rule: business type is
 * configuration, not a fork.
 *
 * WHY A JOB IS NOT REVENUE UNTIL IT IS COLLECTED
 *
 * The tempting shortcut is to treat a job card as a sale from the moment it
 * is booked in. It is not. Half the cars in a yard on any given day will be
 * collected next week, some will be abandoned, and a few will be argued down
 * at the counter. Counting them as takings is how a service business
 * convinces itself it had a good month. Nothing reaches the sales figures
 * until collectJob runs, and that is the only place a PosSale is raised.
 *
 * WHY PARTS LEAVE STOCK AT COLLECTION AND NOT BEFORE
 *
 * A part is physically fitted days before the customer pays. Deducting at
 * that moment is arguably more truthful about the shelf, but it splits the
 * sale from its own stock movement and makes margin per job impossible to
 * reconcile. Deducting at collection keeps one event, one sale, one set of
 * movements, with the same idempotency protection as any other till sale.
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

export type JobLineRow = {
  id: string
  kind: "LABOUR" | "PART"
  productId: string | null
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export type JobCardRow = {
  id: string
  reference: string
  status: "RECEIVED" | "IN_PROGRESS" | "READY" | "COLLECTED" | "CANCELLED"
  customerName: string
  customerPhone: string | null
  itemDescription: string
  itemIdentifier: string | null
  faultReported: string | null
  accessories: string | null
  quotedAmount: number | null
  depositPaid: number
  assignedToName: string | null
  promisedAt: string | null
  notes: string | null
  receivedAt: string
  readyAt: string | null
  collectedAt: string | null
  cancelReason: string | null
  posSaleId: string | null
  lines: JobLineRow[]
  /** The lines totalled. What the customer owes, before the deposit. */
  total: number
  /** total less what was already paid at intake. */
  balanceDue: number
}

function toRow(j: {
  id: string; reference: string; status: string; customerName: string; customerPhone: string | null
  itemDescription: string; itemIdentifier: string | null; faultReported: string | null
  accessories: string | null; quotedAmount: Prisma.Decimal | null; depositPaid: Prisma.Decimal
  assignedToName: string | null; promisedAt: Date | null; notes: string | null
  receivedAt: Date; readyAt: Date | null; collectedAt: Date | null; cancelReason: string | null
  posSaleId: string | null
  lines: { id: string; kind: string; productId: string | null; description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; total: Prisma.Decimal }[]
}): JobCardRow {
  const total = j.lines.reduce((a, l) => a.add(l.total), D(0))
  return {
    id: j.id,
    reference: j.reference,
    status: j.status as JobCardRow["status"],
    customerName: j.customerName,
    customerPhone: j.customerPhone,
    itemDescription: j.itemDescription,
    itemIdentifier: j.itemIdentifier,
    faultReported: j.faultReported,
    accessories: j.accessories,
    quotedAmount: j.quotedAmount === null ? null : money(j.quotedAmount),
    depositPaid: money(j.depositPaid),
    assignedToName: j.assignedToName,
    promisedAt: j.promisedAt?.toISOString() ?? null,
    notes: j.notes,
    receivedAt: j.receivedAt.toISOString(),
    readyAt: j.readyAt?.toISOString() ?? null,
    collectedAt: j.collectedAt?.toISOString() ?? null,
    cancelReason: j.cancelReason,
    posSaleId: j.posSaleId,
    lines: j.lines.map((l) => ({
      id: l.id,
      kind: l.kind as "LABOUR" | "PART",
      productId: l.productId,
      description: l.description,
      quantity: qty(l.quantity),
      unitPrice: money(l.unitPrice),
      total: money(l.total),
    })),
    total: money(total),
    balanceDue: money(Prisma.Decimal.max(D(0), total.sub(j.depositPaid))),
  }
}

// ------------------------------------------------------------------- reading

export async function getJobCards(
  input?: { status?: string | null; staffId?: string | null },
): Promise<JobCardRow[]> {
  const g = await gate("till.sell", input?.staffId)
  if (!g.ok) return []

  const status = input?.status
  const rows = await db.posJobCard.findMany({
    where: {
      shopkeeperId: g.shopkeeperId,
      ...(status && status !== "ALL" ? { status: status as never } : {}),
    },
    // Open work first. A finished job is history; a job somebody is waiting
    // on is the reason this page is open.
    orderBy: [{ status: "asc" }, { receivedAt: "desc" }],
    take: 200,
    include: { lines: { orderBy: { createdAt: "asc" } } },
  })
  return rows.map(toRow)
}

export type JobResult = { success: true; id: string } | { success: false; error: string }

// ------------------------------------------------------------------- writing

const createSchema = z.object({
  customerName: z.string().trim().min(2, "Whose is it?"),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  itemDescription: z.string().trim().min(2, "Say what was left with you."),
  itemIdentifier: z.string().trim().max(120).optional().nullable(),
  faultReported: z.string().trim().max(1000).optional().nullable(),
  accessories: z.string().trim().max(500).optional().nullable(),
  quotedAmount: z.coerce.number().min(0).optional().nullable(),
  depositPaid: z.coerce.number().min(0).optional().nullable(),
  assignedToName: z.string().trim().max(120).optional().nullable(),
  promisedAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

/** Book something in. This is the counter conversation, written down. */
export async function createJobCard(input: unknown): Promise<JobResult> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const d = parsed.data

  const g = await gate("till.sell", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const last = await db.posJobCard.findFirst({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: { receivedAt: "desc" },
    select: { reference: true },
  })
  const next = last ? Number(last.reference.replace(/\D/g, "")) + 1 : 1
  const reference = "JC-" + String(Number.isFinite(next) ? next : 1).padStart(4, "0")

  const created = await db.posJobCard.create({
    data: {
      shopkeeperId: g.shopkeeperId,
      reference,
      customerName: d.customerName,
      customerPhone: d.customerPhone || null,
      itemDescription: d.itemDescription,
      itemIdentifier: d.itemIdentifier || null,
      faultReported: d.faultReported || null,
      accessories: d.accessories || null,
      quotedAmount: d.quotedAmount == null ? null : D(d.quotedAmount),
      depositPaid: D(d.depositPaid ?? 0),
      assignedToName: d.assignedToName || null,
      promisedAt: d.promisedAt ? new Date(d.promisedAt) : null,
      notes: d.notes || null,
      createdByUserId: g.actor.userId ?? null,
      createdByName: g.actor.name,
    },
    select: { id: true },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "job.create",
    entityType: "job_card",
    entityId: created.id,
    summary: "Booked in " + reference + ": " + d.itemDescription + " for " + d.customerName,
  })

  return { success: true, id: created.id }
}

const lineSchema = z.object({
  jobId: z.string().min(1),
  kind: z.enum(["LABOUR", "PART"]),
  productId: z.string().trim().optional().nullable(),
  description: z.string().trim().min(2, "Say what this is."),
  quantity: z.coerce.number().positive("How many?"),
  unitPrice: z.coerce.number().min(0),
  staffId: z.string().optional().nullable(),
})

/** Add an hour of labour, or a part off the shelf. */
export async function addJobLine(input: unknown): Promise<JobResult> {
  const parsed = lineSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const d = parsed.data

  const g = await gate("till.sell", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const job = await db.posJobCard.findFirst({
    where: { id: d.jobId, shopkeeperId: g.shopkeeperId },
    select: { id: true, status: true, reference: true },
  })
  if (!job) return { success: false, error: "That job was not found." }
  // A collected job has a sale against it. Adding to it afterwards would make
  // the job and the receipt disagree, and the receipt is the one the customer
  // is holding.
  if (job.status === "COLLECTED") {
    return { success: false, error: "Job " + job.reference + " has been collected and paid for." }
  }
  if (job.status === "CANCELLED") {
    return { success: false, error: "Job " + job.reference + " was cancelled." }
  }

  // A part must be this shop's own product, scoped on both columns, for the
  // same reason the ledger scopes movements: an id arriving from a browser is
  // not evidence of anything.
  if (d.kind === "PART" && d.productId) {
    const owned = await db.product.findFirst({
      where: { id: d.productId, shopkeeperId: g.shopkeeperId },
      select: { id: true },
    })
    if (!owned) return { success: false, error: "That product is not in this shop's catalogue." }
  }

  const line = await db.posJobLine.create({
    data: {
      jobId: d.jobId,
      kind: d.kind,
      productId: d.kind === "PART" ? d.productId || null : null,
      description: d.description,
      quantity: D(d.quantity),
      unitPrice: D(d.unitPrice),
      total: D(d.quantity).mul(D(d.unitPrice)),
    },
    select: { id: true },
  })

  return { success: true, id: line.id }
}

const removeLineSchema = z.object({
  lineId: z.string().min(1),
  staffId: z.string().optional().nullable(),
})

export async function removeJobLine(input: unknown): Promise<JobResult> {
  const parsed = removeLineSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the details." }
  const { lineId, staffId } = parsed.data

  const g = await gate("till.sell", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const line = await db.posJobLine.findFirst({
    where: { id: lineId, job: { shopkeeperId: g.shopkeeperId } },
    select: { id: true, job: { select: { status: true, reference: true } } },
  })
  if (!line) return { success: false, error: "That line was not found." }
  if (line.job.status === "COLLECTED") {
    return { success: false, error: "Job " + line.job.reference + " has been collected and paid for." }
  }

  await db.posJobLine.delete({ where: { id: lineId } })
  return { success: true, id: lineId }
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["IN_PROGRESS", "READY", "CANCELLED"]),
  reason: z.string().trim().max(300).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

/** Move a job along. Collection is separate, because it takes money. */
export async function setJobStatus(input: unknown): Promise<JobResult> {
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the details." }
  const { id, status, reason, staffId } = parsed.data

  const g = await gate("till.sell", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const job = await db.posJobCard.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    select: { status: true, reference: true },
  })
  if (!job) return { success: false, error: "That job was not found." }
  if (job.status === "COLLECTED") {
    return { success: false, error: "Job " + job.reference + " has already been collected." }
  }
  if (status === "CANCELLED" && !reason) {
    return { success: false, error: "Say why the job is being cancelled." }
  }

  const now = new Date()
  await db.posJobCard.update({
    where: { id },
    data: {
      status,
      startedAt: status === "IN_PROGRESS" ? now : undefined,
      readyAt: status === "READY" ? now : undefined,
      cancelledAt: status === "CANCELLED" ? now : undefined,
      cancelReason: status === "CANCELLED" ? reason : undefined,
    },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "job.status",
    entityType: "job_card",
    entityId: id,
    summary: "Job " + job.reference + " is now " + status.toLowerCase().replace("_", " ") +
      (reason ? ": " + reason : ""),
  })

  return { success: true, id }
}

const collectSchema = z.object({
  id: z.string().min(1),
  paymentMethod: z.enum(["CASH", "MPESA", "CARD", "BANK", "CREDIT"]).default("CASH"),
  amountPaid: z.coerce.number().min(0),
  reference: z.string().trim().max(120).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

/**
 * Hand the work back and take the money.
 *
 * The only place a job becomes revenue. Raises a real PosSale so that a job
 * appears in the day's takings, the shift reconciliation and every report
 * alongside counter sales, rather than in a separate set of figures nobody
 * reconciles. Parts leave stock here, through the same ledger every other
 * sale uses.
 */
export async function collectJob(input: unknown): Promise<JobResult> {
  const parsed = collectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { id, paymentMethod, amountPaid, reference, staffId } = parsed.data

  const g = await gate("till.sell", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const job = await db.posJobCard.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    include: { lines: true },
  })
  if (!job) return { success: false, error: "That job was not found." }
  if (job.status === "COLLECTED") {
    return { success: false, error: "Job " + job.reference + " has already been collected." }
  }
  if (job.status === "CANCELLED") {
    return { success: false, error: "Job " + job.reference + " was cancelled." }
  }
  if (job.lines.length === 0) {
    return { success: false, error: "Add the work and parts before collecting, or there is nothing to charge for." }
  }

  const total = job.lines.reduce((a, l) => a.add(l.total), D(0))
  const due = Prisma.Decimal.max(D(0), total.sub(job.depositPaid))
  const paid = D(amountPaid)
  // Credit is the shop lending, which is a decision, not an accident. Every
  // other method has to cover what is owed or the drawer will not reconcile.
  if (paymentMethod !== "CREDIT" && paid.lessThan(due)) {
    return {
      success: false,
      error: "That is less than the " + due.toFixed(2) + " still owed on this job.",
    }
  }

  const shift = await db.tillSession.findFirst({
    where: { shopkeeperId: g.shopkeeperId, closedAt: null },
    orderBy: { openedAt: "desc" },
    select: { id: true },
  })

  const now = new Date()
  let saleId = ""

  try {
    await db.$transaction(
      async (tx) => {
        const last = await tx.posSale.findFirst({
          where: { shopkeeperId: g.shopkeeperId },
          orderBy: { createdAt: "desc" },
          select: { saleNumber: true },
        })
        const n = last ? Number(last.saleNumber.replace(/\D/g, "")) + 1 : 1
        const saleNumber = String(Number.isFinite(n) ? n : 1).padStart(4, "0")

        const sale = await tx.posSale.create({
          data: {
            shopkeeperId: g.shopkeeperId,
            saleNumber,
            tillSessionId: shift?.id ?? null,
            cashierUserId: g.actor.userId ?? null,
            cashierName: g.actor.name,
            subtotal: total,
            total,
            // The deposit was taken when the job was booked in, so the drawer
            // only sees the balance now. Recording the full total as cash
            // here would overstate the shift by the deposit.
            amountPaid: paymentMethod === "CREDIT" ? D(0) : paid,
            changeGiven: paymentMethod === "CREDIT" ? D(0) : Prisma.Decimal.max(D(0), paid.sub(due)),
            status: "COMPLETED",
            paymentMethod,
            customerName: job.customerName,
            customerPhone: job.customerPhone,
            posCustomerId: job.posCustomerId,
            occurredAt: now,
            syncedAt: now,
            items: {
              create: job.lines.map((l) => ({
                productId: l.productId,
                name: l.description,
                quantity: l.quantity,
                unit: "piece",
                unitPrice: l.unitPrice,
                totalPrice: l.total,
              })),
            },
            payments: {
              create: [{ method: paymentMethod, amount: paymentMethod === "CREDIT" ? due : paid, reference: reference || null }],
            },
          },
          select: { id: true },
        })
        saleId = sale.id

        // Parts leave stock. Labour does not exist on a shelf.
        for (const [i, l] of job.lines.entries()) {
          if (l.kind !== "PART" || !l.productId) continue
          const moved = await recordStockMovement(tx as never, {
            shopkeeperId: g.shopkeeperId,
            productId: l.productId,
            kind: "SALE",
            quantity: l.quantity.negated(),
            unit: "piece",
            posSaleId: sale.id,
            actorUserId: g.actor.userId ?? null,
            idempotencyKey: "job:" + job.id + ":L" + i,
            occurredAt: now,
          } as never)
          if (!moved.ok) {
            // Rolls the whole collection back. A receipt the shop cannot
            // account for is worse than a refused collection, exactly as at
            // the till.
            throw new Error(l.description + " could not be taken out of stock. Nothing was recorded.")
          }
        }

        await tx.posJobCard.update({
          where: { id },
          data: { status: "COLLECTED", collectedAt: now, posSaleId: sale.id },
        })
      },
      { timeout: 60000, maxWait: 15000 },
    )
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "The job could not be collected, so nothing was recorded.",
    }
  }

  await recordPosAudit({
    actor: g.actor,
    action: "job.collect",
    entityType: "job_card",
    entityId: id,
    summary: "Collected " + job.reference + " for " + total.toFixed(2),
  })

  return { success: true, id: saleId }
}
