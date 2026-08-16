"use server"

import { db } from "@/lib/db"
import { verifyPassword } from "@/lib/password"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendEmail } from "@/lib/email"
import { wrapEmailLayout, otpCodeBlock } from "@/lib/email-templates"
import { sendInfobipPin, verifyInfobipPin, normalizeKenyanPhone } from "@/lib/sms"
import crypto from "crypto"

function looksLikeEmail(value: string): boolean {
  return value.includes("@")
}

/** Resolves free-form user input (email or Kenyan phone in any common shape)
 * to the canonical form it's stored/keyed under everywhere else in this
 * flow — lowercased email, or E.164 phone. Returns null for an unrecognized
 * phone shape. */
function canonicalIdentifier(value: string): string | null {
  const trimmed = value.trim()
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase()
  return normalizeKenyanPhone(trimmed)
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function generateProofToken(): string {
  return crypto.randomBytes(24).toString("hex")
}

/** Only ever shown back to the user it belongs to — not a secrecy boundary,
 * just avoids flashing the full contact string across the OTP screen. */
function maskDestination(value: string): string {
  if (looksLikeEmail(value)) {
    const [user, domain] = value.split("@")
    return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`
  }
  return `${value.slice(0, 7)}${"*".repeat(Math.max(value.length - 10, 3))}${value.slice(-3)}`
}

async function issueAndSendCode(identifierKey: string, destination: string): Promise<{ sent: true } | { sent: false; error: string }> {
  await db.verificationToken.deleteMany({ where: { identifier: identifierKey } })

  if (looksLikeEmail(destination)) {
    // Self-generated code + real SMTP delivery — unchanged; Infobip's 2FA
    // product only covers the SMS/phone channel.
    let code = generateCode()
    let created = false
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        await db.verificationToken.create({ data: { identifier: identifierKey, token: code, expires: new Date(Date.now() + 10 * 60 * 1000) } })
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
        <p style="font-size:13px;color:#6b7280;">Didn't request this? You can safely ignore this email — no changes will be made to your account.</p>
      `,
    })
    const result = await sendEmail({ to: destination, subject: "Your SAJI verification code", html })
    if (!result.sent) return { sent: false, error: "Email service is not configured — could not send a code." }
    return { sent: true }
  }

  // Phone destinations: Infobip's 2FA API generates, stores, and verifies
  // the PIN itself — this app only ever learns the opaque pinId, stored
  // here as the "token" under the same identifier scheme every other
  // channel uses, never the PIN value.
  const result = await sendInfobipPin(destination)
  if (!result.sent) return { sent: false, error: result.error }
  await db.verificationToken.create({ data: { identifier: identifierKey, token: result.pinId, expires: new Date(Date.now() + 15 * 60 * 1000) } })
  return { sent: true }
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
    if (stored.token !== code) return { valid: false, error: "Invalid verification code." }
    return { valid: true }
  }

  // Phone: `stored.token` is Infobip's pinId, not the code itself — Infobip
  // is the source of truth for whether the submitted digits match.
  return verifyInfobipPin(stored.token, code)
}

// ============================= LOGIN OTP =============================
// A second factor gating the *existing* Credentials sign-in — this action
// only checks the password and dispatches a code; it never establishes a
// session. The client still calls the real signIn("credentials", ...) as
// the final step once verifyLoginOtp() below succeeds.

export type RequestLoginOtpResult = { success: true; destination: string } | { success: false; error: string }

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

  const result = await issueAndSendCode(`login-otp:${destination}`, destination)
  if (!result.sent) return { success: false, error: result.error }

  return { success: true, destination: maskDestination(destination) }
}

export type VerifyLoginOtpResult = { success: true } | { success: false; error: string }

export async function verifyLoginOtp(identifier: string, code: string): Promise<VerifyLoginOtpResult> {
  const destination = canonicalIdentifier(identifier)
  if (!destination) return { success: false, error: "Invalid verification code." }

  const result = await checkCode(`login-otp:${destination}`, code, destination, `otp-verify:${destination}`)
  if (!result.valid) return { success: false, error: result.error }

  await db.verificationToken.deleteMany({ where: { identifier: `login-otp:${destination}` } })
  return { success: true }
}

// ============================= SIGNUP OTP =============================
// Verifies the applicant actually controls the phone/email they're signing
// up with, before any account exists. Successful verification issues a
// short-lived proof token that registerUser() (lib/actions/auth.ts) must
// be given — the client can't skip straight to account creation without it.

export type SendSignupOtpResult = { success: true } | { success: false; error: string }

export async function sendSignupOtp(rawIdentifier: string): Promise<SendSignupOtpResult> {
  const destination = canonicalIdentifier(rawIdentifier)
  if (!destination) return { success: false, error: "Please enter a valid email or phone number." }

  const existing = await db.user.findFirst({ where: { OR: [{ email: destination }, { phone: destination }] } })
  if (existing) return { success: false, error: "An account with this email or phone already exists." }

  const sendLimit = await checkRateLimit(`otp-send:${destination}`, "otp-send", 3, 10 * 60 * 1000)
  if (!sendLimit.allowed) {
    return { success: false, error: `Too many codes requested. Please try again in ${Math.ceil(sendLimit.retryAfterSeconds / 60)} minute(s).` }
  }

  const result = await issueAndSendCode(`signup-otp:${destination}`, destination)
  if (!result.sent) return { success: false, error: result.error }
  return { success: true }
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

/** Used by registerUser() — not exported to the client. Confirms `proof` is
 * a live, unexpired token issued for either the email or the phone being
 * registered, without the caller needing to say which one it verified. */
export async function isSignupProofValid(email: string, phone: string, proof: string): Promise<boolean> {
  const normalizedPhone = normalizeKenyanPhone(phone) ?? phone
  const match = await db.verificationToken.findFirst({
    where: {
      token: proof,
      expires: { gt: new Date() },
      OR: [{ identifier: `signup-verified:${email.toLowerCase()}` }, { identifier: `signup-verified:${normalizedPhone}` }],
    },
  })
  return Boolean(match)
}

export async function consumeSignupProof(email: string, phone: string, proof: string): Promise<void> {
  const normalizedPhone = normalizeKenyanPhone(phone) ?? phone
  await db.verificationToken.deleteMany({
    where: { token: proof, OR: [{ identifier: `signup-verified:${email.toLowerCase()}` }, { identifier: `signup-verified:${normalizedPhone}` }] },
  })
}
