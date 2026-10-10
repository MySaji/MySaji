"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { verifyPassword, hashPassword } from "@/backend/services/password"

export type DistributorAccountData = {
  companyName: string
  ownerName: string
  email: string
  phone: string | null
  location: string
  description: string
  businessLicense: string
  logoUrl: string | null
  isVerified: boolean
  rating: number
  reviewCount: number
  activeProducts: number
  activeLocations: number
  joinDate: string
  hasSubmittedRegistration: boolean
  rejectionReason: string | null
} | null

export async function getMyDistributorAccount(): Promise<DistributorAccountData> {
  const session = await auth()
  if (!session?.user?.id) return null

  const [user, profile, address, latestKycDocument] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id } }),
    db.distributorProfile.findUnique({ where: { userId: session.user.id } }),
    db.address.findFirst({ where: { userId: session.user.id, type: "OFFICE" }, orderBy: { createdAt: "desc" } }),
    db.kycDocument.findFirst({ where: { userId: session.user.id }, orderBy: { submittedAt: "desc" } }),
  ])
  if (!user || !profile) return null

  const [activeProducts, activeLocations] = await Promise.all([
    db.distributorProduct.count({ where: { distributorId: profile.id, isActive: true } }),
    db.distributorLocation.count({ where: { distributorId: profile.id, isActive: true } }),
  ])

  return {
    companyName: profile.companyName,
    ownerName: user.name,
    email: user.email,
    phone: user.phone,
    location: address ? [address.address, address.city].filter(Boolean).join(", ") : "",
    description: profile.description ?? "",
    businessLicense: profile.businessLicense ?? "",
    logoUrl: profile.logoUrl,
    isVerified: profile.isVerified,
    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
    activeProducts,
    activeLocations,
    joinDate: profile.createdAt.toISOString(),
    hasSubmittedRegistration: latestKycDocument !== null,
    rejectionReason: latestKycDocument?.rejectionReason ?? null,
  }
}

export type DistributorAccountActionResult = { success: true } | { success: false; error: string }

const updateAccountSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").optional(),
  description: z.string().trim().optional(),
  businessLicense: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  location: z.string().trim().optional(),
})

export async function updateMyDistributorAccount(input: unknown): Promise<DistributorAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updateAccountSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { companyName, description, businessLicense, phone, location } = parsed.data

  const profile = await db.distributorProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return { success: false, error: "Company profile not found." }

  await db.$transaction(async (tx) => {
    await tx.distributorProfile.update({
      where: { userId: session.user!.id },
      data: {
        companyName: companyName ?? undefined,
        description: description ?? undefined,
        businessLicense: businessLicense ?? undefined,
      },
    })

    if (phone !== undefined) {
      await tx.user.update({ where: { id: session.user!.id }, data: { phone: phone || null } })
    }

    if (location !== undefined && location.trim().length > 0) {
      const existing = await tx.address.findFirst({ where: { userId: session.user!.id, type: "OFFICE" } })
      if (existing) {
        await tx.address.update({ where: { id: existing.id }, data: { address: location } })
      } else {
        await tx.address.create({ data: { userId: session.user!.id, label: "Company HQ", type: "OFFICE", address: location, isDefault: true } })
      }
    }
  })

  return { success: true }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

export async function changeMyDistributorPassword(input: unknown): Promise<DistributorAccountActionResult> {
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

export type DistributorNotificationPreferences = {
  emailNotifications: boolean
  smsNotifications: boolean
  orderNotifications: boolean
  reviewNotifications: boolean
  promotionalEmails: boolean
  pushNotifications: boolean
}

const DEFAULT_DISTRIBUTOR_NOTIFICATION_PREFERENCES: DistributorNotificationPreferences = {
  emailNotifications: true, smsNotifications: true, orderNotifications: true,
  reviewNotifications: true, promotionalEmails: false, pushNotifications: true,
}

export async function getDistributorNotificationPreferences(): Promise<DistributorNotificationPreferences> {
  const session = await auth()
  if (!session?.user?.id) return DEFAULT_DISTRIBUTOR_NOTIFICATION_PREFERENCES

  const user = await db.user.findUnique({ where: { id: session.user.id } })
  const stored = user?.notificationPreferences as Partial<DistributorNotificationPreferences> | null
  return { ...DEFAULT_DISTRIBUTOR_NOTIFICATION_PREFERENCES, ...stored }
}

const notificationPreferencesSchema = z.object({
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  orderNotifications: z.boolean(),
  reviewNotifications: z.boolean(),
  promotionalEmails: z.boolean(),
  pushNotifications: z.boolean(),
})

export async function updateDistributorNotificationPreferences(input: unknown): Promise<DistributorAccountActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = notificationPreferencesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.user.update({ where: { id: session.user.id }, data: { notificationPreferences: parsed.data } })
  return { success: true }
}
