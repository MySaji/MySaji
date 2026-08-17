"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle2, XCircle, Wallet } from "lucide-react"
import { checkJobPaymentStatus } from "@/lib/actions/payments"
import { getWalletSummary } from "@/lib/actions/wallet"

type PaymentState = "idle" | "awaiting-provider" | "success" | "failed"

// Gateway confirmation polling: fast at first (most real M-Pesa/Stripe
// approvals land within the first few checks), then backs off so a
// straggling payment doesn't hammer the DB every 3s indefinitely. The last
// value repeats once the schedule is exhausted.
const POLL_BACKOFF_MS = [3000, 3000, 5000, 5000, 8000, 8000, 13000, 13000, 20000]
const POLL_MAX_DURATION_MS = 5 * 60 * 1000

export function PaymentMethods({ amount, jobId, onSuccess }: { amount: number; jobId?: string | null; onSuccess?: () => void }) {
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [state, setState] = useState<PaymentState>("idle")
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const pollStartRef = useRef(0)
  const jobIdRef = useRef(jobId)
  const stateRef = useRef<PaymentState>("idle")

  useEffect(() => {
    jobIdRef.current = jobId
  }, [jobId])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    getWalletSummary().then((summary) => setWalletBalance(summary?.balance ?? 0))
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const clearPoll = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const runPollTick = async () => {
    // No point burning a request against a tab nobody's looking at — just
    // reschedule and check again once it's visible (the visibilitychange
    // listener below also fires an immediate check the moment focus returns).
    if (document.visibilityState !== "visible") {
      scheduleNextPoll()
      return
    }
    if (Date.now() - pollStartRef.current > POLL_MAX_DURATION_MS) {
      setState("failed")
      setMessage("Still waiting for confirmation. Check My Jobs in a few minutes, or contact support if this persists.")
      return
    }
    if (!jobIdRef.current) return
    const status = await checkJobPaymentStatus(jobIdRef.current)
    attemptRef.current += 1
    if (status?.paymentStatus === "COMPLETED") {
      setState("success")
      onSuccess?.()
      return
    }
    if (status?.paymentStatus === "FAILED") {
      setState("failed")
      setMessage(status.failureReason || "Payment failed or was cancelled.")
      return
    }
    scheduleNextPoll()
  }

  const scheduleNextPoll = () => {
    const delay = POLL_BACKOFF_MS[Math.min(attemptRef.current, POLL_BACKOFF_MS.length - 1)]
    clearPoll()
    timeoutRef.current = setTimeout(runPollTick, delay)
  }

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && stateRef.current === "awaiting-provider") {
        clearPoll()
        runPollTick()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startPolling = () => {
    if (!jobId) return
    setState("awaiting-provider")
    attemptRef.current = 0
    pollStartRef.current = Date.now()
    scheduleNextPoll()
  }

  const initiate = async (provider: string) => {
    setMessage(null)
    setLoading(true)
    try {
      if (!jobId) throw new Error("Missing jobId — create booking before initiating payment")
      const body: any = { provider, jobId }
      if (provider === "mpesa" || provider === "airtel") body.phone = phone

      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data) throw new Error("No response")

      if (!data.success) {
        setMessage(data.message ?? "Payment could not be started.")
        setLoading(false)
        return
      }

      if (data.checkoutUrl) {
        // Redirect to provider checkout (Stripe / PayPal)
        window.location.href = data.checkoutUrl
        return
      }

      if (provider === "wallet") {
        // Debited synchronously server-side — no redirect, no polling.
        setState("success")
        setMessage("Paid from your wallet balance.")
        onSuccess?.()
        setLoading(false)
        return
      }

      if (data.simulated) {
        setState("success")
        setMessage(data.message ?? null)
        onSuccess?.()
        setLoading(false)
        return
      }

      if (data.pending) {
        setMessage(data.message ?? "Waiting for confirmation...")
        startPolling()
        setLoading(false)
        return
      }

      setMessage(JSON.stringify(data))
      setLoading(false)
    } catch (err: any) {
      setMessage(err?.message ?? "Error initiating payment")
      setLoading(false)
    }
  }

  if (state === "success") {
    return (
      <Card className="p-6 text-center space-y-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/40">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">Payment successful</p>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </Card>
    )
  }

  if (state === "awaiting-provider") {
    return (
      <Card className="p-6 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />
        <p className="font-semibold text-foreground">Waiting for payment confirmation…</p>
        <p className="text-xs text-muted-foreground">{message ?? "Check your phone and approve the payment prompt."}</p>
        <Button variant="outline" size="sm" onClick={() => { clearPoll(); setState("idle"); setMessage(null) }}>
          Cancel & choose another method
        </Button>
      </Card>
    )
  }

  const hasEnoughWalletBalance = walletBalance != null && walletBalance >= amount

  return (
    <Card className="p-6 space-y-4">
      <h3 className="text-lg font-semibold">Pay KES {amount.toLocaleString()}</h3>

      {walletBalance != null && (
        <Button
          onClick={() => initiate("wallet")}
          disabled={loading || !jobId || !hasEnoughWalletBalance}
          variant="outline"
          className="w-full justify-between bg-transparent"
        >
          <span className="flex items-center gap-2"><Wallet className="w-4 h-4" /> Pay from Wallet</span>
          <span className="text-xs text-muted-foreground">Balance: KES {walletBalance.toLocaleString()}</span>
        </Button>
      )}
      {walletBalance != null && !hasEnoughWalletBalance && (
        <p className="text-xs text-muted-foreground -mt-2">Insufficient wallet balance — top up or choose another method below.</p>
      )}

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Mobile number (for M-Pesa / Airtel)</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX or 2547XXXXXXXX" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => initiate("mpesa")} disabled={loading || !jobId} className="bg-yellow-400 text-black hover:bg-yellow-500">
          Pay with M-Pesa
        </Button>
        <Button onClick={() => initiate("airtel")} disabled={loading || !jobId} className="bg-red-500 hover:bg-red-600">
          Pay with Airtel Money
        </Button>
        <Button onClick={() => initiate("paypal")} disabled={loading || !jobId} className="bg-blue-600 hover:bg-blue-700">
          Pay with PayPal
        </Button>
        <Button onClick={() => initiate("card")} disabled={loading || !jobId}>
          Pay with Card
        </Button>
      </div>

      {!jobId && <p className="text-xs text-muted-foreground">Confirm your booking details above to enable payment.</p>}

      {state === "failed" && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="w-4 h-4" /> {message}
        </div>
      )}
      {state === "idle" && message && <p className="text-xs break-words bg-muted p-3 rounded">{message}</p>}
      {loading && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Starting payment…</p>}
    </Card>
  )
}

export default PaymentMethods
