"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin } from "@/backend/actions/admin-dashboard"
import { logAdminAction } from "@/backend/services/admin-audit-core"
import { debtStateOf, settleCommissionDebt, commissionDebtCap } from "@/backend/services/commission-debt"

/**
 * Providers who owe the platform commission.
 *
 * WHY AN ADMIN NEEDS THIS AT ALL
 *
 * Because money arrives in ways the platform cannot see. A provider hands
 * cash to an agent, sends an M-Pesa to the wrong number, or settles at the
 * office. A platform that can only accept payment through its own STK push
 * will eventually have a paid-up provider sitting blocked while support
 * explains that the system does not believe them.
 *
 * WHAT THIS IS NOT
 *
 * A way to wipe a debt quietly. Every settlement recorded here names the
 * admin who recorded it and lands in the same wallet statement the provider
 * reads, so the two sides always see the same figure.
 */

export type DebtorRow = {
  userId: string
  providerId: string | null
  name: string
  email: string
  phone: string | null
  owed: number
  /** True once they can no longer accept work. */
  blocked: boolean
  completedJobs: number
  rating: number
  lastChargeAt: string | null
}

export type DebtorsView = {
  rows: DebtorRow[]
  cap: number
  /** What is owed across every provider, which is the platform's exposure. */
  totalOwed: number
  blockedCount: number
} | null

export async function getCommissionDebtors(input?: unknown): Promise<DebtorsView> {
  const parsed = z.object({ query: z.string().trim().max(80).optional() }).safeParse(input ?? {})
  const admin = await requireAdmin()
  if (!admin) return null

  const cap = await commissionDebtCap()

  // Only wallets actually in the red. A platform with thousands of providers
  // should not read them all to find the dozen who owe something.
  const wallets = await db.wallet.findMany({
    where: { balance: { lt: 0 } },
    orderBy: { balance: "asc" },
    take: 200,
    select: {
      balance: true,
      user: {
        select: {
          id: true, name: true, email: true, phone: true,
          providerProfile: { select: { id: true, completedJobs: true, rating: true } },
        },
      },
    },
  })

  const q = (parsed.success ? parsed.data.query : "")?.toLowerCase() ?? ""
  const filtered = q
    ? wallets.filter((w) =>
        w.user.name.toLowerCase().includes(q) ||
        w.user.email.toLowerCase().includes(q) ||
        (w.user.phone ?? "").includes(q))
    : wallets

  const userIds = filtered.map((w) => w.user.id)
  const lastCharges = userIds.length
    ? await db.transaction.groupBy({
        by: ["walletId"],
        where: { referenceType: "JOB_COMMISSION", wallet: { userId: { in: userIds } } },
        _max: { createdAt: true },
      })
    : []
  const walletsById = new Map(
    (await db.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true } }))
      .map((w) => [w.id, w.userId]),
  )
  const lastByUser = new Map(
    lastCharges.map((c) => [walletsById.get(c.walletId) ?? "", c._max.createdAt]),
  )

  const rows: DebtorRow[] = filtered.map((w) => {
    const owed = Math.abs(Number(w.balance))
    const last = lastByUser.get(w.user.id)
    return {
      userId: w.user.id,
      providerId: w.user.providerProfile?.id ?? null,
      name: w.user.name,
      email: w.user.email,
      phone: w.user.phone,
      owed: Number(owed.toFixed(2)),
      blocked: cap > 0 && owed >= cap,
      completedJobs: w.user.providerProfile?.completedJobs ?? 0,
      rating: Number(w.user.providerProfile?.rating ?? 0),
      lastChargeAt: last ? last.toISOString() : null,
    }
  })

  return {
    rows,
    cap,
    totalOwed: Number(rows.reduce((t, r) => t + r.owed, 0).toFixed(2)),
    blockedCount: rows.filter((r) => r.blocked).length,
  }
}

export type DebtActionResult = { success: true; message: string } | { success: false; error: string }

/**
 * Record money that reached the platform some other way.
 *
 * The provider sees it on their own statement in the same words, so there is
 * one account of what happened rather than the platform's and theirs.
 */
export async function recordCommissionSettlement(input: unknown): Promise<DebtActionResult> {
  const parsed = z.object({
    userId: z.string().trim().min(1),
    amount: z.number().positive("Enter how much was paid").max(10_000_000),
    method: z.string().trim().min(2).max(40),
    reference: z.string().trim().max(80).optional(),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details" }
  const d = parsed.data

  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can record a settlement." }

  const before = await debtStateOf(d.userId)
  if (before.owed <= 0) return { success: false, error: "That provider does not owe anything." }

  const r = await settleCommissionDebt({
    userId: d.userId,
    amount: d.amount,
    method: d.method + " (recorded by " + admin.name + ")",
    reference: d.reference ?? null,
  })
  if (!r.ok) return { success: false, error: r.error }

  await logAdminAction({
    userId: admin.userId,
    action: "commission.settled",
    entityType: "user",
    entityId: d.userId,
    oldValues: { owed: before.owed },
    newValues: { paid: d.amount, owed: r.owedAfter, method: d.method, reference: d.reference ?? null },
  })

  return {
    success: true,
    message: r.owedAfter > 0
      ? "Recorded. They still owe KSh " + r.owedAfter.toLocaleString("en-KE") + "."
      : "Recorded. They are square and can accept work again.",
  }
}

/**
 * Write off what a provider owes.
 *
 * Separate from recording a payment, and it says so on the statement,
 * because a platform that cannot tell the difference between money received
 * and money forgiven cannot count its own revenue.
 */
export async function writeOffCommissionDebt(input: unknown): Promise<DebtActionResult> {
  const parsed = z.object({
    userId: z.string().trim().min(1),
    reason: z.string().trim().min(3, "Say why it is being written off").max(200),
  }).safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Give a reason" }
  const d = parsed.data

  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Only an admin can write off a debt." }

  const before = await debtStateOf(d.userId)
  if (before.owed <= 0) return { success: false, error: "That provider does not owe anything." }

  const r = await settleCommissionDebt({
    userId: d.userId,
    amount: before.owed,
    method: "write off by " + admin.name + ": " + d.reason,
  })
  if (!r.ok) return { success: false, error: r.error }

  await logAdminAction({
    userId: admin.userId,
    action: "commission.written_off",
    entityType: "user",
    entityId: d.userId,
    oldValues: { owed: before.owed },
    newValues: { reason: d.reason },
  })

  return { success: true, message: "Written off, with your reason on their statement." }
}
