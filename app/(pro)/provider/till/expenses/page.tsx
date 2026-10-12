"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Plus, Wallet, X, Ban, RotateCcw, TrendingDown,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getExpenses, getExpenseMonths, recordExpense, voidExpense, repeatExpense,
  type ExpenseView, type ExpenseRow,
} from "@/backend/actions/pos-expenses"
import {
  POS_EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, EXPENSE_CATEGORY_HINT,
  type PosExpenseCategoryKey,
} from "@/backend/domain/pos-expense-categories"

/**
 * What went out, beside the stock.
 *
 * WHAT THIS PAGE IS REALLY ANSWERING
 *
 * Not "what did I spend", which a shopkeeper half knows already, but "did I
 * keep anything". So the figure at the top is takings, minus what the goods
 * cost, minus these expenses, and it is labelled as what it is rather than
 * as profit: it is only as true as the cost prices behind it, and the page
 * says plainly when those are missing.
 *
 * ONE MONTH AT A TIME
 *
 * Rent, power and wages are monthly, so the month is the unit a shopkeeper
 * thinks in. Everything here is scoped to one, and the month picker is the
 * first control on the page.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PAID_WITH = [
  { key: "CASH", label: "Cash" },
  { key: "MPESA", label: "M-Pesa" },
  { key: "BANK", label: "Bank" },
  { key: "CARD", label: "Card" },
  { key: "CREDIT", label: "On credit" },
] as const

const PAID_LABEL: Record<string, string> = {
  CASH: "Cash", MPESA: "M-Pesa", BANK: "Bank", CARD: "Card", CREDIT: "On credit", SPLIT: "Split",
}

function monthName(month: string): string {
  const d = new Date(month + "-01T12:00:00.000Z")
  return d.toLocaleDateString("en-KE", { month: "long", year: "numeric" })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function TillExpensesPage() {
  const [view, setView] = useState<ExpenseView>(null)
  const [months, setMonths] = useState<string[]>([])
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 10).slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [category, setCategory] = useState<PosExpenseCategoryKey>("RENT")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [paidWith, setPaidWith] = useState<string>("CASH")
  const [payee, setPayee] = useState("")
  const [reference, setReference] = useState("")
  const [occurredOn, setOccurredOn] = useState(today())

  const [cancelling, setCancelling] = useState<ExpenseRow | null>(null)
  const [reason, setReason] = useState("")

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 3500) }

  const reload = async (m: string) => {
    const v = await getExpenses({ month: m })
    setView(v)
  }

  useEffect(() => {
    Promise.all([getExpenses({ month }), getExpenseMonths({})])
      .then(([v, ms]) => { setView(v); setMonths(ms); setLoading(false) })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickMonth = async (m: string) => {
    setMonth(m); setBusy("month")
    await reload(m)
    setBusy(null)
  }

  const submit = async () => {
    setBusy("save"); setError("")
    const r = await recordExpense({
      category,
      description: description.trim(),
      amount: Number(amount) || 0,
      paidWith,
      ...(payee.trim() ? { payee: payee.trim() } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      occurredOn,
    })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    // Recorded into the month it happened in, which is not always the one
    // being looked at.
    const landedIn = occurredOn.slice(0, 7)
    if (landedIn !== month) setMonth(landedIn)
    await reload(landedIn)
    setMonths(await getExpenseMonths({}).catch(() => months))
    flash("KSh " + sh(Number(amount) || 0) + " recorded")
    setFormOpen(false)
    setDescription(""); setAmount(""); setPayee(""); setReference("")
  }

  const cancel = async () => {
    if (!cancelling) return
    setBusy("void"); setError("")
    const r = await voidExpense({ expenseId: cancelling.id, reason: reason.trim() })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await reload(month)
    flash("Cancelled, and the reason is on the record")
    setCancelling(null); setReason("")
  }

  const again = async (row: ExpenseRow) => {
    setBusy(row.id); setError("")
    const r = await repeatExpense({ expenseId: row.id, occurredOn: today() })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    const m = today().slice(0, 7)
    if (m !== month) setMonth(m)
    await reload(m)
    flash(row.description + " recorded again for today")
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!view) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <Wallet className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            There is no till on this account, or your role does not include the money side.
          </p>
          <Link href="/provider/till"><Button variant="outline" className="mt-4 h-10 rounded-xl">Back to the till</Button></Link>
        </Card>
      </div>
    )
  }

  const kept = view.kept

  return (
    <div className="p-3 max-w-3xl mx-auto space-y-3 pb-24">
      <Link href="/provider/till" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{saved}</p>
        </div>
      )}
      {error && !formOpen && !cancelling && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {/* ---- the month --------------------------------------------------- */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {months.slice(0, 12).map((m) => (
          <button
            key={m}
            onClick={() => void pickMonth(m)}
            aria-pressed={m === month}
            disabled={busy === "month"}
            className={
              m === month
                ? "h-10 px-3 rounded-xl border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 active:scale-95 border-primary bg-primary/5 text-primary"
                : "h-10 px-3 rounded-xl border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
            }
          >
            {monthName(m)}
          </button>
        ))}
      </div>

      {/* ---- did the month pay for itself -------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {monthName(month)}
        </p>
        <p className={
          kept >= 0
            ? "mt-0.5 text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums"
            : "mt-0.5 text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums"
        }>
          {kept >= 0 ? "KSh " + sh(kept) : "-KSh " + sh(Math.abs(kept))}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
          {kept >= 0 ? "kept, after goods and these costs" : "short, once the costs are counted"}
        </p>

        <div className="mt-3 space-y-1.5">
          <Line label="Taken over the counter" value={sh(view.sales)} />
          <Line label="What the goods cost" value={"-" + sh(view.costOfGoods)} muted />
          <Line label="Everything else here" value={"-" + sh(view.spent)} muted />
        </div>

        {view.salesWithoutCost > 0 && (
          <p className="mt-2.5 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
            {view.salesWithoutCost} sold line{view.salesWithoutCost === 1 ? " has" : "s have"} no cost
            recorded against {view.salesWithoutCost === 1 ? "it" : "them"}, so the goods figure is
            lower than the truth and this number is flattering. Fill the costs in on the{" "}
            <Link href="/provider/till/products" className="underline font-semibold">products page</Link>.
          </p>
        )}
      </Card>

      {/* ---- where it went ------------------------------------------------ */}
      {view.byCategory.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Where it went</h2>
          <div className="mt-3 space-y-2.5">
            {view.byCategory.map((slice) => (
              <div key={slice.category}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate">
                    {slice.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0">
                    KSh {sh(slice.amount)}
                    <span className="ml-1 opacity-60">{slice.share}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: Math.max(2, slice.share) + "%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {view.canManage && (
        <Button onClick={() => { setFormOpen(true); setError(""); setOccurredOn(today()) }} className="w-full h-12 rounded-xl text-sm font-semibold">
          <Plus className="w-4 h-4 mr-1" /> Record something you paid for
        </Button>
      )}

      {/* ---- the list ------------------------------------------------------ */}
      {view.rows.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl">
          <Wallet className="w-9 h-9 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Nothing recorded for {monthName(month)}. Rent, power, wages, transport and the
            licence all belong here. Stock does not: goods you bought to sell are already
            counted when you receive them.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {view.rows.map((row) => (
            <Card key={row.id} className={row.voided ? "p-3 rounded-2xl opacity-60" : "p-3 rounded-2xl"}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className={
                    row.voided
                      ? "text-sm font-semibold text-gray-500 dark:text-gray-400 line-through leading-snug"
                      : "text-sm font-semibold text-gray-900 dark:text-white leading-snug"
                  }>
                    {row.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400 truncate">
                    {row.categoryLabel}
                    {row.payee ? " · " + row.payee : ""}
                    {" · "}{PAID_LABEL[row.paidWith] ?? row.paidWith}
                    {row.reference ? " · " + row.reference : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400 tabular-nums">
                    {new Date(row.occurredAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}{row.recordedBy}
                  </p>
                </div>
                <span className={
                  row.voided
                    ? "text-sm font-bold text-gray-400 tabular-nums flex-shrink-0 line-through"
                    : "text-sm font-bold text-gray-900 dark:text-white tabular-nums flex-shrink-0"
                }>
                  KSh {sh(row.amount)}
                </span>
              </div>

              {row.voided ? (
                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                  Cancelled by {row.voidedBy ?? "somebody"}: {row.voidReason}
                </p>
              ) : view.canManage ? (
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => void again(row)}
                    disabled={busy === row.id}
                    className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 disabled:opacity-60"
                  >
                    {busy === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    Same again today
                  </button>
                  <button
                    onClick={() => { setCancelling(row); setReason(""); setError("") }}
                    className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95"
                  >
                    <Ban className="w-3 h-3" /> Cancel it
                  </button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {/* ---- the form ------------------------------------------------------ */}
      {formOpen && (
        <Sheet title="What did you pay for?" onClose={() => setFormOpen(false)}>
          <div className="space-y-2.5">
            <div>
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                What kind of cost
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {POS_EXPENSE_CATEGORIES.map((key) => (
                  <button
                    key={key}
                    onClick={() => setCategory(key)}
                    aria-pressed={category === key}
                    className={
                      category === key
                        ? "h-9 px-2.5 rounded-lg border text-[11px] font-semibold active:scale-95 border-primary bg-primary/5 text-primary"
                        : "h-9 px-2.5 rounded-lg border text-[11px] font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }
                  >
                    {EXPENSE_CATEGORY_LABEL[key]}
                  </button>
                ))}
              </div>
              {EXPENSE_CATEGORY_HINT[category] && (
                <p className="mt-1.5 text-[11px] text-gray-400 leading-snug">{EXPENSE_CATEGORY_HINT[category]}</p>
              )}
            </div>

            <Field label="What was it for">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="October rent"
                className="h-11 rounded-xl text-sm"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="How much (KSh)">
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-11 rounded-xl text-sm tabular-nums"
                />
              </Field>
              <Field label="When">
                <Input
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className="h-11 rounded-xl text-sm tabular-nums"
                />
              </Field>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                Paid with
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PAID_WITH.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPaidWith(p.key)}
                    aria-pressed={paidWith === p.key}
                    className={
                      paidWith === p.key
                        ? "h-10 px-3 rounded-xl border text-[11px] font-semibold active:scale-95 border-primary bg-primary/5 text-primary"
                        : "h-10 px-3 rounded-xl border text-[11px] font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Who was paid" hint="Optional.">
                <Input
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="Landlord"
                  className="h-11 rounded-xl text-sm"
                />
              </Field>
              <Field label="Reference" hint="The M-Pesa code or receipt number.">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Optional"
                  className="h-11 rounded-xl text-sm tabular-nums"
                />
              </Field>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
                <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
              </div>
            )}

            <Button
              onClick={() => void submit()}
              disabled={busy === "save" || description.trim().length < 2 || !amount}
              className="w-full h-12 rounded-xl text-sm font-semibold"
            >
              {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record it"}
            </Button>
          </div>
        </Sheet>
      )}

      {/* ---- cancelling ----------------------------------------------------- */}
      {cancelling && (
        <Sheet title={"Cancel " + cancelling.description} onClose={() => setCancelling(null)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            It stays on the record with your name and this reason, because a cost that
            vanishes from a month is how a month stops being believed.
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is it being cancelled?"
            className="mt-3 h-11 rounded-xl text-sm"
            autoFocus
          />
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>}
          <Button
            onClick={() => void cancel()}
            disabled={busy === "void" || reason.trim().length < 3}
            className="mt-3 w-full h-12 rounded-xl text-sm font-semibold"
          >
            {busy === "void" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel this cost"}
          </Button>
        </Sheet>
      )}
    </div>
  )
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className={
        muted
          ? "text-[11px] tabular-nums text-gray-500 dark:text-gray-400"
          : "text-[11px] tabular-nums font-semibold text-gray-900 dark:text-white"
      }>
        {value}
      </span>
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
