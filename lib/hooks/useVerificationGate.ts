"use client"

import { useCallback } from "react"
import { useAuthContext } from "@/lib/auth-context"
// From verification-capabilities, never verification-gate: the guard imports
// `auth` and Prisma, and pulling those into a client component is a build
// error (Next cannot bundle them for the browser).
import { satisfies, type Capability, type VerificationStatus } from "@/lib/verification-capabilities"

/**
 * Client half of progressive KYC. Reads the same capability table the server
 * guard does (lib/verification-gate.ts), so a button's enabled state and the
 * action behind it are decided by one rule rather than two that drift.
 *
 * This is a UX affordance only — it decides what to *show*. Every gated
 * action still calls requireVerified() on the server, because the session's
 * copy of the status is a cached JWT claim and nothing here is trustworthy.
 */
export function useVerificationGate() {
  const { user, isAuthenticated } = useAuthContext()
  const status: VerificationStatus = user?.verificationStatus ?? "basic"

  const can = useCallback((capability: Capability) => satisfies(status, capability), [status])

  return {
    status,
    isAuthenticated,
    /** Verified (or better) — the plain "can they transact at all" question. */
    isVerified: status === "verified" || status === "premium_verified",
    /** Documents are in with a reviewer. The UI says "under review" rather
     *  than "get verified" — offering the wizard again here reads as though
     *  the earlier submission was lost. */
    isUnderReview: status === "pending",
    can,
  }
}
