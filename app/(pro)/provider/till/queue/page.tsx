"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowLeft, CloudOff, RefreshCw, AlertTriangle, Check, Trash2, Loader2, Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePosOffline } from "@/lib/hooks/usePosOffline"

/**
 * Sales this device is holding, and the ones the server refused.
 *
 * Two lists, because they need opposite handling and conflating them is how
 * money goes missing.
 *
 *   WAITING — the server could not be reached. Nothing is wrong; they go on
 *   their own. Nobody needs to do anything.
 *
 *   REFUSED — the server was reached and said no. A sale the shop believes
 *   it made has NOT been recorded, and only a person can decide what to do
 *   about it. These never retry on their own and are never discarded
 *   automatically, because both of those would quietly lose the money.
 */

function sh(n: number): string {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TillQueuePage() {
  const offline = usePosOffline()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null)

  const waiting = offline.queue.filter((q) => q.status !== "failed")
  const refused = offline.queue.filter((q) => q.status === "failed")

  const doRetry = async (key: string) => { setBusyKey(key); await offline.retry(key); setBusyKey(null) }
  const doDiscard = async (key: string) => { setBusyKey(key); await offline.discard(key); setBusyKey(null); setConfirmDiscard(null) }

  return (
    <div className="p-3 max-w-2xl mx-auto space-y-3 pb-24">
      <Link href="/provider/till" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sales on this device</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          A sale rung up without a connection is kept here until the server has it. Nothing is
          lost by closing the till or the browser.
        </p>
      </div>

      {!offline.available && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
            This browser will not let the till store anything locally — private browsing, or site
            data is blocked. Sales cannot be held here, so the till needs a connection to work.
          </p>
        </div>
      )}

      {offline.available && offline.queue.length === 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center">
          <Check className="w-8 h-8 mx-auto text-emerald-500" strokeWidth={2.5} />
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Everything is through</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            No sales are waiting on this device.
          </p>
        </div>
      )}

      {/* ---- waiting ------------------------------------------------------- */}
      {waiting.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <CloudOff className="w-4 h-4 text-gray-400" /> Waiting to send ({waiting.length})
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void offline.sync()}
              disabled={offline.syncing}
              className="h-8 rounded-lg text-[11px] gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${offline.syncing ? "animate-spin" : ""}`} />
              {offline.syncing ? "Sending" : "Try now"}
            </Button>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">
            These go through on their own as soon as the connection is back. There is nothing to do.
          </p>
          <div className="space-y-1.5">
            {waiting.map((q) => (
              <div key={q.key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                      KSh {sh(q.summary.total)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {q.summary.itemCount} {q.summary.itemCount === 1 ? "item" : "items"} &middot;{" "}
                      {new Date(q.summary.occurredAt).toLocaleString("en-KE", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                      {q.attempts > 0 && ` · ${q.attempts} ${q.attempts === 1 ? "try" : "tries"}`}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-shrink-0">
                    {q.status === "sending"
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> sending</>
                      : <><CloudOff className="w-3 h-3" /> waiting</>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- refused -------------------------------------------------------- */}
      {refused.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Need your attention ({refused.length})
          </h2>
          <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-2 leading-snug">
            The server was reached and would not accept these. Each one is a sale your shop
            believes it made that is <span className="font-semibold">not recorded</span>. Fix what
            the message describes and try again, or discard it if it never really happened.
          </p>
          <div className="space-y-1.5">
            {refused.map((q) => (
              <div key={q.key} className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-900/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                      KSh {sh(q.summary.total)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {q.summary.itemCount} {q.summary.itemCount === 1 ? "item" : "items"} &middot;{" "}
                      {new Date(q.summary.occurredAt).toLocaleString("en-KE", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                {q.lastError && (
                  <p className="mt-1.5 text-[11px] text-red-700 dark:text-red-300 leading-snug">
                    {q.lastError}
                  </p>
                )}

                {confirmDiscard === q.key ? (
                  <div className="mt-2.5 rounded-lg bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900 p-2.5">
                    <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-snug">
                      Discarding means this sale is never recorded. The money stays in the drawer
                      with nothing to account for it. Sure?
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => void doDiscard(q.key)}
                        disabled={busyKey === q.key}
                        className="h-8 rounded-lg text-[11px] bg-red-600 hover:bg-red-700"
                      >
                        {busyKey === q.key ? <Loader2 className="w-3 h-3 animate-spin" /> : "Discard it"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDiscard(null)} className="h-8 rounded-lg text-[11px]">
                        Keep it
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => void doRetry(q.key)}
                      disabled={busyKey === q.key}
                      className="h-8 rounded-lg text-[11px] gap-1"
                    >
                      {busyKey === q.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Try again
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDiscard(q.key)}
                      className="h-8 rounded-lg text-[11px] gap-1 text-gray-500"
                    >
                      <Trash2 className="w-3 h-3" /> Discard
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- the limit, stated --------------------------------------------- */}
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
          The till keeps selling if the connection drops while it is open, and nothing you have
          rung up is ever lost. But <span className="font-medium">opening the till from cold
          still needs a connection</span> — it cannot start up without one yet.
        </p>
      </div>
    </div>
  )
}
