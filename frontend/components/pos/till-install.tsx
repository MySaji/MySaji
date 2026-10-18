"use client"

import { useEffect, useState } from "react"
import { MonitorDown, X, Share, Plus, Info } from "lucide-react"

import { useTillInstall } from "@/frontend/components/pos/install-provider"

const DISMISS_KEY = "saji-till-install-dismissed"

export function TillInstall() {
  const { available, standalone, isIos, install } = useTillInstall()
  const [dismissed, setDismissed] = useState(true)
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      // Private mode, or storage blocked. Showing the card is the safer
      // default: a shopkeeper who has not been offered the install cannot
      // ask for it.
      setDismissed(false)
    }

  }, [])

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, "1") } catch { /* nothing to do */ }
  }

  if (standalone || dismissed) return null
  // Nothing to offer: not iOS, and the browser never said it could install.
  if (!available && !isIos) return null

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
              {available ? (
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
            Open the till online once to prepare this device. Offline sales use its saved catalogue and sync when the connection returns.
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
