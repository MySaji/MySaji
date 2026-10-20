"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import { ArrowLeft, Loader2, Wallet, AlertTriangle, Check, Clock } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { getMyPosBilling, type ShopBillingView } from "@/backend/actions/pos-billing-shop"

/**
 * What the shopkeeper pays for the till.
 *
 * A shopkeeper who cannot see their own bill is one who will be surprised by
 * it, so this says the whole thing: what is owed, what it is for, when the
 * till stops if nothing is paid, and every charge that has ever been raised.
 *
 * Nothing on this page can mark anything paid. A till that could settle its
 * own subscription would not be a subscription, so paying happens by the
 * routes the platform actually banks, and support records it.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Free trial",
  ACTIVE: "Paid up",
  PAST_DUE: "Payment due",
  SUSPENDED: "Till paused",
  CANCELLED: "Cancelled",
}

export default function TillSubscriptionPage() {
  const [view, setView] = useState<ShopBillingView>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyPosBilling({}).then((v) => { setView(v); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!view) {
    return (
      <div className="p-4 w-full min-w-0">
        <Card className="p-6 text-center rounded-2xl">
          <Wallet className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            There is no till on this account, or only the owner can see the subscription.
          </p>
          <Link href="/pos/sell"><Button variant="outline" className="mt-4 h-10 rounded-xl">Back to the till</Button></Link>
        </Card>
      </div>
    )
  }

  const unpaid = view.charges.filter((c) => c.status === "DUE")

  return (
    <div className="p-4 md:p-6 xl:p-8 w-full min-w-0 space-y-5 pb-12">
      <div className="rounded-2xl border border-border bg-background p-5 md:p-6"><WorkspaceHeading title="Plan & billing" /><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Review your subscription, balance and payment history.</p></div>
      <Link href="/pos/settings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>

      <Card className="p-4 rounded-2xl">
        <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {STATUS_LABEL[view.status] ?? view.status}
        </p>
        <p className={
          view.owed > 0
            ? "mt-0.5 text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums"
            : "mt-0.5 text-2xl font-bold text-gray-900 dark:text-white tabular-nums"
        }>
          {view.currency} {sh(view.owed)}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
          {view.owed > 0 ? "outstanding" : "nothing owed"}
        </p>

        {view.message && (
          <div className={
            view.canSell
              ? "mt-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/15 px-3 py-2.5"
              : "mt-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5"
          }>
            <p className={
              view.canSell
                ? "text-[11px] text-amber-800 dark:text-amber-300 leading-snug"
                : "text-[11px] text-red-700 dark:text-red-300 leading-snug"
            }>
              {view.message}
            </p>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Mini label="Every month" value={view.currency + " " + sh(view.monthlyFee)} />
          <Mini
            label={view.status === "TRIAL" ? "Trial ends" : "Paid until"}
            value={view.until ? new Date(view.until).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "not yet"}
          />
        </div>
      </Card>

      {unpaid.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">How to pay</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            Pay the {view.currency} {sh(view.owed)} to SAJI through the details support gave you,
            then send them the M-Pesa code. They mark it paid and the till is back the moment
            they do.
          </p>
          <p className="mt-2 text-[11px] text-gray-400 leading-snug">
            Keep the code. It is the only thing that connects your payment to your shop.
          </p>
        </Card>
      )}

      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Your charges</h2>
        {view.charges.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Nothing has been charged yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {view.charges.map((c) => (
              <div key={c.id} className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">
                      {c.kind === "SETUP" ? "Setting the till up" : "Monthly"}
                      {c.periodStart && c.periodEnd
                        ? " · " + new Date(c.periodStart).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) +
                          " to " + new Date(c.periodEnd).toLocaleDateString("en-KE", { day: "numeric", month: "short" })
                        : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400 tabular-nums">
                      {c.status === "PAID"
                        ? "Paid " + (c.paidAt ? new Date(c.paidAt).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "") +
                          (c.reference ? " · " + c.reference : "")
                        : c.status === "WAIVED"
                          ? "Waived by SAJI"
                          : "Not paid yet"}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {c.status === "PAID" && <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={3} />}
                    {c.status === "DUE" && <Clock className="w-3.5 h-3.5 text-amber-600" />}
                    <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
                      {view.currency} {sh(c.amount)}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug px-0.5">
        If the till is ever paused, nothing of yours is deleted. Your stock figures, your sales
        history and your customer list stay exactly where they are and you can still read them.
        Only ringing up a new sale stops.
      </p>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}
