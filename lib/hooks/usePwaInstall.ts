"use client"

import { useEffect, useState, useCallback } from "react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isRunningInstalled(): boolean {
  if (typeof window === "undefined") return false
  // Standard cross-browser check (Chrome/Edge/Android) plus iOS Safari's
  // own non-standard flag — covers "already installed and currently
  // launched as the app" regardless of how it was opened.
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Real browser-native "install as app" support (this project ships a real
 * PWA manifest, public/manifest.json) — not a fake App/Play Store badge,
 * since there's no native app build in this codebase. Chrome/Edge/Android
 * fire `beforeinstallprompt` when the manifest+service-worker criteria are
 * met.
 *
 * `beforeinstallprompt` alone isn't a reliable "not installed yet" signal —
 * some Chrome/Android versions still fire it even when this exact PWA is
 * already installed (manifest's start_url is "/", the same landing page
 * this button lives on, so opening the already-installed app can land
 * right back here). Explicitly checking the standalone display mode closes
 * that gap: a user who opened the real installed app never sees a
 * "Download App" button whose only visible effect would be re-triggering
 * the OS's install/update flow on the app they're already inside of. */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [alreadyInstalled, setAlreadyInstalled] = useState(false)

  useEffect(() => {
    setAlreadyInstalled(isRunningInstalled())

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      if (isRunningInstalled()) return
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setAlreadyInstalled(true)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }, [deferredPrompt])

  return { canInstall: Boolean(deferredPrompt) && !alreadyInstalled, promptInstall }
}
