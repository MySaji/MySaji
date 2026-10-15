import "server-only"

import { db } from "@/backend/db"

import { pushToUser } from "@/backend/services/push-core"

import type { NotificationType } from "@prisma/client"

type NotifyCategory = "job" | "message" | "payment" | "promo"

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
