"use client"

import { useEffect, useRef, useState } from "react"
import { subscribeToDisplay, type DisplayState } from "@/frontend/lib/pos/customer-display"

/**
 * The screen the customer reads.
 *
 * Deliberately outside the Saji Pro layout: no sidebar, no topbar, no account
 * menu. The person looking at this is standing on the other side of the
 * counter and must see their basket and nothing else.
 *
 * It fetches nothing. Every figure arrives from the till window over a
 * same-origin BroadcastChannel (frontend/lib/pos/customer-display.ts), so this
 * route has no session, no data of its own and nothing to leak if it is opened
 * on its own.
 *
 * Sizing is in vw/vh rather than fixed type scales because a customer-facing
 * monitor is read from about a metre away and is anything from a 7-inch pole
 * display to a spare 1080p panel. Everything therefore scales with the screen
 * it lands on instead of assuming a phone.
 */

const money = (n: number) =>
  n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CustomerDisplayPage() {
  const [state, setState] = useState<DisplayState | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeToDisplay(setState), [])

  // The newest line is the one just scanned, so keep it in view. A customer
  // watching a long shop cannot scroll this screen themselves.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [state])

  if (!state) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-slate-900 text-slate-400">
        <p className="text-[2.2vw]">Waiting for the till</p>
      </main>
    )
  }

  if (state.kind === "idle") {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center bg-slate-900 text-white">
        <p className="text-[4vw] font-bold tracking-tight">{state.shopName}</p>
        <p className="mt-[1vh] text-[1.8vw] text-slate-400">Karibu</p>
      </main>
    )
  }

  if (state.kind === "paid") {
    return (
      <main className="flex h-screen w-screen flex-col items-center justify-center bg-emerald-600 text-white">
        <p className="text-[2vw] font-medium text-emerald-100">Asante, thank you</p>
        <p className="mt-[2vh] text-[6vw] font-bold tabular-nums leading-none">
          KSh {money(state.total)}
        </p>
        {state.change > 0 && (
          <div className="mt-[4vh] rounded-[1vw] bg-white/15 px-[3vw] py-[2vh] text-center">
            <p className="text-[1.6vw] text-emerald-50">Your change</p>
            <p className="text-[4vw] font-bold tabular-nums leading-tight">
              KSh {money(state.change)}
            </p>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="flex h-screen w-screen flex-col bg-slate-900 text-white">
      <header className="flex items-baseline justify-between border-b border-white/10 px-[2vw] py-[1.5vh]">
        <p className="text-[1.8vw] font-semibold">{state.shopName}</p>
        <p className="text-[1.2vw] text-slate-400">
          {state.lines.length} {state.lines.length === 1 ? "item" : "items"}
        </p>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-[2vw] py-[1vh]">
        {state.lines.length === 0 ? (
          <p className="mt-[6vh] text-center text-[1.6vw] text-slate-500">Your basket is empty</p>
        ) : (
          <ul>
            {state.lines.map((l) => (
              <li
                key={l.id}
                className="flex items-baseline gap-[1vw] border-b border-white/5 py-[1.2vh]"
              >
                <span className="w-[6vw] flex-shrink-0 text-[1.5vw] tabular-nums text-slate-400">
                  {l.quantity} {l.unit}
                </span>
                <span className="min-w-0 flex-1 truncate text-[1.7vw]">
                  {l.name}
                  {l.variant && <span className="ml-[0.6vw] text-slate-400">{l.variant}</span>}
                </span>
                <span className="text-[1.3vw] tabular-nums text-slate-500">
                  @ {money(l.unitPrice)}
                </span>
                <span className="w-[8vw] flex-shrink-0 text-right text-[1.7vw] font-semibold tabular-nums">
                  {money(l.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-white/10 px-[2vw] py-[1.5vh]">
        {/* Only the lines that apply. A customer shown "Discount 0.00" reads it
            as a discount they did not get. */}
        {state.discount > 0 && (
          <Line label="Discount" value={"-" + money(state.discount)} />
        )}
        {state.points > 0 && <Line label="Points" value={"-" + money(state.points)} />}
        {state.tax > 0 && <Line label="Tax" value={money(state.tax)} />}
        <div className="mt-[1vh] flex items-baseline justify-between">
          <span className="text-[2vw] font-medium text-slate-300">Total</span>
          <span className="text-[4.5vw] font-bold tabular-nums leading-none">
            KSh {money(state.total)}
          </span>
        </div>
      </footer>
    </main>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-slate-400">
      <span className="text-[1.3vw]">{label}</span>
      <span className="text-[1.3vw] tabular-nums">{value}</span>
    </div>
  )
}
