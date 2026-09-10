"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Check, Clock, Loader2, MessageCircle, Package, Receipt,
  TrendingUp, XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { getMyOfferSales, type MyOfferSales } from "@/lib/actions/provider-products"
import { acceptJob, declineJob, completeJob } from "@/lib/actions/provider-jobs"
import { useLocalization } from "@/lib/hooks/useLocalization"

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  PENDING: { label: "New order", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  ACCEPTED: { label: "Accepted", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  IN_PROGRESS: { label: "Preparing", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPLETED: { label: "Delivered", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  DISPUTED: { label: "Disputed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

/**
 * Sales — what this account has sold through its Buy offers.
 *
 * The "Sell Products" work page. It deliberately reads the same Job rows
 * /provider/jobs shows and drives them with the same accept/decline/complete
 * actions; what it adds is a view shaped like selling rather than like
 * service bookings, and one that a free account can see. Before this, a Pro
 * who ticked "Sell Products" at signup and made a sale had it filed under
 * Pending on a page titled "My Jobs", or nowhere at all.
 */
export default function ProductSalesPage() {
  const { formatMoney } = useLocalization()
  const [data, setData] = useState<MyOfferSales | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const refresh = () => getMyOfferSales().then(setData)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const run = async (jobId: string, fn: (input: unknown) => Promise<{ success: boolean; error?: string }>) => {
    setBusyId(jobId)
    setError("")
    const result = await fn({ jobId })
    setBusyId(null)
    if (!result.success) {
      setError(result.error ?? "Could not update that sale.")
      return
    }
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const sales = data?.sales ?? []

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link
          href="/provider"
          aria-label="Back"
          className="lg:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground flex items-center gap-2">
          <Receipt className="w-5 h-5 text-amber-500 flex-shrink-0" />
          Sales
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5 ml-9 lg:ml-0">
        Everything sold through your Buy offers.
      </p>

      {/* Totals — two up on a phone, never a squeezed three-across row. */}
      <div className="grid grid-cols-2 gap-2.5 mb-5">
        <div className="rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> Waiting on you
          </p>
          <p className="text-xl font-bold text-foreground mt-1">{data?.pendingCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Earned
          </p>
          <p className="text-xl font-bold text-foreground mt-1">{formatMoney(data?.earned ?? 0)}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      {sales.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Package className="w-7 h-7 text-muted-foreground mx-auto mb-2.5" />
          <p className="text-sm font-medium text-foreground">No sales yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
            When someone buys one of your Buy offers it lands here, and you accept and fulfil it from this page.
          </p>
          <Link href="/provider/offers/new?actionType=BUY">
            <Button size="sm" className="mt-4 rounded-lg text-xs">List something for sale</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => {
            const style = STATUS_STYLE[sale.status] ?? { label: sale.status, className: "bg-muted text-muted-foreground" }
            const isBusy = busyId === sale.jobId
            return (
              <div key={sale.jobId} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground text-sm leading-tight min-w-0">{sale.productTitle}</p>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${style.className}`}>
                        {style.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {sale.buyerName} &middot; {sale.quantity} &times; &middot; {formatMoney(sale.price)}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {new Date(sale.createdAt).toLocaleDateString()}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {sale.status === "PENDING" && (
                        <>
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => run(sale.jobId, acceptJob)}
                            className="h-8 rounded-lg text-xs gap-1"
                          >
                            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Accept</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => run(sale.jobId, declineJob)}
                            className="h-8 rounded-lg text-xs"
                          >
                            Decline
                          </Button>
                        </>
                      )}
                      {(sale.status === "ACCEPTED" || sale.status === "IN_PROGRESS") && (
                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => run(sale.jobId, completeJob)}
                          className="h-8 rounded-lg text-xs gap-1"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark delivered"}
                        </Button>
                      )}
                      <Link
                        href={`/provider/messages?customerId=${sale.buyerId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline active:scale-95 transition-transform"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Message buyer
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
