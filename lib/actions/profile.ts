"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export type CustomerProfileData = {
  name: string
  email: string
  phone: string | null
  bio: string
  location: string
  avatar: string | null
  kycStatus: string
  hasSubmittedKyc: boolean
  completedServices: number
  reviewsWritten: number
  totalSpent: number
  memberSince: string
} | null

export async function getCustomerProfile(): Promise<CustomerProfileData> {
  const session = await auth()
  if (!session?.user?.id) return null

  const [user, completedServices, reviewsWritten, spentAgg, kycDocCount] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { customerProfile: true } }),
    db.job.count({ where: { customerId: session.user.id, status: "COMPLETED" } }),
    db.review.count({ where: { customerId: session.user.id } }),
    db.transaction.aggregate({ where: { wallet: { userId: session.user.id }, type: "DEBIT" }, _sum: { amount: true } }),
    db.kycDocument.count({ where: { userId: session.user.id } }),
  ])
  if (!user) return null

  return {
    name: user.name,
    email: user.email,
    phone: user.phone,
    bio: user.customerProfile?.bio ?? "",
    location: user.customerProfile?.location ?? "",
    avatar: user.image,
    kycStatus: user.kycStatus,
    hasSubmittedKyc: kycDocCount > 0,
    completedServices,
    reviewsWritten,
    totalSpent: Math.abs(Number(spentAgg._sum.amount ?? 0)),
    memberSince: user.createdAt.toISOString(),
  }
}

export type ProfileActionResult = { success: true } | { success: false; error: string }

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  bio: z.string().trim().max(500).optional(),
  location: z.string().trim().max(200).optional(),
})

export async function updateCustomerProfile(input: unknown): Promise<ProfileActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { name, phone, bio, location } = parsed.data

  await db.$transaction([
    db.user.update({ where: { id: session.user.id }, data: { name, phone: phone || undefined } }),
    db.customerProfile.upsert({
      where: { userId: session.user.id },
      update: { bio, location },
      create: { userId: session.user.id, bio, location },
    }),
  ])

  return { success: true }
}

const avatarSchema = z.object({ imageDataUrl: z.string().min(1) })

export async function updateProfileAvatar(input: unknown): Promise<ProfileActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = avatarSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.user.update({ where: { id: session.user.id }, data: { image: parsed.data.imageDataUrl } })
  return { success: true }
}
