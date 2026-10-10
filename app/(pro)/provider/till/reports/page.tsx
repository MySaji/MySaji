"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, Calculator, TrendingUp, Banknote, Smartphone, CreditCard,
  Landmark, HandCoins, Clock, AlertTriangle, Info, FileLock,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  getTillReport, getShiftHistory, getControlledRegister,
  type TillReport, type ShiftRow, type RegisterEntry,
} from "@/lib/actions/pos-reports"
import {
  REPORT_RANGES, REPORT_RANGE_LABEL as RANGE_LABEL, reportRangeStart as rangeStart,
  type ReportRange,
} from "@/lib/pos-reporting"

/**
 * What the till took.
 *
 * Shillings, unconverted, like every other POS screen. Voided sales are
 * excluded from every figure and shown separately — a report that counts
 * money which was never taken is a report that argues with the drawer.
 */

function sh(n: number): string {
  return n.toLocaleString("en-KE", { maximumFractionDigits: 2 })
}

const METHOD_ICON: Record<string, typeof Banknote> = {
  CASH: Banknote, MPESA: Smartphone, CARD: CreditCard, BANK: Landmark, CREDIT: HandCoins,
}
const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash", MPESA: "M-Pesa", CARD: "Card", BANK: "Bank", CREDIT: "On credit", SPLIT: "Split",
}

export default function TillReportsPage() {
  const [range, setRange] = useState<ReportRange>("today")
  const [report, setReport] = useState<TillReport | null>(null)
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [register, setRegister] = useState<RegisterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    Promise.all([
      getTillReport({ range }),
      getShiftHistory({ limit: 10 }),
      // Returns [] for a shop without the trait, so this costs nothing
      // for the 33 shop types that keep no register.
      getControlledRegister({ from: rangeStart(range).toISOString(), limit: 200 }),
    ])
      .then(([r, s, g]) => { setReport(r); setShifts(s); setRegister(g) })
      .finally(() => { setLoading(false); setSwitching(false) })
  }, [range])

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!report) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <Calculator className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">There is no till on this account.</p>
          <Link href="/provider/business-types"><Button variant="outline" className="mt-4 h-10 rounded-xl">My Business</Button></Link>
        </Card>
      </div>
    )
  }

  const peakDay = report.byDay.reduce((max, d) => (d.amount > max ? d.amount : max), 0)

  return (
    <div className="p-3 max-w-3xl mx-auto space-y-3 pb-24">
      <Link href="/provider/till" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      <div className="flex gap-1.5">
        {REPORT_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => { setSwitching(true); setRange(r) }}
            aria-pressed={range === r}
            className={`h-9 px-3 rounded-lg text-[11px] font-semibold active:scale-95 transition-all ${
              range === r ? "bg-primary text-primary-foreground" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
        {switching && <Loader2 className="w-4 h-4 animate-spin text-gray-400 self-center ml-1" />}
      </div>

      {/* ---- the headline ------------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">Taken {RANGE_LABEL[range].toLowerCase()}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">KSh {sh(report.takings)}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {report.saleCount} {report.saleCount === 1 ? "sale" : "sales"}
          {report.saleCount > 0 && <> &middot; {sh(report.averageSale)} average</>}
          {report.itemsSold > 0 && <> &middot; {sh(report.itemsSold)} items</>}
        </p>

        {report.voidedCount > 0 && (
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            {report.voidedCount} voided {report.voidedCount === 1 ? "sale" : "sales"} worth{" "}
            {sh(report.voidedValue)} {report.voidedCount === 1 ? "is" : "are"} not counted above.
          </p>
        )}
      </Card>

      {/* ---- margin, with its own honesty about coverage ------------------ */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Gross margin</p>
            {report.grossMargin === null ? (
              <>
                <p className="text-lg font-bold text-gray-400">Not known</p>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug max-w-xs">
                  None of these sales had a cost price recorded. Add what you pay for each
                  product and this fills in by itself.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                  KSh {sh(report.grossMargin)}
                </p>
                {/* Stated, not buried. A margin computed over 40% of lines
                    is not the shop's margin, and presenting it as one would
                    be the most misleading number on this page. */}
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug max-w-xs">
                  {report.costCoverage >= 0.999
                    ? "Across every line sold."
                    : `Across the ${Math.round(report.costCoverage * 100)}% of lines that have a cost price — not the whole shop.`}
                </p>
              </>
            )}
          </div>
          <TrendingUp className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </div>
      </Card>

      {/* ---- how they paid ------------------------------------------------ */}
      {report.byMethod.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">How they paid</h2>
          <div className="mt-2 space-y-1.5">
            {report.byMethod.map((m) => {
              const Icon = METHOD_ICON[m.method] ?? Banknote
              const share = report.takings > 0 ? (m.amount / report.takings) * 100 : 0
              return (
                <div key={m.method} className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        {METHOD_LABEL[m.method] ?? m.method}
                      </span>
                      <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{sh(m.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ---- by day, where the range covers more than one ------------------ */}
      {range !== "today" && report.byDay.length > 1 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Day by day</h2>
          <div className="mt-2.5 flex items-end gap-1 h-24">
            {report.byDay.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={`${d.day}: ${sh(d.amount)}`}>
                <div
                  className="w-full rounded-t bg-primary/80 min-h-[2px]"
                  style={{ height: `${peakDay > 0 ? (d.amount / peakDay) * 100 : 0}%` }}
                />
                <span className="text-[8px] text-gray-400 truncate w-full text-center">{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---- best sellers --------------------------------------------------- */}
      {report.topProducts.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Best sellers</h2>
          <ol className="mt-2 space-y-1.5">
            {report.topProducts.map((p, i) => (
              <li key={p.name} className="flex items-center gap-2.5">
                <span className="w-5 text-[10px] font-bold text-gray-300 dark:text-gray-600 tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-[10px] text-gray-400 tabular-nums">
                    {sh(p.quantity)} {p.unit === "piece" ? "sold" : p.unit}
                  </p>
                </div>
                <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums flex-shrink-0">{sh(p.revenue)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ---- who served ------------------------------------------------------ */}
      {report.byCashier.length > 1 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">By cashier</h2>
          <div className="mt-2 space-y-1">
            {report.byCashier.map((c) => (
              <div key={c.name} className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-gray-900 dark:text-white truncate">{c.name}</span>
                <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                  {c.count} &middot; <span className="font-bold text-gray-900 dark:text-white">{sh(c.amount)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---- the controlled register ---------------------------------------- */}
      {register.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
            <FileLock className="w-4 h-4 text-gray-400" /> Controlled register
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            Every controlled item that left the counter {RANGE_LABEL[range].toLowerCase()}, as it
            was recorded at the time. These entries cannot be edited.
          </p>
          <div className="mt-2.5 space-y-1.5">
            {register.map((e) => (
              <div
                key={e.id}
                className={
                  e.voided
                    ? "rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-2.5"
                    : "rounded-xl border border-gray-200 dark:border-gray-700 p-2.5"
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">
                      {e.productName}
                      {e.variantLabel && <span className="font-normal text-gray-500"> &middot; {e.variantLabel}</span>}
                      {e.voided && (
                        <span className="ml-1.5 text-[10px] font-semibold text-gray-500 uppercase">voided</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400">
                      {sh(e.quantity)} {e.unit === "piece" ? "" : e.unit} to <span className="font-medium">{e.buyerName}</span>
                      {e.buyerIdNumber && " (ID " + e.buyerIdNumber + ")"}
                    </p>
                    {(e.prescriberName || e.prescriptionRef) && (
                      <p className="text-[10px] text-gray-500">
                        {e.prescriberName}{e.prescriberName && e.prescriptionRef ? " · " : ""}{e.prescriptionRef}
                      </p>
                    )}
                    {e.batchNumber && <p className="text-[10px] text-gray-400">batch {e.batchNumber}</p>}
                    {e.serials.length > 0 && <p className="text-[10px] text-gray-400 font-mono">{e.serials.join(", ")}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-gray-400">
                      {new Date(e.occurredAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(e.occurredAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {e.recordedByName && <p className="text-[10px] text-gray-400">{e.recordedByName}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* The claim NOT made, stated where the register is read. */}
          <p className="mt-2.5 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
            Saji keeps this record for you. It does not certify that it meets what the Pharmacy
            and Poisons Board or the Veterinary Medicines Directorate require of your shop.
          </p>
        </Card>
      )}

      {/* ---- shifts ----------------------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Recent shifts</h2>
          <Link
            href="/provider/till/shifts"
            className="h-9 inline-flex items-center px-2 -mr-2 rounded-lg text-[11px] font-semibold text-primary active:scale-95"
          >
            All shifts
          </Link>
        </div>
        {shifts.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            No shifts recorded. Opening one before you start logs the cash you began with, so the
            drawer can be checked against it at the end.
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {shifts.map((s) => {
              const open = s.closedAt === null
              const off = s.variance !== null && Math.abs(s.variance) > 0.004
              return (
                <div key={s.id} className={`rounded-xl border p-2.5 ${
                  off ? "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10"
                      : "border-gray-100 dark:border-gray-700"
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">
                        {s.cashierName ?? "Cashier"}
                        {open && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <Clock className="w-2.5 h-2.5" /> open now
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(s.openedAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {s.closedAt && ` – ${new Date(s.closedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}`}
                        {` · ${s.saleCount} ${s.saleCount === 1 ? "sale" : "sales"}`}
                      </p>
                    </div>
                    {s.variance !== null && (
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs font-bold tabular-nums ${
                          !off ? "text-emerald-700 dark:text-emerald-400"
                          : s.variance < 0 ? "text-red-600 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-400"
                        }`}>
                          {!off ? "balanced" : `${s.variance > 0 ? "+" : ""}${sh(s.variance)}`}
                        </p>
                        <p className="text-[10px] text-gray-400 tabular-nums">
                          counted {sh(s.countedCash ?? 0)}
                        </p>
                      </div>
                    )}
                  </div>
                  {s.note && <p className="mt-1 text-[10px] text-gray-500 leading-snug">{s.note}</p>}
                  {off && (
                    <p className="mt-1 flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
                      <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                      The drawer held {s.variance! < 0 ? "less" : "more"} than the sales account for.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
