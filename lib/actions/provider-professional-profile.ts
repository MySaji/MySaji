"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { buildProviderSlug } from "@/lib/provider-slug"

/**
 * The professional-identity half of a provider profile — headline, about,
 * experience, languages, education, awards, CV, and how they work.
 *
 * Deliberately separate from provider-account.ts (name, phone, password —
 * account admin) and provider-credentials.ts (skills, work areas,
 * certifications — what they can do and where). This file is what a customer
 * reads about them, and it is the data the public storefront renders.
 *
 * `successRate` and `repeatCustomers` are derived here rather than stored.
 * The denormalised counters that do exist (rating, reviewCount,
 * completedJobs) are each incremented at a single, obvious write site; adding
 * two more counters would mean two more places to keep in step, for numbers
 * that are a single grouped count over this provider's own jobs.
 */

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type EducationEntry = { institution: string; qualification: string; year: string }
export type AwardEntry = { title: string; issuer: string; year: string }

export type ProfessionalProfileData = {
  /** Public storefront address (/p/<slug>), minted on first read if absent. */
  slug: string | null
  headline: string
  bio: string
  yearsExperience: number
  languages: string[]
  education: EducationEntry[]
  awards: AwardEntry[]
  resumeUrl: string
  workPreference: "REMOTE" | "ONSITE" | "HYBRID"
  // Read-only social proof, shown so the provider sees what customers see.
  rating: number
  reviewCount: number
  completedJobs: number
  successRate: number | null
  repeatCustomers: number
} | null

export type ProfessionalProfileActionResult = { success: true } | { success: false; error: string }

/** Json columns are `unknown` at the type level; coerce defensively so one
 *  malformed row can't blank the whole page. */
function readEducation(raw: unknown): EducationEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({
      institution: String(e.institution ?? ""),
      qualification: String(e.qualification ?? ""),
      year: String(e.year ?? ""),
    }))
    .filter((e) => e.institution || e.qualification)
}

function readAwards(raw: unknown): AwardEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({
      title: String(e.title ?? ""),
      issuer: String(e.issuer ?? ""),
      year: String(e.year ?? ""),
    }))
    .filter((e) => e.title)
}

/**
 * Completed vs everything that reached a terminal state, plus how many
 * customers came back. One grouped query over this provider's own jobs —
 * cheap enough to run on profile load, and always correct, which a
 * denormalised counter would not be.
 */
async function deriveJobStats(providerId: string): Promise<{ successRate: number | null; repeatCustomers: number }> {
  const jobs = await db.job.findMany({
    where: { providerId },
    select: { status: true, customerId: true },
  })

  const completed = jobs.filter((j) => j.status === "COMPLETED").length
  const cancelled = jobs.filter((j) => j.status === "CANCELLED").length
  const settled = completed + cancelled

  const perCustomer = new Map<string, number>()
  jobs.forEach((j) => {
    if (!j.customerId) return
    perCustomer.set(j.customerId, (perCustomer.get(j.customerId) ?? 0) + 1)
  })

  return {
    // Null rather than 0 when nothing has settled yet — "no data" and "0%
    // success" are very different things to show a provider.
    successRate: settled > 0 ? Math.round((completed / settled) * 100) : null,
    repeatCustomers: [...perCustomer.values()].filter((n) => n > 1).length,
  }
}

export async function getMyProfessionalProfile(): Promise<ProfessionalProfileData> {
  const provider = await requireProvider()
  if (!provider) return null

  const profile = await db.providerProfile.findUnique({
    where: { id: provider.providerId },
    include: { user: { select: { name: true, email: true } } },
  })
  if (!profile) return null

  // Profiles created before storefronts existed have no address; mint one the
  // first time the provider opens this page rather than leaving them without.
  let slug = profile.slug
  if (!slug) {
    const candidate = buildProviderSlug(profile.businessName || profile.user.name, profile.user.email, profile.id)
    try {
      slug = (await db.providerProfile.update({ where: { id: profile.id }, data: { slug: candidate }, select: { slug: true } })).slug
    } catch {
      slug = (await db.providerProfile.findUnique({ where: { id: profile.id }, select: { slug: true } }))?.slug ?? null
    }
  }

  const { successRate, repeatCustomers } = await deriveJobStats(provider.providerId)

  return {
    slug,
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    yearsExperience: profile.yearsExperience,
    languages: profile.languages,
    education: readEducation(profile.education),
    awards: readAwards(profile.awards),
    resumeUrl: profile.resumeUrl ?? "",
    workPreference: profile.workPreference,
    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
    completedJobs: profile.completedJobs,
    successRate,
    repeatCustomers,
  }
}

const educationSchema = z.object({
  institution: z.string().trim().max(120),
  qualification: z.string().trim().max(120),
  year: z.string().trim().max(20),
})

const awardSchema = z.object({
  title: z.string().trim().max(120),
  issuer: z.string().trim().max(120),
  year: z.string().trim().max(20),
})

const profileSchema = z.object({
  headline: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(2000).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(70).optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  education: z.array(educationSchema).max(10).optional(),
  awards: z.array(awardSchema).max(10).optional(),
  resumeUrl: z.string().trim().url("Enter a valid link").max(500).or(z.literal("")).optional(),
  workPreference: z.enum(["REMOTE", "ONSITE", "HYBRID"]).optional(),
})

export async function updateMyProfessionalProfile(input: unknown): Promise<ProfessionalProfileActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const d = parsed.data

  await db.providerProfile.update({
    where: { id: provider.providerId },
    data: {
      ...(d.headline !== undefined ? { headline: d.headline || null } : {}),
      ...(d.bio !== undefined ? { bio: d.bio || null } : {}),
      ...(d.yearsExperience !== undefined ? { yearsExperience: d.yearsExperience } : {}),
      // Drop blanks and duplicates rather than rejecting the save over one
      // stray empty chip.
      ...(d.languages !== undefined
        ? { languages: [...new Set(d.languages.map((l) => l.trim()).filter(Boolean))] }
        : {}),
      ...(d.education !== undefined
        ? { education: d.education.filter((e) => e.institution || e.qualification) }
        : {}),
      ...(d.awards !== undefined ? { awards: d.awards.filter((a) => a.title) } : {}),
      ...(d.resumeUrl !== undefined ? { resumeUrl: d.resumeUrl || null } : {}),
      ...(d.workPreference !== undefined ? { workPreference: d.workPreference } : {}),
    },
  })

  return { success: true }
}
