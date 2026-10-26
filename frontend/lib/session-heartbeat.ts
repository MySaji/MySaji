/** Clear legacy heartbeat and account-scoped idle timestamps on deliberate logout/login. */
export const SESSION_HEARTBEAT_KEY = "saji_session_heartbeat"

export function clearSessionHeartbeat() {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(SESSION_HEARTBEAT_KEY)
      for (const key of Object.keys(localStorage)) if (key.startsWith("saji.session.activity.")) localStorage.removeItem(key)
    } catch { /* Storage restrictions must never prevent logout. */ }
  }
}
