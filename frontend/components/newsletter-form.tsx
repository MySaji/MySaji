"use client"

import { useId, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"

export function NewsletterForm() {
  const id = useId()
  const pending = useRef(false)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  if (success) return <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950"><CheckCircle2 className="mb-3 h-6 w-6" /><p className="font-semibold">You’re on the list.</p><p className="mt-1 text-sm leading-6">Look out for MySaji updates in your inbox. You can unsubscribe from any update.</p></div>
  return <form onSubmit={async event => {
    event.preventDefault()
    if (pending.current) return
    pending.current = true; setBusy(true); setError("")
    try {
      const response = await fetch("/api/subscribers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase() }) })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || "We couldn’t save your subscription. Please try again.")
      setSuccess(true)
      try { localStorage.setItem("saji_subscribed_email", email.trim().toLowerCase()); window.dispatchEvent(new Event("saji:subscribed")) } catch { /* Subscription is saved even if browser storage is blocked. */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please check your connection and try again.") }
    finally { pending.current = false; setBusy(false) }
  }} className="space-y-3">
    <label htmlFor={id} className="block text-sm font-semibold">Email address</label>
    <div className="flex flex-col gap-2 sm:flex-row"><input id={id} type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} placeholder="you@example.com" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-950 focus-visible:outline-2 focus-visible:outline-blue-600" /><button disabled={busy} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#0647b5] px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}{busy ? "Subscribing…" : "Keep me updated"}</button></div>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-700">{error}</p>}
    <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><input type="checkbox" required disabled={busy} className="mt-1 h-4 w-4 shrink-0 accent-blue-700" /><span>I’d like product updates and marketplace news by email. Unsubscribe anytime. Read our <Link href="/privacy" className="underline">privacy policy</Link>.</span></label>
  </form>
}
