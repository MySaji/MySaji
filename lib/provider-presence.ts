/**
 * What "online" means for a SAJI Pro, in one place.
 *
 * These live outside lib/actions/provider-availability.ts because a
 * "use server" module may only export async functions — a constant
 * exported from one fails the build even though TypeScript is happy with
 * it. Both the server queries and the client heartbeat import from here so
 * the two cannot drift: a client beating slower than the server's patience
 * would flicker providers offline while they are sitting there working.
 */

/**
 * How long after a provider's device last checked in we stop treating them
 * as online.
 *
 * "Online" has to mean a live session rather than a flag somebody set on
 * Tuesday. Browsers throttle timers in background tabs and stop them when
 * a phone sleeps, so this is generous enough to survive a provider
 * glancing at another app, and short enough that a closed laptop stops
 * advertising them within a few minutes.
 */
export const ONLINE_STALE_AFTER_MS = 5 * 60 * 1000

/**
 * Heartbeat cadence for the client. Comfortably inside the stale window so
 * a single missed beat — a lift, a GC pause, a slow request — does not
 * drop a provider who is genuinely there.
 */
export const HEARTBEAT_INTERVAL_MS = 90 * 1000

/** The cutoff a query compares `lastSeenAt` against. */
export function onlineSince(now: number = Date.now()): Date {
  return new Date(now - ONLINE_STALE_AFTER_MS)
}

/** Whether a provider counts as online right now: the flag AND a device
 *  that has checked in recently. Both halves are required — the flag alone
 *  is what goes stale. */
export function isLiveOnline(
  isOnline: boolean | null | undefined,
  lastSeenAt: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!isOnline || !lastSeenAt) return false
  return lastSeenAt.getTime() > now - ONLINE_STALE_AFTER_MS
}
