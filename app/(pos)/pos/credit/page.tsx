"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import {
  ArrowLeft, Loader2, AlertTriangle, HandCoins, Users, Check,
} from "lucide-react"
import {
  getCreditCustomers, getCustomerStatement, getCreditAgeing,
  setCreditLimit, recordCreditPayment, adjustCredit,
  type CustomerCreditRow, type CreditEntryRow, type AgeingBucket,
} from "@/backend/actions/pos-credit"

/**
 * Who owes the shop money.
 *
 * The page leads with the ageing, not the list of names, because the question
 * a shopkeeper has is "how worried should I be" and a hundred names does not
 * answer it. The names are underneath, worst first.
 *
 * "Still owed" is never called earnings anywhere here. It is money that has
 * left the shop as goods and has not come back as cash.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "2-digit" })

const KIND_LABEL: Record<CreditEntryRow["kind"], string> = {
  CHARGE: "Taken on the book",
  PAYMENT: "Paid",
  ADJUSTMENT: "Adjusted",
}

export default function CreditPage() {
  const [rows, setRows] = useState<CustomerCreditRow[]>([])
  const [ageing, setAgeing] = useState<AgeingBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [statement, setStatement] = useState<{ customer: CustomerCreditRow; entries: CreditEntryRow[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [pay, setPay] = useState("")
  const [limit, setLimit] = useState("")

  const refresh = async () => {
    setRows(await getCreditCustomers())
    setAgeing(await getCreditAgeing())
  }

  useEffect(() => {
    Promise.all([getCreditCustomers(), getCreditAgeing()])
      .then(([r, a]) => { setRows(r); setAgeing(a) })
      .finally(() => setLoading(false))
  }, [])

  const open = async (id: string) => {
    setOpenId(id); setStatement(null); setError(""); setPay(""); setLimit("")
    setStatement(await getCustomerStatement(id))
  }

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true); setError("")
    const r = await fn()
    setBusy(false)
    if (!r.success) { setError(r.error ?? "That did not work."); return false }
    await refresh()
    if (openId) setStatement(await getCustomerStatement(openId))
    return true
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const owed = rows.reduce((a, r) => a + r.balance, 0)
  const overdue = rows.reduce((a, r) => a + r.overdue, 0)

  return (
    <div className="p-4 md:p-6 xl:p-8 w-full min-w-0 space-y-5 pb-12">
      <Link
        href="/pos/sell"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      <div>
        <WorkspaceHeading title="On the book" />
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Goods that have left the shop and have not come back as cash. A customer
          can only buy on the book up to a limit you set for them.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      <Card className="p-4 rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Owed to the shop</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">KSh {sh(owed)}</p>
          </div>
          {overdue > 0 && (
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Past its date</p>
              <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{sh(overdue)}</p>
            </div>
          )}
        </div>

        {ageing.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {ageing.map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="w-28 flex-shrink-0 text-[11px] text-muted-foreground">{b.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={"h-full " + (/Not yet/.test(b.label) ? "bg-emerald-500" : /1 to 30/.test(b.label) ? "bg-amber-400" : "bg-red-500")}
                    style={{ width: Math.max(2, (b.amount / Math.max(owed, 1)) * 100) + "%" }}
                  />
                </div>
                <span className="w-24 text-right text-xs font-semibold tabular-nums text-foreground">{sh(b.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {rows.length === 0 && (
        <Card className="p-6 rounded-2xl text-center">
          <Users className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">Nobody is on the book</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Open a customer from Customers and give them a limit. Until you do,
            nobody can buy on credit, which is the safe default.
          </p>
        </Card>
      )}

      {rows.map((c) => {
        const isOpen = openId === c.id
        return (
          <Card key={c.id} className="rounded-2xl overflow-hidden">
            <button
              onClick={() => (isOpen ? setOpenId(null) : void open(c.id))}
              className="w-full p-4 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{c.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.phone} &middot; limit {sh(c.creditLimit)} &middot; {sh(c.available)} left
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold tabular-nums text-foreground">{sh(c.balance)}</p>
                  {c.overdue > 0 && (
                    <p className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                      {sh(c.overdue)} late
                      {c.oldestOverdueDays ? " · " + c.oldestOverdueDays + "d" : ""}
                    </p>
                  )}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border p-4 space-y-3">
                {!statement ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        inputMode="decimal"
                        value={pay}
                        onChange={(e) => setPay(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="Amount paid"
                        className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
                      />
                      <button
                        onClick={async () => {
                          const ok = await run(() => recordCreditPayment({ posCustomerId: c.id, amount: pay }))
                          if (ok) setPay("")
                        }}
                        disabled={busy || !pay}
                        className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <HandCoins className="w-4 h-4" /> Take payment
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        inputMode="decimal"
                        value={limit}
                        onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder={"New limit (now " + sh(c.creditLimit) + ")"}
                        className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
                      />
                      <button
                        onClick={async () => {
                          const ok = await run(() => setCreditLimit({ posCustomerId: c.id, creditLimit: limit }))
                          if (ok) setLimit("")
                        }}
                        disabled={busy || !limit}
                        className="h-11 px-4 rounded-lg border border-border text-sm font-semibold active:scale-95 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>

                    {c.balance > 0 && (
                      <button
                        onClick={() => {
                          const why = window.prompt("Why is this being written off?")
                          if (why) void run(() => adjustCredit({ posCustomerId: c.id, amount: -c.balance, reason: why }))
                        }}
                        disabled={busy}
                        className="w-full h-10 rounded-lg border border-border text-xs font-semibold text-muted-foreground active:scale-95 disabled:opacity-50"
                      >
                        Write the balance off
                      </button>
                    )}

                    <ul className="divide-y divide-border">
                      {statement.entries.map((e) => (
                        <li key={e.id} className="py-2 flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className={"text-xs font-medium text-foreground " + (e.voided ? "line-through opacity-60" : "")}>
                              {KIND_LABEL[e.kind]}
                              {e.note ? " · " + e.note : ""}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {day(e.occurredAt)}
                              {e.dueOn ? " · due " + day(e.dueOn) : ""}
                              {e.reference ? " · " + e.reference : ""}
                              {e.recordedBy ? " · " + e.recordedBy : ""}
                            </p>
                          </div>
                          <span className={"text-xs font-semibold tabular-nums " +
                            (e.amount > 0 ? "text-foreground" : "text-emerald-600 dark:text-emerald-400")}>
                            {e.amount > 0 ? "+" : ""}{sh(e.amount)}
                          </span>
                          {e.balanceAfter !== null && (
                            <span className="w-20 text-right text-[10px] tabular-nums text-muted-foreground">
                              {sh(e.balanceAfter)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
