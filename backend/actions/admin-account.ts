"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { verifyPassword, hashPassword } from "@/backend/services/password"

export type AdminAccountData = { name: string; email: string; phone: string | null } | null

export async function getAdminAccount(): Promise<AdminAccountData> {
  const session = await auth()
  if (!session?.user?.id) return null
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  if (!user) return null
  return { name: user.name, email: user.email, phone: user.phone }
}

export type AdminAccountActionResult = { success: true } | { success: false; error: string }

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
})

export async function updateAdminProfile(input: unknown): Promise<AdminAccountActionResult> {
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

export async function changeAdminPassword(input: unknown): Promise<AdminAccountActionResult> {
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

export type AdminNotificationPreferences = {
  jobEmail: boolean
  jobPush: boolean
  newJobs: boolean
  disputes: boolean
  completedJobs: boolean
  paymentEmail: boolean
  paymentPush: boolean
  paymentsReleased: boolean
  deposits: boolean
  refunds: boolean
}

const DEFAULT_ADMIN_NOTIFICATION_PREFERENCES: AdminNotificationPreferences = {
  jobEmail: true, jobPush: true, newJobs: true, disputes: true, completedJobs: true,
  paymentEmail: true, paymentPush: true, paymentsReleased: true, deposits: true, refunds: true,
}

export async function getAdminNotificationPreferences(): Promise<AdminNotificationPreferences> {
  const session = await auth()
  if (!session?.user?.id) return DEFAULT_ADMIN_NOTIFICATION_PREFERENCES
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  const stored = user?.notificationPreferences as Partial<AdminNotificationPreferences> | null
  return { ...DEFAULT_ADMIN_NOTIFICATION_PREFERENCES, ...stored }
}

const notificationPreferencesSchema = z.object({
  jobEmail: z.boolean(), jobPush: z.boolean(), newJobs: z.boolean(), disputes: z.boolean(), completedJobs: z.boolean(),
  paymentEmail: z.boolean(), paymentPush: z.boolean(), paymentsReleased: z.boolean(), deposits: z.boolean(), refunds: z.boolean(),
})

export async function updateAdminNotificationPreferences(input: unknown): Promise<AdminAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = notificationPreferencesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.user.update({ where: { id: session.user.id }, data: { notificationPreferences: parsed.data } })
  return { success: true }
}
