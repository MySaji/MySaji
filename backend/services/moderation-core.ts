import { db } from "@/backend/db"
import { detectViolations } from "@/backend/domain/policy-violations"

/**
 * Blocking, reporting and violation recording.
 *
 * A plain module rather than a "use server" file: every export of one of
 * those is a public HTTP endpoint, and `recordViolations` writes moderation
 * rows from a caller-supplied user id — reachable from a browser that would
 * be a way to fabricate flags against anyone. Same shape as
 * lib/kyc-review-core.ts and lib/payment-core.ts. Re-exporting any of this
 * from a "use server" file recreates the endpoint it avoids.
 */

/**
 * How many DISTINCT people must report one account before it goes to an
 * admin. Distinct is the point: one person reporting the same provider three
 * times is one complaint, and counting rows instead of reporters would let a
 * single angry customer put anyone under review.
 */
export const REPORTS_BEFORE_REVIEW = 3

/** Whether `senderId` is currently blocked from writing to `recipientId`. */
export async function isBlockedFrom(senderId: string, recipientId: string): Promise<boolean> {
  const block = await db.chatBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: recipientId, blockedId: senderId } },
  })
  return block !== null
}

/** Records what a message tripped. Never throws into the send path: a
 *  failure to log a flag must not stop a message being delivered. */
export async function recordViolations(userId: string, messageId: string, text: string): Promise<void> {
  const violations = detectViolations(text)
  if (violations.length === 0) return

  await db.policyViolation.createMany({
    data: violations.map((v) => ({
      userId,
      messageId,
      kind: v.kind,
      severity: v.severity,
      excerpt: v.excerpt,
    })),
  }).catch(() => {})
}

export type ReportOutcome = { recorded: true; underReview: boolean } | { recorded: false; reason: string }

/**
 * Files a conduct report against a person and, once enough different people
 * have done so, marks the account for admin review.
 *
 * Marking is not a punishment — the account keeps working. It moves the
 * account into the admin queue, which is what "needs admin approval" has to
 * mean if reports are not to become a way for competitors to disable each
 * other. RESTRICTED, the status that actually limits an account, is only
 * ever set by a human.
 */
export async function reportUser(input: {
  reporterId: string
  reportedUserId: string
  reason: string
  contentSnapshot: string
}): Promise<ReportOutcome> {
  if (input.reporterId === input.reportedUserId) {
    return { recorded: false, reason: "You can't report yourself." }
  }

  const existing = await db.contentReport.findFirst({
    where: {
      targetType: "USER",
      targetId: input.reportedUserId,
      reporterId: input.reporterId,
      status: "PENDING",
    },
  })
  // Re-reporting while the first is still open would inflate the distinct
  // count by one person pressing the button repeatedly.
  if (existing) return { recorded: true, underReview: false }

  await db.contentReport.create({
    data: {
      targetType: "USER",
      targetId: input.reportedUserId,
      reportedUserId: input.reportedUserId,
      reporterId: input.reporterId,
      reason: input.reason,
      contentSnapshot: input.contentSnapshot.slice(0, 500),
      severity: "MEDIUM",
    },
  })

  const distinctReporters = await db.contentReport.findMany({
    where: { targetType: "USER", targetId: input.reportedUserId, status: "PENDING" },
    select: { reporterId: true },
    distinct: ["reporterId"],
  })

  if (distinctReporters.length >= REPORTS_BEFORE_REVIEW) {
    // updateMany filtered on CLEAR so a human decision already recorded
    // against this account (RESTRICTED) is never quietly downgraded by a
    // later report arriving.
    await db.user.updateMany({
      where: { id: input.reportedUserId, moderationStatus: "CLEAR" },
      data: { moderationStatus: "UNDER_REVIEW" },
    })
    return { recorded: true, underReview: true }
  }

  return { recorded: true, underReview: false }
}
