"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import {
  Bell, CheckCircle, Trash2, Briefcase, MessageCircle, Wallet, Shield,
  Star, Clock, Gift, Loader2
} from "lucide-react"
import { getNotifications, markAllNotificationsRead, deleteNotification, type NotificationItem } from "@/backend/actions/notifications"
import { formatRelativeTime } from "@/backend/domain/format"

const typeConfig: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  JOB: { icon: Briefcase, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
  MESSAGE: { icon: MessageCircle, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  PAYMENT: { icon: Wallet, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
  SYSTEM: { icon: Shield, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" },
  REVIEW: { icon: Star, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },
  PROMO: { icon: Gift, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-900/30" },
  ANNOUNCEMENT: { icon: Bell, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-900/30" },
}

type FilterType = "all" | "unread" | "JOB" | "MESSAGE" | "PAYMENT"

// Shared across all 7 portals — each portal's layout.tsx already supplies
// brand-color chrome (sidebar/header), so this content area intentionally
// stays on neutral/semantic tokens (bg-primary, bg-muted, etc.) rather than
// hardcoding a per-portal accent, matching how each portal's own main
// content area (not just its sidebar) already looks.
export function NotificationsList({ detailBasePath }: { detailBasePath: string }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>("all")

  const refresh = () => getNotifications().then(setNotifications)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unreadCount = notifications.filter(n => !n.isRead).length

  const filtered = notifications.filter(n => {
    if (filter === "unread") return !n.isRead
    if (filter === "all") return true
    return n.type === filter
  })

  const today = filtered.filter(n => new Date(n.createdAt).toDateString() === new Date().toDateString())
  const earlier = filtered.filter(n => new Date(n.createdAt).toDateString() !== new Date().toDateString())

  const openNotification = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
    router.push(`${detailBasePath}/${id}`)
  }
  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    await markAllNotificationsRead()
  }
  const deleteNotif = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await deleteNotification({ id })
  }

  const filters: { id: FilterType; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: `Unread (${unreadCount})` },
    { id: "JOB", label: "Jobs" },
    { id: "MESSAGE", label: "Messages" },
    { id: "PAYMENT", label: "Payments" },
  ]

  const NotifCard = ({ notif }: { notif: NotificationItem }) => {
    const cfg = typeConfig[notif.type] || typeConfig.SYSTEM
    const Icon = cfg.icon
    return (
      <div
        className={`group flex items-start gap-3 p-4 rounded-xl transition-all hover:shadow-sm cursor-pointer ${
          !notif.isRead ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50"
        }`}
        onClick={() => openNotification(notif.id)}
      >
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg}`}>
          <Icon className={`w-5 h-5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold text-foreground ${!notif.isRead ? "" : "font-medium"}`}>{notif.title}</p>
            {!notif.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
            <Clock className="w-3 h-3" />{formatRelativeTime(notif.createdAt)}
          </span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); deleteNotif(notif.id) }}
          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 rounded-lg transition-all flex-shrink-0"
          aria-label="Delete notification"
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</p>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={markAllAsRead} className="text-xs bg-transparent">
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />Mark all read
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              filter === f.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-6">
          {today.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Today</h3>
              <Card className="border-0 shadow-sm divide-y divide-border/50 overflow-hidden">
                {today.map(n => <NotifCard key={n.id} notif={n} />)}
              </Card>
            </div>
          )}
          {earlier.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Earlier</h3>
              <Card className="border-0 shadow-sm divide-y divide-border/50 overflow-hidden">
                {earlier.map(n => <NotifCard key={n.id} notif={n} />)}
              </Card>
            </div>
          )}
        </div>
      ) : (
        <Card className="border-0 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mb-1">No notifications</p>
          <p className="text-sm text-muted-foreground">
            {filter === "unread" ? "You've read all your notifications." : "Nothing to show for this filter."}
          </p>
        </Card>
      )}
    </div>
  )
}
