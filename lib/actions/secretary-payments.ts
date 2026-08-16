"use server"

import crypto from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireSecretary } from "@/lib/actions/secretary-dashboard"
import { logAdminAction } from "@/lib/actions/admin-dashboard"
import { confirmWalletTopup, failWalletTopup } from "@/lib/actions/wallet"
import { createAndEmailReceipt } from "@/lib/actions/receipts"
import { initiateB2CPayment } from "@/lib/actions/payments"
import { mpesaB2CConfigured } from "@/lib/mpesa-config"
import { decryptAccountNumber } from "@/lib/payment-method-crypto"
import type { WithdrawalRequest } from "@prisma/client"

export type SecretaryWithdrawal = {
  id: string
  userName: string
  userEmail: string
  userRole: string
  amount: number
  netAmount: number
  processingFee: number
  method: string
  recipientLabel: string
  status: string
  rejectionReason: string | null
  externalRef: string | null
  createdAt: string
  completedAt: string | null
  /** True when "Complete" can automatically send a real M-Pesa B2C payout
   * instead of asking the secretary to type in a reference number by hand —
   * needs both a decryptable phone on file and B2C credentials configured. */
  canAutoPay: boolean
}

export type SecretaryPaymentStats = {
  totalProcessed: number
  pendingCount: number
  todayProcessed: number
  thisMonthProcessed: number
}

function toWithdrawal(w: {
  id: string
  amount: unknown
  netAmount: unknown
  processingFee: unknown
  method: string
  recipientDetails: unknown
  status: string
  rejectionReason: string | null
  externalRef: string | null
  createdAt: Date
  completedAt: Date | null
  user: { name: string; email: string; role: string }
}): SecretaryWithdrawal {
  const details = w.recipientDetails as { label?: string; accountNumber?: string | null; encryptedPhone?: string | null } | null
  return {
    id: w.id,
    userName: w.user.name,
    userEmail: w.user.email,
    userRole: w.user.role,
    amount: Number(w.amount),
    netAmount: Number(w.netAmount),
    processingFee: Number(w.processingFee),
    method: w.method,
    recipientLabel: details?.label ? `${details.label}${details.accountNumber ? ` (${details.accountNumber})` : ""}` : w.method,
    status: w.status,
    rejectionReason: w.rejectionReason,
    externalRef: w.externalRef,
    createdAt: w.createdAt.toISOString(),
    completedAt: w.completedAt ? w.completedAt.toISOString() : null,
    canAutoPay: Boolean(details?.label === "M-Pesa" && details?.encryptedPhone && mpesaB2CConfigured()),
  }
}

export async function getSecretaryWithdrawals(): Promise<SecretaryWithdrawal[] | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null

  const withdrawals = await db.withdrawalRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, email: true, role: true } } },
  })

  return withdrawals.map(toWithdrawal)
}

export async function getSecretaryPaymentStats(): Promise<SecretaryPaymentStats | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [totalAgg, pendingCount, todayAgg, monthAgg] = await Promise.all([
    db.withdrawalRequest.aggregate({ where: { status: "COMPLETED" }, _sum: { netAmount: true } }),
    db.withdrawalRequest.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    db.withdrawalRequest.aggregate({ where: { status: "COMPLETED", completedAt: { gte: startOfToday } }, _sum: { netAmount: true } }),
    db.withdrawalRequest.aggregate({ where: { status: "COMPLETED", completedAt: { gte: startOfMonth } }, _sum: { netAmount: true } }),
  ])

  return {
    totalProcessed: Number(totalAgg._sum.netAmount ?? 0),
    pendingCount,
    todayProcessed: Number(todayAgg._sum.netAmount ?? 0),
    thisMonthProcessed: Number(monthAgg._sum.netAmount ?? 0),
  }
}

type ActionResult = { success: true } | { success: false; error: string }

export async function markWithdrawalProcessing(withdrawalId: string): Promise<ActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const withdrawal = await db.withdrawalRequest.findUnique({ where: { id: withdrawalId } })
  if (!withdrawal) return { success: false, error: "Withdrawal request not found." }
  if (withdrawal.status !== "PENDING") return { success: false, error: "Only pending withdrawals can be moved to processing." }

  await db.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: "PROCESSING" } })
  await logAdminAction({
    userId: secretary.userId,
    action: "WITHDRAWAL_PROCESSING",
    entityType: "WithdrawalRequest",
    entityId: withdrawalId,
    newValues: { status: "PROCESSING" },
  })

  return { success: true }
}

const completeSchema = z.object({
  withdrawalId: z.string().min(1),
  externalRef: z.string().trim().max(120).optional(),
})

/** Shared by the secretary's manual "Complete" action and the B2C result
 * callback's success path — the only difference is where externalRef comes
 * from (typed in by hand vs. the M-Pesa transaction receipt Safaricom
 * returns). `actorUserId` is null for the callback path (nobody is signed
 * in — Safaricom's server is calling us). */
async function finalizeWithdrawal(withdrawal: WithdrawalRequest, externalRef: string | null, actorUserId: string | null): Promise<ActionResult> {
  const wallet = await db.wallet.findUnique({ where: { userId: withdrawal.userId } })
  if (!wallet) return { success: false, error: "Wallet not found for this user." }

  const netAmount = Number(withdrawal.netAmount)
  const linkedTxn = await db.transaction.findFirst({
    where: {
      walletId: wallet.id,
      type: "PAYOUT",
      referenceType: "WITHDRAWAL",
      status: "PENDING",
      amount: -Number(withdrawal.amount),
    },
    orderBy: { createdAt: "asc" },
  })

  await db.$transaction([
    db.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: { status: "COMPLETED", completedAt: new Date(), externalRef: externalRef || undefined },
    }),
    db.wallet.update({
      where: { id: wallet.id },
      data: { pendingBalance: { decrement: Number(withdrawal.amount) }, totalWithdrawn: { increment: netAmount } },
    }),
    ...(linkedTxn ? [db.transaction.update({ where: { id: linkedTxn.id }, data: { status: "COMPLETED" as const } })] : []),
    db.notification.create({
      data: {
        userId: withdrawal.userId,
        title: "Withdrawal completed",
        message: `Your withdrawal of KES ${netAmount.toLocaleString()} has been paid out.`,
        type: "PAYMENT",
      },
    }),
  ])

  // Replaces the old plain-text confirmation email — the receipt (PDF
  // attached, verify link included) is a strict superset of it.
  const recipientDetails = withdrawal.recipientDetails as { label?: string } | null
  void createAndEmailReceipt({
    userId: withdrawal.userId,
    type: "WITHDRAWAL",
    paymentMethod: recipientDetails?.label ?? withdrawal.method,
    transactionRef: externalRef || null,
    lineItems: [{ label: "Wallet Withdrawal", quantity: 1, amount: netAmount }],
    totalAmount: netAmount,
    // wallet.balance was already decremented back in requestWithdrawal()
    // (this function's own transaction above only moves
    // pendingBalance -> totalWithdrawn), so the current value is already
    // correct — not something to subtract from again.
    balanceAfter: Number(wallet.balance),
  })

  await db.auditLog.create({
    data: {
      userId: actorUserId,
      action: actorUserId ? "WITHDRAWAL_COMPLETED" : "WITHDRAWAL_B2C_COMPLETED",
      entityType: "WithdrawalRequest",
      entityId: withdrawal.id,
      newValues: { status: "COMPLETED", externalRef },
    },
  })

  return { success: true }
}

/** Shared by the secretary's manual "Reject" action and a failed/timed-out
 * B2C payout — both return the held amount to the user's wallet, just with
 * a different final status (REJECTED vs FAILED) and reason text. */
async function refundWithdrawal(withdrawal: WithdrawalRequest, reason: string, status: "REJECTED" | "FAILED", actorUserId: string | null): Promise<ActionResult> {
  const wallet = await db.wallet.findUnique({ where: { userId: withdrawal.userId } })
  if (!wallet) return { success: false, error: "Wallet not found for this user." }

  const refundAmount = Number(withdrawal.amount)
  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore + refundAmount

  const linkedTxn = await db.transaction.findFirst({
    where: {
      walletId: wallet.id,
      type: "PAYOUT",
      referenceType: "WITHDRAWAL",
      status: "PENDING",
      amount: -refundAmount,
    },
    orderBy: { createdAt: "asc" },
  })

  await db.$transaction([
    db.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: { status, rejectionReason: reason },
    }),
    db.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter, pendingBalance: { decrement: refundAmount } },
    }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "REFUND",
        amount: refundAmount,
        description: `Withdrawal ${status === "FAILED" ? "failed" : "rejected"}: ${reason}`,
        referenceType: "WITHDRAWAL",
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    }),
    ...(linkedTxn ? [db.transaction.update({ where: { id: linkedTxn.id }, data: { status: "REVERSED" as const } })] : []),
    db.notification.create({
      data: {
        userId: withdrawal.userId,
        title: status === "FAILED" ? "Withdrawal failed" : "Withdrawal rejected",
        message: `Your withdrawal of KES ${refundAmount.toLocaleString()} ${status === "FAILED" ? "could not be paid out" : "was rejected"}: ${reason}. The amount has been returned to your wallet.`,
        type: "PAYMENT",
      },
    }),
  ])

  await db.auditLog.create({
    data: {
      userId: actorUserId,
      action: actorUserId ? "WITHDRAWAL_REJECTED" : "WITHDRAWAL_B2C_FAILED",
      entityType: "WithdrawalRequest",
      entityId: withdrawal.id,
      newValues: { status, reason },
    },
  })

  return { success: true }
}

// Binds the B2C result/timeout callback URLs to a specific withdrawal so a
// forged POST to that route (guessing/replaying the URL) can't trigger a
// false "failed" report and get the held amount refunded on top of a real
// payout that already landed — Safaricom's own callback body isn't signed,
// so this app-level token is the actual trust boundary. Daraja's B2C result
// callback has no synchronous "query to re-verify" endpoint the way STK
// push does (see queryMpesaPayment), so this token is the substitute.
function b2cCallbackToken(withdrawalId: string): string {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET || "").update(withdrawalId).digest("hex")
}

function verifyB2CCallbackToken(withdrawalId: string, token: string): boolean {
  const expected = Buffer.from(b2cCallbackToken(withdrawalId))
  const actual = Buffer.from(token || "")
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export async function completeWithdrawal(input: unknown): Promise<ActionResult & { autoPayoutSent?: boolean }> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const parsed = completeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { withdrawalId, externalRef } = parsed.data

  const withdrawal = await db.withdrawalRequest.findUnique({ where: { id: withdrawalId } })
  if (!withdrawal) return { success: false, error: "Withdrawal request not found." }
  if (withdrawal.status !== "PENDING" && withdrawal.status !== "PROCESSING") {
    return { success: false, error: "Only pending or processing withdrawals can be completed." }
  }
  // A payout already sent to Safaricom is out of our hands until the result
  // callback resolves it — sending a second one would double-pay the user;
  // finalizing it manually in the meantime would race the real callback.
  if (withdrawal.b2cConversationId) {
    return { success: false, error: "An M-Pesa payout is already in progress for this withdrawal — waiting for confirmation." }
  }

  // Auto-payout path: real M-Pesa number on file + B2C configured, and the
  // secretary hasn't typed in their own reference (that's the escape hatch
  // for "I already paid this outside the app, just record it"). This is
  // the actual "approve -> money moves automatically" behavior.
  const recipientDetails = withdrawal.recipientDetails as { label?: string; encryptedPhone?: string | null } | null
  const phone = recipientDetails?.encryptedPhone ? decryptAccountNumber(recipientDetails.encryptedPhone) : null

  if (!externalRef && recipientDetails?.label === "M-Pesa" && phone && mpesaB2CConfigured()) {
    const origin = (process.env.CALLBACK_URL || "").replace(/\/$/, "")
    const token = b2cCallbackToken(withdrawalId)
    const result = await initiateB2CPayment(
      phone,
      Number(withdrawal.netAmount),
      `SAJI withdrawal ${withdrawalId}`,
      `${origin}/api/payments/callback/mpesa/b2c/result?wid=${withdrawalId}&token=${token}`,
      `${origin}/api/payments/callback/mpesa/b2c/timeout?wid=${withdrawalId}&token=${token}`,
    )
    if (!result.success) {
      return { success: false, error: result.message ?? "Failed to send the M-Pesa payout." }
    }

    await db.withdrawalRequest.update({ where: { id: withdrawalId }, data: { status: "PROCESSING", b2cConversationId: result.conversationId } })
    await logAdminAction({
      userId: secretary.userId,
      action: "WITHDRAWAL_B2C_SENT",
      entityType: "WithdrawalRequest",
      entityId: withdrawalId,
      newValues: { conversationId: result.conversationId },
    })

    return { success: true, autoPayoutSent: true }
  }

  return finalizeWithdrawal(withdrawal, externalRef || null, secretary.userId)
}

/** Called by /api/payments/callback/mpesa/b2c/result. */
export async function handleB2CResultCallback(withdrawalId: string, token: string, payload: any): Promise<void> {
  if (!verifyB2CCallbackToken(withdrawalId, token)) return

  const withdrawal = await db.withdrawalRequest.findUnique({ where: { id: withdrawalId } })
  if (!withdrawal || withdrawal.status !== "PROCESSING") return

  await db.auditLog.create({ data: { userId: null, action: "mpesa-b2c-callback", entityType: "WithdrawalRequest", entityId: withdrawalId, newValues: payload } }).catch(() => {})

  const result = payload?.Result
  const resultCode = Number(result?.ResultCode)

  if (resultCode === 0) {
    const params: Array<{ Key: string; Value: unknown }> = result?.ResultParameters?.ResultParameter ?? []
    const receipt = params.find((p) => p.Key === "TransactionReceipt")?.Value
    await finalizeWithdrawal(withdrawal, receipt ? String(receipt) : (result?.TransactionID ?? null), null)
  } else {
    await refundWithdrawal(withdrawal, result?.ResultDesc || "M-Pesa payout failed", "FAILED", null)
  }
}

/** Called by /api/payments/callback/mpesa/b2c/timeout — Safaricom couldn't
 * even reach a result within their own window, treated the same as a
 * failure so the customer isn't left with their balance stuck in limbo. */
export async function handleB2CTimeoutCallback(withdrawalId: string, token: string): Promise<void> {
  if (!verifyB2CCallbackToken(withdrawalId, token)) return

  const withdrawal = await db.withdrawalRequest.findUnique({ where: { id: withdrawalId } })
  if (!withdrawal || withdrawal.status !== "PROCESSING") return

  await refundWithdrawal(withdrawal, "M-Pesa payout timed out", "FAILED", null)
}

const rejectSchema = z.object({
  withdrawalId: z.string().min(1),
  reason: z.string().trim().min(3, "Provide a reason for the rejection").max(300),
})

export async function rejectWithdrawal(input: unknown): Promise<ActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { withdrawalId, reason } = parsed.data

  const withdrawal = await db.withdrawalRequest.findUnique({ where: { id: withdrawalId } })
  if (!withdrawal) return { success: false, error: "Withdrawal request not found." }
  if (withdrawal.status !== "PENDING" && withdrawal.status !== "PROCESSING") {
    return { success: false, error: "Only pending or processing withdrawals can be rejected." }
  }
  if (withdrawal.b2cConversationId) {
    return { success: false, error: "An M-Pesa payout is already in progress for this withdrawal — it can no longer be rejected." }
  }

  return refundWithdrawal(withdrawal, reason, "REJECTED", secretary.userId)
}

// ============================= BANK-TRANSFER WALLET TOP-UPS =============================
// No real bank aggregator exists (see lib/actions/wallet.ts's
// bankTransferConfigured() note), so a customer's bank-transfer deposit
// lands here as a real PENDING Payment for manual reconciliation — the same
// "reconcile against a real bank statement by hand" role this portal
// already plays for withdrawals above.

export type PendingBankTopup = {
  paymentId: string
  customerName: string
  customerEmail: string
  amount: number
  reference: string
  createdAt: string
}

export async function getPendingBankTopups(): Promise<PendingBankTopup[] | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null

  const payments = await db.payment.findMany({
    where: { contextType: "WALLET_TOPUP", status: "PENDING", externalRef: { startsWith: "bank-ref-" } },
    orderBy: { createdAt: "desc" },
    include: { payer: { select: { name: true, email: true } } },
  })

  return payments.map((p) => ({
    paymentId: p.id,
    customerName: p.payer.name,
    customerEmail: p.payer.email,
    amount: Number(p.amount),
    reference: (p.externalRef ?? "").replace(/^bank-ref-/, ""),
    createdAt: p.createdAt.toISOString(),
  }))
}

const bankTopupActionSchema = z.object({ paymentId: z.string().min(1) })

export async function confirmBankTopup(input: unknown): Promise<ActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const parsed = bankTopupActionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await confirmWalletTopup(parsed.data.paymentId, "Bank Transfer")
  await logAdminAction({ userId: secretary.userId, action: "BANK_TOPUP_CONFIRMED", entityType: "Payment", entityId: parsed.data.paymentId, newValues: { status: "COMPLETED" } })
  return { success: true }
}

export async function rejectBankTopup(input: unknown): Promise<ActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const parsed = bankTopupActionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await failWalletTopup(parsed.data.paymentId)
  await logAdminAction({ userId: secretary.userId, action: "BANK_TOPUP_REJECTED", entityType: "Payment", entityId: parsed.data.paymentId, newValues: { status: "FAILED" } })
  return { success: true }
}
