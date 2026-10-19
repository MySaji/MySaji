"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Activity, ClipboardList, Loader2, RefreshCw, Search, Users } from "lucide-react"
import { getPosEmployeeAudit, type PosEmployeeAudit } from "@/backend/actions/pos-audit"

const initial = { days: 7 as 1 | 7 | 30 | 90, storeId: "", employeeId: "", action: "", search: "" }
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "No recorded activity"
const control = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"

export default function EmployeeAuditPage() {
  const [filters, setFilters] = useState(initial)
  const [data, setData] = useState<PosEmployeeAudit | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState("")
  const request = useRef(0)
  const load = useCallback(async (query: typeof initial, page = 1) => {
    const id = ++request.current
    setBusy(true); setError("")
    try {
      const result = await getPosEmployeeAudit({ ...query, storeId: query.storeId || undefined, employeeId: query.employeeId || undefined, action: query.action || undefined, page })
      if (id !== request.current) return
      if (result.success) setData(result.data)
      else { setData(null); setError(result.error) }
    } catch {
      if (id === request.current) { setData(null); setError("Activity could not be loaded. Please try again.") }
    } finally { if (id === request.current) setBusy(false) }
  }, [])
  const cancel = useCallback(() => { request.current++ }, [])
  useEffect(() => { void load(initial); return cancel }, [load, cancel])
  // Keep pagination attached to the filters that produced the displayed result.
  const [applied, setApplied] = useState(initial)
  function apply(query: typeof initial) { setApplied(query); void load(query) }

  return <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Owner workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Employee activity & audit log</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Review who changed what, follow your team’s work and compare recorded activity across your Till business.</p></div>
      <div className="flex gap-2">{data && <Link href="/pos/team" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium"><Users size={16} />Manage team</Link>}<button disabled={busy} onClick={() => void load(applied, data?.page ?? 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm disabled:opacity-50"><RefreshCw size={16} className={busy ? "animate-spin" : ""} />Refresh</button></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button onClick={() => { setFilters(initial); apply(initial) }} className="ml-3 min-h-11 font-semibold underline">Reset filters & retry</button></div>}
    {busy && !data && <div role="status" className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-background p-12"><Loader2 className="animate-spin" size={20} />Loading employee activity…</div>}
    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Team activity summary">
        {[{ label: "Recorded actions", value: data.totalActions, icon: ClipboardList }, { label: "Employees with activity", value: data.people.filter(p => p.actions > 0).length, icon: Activity }, { label: "Employee records", value: data.people.length, icon: Users }, { label: "Receipts issued by employees", value: data.people.reduce((sum, p) => sum + p.receipts, 0), icon: ClipboardList }].map(stat => <div key={stat.label} className="rounded-2xl border border-border bg-background p-5"><div className="flex items-center justify-between text-xs text-muted-foreground">{stat.label}<stat.icon size={17} className="text-primary" /></div><p className="mt-3 text-3xl font-semibold tabular-nums">{stat.value.toLocaleString()}</p></div>)}
      </section>
      <form onSubmit={event => { event.preventDefault(); apply(filters) }} className="grid gap-4 rounded-2xl border border-border bg-background p-4 sm:grid-cols-2 xl:grid-cols-6">
        <label className="space-y-2 text-xs font-medium">Period<select className={control} value={filters.days} onChange={e => setFilters({ ...filters, days: Number(e.target.value) as typeof filters.days })}>{[1, 7, 30, 90].map(days => <option key={days} value={days}>Last {days === 1 ? "24 hours" : `${days} days`}</option>)}</select></label>
        <label className="space-y-2 text-xs font-medium">Branch<select className={control} value={filters.storeId} onChange={e => setFilters({ ...filters, storeId: e.target.value })}><option value="">All branches</option>{data.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="space-y-2 text-xs font-medium">Employee (history)<select className={control} value={filters.employeeId} onChange={e => setFilters({ ...filters, employeeId: e.target.value })}><option value="">Everyone, owner & system</option>{data.people.map(p => <option key={p.id} value={p.id}>{p.name}{!p.enabled ? " (disabled)" : ""}</option>)}</select></label>
        <label className="space-y-2 text-xs font-medium">Action (history)<select className={control} value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })}><option value="">All recorded actions</option>{[...new Set([...data.actions, filters.action].filter(Boolean))].map(action => <option key={action} value={action}>{action}</option>)}</select></label>
        <label className="space-y-2 text-xs font-medium">Search history<input className={control} value={filters.search} maxLength={100} placeholder="Product, receipt, change…" onChange={e => setFilters({ ...filters, search: e.target.value })} /></label>
        <button disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Search size={16} />Apply filters</button>
      </form>
      <section className="overflow-hidden rounded-2xl border border-border bg-background" aria-labelledby="employee-ranking">
        <div className="border-b border-border p-5"><h2 id="employee-ranking" className="text-lg font-semibold">Team activity comparison</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">Ranked by recorded actions for the applied period and branch. Employee and action filters apply to history below. Action counts reflect different duties; they do not measure time online, attendance or work quality.</p><p className="mt-1 text-xs text-muted-foreground">{date(data.since)} – {date(data.until)} · East Africa Time</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{["Employee", "Actions", "Receipts", "Catalogue", "Stock / buying", "Shift events", "Review events", "Last action (EAT)"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.people.map((p, index) => <tr key={p.id}><td className="px-4 py-4"><button onClick={() => { const next = { ...applied, employeeId: p.id }; setFilters(next); apply(next) }} className="text-left font-semibold text-primary hover:underline">{index + 1}. {p.name}</button><p className="mt-1 text-[11px] text-muted-foreground">{p.role.replaceAll("_", " ")}{!p.enabled && " · access disabled"}</p><div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${data.people[0]?.actions ? p.actions / data.people[0].actions * 100 : 0}%` }} /></div></td>{[p.actions, p.receipts, p.catalogue, p.stock, p.shifts, p.review].map((count, i) => <td key={i} className="px-4 py-4 tabular-nums">{count.toLocaleString()}</td>)}<td className="px-4 py-4 text-xs text-muted-foreground">{date(p.lastActivity)}</td></tr>)}</tbody></table></div>
        {data.people.length === 0 && <p className="p-6 text-sm text-muted-foreground">No employees have been added. Add your team to start reviewing individual work.</p>}
        <p className="border-t border-border p-4 text-xs leading-6 text-muted-foreground">Owner actions: {data.ownerActions.toLocaleString()} · Unattributed / system / former staff actions: {data.unattributedActions.toLocaleString()}. These are excluded from employee rankings. Review events include recorded voids, refunds, deletions and access changes; they are not a finding of wrongdoing.</p>
      </section>
      <section aria-labelledby="audit-history" aria-busy={busy} className="rounded-2xl border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 id="audit-history" className="text-lg font-semibold">Audit history</h2><p className="mt-1 text-xs text-muted-foreground">{data.count.toLocaleString()} matching records · Read-only history · Times in EAT</p></div>{busy && <Loader2 aria-label="Updating activity" size={18} className="animate-spin" />}</div>
        <ol className="divide-y divide-border">{data.events.map(event => <li key={event.id} className="grid gap-3 p-5 md:grid-cols-[180px_minmax(0,1fr)]"><div><p className="text-xs text-muted-foreground">{date(event.at)}</p><p className="mt-2 text-sm font-semibold">{event.who}</p><p className="mt-1 text-xs text-muted-foreground">{event.store}</p></div><div className="min-w-0"><span className="inline-block rounded-md bg-muted px-2 py-1 font-mono text-[11px]">{event.action}</span><p className="mt-2 break-words text-sm leading-6">{event.summary}</p>{event.entityId && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Record reference</summary><p className="mt-2 break-all">{event.entityType} · {event.entityId}</p></details>}</div></li>)}</ol>
        {data.events.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No recorded actions match these filters.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs"><span>Page {data.page} of {Math.min(200, Math.max(1, Math.ceil(data.count / 50)))}{data.count > 10_000 && " · Narrow the filters to view records beyond the newest 10,000."}</span><div className="flex gap-2"><button disabled={busy || data.page <= 1} onClick={() => void load(applied, data.page - 1)} className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-40">Previous</button><button disabled={busy || data.page * 50 >= data.count || data.page >= 200} onClick={() => void load(applied, data.page + 1)} className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-40">Next</button></div></div>
      </section>
      <p className="text-xs leading-6 text-muted-foreground">This view uses server-recorded audit events, including existing historical events. Older actions that were never logged cannot be reconstructed. Offline work appears after it reaches the server. Receipt counts are issued receipt records, not net sales or revenue.</p>
    </>}
  </div>
}
