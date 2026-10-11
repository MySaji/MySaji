"use client"

import { useEffect, useState } from "react"
import { MonitorDown, X, Share, Plus, Info } from "lucide-react"

/**
 * Installing the till as an app on the counter machine.
 *
 * This is the "downloadable tool of its own" in its honest form. Installing
 * gives a real icon on the desktop or home screen that opens straight into
 * the register, in its own window with no browser chrome, under its own
 * manifest — so from the shopkeeper's side it is an app, not a bookmark.
 *
 * It is NOT a native binary, and it does NOT work offline yet. Both of those
 * are stated on the card rather than left to be discovered, because a till
 * that a shopkeeper believes works without a connection is a till that loses
 * them a morning's takings the first time the line drops.
 *
 * Three cases, because the platforms genuinely differ:
 *  - Chrome, Edge, Android: beforeinstallprompt fires, so there is a button.
 *  - iOS Safari: no prompt API at all, so it has to be instructions.
 *  - Already installed: nothing, because offering to install an app you are
 *    currently running inside reads as broken.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "saji-till-install-dismissed"

export function TillInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(true)   // assume installed until proven otherwise, so it never flashes
  const [dismissed, setDismissed] = useState(true)
  const [isIos, setIsIos] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    const running =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari does not report display-mode, only this non-standard flag.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setStandalone(running)

    const ua = window.navigator.userAgent
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua))

    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      // Private mode, or storage blocked. Showing the card is the safer
      // default: a shopkeeper who has not been offered the install cannot
      // ask for it.
      setDismissed(false)
    }

    const onPrompt = (e: Event) => {
      // Chrome shows its own mini-infobar otherwise, which is easy to miss
      // and cannot be re-triggered. Holding the event lets the till offer it
      // where the shopkeeper is actually looking.
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", () => { setPrompt(null); setStandalone(true) })

    // Registering the worker is what makes the install offer appear at all.
    // Scope "/provider/" rather than "/", so it cannot displace the app-wide
    // push worker, and rather than "/provider/till/", which would not have
    // covered the till page itself — see the note in public/provider/sw.js.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/provider/sw.js", { scope: "/provider/" })
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          // Ask it to sweep now that the page has loaded. The worker sees no
          // fetches on the load it was registered during, so without this a
          // till installed and taken offline the same morning would have the
          // page saved and none of the code that makes it a till.
          reg.active?.postMessage("precache")
        })
        .catch(() => {
          // Not fatal: the till works as a normal page, it just cannot be
          // installed. Nothing is shown about it, because a shopkeeper can
          // do nothing with that information.
        })
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, "1") } catch { /* nothing to do */ }
  }

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    setPrompt(null)
    if (outcome === "accepted") setStandalone(true)
  }

  if (standalone || dismissed) return null
  // Nothing to offer: not iOS, and the browser never said it could install.
  if (!prompt && !isIos) return null

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center flex-shrink-0">
          <MonitorDown className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Put the till on this machine</p>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            Adds a Saji Till icon that opens straight to the counter screen, in its own window
            with no browser around it.
          </p>

          {!showIosHelp && (
            <div className="mt-2 flex items-center gap-2">
              {prompt ? (
                <button
                  onClick={install}
                  className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold active:scale-95 transition-transform"
                >
                  Install
                </button>
              ) : (
                <button
                  onClick={() => setShowIosHelp(true)}
                  className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold active:scale-95 transition-transform"
                >
                  How to add it
                </button>
              )}
              <button onClick={dismiss} className="h-9 px-2 text-[11px] text-gray-400 active:scale-95">
                Not now
              </button>
            </div>
          )}

          {showIosHelp && (
            <ol className="mt-2 space-y-1 text-[11px] text-gray-600 dark:text-gray-300">
              <li className="flex items-center gap-1.5">
                <span className="font-semibold">1.</span> Tap <Share className="inline w-3 h-3" /> Share at the bottom of Safari
              </li>
              <li className="flex items-center gap-1.5">
                <span className="font-semibold">2.</span> Choose <Plus className="inline w-3 h-3" /> Add to Home Screen
              </li>
              <li><span className="font-semibold">3.</span> Tap Add. The till appears with your other apps.</li>
            </ol>
          )}

          {/* The limit, said up front rather than discovered at the counter. */}
          <p className="mt-2 flex items-start gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            It still needs an internet connection to ring up a sale. Working without one is
            being built next.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-1 w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 active:scale-90 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
