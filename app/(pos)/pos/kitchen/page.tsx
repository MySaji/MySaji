"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Check, Maximize, Minimize } from "lucide-react"
import { getKitchenScreen, markLineReady, type KitchenTicket } from "@/backend/actions/pos-tables"

/**
 * The kitchen display.
 *
 * This is a monitor on a wall in a hot room, read at two or three metres by
 * somebody holding a knife. Everything about it follows from that: very large
 * type, no small controls, dark background so it is not a lamp, and one tap
 * per dish with a target big enough for a gloved hand.
 *
 * Tickets are ordered by how long they have been waiting, longest first,
 * because the one thing a kitchen screen must never do is make somebody scan
 * for the oldest ticket. The wait is colour coded for the same reason: past
 * ten minutes it stops being white.
 *
 * It polls rather than pushing. A kitchen that loses its connection for
 * thirty seconds should carry on showing the last orders it had, not an
 * error, and a poll degrades that way for free.
 */

const WAIT_TONE = (m: number) =>
  m >= 20 ? "bg-red-600 text-white"
    : m >= 10 ? "bg-amber-500 text-slate-900"
    : "bg-slate-700 text-slate-100"

export default function KitchenPage() {
  const [tickets, setTickets] = useState<KitchenTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)

  const refresh = async () => setTickets(await getKitchenScreen())

  useEffect(() => {
    let alive = true
    const tick = async () => {
      const next = await getKitchenScreen().catch(() => null)
      // Null means the call failed. Keeping the last good tickets on screen
      // is the right answer in a kitchen: stale orders beat no orders.
      if (alive && next) setTickets(next)
    }
    tick().finally(() => setLoading(false))
    const id = setInterval(tick, 10000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  const bump = async (lineId: string) => {
    // Optimistic: a cook who taps a dish and waits a second for the server
    // taps it again. Marked immediately, reconciled on the next poll.
    setTickets((prev) => prev.map((t) => ({
      ...t,
      lines: t.lines.map((l) => (l.id === lineId ? { ...l, ready: true } : l)),
    })))
    await markLineReady({ lineId }).catch(() => {})
    await refresh().catch(() => {})
  }

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link
          href="/pos/sell"
          className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 h-9 px-1 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" /> Till
        </Link>
        <h1 className="text-lg font-bold">Kitchen</h1>
        <button
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Leave full screen" : "Full screen"}
          className="h-10 w-10 rounded-lg flex items-center justify-center bg-white/10 active:scale-95"
        >
          {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center px-6">
          <p className="text-2xl font-bold text-slate-300">Nothing to cook</p>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Orders appear here the moment a waiter sends them.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 p-3">
          {tickets.map((t) => (
            <section key={t.orderId} className="rounded-2xl bg-slate-800 overflow-hidden flex flex-col">
              <header className="flex items-center justify-between px-3 py-2 bg-slate-700">
                <span className="text-xl font-bold">
                  {t.isTakeaway ? "Takeaway" : t.tableName ?? t.reference}
                </span>
                <span className={"px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums " + WAIT_TONE(t.waitingMinutes)}>
                  {t.waitingMinutes} min
                </span>
              </header>

              <ul className="flex-1 divide-y divide-white/5">
                {t.lines.map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => void bump(l.id)}
                      disabled={l.ready}
                      className={"w-full text-left px-3 py-3 flex items-start gap-3 active:scale-[0.99] transition-transform " +
                        (l.ready ? "opacity-40" : "hover:bg-white/5")}
                    >
                      <span className="text-2xl font-bold tabular-nums w-10 flex-shrink-0 text-amber-400">
                        {l.quantity}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xl font-semibold leading-tight">{l.name}</span>
                        {/* The modifiers are the line that sends a plate back
                            if it is missed, so they are not small grey text. */}
                        {l.modifiers.length > 0 && (
                          <span className="block mt-0.5 text-base font-medium text-amber-300 leading-snug">
                            {l.modifiers.join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <Check className={"w-5 h-5 " + (l.ready ? "text-emerald-400" : "text-slate-400")} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
