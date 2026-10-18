import "server-only"

import { db } from "@/backend/db"

import { sendWebPush, type PushPayload } from "@/backend/services/push"

import type { NotificationPreferences } from "@/backend/actions/settings"

const CATEGORY_PREFERENCE_KEY: Partial<Record<string, keyof NotificationPreferences>> = {
  job: "jobUpdates",
  message: "messages",
  payment: "payments",
  promo: "promotions",
}

export async function pushToUser(userId: string, payload: PushPayload, category?: keyof typeof CATEGORY_PREFERENCE_KEY): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user?.isActive || user.deletedAt) return
    const prefs = user?.notificationPreferences as Partial<NotificationPreferences> | null
    if (prefs?.pushNotifications === false) return
    const categoryKey = category ? CATEGORY_PREFERENCE_KEY[category] : undefined
    if (categoryKey && prefs?.[categoryKey] === false) return

    const subs = await db.pushSubscription.findMany({ where: { userId } })
    if (subs.length === 0) return

    await Promise.all(
      subs.map(async (sub) => {
        const result = await sendWebPush(sub, { ...payload, recipientId: userId })
        if (result.expired) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        }
      }),
    )
  } catch {
    // Never let a push failure break the real notification-creating action.
  }
}
