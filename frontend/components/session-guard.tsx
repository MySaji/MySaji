"use client"

import { useEffect, useState } from "react"
import { signOut, useSession } from "next-auth/react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { SESSION_IDLE_MS, SESSION_WARNING_MS } from "@/backend/domain/session-policy"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { suspendOfflineScope } from "@/frontend/lib/pos-offline-scope"
import { clearDevicePushSession } from "@/frontend/lib/device-push"
import { clearSessionHeartbeat } from "@/frontend/lib/session-heartbeat"

/** Only real interaction extends idle time; visibility and server polling do not. */
export function SessionGuard() {
  const { isAuthenticated, user } = useAuthContext()
  const { update } = useSession()
  const [remaining, setRemaining] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    const key = `saji.session.activity.${user.id}`
    let last = Date.now()
    let syncedAt = 0
    let ending = false
    let disposed = false
    const read = () => { try { const value = Number(localStorage.getItem(key)); if (value > 0 && value <= Date.now()) last = Math.max(last, value) } catch { /* storage is optional */ } }
    try { const stored = Number(localStorage.getItem(key)); if (stored > 0 && stored <= Date.now()) last = stored } catch { /* private mode */ }
    const loginPath = window.location.pathname.startsWith("/pos") ? "/pos/login" : "/auth/login"
    const end = async () => {
      if (ending) return
      ending = true
      setRemaining(0)
      try {
        suspendOfflineScope()
        await Promise.race([clearDevicePushSession().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))])
        let timeout: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([signOut({ redirect: false }), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Sign-out timed out")), 15_000) })])
        } finally { if (timeout) clearTimeout(timeout) }
        clearSessionHeartbeat()
        try { localStorage.removeItem(key) } catch { /* storage unavailable */ }
        window.location.replace(`${loginPath}?reason=inactivity`)
      } catch { ending = false; setFailed(true) }
    }
    const check = () => {
      read()
      const left = last + SESSION_IDLE_MS - Date.now()
      if (left <= 0) { void end(); return false }
      setRemaining(left <= SESSION_WARNING_MS ? Math.ceil(left / 1000) : null)
      return true
    }
    const activity = () => {
      if (document.visibilityState !== "visible" || ending || !check()) return
      const now = Date.now()
      if (now - last < 2000) return
      last = now
      try { localStorage.setItem(key, String(last)) } catch { /* optional cross-tab sync */ }
      setRemaining(null)
      if (now - syncedAt >= 60_000) {
        syncedAt = now
        void update({ userActivity: true }).then(session => { if (!disposed && !session) void end() }).catch(() => { syncedAt = 0 })
      }
    }
    const onStorage = (event: StorageEvent) => { if (event.key === key) check() }
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const
    check()
    const timer = setInterval(check, 1000)
    events.forEach(event => window.addEventListener(event, activity, { passive: true }))
    window.addEventListener("storage", onStorage)
    document.addEventListener("visibilitychange", check)
    return () => { disposed = true; clearInterval(timer); events.forEach(event => window.removeEventListener(event, activity)); window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", check) }
  }, [isAuthenticated, user?.id, update])
  if (!isAuthenticated || remaining === null) return null
  return <Dialog open><DialogContent showCloseButton={false} aria-label="Session expiry" onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()} className="z-[200] max-w-sm rounded-2xl"><DialogTitle>{remaining > 0 ? "Are you still there?" : "Your session has expired"}</DialogTitle><DialogDescription className="text-sm leading-6">{remaining > 0 ? `You will be signed out in ${remaining} seconds after an hour of inactivity. Select Continue working to stay signed in.` : failed ? "We could not finish signing out. Check your connection; we will retry automatically." : "Signing you out safely. Your saved records will remain available after login."}</DialogDescription>{remaining > 0 && <button onClick={() => { window.dispatchEvent(new KeyboardEvent("keydown")) }} className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground">Continue working</button>}</DialogContent></Dialog>
}
