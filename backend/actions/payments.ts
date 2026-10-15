"use server"

import { queryMpesaPayment, retrieveStripeSessionStatus } from "@/backend/services/payment-gateways"

import { db } from "@/backend/db"

import { confirmJobPayment, failJobPayment } from "@/backend/services/payment-core"

import { auth } from "@/backend/auth"

export type InitiatePaymentResult = {
  success: boolean
  provider: string
  checkoutUrl?: string
  requestId?: string
  message?: string
  /** True when the caller must poll checkJobPaymentStatus() for the final result. */
  pending?: boolean
  /** True when no real gateway credentials are configured and the payment was
   * auto-completed as a sandbox simulation — clearly logged, never silent. */
  simulated?: boolean
}

export type InitiateB2CResult = { success: boolean; conversationId?: string; message?: string }

export async function capturePaypalOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, message: "Sign in first." }
  const owned = await db.payment.findFirst({ where: { externalRef: orderId, payerId: session.user.id } })
  if (!owned) return { success: false, message: "Payment not found." }
  const gateway = await import("@/backend/services/payment-gateways")
  return gateway.capturePaypalOrder(orderId)
}

export type JobPaymentStatus = {
  jobStatus: string
  paymentStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REFUNDED" | "NONE"
  /** Set when paymentStatus is FAILED and the gateway told us why — e.g.
   * "You cancelled the M-Pesa payment." vs. a generic failure. */
  failureReason?: string | null
}

export async function checkJobPaymentStatus(jobId: string): Promise<JobPaymentStatus | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.customerId !== session.user.id) return null

  const payment = await db.payment.findFirst({ where: { jobId }, orderBy: { createdAt: "desc" } })
  if (!payment) return { jobStatus: job.status, paymentStatus: "NONE" }

  if (payment.status === "PENDING" && payment.externalRef) {
    const ref = payment.externalRef
    if (ref.startsWith("ws_CO_")) {
      // M-Pesa CheckoutRequestID — actively query Daraja instead of only
      // waiting on a callback that can't reach this environment.
      const result = await queryMpesaPayment(ref)
      if (result) {
        const success = result.resultCode === 0
        await db.payment.update({ where: { id: payment.id }, data: { status: success ? "COMPLETED" : "FAILED", paidAt: success ? new Date() : undefined, failureReason: success ? null : result.reason } })
        if (success) await confirmJobPayment(jobId)
        else await failJobPayment(jobId, result.reason ?? undefined)
      }
    } else if (ref.startsWith("cs_")) {
      // Stripe Checkout session id — actively retrieve instead of only
      // waiting on the webhook.
      const stripeStatus = await retrieveStripeSessionStatus(ref)
      if (stripeStatus === "paid") {
        await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
        await confirmJobPayment(jobId)
      }
    }
    // Simulated (*-sandbox-*) payments are confirmed synchronously at
    // initiate time. PayPal orders are captured on redirect-back, not polled.
  }

  if (payment.status === "COMPLETED" && job.status === "PENDING_PAYMENT") await confirmJobPayment(jobId)
  const freshJob = await db.job.findUnique({ where: { id: jobId } })
  const freshPayment = await db.payment.findUnique({ where: { id: payment.id } })
  return {
    jobStatus: freshJob?.status ?? job.status,
    paymentStatus: (freshPayment?.status as JobPaymentStatus["paymentStatus"]) ?? "PENDING",
    failureReason: freshPayment?.failureReason ?? null,
  }
}
