/**
 * Progressive KYC — the policy itself, with no server dependencies.
 *
 * Deliberately separate from lib/verification-gate.ts: that module imports
 * `auth` and the Prisma client to enforce the policy, and the client-side
 * mirror (lib/hooks/useVerificationGate.ts) needs to *read* the same policy
 * without dragging any of that into the browser bundle. Importing the guard
 * from a client component pulls auth.ts, rate-limit.ts and Prisma along with
 * it, which is a build error, not merely wasteful.
 *
 * So: the table lives here and both sides import it. A button's enabled state
 * and the action behind it are still decided by one rule.
 */

/** Mirrors Prisma's VerificationStatus, lowercased for the session/UI — the
 *  same normalization `role` and `kycStatus` already get in auth.ts. */
export type VerificationStatus = "basic" | "pending" | "verified" | "premium_verified"

/**
 * Every action progressive KYC gates, named by what the user is trying to do
 * rather than by the function that implements it — several actions map to one
 * capability (a booking can start from a service, an offer, or a rental) and
 * the copy shown should depend on the intent, not the call site.
 */
export type Capability =
  // ---- Customer ----
  | "wallet.deposit"
  | "wallet.withdraw"
  | "wallet.addPaymentMethod"
  | "order.place"
  | "booking.create"
  | "service.request"
  | "payment.make"
  // ---- Merchant (shopkeeper / distributor) ----
  | "product.publish"
  | "order.accept"
  | "payout.receive"
  // ---- Provider (solo, Saji Pro, business) ----
  | "offer.publish"
  | "job.accept"
  | "offer.submit"
  | "escrow.participate"

/**
 * What each capability demands. Only "verified" is in use today —
 * PREMIUM_VERIFIED exists in the schema for a future enhanced tier and
 * already satisfies every requirement below, so adding it later is a
 * one-line change here rather than an audit of every call site.
 */
const REQUIREMENT: Record<Capability, Exclude<VerificationStatus, "basic" | "pending">> = {
  "wallet.deposit": "verified",
  "wallet.withdraw": "verified",
  "wallet.addPaymentMethod": "verified",
  "order.place": "verified",
  "booking.create": "verified",
  "service.request": "verified",
  "payment.make": "verified",
  "product.publish": "verified",
  "order.accept": "verified",
  "payout.receive": "verified",
  "offer.publish": "verified",
  "job.accept": "verified",
  "offer.submit": "verified",
  "escrow.participate": "verified",
}

/** Ascending capability order — a status satisfies a requirement when it
 *  ranks at least as high. Keeps the check a comparison rather than a set of
 *  equality tests that would need revisiting for every new tier. */
const RANK: Record<VerificationStatus, number> = {
  basic: 0,
  pending: 1,
  verified: 2,
  premium_verified: 3,
}

export function satisfies(status: VerificationStatus | undefined, capability: Capability): boolean {
  if (!status) return false
  return RANK[status] >= RANK[REQUIREMENT[capability]]
}

/**
 * The message shown when a gate blocks an action. Kept verbatim from the
 * product copy so every entry point says the same thing; the wizard the user
 * is then handed to is components/kyc/verification-gate-dialog.tsx.
 */
export const VERIFICATION_REQUIRED_MESSAGE =
  "Complete your identity verification to continue. Verification helps us protect customers, providers and merchants on SAJI."

/** "Is this account verified at all", for the many places that only need the
 *  yes/no rather than a specific capability — a profile badge, an onboarding
 *  checklist item. Accepts the loosely-typed session value. */
export function isVerifiedStatus(status: string | undefined): boolean {
  return status === "verified" || status === "premium_verified"
}

/**
 * Capabilities a *business* provider must additionally hold an approved
 * business permit for, on top of the identity verification everyone needs.
 *
 * Straight from the Business Pro rules: a business may build its company
 * profile, add branches and staff, build a portfolio and draft offers freely,
 * but may not publish offers, accept jobs, take customer money or withdraw
 * earnings until business verification is complete. A solo provider is
 * unaffected — nothing here applies unless ProviderProfile.isBusinessOwner.
 *
 * Deliberately does not include "offer.submit" (bidding on a request): the
 * rules name publishing, accepting, being paid and withdrawing, and widening
 * that on my own would block a legitimate business from quoting for work it
 * is allowed to pursue.
 */
export const BUSINESS_VERIFIED_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "offer.publish",
  "job.accept",
  "payout.receive",
  "escrow.participate",
])

/** Distinct from VERIFICATION_REQUIRED_MESSAGE so the UI can send a business
 *  owner to their company documents rather than to the identity wizard, which
 *  collects the wrong thing entirely. */
export const BUSINESS_VERIFICATION_REQUIRED_MESSAGE =
  "Complete your business verification to continue. We need your registered business permit before your company can publish, take on work, or be paid."
