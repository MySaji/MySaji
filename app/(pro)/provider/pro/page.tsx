"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Crown, Loader2, CheckCircle2, XCircle, Sparkles, Wrench, ShieldCheck, TrendingUp, Wallet } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { getMySubscriptionStatus, checkProSubscriptionPaymentStatus, getMyWalletBalance, type ProviderSubscriptionStatus } from "@/backend/actions/provider-subscription"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

type PurchaseState = "idle" | "awaiting-provider" | "success" | "failed"

const BENEFITS = [
  { icon: Sparkles, title: "Unlimited Offer cards", desc: "Go beyond the standard service listing. Create as many discoverable offers as your business needs." },
  { icon: Wrench, title: "Equipment & tool rentals", desc: "List your own equipment for rent alongside your services." },
  { icon: TrendingUp, title: "Priority discovery", desc: "Saji structures how your offers surface to customers so the right ones find you first." },
  { icon: ShieldCheck, title: "Trust & safety badge", desc: "A verified Saji Pro badge customers can rely on across Book, Hire, Buy, Quote, and Request." },
]

export default function ProviderProPage() {
  const { formatMoney } = useLocalization()
  const [status, setStatus] = useState<ProviderSubscriptionStatus>(null)
  const [walletBalance, setWalletBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [phone, setPhone] = useState("")
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = () => getMySubscriptionStatus().then(setStatus)

  useEffect(() => {
    Promise.all([refresh(), getMyWalletBalance().then(setWalletBalance)]).finally(() => setIsLoading(false))
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const startPolling = (paymentId: string) => {
    setPurchaseState("awaiting-provider")
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const result = await checkProSubscriptionPaymentStatus(paymentId)
      if (!result) return
      if (result.status === "COMPLETED") {
        if (pollRef.current) clearInterval(pollRef.current)
        setPurchaseState("success")
        refresh()
      } else if (result.status === "FAILED") {
        if (pollRef.current) clearInterval(pollRef.current)
        setPurchaseState("failed")
        setMessage(result.failureReason || "Payment failed or was cancelled.")
      }
    }, 3000)
  }

  const purchase = async (provider: "mpesa" | "paypal" | "card" | "wallet") => {
    setMessage(null)
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { context: "provider-subscription", provider }
      if (provider === "mpesa") body.phone = phone

      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!data?.success) {
        setMessage(data?.message ?? "Payment could not be started.")
        setSubmitting(false)
        return
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      if (data.instant) {
        setPurchaseState("success")
        setMessage(data.message ?? null)
        await refresh()
        setWalletBalance((b) => b - status!.priceKES)
        setSubmitting(false)
        return
      }
      if (data.simulated) {
        setPurchaseState("success")
        setMessage(data.message ?? null)
        await refresh()
        setSubmitting(false)
        return
      }
      if (data.paymentId) {
        setMessage(data.message ?? "Waiting for confirmation...")
        startPolling(data.paymentId)
        setSubmitting(false)
        return
      }
      setMessage(data.message ?? "Unexpected response. Please try again.")
      setSubmitting(false)
    } catch (err: any) {
      setMessage(err?.message ?? "Error initiating payment")
      setSubmitting(false)
    }
  }

  if (isLoading || !status) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  const expiryLabel = status.currentPeriodEnd ? new Date(status.currentPeriodEnd).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_rgba(240,253,250,1),_rgba(248,250,252,1))] pb-10 dark:bg-[linear-gradient(135deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]">
      <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 text-white lg:rounded-b-3xl">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100"><Crown className="h-4 w-4" /> Saji Pro</div>
          <h1 className="mt-2 text-2xl font-bold lg:text-3xl">{status.isPro ? "You're a Saji Pro subscriber" : "Unlock advanced provider features"}</h1>
          <p className="mt-2 max-w-xl text-amber-50">
            {status.isPro
              ? `Your subscription is active${expiryLabel ? ` until ${expiryLabel}` : ""}.`
              : "Provider controls the offer, Saji structures discovery and applies trust & safety rules. Customers choose Book, Hire, Buy, Quote, or Request."}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 -mt-4 space-y-4">
        <Card className="border-0 p-5 shadow-lg">
          <div className="grid gap-4 sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <benefit.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{benefit.title}</p>
                  <p className="text-[11px] text-muted-foreground">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {status.isPro ? (
          <Card className="border-0 p-5 shadow-lg text-center space-y-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/40">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">Active until {expiryLabel}</p>
            <p className="text-[11px] text-muted-foreground">Saji Pro renews manually each month. Come back here to renew when it's due.</p>
            <Button asChild className="mt-2 rounded-xl"><Link href="/provider/pro/dashboard">Go to your Pro Dashboard</Link></Button>
          </Card>
        ) : purchaseState === "success" ? (
          <Card className="border-0 p-6 text-center space-y-2 shadow-lg border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/40">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">Payment successful. You're now on Saji Pro</p>
            {message && <p className="text-[11px] text-muted-foreground">{message}</p>}
          </Card>
        ) : purchaseState === "awaiting-provider" ? (
          <Card className="border-0 p-6 text-center space-y-3 shadow-lg">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" />
            <p className="font-semibold text-foreground">Waiting for payment confirmation…</p>
            <p className="text-[11px] text-muted-foreground">{message ?? "Check your phone and approve the payment prompt."}</p>
            <Button variant="outline" size="sm" onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setPurchaseState("idle"); setMessage(null) }}>
              Cancel & choose another method
            </Button>
          </Card>
        ) : (
          <Card className="border-0 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Subscribe to Saji Pro</h3>
              <p className="text-lg font-bold text-foreground">{formatMoney(status.priceKES)}<span className="text-xs font-normal text-muted-foreground">/month</span></p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Mobile number (for M-Pesa)</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX or 2547XXXXXXXX" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Button onClick={() => purchase("mpesa")} disabled={submitting || phone.trim().length < 9} className="bg-yellow-400 text-black hover:bg-yellow-500">M-Pesa</Button>
              <Button onClick={() => purchase("paypal")} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">PayPal</Button>
              <Button onClick={() => purchase("card")} disabled={submitting}>Card</Button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Pay from Saji Wallet</p>
                  <p className="text-[11px] text-muted-foreground">Balance: {formatMoney(walletBalance)}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => purchase("wallet")}
                disabled={submitting || walletBalance < status.priceKES}
                className="flex-shrink-0 rounded-xl bg-transparent"
              >
                One-time payment
              </Button>
            </div>
            {walletBalance < status.priceKES && (
              <p className="text-[11px] text-muted-foreground -mt-2">Top up your wallet to pay for Saji Pro this way.</p>
            )}

            {purchaseState === "failed" && (
              <div className="flex items-center gap-2 text-xs text-destructive"><XCircle className="h-4 w-4" /> {message}</div>
            )}
            {purchaseState === "idle" && message && <p className="text-[11px] break-words rounded bg-muted p-3">{message}</p>}
            {submitting && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Starting payment…</p>}
          </Card>
        )}
      </div>
    </div>
  )
}
