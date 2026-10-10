"use client"

import { useEffect, useRef } from "react"
import { signOut } from "next-auth/react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { SESSION_HEARTBEAT_KEY, clearSessionHeartbeat } from "@/frontend/lib/session-heartbeat"

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 15_000
// A real page refresh re-mounts this component and re-writes the heartbeat
// within milliseconds, so it never goes stale for that case — only a
// genuinely abandoned session (every tab closed) lets it age past this.
const HEARTBEAT_STALE_MS = 45_000
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const
const ACTIVITY_THROTTLE_MS = 2000

/** Mounted once inside AuthProvider. Enforces two real, independent session
 * policies while a user is signed in — neither is decorative:
 *
 * 1. Inactivity: signs out after 1 hour with zero real user interaction.
 * 2. Abandoned-tab detection: browsers give JS no reliable "tab was closed"
 *    event distinct from "page was refreshed" (this is a hard platform
 *    limitation, not an oversight) — so this uses a shared localStorage
 *    heartbeat instead. Any tab of the app refreshes it every 15s; if a new
 *    mount ever finds it older than ~45s, every tab must have been closed
 *    for a while, so the session is treated as abandoned and signed out.
 *    This means closing a tab doesn't sign out *instantly* — the earlier
 *    alternative (signing out on the `pagehide` event) would also fire on
 *    every ordinary page refresh, which is worse.
 */
export function SessionGuard() {
  const { isAuthenticated } = useAuthContext()
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActivityResetRef = useRef(0)

  useEffect(() => {
    if (!isAuthenticated) return

    const stored = localStorage.getItem(SESSION_HEARTBEAT_KEY)
    const lastBeat = stored ? Number(stored) : null
    if (lastBeat !== null && Date.now() - lastBeat > HEARTBEAT_STALE_MS) {
      clearSessionHeartbeat()
      // signOut() must complete BEFORE navigating, not run "in parallel" —
      // window.location.href unloads the page immediately, which aborts any
      // still-in-flight fetch (including signOut()'s cookie-clearing
      // request), leaving the session cookie intact. That previously left
      // people stuck on /auth/login while still fully signed in underneath,
      // so clicking "Home" bounced them right back into their account. This
      // app uses JWT sessions, so signOut() never touches the database
      // (see @auth/core's signout action) — it's just a cookie clear, fast
      // enough to await without a noticeable delay.
      signOut({ redirect: false }).finally(() => {
        window.location.href = "/auth/login?reason=tab-closed"
      })
      return
    }
    localStorage.setItem(SESSION_HEARTBEAT_KEY, String(Date.now()))
    const heartbeatInterval = setInterval(() => {
      localStorage.setItem(SESSION_HEARTBEAT_KEY, String(Date.now()))
    }, HEARTBEAT_INTERVAL_MS)

    const triggerIdleLogout = () => {
      clearSessionHeartbeat()
      // Same reasoning as the abandoned-tab path above: signOut() must
      // finish clearing the cookie before navigating away, or the
      // in-flight request gets aborted by the page unload and the session
      // is never actually cleared.
      signOut({ redirect: false }).finally(() => {
        window.location.href = "/auth/login?reason=inactivity"
      })
    }
    const resetIdleTimer = () => {
      const now = Date.now()
      if (now - lastActivityResetRef.current < ACTIVITY_THROTTLE_MS) return
      lastActivityResetRef.current = now
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(triggerIdleLogout, INACTIVITY_TIMEOUT_MS)
    }
    resetIdleTimer()
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }))

    return () => {
      clearInterval(heartbeatInterval)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetIdleTimer))
    }
  }, [isAuthenticated])

  return null
}
