// Gap 6 (cancellation/no-show policy) — the pure "is this within the fee
// window" check, split out from lib/job-cancellation.ts (which touches the
// DB) so client components can import it too, e.g. to show a fee warning
// in the cancel-confirmation dialog before the customer commits.
export const LATE_CANCELLATION_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours

export function isWithinLateCancellationWindow(scheduledDate: Date | string): boolean {
  const scheduled = typeof scheduledDate === "string" ? new Date(scheduledDate) : scheduledDate
  return scheduled.getTime() - Date.now() < LATE_CANCELLATION_WINDOW_MS
}
