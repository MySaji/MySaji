import { db } from "@/lib/db"
import { pushToUser } from "@/lib/actions/push"
import { notifyUser } from "@/lib/actions/notify"
import { createAndEmailReceipt } from "@/lib/actions/receipts"

/**
 * Wallet money movement, deliberately NOT a server action.
 *
 * These three used to be exported from lib/actions/wallet.ts, which carries
 * "use server" — and every export of such a file is a callable HTTP endpoint,
 * whether or not any client imports it. That made creditWalletTopup a public
 * endpoint taking a user id and an amount and crediting the balance, with no
 * authentication and no proof that a payment had happened.
 *
 * Nothing about them was ever meant to be reachable from a browser: every
 * caller is a payment webhook, the payments API route, or another server
 * action. Moving them into a plain module removes the endpoints entirely
 * rather than guarding them, which is the same shape as lib/kyc-review-core.ts.
 *
 * Keep them here. Re-exporting any of this from a "use server" file would
 * recreate exactly the endpoint this removes.
 */

/** Credits a wallet and records the transaction, notification and receipt.
 *  Callers are responsible for having established that the money arrived. */
export async function creditWalletTopup(userId: string, amount: number, methodLabel: string): Promise<void> {
  const wallet = await db.wallet.findUnique({ where: { userId } })
  if (!wallet) return

  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore + amount

  await db.$transaction([
    db.wallet.update({ where: { userId }, data: { balance: balanceAfter, totalEarned: { increment: amount } } }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount,
        description: `Added via ${methodLabel}`,
        referenceType: "TOPUP",
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    }),
    db.notification.create({
      data: {
        userId,
        title: "Wallet topped up",
        message: `KES ${amount.toLocaleString()} was added to your wallet via ${methodLabel}.`,
        type: "PAYMENT",
        actionUrl: "/customer/wallet",
      },
    }),
  ])

  await pushToUser(
    userId,
    {
      title: "Wallet topped up",
      body: `KES ${amount.toLocaleString()} was added via ${methodLabel}.`,
      url: "/customer/wallet",
    },
    "payment",
  )

  // Replaces the old plain-text confirmation email — the receipt (PDF
  // attached, verify link included) is a strict superset of it, so
  // sending both would just be two emails for one event.
  void createAndEmailReceipt({
    userId,
    type: "DEPOSIT",
    paymentMethod: methodLabel,
    lineItems: [{ label: "Wallet Top-Up", quantity: 1, amount }],
    totalAmount: amount,
    balanceAfter,
  })
}

/** Marks a pending wallet-topup Payment completed and credits the wallet.
 *  The PENDING check is what stops the same top-up being credited twice. */
export async function confirmWalletTopup(paymentId: string, methodLabel = "your payment method"): Promise<void> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.contextType !== "WALLET_TOPUP" || payment.status !== "PENDING") return

  await db.payment.update({ where: { id: paymentId }, data: { status: "COMPLETED", paidAt: new Date() } })
  await creditWalletTopup(payment.payerId, Number(payment.amount), methodLabel)
}

export async function failWalletTopup(paymentId: string, reason?: string): Promise<void> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.contextType !== "WALLET_TOPUP" || payment.status !== "PENDING") return

  await db.payment.update({ where: { id: paymentId }, data: { status: "FAILED", failureReason: reason ?? null } })
  const failMessage = reason
    ? `${reason} (KES ${Number(payment.amount).toLocaleString()} top-up)`
    : `Your wallet top-up of KES ${Number(payment.amount).toLocaleString()} could not be completed.`
  await notifyUser({
    userId: payment.payerId,
    title: "Top-up failed",
    message: failMessage,
    type: "PAYMENT",
    actionUrl: "/customer/wallet",
  })
}
