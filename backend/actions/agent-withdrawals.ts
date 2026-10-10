"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAgent } from "@/backend/actions/agent-dashboard"
import { encryptAccountNumber } from "@/backend/services/payment-method-crypto"

export type AgentWalletSummary = { balance: number; pendingBalance: number; available: number } | null

export async function getAgentWallet(): Promise<AgentWalletSummary> {
  const agent = await requireAgent()
  if (!agent) return null

  const wallet = await db.wallet.upsert({
    where: { userId: agent.userId },
    update: {},
    create: { userId: agent.userId },
  })

  return {
    balance: Number(wallet.balance),
    pendingBalance: Number(wallet.pendingBalance),
    available: Number(wallet.balance) - Number(wallet.pendingBalance),
  }
}

export type AgentWithdrawal = {
  id: string
  amount: number
  netAmount: number
  method: string
  status: string
  createdAt: string
  completedAt: string | null
}

export async function getAgentWithdrawals(): Promise<AgentWithdrawal[] | null> {
  const agent = await requireAgent()
  if (!agent) return null

  const withdrawals = await db.withdrawalRequest.findMany({
    where: { userId: agent.userId },
    orderBy: { createdAt: "desc" },
  })

  return withdrawals.map((w) => ({
    id: w.id,
    amount: Number(w.amount),
    netAmount: Number(w.netAmount),
    method: w.method,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    completedAt: w.completedAt ? w.completedAt.toISOString() : null,
  }))
}

type ActionResult = { success: true } | { success: false; error: string }

const METHOD_TO_DB: Record<string, "MPESA" | "CARD"> = { mpesa: "MPESA", card: "CARD" }
const METHOD_LABEL: Record<string, string> = { mpesa: "M-Pesa", card: "Card Payout" }

const withdrawSchema = z.object({
  amount: z.number().positive("Enter an amount greater than zero").min(100, "Minimum withdrawal is KES 100"),
  method: z.enum(["mpesa", "card"]),
  details: z.string().trim().min(1, "Please enter your withdrawal details"),
})

export async function requestAgentWithdrawal(input: unknown): Promise<ActionResult> {
  const agent = await requireAgent()
  if (!agent) return { success: false, error: "You must be signed in as an agent." }

  const parsed = withdrawSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { amount, method, details } = parsed.data

  const wallet = await db.wallet.findUnique({ where: { userId: agent.userId } })
  if (!wallet) return { success: false, error: "Wallet not found." }

  const available = Number(wallet.balance) - Number(wallet.pendingBalance)
  if (amount > available) return { success: false, error: "Insufficient available balance." }

  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore - amount

  await db.$transaction([
    db.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter, pendingBalance: { increment: amount } } }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "PAYOUT",
        amount: -amount,
        description: `Withdrawal to ${METHOD_LABEL[method]}`,
        referenceType: "WITHDRAWAL",
        status: "PENDING",
        balanceBefore,
        balanceAfter,
      },
    }),
    db.withdrawalRequest.create({
      data: {
        userId: agent.userId,
        amount,
        method: METHOD_TO_DB[method],
        recipientDetails: {
          label: METHOD_LABEL[method],
          details,
          encryptedPhone: method === "mpesa" ? encryptAccountNumber(details) : null,
        },
        netAmount: amount,
      },
    }),
  ])

  return { success: true }
}
