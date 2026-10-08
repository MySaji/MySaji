"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { verifyPassword, hashPassword } from "@/lib/password"
import { firstCoordinate } from "@/lib/geo"

export type ShopkeeperAccountData = {
  shopName: string
  ownerName: string
  email: string
  phone: string | null
  location: string
  // Null until the shopkeeper either picks their shop from the address
  // autocomplete or taps "use my current location" — customers only see a
  // distance to, and can only find by radius, shops that have these.
  latitude: number | null
  longitude: number | null
  shopDescription: string
  shopCategory: string
  businessLicense: string
  shopLogoUrl: string | null
  openingTime: string | null
  sundayOpeningTime: string | null
  sundayClosingTime: string | null
  holidayOpeningTime: string | null
  holidayClosingTime: string | null
  closingTime: string | null
  deliveryFee: number
  isVerified: boolean
  rating: number
  reviewCount: number
  totalSales: number
  activeProducts: number
  joinDate: string
  hasSubmittedRegistration: boolean
  rejectionReason: string | null
  isOnVacation: boolean
  vacationNote: string | null
} | null

export async function getMyShopAccount(): Promise<ShopkeeperAccountData> {
  const session = await auth()
  if (!session?.user?.id) return null

  const [user, profile, address, activeProducts, latestKycDocument] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id } }),
    db.shopkeeperProfile.findUnique({ where: { userId: session.user.id } }),
    db.address.findFirst({ where: { userId: session.user.id, type: "OFFICE" }, orderBy: { createdAt: "desc" } }),
    db.product.count({ where: { shopkeeper: { userId: session.user.id }, isActive: true } }),
    db.kycDocument.findFirst({ where: { userId: session.user.id }, orderBy: { submittedAt: "desc" } }),
  ])
  if (!user || !profile) return null

  return {
    shopName: profile.shopName,
    ownerName: user.name,
    email: user.email,
    phone: user.phone,
    location: address ? [address.address, address.city].filter(Boolean).join(", ") : "",
    // The profile columns are the source of truth; the OFFICE address is
    // only still consulted for shops saved before those columns existed and
    // not yet covered by scripts/backfill-profile-coordinates.js.
    latitude: firstCoordinate(profile.latitude, address?.latitude),
    longitude: firstCoordinate(profile.longitude, address?.longitude),
    shopDescription: profile.shopDescription ?? "",
    shopCategory: profile.shopCategory ?? "",
    businessLicense: profile.businessLicense ?? "",
    shopLogoUrl: profile.shopLogoUrl,
    openingTime: profile.openingTime,
    sundayOpeningTime: profile.sundayOpeningTime,
    sundayClosingTime: profile.sundayClosingTime,
    holidayOpeningTime: profile.holidayOpeningTime,
    holidayClosingTime: profile.holidayClosingTime,
    closingTime: profile.closingTime,
    deliveryFee: Number(profile.deliveryFee),
    isVerified: profile.isVerified,
    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
    totalSales: Number(profile.totalSales),
    activeProducts,
    joinDate: profile.createdAt.toISOString(),
    hasSubmittedRegistration: latestKycDocument !== null,
    rejectionReason: latestKycDocument?.rejectionReason ?? null,
    isOnVacation: profile.isOnVacation,
    vacationNote: profile.vacationNote,
  }
}

export type ShopkeeperAccountActionResult = { success: true } | { success: false; error: string }

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time").optional().or(z.literal(""))

const updateAccountSchema = z.object({
  shopName: z.string().trim().min(1, "Shop name is required").optional(),
  shopDescription: z.string().trim().optional(),
  shopCategory: z.string().trim().optional(),
  businessLicense: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  location: z.string().trim().optional(),
  // Either picked from Google Places autocomplete alongside the text above,
  // or captured from the shopkeeper's device while they stand in the shop.
  // Both halves must arrive together to be stored.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  openingTime: timeSchema,
  sundayOpeningTime: timeSchema,
  sundayClosingTime: timeSchema,
  holidayOpeningTime: timeSchema,
  holidayClosingTime: timeSchema,
  closingTime: timeSchema,
  deliveryFee: z.number().min(0, "Delivery fee can't be negative").max(50000, "That delivery fee looks too high").optional(),
})

export async function updateMyShopAccount(input: unknown): Promise<ShopkeeperAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updateAccountSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { shopName, shopDescription, shopCategory, businessLicense, phone, location, latitude, longitude, openingTime, closingTime, deliveryFee,
    sundayOpeningTime, sundayClosingTime, holidayOpeningTime, holidayClosingTime } = parsed.data
  const coords = latitude != null && longitude != null ? { latitude, longitude } : {}

  const profile = await db.shopkeeperProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return { success: false, error: "Shop profile not found." }

  await db.$transaction(async (tx) => {
    await tx.shopkeeperProfile.update({
      where: { userId: session.user!.id },
      data: {
        shopName: shopName ?? undefined,
        shopDescription: shopDescription ?? undefined,
        shopCategory: shopCategory ?? undefined,
        businessLicense: businessLicense ?? undefined,
        openingTime: openingTime !== undefined ? (openingTime || null) : undefined,
        sundayOpeningTime: sundayOpeningTime !== undefined ? (sundayOpeningTime || null) : undefined,
        sundayClosingTime: sundayClosingTime !== undefined ? (sundayClosingTime || null) : undefined,
        holidayOpeningTime: holidayOpeningTime !== undefined ? (holidayOpeningTime || null) : undefined,
        holidayClosingTime: holidayClosingTime !== undefined ? (holidayClosingTime || null) : undefined,
        closingTime: closingTime !== undefined ? (closingTime || null) : undefined,
        deliveryFee: deliveryFee ?? undefined,
        // Mirrored onto the OFFICE Address row below. These columns are what
        // customer-facing radius search actually queries (see getAllShops),
        // because a filter cannot reach through a join to another table.
        ...coords,
      },
    })

    if (phone !== undefined) {
      await tx.user.update({ where: { id: session.user!.id }, data: { phone: phone || null } })
    }

    const hasLocationText = location !== undefined && location.trim().length > 0
    const hasCoords = Object.keys(coords).length > 0
    if (hasLocationText || hasCoords) {
      const existing = await tx.address.findFirst({ where: { userId: session.user!.id, type: "OFFICE" } })
      if (existing) {
        await tx.address.update({
          where: { id: existing.id },
          data: { ...(hasLocationText ? { address: location } : {}), ...coords },
        })
      } else {
        await tx.address.create({
          data: {
            userId: session.user!.id,
            label: "Shop Location",
            type: "OFFICE",
            address: hasLocationText ? location! : "",
            isDefault: true,
            ...coords,
          },
        })
      }
    }
  })

  return { success: true }
}

const vacationModeSchema = z.object({
  isOnVacation: z.boolean(),
  vacationNote: z.string().trim().max(200).optional(),
})

/** Real enforcement, not just a UI flag — addToCart() and checkout()
 * (lib/actions/cart.ts) both check ShopkeeperProfile.isOnVacation before
 * letting a customer buy from this shop, so turning this on genuinely
 * stops new orders from reaching the shopkeeper while they're away. */
export async function setShopVacationMode(input: unknown): Promise<ShopkeeperAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = vacationModeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const profile = await db.shopkeeperProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return { success: false, error: "Shop profile not found." }

  await db.shopkeeperProfile.update({
    where: { userId: session.user.id },
    data: { isOnVacation: parsed.data.isOnVacation, vacationNote: parsed.data.vacationNote || null },
  })

  return { success: true }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

export async function changeMyShopPassword(input: unknown): Promise<ShopkeeperAccountActionResult> {
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

export type ShopNotificationPreferences = {
  emailNotifications: boolean
  smsNotifications: boolean
  orderNotifications: boolean
  reviewNotifications: boolean
  promotionalEmails: boolean
  pushNotifications: boolean
}

const DEFAULT_SHOP_NOTIFICATION_PREFERENCES: ShopNotificationPreferences = {
  emailNotifications: true, smsNotifications: true, orderNotifications: true,
  reviewNotifications: true, promotionalEmails: false, pushNotifications: true,
}

export async function getShopNotificationPreferences(): Promise<ShopNotificationPreferences> {
  const session = await auth()
  if (!session?.user?.id) return DEFAULT_SHOP_NOTIFICATION_PREFERENCES

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  const stored = user?.notificationPreferences as Partial<ShopNotificationPreferences> | null
  return { ...DEFAULT_SHOP_NOTIFICATION_PREFERENCES, ...stored }
}

const notificationPreferencesSchema = z.object({
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  orderNotifications: z.boolean(),
  reviewNotifications: z.boolean(),
  promotionalEmails: z.boolean(),
  pushNotifications: z.boolean(),
})

export async function updateShopNotificationPreferences(input: unknown): Promise<ShopkeeperAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = notificationPreferencesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.user.update({ where: { id: session.user.id }, data: { notificationPreferences: parsed.data } })
  return { success: true }
}
