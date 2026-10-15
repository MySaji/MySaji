"use server"

import { z } from "zod"

import { auth } from "@/backend/auth"

import { db } from "@/backend/db"

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
