"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { verifyPassword, hashPassword } from "@/lib/password"

export type ProviderAccountData = {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  location: string
  // Coordinates for the `location` text above. Null for every provider who
  // typed a place name rather than picking one from the autocomplete — a
  // provider without these is simply absent from radius results, never
  // defaulted to a city centre.
  latitude: number | null
  longitude: number | null
} | null

export async function getMyAccount(): Promise<ProviderAccountData> {
  const session = await auth()
  if (!session?.user?.id) return null

  const user = await db.user.findUnique({ where: { id: session.user.id }, include: { providerProfile: true } })
  if (!user) return null

  const [firstName, ...rest] = user.name.split(" ")
  return {
    firstName,
    lastName: rest.join(" "),
    email: user.email,
    phone: user.phone,
    location: user.providerProfile?.location ?? "",
    latitude: user.providerProfile?.latitude != null ? Number(user.providerProfile.latitude) : null,
    longitude: user.providerProfile?.longitude != null ? Number(user.providerProfile.longitude) : null,
  }
}

export type ProviderAccountActionResult = { success: true } | { success: false; error: string }

const updateAccountSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  location: z.string().trim().max(200).optional(),
  // Set together by the address autocomplete on the account page. Both
  // halves must arrive for either to be stored.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export async function updateMyAccount(input: unknown): Promise<ProviderAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updateAccountSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { firstName, lastName, phone, location, latitude, longitude } = parsed.data
  const name = [firstName, lastName].filter(Boolean).join(" ")
  const coords = latitude != null && longitude != null ? { latitude, longitude } : {}
  // Clearing the location text clears the coordinates with it, rather than
  // leaving the provider pinned to a place they no longer claim to work in.
  const clearedCoords = location !== undefined && location.trim().length === 0
    ? { latitude: null, longitude: null }
    : {}

  await db.$transaction([
    db.user.update({ where: { id: session.user.id }, data: { name, phone: phone || undefined } }),
    db.providerProfile.updateMany({
      where: { userId: session.user.id },
      data: { location: location || null, ...clearedCoords, ...coords },
    }),
  ])

  return { success: true }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

export async function changeMyPassword(input: unknown): Promise<ProviderAccountActionResult> {
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

export async function deleteMyAccount(): Promise<ProviderAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  await db.user.update({ where: { id: session.user.id }, data: { deletedAt: new Date(), isActive: false } })
  return { success: true }
}

export type NotificationPreferences = {
  pushNotifications: boolean
  emailAlerts: boolean
  jobNotifications: boolean
  soundEnabled: boolean
  smsNotifications: boolean
  marketingEmails: boolean
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushNotifications: true, emailAlerts: true, jobNotifications: true,
  soundEnabled: true, smsNotifications: false, marketingEmails: false,
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const session = await auth()
  if (!session?.user?.id) return DEFAULT_NOTIFICATION_PREFERENCES

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  const stored = user?.notificationPreferences as Partial<NotificationPreferences> | null
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...stored }
}

const notificationPreferencesSchema = z.object({
  pushNotifications: z.boolean(),
  emailAlerts: z.boolean(),
  jobNotifications: z.boolean(),
  soundEnabled: z.boolean(),
  smsNotifications: z.boolean(),
  marketingEmails: z.boolean(),
})

export async function updateNotificationPreferences(input: unknown): Promise<ProviderAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = notificationPreferencesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.user.update({ where: { id: session.user.id }, data: { notificationPreferences: parsed.data } })
  return { success: true }
}

// ============================= LINKED SHOP =============================
// Lets a provider tag a real shop they're affiliated with (e.g. a hardware-
// store-owning handyman). Purely an optional display link — does not grant
// any cross-role access, since a User's `role` stays exactly what it was.

export type LinkedShop = { id: string; name: string; logoUrl: string | null } | null

export async function getMyLinkedShop(): Promise<LinkedShop> {
  const session = await auth()
  if (!session?.user?.id) return null

  const profile = await db.providerProfile.findUnique({
    where: { userId: session.user.id },
    include: { affiliatedShop: true },
  })
  if (!profile?.affiliatedShop) return null
  return { id: profile.affiliatedShop.id, name: profile.affiliatedShop.shopName, logoUrl: profile.affiliatedShop.shopLogoUrl }
}

export type ShopSearchResult = { id: string; name: string; logoUrl: string | null }

export async function searchShops(query: string): Promise<ShopSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const shops = await db.shopkeeperProfile.findMany({
    where: { shopName: { contains: trimmed, mode: "insensitive" } },
    take: 10,
    orderBy: { shopName: "asc" },
  })
  return shops.map((s) => ({ id: s.id, name: s.shopName, logoUrl: s.shopLogoUrl }))
}

const linkShopSchema = z.object({ shopId: z.string().trim().min(1) })

export async function linkMyShop(input: unknown): Promise<ProviderAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = linkShopSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const shop = await db.shopkeeperProfile.findUnique({ where: { id: parsed.data.shopId } })
  if (!shop) return { success: false, error: "Shop not found." }

  await db.providerProfile.updateMany({ where: { userId: session.user.id }, data: { affiliatedShopId: shop.id } })
  return { success: true }
}

export async function unlinkMyShop(): Promise<ProviderAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  await db.providerProfile.updateMany({ where: { userId: session.user.id }, data: { affiliatedShopId: null } })
  return { success: true }
}
