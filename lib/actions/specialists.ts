"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getProviderAvailabilityStatuses, getProviderAvailabilityStatus, type ProviderAvailabilityStatus } from "@/lib/actions/provider-status"

function computeBadges(verified: boolean, rating: number, responseTimeMinutes: number | null): string[] {
  const badges: string[] = []
  if (verified) badges.push("Verified")
  if (rating >= 4.8) badges.push("Top Rated")
  if (responseTimeMinutes != null && responseTimeMinutes <= 10) badges.push("Fast Responder")
  return badges
}

export type SpecialistCard = {
  providerId: string
  userId: string
  name: string
  avatar: string | null
  verified: boolean
  status: ProviderAvailabilityStatus
  rating: number
  reviewCount: number
  completedJobs: number
  yearsExperience: number
  hourlyRate: number
  skills: string[]
  location: string
  badges: string[]
}

export async function getSpecialists(): Promise<SpecialistCard[]> {
  const providers = await db.providerProfile.findMany({
    include: { user: true, category: true },
    orderBy: { rating: "desc" },
  })

  const statuses = await getProviderAvailabilityStatuses(providers.map((p) => p.id))

  return providers.map((p) => ({
    providerId: p.id,
    userId: p.userId,
    name: p.user.name,
    avatar: p.user.image,
    verified: p.verified,
    status: statuses.get(p.id) ?? "available",
    rating: Number(p.rating),
    reviewCount: p.reviewCount,
    completedJobs: p.completedJobs,
    yearsExperience: Math.max(1, Math.round(p.completedJobs / 25)),
    hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : 0,
    skills: p.skills.length > 0 ? p.skills : p.category ? [p.category.name] : [],
    location: p.workAreas[0] ?? "Nairobi",
    badges: computeBadges(p.verified, Number(p.rating), p.responseTimeMinutes),
  }))
}

export type SpecialistDetail = SpecialistCard & {
  bio: string | null
  phone: string | null
  portfolio: { id: string; title: string; imageUrl: string; videoUrl: string | null }[]
  endorsements: { id: string; shopName: string; ownerName: string; message: string; avatar: string | null }[]
  bookableCategoryId: string | null
  isWishlisted: boolean
  shop: { id: string; name: string; logoUrl: string | null; rating: number } | null
} | null

export async function getSpecialistDetail(providerId: string): Promise<SpecialistDetail> {
  const session = await auth()

  const provider = await db.providerProfile.findUnique({
    where: { id: providerId },
    include: {
      user: true,
      category: true,
      portfolio: { orderBy: { createdAt: "desc" } },
      services: { where: { isActive: true }, take: 1 },
      affiliatedShop: true,
    },
  })
  if (!provider) return null

  const status = await getProviderAvailabilityStatus(provider.id)

  const endorsements = await db.endorsement.findMany({
    where: { toUserId: provider.userId },
    include: { fromUser: { include: { shopkeeperProfile: true } } },
    orderBy: { createdAt: "desc" },
  })

  let isWishlisted = false
  if (session?.user?.id) {
    const existing = await db.wishlistItem.findFirst({
      where: { customerId: session.user.id, targetType: "PROVIDER", providerId },
    })
    isWishlisted = !!existing
  }

  return {
    providerId: provider.id,
    userId: provider.userId,
    name: provider.user.name,
    avatar: provider.user.image,
    verified: provider.verified,
    status,
    rating: Number(provider.rating),
    reviewCount: provider.reviewCount,
    completedJobs: provider.completedJobs,
    yearsExperience: Math.max(1, Math.round(provider.completedJobs / 25)),
    hourlyRate: provider.hourlyRate != null ? Number(provider.hourlyRate) : 0,
    skills: provider.skills.length > 0 ? provider.skills : provider.category ? [provider.category.name] : [],
    location: provider.workAreas[0] ?? "Nairobi",
    badges: computeBadges(provider.verified, Number(provider.rating), provider.responseTimeMinutes),
    bio: provider.bio,
    phone: provider.user.phone,
    portfolio: provider.portfolio.map((item) => ({ id: item.id, title: item.title, imageUrl: item.imageUrl, videoUrl: item.videoUrl })),
    endorsements: endorsements.map((e) => ({
      id: e.id,
      shopName: e.fromUser.shopkeeperProfile?.shopName ?? e.fromUser.name,
      ownerName: e.fromUser.name,
      message: e.message,
      avatar: e.fromUser.image,
    })),
    bookableCategoryId: provider.services[0]?.categoryId ?? provider.categoryId,
    isWishlisted,
    shop: provider.affiliatedShop
      ? { id: provider.affiliatedShop.id, name: provider.affiliatedShop.shopName, logoUrl: provider.affiliatedShop.shopLogoUrl, rating: Number(provider.affiliatedShop.rating) }
      : null,
  }
}
