"use server"

import { db } from "@/lib/db"
import { pushToUser } from "@/lib/actions/push"
import type { NotificationType } from "@prisma/client"

type NotifyCategory = "job" | "message" | "payment" | "promo"

// Same category set pushToUser already checks per-user preferences against —
// SYSTEM/REVIEW/ANNOUNCEMENT have no matching preference toggle, so they
// always push (respecting only the top-level pushNotifications channel).
const TYPE_TO_CATEGORY: Partial<Record<NotificationType, NotifyCategory>> = {
  JOB: "job",
  MESSAGE: "message",
  PAYMENT: "payment",
  PROMO: "promo",
}

export type NotifyInput = {
  userId: string
  title: string
  message: string
  type: NotificationType
  relatedType?: string
  relatedId?: string
  actionUrl?: string
}

/** The one place a real in-app notification should get created outside of
 * an existing $transaction — always pairs it with a real OS-level push
 * (respecting the recipient's channel/category preferences, enforced
 * inside pushToUser), so a new notification call site can never silently
 * end up in-app-only the way ~24 call sites had before this existed. Never
 * throws — a failed notification/push must never break the caller's real
 * business logic (e.g. confirming a payment). */
export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        actionUrl: input.actionUrl,
      },
    })
  } catch {
    // Still worth attempting the push below even if the in-app row failed.
  }
  await pushToUser(input.userId, { title: input.title, body: input.message, url: input.actionUrl ?? "/" }, TYPE_TO_CATEGORY[input.type])
}

/** Same as notifyUser, for broadcasting one message to many recipients at
 * once (e.g. an admin announcement, or every reviewer being alerted about
 * an escalation). */
export async function notifyUsers(userIds: string[], input: Omit<NotifyInput, "userId">): Promise<void> {
  if (userIds.length === 0) return
  try {
    await db.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title: input.title,
        message: input.message,
        type: input.type,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        actionUrl: input.actionUrl,
      })),
    })
  } catch {
    // Still worth attempting the pushes below even if the in-app rows failed.
  }
  await Promise.all(
    userIds.map((userId) =>
      pushToUser(userId, { title: input.title, body: input.message, url: input.actionUrl ?? "/" }, TYPE_TO_CATEGORY[input.type]),
    ),
  )
}
