"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"

/**
 * Money into and out of the drawer that is not a sale.
 *
 * WHY A TILL NEEDS THIS
 *
 * A shift could already say what it sold and what was counted at the end,
 * and the gap between those two was called a variance. But a real counter
 * pays the boda who brought the delivery, sends a float to the bank at
 * lunchtime, borrows change from the shop next door and hands the owner
 * their lunch money. None of that is a sale, all of it moves cash, and with
 * nowhere to record it every one of those became an unexplained variance.
 *
 * An unexplained variance is quickly an ignored variance, and once a shop
 * ignores its variances the close-of-shift count stops being a control at
 * all. This is the difference between "we were 1,400 short again" and "we
 * paid 1,400 to the transporter at 11:20, here is who recorded it".
 *
 * WHY THE AMOUNT IS SIGNED
 *
 * Same reason StockMovement.quantity is signed: expected cash becomes a
 * plain sum over the opening float, the cash taken and these movements, and
 * cannot be got wrong by forgetting to branch on the kind somewhere.
 *
 * WHY NOTHING IS DELETED
 *
 * Same rule as PosExpense. A movement that appeared in a shift's
 * reconciliation and then vanished is how a till's numbers stop being
 * believed. A mistake is cancelled, with a reason, by somebody named.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

export type CashMovementRow = {
  id: string
  kind: "PAY_IN" | "PAY_OUT"
  /** Always positive, for reading. The sign lives in the stored amount. */
  amount: number
  reason: string
  reference: string | null
  recordedBy: string
  occurredAt: string
  voided: boolean
  voidReason: string | null
}

export type ShiftCashSummary = {
  /** Null when no shift is open, which is when none of this applies. */
  shiftId: string | null
  openedAt: string | null
  openingFloat: number
  /** Cash tendered on sales during this shift, less change given. */
  cashFromSales: number
  paidIn: number
  paidOut: number
  /** float + cash sales + paid in - paid out. What should be in the drawer. */
  expectedCash: number
  movements: CashMovementRow[]
}

/** The open shift's cash position, and every movement on it. */
export async function getShiftCash(staffId?: string | null): Promise<ShiftCashSummary | null> {
  const g = await gate("till.open_shift", staffId)
  if (!g.ok) return null

  const shift = await db.tillSession.findFirst({
    where: { shopkeeperId: g.shopkeeperId, closedAt: null },
    orderBy: { openedAt: "desc" },
  })
  if (!shift) {
    return {
      shiftId: null, openedAt: null, openingFloat: 0, cashFromSales: 0,
      paidIn: 0, paidOut: 0, expectedCash: 0, movements: [],
    }
  }

  const [movements, cashSales] = await Promise.all([
    db.posCashMovement.findMany({
      where: { tillSessionId: shift.id },
      orderBy: { occurredAt: "desc" },
    }),
    // Only the cash actually in the drawer: the cash tenders on this shift's
    // sales, less the change handed back. An M-Pesa sale puts nothing in it.
    db.posSale.aggregate({
      where: { tillSessionId: shift.id, status: { in: ["COMPLETED", "PART_REFUNDED", "DEPOSIT"] } },
      _sum: { amountPaid: true, changeGiven: true },
    }),
  ])

  const live = movements.filter((m) => !m.voidedAt)
  const paidIn = live
    .filter((m) => m.kind === "PAY_IN")
    .reduce((a, m) => a.add(m.amount), D(0))
  const paidOut = live
    .filter((m) => m.kind === "PAY_OUT")
    .reduce((a, m) => a.add(m.amount.abs()), D(0))

  const float = D(shift.openingFloat)
  const fromSales = D(cashSales._sum.amountPaid ?? 0).sub(D(cashSales._sum.changeGiven ?? 0))

  return {
    shiftId: shift.id,
    openedAt: shift.openedAt.toISOString(),
    openingFloat: money(float),
    cashFromSales: money(fromSales),
    paidIn: money(paidIn),
    paidOut: money(paidOut),
    expectedCash: money(float.add(fromSales).add(paidIn).sub(paidOut)),
    movements: movements.map((m) => ({
      id: m.id,
      kind: m.kind,
      amount: money(m.amount.abs()),
      reason: m.reason,
      reference: m.reference,
      recordedBy: m.actorName ?? "Unknown",
      occurredAt: m.occurredAt.toISOString(),
      voided: !!m.voidedAt,
      voidReason: m.voidReason,
    })),
  }
}

const recordSchema = z.object({
  kind: z.enum(["PAY_IN", "PAY_OUT"]),
  amount: z.coerce.number().positive("Enter how much moved."),
  // A drawer movement with no reason is indistinguishable from a hand in the
  // till, which is the thing this exists to make visible.
  reason: z.string().trim().min(3, "Say what this was for."),
  reference: z.string().trim().max(120).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

export type CashActionResult = { success: true; id: string } | { success: false; error: string }

/** Record money in or out of the drawer. */
export async function recordCashMovement(input: unknown): Promise<CashActionResult> {
  const parsed = recordSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { kind, amount, reason, reference, staffId } = parsed.data

  const g = await gate("till.cash_in_out", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const shift = await db.tillSession.findFirst({
    where: { shopkeeperId: g.shopkeeperId, closedAt: null },
    orderBy: { openedAt: "desc" },
  })
  // Deliberately refused rather than recorded against nothing: cash that
  // moved outside an open shift reconciles against nothing and would simply
  // reappear as an unexplained variance on whichever shift opened next.
  if (!shift) {
    return { success: false, error: "Open a shift before recording money in or out of the drawer." }
  }

  const signed = kind === "PAY_IN" ? D(amount) : D(amount).neg()

  const row = await db.posCashMovement.create({
    data: {
      shopkeeperId: g.shopkeeperId,
      tillSessionId: shift.id,
      kind,
      amount: signed,
      reason,
      reference: reference || null,
      actorUserId: g.actor.userId ?? null,
      actorName: g.actor.name,
    },
  })

  await recordPosAudit({
    actor: g.actor,
    action: kind === "PAY_IN" ? "cash.pay_in" : "cash.pay_out",
    entityType: "cash_movement",
    entityId: row.id,
    summary: (kind === "PAY_IN" ? "Paid in " : "Paid out ") + amount.toFixed(2) + ": " + reason,
  })

  return { success: true, id: row.id }
}

const voidSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, "Say why this is being cancelled."),
  staffId: z.string().optional().nullable(),
})

/** Cancel a movement recorded in error. Never deletes it. */
export async function voidCashMovement(input: unknown): Promise<CashActionResult> {
  const parsed = voidSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { id, reason, staffId } = parsed.data

  // "till.void", not "till.close_shift". Cancelling a drawer movement rubs
  // out a figure that the reconciliation depends on, which is the same class
  // of act as voiding a sale, and a cashier who can both take money out and
  // then cancel the record of it is back to no control at all. Cashiers hold
  // till.close_shift, so gating on that would have granted exactly the thing
  // this is meant to withhold.
  const g = await gate("till.void", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const existing = await db.posCashMovement.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
    include: { tillSession: { select: { closedAt: true } } },
  })
  if (!existing) return { success: false, error: "That movement was not found." }
  if (existing.voidedAt) return { success: false, error: "That movement was already cancelled." }
  // A closed shift reported a figure. Changing its inputs afterwards would
  // rewrite a reconciliation somebody already signed off, the same rule that
  // keeps TillSession.expectedCash stored rather than recomputed.
  if (existing.tillSession.closedAt) {
    return { success: false, error: "That shift is closed. Its figures cannot be changed now." }
  }

  await db.posCashMovement.update({
    where: { id },
    data: { voidedAt: new Date(), voidReason: reason, voidedByUserId: g.actor.userId ?? null },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "cash.void",
    entityType: "cash_movement",
    entityId: id,
    summary: "Cancelled a drawer movement: " + reason,
  })

  return { success: true, id }
}
