/** Shared constant between `SessionGuard` (which reads/writes it) and
 * `AuthProvider`'s logout path (which must clear it) — without clearing on
 * every deliberate logout, a fresh login right after would immediately see
 * the old stale timestamp and bounce the user straight back out. */
export const SESSION_HEARTBEAT_KEY = "saji_session_heartbeat"

export function clearSessionHeartbeat() {
  if (typeof window !== "undefined") localStorage.removeItem(SESSION_HEARTBEAT_KEY)
}
