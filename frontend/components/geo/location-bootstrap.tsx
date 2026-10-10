"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { updateMyLocation } from "@/backend/actions/geo"

/** Only ask once per tab. A user who dismissed the browser prompt should not
 *  be re-prompted on every navigation. */
const ASKED_KEY = "saji-location-asked"
/** Don't rewrite the same fix on every page view — the stored position is
 *  only useful at roughly neighbourhood resolution anyway. Written only
 *  after a write actually lands: marking it up front meant one attempt
 *  aborted by a navigation (which is exactly what happens on the redirect
 *  straight after login) suppressed every retry for the next half hour. */
const SENT_KEY = "saji-location-sent-at"
const RESEND_AFTER_MS = 30 * 60 * 1000

/** Let the page paint and its data settle before a permission dialog can
 *  appear over it. The whole point of the IP origin is that nothing blocks
 *  on this. */
const PROMPT_DELAY_MS = 2500

function alreadySentRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(SENT_KEY))
    return Number.isFinite(at) && Date.now() - at < RESEND_AFTER_MS
  } catch {
    return false
  }
}

function remember(key: string, value: string) {
  try { sessionStorage.setItem(key, value) } catch { /* private mode */ }
}

/**
 * Upgrades the session's location from Vercel's city-level IP guess to a real
 * browser GPS fix, in the background, after the page is already usable.
 *
 * Mounted once per authenticated layout. It deliberately does NOT gate any
 * rendering: by the time this runs the feed has already been served from the
 * IP origin (see resolveLocationOrigin), so a user who ignores or denies the
 * prompt still sees nearby results — just coarser ones.
 *
 * When the permission was granted previously the browser answers with no
 * dialog at all, which is the common case after the first visit, and the
 * refresh below re-sorts the feed against the precise fix within a second or
 * two of landing.
 */
export function LocationBootstrap() {
  const router = useRouter()

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return
    if (alreadySentRecently()) return

    let cancelled = false

    const capture = (silent: boolean) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // Deliberately not guarded on `cancelled`: an unmount (the
          // post-login redirect, a route change) must not throw away a fix
          // we already have. Only the re-render below is skipped.
          try {
            const result = await updateMyLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            })
            if (!result.success) return
            // Only now is it genuinely sent. Recording it earlier would make
            // a failed or interrupted attempt look like a successful one.
            remember(SENT_KEY, String(Date.now()))
            // Re-run the server components so every "near me" section
            // re-sorts against the precise fix.
            if (!cancelled) router.refresh()
          } catch {
            // The action was interrupted — almost always the post-login
            // redirect tearing down the page mid-request. Deliberately
            // leaves SENT_KEY unset so the next page simply tries again.
          }
        },
        () => {
          // Denied, unavailable, or timed out. Nothing to do — the IP origin
          // is already in play and re-asking would be nagging.
          if (!silent) remember(ASKED_KEY, "1")
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
      )
    }

    // If permission is already granted this resolves with no dialog, so run
    // it straight away. Otherwise wait, so the first paint is never covered
    // by a permission prompt.
    const permissions = navigator.permissions
    if (permissions?.query) {
      permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (cancelled) return
          if (status.state === "granted") { capture(true); return }
          if (status.state === "denied") return
          let asked = false
          try { asked = sessionStorage.getItem(ASKED_KEY) === "1" } catch { /* private mode */ }
          if (asked) return
          setTimeout(() => { if (!cancelled) capture(false) }, PROMPT_DELAY_MS)
        })
        .catch(() => {
          // Safari historically rejects a geolocation permission query.
          setTimeout(() => { if (!cancelled) capture(false) }, PROMPT_DELAY_MS)
        })
    } else {
      setTimeout(() => { if (!cancelled) capture(false) }, PROMPT_DELAY_MS)
    }

    return () => { cancelled = true }
  }, [router])

  return null
}
