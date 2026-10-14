"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

/**
 * Providers who SERVE where you are, as opposed to who is standing near you.
 *
 * WHY THIS HAD TO EXIST
 *
 * The customer home page showed shops and almost no people, and the reason
 * was not the geofence code: of eighteen providers on this database, four had
 * any coordinates at all, and the "live" positions on those were weeks old.
 * The rest had never been located and so could never appear inside any
 * radius, however wide.
 *
 * But seven of them DO say where they work, in `workAreas` ("Nairobi",
 * "Kiambu"). A plumber who covers Nairobi is a perfectly good answer to
 * "who can come and fix this", and refusing to show them because nobody
 * recorded a latitude is the system being precise rather than useful.
 *
 * WHY THEY ARE RETURNED SEPARATELY AND WITHOUT A DISTANCE
 *
 * Because we genuinely do not know how far away they are. Mixing them into
 * the distance-sorted list would mean either inventing a distance or sorting
 * some rows by a number and others by nothing, and both are worse than
 * saying plainly: these also cover your area. A customer can tell the
 * difference between "600 m away" and "covers Nairobi" and is not confused
 * by being shown both, clearly labelled.
 *
 * WHERE THE AREA NAME COMES FROM
 *
 * The customer's default saved address. Not their GPS fix, because a
 * coordinate cannot be matched against the word "Nairobi" without a
 * geocoder, and this needs to work with the data that actually exists today.
 */

export type AreaProvider = {
  id: string
  name: string
  businessName: string | null
  categoryName: string | null
  rating: number
  reviewCount: number
  completedJobs: number
  image: string | null
  slug: string | null
  /** The area of theirs that matched, for the label on the card. */
  servesArea: string
  isAvailable: boolean
}

export type AreaProvidersResult = {
  /** Null when we cannot tell what area the customer is in. */
  area: string | null
  items: AreaProvider[]
}

const EMPTY: AreaProvidersResult = { area: null, items: [] }

/**
 * Work out the customer's area from their saved address.
 *
 * `city` first because it is the field people actually fill in. Falling back
 * to the free-text address means a customer who typed "Westlands, Nairobi"
 * still matches a provider covering Nairobi.
 */
function areaCandidates(city: string | null, address: string | null): string[] {
  const out: string[] = []
  if (city && city.trim()) out.push(city.trim())
  if (address && address.trim()) {
    // The parts of an address, largest last: "Westlands, Nairobi" gives both.
    for (const part of address.split(",").map((p) => p.trim()).filter(Boolean)) {
      if (!out.some((o) => o.toLowerCase() === part.toLowerCase())) out.push(part)
    }
  }
  return out.slice(0, 4)
}

export async function getProvidersServingMyArea(input?: unknown): Promise<AreaProvidersResult> {
  const parsed = z.object({
    categoryId: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(24).optional(),
    /** Providers already shown by distance, so they are not repeated. */
    excludeIds: z.array(z.string()).max(50).optional(),
  }).safeParse(input ?? {})
  const categoryId = parsed.success ? parsed.data.categoryId : undefined
  const limit = (parsed.success ? parsed.data.limit : undefined) ?? 8
  const exclude = (parsed.success ? parsed.data.excludeIds : undefined) ?? []

  const session = await auth()
  if (!session?.user?.id) return EMPTY

  const address = await db.address.findFirst({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: { city: true, address: true },
  })
  const candidates = areaCandidates(address?.city ?? null, address?.address ?? null)
  if (candidates.length === 0) return EMPTY

  const rows = await db.providerProfile.findMany({
    where: {
      parentBusinessId: null,
      user: { isActive: true },
      ...(categoryId ? { categoryId } : {}),
      id: exclude.length > 0 ? { notIn: exclude } : undefined,
      // `hasSome` is an exact match per entry, so "Nairobi" matches a
      // provider who listed Nairobi and not one who listed "Nairobi West".
      // That is the right way round: a false match sends somebody to the
      // wrong town, a missed one costs a scroll.
      workAreas: { hasSome: candidates },
      OR: [{ availability: null }, { availability: { isOnVacation: false } }],
    },
    orderBy: [{ rating: "desc" }, { completedJobs: "desc" }],
    take: limit,
    select: {
      id: true, businessName: true, rating: true, reviewCount: true, completedJobs: true,
      slug: true, workAreas: true,
      user: { select: { name: true, image: true } },
      category: { select: { name: true } },
      availability: { select: { isOnVacation: true } },
    },
  })

  const lower = candidates.map((c) => c.toLowerCase())
  return {
    area: candidates[0],
    items: rows.map((p) => ({
      id: p.id,
      name: p.user.name ?? "Provider",
      businessName: p.businessName,
      categoryName: p.category?.name ?? null,
      rating: Number(p.rating),
      reviewCount: p.reviewCount,
      completedJobs: p.completedJobs,
      image: p.user.image,
      slug: p.slug,
      // The area of theirs that actually matched, not the customer's word for
      // it, so the card says what the provider themselves claims to cover.
      servesArea:
        p.workAreas.find((w) => lower.includes(w.toLowerCase())) ?? candidates[0],
      isAvailable: !p.availability?.isOnVacation,
    })),
  }
}
