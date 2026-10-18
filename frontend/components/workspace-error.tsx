"use client"

import Link from "next/link"
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react"

export function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <div className="mx-auto w-full max-w-xl p-5 sm:p-8"><div role="alert" className="rounded-2xl border border-border bg-card p-6 sm:p-8"><span className="inline-flex rounded-xl bg-orange-50 p-3 text-orange-600"><AlertTriangle size={24} /></span><h1 className="mt-5 text-2xl font-semibold tracking-tight">This page needs another try.</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">The page could not finish loading. Retry it, or open the help centre if the problem continues.</p>{error.digest && <p className="mt-3 break-all text-xs text-muted-foreground">Support reference: {error.digest}</p>}<div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={retry} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><RefreshCw size={16} />Retry page</button><Link href="/knowledge/support" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold">Get help <ArrowRight size={16} /></Link></div></div></div>
}
