"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getEffectivePlatformPreferences } from "@/lib/actions/admin-settings"

async function requireProviderId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  return profile?.id ?? null
}

export type ProviderServiceItem = {
  id: string
  title: string
  description: string
  categoryId: string | null
  categoryName: string | null
  basePrice: number
  currency: string
  image: string | null
  isActive: boolean
  totalBookings: number
  rating: number
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED"
  rejectionReason: string | null
}

export async function getMyServices(): Promise<ProviderServiceItem[]> {
  const providerId = await requireProviderId()
  if (!providerId) return []

  const services = await db.service.findMany({
    where: { providerId },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  })

  return services.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    categoryId: s.categoryId,
    categoryName: s.category?.name ?? null,
    basePrice: Number(s.basePrice),
    currency: s.currency,
    image: s.images[0] ?? null,
    isActive: s.isActive,
    totalBookings: s.totalBookings,
    rating: Number(s.rating),
    approvalStatus: s.approvalStatus,
    rejectionReason: s.rejectionReason,
  }))
}

export type ServiceCategoryOption = { id: string; name: string }

export async function getServiceCategoryOptions(): Promise<ServiceCategoryOption[]> {
  const categories = await db.category.findMany({ where: { type: "SERVICE", isActive: true }, orderBy: { name: "asc" } })
  return categories.map((c) => ({ id: c.id, name: c.name }))
}

export type ProviderServiceActionResult = { success: true } | { success: false; error: string }

const serviceSchema = z.object({
  title: z.string().trim().min(1, "Service name is required"),
  description: z.string().trim().min(1, "Description is required"),
  categoryId: z.string().trim().min(1, "Please select a category"),
  basePrice: z.coerce.number().positive("Enter a price greater than zero"),
  image: z.string().optional(),
})

export async function createMyService(input: unknown): Promise<ProviderServiceActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = serviceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { title, description, categoryId, basePrice, image } = parsed.data

  const { requireVerification, autoApprove } = await getEffectivePlatformPreferences()
  if (requireVerification) {
    const profile = await db.providerProfile.findUnique({ where: { id: providerId }, select: { verified: true } })
    if (!profile?.verified) {
      return { success: false, error: "Complete identity verification before listing a service — submit your documents from Profile > Verification." }
    }
  }

  await db.service.create({
    data: {
      providerId, title, description, categoryId, basePrice, images: image ? [image] : [],
      approvalStatus: autoApprove ? "APPROVED" : "PENDING",
    },
  })
  return { success: true }
}

const updateServiceSchema = serviceSchema.extend({ id: z.string().trim().min(1) })

export async function updateMyService(input: unknown): Promise<ProviderServiceActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = updateServiceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { id, title, description, categoryId, basePrice, image } = parsed.data

  await db.service.updateMany({
    where: { id, providerId },
    data: { title, description, categoryId, basePrice, ...(image ? { images: [image] } : {}) },
  })
  return { success: true }
}

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function toggleMyServiceActive(input: unknown): Promise<ProviderServiceActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const service = await db.service.findUnique({ where: { id: parsed.data.id } })
  if (!service || service.providerId !== providerId) return { success: false, error: "Service not found." }

  await db.service.update({ where: { id: service.id }, data: { isActive: !service.isActive } })
  return { success: true }
}

export async function deleteMyService(input: unknown): Promise<ProviderServiceActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  try {
    await db.service.deleteMany({ where: { id: parsed.data.id, providerId } })
    return { success: true }
  } catch {
    return { success: false, error: "This service has existing bookings and can't be deleted — deactivate it instead." }
  }
}
