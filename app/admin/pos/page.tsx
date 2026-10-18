"use client"

import { useEffect, useState } from "react"
import {
  Search, Loader2, Check, X, Store, AlertTriangle, Ban, Play, RefreshCw, Calendar, Wallet,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getPosBillingSettings, setPosPriceList, getAdminPosBusinesses, getAdminPosCharges,
  recordPosPayment, waivePosCharge, setPosBusinessPrice, setPosBusinessActive,
  extendPosTrial, runPosBillingCycle,
  type PosBillingSettings, type AdminPosRow, type AdminChargeRow,
} from "@/backend/actions/admin-pos-billing"

/**
 * POS subscriptions, from the platform's side.
 *
 * Two jobs on one page, in the order an admin needs them: what the platform
 * charges, and which shops are behind. The second is the one somebody opens
 * this page for, so the list carries the figures that decide what to do
 * about it: what is owed, when they last paid, and whether the till is
 * actually being used.
 *
 * A shop that has not sold anything in thirty days and owes two months is a
 * different conversation from one taking forty thousand a week and late by
 * three days, and the list should let an admin tell them apart without
 * opening either.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_BADGE: Record<string, string> = {
  TRIAL: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400",
  ACTIVE: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  PAST_DUE: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  SUSPENDED: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  CANCELLED: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "On trial",
  ACTIVE: "Paid up",
  PAST_DUE: "Owing",
  SUSPENDED: "Till paused",
  CANCELLED: "Cancelled",
}

export default function AdminPosPage() {
  const [settings, setSettings] = useState<PosBillingSettings>(null)
  const [rows, setRows] = useState<AdminPosRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const [query, setQuery] = useState("")
  useEffect(() => { const search = new URLSearchParams(window.location.search).get("search"); if (search) setQuery(search.slice(0, 200)) }, [])
  const [filter, setFilter] = useState<string>("")

  const [enabled, setEnabled] = useState(false)
  const [setupFee, setSetupFee] = useState("0")
  const [monthlyFee, setMonthlyFee] = useState("0")
  const [trialDays, setTrialDays] = useState("30")
  const [graceDays, setGraceDays] = useState("7")

  const [open, setOpen] = useState<AdminPosRow | null>(null)
  const [charges, setCharges] = useState<AdminChargeRow[]>([])
  const [payFor, setPayFor] = useState<AdminChargeRow | null>(null)
  const [payMethod, setPayMethod] = useState("M-Pesa")
  const [payRef, setPayRef] = useState("")
  const [waiveFor, setWaiveFor] = useState<AdminChargeRow | null>(null)
  const [waiveReason, setWaiveReason] = useState("")
  const [pauseFor, setPauseFor] = useState<AdminPosRow | null>(null)
  const [pauseReason, setPauseReason] = useState("")

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 5000) }

  const load = async () => {
    const [s, r] = await Promise.all([
      getPosBillingSettings(),
      getAdminPosBusinesses({ query: query.trim() || undefined, status: (filter || undefined) as never }),
    ])
    setSettings(s)
    setRows(r)
    if (s) {
      setEnabled(s.list.enabled)
      setSetupFee(String(s.list.setupFee))
      setMonthlyFee(String(s.list.monthlyFee))
      setTrialDays(String(s.list.trialDays))
      setGraceDays(String(s.list.graceDays))
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter])

  const openBusiness = async (row: AdminPosRow) => {
    setOpen(row)
    setCharges(await getAdminPosCharges({ businessId: row.businessId }).catch(() => []))
  }

  const refreshOpen = async () => {
    await load()
    if (open) setCharges(await getAdminPosCharges({ businessId: open.businessId }).catch(() => []))
  }

  const savePrices = async () => {
    setBusy("prices"); setError("")
    const r = await setPosPriceList({
      enabled,
      setupFee: Number(setupFee) || 0,
      monthlyFee: Number(monthlyFee) || 0,
      trialDays: Math.floor(Number(trialDays) || 0),
      graceDays: Math.floor(Number(graceDays) || 0),
    })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await load()
    flash(r.message ?? "Saved")
  }

  const takePayment = async () => {
    if (!payFor) return
    setBusy("pay"); setError("")
    const r = await recordPosPayment({ chargeId: payFor.id, method: payMethod, reference: payRef.trim() || undefined })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    setPayFor(null); setPayRef("")
    await refreshOpen()
    flash(r.message ?? "Recorded")
  }

  const waive = async () => {
    if (!waiveFor) return
    setBusy("waive"); setError("")
    const r = await waivePosCharge({ chargeId: waiveFor.id, reason: waiveReason.trim() })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    setWaiveFor(null); setWaiveReason("")
    await refreshOpen()
    flash(r.message ?? "Waived")
  }

  const pause = async () => {
    if (!pauseFor) return
    setBusy("pause"); setError("")
    const r = await setPosBusinessActive({ businessId: pauseFor.businessId, active: false, reason: pauseReason.trim() })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    setPauseFor(null); setPauseReason("")
    await refreshOpen()
    flash(r.message ?? "Paused")
  }

  const restore = async (row: AdminPosRow) => {
    setBusy(row.businessId); setError("")
    const r = await setPosBusinessActive({ businessId: row.businessId, active: true })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await refreshOpen()
    flash(r.message ?? "Restored")
  }

  const extend = async (row: AdminPosRow, days: number) => {
    setBusy(row.businessId); setError("")
    const r = await extendPosTrial({ businessId: row.businessId, days })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await refreshOpen()
    flash(r.message ?? "Extended")
  }

  const runCycle = async () => {
    setBusy("cycle"); setError("")
    const r = await runPosBillingCycle()
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await load()
    flash(r.message ?? "Done")
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!settings) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center rounded-2xl">
          <p className="text-sm text-gray-500 dark:text-gray-400">This page is for admins.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">POS subscriptions</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          What the till costs, and which shops are behind.
        </p>
      </div>

      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-snug">{saved}</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {/* ---- the numbers --------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Stat label="POS businesses" value={String(settings.counts.total)} />
        <Stat label="Owing" value={String(settings.counts.pastDue)} tone={settings.counts.pastDue > 0 ? "warn" : undefined} />
        <Stat label="Paused" value={String(settings.counts.suspended)} tone={settings.counts.suspended > 0 ? "bad" : undefined} />
        <Stat label="Collected" value={"KSh " + sh(settings.collected)} />
      </div>

      {/* ---- the price list -------------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">What the till costs</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
              This is what a NEW business will pay. Shops already signed up keep the price they
              agreed to, and repricing one of them is done against that shop.
            </p>
          </div>
          <Button
            onClick={() => void runCycle()}
            disabled={busy === "cycle"}
            variant="outline"
            className="h-10 rounded-xl text-[11px] font-semibold flex-shrink-0"
          >
            {busy === "cycle" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
            Run billing now
          </Button>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={
            enabled
              ? "mt-3 w-full flex items-center gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] border-primary bg-primary/5"
              : "mt-3 w-full flex items-center gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] border-gray-200 dark:border-gray-700"
          }
        >
          <span className={
            enabled
              ? "w-9 h-5 rounded-full bg-primary flex items-center px-0.5 flex-shrink-0 justify-end"
              : "w-9 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center px-0.5 flex-shrink-0"
          }>
            <span className="w-4 h-4 rounded-full bg-white block" />
          </span>
          <span className="min-w-0 flex-1 text-xs font-semibold text-gray-900 dark:text-white">
            {enabled ? "Charging for the POS" : "The POS is free for everyone"}
          </span>
        </button>

        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Field label="One off setup (KSh)" hint="Charged once, when they sign up.">
            <Input
              value={setupFee}
              onChange={(e) => setSetupFee(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="h-11 rounded-xl text-sm tabular-nums"
            />
          </Field>
          <Field label="Every month (KSh)" hint="For maintenance and support.">
            <Input
              value={monthlyFee}
              onChange={(e) => setMonthlyFee(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="h-11 rounded-xl text-sm tabular-nums"
            />
          </Field>
          <Field label="Free days at the start" hint="Zero means they pay from day one.">
            <Input
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="h-11 rounded-xl text-sm tabular-nums"
            />
          </Field>
          <Field label="Grace days" hint="How long the till keeps working after a missed payment.">
            <Input
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="h-11 rounded-xl text-sm tabular-nums"
            />
          </Field>
        </div>

        {enabled && Number(graceDays) === 0 && (
          <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400 leading-snug">
            With no grace at all, a till stops selling the moment a payment is a day late. A
            shopkeeper whose M-Pesa failed on a Sunday will have customers at the counter on
            Monday and no way to serve them.
          </p>
        )}

        <Button onClick={() => void savePrices()} disabled={busy === "prices"} className="mt-3 h-11 rounded-xl text-xs">
          {busy === "prices" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save the price list"}
        </Button>
      </Card>

      {/* ---- the businesses --------------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">POS users</h2>

        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a business, an owner or an email"
              className="pl-9 h-11 rounded-xl text-sm"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {["", "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"].map((f) => (
              <button
                key={f || "all"}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={
                  filter === f
                    ? "h-11 px-3 rounded-xl border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 border-primary bg-primary/5 text-primary"
                    : "h-11 px-3 rounded-xl border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }
              >
                {f ? STATUS_LABEL[f] : "Everyone"}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">No POS businesses match that.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {rows.map((row) => (
              <div
                key={row.businessId}
                className="p-3 rounded-xl border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <button onClick={() => void openBusiness(row)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {row.businessName}
                      </span>
                      <span className={"h-5 px-2 rounded-md text-[10px] font-semibold flex items-center " + (STATUS_BADGE[row.status] ?? "")}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                      {!row.canSell && (
                        <span className="h-5 px-2 rounded-md text-[10px] font-semibold flex items-center bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          Not selling
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {row.ownerName} · {row.ownerEmail}
                      {row.ownerPhone ? " · " + row.ownerPhone : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400 tabular-nums">
                      <Store className="w-3 h-3 inline-block mr-0.5 align-text-top" />
                      {row.stores} branch{row.stores === 1 ? "" : "es"} · {row.staff} staff ·{" "}
                      {row.salesLast30} sale{row.salesLast30 === 1 ? "" : "s"} and KSh {sh(row.takingsLast30)} in 30 days
                    </p>
                  </button>

                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Owes</p>
                    <p className={
                      row.owed > 0
                        ? "text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums"
                        : "text-sm font-bold text-gray-900 dark:text-white tabular-nums"
                    }>
                      KSh {sh(row.owed)}
                    </p>
                    <p className="text-[10px] text-gray-400 tabular-nums">
                      {sh(row.monthlyFee)}/mo
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => void openBusiness(row)}
                    className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 inline-flex items-center gap-1"
                  >
                    <Wallet className="w-3 h-3" /> Charges
                  </button>
                  {row.canSell ? (
                    <button
                      onClick={() => { setPauseFor(row); setPauseReason(""); setError("") }}
                      className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 inline-flex items-center gap-1"
                    >
                      <Ban className="w-3 h-3" /> Pause the till
                    </button>
                  ) : (
                    <button
                      onClick={() => void restore(row)}
                      disabled={busy === row.businessId}
                      className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      {busy === row.businessId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      Turn it back on
                    </button>
                  )}
                  <button
                    onClick={() => void extend(row, 14)}
                    disabled={busy === row.businessId}
                    className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Calendar className="w-3 h-3" /> Give 14 days
                  </button>
                </div>

                {row.adminNote && (
                  <p className="mt-1.5 text-[11px] text-gray-400 leading-snug">{row.adminNote}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---- one business ------------------------------------------------------ */}
      {open && (
        <Sheet title={open.businessName} onClose={() => setOpen(null)}>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Owner" value={open.ownerName} />
              <Mini label="Status" value={STATUS_LABEL[open.status] ?? open.status} />
              <Mini label="One off" value={"KSh " + sh(open.setupFee) + (open.setupSettled ? " (settled)" : "")} />
              <Mini label="Monthly" value={"KSh " + sh(open.monthlyFee)} />
              <Mini
                label="Paid until"
                value={open.periodEndsAt ? new Date(open.periodEndsAt).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "not yet"}
              />
              <Mini
                label="Last paid"
                value={open.lastPaidAt ? new Date(open.lastPaidAt).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "never"}
              />
            </div>

            <RepriceRow row={open} onDone={async (m) => { await refreshOpen(); flash(m) }} onError={setError} />

            <div>
              <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Charges</p>
              {charges.length === 0 ? (
                <p className="mt-1 text-[11px] text-gray-400">Nothing yet.</p>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  {charges.map((c) => (
                    <div key={c.id} className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white">
                            {c.kind === "SETUP" ? "Setting up" : "Monthly"}
                            {c.periodStart && c.periodEnd
                              ? " · " + new Date(c.periodStart).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) +
                                " to " + new Date(c.periodEnd).toLocaleDateString("en-KE", { day: "numeric", month: "short" })
                              : ""}
                          </p>
                          <p className="text-[11px] text-gray-400 tabular-nums">
                            {c.status === "PAID"
                              ? "Paid " + (c.paidMethod ?? "") + (c.reference ? " · " + c.reference : "")
                              : c.status === "WAIVED"
                                ? "Waived: " + (c.note ?? "")
                                : "Outstanding"}
                            {c.recordedBy ? " · " + c.recordedBy : ""}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums flex-shrink-0">
                          KSh {sh(c.amount)}
                        </span>
                      </div>

                      {c.status === "DUE" && (
                        <div className="mt-2 flex gap-1.5">
                          <button
                            onClick={() => { setPayFor(c); setPayRef(""); setError("") }}
                            className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95"
                          >
                            Record a payment
                          </button>
                          <button
                            onClick={() => { setWaiveFor(c); setWaiveReason(""); setError("") }}
                            className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95"
                          >
                            Waive it
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Sheet>
      )}

      {payFor && (
        <Sheet title={"Record KSh " + sh(payFor.amount)} onClose={() => setPayFor(null)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            For money that arrived some other way: cash, a bank transfer, an M-Pesa the platform
            did not see.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["M-Pesa", "Bank", "Cash", "Other"].map((m) => (
              <button
                key={m}
                onClick={() => setPayMethod(m)}
                aria-pressed={payMethod === m}
                className={
                  payMethod === m
                    ? "h-10 px-3 rounded-xl border text-[11px] font-semibold border-primary bg-primary/5 text-primary"
                    : "h-10 px-3 rounded-xl border text-[11px] font-semibold border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }
              >
                {m}
              </button>
            ))}
          </div>
          <Input
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
            placeholder="Reference, e.g. the M-Pesa code"
            className="mt-2 h-11 rounded-xl text-sm"
          />
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
          <Button onClick={() => void takePayment()} disabled={busy === "pay"} className="mt-3 w-full h-11 rounded-xl text-xs">
            {busy === "pay" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record it"}
          </Button>
        </Sheet>
      )}

      {waiveFor && (
        <Sheet title={"Waive KSh " + sh(waiveFor.amount)} onClose={() => setWaiveFor(null)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Waiving is not the same as being paid, and the figures keep them apart. The reason
            stays on the charge.
          </p>
          <Input
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            placeholder="Why is it being waived?"
            className="mt-3 h-11 rounded-xl text-sm"
            autoFocus
          />
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
          <Button
            onClick={() => void waive()}
            disabled={busy === "waive" || waiveReason.trim().length < 3}
            className="mt-3 w-full h-11 rounded-xl text-xs"
          >
            {busy === "waive" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Waive it"}
          </Button>
        </Sheet>
      )}

      {pauseFor && (
        <Sheet title={"Pause " + pauseFor.businessName} onClose={() => setPauseFor(null)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            The till stops selling. Their stock, sales history and customers stay exactly where
            they are and stay readable, because those are the shop's records, not ours to hold.
          </p>
          <Input
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            placeholder="Why is it being paused?"
            className="mt-3 h-11 rounded-xl text-sm"
            autoFocus
          />
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
          <Button
            onClick={() => void pause()}
            disabled={busy === "pause" || pauseReason.trim().length < 3}
            className="mt-3 w-full h-11 rounded-xl text-xs"
          >
            {busy === "pause" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pause the till"}
          </Button>
        </Sheet>
      )}
    </div>
  )
}

function RepriceRow({
  row, onDone, onError,
}: {
  row: AdminPosRow
  onDone: (message: string) => void | Promise<void>
  onError: (e: string) => void
}) {
  const [monthly, setMonthly] = useState(String(row.monthlyFee))
  const [busy, setBusy] = useState(false)
  const dirty = monthly !== String(row.monthlyFee)

  return (
    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60">
      <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
        What this business pays each month
      </p>
      <div className="mt-1.5 flex gap-2">
        <Input
          value={monthly}
          onChange={(e) => setMonthly(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          className="h-10 rounded-xl text-sm tabular-nums"
        />
        <Button
          onClick={async () => {
            setBusy(true)
            onError("")
            const r = await setPosBusinessPrice({ businessId: row.businessId, monthlyFee: Number(monthly) || 0 })
            setBusy(false)
            if (!r.success) { onError(r.error); return }
            await onDone(r.message ?? "Saved")
          }}
          disabled={busy || !dirty}
          className="h-10 rounded-xl text-[11px] flex-shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400 leading-snug">
        Changes this shop only. The platform's price list is untouched.
      </p>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  return (
    <Card className="p-3 rounded-2xl">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className={
        tone === "bad"
          ? "mt-0.5 text-sm font-bold text-red-600 dark:text-red-400 tabular-nums"
          : tone === "warn"
            ? "mt-0.5 text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums"
            : "mt-0.5 text-sm font-bold text-gray-900 dark:text-white tabular-nums"
      }>
        {value}
      </p>
    </Card>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white truncate">{value}</p>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">{label}</span>
      <span className="block mt-1">{children}</span>
      {hint && <span className="block mt-1 text-[11px] text-gray-400 leading-snug">{hint}</span>}
    </label>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-4 pb-8 sm:pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="min-w-0 text-sm font-bold text-gray-900 dark:text-white leading-snug">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-gray-400 active:scale-95 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
