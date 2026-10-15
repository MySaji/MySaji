"use server"

import { db } from "@/backend/db"

import { verifyPassword } from "@/backend/services/password"

import { checkRateLimit } from "@/backend/services/rate-limit"

import { sendEmail } from "@/backend/services/email"

import { wrapEmailLayout, otpCodeBlock } from "@/backend/services/email-templates"

import { sendInfobipPin, verifyInfobipPin, normalizeKenyanPhone } from "@/backend/services/sms"

import crypto from "crypto"

import { issueLoginProof } from "@/backend/services/login-proof"

function looksLikeEmail(value: string): boolean {
  return value.includes("@")
}

function canonicalIdentifier(value: string): string | null {
  const trimmed = value.trim()
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase()
  return normalizeKenyanPhone(trimmed)
}

function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString()
}

function generateProofToken(): string {
  return crypto.randomBytes(24).toString("hex")
}

function maskDestination(value: string): string {
  if (looksLikeEmail(value)) {
    const [user, domain] = value.split("@")
    return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`
  }
  return `${value.slice(0, 7)}${"*".repeat(Math.max(value.length - 10, 3))}${value.slice(-3)}`
}

type SendOutcome =
  | { sent: true; channel: "email" | "sms"; destination: string; fellBackToEmail: boolean }
  | { sent: false; error: string }

async function sendEmailCode(identifierKey: string, destination: string): Promise<{ sent: true } | { sent: false; error: string }> {
  await db.verificationToken.deleteMany({ where: { identifier: identifierKey } })
  {
    // Self-generated code + real SMTP delivery — unchanged; Infobip's 2FA
    // product only covers the SMS/phone channel.
    let code = generateCode()
    let created = false
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        await db.verificationToken.create({ data: { identifier: identifierKey, token: crypto.createHash("sha256").update(code).digest("hex"), expires: new Date(Date.now() + 10 * 60 * 1000) } })
        created = true
      } catch {
        code = generateCode()
      }
    }
    if (!created) return { sent: false, error: "Could not generate a verification code. Please try again." }

    const html = wrapEmailLayout({
      title: "Verify it's you",
      bodyHtml: `
        <p>Use the code below to continue on SAJI. It expires in 10 minutes.</p>
        ${otpCodeBlock(code)}
        <p style="font-size:13px;color:#6b7280;">Didn't request this? You can safely ignore this email. No changes will be made to your account.</p>
      `,
    })
    const result = await sendEmail({ to: destination, subject: "Your SAJI verification code", html })
    if (!result.sent) return { sent: false, error: "We could not send the code by email just now. Please try again shortly." }
    return { sent: true }
  }
}

async function issueAndSendCode(
  identifierKey: string,
  destination: string,
  fallbackEmail?: string,
): Promise<SendOutcome> {
  if (looksLikeEmail(destination)) {
    const r = await sendEmailCode(identifierKey, destination)
    return r.sent
      ? { sent: true, channel: "email", destination, fellBackToEmail: false }
      : { sent: false, error: r.error }
  }

  // Phone destinations: Infobip's 2FA API generates, stores, and verifies
  // the PIN itself — this app only ever learns the opaque pinId, stored
  // here as the "token" under the same identifier scheme every other
  // channel uses, never the PIN value.
  await db.verificationToken.deleteMany({ where: { identifier: identifierKey } })
  const result = await sendInfobipPin(destination)
  if (result.sent) {
    await db.verificationToken.create({ data: { identifier: identifierKey, token: result.pinId, expires: new Date(Date.now() + 15 * 60 * 1000) } })
    return { sent: true, channel: "sms", destination, fellBackToEmail: false }
  }

  const canFallBack =
    (result.reason === "unavailable" || result.reason === "unconfigured") &&
    Boolean(fallbackEmail && looksLikeEmail(fallbackEmail))
  if (!canFallBack) return { sent: false, error: result.error }

  const email = fallbackEmail!.trim().toLowerCase()
  // Keyed to the EMAIL, because that is what the code was sent to and what
  // the verify step will have to check against.
  const emailKey = identifierKey.replace(destination, email)
  const viaEmail = await sendEmailCode(emailKey, email)
  if (!viaEmail.sent) {
    return { sent: false, error: "We could not reach you by text or by email just now. Please try again shortly." }
  }
  return { sent: true, channel: "email", destination: email, fellBackToEmail: true }
}

async function checkCode(identifierKey: string, code: string, destination: string, rateLimitBucket: string): Promise<{ valid: true } | { valid: false; error: string }> {
  const rateLimit = await checkRateLimit(rateLimitBucket, "otp-verify", 5, 15 * 60 * 1000)
  if (!rateLimit.allowed) {
    return { valid: false, error: `Too many attempts. Please try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minute(s).` }
  }

  const stored = await db.verificationToken.findFirst({ where: { identifier: identifierKey } })
  if (!stored) return { valid: false, error: "Invalid verification code." }
  if (stored.expires < new Date()) return { valid: false, error: "This code has expired. Please request a new one." }

  if (looksLikeEmail(destination)) {
    if (stored.token !== crypto.createHash("sha256").update(code).digest("hex")) return { valid: false, error: "Invalid verification code." }
    return { valid: true }
  }

  // Phone: `stored.token` is Infobip's pinId, not the code itself — Infobip
  // is the source of truth for whether the submitted digits match.
  return verifyInfobipPin(stored.token, code)
}

export type RequestLoginOtpResult =
  | { success: true; destination: string; fellBackToEmail: boolean }
  | { success: false; error: string }

export async function requestLoginOtp(identifier: string, password: string): Promise<RequestLoginOtpResult> {
  if (!identifier || !password) return { success: false, error: "Please fill in all fields." }

  // Separate, more generous bucket than the strict login:* one authorize()
  // enforces on the real sign-in — this is just "is it worth sending a
  // code", not the authoritative brute-force guard.
  const precheck = await checkRateLimit(`otp-precheck:${identifier.trim().toLowerCase()}`, "otp-precheck", 8, 15 * 60 * 1000)
  if (!precheck.allowed) {
    return { success: false, error: `Too many attempts. Please try again in ${Math.ceil(precheck.retryAfterSeconds / 60)} minute(s).` }
  }

  const user = await db.user.findFirst({ where: { OR: [{ email: identifier }, { phone: identifier }] } })
  if (!user || !user.password || user.deletedAt) return { success: false, error: "Invalid email/phone or password" }

  const valid = await verifyPassword(password, user.password)
  if (!valid) return { success: false, error: "Invalid email/phone or password" }

  const destination = canonicalIdentifier(identifier)
  if (!destination) return { success: false, error: "That phone number doesn't look valid." }

  // Cost control on the actual send, keyed by destination (not identifier —
  // a caller can't rack up sends by trying multiple accounts that all
  // resolve to the same phone/email anyway, but this is the bucket that
  // actually matters for SMS spend).
  const sendLimit = await checkRateLimit(`otp-send:${destination}`, "otp-send", 3, 10 * 60 * 1000)
  if (!sendLimit.allowed) {
    return { success: false, error: `Too many codes requested. Please try again in ${Math.ceil(sendLimit.retryAfterSeconds / 60)} minute(s).` }
  }

  // Signing in by phone on an account that has an email: if the text cannot
  // be sent, the code goes to that email rather than locking the owner out
  // of their own shop over our SMS bill.
  const result = await issueAndSendCode(`login-otp:${destination}`, destination, user.email ?? undefined)
  if (!result.sent) return { success: false, error: result.error }

  return {
    success: true,
    destination: maskDestination(result.destination),
    fellBackToEmail: result.fellBackToEmail,
  }
}

export type VerifyLoginOtpResult = { success: true; proof: string } | { success: false; error: string }

export async function verifyLoginOtp(identifier: string, code: string): Promise<VerifyLoginOtpResult> {
  const destination = canonicalIdentifier(identifier)
  if (!destination) return { success: false, error: "Invalid verification code." }

  // The code may have gone to the account's email instead, so the phone key
  // is tried first and the email key second. Checking only the phone key
  // would refuse a code we ourselves chose to email.
  let result = await checkCode(`login-otp:${destination}`, code, destination, `otp-verify:${destination}`)
  let usedKey = `login-otp:${destination}`
  if (!result.valid && !looksLikeEmail(destination)) {
    const user = await db.user.findFirst({ where: { phone: destination }, select: { email: true } })
    if (user?.email) {
      const emailKey = `login-otp:${user.email.toLowerCase()}`
      const viaEmail = await checkCode(emailKey, code, user.email.toLowerCase(), `otp-verify:${destination}`)
      if (viaEmail.valid) { result = viaEmail; usedKey = emailKey }
    }
  }
  if (!result.valid) return { success: false, error: result.error }

  const user = await db.user.findFirst({ where: { OR: [{ email: destination }, { phone: destination }], deletedAt: null } })
  if (!user) return { success: false, error: "Account unavailable." }
  const consumed = await db.verificationToken.deleteMany({ where: { identifier: usedKey, expires: { gt: new Date() } } })
  if (consumed.count !== 1) return { success: false, error: "This code has already been used. Request another." }
  return { success: true, proof: await issueLoginProof(user.id) }
}

export type SendSignupOtpResult =
  | {
      success: true
      /** Where the code really went — may not be what was asked for. */
      destination: string
      channel: "email" | "sms"
      /** True when a text could not be sent and the email was used instead. */
      fellBackToEmail: boolean
    }
  | { success: false; error: string }

export async function sendSignupOtp(rawIdentifier: string, fallbackEmail?: string): Promise<SendSignupOtpResult> {
  const destination = canonicalIdentifier(rawIdentifier)
  if (!destination) return { success: false, error: "Please enter a valid email or phone number." }

  const existing = await db.user.findFirst({ where: { OR: [{ email: destination }, { phone: destination }] } })
  if (existing) return { success: false, error: "An account with this email or phone already exists." }

  const sendLimit = await checkRateLimit(`otp-send:${destination}`, "otp-send", 3, 10 * 60 * 1000)
  if (!sendLimit.allowed) {
    return { success: false, error: `Too many codes requested. Please try again in ${Math.ceil(sendLimit.retryAfterSeconds / 60)} minute(s).` }
  }

  // A signup form always collects both, so an SMS outage never has to end
  // the signup. The address is checked for an existing account first: a
  // fallback that emailed a code to someone already registered would be a
  // way to probe which addresses exist.
  let usableFallback: string | undefined
  if (fallbackEmail && looksLikeEmail(fallbackEmail) && !looksLikeEmail(destination)) {
    const email = fallbackEmail.trim().toLowerCase()
    const taken = await db.user.findFirst({ where: { email }, select: { id: true } })
    if (!taken) usableFallback = email
  }

  const result = await issueAndSendCode(`signup-otp:${destination}`, destination, usableFallback)
  if (!result.sent) return { success: false, error: result.error }
  return {
    success: true,
    destination: result.destination,
    channel: result.channel,
    fellBackToEmail: result.fellBackToEmail,
  }
}

export type VerifySignupOtpResult = { success: true; proof: string } | { success: false; error: string }

export async function verifySignupOtp(rawIdentifier: string, code: string): Promise<VerifySignupOtpResult> {
  const destination = canonicalIdentifier(rawIdentifier)
  if (!destination) return { success: false, error: "Invalid verification code." }

  const result = await checkCode(`signup-otp:${destination}`, code, destination, `otp-verify:${destination}`)
  if (!result.valid) return { success: false, error: result.error }

  await db.verificationToken.deleteMany({ where: { identifier: `signup-otp:${destination}` } })

  const proof = generateProofToken()
  await db.verificationToken.create({
    data: { identifier: `signup-verified:${destination}`, token: proof, expires: new Date(Date.now() + 15 * 60 * 1000) },
  })

  return { success: true, proof }
}
