"use client"

import useSWR from "swr"
import {
  getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, deleteNotification,
  type NotificationItem,
} from "@/lib/actions/notifications"

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
  const unreadCount = unreadCountData ?? 0

  const refreshNotifications = () => {
    mutateNotifications()
    mutateUnreadCount()
  }

  const markRead = async (notification: NotificationItem) => {
    if (notification.isRead) return
    mutateNotifications((current) => current?.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)), { revalidate: false })
    mutateUnreadCount((current) => Math.max(0, (current ?? 1) - 1), { revalidate: false })
    const result = await markNotificationRead({ id: notification.id })
    if (!result.success) refreshNotifications()
  }

  const markAllRead = async () => {
    mutateNotifications((current) => current?.map((n) => ({ ...n, isRead: true })), { revalidate: false })
    mutateUnreadCount(0, { revalidate: false })
    const result = await markAllNotificationsRead()
    if (!result.success) refreshNotifications()
  }

  const remove = async (id: string) => {
    mutateNotifications((current) => current?.filter((n) => n.id !== id), { revalidate: false })
    const result = await deleteNotification({ id })
    if (!result.success) refreshNotifications()
  }

  return { notifications, unreadCount, refreshNotifications, markRead, markAllRead, remove }
}
