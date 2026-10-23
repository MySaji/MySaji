"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { ArrowUpCircle, Loader2, ShieldCheck } from "lucide-react"

export function AppUpdateGate({ release, children }: { release: string | null; children: ReactNode }) {
  const pathname = usePathname()
  const [available, setAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState("")
  const button = useRef<HTMLButtonElement>(null)
  const excluded = pathname === "/pos" || pathname.startsWith("/pos/")
  const blocked = available && !excluded

  useEffect(() => {
    if (!release || excluded) return
    let disposed = false
    let checking = false
    const controller = new AbortController()
    async function check() {
      if (checking || document.visibilityState === "hidden") return
      checking = true
      try {
        const response = await fetch(`/api/app-release?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) })
        if (!response.ok) return
        const data = await response.json()
        if (!disposed && typeof data.release === "string" && data.release && data.release !== release) setAvailable(true)
      } catch { /* An offline or failed check must never lock people out. */ }
      finally { checking = false }
    }
    void check()
    const timer = window.setInterval(() => void check(), 60_000)
    window.addEventListener("online", check)
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    return () => {
      disposed = true; controller.abort(); window.clearInterval(timer)
      window.removeEventListener("online", check); window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [release, excluded])

  useEffect(() => {
    if (!blocked) return
    button.current?.focus()
    const before = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = before }
  }, [blocked])

  async function update() {
    setUpdating(true); setError("")
    try {
      const response = await fetch(`/api/app-release?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) })
      if (!response.ok || !(await response.json()).release) throw new Error("Unavailable")
      // The marketplace worker is push-only: refreshing downloads the new app.
      // Keep sessions, notification subscriptions and locally stored data intact.
      window.location.reload()
    } catch {
      setUpdating(false)
      setError("We couldn’t download the update. Check your connection and try again.")
    }
  }

  return <>
    <div inert={blocked || undefined} aria-hidden={blocked || undefined}>{children}</div>
    {blocked && <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="app-update-title" aria-describedby="app-update-description" className="my-auto w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl" onKeyDown={event => { if (event.key === "Tab") { event.preventDefault(); button.current?.focus() } }}>
        <div className="h-1.5 bg-[#ff8500]" />
        <div className="p-6 sm:p-8">
          <p className="text-sm font-bold tracking-wide text-[#0647b5]">My<span className="text-[#e66b00]">Saji</span></p>
          <div className="mb-5 mt-7 flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-[#0647b5]"><ArrowUpCircle size={34} aria-hidden="true" /></div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#0647b5]">Update required</p>
          <h2 id="app-update-title" className="mt-2 text-2xl font-semibold tracking-tight">A fresh MySaji is ready</h2>
          <p id="app-update-description" className="mt-3 text-sm leading-6 text-slate-600">Update to the latest version before continuing. This keeps your app in step with the current MySaji service.</p>
          <div className="mt-5 flex gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><ShieldCheck className="mt-0.5 shrink-0 text-[#0647b5]" size={20} aria-hidden="true" /><p>No reinstall needed. Updating refreshes this screen. Any unsaved form entries may be lost.</p></div>
          {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>}
          <button ref={button} aria-disabled={updating} onClick={() => { if (!updating) void update() }} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0647b5] px-5 py-3 text-sm font-semibold text-white outline-offset-4 hover:bg-[#05388f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0647b5]">
            {updating ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" />Updating MySaji…</> : error ? "Try update again" : "Update & continue"}
          </button>
          <p role="status" aria-live="polite" className="mt-3 text-center text-xs leading-5 text-slate-500">{updating ? "Opening the latest version. Please wait." : "An internet connection is needed to update."}</p>
        </div>
      </section>
    </div>}
  </>
}
