"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getNotificationPreferences, type NotificationPreferences } from "@/lib/actions/settings"
import type { NotificationType } from "@prisma/client"

export type NotificationItem = {
  id: string
  title: string
  message: string
  type: string
  actionUrl: string | null
  isRead: boolean
  createdAt: string
}

// Maps each togglable notification category to the real NotificationType(s)
// it governs. SYSTEM and ANNOUNCEMENT deliberately have no entry here — those
// are platform-critical notices, not something a customer can opt out of
// seeing in their own bell.
const TYPE_PREFERENCE_KEY: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
  JOB: "jobUpdates",
  REVIEW: "jobUpdates",
  MESSAGE: "messages",
  PAYMENT: "payments",
  PROMO: "promotions",
}

async function enabledNotificationTypes(): Promise<NotificationType[]> {
  const prefs = await getNotificationPreferences()
  const allTypes = ["JOB", "MESSAGE", "PAYMENT", "REVIEW", "SYSTEM", "PROMO", "ANNOUNCEMENT"] as NotificationType[]
  return allTypes.filter((type) => {
    const prefKey = TYPE_PREFERENCE_KEY[type]
    return !prefKey || prefs[prefKey]
  })
}

export async function getNotifications(limit?: number): Promise<NotificationItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const enabledTypes = await enabledNotificationTypes()
  const notifications = await db.notification.findMany({
    // MESSAGE is excluded everywhere the bell reads: chat lives in the inbox,
    // which carries its own unread badge. This also hides rows written before
    // that split, so an old backlog does not keep the bell lit.
    where: { userId: session.user.id, type: { in: enabledTypes, not: "MESSAGE" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return notifications.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    actionUrl: n.actionUrl,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }))
}

export async function getNotificationById(id: string): Promise<NotificationItem | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const notification = await db.notification.findFirst({ where: { id, userId: session.user.id } })
  if (!notification) return null

  // Opening the detail page is the read receipt, same convention as
  // opening a message thread in lib/actions/messages.ts's getMessages.
  if (!notification.isRead) {
    await db.notification.update({ where: { id: notification.id }, data: { isRead: true } })
  }

  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    actionUrl: notification.actionUrl,
    isRead: true,
    createdAt: notification.createdAt.toISOString(),
  }
}

export type UnreadCounts = {
  /** What the bell shows — chat is excluded, see getNotifications. */
  notifications: number
  /** What the inbox icon shows: real unread messages, not notification rows,
   *  so it clears when a conversation is actually read. */
  messages: number
}

/**
 * Both unread counts in one call.
 *
 * Deliberately one action rather than two: the two badges are read together
 * by every layout that shows them, and a second client-invoked action for a
 * single number is a second round trip against a database in another region.
 */
export async function getUnreadNotificationCount(): Promise<UnreadCounts> {
  const session = await auth()
  if (!session?.user?.id) return { notifications: 0, messages: 0 }
  const myId = session.user.id
  const enabledTypes = await enabledNotificationTypes()

  const [notifications, conversations] = await Promise.all([
    db.notification.count({ where: { userId: myId, isRead: false, type: { in: enabledTypes, not: "MESSAGE" } } }),
    db.conversation.findMany({
      where: { OR: [{ participantAId: myId }, { participantBId: myId }] },
      select: { id: true },
    }),
  ])

  const messages = conversations.length === 0 ? 0 : await db.message.count({
    where: { conversationId: { in: conversations.map((c) => c.id) }, senderId: { not: myId }, isRead: false },
  })

  return { notifications, messages }
}

export type NotificationActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function markNotificationRead(input: unknown): Promise<NotificationActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.notification.updateMany({ where: { id: parsed.data.id, userId: session.user.id }, data: { isRead: true } })
  return { success: true }
}

export async function markAllNotificationsRead(): Promise<NotificationActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  await db.notification.updateMany({ where: { userId: session.user.id, isRead: false }, data: { isRead: true } })
  return { success: true }
}

export async function deleteNotification(input: unknown): Promise<NotificationActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.notification.deleteMany({ where: { id: parsed.data.id, userId: session.user.id } })
  return { success: true }
}
