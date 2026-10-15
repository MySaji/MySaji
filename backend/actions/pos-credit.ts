"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"

/**
 * Selling on the book.
 *
 * WHAT WAS WRONG BEFORE
 *
 * CREDIT was already one of the till's payment methods, and it did nothing.
 * A cashier could ring up any amount against it, forever, and the system kept
 * no record of who owed what. The money simply left the shop and the figure
 * lived in somebody's head or a exercise book under the counter.
 *
 * WHY A LEDGER
 *
 * The whole point of credit is the argument six weeks later about whether
 * something was paid. A balance column answers "how much" and can never
 * answer "why". PosCreditEntry is the evidence; PosCustomer.creditBalance is
 * the fast figure the till checks a limit against mid-queue.
 *
 * WHY A LIMIT OF ZERO IS THE DEFAULT
 *
 * A shop extends credit to people it knows, deliberately, one at a time.
 * Defaulting every walk-in to some allowance is how a duka discovers it is
 * owed two hundred thousand shillings by people it cannot name.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

export type CreditEntryRow = {
  id: string
  kind: "CHARGE" | "PAYMENT" | "ADJUSTMENT"
  amount: number
  balanceAfter: number | null
  reference: string | null
  note: string | null
  dueOn: string | null
  occurredAt: string
  recordedBy: string | null
  voided: boolean
}

export type CustomerCreditRow = {
  id: string
  name: string
  phone: string
  creditLimit: number
  balance: number
  /** limit less balance, floored at zero. What they may still spend. */
  available: number
  termDays: number
  /** Of the balance, what is past its due date. */
  overdue: number
  oldestOverdueDays: number | null
}

/** Everyone who either owes something or is allowed to. */
export async function getCreditCustomers(staffId?: string | null): Promise<CustomerCreditRow[]> {
  const g = await gate("report.sales", staffId)
  if (!g.ok) return []

  const customers = await db.posCustomer.findMany({
    where: {
      shopkeeperId: g.shopkeeperId,
      OR: [{ creditLimit: { gt: 0 } }, { creditBalance: { not: 0 } }],
    },
    orderBy: { creditBalance: "desc" },
    take: 500,
  })
  if (customers.length === 0) return []

  const now = new Date()
  const overdueRows = await db.posCreditEntry.findMany({
    where: {
      shopkeeperId: g.shopkeeperId,
      kind: "CHARGE",
      voidedAt: null,
      dueOn: { lt: now },
      posCustomerId: { in: customers.map((c) => c.id) },
    },
    select: { posCustomerId: true, amount: true, dueOn: true },
  })

  // A charge is overdue, a payment is not against any particular charge, so
  // the honest reading is: of what they owe, how much is older than the
  // terms. Payments are applied oldest first, which is what a shopkeeper
  // means when they say "he has paid something off".
  const byCustomer = new Map<string, { overdueCharges: Prisma.Decimal; oldest: Date | null }>()
  for (const r of overdueRows) {
    const acc = byCustomer.get(r.posCustomerId) ?? { overdueCharges: D(0), oldest: null }
    acc.overdueCharges = acc.overdueCharges.add(r.amount)
    if (r.dueOn && (!acc.oldest || r.dueOn < acc.oldest)) acc.oldest = r.dueOn
    byCustomer.set(r.posCustomerId, acc)
  }

  return customers.map((c) => {
    const acc = byCustomer.get(c.id)
    const balance = D(c.creditBalance)
    // Never more than they actually owe: a customer who has paid everything
    // off is not overdue on a charge that is already settled.
    const overdue = acc ? Prisma.Decimal.min(acc.overdueCharges, Prisma.Decimal.max(balance, D(0))) : D(0)
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      creditLimit: money(D(c.creditLimit)),
      balance: money(balance),
      available: money(Prisma.Decimal.max(D(0), D(c.creditLimit).sub(balance))),
      termDays: c.creditTermDays,
      overdue: money(overdue),
      oldestOverdueDays:
        acc?.oldest && overdue.greaterThan(0)
          ? Math.floor((now.getTime() - acc.oldest.getTime()) / 86400000)
          : null,
    }
  })
}

/** One customer's account: the balance and how it got there. */
export async function getCustomerStatement(
  posCustomerId: string,
  staffId?: string | null,
): Promise<{ customer: CustomerCreditRow; entries: CreditEntryRow[] } | null> {
  const g = await gate("report.sales", staffId)
  if (!g.ok) return null

  const c = await db.posCustomer.findFirst({
    where: { id: posCustomerId, shopkeeperId: g.shopkeeperId },
  })
  if (!c) return null

  const entries = await db.posCreditEntry.findMany({
    where: { posCustomerId: c.id },
    orderBy: { occurredAt: "desc" },
    take: 500,
  })

  const now = new Date()
  const overdueCharges = entries
    .filter((e) => e.kind === "CHARGE" && !e.voidedAt && e.dueOn && e.dueOn < now)
    .reduce((a, e) => a.add(e.amount), D(0))
  const balance = D(c.creditBalance)

  return {
    customer: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      creditLimit: money(D(c.creditLimit)),
      balance: money(balance),
      available: money(Prisma.Decimal.max(D(0), D(c.creditLimit).sub(balance))),
      termDays: c.creditTermDays,
      overdue: money(Prisma.Decimal.min(overdueCharges, Prisma.Decimal.max(balance, D(0)))),
      oldestOverdueDays: null,
    },
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      amount: money(e.amount),
      balanceAfter: e.balanceAfter === null ? null : money(e.balanceAfter),
      reference: e.reference,
      note: e.note,
      dueOn: e.dueOn?.toISOString() ?? null,
      occurredAt: e.occurredAt.toISOString(),
      recordedBy: e.actorName,
      voided: !!e.voidedAt,
    })),
  }
}

export type CreditResult = { success: true; id: string } | { success: false; error: string }

const limitSchema = z.object({
  posCustomerId: z.string().min(1),
  creditLimit: z.coerce.number().min(0, "A limit cannot be negative."),
  creditTermDays: z.coerce.number().int().min(0).max(365).optional(),
  staffId: z.string().optional().nullable(),
})

/**
 * Decide how much somebody may owe.
 *
 * Gated on payment.settings rather than anything at the till: extending
 * credit is the owner lending the shop's money, not a counter decision.
 */
export async function setCreditLimit(input: unknown): Promise<CreditResult> {
  const parsed = limitSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { posCustomerId, creditLimit, creditTermDays, staffId } = parsed.data

  const g = await gate("payment.settings", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const c = await db.posCustomer.findFirst({
    where: { id: posCustomerId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true, creditLimit: true },
  })
  if (!c) return { success: false, error: "That customer was not found." }

  await db.posCustomer.update({
    where: { id: posCustomerId },
    data: {
      creditLimit: D(creditLimit),
      ...(creditTermDays === undefined ? {} : { creditTermDays }),
    },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "credit.limit",
    entityType: "pos_customer",
    entityId: posCustomerId,
    summary: "Credit limit for " + c.name + " set to " + creditLimit.toFixed(2) +
      " (was " + Number(c.creditLimit).toFixed(2) + ")",
  })

  return { success: true, id: posCustomerId }
}

/**
 * Can this customer take this sale on the book?
 *
 * Read-only and deliberately separate from charging, so the till can ask
 * before it commits to anything.
 */
export async function checkCreditAllowance(
  input: { posCustomerId: string; amount: number; staffId?: string | null },
): Promise<{ ok: true; available: number } | { ok: false; error: string }> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { ok: false, error: g.error }

  const c = await db.posCustomer.findFirst({
    where: { id: input.posCustomerId, shopkeeperId: g.shopkeeperId },
    select: { name: true, creditLimit: true, creditBalance: true },
  })
  if (!c) return { ok: false, error: "That customer was not found." }

  const limit = D(c.creditLimit)
  if (limit.isZero()) {
    return { ok: false, error: c.name + " is not set up for credit. Set a limit first." }
  }
  const available = limit.sub(c.creditBalance)
  if (D(input.amount).greaterThan(available)) {
    return {
      ok: false,
      error: c.name + " can take " + available.toFixed(2) + " more on the book, not " +
        D(input.amount).toFixed(2) + ".",
    }
  }
  return { ok: true, available: money(available) }
}

/**
 * Put a sale on a customer's account.
 *
 * The balance and the ledger move together in one transaction. If they could
 * drift apart, the fast figure the till trusts would start refusing or
 * allowing the wrong things, which is worse than having no limit at all.
 */
export async function chargeCredit(input: {
  posCustomerId: string
  amount: number
  posSaleId?: string | null
  note?: string | null
  staffId?: string | null
}): Promise<CreditResult> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const amount = D(input.amount)
  if (amount.lessThanOrEqualTo(0)) return { success: false, error: "A charge of nothing records nothing." }

  const c = await db.posCustomer.findFirst({
    where: { id: input.posCustomerId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true, creditLimit: true, creditBalance: true, creditTermDays: true },
  })
  if (!c) return { success: false, error: "That customer was not found." }

  const limit = D(c.creditLimit)
  if (limit.isZero()) {
    return { success: false, error: c.name + " is not set up for credit. Set a limit first." }
  }
  const after = D(c.creditBalance).add(amount)
  // Checked here as well as in checkCreditAllowance, because the allowance
  // call and the charge are two moments and another till may have used the
  // headroom in between.
  if (after.greaterThan(limit)) {
    return {
      success: false,
      error: c.name + " would be over their " + limit.toFixed(2) + " limit. They can take " +
        limit.sub(c.creditBalance).toFixed(2) + " more.",
    }
  }

  const dueOn = new Date()
  dueOn.setDate(dueOn.getDate() + c.creditTermDays)

  const entry = await db.$transaction(async (tx) => {
    const row = await tx.posCreditEntry.create({
      data: {
        shopkeeperId: g.shopkeeperId,
        posCustomerId: c.id,
        kind: "CHARGE",
        amount,
        balanceAfter: after,
        posSaleId: input.posSaleId ?? null,
        note: input.note ?? null,
        dueOn,
        actorUserId: g.actor.userId ?? null,
        actorName: g.actor.name,
      },
      select: { id: true },
    })
    await tx.posCustomer.update({
      where: { id: c.id },
      data: { creditBalance: after },
    })
    return row
  })

  return { success: true, id: entry.id }
}

const paymentSchema = z.object({
  posCustomerId: z.string().min(1),
  amount: z.coerce.number().positive("How much did they pay?"),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
  staffId: z.string().optional().nullable(),
})

/** Money received against the account. */
export async function recordCreditPayment(input: unknown): Promise<CreditResult> {
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { posCustomerId, amount, reference, note, staffId } = parsed.data

  const g = await gate("till.sell", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const c = await db.posCustomer.findFirst({
    where: { id: posCustomerId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true, creditBalance: true },
  })
  if (!c) return { success: false, error: "That customer was not found." }

  const balance = D(c.creditBalance)
  // Refused rather than quietly creating a negative balance. A customer who
  // overpays has either paid twice or is leaving a deposit, and those are
  // different conversations that should not look identical afterwards.
  if (D(amount).greaterThan(balance)) {
    return {
      success: false,
      error: c.name + " only owes " + balance.toFixed(2) + ". Take the rest as a deposit or a sale instead.",
    }
  }

  const after = balance.sub(D(amount))
  const entry = await db.$transaction(async (tx) => {
    const row = await tx.posCreditEntry.create({
      data: {
        shopkeeperId: g.shopkeeperId,
        posCustomerId: c.id,
        kind: "PAYMENT",
        amount: D(amount).neg(),
        balanceAfter: after,
        reference: reference || null,
        note: note || null,
        actorUserId: g.actor.userId ?? null,
        actorName: g.actor.name,
      },
      select: { id: true },
    })
    await tx.posCustomer.update({ where: { id: c.id }, data: { creditBalance: after } })
    return row
  })

  await recordPosAudit({
    actor: g.actor,
    action: "credit.payment",
    entityType: "pos_customer",
    entityId: c.id,
    summary: c.name + " paid " + amount.toFixed(2) + " off their account",
  })

  return { success: true, id: entry.id }
}

const adjustSchema = z.object({
  posCustomerId: z.string().min(1),
  /** Signed: negative writes debt off, positive adds it back. */
  amount: z.coerce.number(),
  reason: z.string().trim().min(3, "Say why the account is being adjusted."),
  staffId: z.string().optional().nullable(),
})

/**
 * Correct or write off a balance.
 *
 * Gated higher than a payment: forgiving a debt is giving money away, and the
 * commonest way a book is quietly cleaned up is somebody adjusting their own
 * mistakes away.
 */
export async function adjustCredit(input: unknown): Promise<CreditResult> {
  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { posCustomerId, amount, reason, staffId } = parsed.data
  if (amount === 0) return { success: false, error: "An adjustment of nothing changes nothing." }

  const g = await gate("payment.settings", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const c = await db.posCustomer.findFirst({
    where: { id: posCustomerId, shopkeeperId: g.shopkeeperId },
    select: { id: true, name: true, creditBalance: true },
  })
  if (!c) return { success: false, error: "That customer was not found." }

  const after = Prisma.Decimal.max(D(0), D(c.creditBalance).add(D(amount)))
  const entry = await db.$transaction(async (tx) => {
    const row = await tx.posCreditEntry.create({
      data: {
        shopkeeperId: g.shopkeeperId,
        posCustomerId: c.id,
        kind: "ADJUSTMENT",
        amount: D(amount),
        balanceAfter: after,
        note: reason,
        actorUserId: g.actor.userId ?? null,
        actorName: g.actor.name,
      },
      select: { id: true },
    })
    await tx.posCustomer.update({ where: { id: c.id }, data: { creditBalance: after } })
    return row
  })

  await recordPosAudit({
    actor: g.actor,
    action: "credit.adjust",
    entityType: "pos_customer",
    entityId: c.id,
    summary: "Adjusted " + c.name + " by " + amount.toFixed(2) + ": " + reason,
  })

  return { success: true, id: entry.id }
}

export type AgeingBucket = {
  label: string
  amount: number
  customers: number
}

/**
 * What is owed, by how late it is.
 *
 * Buckets rather than a list, because the question a shopkeeper is asking is
 * "how worried should I be", and a hundred names does not answer it.
 */
export async function getCreditAgeing(staffId?: string | null): Promise<AgeingBucket[]> {
  const g = await gate("report.sales", staffId)
  if (!g.ok) return []

  const charges = await db.posCreditEntry.findMany({
    where: { shopkeeperId: g.shopkeeperId, kind: "CHARGE", voidedAt: null },
    select: { posCustomerId: true, amount: true, dueOn: true },
  })
  if (charges.length === 0) return []

  // Payments are applied to the oldest charge first, which is what a shop
  // means by paying something off. Without that, every payment would look
  // like it cleared the newest invoice and nothing would ever age.
  const paid = await db.posCreditEntry.groupBy({
    by: ["posCustomerId"],
    where: { shopkeeperId: g.shopkeeperId, kind: { in: ["PAYMENT", "ADJUSTMENT"] }, voidedAt: null },
    _sum: { amount: true },
  })
  const credited = new Map(paid.map((p) => [p.posCustomerId, D(p._sum.amount ?? 0).neg()]))

  const now = Date.now()
  const buckets: { label: string; max: number; amount: Prisma.Decimal; who: Set<string> }[] = [
    { label: "Not yet due", max: 0, amount: D(0), who: new Set() },
    { label: "1 to 30 days", max: 30, amount: D(0), who: new Set() },
    { label: "31 to 60 days", max: 60, amount: D(0), who: new Set() },
    { label: "61 to 90 days", max: 90, amount: D(0), who: new Set() },
    { label: "Over 90 days", max: Infinity, amount: D(0), who: new Set() },
  ]

  const byCustomer = new Map<string, typeof charges>()
  for (const ch of charges) {
    const list = byCustomer.get(ch.posCustomerId) ?? []
    list.push(ch)
    byCustomer.set(ch.posCustomerId, list)
  }

  for (const [customerId, list] of byCustomer) {
    let remainingCredit = credited.get(customerId) ?? D(0)
    const oldestFirst = [...list].sort(
      (a, b) => (a.dueOn?.getTime() ?? 0) - (b.dueOn?.getTime() ?? 0),
    )
    for (const ch of oldestFirst) {
      let outstanding = D(ch.amount)
      if (remainingCredit.greaterThan(0)) {
        const applied = Prisma.Decimal.min(remainingCredit, outstanding)
        outstanding = outstanding.sub(applied)
        remainingCredit = remainingCredit.sub(applied)
      }
      if (outstanding.lessThanOrEqualTo(0)) continue

      const daysLate = ch.dueOn ? Math.floor((now - ch.dueOn.getTime()) / 86400000) : 0
      const bucket =
        daysLate <= 0 ? buckets[0]
          : daysLate <= 30 ? buckets[1]
          : daysLate <= 60 ? buckets[2]
          : daysLate <= 90 ? buckets[3]
          : buckets[4]
      bucket.amount = bucket.amount.add(outstanding)
      bucket.who.add(customerId)
    }
  }

  return buckets
    .filter((b) => b.amount.greaterThan(0))
    .map((b) => ({ label: b.label, amount: money(b.amount), customers: b.who.size }))
}
