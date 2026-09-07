"use server"

import { z } from "zod"
import { confirmJobPayment, failJobPayment } from "@/lib/payment-core"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"
import { queryMpesaPayment, retrieveStripeSessionStatus } from "@/lib/actions/payments"

export type AdminPaymentStatus = "Completed" | "Pending" | "Processing" | "Failed" | "Refunded"

export type AdminPayment = {
  id: string
  user: string
  context: string
  amount: number
  method: string
  status: AdminPaymentStatus
  date: string
  externalRef: string | null
}

const STATUS_LABEL: Record<string, AdminPaymentStatus> = {
  COMPLETED: "Completed", PENDING: "Pending", PROCESSING: "Processing", FAILED: "Failed", REFUNDED: "Refunded",
}

const METHOD_LABEL: Record<string, string> = { MPESA: "M-Pesa", CARD: "Card", BANK: "Bank Transfer", PAYPAL: "PayPal" }

function deriveMethod(payment: { paymentMethod: { type: string } | null; externalRef: string | null; contextType: string }): string {
  if (payment.paymentMethod) return METHOD_LABEL[payment.paymentMethod.type] ?? payment.paymentMethod.type
  const ref = payment.externalRef ?? ""
  if (ref.startsWith("mpesa") || ref.startsWith("ws_CO_")) return "M-Pesa"
  if (ref.startsWith("cs_") || ref.startsWith("stripe")) return "Stripe"
  if (ref.toLowerCase().includes("paypal")) return "PayPal"
  if (payment.contextType === "ORDER") return "Wallet"
  return "Unknown"
}

export async function getAdminPayments(): Promise<AdminPayment[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const payments = await db.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { payer: true, job: true, order: true, paymentMethod: true },
  })

  return payments.map((p) => ({
    id: p.id,
    user: p.payer.name,
    context: p.job?.title ?? (p.order ? `Order ${p.order.orderNumber}` : p.contextType),
    amount: Number(p.amount),
    method: deriveMethod(p),
    status: STATUS_LABEL[p.status] ?? "Pending",
    date: p.createdAt.toISOString(),
    externalRef: p.externalRef,
  }))
}

export type AdminPaymentActionResult = { success: true; status: AdminPaymentStatus } | { success: false; error: string }

const idSchema = z.object({ paymentId: z.string().trim().min(1) })

export async function recheckPaymentStatus(input: unknown): Promise<AdminPaymentActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const payment = await db.payment.findUnique({ where: { id: parsed.data.paymentId } })
  if (!payment) return { success: false, error: "Payment not found." }
  if (payment.status !== "PENDING" && payment.status !== "PROCESSING") {
    return { success: false, error: "Only pending or processing payments can be rechecked." }
  }
  if (!payment.externalRef) return { success: false, error: "This payment has no gateway reference to check." }

  const ref = payment.externalRef
  let newStatus: AdminPaymentStatus = STATUS_LABEL[payment.status] ?? "Pending"

  if (ref.startsWith("ws_CO_")) {
    const result = await queryMpesaPayment(ref)
    if (result) {
      const success = result.resultCode === 0
      await db.payment.update({ where: { id: payment.id }, data: { status: success ? "COMPLETED" : "FAILED", paidAt: success ? new Date() : undefined } })
      if (payment.jobId) success ? await confirmJobPayment(payment.jobId) : await failJobPayment(payment.jobId)
      newStatus = success ? "Completed" : "Failed"
    }
  } else if (ref.startsWith("cs_")) {
    const stripeStatus = await retrieveStripeSessionStatus(ref)
    if (stripeStatus === "paid") {
      await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
      if (payment.jobId) await confirmJobPayment(payment.jobId)
      newStatus = "Completed"
    }
  } else {
    return { success: false, error: "This payment method doesn't support an active status check." }
  }

  await logAdminAction({
    userId: admin.userId,
    action: "payment.recheck",
    entityType: "Payment",
    entityId: payment.id,
    oldValues: { status: payment.status },
    newValues: { status: newStatus },
  })

  return { success: true, status: newStatus }
}
