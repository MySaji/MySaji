"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Clock, Loader2, ChevronDown, ChevronRight, Monitor, User, AlertTriangle, Check,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import {
  getShiftHistory, getShiftSales, type ShiftRow, type ShiftSaleRow,
} from "@/backend/actions/pos-reports"

/**
 * Every shift, and what was in the drawer at the end of it.
 *
 * The history used to be ten rows at the bottom of Reports, which is the
 * wrong place for it: a shopkeeper looking at shifts is not reading a
 * report, they are asking "who was on, and did the money add up". That
 * question deserves its own page and more than ten answers.
 *
 * The variance is the point of the page, so it is what the row leads with
 * and the only thing coloured. A shift that balanced should be boring.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function when(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const yesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })
  if (sameDay) return "Today " + time
  if (yesterday) return "Yesterday " + time
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" }) + " " + time
}

export default function TillShiftsPage() {
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [sales, setSales] = useState<Record<string, ShiftSaleRow[]>>({})
  const [loadingSales, setLoadingSales] = useState<string | null>(null)

  useEffect(() => {
    getShiftHistory({ limit: 100 }).then(setShifts).finally(() => setLoading(false))
  }, [])

  const toggle = async (id: string) => {
    if (open === id) { setOpen(null); return }
    setOpen(id)
    if (sales[id]) return
    setLoadingSales(id)
    const rows = await getShiftSales({ shiftId: id })
    setSales((prev) => ({ ...prev, [id]: rows }))
    setLoadingSales(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const short = shifts.filter((s) => s.variance !== null && s.variance < 0).length

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/provider/till"
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" /> Till
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Shifts</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          What was counted at the end of each shift against what the till expected. Tap one to
          see the sales that made it up.
        </p>
      </div>

      {short > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
            {short === 1 ? "One shift came up" : short + " shifts came up"} short. That is worth
            looking at, but a small gap is usually change given in a hurry rather than anything
            else.
          </p>
        </div>
      )}

      {shifts.length === 0 ? (
        <Card className="p-6 text-center rounded-2xl">
          <Clock className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No shifts yet</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Opening a shift before you start records the cash you begin with, so the drawer can
            be checked against it later. Sales still work without one.
          </p>
        </Card>
      ) : (
        <Card className="p-2 rounded-2xl">
          <div className="space-y-1">
            {shifts.map((s) => {
              const isOpen = open === s.id
              const running = s.closedAt === null
              const v = s.variance
              return (
                <div key={s.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    onClick={() => toggle(s.id)}
                    aria-expanded={isOpen}
                    className="w-full p-3 flex items-center gap-2.5 text-left active:bg-gray-50 dark:active:bg-gray-800"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white">
                          {when(s.openedAt)}
                        </span>
                        {running && (
                          <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                            OPEN NOW
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] text-gray-500 dark:text-gray-400">
                        {s.cashierName && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3" /> {s.cashierName}
                          </span>
                        )}
                        {s.deviceName && (
                          <span className="inline-flex items-center gap-1">
                            <Monitor className="w-3 h-3" /> {s.deviceName}
                          </span>
                        )}
                        <span>{s.saleCount === 1 ? "1 sale" : s.saleCount + " sales"}</span>
                      </span>
                    </span>

                    <span className="text-right flex-shrink-0">
                      {running ? (
                        <span className="block text-[11px] text-gray-400">still open</span>
                      ) : v === null ? (
                        <span className="block text-[11px] text-gray-400">not counted</span>
                      ) : v === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <Check className="w-3.5 h-3.5" strokeWidth={3} /> Balanced
                        </span>
                      ) : (
                        <span
                          className={
                            v < 0
                              ? "block text-xs font-bold text-red-600 dark:text-red-400 tabular-nums"
                              : "block text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums"
                          }
                        >
                          {v < 0 ? "-" : "+"}
                          {sh(Math.abs(v))}
                        </span>
                      )}
                    </span>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <Fig label="Float" value={s.openingFloat} />
                        <Fig label="Expected" value={s.expectedCash} />
                        <Fig label="Counted" value={s.countedCash} />
                        <Fig label="Difference" value={s.variance} signed />
                      </div>
                      {s.note && (
                        <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
                          <span className="font-semibold">Note:</span> {s.note}
                        </p>
                      )}
                      {s.closedAt && (
                        <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                          Closed {when(s.closedAt)}
                        </p>
                      )}

                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        What went through
                      </p>
                      {loadingSales === s.id ? (
                        <div className="py-3 flex justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        </div>
                      ) : (sales[s.id] ?? []).length === 0 ? (
                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                          Nothing was rung up on this shift.
                        </p>
                      ) : (
                        <div className="mt-1.5 space-y-1">
                          {(sales[s.id] ?? []).map((x) => (
                            <div key={x.id} className="flex items-center gap-2 text-[11px]">
                              <span className="text-gray-400 tabular-nums w-11 flex-shrink-0">
                                #{x.saleNumber}
                              </span>
                              <span className="text-gray-500 dark:text-gray-400 w-12 flex-shrink-0 tabular-nums">
                                {new Date(x.occurredAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">
                                {x.cashierName ?? "—"}
                                <span className="text-gray-400"> &middot; {x.paymentMethod.toLowerCase()}</span>
                              </span>
                              <span
                                className={
                                  x.status === "VOIDED"
                                    ? "tabular-nums font-semibold text-gray-400 line-through flex-shrink-0"
                                    : "tabular-nums font-semibold text-gray-900 dark:text-white flex-shrink-0"
                                }
                              >
                                {sh(x.total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug px-1">
        The difference is what was recorded when the shift was closed. A void or a correction
        made afterwards does not change it &mdash; what a cashier signed off on that night stays
        what they signed off on.
      </p>
    </div>
  )
}

function Fig({ label, value, signed }: { label: string; value: number | null; signed?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
        {value === null ? "—" : (signed && value > 0 ? "+" : "") + sh(value)}
      </span>
    </div>
  )
}
