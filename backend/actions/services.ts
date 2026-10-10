"use server"

import { db } from "@/backend/db"
import { getProviderAvailabilityStatuses, type ProviderAvailabilityStatus } from "@/backend/actions/provider-status"

export type ServiceProviderCard = {
  serviceId: string
  providerId: string
  name: string
  avatar: string | null
  rating: number
  reviewCount: number
  price: number
  responseTime: string
  completedJobs: number
  bio: string | null
  verified: boolean
  status: ProviderAvailabilityStatus
}

export type ServiceCategoryDetail = {
  categoryId: string
  title: string
  description: string
  image: string
  providers: ServiceProviderCard[]
} | null

function formatResponseTime(minutes: number | null): string {
  if (minutes == null) return "Response time varies"
  if (minutes < 60) return `${minutes} mins`
  return `${Math.round(minutes / 60)} hrs`
}

/** Powers app/customer/services/[id] — `id` is a Category id, and each real
 * Service row within it is shown as a selectable "provider" card, mirroring
 * the original mock's "one service, several providers" layout. */
export async function getServiceCategoryDetail(categoryId: string): Promise<ServiceCategoryDetail> {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: {
      services: {
        where: { isActive: true, approvalStatus: "APPROVED" },
        orderBy: { rating: "desc" },
        include: { provider: { include: { user: true } } },
      },
    },
  })
  if (!category) return null

  const firstImage = category.services.find((s) => s.images.length > 0)?.images[0]
  const statuses = await getProviderAvailabilityStatuses(category.services.map((s) => s.providerId))

  return {
    categoryId: category.id,
    title: category.name,
    description: `Professional ${category.name.toLowerCase()} services with transparent pricing, verified professionals, and fast response times.`,
    image: firstImage ?? "/placeholder.svg",
    providers: category.services.map((s) => ({
      serviceId: s.id,
      providerId: s.providerId,
      name: s.provider.user.name,
      avatar: s.provider.user.image,
      rating: Number(s.rating),
      reviewCount: s.reviewCount,
      price: Number(s.basePrice),
      responseTime: formatResponseTime(s.provider.responseTimeMinutes),
      completedJobs: s.provider.completedJobs,
      bio: s.provider.bio,
      verified: s.provider.verified,
      status: statuses.get(s.providerId) ?? "available",
    })),
  }
}

export type ServiceListItem = {
  serviceId: string
  title: string
  image: string | null
  providerId: string
  providerName: string
  providerAvatar: string | null
  categoryId: string | null
  categoryName: string | null
  categorySlug: string | null
  rating: number
  reviewCount: number
  price: number
  responseTime: string
  location: string
  isActive: boolean
  verified: boolean
  status: ProviderAvailabilityStatus
  badges: string[]
  createdAt: string
}

/** Powers app/customer/services/more — a flat browse of every active real
 * Service across all categories (unlike getServiceCategoryDetail, which is
 * scoped to a single category). */
export async function getAllServices(): Promise<ServiceListItem[]> {
  const services = await db.service.findMany({
    where: { isActive: true, approvalStatus: "APPROVED" },
    orderBy: { rating: "desc" },
    include: { provider: { include: { user: true } }, category: true },
  })

  const statuses = await getProviderAvailabilityStatuses(services.map((s) => s.providerId))

  return services.map((s) => {
    const badges: string[] = []
    if (s.provider.verified) badges.push("Verified")
    if (Number(s.rating) >= 4.8) badges.push("Top Rated")
    if (s.provider.responseTimeMinutes != null && s.provider.responseTimeMinutes <= 10) badges.push("Fast Responder")

    return {
      serviceId: s.id,
      title: s.title,
      image: s.images[0] ?? null,
      providerId: s.providerId,
      providerName: s.provider.user.name,
      providerAvatar: s.provider.user.image,
      categoryId: s.categoryId,
      categoryName: s.category?.name ?? null,
      categorySlug: s.category?.slug ?? null,
      rating: Number(s.rating),
      reviewCount: s.reviewCount,
      price: Number(s.basePrice),
      responseTime: formatResponseTime(s.provider.responseTimeMinutes),
      location: s.provider.workAreas[0] ?? "Nairobi",
      isActive: s.isActive,
      verified: s.provider.verified,
      status: statuses.get(s.providerId) ?? "available",
      badges,
      createdAt: s.createdAt.toISOString(),
    }
  })
}

export type EmergencyCategoryOption = { id: string; name: string; slug: string; avgPrice: number }

/** Real service categories that currently have at least one active real
 * Service, each with a real average base price computed from those
 * services — replaces a previously-hardcoded fixed emergency price list.
 * Only categories the admin has explicitly opted into emergency booking
 * (`isEmergencyEligible`) are shown — not every category qualifies. */
export async function getEmergencyCategoryOptions(): Promise<EmergencyCategoryOption[]> {
  const categories = await db.category.findMany({
    where: { type: "SERVICE", isActive: true, isEmergencyEligible: true },
    include: { services: { where: { isActive: true, approvalStatus: "APPROVED" }, select: { basePrice: true } } },
  })

  return categories
    .filter((c) => c.services.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      avgPrice: Math.round(c.services.reduce((sum, s) => sum + Number(s.basePrice), 0) / c.services.length),
    }))
}

export type ServiceForBooking = {
  serviceId: string
  title: string
  description: string
  basePrice: number
  currency: string
  providerId: string
  providerName: string
  providerAvatar: string | null
  providerRating: number
  providerReviewCount: number
} | null

export async function getServiceForBooking(serviceId: string): Promise<ServiceForBooking> {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    include: { provider: { include: { user: true } } },
  })
  if (!service || !service.isActive || service.approvalStatus !== "APPROVED") return null

  return {
    serviceId: service.id,
    title: service.title,
    description: service.description,
    basePrice: Number(service.basePrice),
    currency: service.currency,
    providerId: service.providerId,
    providerName: service.provider.user.name,
    providerAvatar: service.provider.user.image,
    providerRating: Number(service.provider.rating),
    providerReviewCount: service.provider.reviewCount,
  }
}
