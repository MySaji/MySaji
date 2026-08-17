"use client"

import { useEffect, useRef } from "react"

interface OTPCredential extends Credential {
  code: string
}

/** WebOTP API (Android Chrome/WebView) — listens for an incoming SMS
 * containing a one-time code and hands it back without the user needing to
 * switch to Messages and copy/paste it. Not in TypeScript's default DOM
 * lib, so the browser API is accessed through a local type instead of a
 * full lib.dom augmentation.
 *
 * Requires the SMS body to end with a line like "@yourdomain.com #123456"
 * — the browser's own anti-phishing binding, without which the promise
 * simply never resolves. That line has to come from whatever SMS template
 * is configured for the OTP send (Infobip's 2FA product here, via
 * INFOBIP_2FA_MESSAGE_ID) — this hook can't inject it. Safe no-op
 * everywhere else: unsupported browsers (iOS Safari, desktop), the OTP
 * step already completed, or the component unmounting mid-wait. */
export function useOtpAutofill(active: boolean, onCode: (code: string) => void) {
  // A ref (not a dependency) for the callback — callers like the login/
  // signup pages re-render every second while a resend-cooldown timer
  // ticks, which would otherwise recreate `onCode` each render and make
  // the effect below tear down and restart `navigator.credentials.get()`
  // before it ever has a chance to resolve.
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    if (!active) return
    if (typeof window === "undefined" || !("OTPCredential" in window)) return

    const controller = new AbortController()
    navigator.credentials
      .get({
        // @ts-expect-error -- WebOTP's `otp` option isn't in TS's CredentialRequestOptions yet
        otp: { transport: ["sms"] },
        signal: controller.signal,
      })
      .then((credential) => {
        const code = (credential as OTPCredential | null)?.code
        if (code) onCodeRef.current(code)
      })
      .catch(() => {
        // AbortError on cleanup, or the platform declined — either way,
        // the manual 6-box input still works exactly as before.
      })

    return () => controller.abort()
  }, [active])
}
