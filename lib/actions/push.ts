"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { sendWebPush, type PushPayload } from "@/lib/push"
import type { NotificationPreferences } from "@/lib/actions/settings"

export async function getVapidPublicKey(): Promise<string | null> {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null
}

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

export type PushActionResult = { success: true } | { success: false; error: string }

export async function savePushSubscription(input: unknown): Promise<PushActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = subscribeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid subscription" }
  const { endpoint, keys } = parsed.data

  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  })
  return { success: true }
}

export async function removePushSubscription(input: unknown): Promise<PushActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = z.object({ endpoint: z.string() }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: session.user.id } })
  return { success: true }
}

export async function hasActivePushSubscription(): Promise<boolean> {
  const session = await auth()
  if (!session?.user?.id) return false
  const count = await db.pushSubscription.count({ where: { userId: session.user.id } })
  return count > 0
}

// Same category→preference mapping as lib/actions/notifications.ts's real
// bell filtering — a category the customer has muted in the bell shouldn't
// buzz their phone either.
const CATEGORY_PREFERENCE_KEY: Partial<Record<string, keyof NotificationPreferences>> = {
  job: "jobUpdates",
  message: "messages",
  payment: "payments",
  promo: "promotions",
}

/** Pushes to every one of a user's subscribed browsers, respecting both
 * their real pushNotifications (channel) and, when a category is given,
 * the matching per-category preference — and prunes subscriptions the
 * browser itself has since expired/unsubscribed (a 404/410 from the push
 * service). Never throws: a failed push must never break the caller's own
 * real business logic (e.g. confirming a payment). */
export async function pushToUser(userId: string, payload: PushPayload, category?: keyof typeof CATEGORY_PREFERENCE_KEY): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: userId } })
    const prefs = user?.notificationPreferences as Partial<NotificationPreferences> | null
    if (prefs?.pushNotifications === false) return
    const categoryKey = category ? CATEGORY_PREFERENCE_KEY[category] : undefined
    if (categoryKey && prefs?.[categoryKey] === false) return

    const subs = await db.pushSubscription.findMany({ where: { userId } })
    if (subs.length === 0) return

    await Promise.all(
      subs.map(async (sub) => {
        const result = await sendWebPush(sub, payload)
        if (result.expired) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        }
      }),
    )
  } catch {
    // Never let a push failure break the real notification-creating action.
  }
}
