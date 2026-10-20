"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, RefreshCw, Search, Smartphone } from "lucide-react"
import { getMpesaInbox, connectMpesaNotifications } from "@/backend/actions/pos-mpesa-inbox"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"

type Inbox = NonNullable<Awaited<ReturnType<typeof getMpesaInbox>>>
export type ReceivedMpesa = Inbox["rows"][number]

export function MpesaInbox({ amount, onSelect }: { amount?: number; onSelect?: (row: ReceivedMpesa) => void }) {
  const [data, setData] = useState<Inbox | null>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("available")
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    try {
      const result = await getMpesaInbox({ query: query.trim() || undefined, availableOnly: !!onSelect || filter === "available" })
      setData(result); setError(result ? "" : "Payment inbox is not available for this account.")
    } catch { setError("Could not refresh payments. Check your connection and retry.") }
    finally { setLoading(false) }
  }, [query, filter, onSelect])
  useEffect(() => { const timer = setTimeout(() => void load(), 250); const poll = setInterval(() => void load(), 5000); return () => { clearTimeout(timer); clearInterval(poll) } }, [load])
  const connect = async () => {
    setConnecting(true); setError("")
    try { const result = await connectMpesaNotifications(); if (!result.success) setError(result.error); else await load() }
    catch { setError("Could not connect payment notifications.") }
    finally { setConnecting(false) }
  }
  const rows = (data?.rows ?? []).filter(row => filter !== "used" || !!row.consumedSaleId)
  return <section className="min-w-0 space-y-4" aria-label="M-Pesa payments inbox">
    {data && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4"><div><p className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4 text-primary" />{data.shortcode ? `Paybill / Till ${data.shortcode}` : "No Paybill configured"}<span className={`rounded-full px-2 py-1 text-[9px] ${data.environment === "sandbox" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{data.environment === "sandbox" ? "TEST PAYMENTS" : "LIVE"}</span></p><p className="mt-2 text-[11px] text-muted-foreground">Direct notifications: {data.connected ? "Connected" : "Not connected"}. Refreshes every 5 seconds.</p></div>{data.canConfigure && !onSelect && <div className="flex gap-3"><Link href="/pos/mpesa" className="py-2 text-xs text-primary">Merchant settings</Link><button disabled={connecting} onClick={() => void connect()} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{connecting ? "Connecting..." : data.connected ? "Reconnect notifications" : "Connect Paybill notifications"}</button></div>}</div>}
    {!onSelect && <p className="text-xs leading-relaxed text-muted-foreground">Received payments are separate from sales until a cashier confirms them at checkout. Connecting notifications requires the merchant's Daraja C2B access and a public HTTPS site. STK prompts appear here too. Only the latest 100 matching transactions are shown.</p>}
    <div className="flex flex-wrap gap-2"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Search received M-Pesa payments" placeholder="Receipt code, phone, payer or account" maxLength={80} value={query} onChange={event => setQuery(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs" /></label>{!onSelect && <select aria-label="Payment inbox filter" value={filter} onChange={event => setFilter(event.target.value)} className="rounded-xl border border-border bg-background px-3 text-xs"><option value="available">Available payments</option><option value="all">All transactions</option><option value="used">Matched to sales</option></select>}<button aria-label="Refresh received payments" onClick={() => void load()} className="rounded-xl border border-border p-3"><RefreshCw className="h-4 w-4" /></button></div>
    {onSelect && <p className="rounded-xl bg-primary/10 p-3 text-xs font-semibold text-primary">Confirm the payer and account, then select an unused payment for exactly KSh {amount?.toLocaleString("en-KE", { minimumFractionDigits: 2 })}.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30">{error}</p>}
    {loading ? <Loader2 aria-label="Loading received payments" className="mx-auto my-10 h-6 w-6 animate-spin" /> : rows.length ? <div className="space-y-2">{rows.map(row => <article key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4"><span className="rounded-xl bg-primary/10 p-3 text-primary"><Smartphone className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="break-all text-xs font-semibold">{row.receipt ?? "Prompt awaiting confirmation"}</p><p className="mt-1 text-[11px] text-muted-foreground">{row.payerName || row.phone || "Payer not supplied"}{row.payerName && row.phone ? ` / ${row.phone}` : ""}</p><p className="mt-1 break-words text-[10px] text-muted-foreground">{row.source} / {row.accountReference || "No account reference"} / {new Date(row.confirmedAt ?? row.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>{row.resultDescription && <p className="mt-1 text-[10px] text-muted-foreground">{row.resultDescription}</p>}</div><div className="text-right"><p className="text-sm font-semibold tabular-nums">KSh {row.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</p><p className={`mt-1 text-[10px] ${row.consumedSaleId ? "text-muted-foreground" : row.status === "PAID" ? "text-emerald-600" : "text-amber-600"}`}>{row.consumedSaleId ? "Matched to sale" : row.status === "PAID" ? "Received / available" : row.status}</p></div>{onSelect && <button disabled={row.status !== "PAID" || !!row.consumedSaleId || row.amount !== amount} onClick={() => onSelect(row)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"><CheckCircle2 className="h-4 w-4" />{row.amount === amount ? "Confirm payment" : "Amount differs"}</button>}</article>)}</div> : <div className="rounded-2xl border border-dashed border-border p-10 text-center text-xs leading-relaxed text-muted-foreground">No payments match this view. Ask the customer for their receipt code and refresh. A payment sent before notifications were connected may need to be reconciled using the merchant statement.</div>}
  </section>
}

export function MpesaPaymentPicker({ amount, onSelect }: { amount: number; onSelect: (row: ReceivedMpesa) => void }) {
  const [open, setOpen] = useState(false)
  return <><button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Find & confirm received payment</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-2xl sm:max-w-2xl"><DialogTitle>Confirm received M-Pesa payment</DialogTitle><DialogDescription>Match the customer to a payment received by this store.</DialogDescription><MpesaInbox amount={amount} onSelect={row => { onSelect(row); setOpen(false) }} /></DialogContent></Dialog></>
}
