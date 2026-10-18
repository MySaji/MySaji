"use client"

import { useEffect, useRef, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuthContext } from "@/frontend/lib/auth-context"
import {
  getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, deleteNotification,
  type NotificationItem,
} from "@/backend/actions/notifications"
import { playNotificationSound } from "@/frontend/lib/notification-sound"

// Every portal's layout previously duplicated this exact fetch-on-mount +
// refetch-after-action logic (7 copies). Consolidated into one hook so the
// bell's real-time behavior (or any future fix to it) only needs changing
// once. The unread count polls every 30s via SWR's own refreshInterval,
// which already pauses automatically while the tab is hidden and
// revalidates on focus — no custom backoff needed here, unlike the
// wait-for-one-event payment polling in payment-methods.tsx.
const UNREAD_COUNT_REFRESH_MS = 30000

export function useNotificationBell(limit: number = 10, enabled: boolean = true) {
  const { user } = useAuthContext()
  const { mutate: mutateCache } = useSWRConfig()
  const [actionError, setActionError] = useState("")
  const { data: notificationsData, mutate: mutateNotifications, error, isLoading } = useSWR(
    enabled && user?.id ? ["notifications", limit, user.id] : null,
    ([, n]: [string, number, string]) => getNotifications(n),
  )
  const { data: unreadCountData, mutate: mutateUnreadCount } = useSWR(
    enabled && user?.id ? ["unread-notification-count", user.id] : null,
    getUnreadNotificationCount,
    { refreshInterval: UNREAD_COUNT_REFRESH_MS, revalidateOnFocus: true },
  )

  const notifications = notificationsData ?? []
  const unreadCount = unreadCountData?.notifications ?? 0
  // Chat's own badge, carried on the same call — see UnreadCounts.
  const unreadMessages = unreadCountData?.messages ?? 0

  // Foreground sound cue — real OS push notifications already carry the
  // device's own system sound (see public/sw.js), but only fire while the
  // tab is backgrounded/closed. This is the missing case: the tab is open
  // and a poll just found a genuinely new unread notification. Skips the
  // very first load (nothing "arrived", it was just already there) and
  // any decrease (marking things read).
  const previousUnreadRef = useRef<{ userId: string; notifications: number; messages: number } | null>(null)
  useEffect(() => {
    if (unreadCountData === undefined) return
    if (previousUnreadRef.current && previousUnreadRef.current.userId === user?.id && (unreadCount > previousUnreadRef.current.notifications || unreadMessages > previousUnreadRef.current.messages)) {
      playNotificationSound()
      void mutateNotifications()
    }
    previousUnreadRef.current = user?.id ? { userId: user.id, notifications: unreadCount, messages: unreadMessages } : null
  }, [unreadCountData, user?.id, unreadCount, unreadMessages, mutateNotifications])

  const refreshNotifications = () => {
    void mutateCache(key => Array.isArray(key) && key[0] === "notifications" && key[2] === user?.id)
    void mutateUnreadCount()
  }

  const markRead = async (notification: NotificationItem) => {
    if (notification.isRead) return
    mutateNotifications((current) => current?.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)), { revalidate: false })
    mutateUnreadCount(
      (current) => ({ notifications: Math.max(0, (current?.notifications ?? 1) - 1), messages: current?.messages ?? 0 }),
      { revalidate: false },
    )
    setActionError("")
    try {
    const result = await markNotificationRead({ id: notification.id })
    if (!result.success) { setActionError(result.error); refreshNotifications() }
    else refreshNotifications()
    } catch { setActionError("This change could not be saved. Please try again."); refreshNotifications() }
  }

  const markAllRead = async () => {
    mutateNotifications((current) => current?.map((n) => ({ ...n, isRead: true })), { revalidate: false })
    // Marking notifications read must not clear the chat badge with them.
    mutateUnreadCount((current) => ({ notifications: 0, messages: current?.messages ?? 0 }), { revalidate: false })
    setActionError("")
    try {
    const result = await markAllNotificationsRead()
    if (!result.success) { setActionError(result.error); refreshNotifications() }
    else refreshNotifications()
    } catch { setActionError("This change could not be saved. Please try again."); refreshNotifications() }
  }

  const remove = async (id: string) => {
    mutateNotifications((current) => current?.filter((n) => n.id !== id), { revalidate: false })
    setActionError("")
    try {
    const result = await deleteNotification({ id })
    if (!result.success) { setActionError(result.error); refreshNotifications() }
    else refreshNotifications()
    } catch { setActionError("This change could not be saved. Please try again."); refreshNotifications() }
  }

  return {
    isLoading, error, actionError, unreadMessages, notifications, unreadCount, refreshNotifications, markRead, markAllRead, remove }
}
