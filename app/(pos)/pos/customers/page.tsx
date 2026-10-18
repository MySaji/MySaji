"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Check, Download, History, Loader2, Mail, Pencil, Phone, Plus, RefreshCw, Search, Star, UserRound, Users, Wallet, Repeat2, Ban } from "lucide-react"
import { WorkspaceHero, PosCard } from "@/frontend/components/pos/workspace-ui"
import { RowActions } from "@/frontend/components/pos/row-actions"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/frontend/components/ui/alert-dialog"
import { getPosWhoAmI } from "@/backend/actions/pos-access"
import { getCustomers, saveCustomer, setCustomerActive, getCustomerHistory, adjustPoints, getLoyaltySettings, type CustomerRow, type LoyaltySettings, type LoyaltyEntryRow } from "@/backend/actions/pos-customers"
import { customerDirectory, type CustomerSegment, type CustomerSort } from "@/backend/domain/pos-customer-directory"
import { downloadCsv } from "@/frontend/lib/pos-export"

const money = (n: number) => `KSh ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "No visits yet"
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase()
const EMPTY_FORM = { name: "", phone: "", email: "" }
const SEGMENTS: { key: CustomerSegment; label: string }[] = [{ key: "all", label: "All customers" }, { key: "active", label: "Active members" }, { key: "returning", label: "Returning" }, { key: "away", label: "Away 30+ days" }, { key: "inactive", label: "Inactive" }]
const KINDS: Record<string, string> = { EARN: "Points earned", REDEEM: "Points redeemed", REVERSAL: "Reversal", ADJUSTMENT: "Manual adjustment" }

export default function TillCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [settings, setSettings] = useState<LoyaltySettings | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const [query, setQuery] = useState("")
  const [segment, setSegment] = useState<CustomerSegment>("all")
  const [sort, setSort] = useState<CustomerSort>("recent")
  const [selected, setSelected] = useState<string[]>([])
  const [form, setForm] = useState<(typeof EMPTY_FORM & { id?: string }) | null>(null)
  const [sheet, setSheet] = useState<{ customer: CustomerRow; entries: LoyaltyEntryRow[] } | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [adjust, setAdjust] = useState({ points: "", reason: "" })
  const [membership, setMembership] = useState<CustomerRow | null>(null)
  const request = useRef(0)
  const profileRequest = useRef(0)
  const canEdit = permissions.includes("till.sell")
  const canManage = permissions.includes("staff.manage")

  const fetchList = useCallback(async (offset = 0) => {
    const token = ++request.current
    setFetching(true)
    try {
      const list = await getCustomers({ query: query.trim() || undefined, limit: 100, offset })
      if (token !== request.current) return
      setRows(current => offset ? [...current, ...list.filter(row => !current.some(existing => existing.id === row.id))] : list)
      setHasMore(list.length === 100)
      if (!offset) setSelected([])
    } catch { if (token === request.current) setError("Could not load customers. Check your connection and refresh.") }
    finally { if (token === request.current) { setFetching(false); setLoading(false) } }
  }, [query])
  const refreshContext = async () => {
    try {
      const [loyalty, actor] = await Promise.all([getLoyaltySettings({}), getPosWhoAmI()])
      setSettings(loyalty); setPermissions(actor?.permissions ?? [])
    } catch { setError("Could not load loyalty settings and permissions. Refresh to retry.") }
  }
  const invalidateList = useCallback(() => { request.current++ }, [])
  useEffect(() => {
    const timer = setTimeout(() => { setError(""); void fetchList() }, 250)
    return () => { clearTimeout(timer); invalidateList() }
  }, [fetchList, invalidateList])
  useEffect(() => {
    let active = true
    Promise.all([getLoyaltySettings({}), getPosWhoAmI()]).then(([loyalty, actor]) => { if (active) { setSettings(loyalty); setPermissions(actor?.permissions ?? []) } }).catch(() => { if (active) setError("Could not load loyalty settings and permissions. Refresh to retry.") })
    return () => { active = false }
  }, [])

  const visible = useMemo(() => customerDirectory(rows, segment, sort), [rows, segment, sort])
  const chosen = visible.filter(row => selected.includes(row.id))
  const totals = useMemo(() => ({ active: rows.filter(row => row.isActive).length, returning: rows.filter(row => row.isActive && row.visits >= 2).length, points: rows.reduce((sum, row) => sum + row.pointsValue, 0), spent: rows.reduce((sum, row) => sum + row.totalSpent, 0) }), [rows])
  const leaders = useMemo(() => customerDirectory(rows, "all", "spent").filter(row => row.totalSpent > 0).slice(0, 4), [rows])
  const exportCustomers = (list: CustomerRow[], filename = "till-customers.csv") => downloadCsv(filename, [["Name", "Phone", "Email", "Membership", "Visits", "Spent (KSh)", "Points", "Points value (KSh)", "Last visit", "Joined"], ...list.map(row => [row.name, row.phone, row.email, row.isActive ? "Active" : "Inactive", row.visits, row.totalSpent, row.pointsBalance, row.pointsValue, row.lastSeenAt, row.joinedAt])])
  const editCustomer = (customer: CustomerRow) => { setError(""); setForm({ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email ?? "" }) }
  const openProfile = async (id: string) => {
    const token = ++profileRequest.current
    setProfileId(id); setSheet(null); setProfileLoading(true); setError(""); setSaved(""); setAdjust({ points: "", reason: "" })
    try {
      const result = await getCustomerHistory({ customerId: id })
      if (token !== profileRequest.current) return
      if (!result) { setError("That customer could not be opened."); return }
      setSheet(result)
    } catch { if (token === profileRequest.current) setError("Could not open the customer profile. Please retry.") }
    finally { if (token === profileRequest.current) setProfileLoading(false) }
  }
  const closeProfile = () => { profileRequest.current++; setProfileId(null); setSheet(null); setError("") }
  const submit = async () => {
    if (!form || busy) return
    setBusy(true); setError(""); setSaved("")
    try {
      const result = await saveCustomer({ ...(form.id ? { customerId: form.id } : {}), name: form.name.trim(), phone: form.phone, email: form.email.trim() })
      if (!result.success) { setError(result.error); return }
      setForm(null); setSaved(form.id ? "Customer details updated." : "Customer added.")
      await fetchList()
      if (profileId === result.customerId) await openProfile(result.customerId)
    } catch { setError("Could not save the customer. Check your connection and retry.") }
    finally { setBusy(false) }
  }
  const applyAdjustment = async () => {
    if (!sheet || busy) return
    setBusy(true); setError(""); setSaved("")
    try {
      const result = await adjustPoints({ customerId: sheet.customer.id, points: Number(adjust.points), reason: adjust.reason.trim() })
      if (!result.success) { setError(result.error); return }
      await fetchList(); await openProfile(sheet.customer.id); setSaved("Points adjusted and recorded in the statement.")
    } catch { setError("Could not confirm the adjustment. Reload the statement before retrying.") }
    finally { setBusy(false) }
  }
  const changeMembership = async () => {
    if (!membership || busy) return
    setBusy(true); setError("")
    try {
      const result = await setCustomerActive({ customerId: membership.id, isActive: !membership.isActive })
      if (!result.success) { setError(result.error); return }
      setMembership(null)
      await fetchList()
      if (profileId === membership.id) await openProfile(membership.id)
      setSaved(membership.isActive ? "Membership deactivated. History and points are retained." : "Membership reactivated.")
    } catch { setError("Could not update membership. Please retry.") }
    finally { setBusy(false) }
  }
  const actions = (customer: CustomerRow) => <RowActions name={customer.name}><button onClick={() => void openProfile(customer.id)}><UserRound className="h-4 w-4" />View profile & statement</button>{canEdit && <button onClick={() => editCustomer(customer)}><Pencil className="h-4 w-4" />Edit details</button>}<button onClick={() => exportCustomers([customer])}><Download className="h-4 w-4" />Export customer</button>{canManage && <button onClick={() => { setError(""); setMembership(customer) }}><Ban className="h-4 w-4" />{customer.isActive ? "Deactivate membership" : "Reactivate membership"}</button>}</RowActions>

  return <div className="w-full min-w-0 space-y-5 p-4 pb-12 md:p-6 xl:p-8">
    <WorkspaceHero title="Customers" description="Know your regulars. Keep contact details, visits and loyalty balances together in one place."><div className="flex gap-2"><Button variant="secondary" disabled={fetching} onClick={() => { setError(""); void fetchList(); void refreshContext() }} className="rounded-xl"><RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} /><span className="sr-only sm:not-sr-only">Refresh</span></Button>{canEdit && <Button onClick={() => { setError(""); setForm(EMPTY_FORM) }} className="rounded-xl"><Plus className="h-4 w-4" />Add customer</Button>}</div></WorkspaceHero>
    {error && !form && !profileId && !membership && <Notice error>{error}</Notice>}{saved && !profileId && !form && !membership && <Notice>{saved}</Notice>}
    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><p>Summary of {rows.length} loaded customers{query.trim() ? " matching your search" : ""}. Load more to expand these figures.</p><Link href="/pos/home" className="shrink-0 text-primary">Overview</Link></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[{ label: "Active members", value: totals.active.toLocaleString(), sub: "Memberships available at checkout", icon: Users }, { label: "Returning customers", value: totals.returning.toLocaleString(), sub: "Active members with 2 or more visits", icon: Repeat2 }, { label: "Recorded spending", value: money(totals.spent), sub: "Lifetime spending of loaded customers", icon: Wallet }, { label: "Points value", value: money(totals.points), sub: "Outstanding value of loaded balances", icon: Star }].map(stat => <PosCard key={stat.label} className="p-4 md:p-5"><div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground">{stat.label}</p><stat.icon className="h-4 w-4 text-primary" /></div><p className="mt-3 break-words text-xl font-semibold tracking-tight tabular-nums md:text-2xl">{loading ? "..." : stat.value}</p><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{stat.sub}</p></PosCard>)}</div>
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_280px]">
      <PosCard className="min-w-0 overflow-hidden">
        <div className="space-y-4 border-b border-border p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Customer directory</h2><p className="mt-1 text-[11px] text-muted-foreground">Find a customer, review their account or update their details.</p></div><button disabled={!visible.length || fetching} onClick={() => exportCustomers(chosen.length ? chosen : visible)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs disabled:opacity-40"><Download className="h-3.5 w-3.5" />Export {chosen.length ? `${chosen.length} selected` : "view"}</button></div>
          <div className="flex flex-col gap-3 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search customers" placeholder="Search name, phone or email" maxLength={60} value={query} onChange={event => setQuery(event.target.value)} className="h-10 rounded-xl pl-9" /></div><select aria-label="Sort customers" value={sort} onChange={event => setSort(event.target.value as CustomerSort)} className="h-10 rounded-xl border border-border bg-background px-3 text-xs"><option value="recent">Most recent visit</option><option value="name">Name A-Z</option><option value="spent">Highest spending</option><option value="points">Highest points</option><option value="visits">Most visits</option></select></div>
          <div className="flex flex-wrap gap-1.5">{SEGMENTS.map(item => <button key={item.key} aria-pressed={segment === item.key} onClick={() => { setSegment(item.key); setSelected([]) }} className={`rounded-lg px-3 py-2 text-[11px] font-medium ${segment === item.key ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>{item.label}<span className="ml-2 opacity-70">{customerDirectory(rows, item.key, "name").length}</span></button>)}</div>
        </div>
        {loading ? <div role="status" className="flex justify-center gap-2 p-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading customers</div> : visible.length === 0 ? <div className="p-12 text-center"><Users className="mx-auto h-10 w-10 text-muted-foreground/40" /><h3 className="mt-4 text-sm font-semibold">{rows.length || query ? "No matching customers" : "Your customer relationships start here"}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{rows.length || query ? "Try another search or customer group." : "Add a name and phone number to recognise regulars at the counter."}</p>{(query || segment !== "all") && <button onClick={() => { setQuery(""); setSegment("all") }} className="mt-4 text-xs font-medium text-primary">Clear filters</button>}</div> : <div className="overflow-x-auto" aria-busy={fetching}><div className="divide-y divide-border md:hidden">{visible.map(customer => <article key={customer.id} className="space-y-3 p-4"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary">{initials(customer.name)}</span><div className="min-w-0 flex-1"><button onClick={() => void openProfile(customer.id)} className="text-left text-sm font-semibold">{customer.name}</button><p className="mt-1 text-[11px] text-muted-foreground">{customer.phone}</p><p className="mt-1 text-[10px] text-muted-foreground">{customer.isActive ? "Active member" : "Inactive member"}</p></div>{actions(customer)}</div><div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-[10px]"><div className="min-w-0"><p className="text-muted-foreground">Lifetime spend</p><p className="mt-1 break-words font-semibold">{money(customer.totalSpent)}</p></div><div><p className="text-muted-foreground">Visits</p><p className="mt-1 font-semibold">{customer.visits}</p></div><div><p className="text-muted-foreground">Loyalty</p><p className="mt-1 font-semibold">{customer.pointsBalance.toLocaleString()} pts</p></div></div><p className="text-[10px] text-muted-foreground">Last visit: {date(customer.lastSeenAt)}</p></article>)}</div><table className="hidden w-full min-w-[800px] text-left text-xs md:table"><thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="p-4"><input aria-label="Select all visible customers" type="checkbox" checked={chosen.length === visible.length} onChange={event => setSelected(event.target.checked ? visible.map(row => row.id) : [])} /></th>{["Customer", "Membership", "Visits / last seen", "Lifetime spend", "Loyalty", ""].map((title, i) => <th key={i} className="px-3 py-4 font-medium">{title}</th>)}</tr></thead><tbody className="divide-y divide-border">{visible.map(customer => <tr key={customer.id} className="hover:bg-muted/25"><td className="p-4"><input aria-label={`Select ${customer.name}`} type="checkbox" checked={selected.includes(customer.id)} onChange={event => setSelected(current => event.target.checked ? [...current, customer.id] : current.filter(id => id !== customer.id))} /></td><td className="px-3 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary">{initials(customer.name)}</span><div><button onClick={() => void openProfile(customer.id)} className="text-left font-semibold hover:text-primary">{customer.name}</button><p className="mt-1 text-[10px] text-muted-foreground">{customer.phone}</p>{customer.email && <p className="mt-1 max-w-48 truncate text-[10px] text-muted-foreground">{customer.email}</p>}</div></div></td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${customer.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{customer.isActive ? "Active" : "Inactive"}</span></td><td className="px-3 py-4"><p className="font-medium">{customer.visits} visits</p><p className="mt-1 text-[10px] text-muted-foreground">{date(customer.lastSeenAt)}</p></td><td className="px-3 py-4 font-semibold tabular-nums">{money(customer.totalSpent)}</td><td className="px-3 py-4"><p className="font-semibold tabular-nums">{customer.pointsBalance.toLocaleString()} pts</p><p className="mt-1 text-[10px] text-muted-foreground">{money(customer.pointsValue)}</p></td><td className="px-3 py-4">{actions(customer)}</td></tr>)}</tbody></table></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-[11px] text-muted-foreground"><p>{visible.length} shown / {rows.length} loaded{chosen.length > 0 && ` / ${chosen.length} selected`}{fetching && " / Updating..."}</p>{hasMore && <button disabled={fetching} onClick={() => void fetchList(rows.length)} className="font-semibold text-primary disabled:opacity-40">{fetching ? "Loading..." : "Load more customers"}</button>}</div>
      </PosCard>
      <aside className="grid gap-4 md:grid-cols-2 2xl:grid-cols-1"><PosCard className="p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Loyalty programme</h2><Star className="h-4 w-4 text-primary" /></div><span className={`mt-4 inline-block rounded-full px-2 py-1 text-[10px] font-semibold ${settings?.enabled ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "bg-muted text-muted-foreground"}`}>{settings ? settings.enabled ? "Programme active" : "Programme off" : "Settings unavailable"}</span><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{settings?.enabled ? `Earn ${settings.pointsPerHundred} point${settings.pointsPerHundred === 1 ? "" : "s"} per KSh 100. Each point is worth ${money(settings.shillingsPerPoint)}.` : "Customer records stay available when loyalty points are switched off."}</p>{settings?.enabled && <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">Minimum redemption: {settings.minRedeem.toLocaleString()} points</p>}{permissions.includes("settings.store") && <Link href="/pos/settings#rules" className="mt-4 inline-block text-xs font-semibold text-primary">Manage loyalty settings</Link>}</PosCard><PosCard className="p-5"><h2 className="text-sm font-semibold">Top regulars</h2><p className="mt-1 text-[10px] text-muted-foreground">By lifetime spending, from loaded customers</p><div className="mt-4 space-y-4">{leaders.length ? leaders.map((customer, index) => <button key={customer.id} onClick={() => void openProfile(customer.id)} className="flex w-full items-center gap-3 text-left"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{customer.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{customer.visits} visits</span></span><span className="text-[11px] font-medium">{money(customer.totalSpent)}</span></button>) : <p className="py-5 text-xs text-muted-foreground">Regulars appear after their first recorded purchases.</p>}</div></PosCard></aside>
    </div>
    <Dialog open={!!form} onOpenChange={open => { if (!open && !busy) { setForm(null); setError("") } }}><DialogContent className="rounded-2xl"><DialogTitle>{form?.id ? "Edit customer" : "Add customer"}</DialogTitle><DialogDescription>A name and Kenyan phone number are all you need. Email is optional.</DialogDescription>{form && <form onSubmit={event => { event.preventDefault(); void submit() }} className="space-y-4"><label className="block text-xs font-medium">Full name<Input aria-label="Customer name" autoComplete="name" required minLength={2} maxLength={80} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-2 h-11 rounded-xl" /></label><label className="block text-xs font-medium">Phone number<Input aria-label="Customer phone" type="tel" autoComplete="tel" required placeholder="0712 345 678" maxLength={16} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className="mt-2 h-11 rounded-xl" /></label><label className="block text-xs font-medium">Email (optional)<Input aria-label="Customer email" type="email" autoComplete="email" maxLength={120} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="mt-2 h-11 rounded-xl" /></label>{error && <Notice error>{error}</Notice>}<Button disabled={busy || !canEdit} type="submit" className="h-11 w-full rounded-xl">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : form.id ? "Save customer" : "Add customer"}</Button></form>}</DialogContent></Dialog>
    <Dialog open={!!profileId} onOpenChange={open => { if (!open && !busy) closeProfile() }}><DialogContent className="rounded-2xl sm:max-w-2xl"><DialogTitle>{sheet?.customer.name ?? "Customer profile"}</DialogTitle><DialogDescription>Contact details, shopping activity and loyalty statement.</DialogDescription>{saved && <Notice>{saved}</Notice>}{profileLoading ? <Loader2 aria-label="Loading profile" className="mx-auto my-12 h-6 w-6 animate-spin" /> : sheet && <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-4"><div><p className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5" />{sheet.customer.phone}</p>{sheet.customer.email && <p className="mt-2 flex items-center gap-2 break-all text-xs"><Mail className="h-3.5 w-3.5 shrink-0" />{sheet.customer.email}</p>}<p className="mt-3 text-[10px] text-muted-foreground">Joined {date(sheet.customer.joinedAt)} / {sheet.customer.isActive ? "Active member" : "Inactive member"}</p></div>{canEdit && <Button variant="outline" size="sm" onClick={() => { const customer = sheet.customer; closeProfile(); editCustomer(customer) }}><Pencil className="h-3.5 w-3.5" />Edit details</Button>}</div><div className="grid grid-cols-3 gap-2">{[{ label: "Points balance", value: sheet.customer.pointsBalance.toLocaleString(), sub: money(sheet.customer.pointsValue) }, { label: "Lifetime spent", value: money(sheet.customer.totalSpent), sub: "Recorded purchases" }, { label: "Visits", value: String(sheet.customer.visits), sub: date(sheet.customer.lastSeenAt) }].map(stat => <div key={stat.label} className="min-w-0 rounded-xl border border-border p-3"><p className="text-[10px] text-muted-foreground">{stat.label}</p><p className="mt-2 break-words text-sm font-semibold tabular-nums">{stat.value}</p><p className="mt-1 text-[9px] text-muted-foreground">{stat.sub}</p></div>)}</div><div><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" />Loyalty statement</h3><button disabled={!sheet.entries.length} className="text-xs text-primary disabled:opacity-40" onClick={() => downloadCsv("till-customer-statement.csv", [["Date", "Activity", "Points", "Balance after", "Reason", "Sale reference"], ...sheet.entries.map(entry => [entry.occurredAt, entry.kind, entry.points, entry.balanceAfter, entry.reason, entry.saleId])])}>Export statement</button></div><p className="mt-1 text-[10px] text-muted-foreground">Latest 100 entries. Each adjustment includes its recorded reason.</p><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{sheet.entries.length ? sheet.entries.map(entry => <div key={entry.id} className="flex items-start gap-3 rounded-xl border border-border p-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${entry.points > 0 ? "bg-emerald-500" : "bg-amber-500"}`} /><div className="min-w-0 flex-1"><p className="text-xs font-medium">{KINDS[entry.kind] ?? entry.kind}</p><p className="mt-1 break-words text-[10px] text-muted-foreground">{entry.reason || "Recorded at checkout"}</p><p className="mt-1 text-[9px] text-muted-foreground">{new Date(entry.occurredAt).toLocaleString("en-KE")}</p></div><div className="text-right tabular-nums"><p className={`text-xs font-semibold ${entry.points > 0 ? "text-emerald-600" : "text-foreground"}`}>{entry.points > 0 ? "+" : ""}{entry.points} pts</p><p className="mt-1 text-[9px] text-muted-foreground">Balance {entry.balanceAfter}</p></div></div>) : <p className="rounded-xl bg-muted/30 p-6 text-center text-xs text-muted-foreground">No loyalty transactions yet.</p>}</div></div>{canManage && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-xs font-semibold">Adjust loyalty points</summary><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Use a positive or negative whole number and record a reason. The change stays in the statement.</p><div className="mt-3 grid grid-cols-[90px_minmax(0,1fr)] gap-2"><Input aria-label="Points adjustment" placeholder="50 or -50" inputMode="numeric" value={adjust.points} onChange={event => setAdjust({ ...adjust, points: event.target.value })} /><Input aria-label="Adjustment reason" maxLength={200} placeholder="Reason for adjustment" value={adjust.reason} onChange={event => setAdjust({ ...adjust, reason: event.target.value })} /></div><Button onClick={() => void applyAdjustment()} disabled={busy || !Number.isInteger(Number(adjust.points)) || Number(adjust.points) === 0 || adjust.reason.trim().length < 3} className="mt-3 h-10 w-full rounded-xl">{busy ? "Applying..." : "Apply adjustment"}</Button></details>}{canManage && <button className="text-xs font-medium text-muted-foreground" onClick={() => { setError(""); setMembership(sheet.customer) }}>{sheet.customer.isActive ? "Deactivate membership" : "Reactivate membership"}</button>}</div>}{error && <Notice error>{error}</Notice>}</DialogContent></Dialog>
    <AlertDialog open={!!membership} onOpenChange={open => { if (!open && !busy) { setMembership(null); setError("") } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{membership?.isActive ? "Deactivate" : "Reactivate"} {membership?.name}?</AlertDialogTitle><AlertDialogDescription>{membership?.isActive ? "This member will no longer be available for loyalty checkout. Their points, contact details and history will be retained." : "This customer will be available for loyalty checkout again with their existing points balance."}</AlertDialogDescription></AlertDialogHeader>{error && <Notice error>{error}</Notice>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button disabled={busy || !canManage} onClick={() => void changeMembership()}>{busy ? "Saving..." : "Confirm membership change"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}

function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  const Icon = error ? AlertTriangle : Check
  return <div role={error ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${error ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span></div>
}
