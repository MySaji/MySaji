/**
 * Progressive KYC — server-side enforcement.
 *
 * The old model let an account do everything or nothing: providers,
 * shopkeepers and distributors were walled out of their entire portal until an
 * admin approved them, while customers were created APPROVED and could move
 * money without ever being checked. Both are replaced by one rule: an account
 * can explore, build and configure from the moment it exists, and verification
 * is demanded only at the point it tries to transact, publish, or move money.
 *
 * The policy table itself lives in lib/verification-capabilities.ts so the
 * client can read it without pulling `auth`/Prisma into the browser bundle.
 * This module is the half that enforces it, and is server-only.
 */

import type { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import {
  satisfies,
  BUSINESS_VERIFIED_CAPABILITIES,
  BUSINESS_VERIFICATION_REQUIRED_MESSAGE,
  VERIFICATION_REQUIRED_MESSAGE,
  type Capability,
  type VerificationStatus,
} from "@/lib/verification-capabilities"

// Re-exported so existing server-side importers keep working against this
// module alone; client components must import from verification-capabilities.
export { satisfies, VERIFICATION_REQUIRED_MESSAGE, BUSINESS_VERIFICATION_REQUIRED_MESSAGE }
export type { Capability, VerificationStatus }

export type GateFailure = {
  ok: false
  /** Distinguishes "sign in first" from "verify first" — the UI routes these
   *  to entirely different places. */
  reason: "unauthenticated" | "verification_required" | "business_verification_required"
  capability: Capability
  /** Where the account stands now, so the caller can say "under review"
   *  rather than "please verify" to someone who already submitted. */
  status: VerificationStatus | null
  error: string
}

export type GateSuccess = { ok: true; userId: string; status: VerificationStatus }

export type GateResult = GateSuccess | GateFailure

/**
 * Server-side guard for a restricted action. Reads the live DB row rather
 * than trusting the session's copy: a JWT minted before the user was approved
 * would otherwise keep them blocked until the token refreshed, and — the
 * direction that actually matters — a token minted before an admin *revoked*
 * an approval would keep working.
 *
 * Fails closed. If the lookup itself fails (this environment's pooled
 * connection does drop intermittently — see the retry notes in
 * lib/actions/auth.ts) the action is refused rather than allowed through.
 */
export async function requireVerified(capability: Capability): Promise<GateResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return {
      ok: false,
      reason: "unauthenticated",
      capability,
      status: null,
      error: "You must be signed in to do this.",
    }
  }

  let status: VerificationStatus | null = null
  try {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { verificationStatus: true },
    })
    status = (user?.verificationStatus?.toLowerCase() as VerificationStatus) ?? null
  } catch {
    return {
      ok: false,
      reason: "verification_required",
      capability,
      status: null,
      error: "Couldn't confirm your verification status. Please check your connection and try again.",
    }
  }

  if (!satisfies(status ?? undefined, capability)) {
    return {
      ok: false,
      reason: "verification_required",
      capability,
      status,
      error: VERIFICATION_REQUIRED_MESSAGE,
    }
  }

  // Business Pro: a company needs its registered permit approved on top of
  // the identity check above before it can publish, take on work, or be paid.
  // Only queried for the four capabilities that actually require it, and only
  // reaches the second query for an account that is genuinely a business —
  // solo providers and every non-provider role pay one indexed lookup at
  // most, and the ungated capabilities pay nothing.
  if (BUSINESS_VERIFIED_CAPABILITIES.has(capability)) {
    try {
      const profile = await db.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: { isBusinessOwner: true },
      })
      if (profile?.isBusinessOwner) {
        const permit = await db.kycDocument.findFirst({
          where: { userId: session.user.id, documentType: "BUSINESS_PERMIT", status: "APPROVED" },
          select: { id: true },
        })
        if (!permit) {
          return {
            ok: false,
            reason: "business_verification_required",
            capability,
            status,
            error: BUSINESS_VERIFICATION_REQUIRED_MESSAGE,
          }
        }
      }
    } catch {
      // Same fail-closed rule as the identity lookup above: an action that
      // cannot be shown to be permitted is refused, not allowed through.
      return {
        ok: false,
        reason: "business_verification_required",
        capability,
        status,
        error: "Couldn't confirm your business verification. Please check your connection and try again.",
      }
    }
  }

  return { ok: true, userId: session.user.id, status: status as VerificationStatus }
}

/**
 * Moves an account to PENDING when it submits documents for review.
 *
 * Deliberately an `updateMany` filtered on BASIC rather than a plain
 * `update`: an account that is already VERIFIED and submits a further
 * document (a business permit, say) must not be demoted to PENDING and lose
 * access while that sits in a queue. Only a rejection revokes verification —
 * see rejectKycDocument in lib/kyc-review-core.ts.
 *
 * Takes the transaction client so it commits atomically with the
 * KycDocument write it accompanies; every submission path already runs
 * inside an interactive transaction with a raised timeout, because these
 * writes carry multi-MB base64 photos.
 */
export async function markVerificationPending(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.user.updateMany({
    where: { id: userId, verificationStatus: "BASIC" },
    data: { verificationStatus: "PENDING" },
  })
}
