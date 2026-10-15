"use server"

import { initiateB2CPayment } from "@/backend/services/mpesa-payout"

import { queryMpesaPayment, retrieveStripeSessionStatus } from "@/backend/services/payment-gateways"

import crypto from "crypto"

import { confirmProSubscriptionPayment, confirmRentalBookingPayment } from "@/backend/services/settlement-core"

import { db } from "@/backend/db"

import { confirmWalletTopup, failWalletTopup } from "@/backend/services/wallet-core"

import { confirmJobPayment, failJobPayment } from "@/backend/services/payment-core"

import { auth } from "@/backend/auth"

import { mpesaB2CConfigured } from "@/backend/services/mpesa-config"

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

let mpesaToken: { access_token: string; expires_at: number } | null = null

async function getMpesaToken() {
  const now = Date.now()
  if (mpesaToken && mpesaToken.expires_at > now + 5000) return mpesaToken.access_token

  const key = process.env.MPESA_CONSUMER_KEY
  const secret = process.env.MPESA_CONSUMER_SECRET
  if (!key || !secret) throw new Error("Missing M-PESA credentials")

  const cred = Buffer.from(`${key}:${secret}`).toString("base64")
  const tokenUrl = process.env.MPESA_ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"

  const res = await fetch(tokenUrl, { headers: { Authorization: `Basic ${cred}` } })
  const json = await res.json()
  if (!json.access_token) throw new Error("Failed to get M-PESA token")
  mpesaToken = { access_token: json.access_token, expires_at: Date.now() + (json.expires_in || 3600) * 1000 }
  return mpesaToken.access_token
}

function b2cSecurityCredential(): string {
  // Safaricom's cert-encrypted initiator password, PKCS1 v1.5 padding —
  // required padding scheme per the Daraja spec (OAEP will not verify).
  // The cert is stored as a single-line env var with literal "\n" escapes
  // (the standard trick for putting PEM content in a .env file).
  const cert = process.env.MPESA_B2C_CERT!.replace(/\\n/g, "\n")
  const password = process.env.MPESA_INITIATOR_PASSWORD!
  return crypto.publicEncrypt({ key: cert, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(password)).toString("base64")
}

export type InitiateB2CResult = { success: boolean; conversationId?: string; message?: string }



async function confirmSubscriptionPaymentIfApplicable(payment: { contextType: string; payerId: string; amount: any; rentalBookingId?: string | null } | null) {
  if (!payment) return
  if (payment.contextType === "SUBSCRIPTION") {
    const providerProfile = await db.providerProfile.findUnique({ where: { userId: payment.payerId } })
    if (providerProfile) await confirmProSubscriptionPayment(providerProfile.id, Number(payment.amount))
  } else if (payment.contextType === "RENTAL" && payment.rentalBookingId) {
    await confirmRentalBookingPayment(payment.rentalBookingId)
  }
}

function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
}

function paypalBase() {
  return process.env.PAYPAL_ENVIRONMENT === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
}

async function getPaypalToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET
  if (!id || !secret) throw new Error("Missing PayPal credentials")

  const cred = Buffer.from(`${id}:${secret}`).toString("base64")
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${cred}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  })
  const data = await res.json()
  if (!data?.access_token) throw new Error("Failed to get PayPal token")
  return data.access_token
}

export async function capturePaypalOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, message: "Sign in first." }
  const owned = await db.payment.findFirst({ where: { externalRef: orderId, payerId: session.user.id } })
  if (!owned) return { success: false, message: "Payment not found." }
  if (!paypalConfigured()) return { success: false, message: "PayPal is not configured" }
  try {
    const token = await getPaypalToken()
    const res = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
    const data = await res.json()
    const success = res.ok && data?.status === "COMPLETED"

    const payment = await db.payment.findFirst({ where: { externalRef: orderId } }).catch(() => null)
    if (payment?.contextType === "WALLET_TOPUP") {
      if (success) await confirmWalletTopup(payment.id, "PayPal")
      else await failWalletTopup(payment.id)
    } else {
      await db.payment.updateMany({ where: { externalRef: orderId }, data: { status: success ? "COMPLETED" : "FAILED", paidAt: success ? new Date() : undefined } }).catch(() => {})
      if (payment && payment.jobId) {
        if (success) await confirmJobPayment(payment.jobId)
        else await failJobPayment(payment.jobId)
      } else if (payment && success) {
        await confirmSubscriptionPaymentIfApplicable(payment)
      }
    }
    await db.auditLog.create({ data: { action: "paypal-capture", entityType: "payment", entityId: orderId, newValues: data } }).catch(() => {})

    return { success, message: success ? undefined : data?.message || "PayPal payment was not completed" }
  } catch (err: any) {
    return { success: false, message: err?.message ?? "paypal capture error" }
  }
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
