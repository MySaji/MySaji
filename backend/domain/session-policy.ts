export const SESSION_IDLE_MS = 60 * 60 * 1000
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000
export const SESSION_WARNING_MS = 2 * 60 * 1000

export function sessionExpired(startedAt: number, lastActivityAt: number, now = Date.now()): boolean {
  return !Number.isFinite(startedAt) || !Number.isFinite(lastActivityAt) ||
    now >= startedAt + SESSION_ABSOLUTE_MS || now >= lastActivityAt + SESSION_IDLE_MS
}
