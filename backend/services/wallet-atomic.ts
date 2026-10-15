import "server-only"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { serialTransaction } from "@/backend/services/db-transaction"
import { notifyUser } from "@/backend/services/notifications-core"
import { createAndEmailReceipt } from "@/backend/services/receipts-core"

async function credit(tx: Prisma.TransactionClient, userId: string, amount: number, methodLabel: string, paymentId?: string) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid credit amount")
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } })
  const balanceAfter = wallet.balance.plus(amount)
  await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } })
  await tx.transaction.create({ data: {
    walletId: wallet.id, type: "CREDIT", amount, description: `Added via ${methodLabel}`,
    referenceType: "TOPUP", referenceId: paymentId, status: "COMPLETED",
    balanceBefore: wallet.balance, balanceAfter,
  } })
  return Number(balanceAfter)
}

async function announce(userId: string, amount: number, methodLabel: string, balanceAfter: number) {
  await notifyUser({ userId, title: "Wallet topped up", message: `KES ${amount.toLocaleString()} added via ${methodLabel}.`, type: "PAYMENT", actionUrl: "/customer/wallet" })
  await createAndEmailReceipt({ userId, type: "DEPOSIT", paymentMethod: methodLabel,
    lineItems: [{ label: "Wallet Top-Up", quantity: 1, amount }], totalAmount: amount, balanceAfter })
}

export async function creditWalletTopup(userId: string, amount: number, methodLabel: string): Promise<void> {
  const after = await serialTransaction(tx => credit(tx, userId, amount, methodLabel))
  await announce(userId, amount, methodLabel, after)
}

export async function confirmWalletTopup(paymentId: string, methodLabel = "your payment method"): Promise<void> {
  const result = await serialTransaction(async tx => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.contextType !== "WALLET_TOPUP") return null
    const claim = await tx.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "COMPLETED", paidAt: new Date() } })
    if (claim.count !== 1) return null
    const amount = Number(payment.amount)
    const after = await credit(tx, payment.payerId, amount, methodLabel, payment.id)
    return { userId: payment.payerId, amount, after }
  })
  if (result) await announce(result.userId, result.amount, methodLabel, result.after)
}

export async function failWalletTopup(paymentId: string, reason?: string): Promise<void> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.contextType !== "WALLET_TOPUP") return
  const claim = await db.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "FAILED", failureReason: reason ?? null } })
  if (claim.count !== 1) return
  await notifyUser({ userId: payment.payerId, title: "Top-up failed", message: reason ?? "Your wallet top-up could not be completed.", type: "PAYMENT", actionUrl: "/customer/wallet" })
}
