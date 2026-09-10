"use client"

import { useEffect, useRef } from "react"
import useSWR from "swr"
import {
  getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, deleteNotification,
  type NotificationItem,
} from "@/lib/actions/notifications"
import { playNotificationSound } from "@/lib/notification-sound"

// Every portal's layout previously duplicated this exact fetch-on-mount +
// refetch-after-action logic (7 copies). Consolidated into one hook so the
// bell's real-time behavior (or any future fix to it) only needs changing
// once. The unread count polls every 30s via SWR's own refreshInterval,
// which already pauses automatically while the tab is hidden and
// revalidates on focus — no custom backoff needed here, unlike the
// wait-for-one-event payment polling in payment-methods.tsx.
const UNREAD_COUNT_REFRESH_MS = 30000

export function useNotificationBell(limit: number = 10, enabled: boolean = true) {
  const { data: notificationsData, mutate: mutateNotifications } = useSWR(
    enabled ? ["notifications", limit] : null,
    ([, n]: [string, number]) => getNotifications(n),
  )
  const { data: unreadCountData, mutate: mutateUnreadCount } = useSWR(
    enabled ? "unread-notification-count" : null,
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
  const previousUnreadRef = useRef<number | null>(null)
  useEffect(() => {
    if (unreadCountData === undefined) return
    if (previousUnreadRef.current !== null && unreadCount > previousUnreadRef.current) {
      playNotificationSound()
    }
    previousUnreadRef.current = unreadCount
  }, [unreadCountData])

  const refreshNotifications = () => {
    mutateNotifications()
    mutateUnreadCount()
  }

  const markRead = async (notification: NotificationItem) => {
    if (notification.isRead) return
    mutateNotifications((current) => current?.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)), { revalidate: false })
    mutateUnreadCount(
      (current) => ({ notifications: Math.max(0, (current?.notifications ?? 1) - 1), messages: current?.messages ?? 0 }),
      { revalidate: false },
    )
    const result = await markNotificationRead({ id: notification.id })
    if (!result.success) refreshNotifications()
  }

  const markAllRead = async () => {
    mutateNotifications((current) => current?.map((n) => ({ ...n, isRead: true })), { revalidate: false })
    // Marking notifications read must not clear the chat badge with them.
    mutateUnreadCount((current) => ({ notifications: 0, messages: current?.messages ?? 0 }), { revalidate: false })
    const result = await markAllNotificationsRead()
    if (!result.success) refreshNotifications()
  }

  const remove = async (id: string) => {
    mutateNotifications((current) => current?.filter((n) => n.id !== id), { revalidate: false })
    const result = await deleteNotification({ id })
    if (!result.success) refreshNotifications()
  }

  return {
    unreadMessages, notifications, unreadCount, refreshNotifications, markRead, markAllRead, remove }
}
