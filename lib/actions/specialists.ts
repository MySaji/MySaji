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
  /** Declared by the provider. Null when unset — previously this was
   *  derived from completedJobs, which showed someone with no jobs at all
   *  as having a year of experience. The UI omits the line when null. */
  yearsExperience: number | null
  hourlyRate: number
  skills: string[]
  location: string
  workPreference: "REMOTE" | "ONSITE" | "HYBRID"
  /** Public storefront address, when the provider has one. */
  slug: string | null
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
    // Prefer what the provider actually declared. The completedJobs/25
    // heuristic below is the old behaviour, kept only as a fallback so
    // profiles nobody has filled in yet don't suddenly read "0 years" — it is
    // a guess, and should be deleted once declared experience is widespread.
    yearsExperience: p.yearsExperience > 0 ? p.yearsExperience : null,
    hourlyRate: p.hourlyRate != null ? Number(p.hourlyRate) : 0,
    skills: p.skills.length > 0 ? p.skills : p.category ? [p.category.name] : [],
    // A remote provider has no meaningful travel area, and showing them under
    // a town (or the old hardcoded "Nairobi") is what made every provider look
    // like they drive to you.
    location: p.workPreference === "REMOTE" ? "Remote" : p.workAreas[0] ?? "Nairobi",
    workPreference: p.workPreference,
    slug: p.slug,
    badges: computeBadges(p.verified, Number(p.rating), p.responseTimeMinutes),
  }))
}

export type SpecialistDetail = SpecialistCard & {
  bio: string | null
  phone: string | null
  /// The provider's work samples — what they photographed or filmed on a
  /// finished job. `description` is carried so the customer can read what the
  /// job actually involved rather than just seeing a caption-less thumbnail.
  portfolio: { id: string; title: string; description: string | null; imageUrl: string; videoUrl: string | null }[]
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
    yearsExperience: provider.yearsExperience > 0 ? provider.yearsExperience : null,
    hourlyRate: provider.hourlyRate != null ? Number(provider.hourlyRate) : 0,
    skills: provider.skills.length > 0 ? provider.skills : provider.category ? [provider.category.name] : [],
    location: provider.workPreference === "REMOTE" ? "Remote" : provider.workAreas[0] ?? "Nairobi",
    workPreference: provider.workPreference,
    slug: provider.slug,
    badges: computeBadges(provider.verified, Number(provider.rating), provider.responseTimeMinutes),
    bio: provider.bio,
    // Real phone numbers never leave the server to another user — Call and
    // Message both go through the in-app conversation/voice-call system
    // (userId above), never a raw tel: link.
    phone: null,
    portfolio: provider.portfolio.map((item) => ({ id: item.id, title: item.title, description: item.description, imageUrl: item.imageUrl, videoUrl: item.videoUrl })),
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
