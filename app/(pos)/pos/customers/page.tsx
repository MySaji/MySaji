"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Plus, Search, Star, X, Ban,
  Pencil, History, TrendingUp,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getCustomers, saveCustomer, setCustomerActive, getCustomerHistory, adjustPoints,
  getLoyaltySettings,
  type CustomerRow, type LoyaltySettings, type LoyaltyEntryRow,
} from "@/backend/actions/pos-customers"

/**
 * The people who shop here often enough to be worth knowing.
 *
 * WHAT THIS PAGE IS REALLY FOR
 *
 * Two questions, asked at different moments. A shopkeeper looking at the
 * list wants to know who their regulars are. A cashier with somebody at the
 * counter wants one person's balance in two seconds. So search is at the
 * top, big, and matches a phone number first.
 *
 * The points balance is shown next to what it is WORTH in shillings,
 * because "two hundred and forty points" means nothing to the person
 * holding the receipt and "KSh 240" means everything.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const KIND_LABEL: Record<string, { text: string; cls: string }> = {
  EARN: { text: "Earned", cls: "text-emerald-600 dark:text-emerald-400" },
  REDEEM: { text: "Spent", cls: "text-sky-600 dark:text-sky-400" },
  REVERSAL: { text: "Taken back", cls: "text-amber-600 dark:text-amber-400" },
  ADJUSTMENT: { text: "Adjusted", cls: "text-gray-600 dark:text-gray-300" },
}

export default function TillCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [settings, setSettings] = useState<LoyaltySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const [query, setQuery] = useState("")

  const [form, setForm] = useState<{ open: boolean; id?: string; name: string; phone: string; email: string }>(
    { open: false, name: "", phone: "", email: "" },
  )
  const [sheet, setSheet] = useState<{ customer: CustomerRow; entries: LoyaltyEntryRow[] } | null>(null)
  const [adjust, setAdjust] = useState<{ points: string; reason: string }>({ points: "", reason: "" })

  const refresh = async (q?: string) => {
    const [list, s] = await Promise.all([
      getCustomers({ query: q ?? query ?? undefined }),
      getLoyaltySettings({}),
    ])
    setRows(list)
    setSettings(s)
  }

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])

  useEffect(() => {
    const id = setTimeout(() => { void refresh(query) }, 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 2500) }

  const submit = async () => {
    setBusy(true); setError("")
    const r = await saveCustomer({
      ...(form.id ? { customerId: form.id } : {}),
      name: form.name, phone: form.phone,
      ...(form.email ? { email: form.email } : {}),
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refresh()
    setForm({ open: false, name: "", phone: "", email: "" })
    flash(form.id ? "Saved" : form.name + " is signed up")
  }

  const openSheet = async (id: string) => {
    setBusy(true); setError("")
    const h = await getCustomerHistory({ customerId: id })
    setBusy(false)
    if (!h) { setError("That customer could not be opened."); return }
    setSheet(h)
    setAdjust({ points: "", reason: "" })
  }

  const submitAdjust = async () => {
    if (!sheet) return
    setBusy(true); setError("")
    const r = await adjustPoints({
      customerId: sheet.customer.id,
      points: Number(adjust.points),
      reason: adjust.reason,
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refresh()
    await openSheet(sheet.customer.id)
    flash("Points adjusted")
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  const totalPoints = rows.reduce((a, r) => a + r.pointsBalance, 0)

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/pos/home" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95 transition-transform">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Customers</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            {settings?.enabled
              ? `${settings.pointsPerHundred} point per KSh 100 spent. Each point is worth KSh ${settings.shillingsPerPoint}.`
              : "Points are switched off. Turn them on in POS settings."}
          </p>
        </div>
        {!form.open && (
          <Button onClick={() => setForm({ open: true, name: "", phone: "", email: "" })} className="h-10 px-3 rounded-xl text-xs flex-shrink-0">
            <Plus className="w-3.5 h-3.5 mr-1" /> Sign up
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{saved}</p>
        </div>
      )}

      {form.open && (
        <Card className="p-4 rounded-2xl border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {form.id ? "Edit " + form.name : "Sign someone up"}
            </p>
            <button onClick={() => { setForm({ open: false, name: "", phone: "", email: "" }); setError("") }} aria-label="Cancel" className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-95">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">
            A name and a number is all it takes. No password, no email needed.
          </p>
          <div className="mt-3 space-y-2.5">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Their name" className="h-11 rounded-xl text-sm" />
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d+]/g, "").slice(0, 13) }))} inputMode="tel" placeholder="07xx xxx xxx" className="h-11 rounded-xl text-sm tabular-nums" />
            <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email (optional)" className="h-11 rounded-xl text-sm" />
            <Button onClick={submit} disabled={busy || form.name.trim().length < 2 || form.phone.length < 9} className="w-full h-11 rounded-xl text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : form.id ? "Save" : "Sign up"}
            </Button>
          </div>
        </Card>
      )}

      {rows.length > 0 && settings?.enabled && (
        <Card className="p-3 rounded-2xl gap-0 py-3">
          <div className="flex items-center gap-2.5">
            <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="min-w-0 flex-1 text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
              {rows.length} {rows.length === 1 ? "member holds" : "members hold"}{" "}
              <span className="font-semibold">{totalPoints.toLocaleString("en-KE")} points</span>
              {" "}between them, worth KSh {sh(totalPoints * (settings?.shillingsPerPoint ?? 1))} off future shopping.
            </p>
          </div>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone"
          className="h-12 pl-9 rounded-xl text-base"
        />
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-center rounded-2xl">
          <Star className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
            {query ? "Nobody matches that" : "No members yet"}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {query ? "Try the phone number they joined with." : "Sign a regular up at the counter. It takes a name and a number."}
          </p>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((c) => (
            <Card key={c.id} className={`p-3 rounded-2xl gap-0 py-3 ${c.isActive ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {c.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                </span>
                <button onClick={() => void openSheet(c.id)} className="min-w-0 flex-1 text-left active:scale-[0.99]">
                  <span className={`block text-xs font-semibold truncate ${c.isActive ? "text-gray-900 dark:text-white" : "text-gray-400 line-through"}`}>
                    {c.name}
                  </span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                    {c.phone} &middot; {c.visits} {c.visits === 1 ? "visit" : "visits"} &middot; KSh {sh(c.totalSpent)} spent
                  </span>
                </button>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums leading-tight">
                    {c.pointsBalance.toLocaleString("en-KE")}
                  </p>
                  {/* The number that means something to the person holding
                      the receipt. "240 points" does not; "KSh 240" does. */}
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                    KSh {sh(c.pointsValue)}
                  </p>
                </div>
                <button
                  onClick={() => setForm({ open: true, id: c.id, name: c.name, phone: c.phone, email: c.email ?? "" })}
                  aria-label={"Edit " + c.name}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-95 flex-shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* --- one person's statement ------------------------------------- */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-black/40">
          <div className="w-full lg:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl lg:rounded-2xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{sheet.customer.name}</p>
                <p className="text-[11px] text-gray-500 tabular-nums">{sheet.customer.phone}</p>
              </div>
              <button onClick={() => setSheet(null)} aria-label="Close" className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-90 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Points" value={sheet.customer.pointsBalance.toLocaleString("en-KE")} sub={"KSh " + sh(sheet.customer.pointsValue)} />
                <Stat label="Spent" value={"KSh " + sh(sheet.customer.totalSpent)} />
                <Stat label="Visits" value={String(sheet.customer.visits)} />
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                  <TrendingUp className="w-3.5 h-3.5" /> Change the balance by hand
                </p>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={adjust.points}
                    onChange={(e) => setAdjust((a) => ({ ...a, points: e.target.value.replace(/[^\d-]/g, "") }))}
                    inputMode="numeric"
                    placeholder="+50 or -50"
                    className="h-11 rounded-xl text-sm tabular-nums w-28"
                  />
                  <Input
                    value={adjust.reason}
                    onChange={(e) => setAdjust((a) => ({ ...a, reason: e.target.value }))}
                    placeholder="Why?"
                    className="h-11 rounded-xl text-sm flex-1"
                  />
                </div>
                <Button
                  onClick={submitAdjust}
                  disabled={busy || !adjust.points || adjust.reason.trim().length < 3}
                  className="mt-2 w-full h-11 rounded-xl text-xs"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                </Button>
                <p className="mt-1.5 text-[11px] text-gray-400 leading-snug">
                  The reason is kept with it. An unexplained change to someone&apos;s balance is
                  exactly what a fraud looks like.
                </p>
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <History className="w-3.5 h-3.5" /> Statement
                </p>
                {sheet.entries.length === 0 ? (
                  <p className="mt-1.5 text-[11px] text-gray-500">Nothing yet.</p>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {sheet.entries.map((e) => {
                      const k = KIND_LABEL[e.kind] ?? { text: e.kind, cls: "text-gray-500" }
                      return (
                        <div key={e.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                          <span className="text-gray-400 w-12 flex-shrink-0 tabular-nums">
                            {new Date(e.occurredAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                          </span>
                          <span className={`w-16 flex-shrink-0 font-semibold ${k.cls}`}>{k.text}</span>
                          <span className="min-w-0 flex-1 truncate text-gray-500 dark:text-gray-400">{e.reason ?? ""}</span>
                          <span className={`tabular-nums font-semibold flex-shrink-0 ${e.points >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-300"}`}>
                            {e.points > 0 ? "+" : ""}{e.points}
                          </span>
                          <span className="tabular-nums text-gray-400 w-10 text-right flex-shrink-0">{e.balanceAfter}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={async () => {
                  setBusy(true)
                  await setCustomerActive({ customerId: sheet.customer.id, isActive: !sheet.customer.isActive })
                  await refresh()
                  setBusy(false)
                  setSheet(null)
                }}
                disabled={busy}
                className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 inline-flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" />
                {sheet.customer.isActive ? "Take off the scheme" : "Put back on the scheme"}
              </button>
              <p className="text-[11px] text-gray-400 leading-snug">
                Kept, never deleted: the points are a debt the shop owes, and their purchases
                have to stay readable.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{sub}</p>}
    </div>
  )
}
