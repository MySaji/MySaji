"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { pushToUser } from "@/lib/actions/push"
import { getActiveEscrowJobs, type ActiveEscrowJob } from "@/lib/actions/jobs"
import { createAndEmailReceipt } from "@/lib/actions/receipts"
import { encryptAccountNumber } from "@/lib/payment-method-crypto"

export type WalletTransaction = {
  id: string
  category: "payment" | "refund" | "withdrawal" | "deposit"
  description: string
  amount: number
  status: "completed" | "pending"
  createdAt: string
}

export type WalletPaymentMethod = {
  id: string
  type: "mpesa" | "card" | "paypal" | "bank"
  name: string
  number: string
  isDefault: boolean
}

export type WalletSummary = {
  balance: number
  currency: string
  totalSpent: number
  completedServices: number
  escrow: number
  escrowJobs: ActiveEscrowJob[]
  transactions: WalletTransaction[]
  paymentMethods: WalletPaymentMethod[]
} | null

function categorizeTransaction(type: string, amount: number): WalletTransaction["category"] {
  if (type === "CREDIT") return "deposit"
  if (type === "REFUND") return "refund"
  if (type === "PAYOUT") return "withdrawal"
  return amount >= 0 ? "deposit" : "payment"
}

const METHOD_TYPE_FROM_DB: Record<string, WalletPaymentMethod["type"]> = {
  MPESA: "mpesa",
  CARD: "card",
  PAYPAL: "paypal",
  BANK: "bank",
}

export async function getWalletSummary(): Promise<WalletSummary> {
  const session = await auth()
  if (!session?.user?.id) return null

  const [wallet, paymentMethods, spentAgg, completedServices, escrowJobs] = await Promise.all([
    db.wallet.findUnique({
      where: { userId: session.user.id },
      include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    db.paymentMethod.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } }),
    db.transaction.aggregate({
      where: { wallet: { userId: session.user.id }, type: "DEBIT" },
      _sum: { amount: true },
    }),
    db.job.count({ where: { customerId: session.user.id, status: "COMPLETED" } }),
    getActiveEscrowJobs(),
  ])
  if (!wallet) return null

  return {
    balance: Number(wallet.balance),
    currency: wallet.currency,
    totalSpent: Number(spentAgg._sum.amount ?? 0),
    completedServices,
    escrow: escrowJobs.reduce((sum, j) => sum + j.amount, 0),
    escrowJobs,
    transactions: wallet.transactions.map((t) => ({
      id: t.id,
      category: categorizeTransaction(t.type, Number(t.amount)),
      description: t.description,
      amount: Number(t.amount),
      status: t.status === "PENDING" ? "pending" : "completed",
      createdAt: t.createdAt.toISOString(),
    })),
    paymentMethods: paymentMethods.map((p) => ({
      id: p.id,
      type: METHOD_TYPE_FROM_DB[p.type] ?? "card",
      name: p.provider ?? p.type,
      number: p.accountNumber,
      isDefault: p.isDefault,
    })),
  }
}

export type WalletActionResult = { success: true } | { success: false; error: string }

/** Real credit application, shared by every top-up completion path (a
 * sandbox-simulated gateway response, a real M-Pesa/Stripe/PayPal callback,
 * or a secretary manually confirming a bank transfer) — the one place that
 * actually moves money into the wallet. */
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

  await pushToUser(userId, {
    title: "Wallet topped up",
    body: `KES ${amount.toLocaleString()} was added via ${methodLabel}.`,
    url: "/customer/wallet",
  }, "payment")

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

/** Called once a wallet top-up Payment (contextType WALLET_TOPUP) actually
 * succeeds — from a real gateway callback, active status poll, or a
 * secretary manually confirming a bank transfer. Idempotent: a payment
 * that's already been completed (or isn't a wallet top-up) is a no-op, so
 * this is safe to call from multiple possible completion paths. */
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
  await db.notification.create({
    data: {
      userId: payment.payerId,
      title: "Top-up failed",
      message: reason
        ? `${reason} (KES ${Number(payment.amount).toLocaleString()} top-up)`
        : `Your wallet top-up of KES ${Number(payment.amount).toLocaleString()} could not be completed.`,
      type: "PAYMENT",
      actionUrl: "/customer/wallet",
    },
  })
}

// ============================= BANK TRANSFER =============================
// No real bank aggregator integration exists anywhere in this app (same gap
// as Airtel Money in lib/actions/payments.ts) — a real one requires the
// platform's actual registered bank account details, which aren't available
// in this environment. Rather than fabricate an account number, this checks
// for real env vars and honestly tells the customer bank transfer isn't set
// up yet if they're absent. Once configured, a submitted reference creates a
// real PENDING wallet-topup Payment for manual staff confirmation (the
// Secretary portal's Payments page) — bank transfers are never instant in
// real life either, so "pending until reconciled" is the honest behavior,
// not a placeholder for a missing feature.
function bankTransferConfigured() {
  return Boolean(process.env.PLATFORM_BANK_NAME && process.env.PLATFORM_BANK_ACCOUNT_NUMBER)
}

export async function getBankTransferDetails(): Promise<{ bankName: string; accountName: string; accountNumber: string } | null> {
  if (!bankTransferConfigured()) return null
  return {
    bankName: process.env.PLATFORM_BANK_NAME!,
    accountName: process.env.PLATFORM_BANK_ACCOUNT_NAME || "SAJI",
    accountNumber: process.env.PLATFORM_BANK_ACCOUNT_NUMBER!,
  }
}

const bankTopupSchema = z.object({
  amount: z.number().positive("Enter an amount greater than zero").max(1_000_000, "Amount is too large"),
  reference: z.string().trim().min(3, "Enter your bank transfer reference or receipt number"),
})

export type BankTransferTopupResult =
  | { success: true; configured: true; paymentId: string }
  | { success: true; configured: false; message: string }
  | { success: false; error: string }

export async function initiateBankTransferTopup(input: unknown): Promise<BankTransferTopupResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = bankTopupSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  if (!bankTransferConfigured()) {
    return {
      success: true,
      configured: false,
      message: "Bank transfer deposits aren't set up yet — please use M-Pesa, Card, or PayPal for now.",
    }
  }

  const payment = await db.payment.create({
    data: {
      amount: parsed.data.amount,
      currency: "KES",
      status: "PENDING",
      contextType: "WALLET_TOPUP",
      payerId: session.user.id,
      externalRef: `bank-ref-${parsed.data.reference}`,
    },
  })
  return { success: true, configured: true, paymentId: payment.id }
}

/** Resolves a Stripe Checkout session id (from the ?session_id= the browser
 * comes back with) to the wallet-topup Payment row it belongs to, so the
 * wallet page can poll checkWalletTopupStatus() by id like every other
 * gateway path does. */
export async function getWalletTopupIdByExternalRef(externalRef: string): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const payment = await db.payment.findFirst({ where: { externalRef, contextType: "WALLET_TOPUP", payerId: session.user.id } })
  return payment?.id ?? null
}

export type WalletTopupStatus = { status: "PENDING" | "COMPLETED" | "FAILED"; failureReason?: string | null }

/** The frontend polls this after initiating an M-Pesa/Stripe top-up — mirrors
 * checkJobPaymentStatus() in lib/actions/payments.ts, actively reconciling
 * with the gateway when the local Payment is still PENDING and this
 * environment has no public webhook URL to be called back on. */
export async function checkWalletTopupStatus(paymentId: string): Promise<WalletTopupStatus | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.payerId !== session.user.id || payment.contextType !== "WALLET_TOPUP") return null

  if (payment.status === "PENDING" && payment.externalRef) {
    const { queryMpesaPayment, retrieveStripeSessionStatus } = await import("@/lib/actions/payments")
    const ref = payment.externalRef
    if (ref.startsWith("ws_CO_")) {
      const result = await queryMpesaPayment(ref)
      if (result) {
        if (result.resultCode === 0) await confirmWalletTopup(payment.id, "M-Pesa")
        else await failWalletTopup(payment.id, result.reason ?? undefined)
      }
    } else if (ref.startsWith("cs_")) {
      const stripeStatus = await retrieveStripeSessionStatus(ref)
      if (stripeStatus === "paid") await confirmWalletTopup(payment.id, "Card")
    }
  }

  const fresh = await db.payment.findUnique({ where: { id: paymentId } })
  return { status: (fresh?.status as WalletTopupStatus["status"]) ?? "PENDING", failureReason: fresh?.failureReason ?? null }
}

const withdrawSchema = z.object({
  amount: z.number().positive("Enter an amount greater than zero"),
  paymentMethodId: z.string().trim().min(1, "Select where to withdraw to"),
})

const DB_METHOD_TO_WITHDRAWAL: Record<string, "MPESA" | "CARD" | "PAYPAL"> = { MPESA: "MPESA", CARD: "CARD", PAYPAL: "PAYPAL", BANK: "CARD" }

export async function requestWithdrawal(input: unknown): Promise<WalletActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = withdrawSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { amount, paymentMethodId } = parsed.data

  const wallet = await db.wallet.findUnique({ where: { userId: session.user.id } })
  if (!wallet) return { success: false, error: "Wallet not found." }
  if (Number(wallet.balance) < amount) return { success: false, error: "Insufficient balance." }

  const destination = await db.paymentMethod.findUnique({ where: { id: paymentMethodId } })
  if (!destination || destination.userId !== session.user.id) return { success: false, error: "Select a valid payment method to withdraw to." }

  const destinationLabel = destination.provider ?? destination.type
  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore - amount

  await db.$transaction([
    db.wallet.update({
      where: { userId: session.user.id },
      data: { balance: balanceAfter, pendingBalance: { increment: amount } },
    }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "PAYOUT",
        amount: -amount,
        description: `Withdrawal to ${destinationLabel} (${destination.accountNumber})`,
        referenceType: "WITHDRAWAL",
        status: "PENDING",
        balanceBefore,
        balanceAfter,
      },
    }),
    db.withdrawalRequest.create({
      data: {
        userId: session.user.id,
        amount,
        method: DB_METHOD_TO_WITHDRAWAL[destination.type] ?? "CARD",
        // Snapshotting the encrypted phone here (rather than re-reading the
        // PaymentMethod row when the secretary later approves) keeps this
        // consistent with every other "frozen at request time" record in
        // the app, and survives the user editing/removing the payment
        // method before the withdrawal is actioned.
        recipientDetails: {
          label: destinationLabel,
          accountNumber: destination.accountNumber,
          encryptedPhone: destinationLabel === "M-Pesa" ? destination.encryptedAccountNumber : null,
        },
        netAmount: amount,
      },
    }),
    db.notification.create({
      data: {
        userId: session.user.id,
        title: "Withdrawal requested",
        message: `Your withdrawal of KES ${amount.toLocaleString()} to ${destinationLabel} (${destination.accountNumber}) is pending review.`,
        type: "PAYMENT",
        actionUrl: "/customer/wallet",
      },
    }),
  ])

  return { success: true }
}

const addPaymentMethodSchema = z.object({
  type: z.enum(["mpesa", "airtel", "card", "paypal", "bank"]),
  mpesaPhone: z.string().trim().optional(),
  cardNumber: z.string().trim().optional(),
  cvv: z.string().trim().optional(),
  paypalEmail: z.string().trim().optional(),
  bankDetails: z.string().trim().optional(),
})

const ADD_METHOD_TO_DB: Record<string, "MPESA" | "CARD" | "PAYPAL" | "BANK"> = {
  mpesa: "MPESA", airtel: "MPESA", card: "CARD", paypal: "PAYPAL", bank: "BANK",
}

export async function addPaymentMethod(input: unknown): Promise<WalletActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = addPaymentMethodSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const data = parsed.data

  let name: string
  let masked: string
  let encrypted: string | null = null
  if (data.type === "mpesa" || data.type === "airtel") {
    if (!data.mpesaPhone || data.mpesaPhone.length < 10) return { success: false, error: "Enter a valid phone number." }
    name = data.type === "airtel" ? "Airtel Money" : "M-Pesa"
    masked = `***${data.mpesaPhone.slice(-4)}`
    // Only the real M-Pesa (Safaricom) number is ever usable for an
    // automatic B2C payout later — Airtel Money isn't on Safaricom's B2C
    // rails, so its number is never encrypted/stored beyond the mask.
    encrypted = data.type === "mpesa" ? encryptAccountNumber(data.mpesaPhone) : null
  } else if (data.type === "card") {
    if (!data.cardNumber || data.cardNumber.length !== 16 || !data.cvv || data.cvv.length !== 3) {
      return { success: false, error: "Enter a valid 16-digit card number and CVV." }
    }
    name = "Card"
    masked = `***${data.cardNumber.slice(-4)}`
  } else if (data.type === "bank") {
    if (!data.bankDetails || data.bankDetails.trim().length < 4) return { success: false, error: "Enter your bank account details." }
    name = "Bank Account"
    masked = `***${data.bankDetails.slice(-4)}`
  } else {
    if (!data.paypalEmail || !data.paypalEmail.includes("@")) return { success: false, error: "Enter a valid PayPal email." }
    name = "PayPal"
    masked = `***${data.paypalEmail.slice(data.paypalEmail.indexOf("@"))}`
  }

  const existingCount = await db.paymentMethod.count({ where: { userId: session.user.id } })

  await db.paymentMethod.create({
    data: {
      userId: session.user.id,
      type: ADD_METHOD_TO_DB[data.type],
      provider: name,
      accountNumber: masked,
      encryptedAccountNumber: encrypted,
      isDefault: existingCount === 0,
    },
  })

  return { success: true }
}

const removePaymentMethodSchema = z.object({ id: z.string().trim().min(1) })

export async function removePaymentMethod(input: unknown): Promise<WalletActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = removePaymentMethodSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.paymentMethod.deleteMany({ where: { id: parsed.data.id, userId: session.user.id } })
  return { success: true }
}

const setDefaultPaymentMethodSchema = z.object({ id: z.string().trim().min(1) })

export async function setDefaultPaymentMethod(input: unknown): Promise<WalletActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = setDefaultPaymentMethodSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const method = await db.paymentMethod.findUnique({ where: { id: parsed.data.id } })
  if (!method || method.userId !== session.user.id) return { success: false, error: "Payment method not found." }

  await db.$transaction([
    db.paymentMethod.updateMany({ where: { userId: session.user.id }, data: { isDefault: false } }),
    db.paymentMethod.update({ where: { id: method.id }, data: { isDefault: true } }),
  ])
  return { success: true }
}

const updatePaymentMethodSchema = z.object({ id: z.string().trim().min(1), details: z.string().trim().min(4, "Enter valid account details") })

export async function updatePaymentMethod(input: unknown): Promise<WalletActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updatePaymentMethodSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const method = await db.paymentMethod.findUnique({ where: { id: parsed.data.id } })
  if (!method || method.userId !== session.user.id) return { success: false, error: "Payment method not found." }

  await db.paymentMethod.update({ where: { id: method.id }, data: { accountNumber: `***${parsed.data.details.slice(-4)}` } })
  return { success: true }
}
