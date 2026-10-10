"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin, logAdminAction } from "@/backend/actions/admin-dashboard"

export type AdminSubscriber = { email: string; subscribedAt: string; deviceId: string | null }

export async function getSubscribers(): Promise<AdminSubscriber[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const subscribers = await db.subscriber.findMany({ orderBy: { subscribedAt: "desc" } })
  return subscribers.map((s) => ({ email: s.email, subscribedAt: s.subscribedAt.toISOString(), deviceId: s.deviceId }))
}

export type AdminSubscriberActionResult = { success: true } | { success: false; error: string }

const emailSchema = z.object({ email: z.string().trim().email() })

export async function deleteSubscriber(input: unknown): Promise<AdminSubscriberActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = emailSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.subscriber.deleteMany({ where: { email: parsed.data.email } })

  await logAdminAction({
    userId: admin.userId,
    action: "subscriber.delete",
    entityType: "Subscriber",
    entityId: parsed.data.email,
  })

  return { success: true }
}
