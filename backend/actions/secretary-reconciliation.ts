"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireSecretary } from "@/backend/actions/secretary-dashboard"
import { logAdminAction } from "@/backend/actions/admin-dashboard"

export type SecretaryReconciliationRow = {
  walletId: string
  userId: string
  userName: string
  userEmail: string
  role: string
  currentBalance: number
  expectedBalance: number
  discrepancy: number
  lastTransactionAt: string | null
  status: "reconciled" | "discrepancy"
}

export type SecretaryReconciliationSummary = {
  totalWallets: number
  reconciledCount: number
  discrepancyCount: number
  totalBalance: number
}

async function loadRows(): Promise<SecretaryReconciliationRow[]> {
  const wallets = await db.wallet.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      transactions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  })

  return wallets.map((w) => {
    const currentBalance = Number(w.balance)
    const lastTxn = w.transactions[0]
    const expectedBalance = lastTxn ? Number(lastTxn.balanceAfter) : 0
    const discrepancy = Math.round((currentBalance - expectedBalance) * 100) / 100
    return {
      walletId: w.id,
      userId: w.userId,
      userName: w.user.name,
      userEmail: w.user.email,
      role: w.user.role,
      currentBalance,
      expectedBalance,
      discrepancy,
      lastTransactionAt: lastTxn ? lastTxn.createdAt.toISOString() : null,
      status: discrepancy === 0 ? "reconciled" : "discrepancy",
    }
  })
}

export async function getSecretaryReconciliation(): Promise<SecretaryReconciliationRow[] | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null
  return loadRows()
}

export async function getSecretaryReconciliationSummary(): Promise<SecretaryReconciliationSummary | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null
  const rows = await loadRows()
  return {
    totalWallets: rows.length,
    reconciledCount: rows.filter((r) => r.status === "reconciled").length,
    discrepancyCount: rows.filter((r) => r.status === "discrepancy").length,
    totalBalance: rows.reduce((sum, r) => sum + r.currentBalance, 0),
  }
}

type ActionResult = { success: true } | { success: false; error: string }

export async function recomputeWalletBalance(walletId: string): Promise<ActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const wallet = await db.wallet.findUnique({
    where: { id: walletId },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 1 } },
  })
  if (!wallet) return { success: false, error: "Wallet not found." }

  const lastTxn = wallet.transactions[0]
  const correctedBalance = lastTxn ? Number(lastTxn.balanceAfter) : 0
  const oldBalance = Number(wallet.balance)

  if (correctedBalance === oldBalance) return { success: true }

  await db.wallet.update({ where: { id: walletId }, data: { balance: correctedBalance } })

  await logAdminAction({
    userId: secretary.userId,
    action: "WALLET_RECONCILE",
    entityType: "Wallet",
    entityId: walletId,
    oldValues: { balance: oldBalance },
    newValues: { balance: correctedBalance },
  })

  return { success: true }
}

// ============================================================================
// BANK RECONCILIATION — a distinct concept from the live wallet-vs-transaction
// diff above. That tool catches a data-integrity bug in one customer's
// wallet; this is the periodic finance-ops task of comparing SAJI's own
// ledger total for a given settlement account (M-Pesa, bank, etc.) against
// what the actual bank statement says for a date, with a persisted record —
// the Reconciliation/ReconciliationDiscrepancy models existed in the schema
// under an explicit "Finance Ops" banner but nothing ever wrote to them.
// ============================================================================

export type BankReconciliationDiscrepancy = {
  id: string
  description: string
  amount: number
  status: string
  resolution: string | null
  createdAt: string
}

export type BankReconciliation = {
  id: string
  account: string
  date: string
  systemBalance: number
  bankBalance: number
  variance: number
  status: string
  createdAt: string
  discrepancies: BankReconciliationDiscrepancy[]
}

export async function getBankReconciliations(): Promise<BankReconciliation[]> {
  const secretary = await requireSecretary()
  if (!secretary) return []

  const rows = await db.reconciliation.findMany({
    orderBy: { date: "desc" },
    include: { discrepancies: { orderBy: { createdAt: "desc" } } },
  })

  return rows.map((r) => ({
    id: r.id,
    account: r.account,
    date: r.date.toISOString(),
    systemBalance: Number(r.systemBalance),
    bankBalance: Number(r.bankBalance),
    variance: Number(r.variance),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    discrepancies: r.discrepancies.map((d) => ({
      id: d.id,
      description: d.description,
      amount: Number(d.amount),
      status: d.status,
      resolution: d.resolution,
      createdAt: d.createdAt.toISOString(),
    })),
  }))
}

const createReconciliationSchema = z.object({
  account: z.string().trim().min(1, "Account name is required"),
  date: z.string().min(1, "Date is required"),
  systemBalance: z.number(),
  bankBalance: z.number(),
})

export async function createBankReconciliation(input: unknown): Promise<ActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const parsed = createReconciliationSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { account, date, systemBalance, bankBalance } = parsed.data

  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return { success: false, error: "Invalid date" }

  const variance = Math.round((systemBalance - bankBalance) * 100) / 100
  const hasVariance = variance !== 0

  const reconciliation = await db.reconciliation.create({
    data: {
      account, date: parsedDate, systemBalance, bankBalance, variance,
      status: hasVariance ? "UNDER_REVIEW" : "RECONCILED",
    },
  })

  if (hasVariance) {
    await db.reconciliationDiscrepancy.create({
      data: {
        reconciliationId: reconciliation.id,
        description: `System ledger (${systemBalance.toLocaleString()}) does not match bank statement (${bankBalance.toLocaleString()}) for ${account} on ${parsedDate.toLocaleDateString()}.`,
        amount: variance,
      },
    })
  }

  await logAdminAction({
    userId: secretary.userId,
    action: "reconciliation.create",
    entityType: "Reconciliation",
    entityId: reconciliation.id,
    newValues: { account, systemBalance, bankBalance, variance },
  })

  return { success: true }
}

const resolveDiscrepancySchema = z.object({
  discrepancyId: z.string().trim().min(1),
  resolution: z.string().trim().min(5, "Please describe how this was resolved"),
})

export async function resolveReconciliationDiscrepancy(input: unknown): Promise<ActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const parsed = resolveDiscrepancySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const discrepancy = await db.reconciliationDiscrepancy.findUnique({ where: { id: parsed.data.discrepancyId } })
  if (!discrepancy) return { success: false, error: "Discrepancy not found." }

  await db.reconciliationDiscrepancy.update({
    where: { id: discrepancy.id },
    data: { status: "resolved", resolution: parsed.data.resolution },
  })

  const remainingOpen = await db.reconciliationDiscrepancy.count({
    where: { reconciliationId: discrepancy.reconciliationId, status: { not: "resolved" } },
  })
  if (remainingOpen === 0) {
    await db.reconciliation.update({ where: { id: discrepancy.reconciliationId }, data: { status: "RECONCILED" } })
  }

  await logAdminAction({
    userId: secretary.userId,
    action: "reconciliation.resolve_discrepancy",
    entityType: "ReconciliationDiscrepancy",
    entityId: discrepancy.id,
    newValues: { status: "resolved", resolution: parsed.data.resolution },
  })

  return { success: true }
}
