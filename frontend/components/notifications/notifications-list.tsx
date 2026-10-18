"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell, CheckCheck, RefreshCw, Trash2, Search, ArrowUpRight } from "lucide-react"
import { DeviceNotificationsCard } from "@/frontend/components/notifications/device-notifications"
import { useNotificationBell } from "@/frontend/lib/hooks/useNotificationBell"
import { formatRelativeTime } from "@/backend/domain/format"

export function NotificationsList({ detailBasePath }: { detailBasePath: string }) {
  const { notifications, unreadCount, isLoading, error, actionError, refreshNotifications, markAllRead, markRead, remove } = useNotificationBell(200)
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const visible = notifications.filter(item => (filter === "all" || (filter === "unread" ? !item.isRead : item.type === filter)) && `${item.title} ${item.message}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold tracking-widest text-orange-600">YOUR UPDATES</p><h1 className="text-3xl font-semibold">Notification center</h1><p className="mt-2 text-sm text-muted-foreground">{unreadCount} unread updates. Messages and calls have their own inbox.</p></div><div className="flex flex-wrap gap-2"><button disabled={busy || !unreadCount} onClick={async () => { setBusy(true); try { await markAllRead() } finally { setBusy(false) } }} className="flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm disabled:opacity-40"><CheckCheck size={16} />Mark all read</button><button onClick={refreshNotifications} className="flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm"><RefreshCw size={16} />Refresh</button></div></header>
    <DeviceNotificationsCard />
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" aria-label="Recent notifications"><div className="relative"><Search size={16} className="absolute left-3 top-3.5 text-muted-foreground" /><input type="search" aria-label="Search notifications" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search updates, payments or bookings" className="h-11 w-full rounded-lg border bg-background pl-10 pr-3 text-base" /></div><div className="flex flex-wrap gap-2">{[{ id: "all", label: "All" }, { id: "unread", label: "Unread" }, { id: "JOB", label: "Jobs" }, { id: "PAYMENT", label: "Payments" }, { id: "SYSTEM", label: "System" }, { id: "REVIEW", label: "Reviews" }, { id: "ANNOUNCEMENT", label: "Announcements" }].map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-11 rounded-lg border px-4 text-sm ${filter === item.id ? "border-blue-700 bg-blue-700 text-white" : "bg-background"}`}>{item.label}</button>)}</div>
      {(error || actionError) && <p role="alert" className="rounded-xl border border-red-200 p-4 text-sm text-red-700">{actionError || "Updates could not be loaded. Please refresh."}</p>}
      <p role="status" className="text-xs text-muted-foreground">{isLoading ? "Loading updates..." : `${visible.length} matching updates from the latest ${notifications.length} loaded records`}</p>
      <div className="space-y-3">{visible.map(item => <article key={item.id} className={`flex items-start gap-3 rounded-xl border p-4 ${item.isRead ? "bg-background" : "border-blue-200 bg-blue-50/50 dark:bg-blue-950/20"}`}><Bell size={20} className="mt-1 shrink-0 text-blue-700" /><div className="min-w-0 flex-1"><Link href={`${detailBasePath}/${item.id}`} onClick={() => void markRead(item)} className="flex items-start justify-between gap-2 text-sm font-semibold hover:underline"><span className="break-words">{item.title}</span><ArrowUpRight size={15} className="shrink-0" /></Link><p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{item.message}</p><p className="mt-2 text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)} ? {item.type.toLowerCase()}{!item.isRead && " ? unread"}</p></div><button onClick={() => void remove(item.id)} aria-label={`Delete notification: ${item.title}`} className="shrink-0 rounded-lg p-2.5 text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 size={17} /></button></article>)}</div>
      {!isLoading && !error && !visible.length && <div className="rounded-xl border border-dashed p-8 text-center"><Bell size={28} className="mx-auto mb-3 text-blue-700" /><h2 className="font-semibold">No matching updates</h2><p className="mt-2 text-sm text-muted-foreground">Try another category or clear your search. Conversations are in Messages.</p></div>}
    </section>
  </div>
}
