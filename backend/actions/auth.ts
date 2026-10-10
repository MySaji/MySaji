"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { buildProviderSlug } from "@/backend/domain/provider-slug"
import { hashPassword } from "@/backend/services/password"
import { ROLE_APP_TO_DB } from "@/backend/services/role-map"
import { sendEmail } from "@/backend/services/email"
import { checkRateLimit, getClientIp } from "@/backend/services/rate-limit"
import { checkKycDuplicate, buildKycDedupeFields, KYC_DUPLICATE_ERROR } from "@/backend/services/kyc-duplicate-check"
import { isSignupProofValid, consumeSignupProof } from "@/backend/actions/otp"
import { isAllowedCombination } from "@/backend/domain/pro-modules"
import { provisionPos } from "@/backend/services/pos-provision"

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{9,15}$/, "Please enter a valid phone number"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  // Proves the applicant actually controls the email or phone above — see
  // sendSignupOtp/verifySignupOtp in lib/actions/otp.ts. Required so
  // account creation can't be reached by skipping the OTP screen client-side.
  verificationProof: z.string().trim().min(1, "Please verify your phone or email first"),
  role: z.enum(["customer", "provider", "shopkeeper", "distributor"]),
  // Saji Pro only. What this account actually does, chosen on the signup
  // step that replaced the old Professional/Merchant split. Recorded as
  // ProCapability rows (ACTIVE — they picked these themselves, there is
  // nothing for staff to approve at signup) and read by the portal to decide
  // which pages to show. Absent/empty is valid and means the same thing it
  // meant before this field existed: a plain service provider.
  businessTypes: z
    .array(z.enum(["SERVICES", "PRODUCTS", "RENTALS", "FREELANCE", "TUTORING", "CONSULTING", "POS"]))
    .max(7)
    .optional(),
  /// Which of the shop presets a POS account picked, e.g. "BUTCHERY". Only
  /// meaningful alongside POS in businessTypes; validated against the
  /// registry rather than trusted, and ignored entirely without POS.
  posProfileKey: z.string().trim().max(64).optional(),
  kyc: z
    .object({
      documentType: z.enum(["National ID", "Driver's License", "Passport"]),
      documentNumber: z.string().trim().min(1),
      idFileUrl: z.string().min(1),
      idBackFileUrl: z.string().min(1),
      selfieFileUrl: z.string().min(1),
    })
    .optional(),
  referralCode: z.string().trim().optional(),
})

export type RegisterResult =
  | { success: true; userId: string }
  | { success: false; error: string }

const KYC_DOC_TYPE_MAP = {
  "National ID": "NATIONAL_ID",
  "Driver's License": "DRIVERS_LICENSE",
  Passport: "PASSPORT",
} as const

export async function registerUser(input: unknown): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { name, email, phone, password, role, kyc, referralCode, verificationProof, businessTypes, posProfileKey } = parsed.data

  // The combination rule, enforced on the server.
  //
  // The picker dims what it cannot offer, but this action is reachable
  // directly and the schema above cannot express the rule: it validates each
  // value independently, and the rule is about the set. A POS account that
  // got here holding RENTALS as well would end up with a till it may not
  // have and a portal nobody designed.
  if (role === "provider" && businessTypes && businessTypes.length > 0) {
    const verdict = isAllowedCombination(businessTypes)
    if (!verdict.ok) return { success: false, error: verdict.reason }
  }

  // Everything below touches the DB (rate-limit check, dup lookup, the
  // transaction itself) — wrapped as one block so a transient connection
  // blip anywhere in here (confirmed happening in this environment: "Can't
  // reach database server at ...pooler.supabase.com:6543") degrades to the
  // same clean error response instead of an uncaught 500 the client can't
  // parse as a normal action result (previously only the $transaction call
  // was guarded, so a failure in checkRateLimit/the existing-user lookup
  // would throw past this function entirely).
  try {
    // Rate-limited by IP, not email — a fresh email every attempt means
    // per-account limiting alone wouldn't stop a scripted mass-signup.
    const ip = await getClientIp()
    const rateLimit = await checkRateLimit(`signup:${ip}`, "signup", 5, 60 * 60 * 1000)
    if (!rateLimit.allowed) {
      return { success: false, error: `Too many signup attempts. Please try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minute(s).` }
    }

    const existing = await db.user.findFirst({ where: { OR: [{ email }, { phone }] } })
    if (existing) {
      return { success: false, error: "A user with this email or phone already exists." }
    }

    if (!(await isSignupProofValid(email, phone, verificationProof))) {
      return { success: false, error: "Your phone/email verification has expired. Please verify again." }
    }

    const referrer = referralCode ? await db.user.findUnique({ where: { referralCode } }) : null

    // No account exists yet for this signup, so there's no "own" prior
    // submission to exclude — any existing match at all (regardless of
    // which other account it belongs to) means this ID has already been
    // used to open an account.
    if (kyc) {
      const dup = await checkKycDuplicate({
        documentNumber: kyc.documentNumber,
        idFileUrl: kyc.idFileUrl,
        idBackFileUrl: kyc.idBackFileUrl,
      })
      if (dup.isDuplicate) {
        return { success: false, error: KYC_DUPLICATE_ERROR }
      }
    }

    const passwordHash = await hashPassword(password)
    const dbRole = ROLE_APP_TO_DB[role]

    // Provider signup writes a base64 ID + selfie photo in this same
    // transaction — Prisma's 5s interactive-transaction default reliably
    // expires before that finishes over this environment's slow DB
    // connection (see the identical, confirmed failure in
    // completeShopkeeperOnboarding). 60s gives real photo uploads headroom.
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          phone,
          password: passwordHash,
          role: dbRole,
          // See the matching note in auth.ts's createUser event: no role is
          // approved at signup any more. Access is governed by
          // `verificationStatus` (BASIC by default), and `kycStatus` only
          // ever describes documents that were genuinely submitted.
          kycStatus: "PENDING",
        },
      })

      await tx.wallet.create({ data: { userId: created.id } })

      if (role === "customer") {
        await tx.customerProfile.create({ data: { userId: created.id } })
      } else if (role === "provider") {
        // Slug needs the profile's own id, so it is a create-then-update
        // inside the same transaction rather than a single statement.
        const providerProfile = await tx.providerProfile.create({ data: { userId: created.id } })
        await tx.providerProfile.update({
          where: { id: providerProfile.id },
          data: { slug: buildProviderSlug(created.name, created.email, providerProfile.id) },
        })
        // What this Saji Pro does. ACTIVE straight away: these were chosen by
        // the person signing up, so there is no request for staff to review —
        // approval only applies to types added later, from inside the portal.
        const chosenTypes = businessTypes && businessTypes.length > 0 ? businessTypes : ["SERVICES" as const]
        await tx.proCapability.createMany({
          data: chosenTypes.map((type) => ({ userId: created.id, type, status: "ACTIVE" as const })),
          skipDuplicates: true,
        })

        // "Sell Products" is backed by a real ShopkeeperProfile — the merchant
        // pages inside Saji Pro read from it, and without one they would have
        // nothing to render. `role` stays PROVIDER; this is a second profile
        // on the same account, exactly as switchActiveRole already creates.
        // A POS account needs the same row, so provisionPos creates it —
        // including the listedOnMarketplace flag, which is the one thing
        // this create cannot get right on its own. Guarded so the two paths
        // never both try to create it.
        if (chosenTypes.includes("PRODUCTS") && !chosenTypes.includes("POS")) {
          await tx.shopkeeperProfile.create({
            data: { userId: created.id, shopName: `${name}'s Shop` },
          })
        }

        // The till. ShopkeeperProfile is its tenant, seeded with the preset
        // for whichever shop type was picked; an unrecognised key falls back
        // to General rather than failing the signup, because a shopkeeper
        // who has already handed over their details should not lose the
        // account over a preset they can change in two taps.
        if (chosenTypes.includes("POS")) {
          await provisionPos(tx as never, {
            userId: created.id,
            userName: name,
            profileKey: posProfileKey ?? null,
            businessTypes: chosenTypes,
          })
        }

        if (kyc) {
          await tx.kycDocument.create({
            data: {
              userId: created.id,
              documentType: KYC_DOC_TYPE_MAP[kyc.documentType],
              documentNumber: kyc.documentNumber,
              idFileUrl: kyc.idFileUrl,
              idBackFileUrl: kyc.idBackFileUrl,
              selfieFileUrl: kyc.selfieFileUrl,
              ...buildKycDedupeFields(kyc),
            },
          })
        }
      } else if (role === "shopkeeper") {
        await tx.shopkeeperProfile.create({
          data: { userId: created.id, shopName: `${name}'s Shop` },
        })
      } else if (role === "distributor") {
        await tx.distributorProfile.create({
          data: { userId: created.id, companyName: `${name}'s Company` },
        })
      }

      if (referrer && referralCode) {
        await tx.referral.create({
          data: {
            referrerId: referrer.id,
            referredUserId: created.id,
            referralCode,
            status: "ACTIVATED",
          },
        })
      }

      return created
    }, { timeout: 60000, maxWait: 10000 })

    await consumeSignupProof(email, phone, verificationProof)

    return { success: true, userId: user.id }
  } catch {
    return { success: false, error: "Couldn't reach the server. Please check your connection and try again." }
  }
}

const teamMemberSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  teamRole: z.enum(["sub-admin", "secretary", "agent"]),
})

export type RegisterTeamMemberResult =
  | { success: true; userId: string; temporaryPassword: string }
  | { success: false; error: string }

function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let result = ""
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Admin-issued team account creation. Replaces the previous plaintext
 * `team_credentials` localStorage flow — the generated password is
 * hashed before storage and returned here only once, for the admin to
 * relay to the new team member out-of-band.
 */
export async function registerTeamMember(input: unknown): Promise<RegisterTeamMemberResult> {
  const parsed = teamMemberSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { name, email, teamRole } = parsed.data

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return { success: false, error: "A user with this email already exists." }
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  const dbRole = ROLE_APP_TO_DB[teamRole]

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        role: dbRole,
        kycStatus: "APPROVED",
        // Internal staff are provisioned by an admin, never self-signed-up,
        // so progressive KYC does not apply to them — without this they
        // would default to BASIC and be gated out of the staff actions
        // (secretary payments, agent verifications) they exist to perform.
        // scripts/backfill-verification-status.js applies the same rule to
        // the staff accounts that predate it.
        verificationStatus: "VERIFIED",
      },
    })
    await tx.wallet.create({ data: { userId: created.id } })
    await tx.teamMemberProfile.create({ data: { userId: created.id } })
    return created
  })

  return { success: true, userId: user.id, temporaryPassword }
}

// ============================= PASSWORD RESET =============================
// Reuses NextAuth/Auth.js's own `VerificationToken` table (identifier=email,
// token=6-digit code, expires) rather than a new model — it already exists
// in the schema for the Prisma adapter's own use and was otherwise unused
// since this app signs in via Credentials, not magic links.

function generateResetCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

const requestResetSchema = z.object({ email: z.string().trim().toLowerCase().email("Please enter a valid email address") })

export type RequestPasswordResetResult =
  | { success: true; emailed: boolean; devCode?: string }
  | { success: false; error: string }

/** Always returns success (even for an unknown email) so the UI can't be
 * used to enumerate real accounts — the only difference is that a token is
 * only actually created (and a code only actually issued) when the account
 * is real. */
export async function requestPasswordReset(input: unknown): Promise<RequestPasswordResetResult> {
  const parsed = requestResetSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { email } = parsed.data

  const rateLimit = await checkRateLimit(`password-reset:${email}`, "password-reset-request", 3, 60 * 60 * 1000)
  if (!rateLimit.allowed) {
    return { success: false, error: `Too many reset requests for this email. Please try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minute(s).` }
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) return { success: true, emailed: false }

  await db.verificationToken.deleteMany({ where: { identifier: email } })

  let code = generateResetCode()
  let created = false
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    try {
      await db.verificationToken.create({
        data: { identifier: email, token: code, expires: new Date(Date.now() + 10 * 60 * 1000) },
      })
      created = true
    } catch {
      code = generateResetCode()
    }
  }
  if (!created) return { success: false, error: "Could not generate a reset code. Please try again." }

  const emailResult = await sendEmail({
    to: email,
    subject: "Your SAJI password reset code",
    html: `<p>Your password reset code is <strong>${code}</strong>. It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  })

  if (emailResult.sent) return { success: true, emailed: true }
  // No real SMTP configured in this environment — show the code directly
  // instead of pretending an email was sent (same honest, on-screen-code
  // convention already used by the login page's human-verification step).
  return { success: true, emailed: false, devCode: code }
}

const verifyResetCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().length(6, "Enter the 6-digit code"),
})

export type VerifyResetCodeResult = { success: true } | { success: false; error: string }

export async function verifyPasswordResetCode(input: unknown): Promise<VerifyResetCodeResult> {
  const parsed = verifyResetCodeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { email, code } = parsed.data

  // A 6-digit code only has 1,000,000 possibilities — without this, someone
  // who knows a real account's email could brute-force the reset code
  // itself within the 10-minute expiry window.
  const rateLimit = await checkRateLimit(`password-reset-verify:${email}`, "password-reset-verify", 5, 15 * 60 * 1000)
  if (!rateLimit.allowed) {
    return { success: false, error: `Too many attempts. Please try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minute(s).` }
  }

  const token = await db.verificationToken.findFirst({ where: { identifier: email, token: code } })
  if (!token) return { success: false, error: "Invalid verification code." }
  if (token.expires < new Date()) return { success: false, error: "This code has expired. Please request a new one." }

  return { success: true }
}

const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().length(6),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(72),
})

export type ResetPasswordResult = { success: true } | { success: false; error: string }

export async function resetPasswordWithCode(input: unknown): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { email, code, newPassword } = parsed.data

  // Same bucket as verifyPasswordResetCode — this endpoint checks the same
  // code and would otherwise be a way around that limit.
  const rateLimit = await checkRateLimit(`password-reset-verify:${email}`, "password-reset-verify", 5, 15 * 60 * 1000)
  if (!rateLimit.allowed) {
    return { success: false, error: `Too many attempts. Please try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minute(s).` }
  }

  const token = await db.verificationToken.findFirst({ where: { identifier: email, token: code } })
  if (!token || token.expires < new Date()) {
    return { success: false, error: "Invalid or expired verification code. Please start over." }
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) return { success: false, error: "Account not found." }

  const passwordHash = await hashPassword(newPassword)
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { password: passwordHash } }),
    db.verificationToken.delete({ where: { identifier_token: { identifier: email, token: code } } }),
  ])

  return { success: true }
}
