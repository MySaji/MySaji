"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireSubAdmin } from "@/backend/actions/sub-admin-dashboard"
import { logAdminAction } from "@/backend/services/admin-audit-core"

export type SubAdminSubscriber = { email: string; subscribedAt: string; deviceId: string | null }

export async function getSubAdminSubscribers(): Promise<SubAdminSubscriber[]> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return []

  const subscribers = await db.subscriber.findMany({ orderBy: { subscribedAt: "desc" } })
  return subscribers.map((s) => ({ email: s.email, subscribedAt: s.subscribedAt.toISOString(), deviceId: s.deviceId }))
}

export type SubAdminSubscriberActionResult = { success: true } | { success: false; error: string }

const emailSchema = z.object({ email: z.string().trim().email() })

export async function deleteSubAdminSubscriber(input: unknown): Promise<SubAdminSubscriberActionResult> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return { success: false, error: "You must be signed in as a sub-admin." }

  const parsed = emailSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.subscriber.deleteMany({ where: { email: parsed.data.email } })

  await logAdminAction({
    userId: subAdmin.userId,
    action: "subscriber.delete",
    entityType: "Subscriber",
    entityId: parsed.data.email,
  })

  return { success: true }
}
