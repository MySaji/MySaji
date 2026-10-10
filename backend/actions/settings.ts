"use server"

import { z } from "zod"
import { auth, signOut } from "@/backend/auth"
import { db } from "@/backend/db"
import { hashPassword, verifyPassword } from "@/backend/services/password"

export type NotificationPreferences = {
  jobUpdates: boolean
  messages: boolean
  payments: boolean
  promotions: boolean
  emailDigest: boolean
  pushNotifications: boolean
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  jobUpdates: true,
  messages: true,
  payments: true,
  promotions: false,
  emailDigest: true,
  pushNotifications: true,
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const session = await auth()
  if (!session?.user?.id) return DEFAULT_PREFERENCES

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  const stored = user?.notificationPreferences as Partial<NotificationPreferences> | null
  return { ...DEFAULT_PREFERENCES, ...stored }
}

export type SettingsActionResult = { success: true } | { success: false; error: string }

export async function updateNotificationPreferences(input: unknown): Promise<SettingsActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const schema = z.object({
    jobUpdates: z.boolean(),
    messages: z.boolean(),
    payments: z.boolean(),
    promotions: z.boolean(),
    emailDigest: z.boolean(),
    pushNotifications: z.boolean(),
  })
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.user.update({ where: { id: session.user.id }, data: { notificationPreferences: parsed.data } })
  return { success: true }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
})

export async function changePassword(input: unknown): Promise<SettingsActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  if (!user?.password) return { success: false, error: "Password sign-in is not enabled for this account." }

  const valid = await verifyPassword(parsed.data.currentPassword, user.password)
  if (!valid) return { success: false, error: "Current password is incorrect." }

  const newHash = await hashPassword(parsed.data.newPassword)
  await db.user.update({ where: { id: session.user.id }, data: { password: newHash } })
  return { success: true }
}

export type BillingHistoryItem = {
  id: string
  description: string
  amount: number
  status: string
  date: string
}

export async function getBillingHistory(): Promise<BillingHistoryItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const payments = await db.payment.findMany({
    where: { payerId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { job: true, order: true },
  })

  return payments.map((p) => ({
    id: p.id,
    description: p.job?.title ?? (p.order ? `Order ${p.order.orderNumber}` : "Payment"),
    amount: Number(p.amount),
    status: p.status,
    date: p.createdAt.toISOString(),
  }))
}

export async function exportCustomerData(): Promise<Record<string, unknown> | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const userId = session.user.id

  const [user, customerProfile, addresses, jobs, orders, transactions, reviews, notifications] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.customerProfile.findUnique({ where: { userId } }),
    db.address.findMany({ where: { userId } }),
    db.job.findMany({ where: { customerId: userId } }),
    db.order.findMany({ where: { customerId: userId }, include: { items: true } }),
    db.transaction.findMany({ where: { wallet: { userId } } }),
    db.review.findMany({ where: { customerId: userId } }),
    db.notification.findMany({ where: { userId } }),
  ])
  if (!user) return null

  return {
    exportedAt: new Date().toISOString(),
    profile: { name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt, bio: customerProfile?.bio, location: customerProfile?.location },
    addresses,
    bookings: jobs,
    orders,
    walletTransactions: transactions,
    reviewsWritten: reviews,
    notifications,
  }
}

const deleteAccountSchema = z.object({ reason: z.string().trim().optional() })

export async function deleteMyAccount(input: unknown): Promise<SettingsActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = deleteAccountSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.user.update({
    where: { id: session.user.id },
    data: { isActive: false, deletedAt: new Date(), deletionReason: parsed.data.reason || undefined },
  })
  await signOut({ redirect: false })

  return { success: true }
}
