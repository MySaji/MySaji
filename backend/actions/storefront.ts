"use server"

import { db } from "@/backend/db"
import { buildProviderSlug } from "@/backend/domain/provider-slug"

/**
 * The public provider storefront (/p/<slug>).
 *
 * Deliberately unauthenticated and read-only: this is the page a customer
 * lands on from search, a shared link, or an offer. It reads the same rows the
 * provider portal writes — no separate "published profile" copy to keep in
 * step.
 *
 * The tabs are filters over Offer.actionType rather than separate models,
 * which is why this is one query rather than four: BOOK/HIRE/QUOTE/REQUEST are
 * services, BUY is a product, RENT is a rental. Only LIVE offers are exposed;
 * DRAFT and UNDER_REVIEW stay private to the provider.
 */

export type StorefrontOffer = {
  id: string
  title: string
  description: string
  price: number | null
  currency: string
  image: string | null
  actionType: "BOOK" | "HIRE" | "BUY" | "QUOTE" | "REQUEST" | "RENT"
  pricingModel: string
  unitLabel: string | null
}

export type StorefrontReview = {
  id: string
  rating: number
  comment: string
  authorName: string
  createdAt: string
}

export type StorefrontPortfolioItem = {
  id: string
  title: string
  description: string | null
  imageUrl: string
  /// Providers can film a job as well as photograph it, and the public
  /// profile was dropping the video half of every sample on the floor.
  videoUrl: string | null
}

export type StorefrontCredential = {
  id: string
  name: string
  issuer: string
  verified: boolean
}

export type StorefrontData = {
  slug: string
  name: string
  businessName: string | null
  avatar: string | null
  headline: string | null
  bio: string | null
  verified: boolean
  isBusinessOwner: boolean
  yearsExperience: number
  languages: string[]
  education: { institution: string; qualification: string; year: string }[]
  awards: { title: string; issuer: string; year: string }[]
  resumeUrl: string | null
  workPreference: "REMOTE" | "ONSITE" | "HYBRID"
  location: string
  skills: string[]
  categoryName: string | null

  rating: number
  reviewCount: number
  completedJobs: number
  successRate: number | null
  repeatCustomers: number
  responseTimeMinutes: number | null

  services: StorefrontOffer[]
  products: StorefrontOffer[]
  rentals: StorefrontOffer[]
  portfolio: StorefrontPortfolioItem[]
  reviews: StorefrontReview[]
  credentials: StorefrontCredential[]
} | null

const SERVICE_ACTIONS = ["BOOK", "HIRE", "QUOTE", "REQUEST"] as const

function readJsonArray<T>(raw: unknown, map: (entry: Record<string, unknown>) => T, keep: (value: T) => boolean): T[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map(map)
    .filter(keep)
}

export async function getStorefront(slug: string): Promise<StorefrontData> {
  const key = String(slug ?? "").trim()
  if (!key) return null

  const profile = await db.providerProfile.findUnique({
    where: { slug: key },
    include: {
      user: { select: { name: true, image: true } },
      category: { select: { name: true } },
      portfolio: { orderBy: { createdAt: "desc" }, take: 24 },
      certifications: { where: { status: "APPROVED" }, orderBy: { dateIssued: "desc" } },
      offers: {
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
        take: 60,
      },
    },
  })

  if (!profile) return null

  // Reviews and job stats are the two things not already on the profile row.
  const [reviews, jobs] = await Promise.all([
    db.review.findMany({
      where: { providerId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { customer: { select: { name: true } } },
    }),
    db.job.findMany({ where: { providerId: profile.id }, select: { status: true, customerId: true } }),
  ])

  const completed = jobs.filter((j) => j.status === "COMPLETED").length
  const cancelled = jobs.filter((j) => j.status === "CANCELLED").length
  const settled = completed + cancelled

  const perCustomer = new Map<string, number>()
  jobs.forEach((j) => {
    if (!j.customerId) return
    perCustomer.set(j.customerId, (perCustomer.get(j.customerId) ?? 0) + 1)
  })

  const toOffer = (o: (typeof profile.offers)[number]): StorefrontOffer => ({
    id: o.id,
    title: o.title,
    description: o.description,
    price: o.price != null ? Number(o.price) : null,
    currency: o.currency,
    image: o.images[0] ?? null,
    actionType: o.actionType,
    pricingModel: o.pricingModel,
    unitLabel: o.unitLabel,
  })

  return {
    slug: profile.slug!,
    name: profile.user.name,
    businessName: profile.businessName,
    avatar: profile.user.image,
    headline: profile.headline,
    bio: profile.bio,
    verified: profile.verified,
    isBusinessOwner: profile.isBusinessOwner,
    yearsExperience: profile.yearsExperience,
    languages: profile.languages,
    education: readJsonArray(
      profile.education,
      (e) => ({ institution: String(e.institution ?? ""), qualification: String(e.qualification ?? ""), year: String(e.year ?? "") }),
      (e) => Boolean(e.institution || e.qualification),
    ),
    awards: readJsonArray(
      profile.awards,
      (e) => ({ title: String(e.title ?? ""), issuer: String(e.issuer ?? ""), year: String(e.year ?? "") }),
      (a) => Boolean(a.title),
    ),
    resumeUrl: profile.resumeUrl,
    workPreference: profile.workPreference,
    location: profile.workPreference === "REMOTE" ? "Remote" : profile.workAreas[0] ?? profile.location ?? "",
    skills: profile.skills,
    categoryName: profile.category?.name ?? null,

    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
    completedJobs: profile.completedJobs,
    successRate: settled > 0 ? Math.round((completed / settled) * 100) : null,
    repeatCustomers: [...perCustomer.values()].filter((n) => n > 1).length,
    responseTimeMinutes: profile.responseTimeMinutes,

    services: profile.offers.filter((o) => (SERVICE_ACTIONS as readonly string[]).includes(o.actionType)).map(toOffer),
    products: profile.offers.filter((o) => o.actionType === "BUY").map(toOffer),
    rentals: profile.offers.filter((o) => o.actionType === "RENT").map(toOffer),

    portfolio: profile.portfolio.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.imageUrl,
      videoUrl: p.videoUrl,
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      authorName: r.customer?.name ?? "Customer",
      createdAt: r.createdAt.toISOString(),
    })),
    credentials: profile.certifications.map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      verified: true,
    })),
  }
}

/**
 * The signed-in provider's own storefront address, minted on first read for
 * anyone whose profile predates slugs. Kept here rather than in the storefront
 * read so the public page never writes.
 */
export async function ensureMyStorefrontSlug(userId: string): Promise<string | null> {
  const profile = await db.providerProfile.findUnique({
    where: { userId },
    select: { id: true, slug: true, businessName: true, user: { select: { name: true, email: true } } },
  })
  if (!profile) return null
  if (profile.slug) return profile.slug

  const slug = buildProviderSlug(profile.businessName || profile.user.name, profile.user.email, profile.id)

  // Two concurrent first-reads can race; the loser just re-reads the winner's
  // value rather than failing on the unique constraint.
  try {
    const updated = await db.providerProfile.update({ where: { id: profile.id }, data: { slug }, select: { slug: true } })
    return updated.slug
  } catch {
    const again = await db.providerProfile.findUnique({ where: { id: profile.id }, select: { slug: true } })
    return again?.slug ?? null
  }
}
