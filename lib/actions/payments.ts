"use server"

import crypto from "crypto"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { confirmWalletTopup, failWalletTopup } from "@/lib/actions/wallet"
import { confirmProSubscriptionPayment } from "@/lib/actions/provider-subscription"
import { confirmRentalBookingPayment } from "@/lib/actions/rentals"
import { logJobEvent } from "@/lib/actions/job-events"
import { maybeRewardReferral } from "@/lib/actions/jobs"
import { pushToUser } from "@/lib/actions/push"
import { canAcceptAnotherJob } from "@/lib/job-limits"
import { createAndEmailReceipt } from "@/lib/actions/receipts"
import { mpesaB2CConfigured } from "@/lib/mpesa-config"

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
}

// ============================= M-PESA (Daraja) =============================

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

// Daraja only accepts MSISDNs in the 2547XXXXXXXX / 2541XXXXXXXX shape, but
// every "enter your M-Pesa number" field across the app (customer, provider,
// shopkeeper, distributor, secretary, agent) lets people type however they
// naturally would — 07XXXXXXXX, 7XXXXXXXX, with spaces/dashes, or already in
// 254 form. Normalizing once here (rather than in every form) means an STK
// push actually fires no matter which shape the user typed.
function normalizeMpesaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("254") && digits.length === 12) return digits
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `254${digits}`
  return digits
}

export async function initiateMpesaPayment(phone: string, amount: number, description = "SAJI Payment"): Promise<InitiatePaymentResult> {
  if (!mpesaConfigured()) {
    return { success: true, provider: "mpesa", requestId: `mpesa-sandbox-${Date.now()}`, simulated: true, message: "No M-PESA credentials configured — payment auto-completed as a sandbox simulation." }
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

/** Actively queries Daraja for the result of an STK push, for when the
 * callback webhook can't reach this environment (e.g. no public CALLBACK_URL
 * in local dev). Returns null if the query itself fails — caller should keep
 * treating the payment as still pending rather than fail it outright. */
// Safaricom's STK push ResultCode values that matter for telling a customer
// something more useful than one generic "payment failed" — pulled from the
// Daraja docs' documented set. Anything not listed here falls back to a
// generic message rather than guessing.
const MPESA_RESULT_REASONS: Record<number, string> = {
  1032: "You cancelled the M-Pesa payment.",
  1037: "The M-Pesa prompt timed out — you didn't enter your PIN in time.",
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

// ========================== M-PESA B2C (payouts) ===========================
// Sends money OUT to a customer's phone — the disbursement side of a
// withdrawal, as opposed to the STK push functions above which only ever
// collect money IN. This is a distinct Daraja API product from C2B/STK: it
// needs its own credentials (an initiator identity + a security credential
// derived from Safaricom's public certificate), and — per Safaricom — is
// generally only provisioned on a Paybill/organization shortcode, not a
// plain Till. See the B2C shortcode set up separately from MPESA_SHORTCODE.

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

/** Fires the actual Daraja B2C payment request. Result is asynchronous —
 * Safaricom acknowledges here, then POSTs the real outcome to `resultUrl`
 * later (see /api/payments/callback/mpesa/b2c/result). */
export async function initiateB2CPayment(phone: string, amount: number, remarks: string, resultUrl: string, timeoutUrl: string): Promise<InitiateB2CResult> {
  if (!mpesaB2CConfigured()) return { success: false, message: "B2C payouts are not configured yet." }

  try {
    const token = await getMpesaToken()
    const payload = {
      InitiatorName: process.env.MPESA_INITIATOR_NAME,
      SecurityCredential: b2cSecurityCredential(),
      CommandID: process.env.MPESA_B2C_COMMAND_ID || "BusinessPayment",
      Amount: Math.round(amount),
      PartyA: process.env.MPESA_B2C_SHORTCODE,
      PartyB: phone,
      Remarks: remarks.slice(0, 100),
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: "Withdrawal",
    }

    const endpoint = process.env.MPESA_ENVIRONMENT === "production"
      ? "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest"

    const res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok || data?.ResponseCode !== "0" || !data?.ConversationID) {
      return { success: false, message: data?.errorMessage || data?.ResponseDescription || "Failed to initiate M-PESA payout" }
    }

    return { success: true, conversationId: data.ConversationID }
  } catch (err: any) {
    return { success: false, message: err?.message ?? "B2C payout error" }
  }
}

/** The single place a Job actually becomes real to its provider: every
 * booking flow (Marketplace quick-book, Emergency, the dedicated wizard)
 * now creates the Job as PENDING_PAYMENT first, so this is where the
 * "provider gets notified" / "referral counts" / "status goes live"
 * side effects all actually happen — once, consistently, only once real
 * payment has cleared. */
export async function confirmJobPayment(jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.status !== "PENDING_PAYMENT") return

  const isEmergency = job.urgency === "URGENT"

  // Gap 4: a business staff member already at their concurrent-job cap
  // never lands straight on ACCEPTED — applies even to emergencies,
  // since force-stacking more work onto an already-slammed tech doesn't
  // actually serve the customer either.
  const canAccept = job.providerId ? await canAcceptAnotherJob(db, job.providerId) : false

  let newStatus: "ACCEPTED" | "PENDING"
  if (isEmergency) {
    // Emergency dispatch always accepts a real match immediately, regardless
    // of that provider's ordinary autoAccept preference — urgency shouldn't
    // be gated behind a setting meant for routine bookings.
    newStatus = job.providerId && canAccept ? "ACCEPTED" : "PENDING"
  } else {
    const availability = job.providerId
      ? await db.providerAvailability.findUnique({ where: { providerId: job.providerId } }).catch(() => null)
      : null
    newStatus = (availability?.autoAccept ?? false) && canAccept ? "ACCEPTED" : "PENDING"
  }

  await db.job.update({ where: { id: job.id }, data: { status: newStatus } }).catch(() => {})

  if (isEmergency) {
    if (job.providerId) {
      const provider = await db.providerProfile.findUnique({ where: { id: job.providerId }, include: { user: true } }).catch(() => null)
      if (provider) {
        await db.notification.create({
          data: {
            userId: provider.userId,
            title: "Urgent job request",
            message: `${job.title} needs immediate attention.`,
            type: "JOB",
            relatedType: "JOB",
            relatedId: job.id,
            actionUrl: "/provider/jobs",
          },
        }).catch(() => {})
        await pushToUser(provider.userId, {
          title: "Urgent job request",
          body: `${job.title} needs immediate attention.`,
          url: "/provider/jobs",
        }, "job")
      }
      await db.notification.create({
        data: {
          userId: job.customerId,
          title: "Emergency request dispatched",
          message: `${provider?.user.name ?? "A provider"} has been notified and will contact you shortly.`,
          type: "JOB",
          relatedType: "JOB",
          relatedId: job.id,
          actionUrl: "/customer/jobs",
        },
      }).catch(() => {})
    } else {
      await db.notification.create({
        data: {
          userId: job.customerId,
          title: "Emergency request submitted",
          message: "Your payment was received. We'll notify you as soon as a provider accepts.",
          type: "JOB",
          relatedType: "JOB",
          relatedId: job.id,
          actionUrl: "/customer/jobs",
        },
      }).catch(() => {})
    }
  } else {
    await db.notification.create({
      data: {
        userId: job.customerId,
        title: "Payment received",
        message: "Your payment was successful and your booking is confirmed.",
        type: "PAYMENT",
        relatedType: "JOB",
        relatedId: job.id,
        actionUrl: "/customer/jobs",
      },
    }).catch(() => {})

    // Previously the assigned provider was never told a paid booking existed
    // at all — bell notification or push — until they happened to open the
    // app and check their job list themselves.
    if (job.providerId) {
      const provider = await db.providerProfile.findUnique({ where: { id: job.providerId }, include: { user: true } }).catch(() => null)
      if (provider) {
        const isAutoAccepted = newStatus === "ACCEPTED"
        const title = isAutoAccepted ? "New job added to your schedule" : "New job request"
        const message = isAutoAccepted
          ? `"${job.title}" was automatically added to your schedule.`
          : `You have a new job request: "${job.title}". Review and respond in your job list.`
        await db.notification.create({
          data: {
            userId: provider.userId,
            title,
            message,
            type: "JOB",
            relatedType: "JOB",
            relatedId: job.id,
            actionUrl: "/provider/jobs",
          },
        }).catch(() => {})
        await pushToUser(provider.userId, { title, body: message, url: "/provider/jobs" }, "job")
      }
    }
  }

  await maybeRewardReferral(job.customerId).catch(() => {})

  await logJobEvent({
    jobId: job.id, type: "PAYMENT_CONFIRMED", actor: "CUSTOMER", actorUserId: job.customerId,
    description: "Payment received — booking confirmed", metadata: { amount: Number(job.price) },
  })
  if (newStatus === "ACCEPTED") {
    await logJobEvent({ jobId: job.id, type: "JOB_ACCEPTED", actor: "SYSTEM", description: "Automatically assigned and accepted" })
  }

  // Fire-and-forget, same reasoning as the Smart Cart checkout receipt in
  // lib/actions/cart.ts — never block/fail this on a PDF or email hiccup.
  const jobPayment = await db.payment.findFirst({
    where: { jobId: job.id, status: "COMPLETED" },
    orderBy: { paidAt: "desc" },
  }).catch(() => null)
  void createAndEmailReceipt({
    userId: job.customerId,
    type: "PAYMENT",
    paymentMethod: "Online Payment",
    transactionRef: jobPayment?.externalRef ?? null,
    lineItems: [{ label: job.title, description: job.description, quantity: 1, amount: Number(job.price) }],
    subtotal: Number(job.price),
    adjustments: [],
    totalAmount: Number(job.price),
    currency: job.currency,
  })
}

export async function failJobPayment(jobId: string, reason?: string) {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.status !== "PENDING_PAYMENT") return
  await db.notification.create({
    data: {
      userId: job.customerId,
      title: "Payment failed",
      message: reason ? `${reason} You can try again from your bookings.` : "Your payment could not be completed. You can try again from your bookings.",
      type: "PAYMENT",
      relatedType: "JOB",
      relatedId: job.id,
      actionUrl: "/customer/jobs",
    },
  }).catch(() => {})

  await logJobEvent({
    jobId: job.id, type: "PAYMENT_FAILED", actor: "SYSTEM",
    description: reason ? `Payment failed: ${reason}` : "Payment failed",
  })
}

/** Marks a Payment (found by its externalRef) as completed and confirms the
 * linked job. Used for the sandbox-simulation path in the initiate route,
 * sharing the same completion logic the real webhooks/pollers use. */
export async function markPaymentCompleted(externalRef: string): Promise<void> {
  const payment = await db.payment.findFirst({ where: { externalRef } })
  if (!payment) return
  await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
  if (payment.jobId) await confirmJobPayment(payment.jobId)
}

/** SUBSCRIPTION/RENTAL-context payments carry no jobId (the generic "else"
 * branch each gateway confirmation path falls into for non-wallet-topup
 * payments would otherwise just mark the Payment COMPLETED and stop) — this
 * looks up which of those two it is and actually applies the real side
 * effect (activating a Pro subscription / confirming a rental booking), the
 * real-payment-gateway counterpart to the simulated-mode confirm calls in
 * /api/payments/initiate. */
async function confirmSubscriptionPaymentIfApplicable(payment: { contextType: string; payerId: string; amount: any; rentalBookingId?: string | null } | null) {
  if (!payment) return
  if (payment.contextType === "SUBSCRIPTION") {
    const providerProfile = await db.providerProfile.findUnique({ where: { userId: payment.payerId } })
    if (providerProfile) await confirmProSubscriptionPayment(providerProfile.id, Number(payment.amount))
  } else if (payment.contextType === "RENTAL" && payment.rentalBookingId) {
    await confirmRentalBookingPayment(payment.rentalBookingId)
  }
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
            await db.payment.updateMany({ where: { externalRef: checkoutId }, data: { status: success ? "COMPLETED" : "FAILED", paidAt: success ? new Date() : undefined, failureReason: success ? null : verified.reason } }).catch(() => {})
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
    await db.auditLog.create({ data: { action: "mpesa-callback", entityType: "payment", entityId: checkoutId ?? "", newValues: payload } }).catch(() => {})
  } catch (e) {}
  return { ok: true }
}

// ============================= STRIPE =============================

export async function createStripeCheckout(amount: number, successUrl?: string, cancelUrl?: string): Promise<InitiatePaymentResult> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return { success: true, provider: "stripe", requestId: `stripe-sandbox-${Date.now()}`, simulated: true, message: "No Stripe credentials configured — payment auto-completed as a sandbox simulation." }
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

/** Fallback verification for when the Stripe webhook can't reach this
 * environment — actively retrieves the session instead of waiting on it. */
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
      if (payment?.contextType === "WALLET_TOPUP") {
        await confirmWalletTopup(payment.id, "Card")
      } else {
        await db.payment.updateMany({ where: { externalRef: session.id }, data: { status: "COMPLETED", paidAt: new Date() } }).catch(() => {})
        if (payment && payment.jobId) {
          await confirmJobPayment(payment.jobId)
        } else if (payment) {
          await confirmSubscriptionPaymentIfApplicable(payment)
        }
      }
      await db.auditLog.create({ data: { action: "stripe-checkout", entityType: "payment", entityId: session.id, newValues: session } }).catch(() => {})
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message }
  }
}

// ============================= PAYPAL (Orders v2) =============================

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
    return { success: true, provider: "paypal", requestId: `paypal-sandbox-${Date.now()}`, simulated: true, message: "No PayPal credentials configured — payment auto-completed as a sandbox simulation." }
  }

  try {
    const token = await getPaypalToken()
    const usdAmount = (amount * 0.0077).toFixed(2) // PayPal doesn't settle in KES; convert for the order total

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
    return { success: true, provider: "paypal", checkoutUrl: approveLink, requestId: data.id }
  } catch (err: any) {
    return { success: false, provider: "paypal", message: err?.message ?? "paypal error" }
  }
}

/** Called when PayPal redirects the customer back with ?token=<orderId>. */
export async function capturePaypalOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
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

export async function handlePaypalCallback(payload: any) {
  const orderId = payload?.resource?.id
  if (orderId && payload?.event_type === "CHECKOUT.ORDER.APPROVED") {
    await capturePaypalOrder(orderId)
  }
  await db.auditLog.create({ data: { action: "paypal-callback", entityType: "payment", entityId: orderId ?? "", newValues: payload } }).catch(() => {})
  return { ok: true }
}

// ============================= AIRTEL MONEY =============================
// No confirmed public REST contract for Airtel Money Kenya merchant
// collections is available in this environment — building against a guessed
// endpoint shape would be worse than an honest stub. Falls back to the same
// sandbox-simulation pattern as the other providers until real Airtel
// developer credentials + API docs are available.

function airtelConfigured() {
  return Boolean(process.env.AIRTEL_API_KEY && process.env.AIRTEL_API_SECRET)
}

export async function initiateAirtelPayment(phone: string, amount: number, description = "SAJI Payment"): Promise<InitiatePaymentResult> {
  if (!airtelConfigured()) {
    return { success: true, provider: "airtel", requestId: `airtel-sandbox-${Date.now()}`, simulated: true, message: "No Airtel Money credentials configured — payment auto-completed as a sandbox simulation." }
  }
  // Real Airtel Money integration requires Airtel's merchant API docs/credentials, not available here.
  return { success: false, provider: "airtel", message: "Airtel Money is configured but the real integration isn't implemented yet." }
}

export async function handleAirtelCallback(payload: any) {
  await db.auditLog.create({ data: { action: "airtel-callback", entityType: "payment", entityId: payload?.transactionId ?? "", newValues: payload } }).catch(() => {})
  return { ok: true }
}

// ============================= STATUS POLLING =============================

export type JobPaymentStatus = {
  jobStatus: string
  paymentStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REFUNDED" | "NONE"
  /** Set when paymentStatus is FAILED and the gateway told us why — e.g.
   * "You cancelled the M-Pesa payment." vs. a generic failure. */
  failureReason?: string | null
}

/** Single source of truth the frontend polls after initiating a payment.
 * Actively reconciles with the gateway when the local Payment is still
 * PENDING and the environment has no working webhook (e.g. local dev with
 * no public CALLBACK_URL) — rather than only ever waiting passively. */
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

  const freshJob = await db.job.findUnique({ where: { id: jobId } })
  const freshPayment = await db.payment.findUnique({ where: { id: payment.id } })
  return {
    jobStatus: freshJob?.status ?? job.status,
    paymentStatus: (freshPayment?.status as JobPaymentStatus["paymentStatus"]) ?? "PENDING",
    failureReason: freshPayment?.failureReason ?? null,
  }
}
