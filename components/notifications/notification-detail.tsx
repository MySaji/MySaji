"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Bell, Trash2, Briefcase, MessageCircle, Wallet, Shield,
  Star, Gift, Loader2, ArrowLeft, ExternalLink
} from "lucide-react"
import { getNotificationById, deleteNotification, type NotificationItem } from "@/lib/actions/notifications"

const typeConfig: Record<string, { icon: typeof Bell; color: string; bg: string; label: string }> = {
  JOB: { icon: Briefcase, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", label: "Job" },
  MESSAGE: { icon: MessageCircle, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", label: "Message" },
  PAYMENT: { icon: Wallet, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", label: "Payment" },
  SYSTEM: { icon: Shield, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800", label: "System" },
  REVIEW: { icon: Star, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", label: "Review" },
  PROMO: { icon: Gift, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-900/30", label: "Promotion" },
  ANNOUNCEMENT: { icon: Bell, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-900/30", label: "Announcement" },
}

const ACTION_LABEL: Record<string, string> = {
  JOB: "Go to job",
  MESSAGE: "Go to conversation",
  PAYMENT: "Go to payments",
  REVIEW: "Rate now",
  PROMO: "View details",
  ANNOUNCEMENT: "View details",
}

export function NotificationDetail({ id, listHref }: { id: string; listHref: string }) {
  const [notification, setNotification] = useState<NotificationItem | null | undefined>(undefined)
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    getNotificationById(id).then(setNotification)
  }, [id])

  const handleDelete = async () => {
    await deleteNotification({ id })
    setDeleted(true)
  }

  if (notification === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (notification === null || deleted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Bell className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="font-semibold text-foreground mb-1">{deleted ? "Notification deleted" : "Notification not found"}</p>
        <p className="text-sm text-muted-foreground mb-6">
          {deleted ? "This notification has been removed." : "It may have been deleted, or it doesn't belong to your account."}
        </p>
        <Link href={listHref}>
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Back to notifications</Button>
        </Link>
      </div>
    )
  }

  const cfg = typeConfig[notification.type] || typeConfig.SYSTEM
  const Icon = cfg.icon
  const created = new Date(notification.createdAt)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href={listHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" />Back to notifications
      </Link>

      <Card className="border-0 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${cfg.bg}`}>
            <Icon className={`w-6 h-6 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <span className={`inline-block text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            <h1 className="text-xl font-bold text-foreground mt-2">{notification.title}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {created.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              {" at "}
              {created.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>

        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap mt-6 pt-6 border-t border-border/50">
          {notification.message}
        </p>

        <div className="flex flex-wrap gap-3 mt-6">
          {notification.actionUrl && (
            <Link href={notification.actionUrl}>
              <Button>
                {ACTION_LABEL[notification.type] ?? "View details"}<ExternalLink className="w-3.5 h-3.5 ml-2" />
              </Button>
            </Link>
          )}
          <Button variant="outline" onClick={handleDelete} className="bg-transparent">
            <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
          </Button>
        </div>
      </Card>
    </div>
  )
}
