import "server-only"

import { matchesGatewayAmount } from "@/backend/domain/payment-verification"

import { settleConfirmedPayment } from "@/backend/services/payment-settlement"

import { paymentSimulationAllowed } from "@/backend/domain/payment-simulation"

import { db } from "@/backend/db"

import { confirmWalletTopup, failWalletTopup } from "@/backend/services/wallet-core"

import { confirmJobPayment, failJobPayment } from "@/backend/services/payment-core"

import Stripe from "stripe"

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
  gatewayAmount?: number
  gatewayCurrency?: string
}

let mpesaToken: { access_token: string; expires_at: number } | null = null

function mpesaConfigured() {
  return Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY)
}

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

function mpesaPassword(shortcode: string, passkey: string, timestamp: string) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64")
}

function mpesaTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)
}

function normalizeMpesaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("254") && digits.length === 12) return digits
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `254${digits}`
  return digits
}

export async function initiateMpesaPayment(phone: string, amount: number, description = "SAJI Payment"): Promise<InitiatePaymentResult> {
  if (!mpesaConfigured()) {
    if (!paymentSimulationAllowed(process.env)) return { success: false, provider: "mpesa", message: "This payment method is currently unavailable." }
    return { success: true, provider: "mpesa", requestId: `mpesa-sandbox-${Date.now()}`, simulated: true, message: "No M-PESA credentials configured. Payment auto-completed as a sandbox simulation." }
  }

  const normalizedPhone = normalizeMpesaPhone(phone)
  if (!/^254(7|1)\d{8}$/.test(normalizedPhone)) {
    return { success: false, provider: "mpesa", message: "Enter a valid M-Pesa phone number (e.g. 07XXXXXXXX or 2547XXXXXXXX)." }
  }

  try {
    const token = await getMpesaToken()
    const shortcode = process.env.MPESA_SHORTCODE!
    const passkey = process.env.MPESA_PASSKEY!
    const timestamp = mpesaTimestamp()
    const password = mpesaPassword(shortcode, passkey, timestamp)

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: normalizedPhone,
      PartyB: shortcode,
      PhoneNumber: normalizedPhone,
      CallBackURL: `${process.env.CALLBACK_URL || ""}/api/payments/callback/mpesa`,
      AccountReference: "SAJI",
      TransactionDesc: description,
    }

    const endpoint = process.env.MPESA_ENVIRONMENT === "production"
      ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"

    const res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok || !data?.CheckoutRequestID) {
      return { success: false, provider: "mpesa", message: data?.errorMessage || "Failed to initiate M-PESA STK push" }
    }

    return { success: true, provider: "mpesa", requestId: data.CheckoutRequestID, pending: true, message: "Check your phone to complete the M-PESA payment." }
  } catch (err: any) {
    return { success: false, provider: "mpesa", message: err?.message ?? "mpesa error" }
  }
}

const MPESA_RESULT_REASONS: Record<number, string> = {
  1032: "You cancelled the M-Pesa payment.",
  1037: "The M-Pesa prompt timed out. You didn't enter your PIN in time.",
  1: "Insufficient M-Pesa balance.",
  2001: "Incorrect M-Pesa PIN was entered.",
  1001: "You already have a similar M-Pesa transaction in progress.",
  1025: "Unable to reach your phone for the M-Pesa prompt.",
  9999: "An unknown error occurred with M-Pesa.",
}

function mpesaFailureReason(resultCode: number): string {
  return MPESA_RESULT_REASONS[resultCode] ?? "The M-Pesa payment could not be completed."
}

export async function queryMpesaPayment(checkoutRequestId: string): Promise<{ resultCode: number; reason: string | null } | null> {
  if (!mpesaConfigured()) return null
  try {
    const token = await getMpesaToken()
    const shortcode = process.env.MPESA_SHORTCODE!
    const passkey = process.env.MPESA_PASSKEY!
    const timestamp = mpesaTimestamp()
    const password = mpesaPassword(shortcode, passkey, timestamp)

    const endpoint = process.env.MPESA_ENVIRONMENT === "production"
      ? "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query"

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId }),
    })
    const data = await res.json()
    if (typeof data?.ResultCode === "undefined") return null
    const resultCode = Number(data.ResultCode)
    return { resultCode, reason: resultCode === 0 ? null : mpesaFailureReason(resultCode) }
  } catch {
    return null
  }
}

async function confirmSubscriptionPaymentIfApplicable(payment: { id: string }) {
  await settleConfirmedPayment(payment.id)
}

export async function handleMpesaCallback(payload: any) {
  let checkoutId: string | undefined
  try {
    checkoutId = payload?.Body?.stkCallback?.CheckoutRequestID
    if (checkoutId) {
      const payment = await db.payment.findFirst({ where: { externalRef: checkoutId } }).catch(() => null)
      // Skip already-resolved payments entirely (Daraja is known to retry
      // callbacks) — saves a redundant Daraja query, on top of the
      // idempotency guards confirmWalletTopup/failWalletTopup/confirmJobPayment
      // already have.
      if (payment && payment.status === "PENDING") {
        // Never trust this payload's own ResultCode/Amount as proof of
        // payment — Safaricom doesn't sign these callbacks, so anyone who
        // discovers this URL plus a valid CheckoutRequestID could POST a
        // forged "success" callback and get credited without paying.
        // Instead, treat the callback purely as a "go check now" trigger and
        // independently re-verify the real result via an authenticated
        // Daraja query (queryMpesaPayment) — the same never-trust-the-webhook
        // pattern capturePaypalOrder already uses for PayPal.
        const verified = await queryMpesaPayment(checkoutId)
        if (verified) {
          const success = verified.resultCode === 0
          if (payment.contextType === "WALLET_TOPUP") {
            if (success) await confirmWalletTopup(payment.id, "M-Pesa")
            else await failWalletTopup(payment.id, verified.reason ?? undefined)
          } else {
            await db.payment.updateMany({ where: { externalRef: checkoutId, status: "PENDING" }, data: { status: success ? "COMPLETED" : "FAILED", paidAt: success ? new Date() : undefined, failureReason: success ? null : verified.reason } })
            if (payment.jobId) {
              if (success) await confirmJobPayment(payment.jobId)
              else await failJobPayment(payment.jobId, verified.reason ?? undefined)
            } else if (success) {
              await confirmSubscriptionPaymentIfApplicable(payment)
            }
          }
        }
        // If the query itself failed (transient network blip), leave the
        // payment PENDING — checkJobPaymentStatus's own polling fallback
        // will retry the same verified query later rather than guessing here.
      }
    }
    await db.auditLog.create({ data: { action: "mpesa-callback", entityType: "payment", entityId: checkoutId ?? "", newValues: payload } })
  } catch { return { ok: false } }
  return { ok: true }
}

export async function createStripeCheckout(amount: number, successUrl?: string, cancelUrl?: string): Promise<InitiatePaymentResult> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    if (!paymentSimulationAllowed(process.env)) return { success: false, provider: "stripe", message: "This payment method is currently unavailable." }
    return { success: true, provider: "stripe", requestId: `stripe-sandbox-${Date.now()}`, simulated: true, message: "No Stripe credentials configured. Payment auto-completed as a sandbox simulation." }
  }

  try {
    const stripe = new Stripe(key, { apiVersion: "2022-11-15" })

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      // Stripe's unit_amount is always in the currency's smallest sub-unit —
      // KES is not one of Stripe's zero-decimal currencies, so this must be
      // amount * 100 (matching cents-for-USD) or every real charge silently
      // undercharges by 100x. Every other `amount` in this file (M-Pesa,
      // PayPal, Payment.amount in the DB) is already a plain whole-KES
      // number — this multiply is Stripe-API-specific, not a app-wide unit.
      line_items: [{ price_data: { currency: "kes", product_data: { name: "SAJI Service" }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
      mode: "payment",
      success_url: successUrl || `${process.env.CALLBACK_URL || ""}/customer/booking-confirmation?status=success`,
      cancel_url: cancelUrl || `${process.env.CALLBACK_URL || ""}/customer/booking?status=cancelled`,
    })
    return { success: true, provider: "stripe", checkoutUrl: session.url ?? undefined, requestId: session.id }
  } catch (err: any) {
    return { success: false, provider: "stripe", message: err?.message ?? "stripe error" }
  }
}

export async function retrieveStripeSessionStatus(sessionId: string): Promise<"paid" | "unpaid" | "unknown"> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return "unknown"
  try {
    const stripe = new Stripe(key, { apiVersion: "2022-11-15" })
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    return session.payment_status === "paid" ? "paid" : "unpaid"
  } catch {
    return "unknown"
  }
}

export async function handleStripeWebhook(payload: string, sig: string) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET")
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2022-11-15" })
    const event = stripe.webhooks.constructEvent(payload, sig, secret)

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any
      const payment = await db.payment.findFirst({ where: { externalRef: session.id } }).catch(() => null)
      if (session.payment_status !== "paid" || !payment || session.amount_total !== Math.round(Number(payment.amount) * 100) || session.currency?.toLowerCase() !== payment.currency.toLowerCase()) return { ok: false, error: "Payment verification mismatch" }
      if (payment.contextType === "WALLET_TOPUP") {
        await confirmWalletTopup(payment.id, "Card")
      } else {
        await db.payment.updateMany({ where: { externalRef: session.id, status: "PENDING" }, data: { status: "COMPLETED", paidAt: new Date() } })
        if (payment && payment.jobId) {
          await confirmJobPayment(payment.jobId)
        } else if (payment) {
          await confirmSubscriptionPaymentIfApplicable(payment)
        }
      }
      await db.auditLog.create({ data: { action: "stripe-checkout", entityType: "payment", entityId: session.id, newValues: session } })
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message }
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

export async function initiatePaypalPayment(amount: number, returnUrl?: string, cancelUrl?: string): Promise<InitiatePaymentResult> {
  if (!paypalConfigured()) {
    if (!paymentSimulationAllowed(process.env)) return { success: false, provider: "paypal", message: "This payment method is currently unavailable." }
    return { success: true, provider: "paypal", requestId: `paypal-sandbox-${Date.now()}`, simulated: true, message: "No PayPal credentials configured. Payment auto-completed as a sandbox simulation." }
  }

  try {
    const token = await getPaypalToken()
    const rate = Number(process.env.PAYPAL_KES_TO_USD_RATE)
    if (!Number.isFinite(rate) || rate <= 0) return { success: false, provider: "paypal", message: "PayPal exchange-rate configuration is unavailable." }
    const usdAmount = (amount * rate).toFixed(2)

    const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: usdAmount } }],
        application_context: {
          return_url: returnUrl || `${process.env.CALLBACK_URL || ""}/customer/booking?paypal=return`,
          cancel_url: cancelUrl || `${process.env.CALLBACK_URL || ""}/customer/booking?paypal=cancel`,
        },
      }),
    })
    const data = await res.json()
    const approveLink = data?.links?.find((l: any) => l.rel === "approve")?.href
    if (!res.ok || !approveLink) {
      return { success: false, provider: "paypal", message: data?.message || "Failed to create PayPal order" }
    }
    return { success: true, provider: "paypal", checkoutUrl: approveLink, requestId: data.id, gatewayAmount: Number(usdAmount), gatewayCurrency: "USD" }
  } catch (err: any) {
    return { success: false, provider: "paypal", message: err?.message ?? "paypal error" }
  }
}

export async function capturePaypalOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
  if (!paypalConfigured()) return { success: false, message: "PayPal is not configured" }
  const payment = await db.payment.findFirst({ where: { externalRef: orderId } })
  if (!payment) return { success: false, message: "Payment not found" }
  if (payment.status === "COMPLETED") {
    if (payment.jobId) await confirmJobPayment(payment.jobId)
    else await confirmSubscriptionPaymentIfApplicable(payment)
    return { success: true }
  }
  if (!payment.gatewayAmount || !payment.gatewayCurrency) return { success: false, message: "This legacy payment requires reconciliation." }
  try {
    const token = await getPaypalToken()
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    let res = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, { method: "POST", headers })
    let data = await res.json()
    if (!res.ok) {
      // A duplicate capture can be refused after the first request succeeded.
      res = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}`, { headers })
      data = await res.json()
    }
    const captures = data?.purchase_units?.flatMap((unit: any) => unit.payments?.captures ?? []) ?? []
    const currency = captures[0]?.amount?.currency_code
    const valid = res.ok && data?.status === "COMPLETED" && captures.length > 0
      && captures.every((capture: any) => capture.status === "COMPLETED" && capture.amount?.currency_code === currency)
      && matchesGatewayAmount({ amount: Number(payment.gatewayAmount), currency: payment.gatewayCurrency },
        { amount: captures.reduce((sum: number, capture: any) => sum + Number(capture.amount?.value), 0), currency: currency ?? "" })
    if (!valid) return { success: false, message: "Payment has not been verified. Check its status before retrying." }
    if (payment.contextType === "WALLET_TOPUP") await confirmWalletTopup(payment.id, "PayPal")
    else {
      await db.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "COMPLETED", paidAt: new Date() } })
      if (payment.jobId) await confirmJobPayment(payment.jobId)
      else await confirmSubscriptionPaymentIfApplicable(payment)
    }
    return { success: true }
  } catch {
    return { success: false, message: "Payment verification is temporarily unavailable." }
  }
}

export async function handlePaypalCallback(payload: any) {
  const orderId = payload?.resource?.id
  if (orderId && payload?.event_type === "CHECKOUT.ORDER.APPROVED") {
    await capturePaypalOrder(orderId)
  }
  await db.auditLog.create({ data: { action: "paypal-callback", entityType: "payment", entityId: orderId ?? "", newValues: payload } })
  return { ok: true }
}

function airtelConfigured() {
  return Boolean(process.env.AIRTEL_API_KEY && process.env.AIRTEL_API_SECRET)
}

export async function initiateAirtelPayment(phone: string, amount: number, description = "SAJI Payment"): Promise<InitiatePaymentResult> {
  if (!airtelConfigured()) {
    if (!paymentSimulationAllowed(process.env)) return { success: false, provider: "airtel", message: "This payment method is currently unavailable." }
    return { success: true, provider: "airtel", requestId: `airtel-sandbox-${Date.now()}`, simulated: true, message: "No Airtel Money credentials configured. Payment auto-completed as a sandbox simulation." }
  }
  // Real Airtel Money integration requires Airtel's merchant API docs/credentials, not available here.
  return { success: false, provider: "airtel", message: "Airtel Money is configured but the real integration isn't implemented yet." }
}

export async function handleAirtelCallback(payload: any) {
  await db.auditLog.create({ data: { action: "airtel-callback", entityType: "payment", entityId: payload?.transactionId ?? "", newValues: payload } })
  return { ok: true }
}
