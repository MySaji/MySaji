"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle2, XCircle, Landmark } from "lucide-react"
import { checkWalletTopupStatus, initiateBankTransferTopup, getBankTransferDetails } from "@/lib/actions/wallet"

type TopupState = "idle" | "bank-form" | "awaiting-provider" | "success" | "failed"

export function WalletTopupMethods({ amount, onSuccess, returnPath = "/customer/wallet" }: { amount: number; onSuccess: () => void; returnPath?: string }) {
  const [phone, setPhone] = useState("")
  const [bankReference, setBankReference] = useState("")
  const [bankDetails, setBankDetails] = useState<{ bankName: string; accountName: string; accountNumber: string } | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [state, setState] = useState<TopupState>("idle")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const startPolling = (paymentId: string) => {
    setState("awaiting-provider")
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const status = await checkWalletTopupStatus(paymentId)
      if (!status) return
      if (status.status === "COMPLETED") {
        if (pollRef.current) clearInterval(pollRef.current)
        setState("success")
        onSuccess()
      } else if (status.status === "FAILED") {
        if (pollRef.current) clearInterval(pollRef.current)
        setState("failed")
        setMessage(status.failureReason || "Payment failed or was cancelled.")
      }
    }, 3000)
  }

  const initiate = async (provider: "mpesa" | "paypal" | "card") => {
    setMessage(null)
    setLoading(true)
    try {
      const body: Record<string, unknown> = { context: "wallet-topup", provider, amount, returnPath }
      if (provider === "mpesa") body.phone = phone

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
        window.location.href = data.checkoutUrl
        return
      }

      if (data.simulated) {
        setState("success")
        setMessage(data.message ?? null)
        onSuccess()
        setLoading(false)
        return
      }

      if (data.pending && data.paymentId) {
        setMessage(data.message ?? "Waiting for confirmation...")
        startPolling(data.paymentId)
        setLoading(false)
        return
      }

      setMessage(data.message ?? "Unexpected response — please try again.")
      setLoading(false)
    } catch (err: any) {
      setMessage(err?.message ?? "Error initiating payment")
      setLoading(false)
    }
  }

  const openBankForm = async () => {
    setMessage(null)
    setState("bank-form")
    if (bankDetails === undefined) setBankDetails(await getBankTransferDetails())
  }

  const submitBankTransfer = async () => {
    setLoading(true)
    setMessage(null)
    const result = await initiateBankTransferTopup({ amount, reference: bankReference })
    setLoading(false)
    if (!result.success) {
      setMessage(result.error)
      return
    }
    if (!result.configured) {
      setMessage(result.message)
      return
    }
    setState("success")
    setMessage("Thanks — we'll confirm your transfer and credit your wallet once it's verified against our bank statement (usually within 24 hours).")
  }

  if (state === "success") {
    return (
      <Card className="p-6 text-center space-y-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-900/40">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">
          {message?.startsWith("Thanks") ? "Transfer submitted" : "Payment successful"}
        </p>
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
        <Button variant="outline" size="sm" onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setState("idle"); setMessage(null) }}>
          Cancel & choose another method
        </Button>
      </Card>
    )
  }

  if (state === "bank-form") {
    return (
      <Card className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Bank Transfer — KES {amount.toLocaleString()}</h3>
        {bankDetails === undefined ? (
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        ) : bankDetails === null ? (
          <p className="text-sm text-muted-foreground">Bank transfer deposits aren&apos;t set up yet — please use M-Pesa, Card, or PayPal for now.</p>
        ) : (
          <>
            <div className="rounded-xl bg-muted/40 p-4 text-sm space-y-1">
              <p><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-foreground">{bankDetails.bankName}</span></p>
              <p><span className="text-muted-foreground">Account name:</span> <span className="font-medium text-foreground">{bankDetails.accountName}</span></p>
              <p><span className="text-muted-foreground">Account number:</span> <span className="font-medium text-foreground">{bankDetails.accountNumber}</span></p>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Transfer reference / receipt number</label>
              <Input value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder="e.g. FT23A1B2C3" />
            </div>
            <Button onClick={submitBankTransfer} disabled={loading || bankReference.trim().length < 3} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "I've made the transfer"}
            </Button>
          </>
        )}
        {message && <p className="text-xs break-words bg-muted p-3 rounded">{message}</p>}
        <Button variant="outline" size="sm" onClick={() => { setState("idle"); setMessage(null) }} className="w-full bg-transparent">
          Choose another method
        </Button>
      </Card>
    )
  }

  return (
    <Card className="p-6 space-y-4">
      <h3 className="text-lg font-semibold">Add KES {amount.toLocaleString()}</h3>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Mobile number (for M-Pesa)</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2547XXXXXXXX" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => initiate("mpesa")} disabled={loading || phone.trim().length < 9} className="bg-yellow-400 text-black hover:bg-yellow-500">
          M-Pesa STK Push
        </Button>
        <Button onClick={() => initiate("paypal")} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          PayPal
        </Button>
        <Button onClick={() => initiate("card")} disabled={loading}>
          Card (Stripe)
        </Button>
        <Button onClick={openBankForm} disabled={loading} variant="outline" className="gap-1.5 bg-transparent">
          <Landmark className="w-4 h-4" /> Bank Transfer
        </Button>
      </div>

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

export default WalletTopupMethods
