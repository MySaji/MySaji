"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { verifyPassword, hashPassword } from "@/backend/services/password"

export type SubAdminAccountData = { name: string; email: string; phone: string | null } | null

export async function getSubAdminAccount(): Promise<SubAdminAccountData> {
  const session = await auth()
  if (!session?.user?.id) return null
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  if (!user) return null
  return { name: user.name, email: user.email, phone: user.phone }
}

export type SubAdminAccountActionResult = { success: true } | { success: false; error: string }

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
})

export async function updateSubAdminProfile(input: unknown): Promise<SubAdminAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.user.update({ where: { id: session.user.id }, data: { name: parsed.data.name, phone: parsed.data.phone || undefined } })
  return { success: true }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

export async function changeSubAdminPassword(input: unknown): Promise<SubAdminAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  if (!user?.password) return { success: false, error: "Password sign-in is not enabled for this account." }

  const isValid = await verifyPassword(parsed.data.currentPassword, user.password)
  if (!isValid) return { success: false, error: "Current password is incorrect." }

  const newHash = await hashPassword(parsed.data.newPassword)
  await db.user.update({ where: { id: user.id }, data: { password: newHash } })
  return { success: true }
}

export type SubAdminNotificationPreferences = { email: boolean; push: boolean; sms: boolean }

const DEFAULT_PREFS: SubAdminNotificationPreferences = { email: true, push: true, sms: false }

export async function getSubAdminNotificationPreferences(): Promise<SubAdminNotificationPreferences> {
  const session = await auth()
  if (!session?.user?.id) return DEFAULT_PREFS
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  const stored = user?.notificationPreferences as Partial<SubAdminNotificationPreferences> | null
  return { ...DEFAULT_PREFS, ...stored }
}

const notifSchema = z.object({ email: z.boolean(), push: z.boolean(), sms: z.boolean() })

export async function updateSubAdminNotificationPreferences(input: unknown): Promise<SubAdminAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = notifSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.user.update({ where: { id: session.user.id }, data: { notificationPreferences: parsed.data } })
  return { success: true }
}
