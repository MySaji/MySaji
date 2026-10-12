"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/actions/pos-access"
import {
  POS_EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type PosExpenseCategoryKey,
} from "@/backend/domain/pos-expense-categories"

/**
 * What the shop spends that is not stock.
 *
 * WHY A TILL NEEDS THIS AT ALL
 *
 * A till that counts only sales answers half the question. A shopkeeper who
 * took eighty thousand this month and does not know they spent sixty two on
 * rent, power, salaries and transport does not know whether the month was
 * good. The sales side of this product has been able to say what came in
 * since the first week; this is the side that says what was kept.
 *
 * WHY STOCK IS NOT AN EXPENSE HERE
 *
 * Goods bought for resale already exist twice over: as a purchase order and
 * as a stock movement with a cost on it. Recording them here as well would
 * count the same money against the same month twice, and the figure that
 * came out would be worse than no figure at all. The categories offered are
 * deliberately the ones that are NOT stock, and the page says so.
 *
 * WHY NOTHING IS EVER DELETED
 *
 * An expense that has appeared in a month's figures and then quietly
 * vanishes is how those figures stop being believed. A mistake is cancelled
 * with a reason, by somebody named, and stays on the record.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

// ------------------------------------------------------------------- reading

export type ExpenseRow = {
  id: string
  category: PosExpenseCategoryKey
  categoryLabel: string
  description: string
  amount: number
  paidWith: string
  payee: string | null
  reference: string | null
  recordedBy: string
  occurredAt: string
  voided: boolean
  voidReason: string | null
  voidedBy: string | null
}

export type ExpenseSlice = {
  category: PosExpenseCategoryKey
  label: string
  amount: number
  /** Share of the month's spending, as a whole percentage. */
  share: number
  count: number
}

export type ExpenseView = {
  /** The month being looked at, as YYYY-MM. */
  month: string
  rows: ExpenseRow[]
  /** What was spent in the month, ignoring anything cancelled. */
  spent: number
  /** What was taken over the counter in the same month. */
  sales: number
  /** What the goods sold cost, where costs are known. */
  costOfGoods: number
  /**
   * Sales, less what the goods cost, less these expenses.
   *
   * Called what it is rather than "profit": it is only as true as the cost
   * prices behind it, and the page says how many products have none.
   */
  kept: number
  /** How many sold products had no cost recorded, so costOfGoods is partial. */
  salesWithoutCost: number
  byCategory: ExpenseSlice[]
  canManage: boolean
} | null

/** The months that actually have something in them, newest first. */
export async function getExpenseMonths(input?: unknown): Promise<string[]> {
  const parsed = z.object({ staffId: z.string().trim().max(60).optional() }).safeParse(input ?? {})
  const g = await gate("expense.view", parsed.success ? parsed.data.staffId : undefined)
  if (!g.ok) return []

  const rows = await db.posExpense.findMany({
    where: { shopkeeperId: g.shopkeeperId },
    select: { occurredAt: true },
    orderBy: { occurredAt: "desc" },
    take: 500,
  })
  const months = new Set<string>()
  for (const r of rows) months.add(r.occurredAt.toISOString().slice(0, 7))
  // The current month always appears, even before anything is in it, so a
  // shop that has just started recording has somewhere to look.
  months.add(new Date().toISOString().slice(0, 7))
  return [...months].sort().reverse()
}

export async function getExpenses(input?: unknown): Promise<ExpenseView> {
  const parsed = z.object({
    month: z.string().trim().regex(/^\d{4}-\d{2}$/).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input ?? {})
  if (!parsed.success) return null

  const g = await gate("expense.view", parsed.data.staffId)
  if (!g.ok) return null

  const month = parsed.data.month ?? new Date().toISOString().slice(0, 7)
  const from = new Date(month + "-01T00:00:00.000Z")
  const to = new Date(from)
  to.setUTCMonth(to.getUTCMonth() + 1)

  const [expenses, sales] = await Promise.all([
    db.posExpense.findMany({
      where: { shopkeeperId: g.shopkeeperId, occurredAt: { gte: from, lt: to } },
      orderBy: { occurredAt: "desc" },
    }),
    // Only sales that stand: a voided sale is not takings.
    db.posSale.findMany({
      where: {
        shopkeeperId: g.shopkeeperId,
        occurredAt: { gte: from, lt: to },
        // A cancelled sale is not takings, and a parked one has not been
        // paid for yet.
        status: { notIn: ["VOIDED", "PARKED"] },
      },
      select: {
        total: true,
        items: { select: { quantity: true, costAtSale: true } },
      },
    }),
  ])

  const spent = expenses
    .filter((e) => e.voidedAt === null)
    .reduce((t, e) => t.plus(e.amount), D(0))

  let takings = D(0)
  let cogs = D(0)
  let noCost = 0
  for (const sale of sales) {
    takings = takings.plus(sale.total)
    for (const item of sale.items) {
      if (item.costAtSale === null) { noCost++; continue }
      cogs = cogs.plus(D(item.costAtSale).times(D(item.quantity)))
    }
  }

  const byCategory: ExpenseSlice[] = POS_EXPENSE_CATEGORIES
    .map((key) => {
      const mine = expenses.filter((e) => e.category === key && e.voidedAt === null)
      const amount = mine.reduce((t, e) => t.plus(e.amount), D(0))
      return {
        category: key,
        label: EXPENSE_CATEGORY_LABEL[key],
        amount: money(amount),
        share: spent.greaterThan(0) ? Math.round(Number(amount.dividedBy(spent).times(100).toString())) : 0,
        count: mine.length,
      }
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.amount - a.amount)

  return {
    month,
    rows: expenses.map((e) => ({
      id: e.id,
      category: e.category as PosExpenseCategoryKey,
      categoryLabel: EXPENSE_CATEGORY_LABEL[e.category as PosExpenseCategoryKey] ?? e.category,
      description: e.description,
      amount: money(e.amount),
      paidWith: e.paidWith,
      payee: e.payee,
      reference: e.reference,
      recordedBy: e.recordedByName ?? "Somebody",
      occurredAt: e.occurredAt.toISOString(),
      voided: e.voidedAt !== null,
      voidReason: e.voidReason,
      voidedBy: e.voidedByName,
    })),
    spent: money(spent),
    sales: money(takings),
    costOfGoods: money(cogs),
    kept: money(takings.minus(cogs).minus(spent)),
    salesWithoutCost: noCost,
    byCategory,
    canManage: g.actor.can("expense.manage"),
  }
}

// ------------------------------------------------------------------- writing

export type ExpenseResult = { success: true; expenseId: string } | { success: false; error: string }

export async function recordExpense(input: unknown): Promise<ExpenseResult> {
  const parsed = z.object({
    category: z.enum(POS_EXPENSE_CATEGORIES as unknown as [string, ...string[]]),
    description: z.string().trim().min(2, "Say what it was for").max(200),
    amount: z.number().positive("An expense of nothing is not an expense").max(100_000_000),
    paidWith: z.enum(["CASH", "MPESA", "CARD", "BANK", "CREDIT"]).optional(),
    payee: z.string().trim().max(120).optional(),
    reference: z.string().trim().max(80).optional(),
    /** YYYY-MM-DD. Defaults to today. */
    occurredOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form" }
  const body = parsed.data

  const g = await gate("expense.manage", body.staffId)
  if (!g.ok) return { success: false, error: g.error }

  // A date in the future is almost always a typing slip, and one that lands
  // in next month's figures is a slip nobody notices until next month.
  const occurredAt = body.occurredOn ? new Date(body.occurredOn + "T12:00:00.000Z") : new Date()
  if (occurredAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return { success: false, error: "That date is in the future." }
  }

  const created = await db.posExpense.create({
    data: {
      shopkeeperId: g.shopkeeperId,
      category: body.category as never,
      description: body.description,
      amount: D(body.amount),
      paidWith: (body.paidWith ?? "CASH") as never,
      payee: body.payee && body.payee.length > 0 ? body.payee : null,
      reference: body.reference && body.reference.length > 0 ? body.reference : null,
      recordedByUserId: g.actor.userId,
      recordedByStaffId: g.actor.staffId,
      recordedByName: g.actor.name,
      occurredAt,
    },
    select: { id: true },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "expense.record",
    summary: g.actor.name + " recorded KSh " + body.amount.toFixed(2) + " for " + body.description,
    entityType: "expense",
    entityId: created.id,
    detail: { category: body.category, amount: body.amount, paidWith: body.paidWith ?? "CASH" },
  })

  return { success: true, expenseId: created.id }
}

/**
 * Cancel one that was wrong.
 *
 * The reason is required and is not a formality: in a month's time the only
 * thing that explains a cancelled row is what somebody wrote on it.
 */
export async function voidExpense(input: unknown): Promise<ExpenseResult> {
  const parsed = z.object({
    expenseId: z.string().trim().min(1),
    reason: z.string().trim().min(3, "Say why it is being cancelled").max(200),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Give a reason" }
  const body = parsed.data

  const g = await gate("expense.manage", body.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const expense = await db.posExpense.findFirst({
    where: { id: body.expenseId, shopkeeperId: g.shopkeeperId },
    select: { id: true, description: true, amount: true, voidedAt: true },
  })
  if (!expense) return { success: false, error: "That expense is not in this shop." }
  if (expense.voidedAt !== null) return { success: false, error: "That one is already cancelled." }

  await db.posExpense.update({
    where: { id: expense.id },
    data: { voidedAt: new Date(), voidReason: body.reason, voidedByName: g.actor.name },
  })

  await recordPosAudit({
    actor: g.actor,
    action: "expense.void",
    summary: g.actor.name + " cancelled KSh " + Number(expense.amount).toFixed(2) + " for " + expense.description,
    entityType: "expense",
    entityId: expense.id,
    detail: { reason: body.reason },
  })

  return { success: true, expenseId: expense.id }
}

/**
 * The same expense again, for the month that has just started.
 *
 * Rent, power and salaries are the same lines every month, and a shopkeeper
 * who has to retype them four times before breakfast records them nowhere.
 * Copying is deliberate rather than automatic: an amount that has quietly
 * posted itself is one nobody checked.
 */
export async function repeatExpense(input: unknown): Promise<ExpenseResult> {
  const parsed = z.object({
    expenseId: z.string().trim().min(1),
    /** YYYY-MM-DD for the new one. Defaults to today. */
    occurredOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    amount: z.number().positive().max(100_000_000).optional(),
    staffId: z.string().trim().max(60).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const body = parsed.data

  const g = await gate("expense.manage", body.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const source = await db.posExpense.findFirst({
    where: { id: body.expenseId, shopkeeperId: g.shopkeeperId },
  })
  if (!source) return { success: false, error: "That expense is not in this shop." }

  return recordExpense({
    category: source.category,
    description: source.description,
    amount: body.amount ?? Number(source.amount.toString()),
    paidWith: source.paidWith === "SPLIT" ? "CASH" : source.paidWith,
    ...(source.payee ? { payee: source.payee } : {}),
    ...(body.occurredOn ? { occurredOn: body.occurredOn } : {}),
    ...(body.staffId ? { staffId: body.staffId } : {}),
  })
}
