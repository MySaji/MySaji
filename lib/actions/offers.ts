"use server"

import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireVerified } from "@/lib/verification-gate"
import { getEffectivePlatformPreferences } from "@/lib/actions/admin-settings"
import { getMySubscriptionStatus } from "@/lib/actions/provider-subscription"
import { getOrCreateConversation, sendMessage } from "@/lib/actions/messages"
import { logJobEvent } from "@/lib/actions/job-events"
import { createServiceRequest } from "@/lib/actions/service-contracts"
import { checkRateLimit } from "@/lib/rate-limit"
import { extractOfferDetails, type OfferExtractionResult } from "@/lib/ai/offer-extraction"
import {
  enhanceOfferCopy,
  getCategoryPriceBand,
  getCategoryDemandSignal,
  type OfferEnhancementResult,
  type PriceBand,
  type DemandSignal,
} from "@/lib/ai/offer-enhancement"
import { getImageGuidance, type ImageGuidance } from "@/lib/offer-image-guidance"
import { GENERIC_SERVICE_ATTRIBUTE_FIELDS, GENERIC_PRODUCT_ATTRIBUTE_FIELDS, type OfferAttributeFieldDef } from "@/lib/offer-attribute-schema"
import {
  OFFER_ACTION_LABEL, PRICED_OFFER_ACTION_TYPES as PRICED_ACTION_TYPES, PRICELESS_PRICING_MODELS,
  OFFER_PRICING_MODELS, OFFER_AVAILABILITY_STATUSES, OFFER_FULFILMENT_METHODS,
  type OfferActionType, type OfferStatus, type OfferPricingModel, type OfferAvailabilityStatus,
  type OfferFulfilmentMethod, type OfferDocument,
} from "@/lib/offer-constants"

export type { OfferActionType, OfferStatus }

async function requireProviderId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  return profile?.id ?? null
}

export type ProviderOfferItem = {
  id: string
  title: string
  description: string
  categoryId: string | null
  categoryName: string | null
  actionType: OfferActionType
  price: number | null
  currency: string
  image: string | null
  status: OfferStatus
  reviewNote: string | null
  viewCount: number
  requestCount: number
  bookingCount: number
  createdAt: string
}

export async function getMyOffers(): Promise<ProviderOfferItem[]> {
  const providerId = await requireProviderId()
  if (!providerId) return []

  const offers = await db.offer.findMany({
    where: { providerId },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  })

  return offers.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    categoryId: o.categoryId,
    categoryName: o.category?.name ?? null,
    actionType: o.actionType,
    price: o.price != null ? Number(o.price) : null,
    currency: o.currency,
    image: o.images[0] ?? null,
    status: o.status,
    reviewNote: o.reviewNote,
    viewCount: o.viewCount,
    requestCount: o.requestCount,
    bookingCount: o.bookingCount,
    createdAt: o.createdAt.toISOString(),
  }))
}

export type OfferCategoryOption = {
  id: string
  name: string
  slug: string
  type: "SERVICE" | "PRODUCT"
  /** Parent category name, for disambiguating a long flat list. "Graphic
   *  Design" and "Web Development" mean different things under Design and
   *  under Technology, and there are ~90 categories to choose from now. */
  parentName: string | null
}

/** Offers were originally SERVICE-only (this app's first Offer categories
 * were all skilled-trade ones), but actionType already supports BUY and the
 * whole point of the Offer Creation Engine is category-agnostic listings —
 * a "Cement & Steel Supply" offer is fundamentally a PRODUCT-type listing,
 * not a service. Restricting this to SERVICE would make that flagship
 * example uncreatable, so both types are offered here. */
export async function getOfferCategoryOptions(): Promise<OfferCategoryOption[]> {
  const categories = await db.category.findMany({
    where: { type: { in: ["SERVICE", "PRODUCT"] }, isActive: true },
    orderBy: { name: "asc" },
    include: { parent: { select: { name: true } } },
  })
  return categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, type: c.type, parentName: c.parent?.name ?? null }))
}

/** Step 3's field list — real admin-managed CategoryAttribute rows for this
 * category if any exist, otherwise a small generic fallback keyed off
 * Category.type, so a category nobody has configured yet still shows
 * something sensible instead of an empty step. See the CategoryAttribute
 * doc comment in schema.prisma for why this is admin data, not a
 * hardcoded map, going forward.
 *
 * A category with no CategoryAttribute rows of its own inherits the field
 * set of its nearest ancestor that has some, before falling back to that
 * generic list. This is what lets a parent like "Web & App Development" carry
 * one authoritative field set that every child under it ("Mobile App
 * Development", "AI & Machine Learning", ...) uses, instead of the same rows
 * being duplicated per child and drifting apart the first time an admin edits
 * only one of them.
 *
 * The depth cap is not paranoia: `parentId` has no cycle constraint in the
 * database and updateCategory only rejects a category being its own direct
 * parent, so a two-node loop (A parent of B, B parent of A) is reachable
 * through the admin UI and has existed in production data. Capping the walk
 * means the worst case is falling through to the generic fields, not hanging
 * the request. */
export async function getOfferAttributeFields(categoryId: string): Promise<OfferAttributeFieldDef[]> {
  const category = await db.category.findUnique({ where: { id: categoryId } })
  if (!category) return []

  const seen = new Set<string>()
  let current: { id: string; parentId: string | null } | null = category

  for (let depth = 0; current && depth < 8; depth += 1) {
    if (seen.has(current.id)) break
    seen.add(current.id)

    const rows = await db.categoryAttribute.findMany({ where: { categoryId: current.id }, orderBy: { sortOrder: "asc" } })
    if (rows.length > 0) {
      return rows.map((r) => ({
        key: r.key, label: r.label, type: r.type.toLowerCase() as OfferAttributeFieldDef["type"],
        options: r.options.length > 0 ? r.options : undefined, placeholder: r.placeholder ?? undefined,
      }))
    }

    if (!current.parentId) break
    current = await db.category.findUnique({ where: { id: current.parentId }, select: { id: true, parentId: true } })
  }

  return category.type === "PRODUCT" ? GENERIC_PRODUCT_ATTRIBUTE_FIELDS : GENERIC_SERVICE_ATTRIBUTE_FIELDS
}

export type OfferActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ id: z.string().trim().min(1) })

export type OfferLicenseCheck = { required: false } | { required: true; licenseName: string; satisfied: boolean }

/** Mirrors checkProviderLicenseForJob's exact matching logic (see
 * lib/actions/provider-licensing.ts) — APPROVED, unexpired, name-matching
 * Certification — but scoped directly to an offer's category instead of
 * resolving through a Job. Deliberately reuses the one real
 * Certification/admin-review pipeline (see lib/actions/admin-certifications.ts)
 * rather than inventing a second per-offer verification flow, and never
 * claims a fake review-time estimate — just an honest yes/no plus what to
 * do about it. */
async function resolveOfferLicenseRequirement(categoryId: string | null, providerId: string): Promise<OfferLicenseCheck> {
  if (!categoryId) return { required: false }
  const category = await db.category.findUnique({ where: { id: categoryId } })
  if (!category?.requiresLicense) return { required: false }

  const now = new Date()
  const validCert = await db.certification.findFirst({
    where: {
      providerId,
      status: "APPROVED",
      OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
      ...(category.licenseName ? { name: { contains: category.licenseName, mode: "insensitive" as const } } : {}),
    },
  })
  return { required: true, licenseName: category.licenseName ?? "License", satisfied: Boolean(validCert) }
}

/** Wizard-facing read of the same check, so Step 8/10 can show an honest
 * "Verification Required" banner (or not) before the provider even tries
 * to publish. */
export async function checkOfferLicenseRequirement(categoryId: string): Promise<OfferLicenseCheck> {
  const providerId = await requireProviderId()
  if (!providerId) return { required: false }
  return resolveOfferLicenseRequirement(categoryId, providerId)
}

/** The "Saji applies trust/safety rules" step from the Pro pitch — real,
 * automated completeness/quality checks run synchronously here (no human
 * admin queue, per the product decision for this rollout), same
 * auto-approve spirit as Service.approvalStatus already defaulting to
 * APPROVED elsewhere in this app. Also enforces the free-tier cap: only
 * Saji Pro subscribers get unlimited concurrent LIVE offers. */
export async function publishOffer(input: unknown): Promise<OfferActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  // Progressive KYC: drafting an offer is open to every provider — solo,
  // Saji Pro and business alike. Publishing is what puts a name in front of
  // customers, so that is the step that needs a verified identity behind it.
  // Deliberately before the UNDER_REVIEW write below, so a blocked publish
  // leaves the offer a clean DRAFT rather than stranding it mid-review.
  const gate = await requireVerified("offer.publish")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const offer = await db.offer.findUnique({ where: { id: parsed.data.id } })
  if (!offer || offer.providerId !== providerId) return { success: false, error: "Offer not found." }
  if (offer.status === "LIVE") return { success: true }

  await db.offer.update({ where: { id: offer.id }, data: { status: "UNDER_REVIEW" } })

  const issues: string[] = []
  if (offer.title.trim().length < 5) issues.push("Title should be at least 5 characters.")
  if (offer.description.trim().length < 20) issues.push("Description should be at least 20 characters.")
  // QUOTE/INSPECTION pricing models are legitimately priceless by design —
  // see PRICELESS_PRICING_MODELS' doc comment — so the "needs a real price"
  // check only applies to the other four pricing models. RENT is checked
  // alongside PRICED_ACTION_TYPES here (a per-day rate is just as required
  // as a fixed price) even though it's deliberately excluded from that list
  // itself — see PRICED_OFFER_ACTION_TYPES' doc comment for why.
  if (
    (PRICED_ACTION_TYPES.includes(offer.actionType as OfferActionType) || offer.actionType === "RENT") &&
    !PRICELESS_PRICING_MODELS.includes(offer.pricingModel as OfferPricingModel) &&
    !(Number(offer.price) > 0)
  ) {
    issues.push(`${OFFER_ACTION_LABEL[offer.actionType as OfferActionType]} offers need a price greater than zero.`)
  }
  if (offer.images.length === 0) issues.push("Add at least one photo before publishing.")

  const licenseCheck = await resolveOfferLicenseRequirement(offer.categoryId, providerId)
  if (licenseCheck.required && !licenseCheck.satisfied) {
    issues.push(`This category requires a verified ${licenseCheck.licenseName}. Add it from Profile > Certifications and wait for admin approval before this offer can go live.`)
  }

  if (issues.length > 0) {
    await db.offer.update({ where: { id: offer.id }, data: { status: "DRAFT", reviewNote: issues.join(" ") } })
    return { success: false, error: issues.join(" ") }
  }

  {
    const subscription = await getMySubscriptionStatus()
    if (!subscription?.isPro) {
      const { offerFreeTierCap } = await getEffectivePlatformPreferences()
      const liveCount = await db.offer.count({ where: { providerId, status: "LIVE", NOT: { id: offer.id } } })
      if (liveCount >= offerFreeTierCap) {
        await db.offer.update({ where: { id: offer.id }, data: { status: "DRAFT", reviewNote: `Free plan is limited to ${offerFreeTierCap} live offers. Upgrade to Saji Pro for unlimited offers.` } })
        return { success: false, error: `You've reached the free plan's limit of ${offerFreeTierCap} live offers. Upgrade to Saji Pro for unlimited offers.` }
      }
    }
  }

  await db.offer.update({ where: { id: offer.id }, data: { status: "LIVE", reviewNote: null } })
  return { success: true }
}

export async function unpublishOffer(input: unknown): Promise<OfferActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const result = await db.offer.updateMany({ where: { id: parsed.data.id, providerId }, data: { status: "DRAFT" } })
  if (result.count === 0) return { success: false, error: "Offer not found." }
  return { success: true }
}

export async function deleteOffer(input: unknown): Promise<OfferActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  try {
    await db.offer.deleteMany({ where: { id: parsed.data.id, providerId } })
    return { success: true }
  } catch {
    return { success: false, error: "This offer has existing bookings and can't be deleted. Unpublish it instead." }
  }
}

// ============================= 10-STEP OFFER CREATION WIZARD =============================
// One flexible per-step save action instead of ten near-identical ones —
// every field is optional so a step only ever writes what it actually
// collected. The first call (no `id` yet) creates the DRAFT row; every call
// after bumps `wizardStep` so "Continue creating your offer" resumes at the
// right place (see getMyOfferDrafts below). This is also the entire
// autosave mechanism — there's no separate draft-saving system, each
// "Continue" tap on the wizard IS the save.

// Client-side already rejects oversized files before they're even read (see
// MAX_IMAGE_BYTES/MAX_DOCUMENT_BYTES in the wizard page), but that check is
// trivially bypassable by calling this action directly — these are the real
// enforcement point. Base64 inflates ~4/3 over the raw file size, so the
// char-length ceilings here are set a bit above the equivalent MB figures.
const MAX_IMAGE_DATA_URI_LENGTH = 7_000_000 // ~5MB original file
const MAX_DOCUMENT_DATA_URI_LENGTH = 14_000_000 // ~10MB original file

const offerDocumentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(MAX_DOCUMENT_DATA_URI_LENGTH, "That document is too large. Please keep files under 10MB."),
})

const offerStepSchema = z.object({
  id: z.string().trim().min(1).optional(),
  step: z.number().int().min(1).max(10),
  title: z.string().trim().max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  images: z.array(z.string().max(MAX_IMAGE_DATA_URI_LENGTH, "That photo is too large. Please keep images under 5MB.")).max(10).optional(),
  categoryId: z.string().trim().optional(),
  actionType: z.enum(["BOOK", "HIRE", "BUY", "QUOTE", "REQUEST", "RENT"]).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])).optional(),
  minimumOrder: z.string().trim().max(100).optional(),
  price: z.coerce.number().positive().optional(),
  pricingModel: z.enum(["FIXED", "STARTING_FROM", "PER_UNIT", "BULK", "QUOTE", "INSPECTION"]).optional(),
  unitLabel: z.string().trim().max(50).optional(),
  bulkPricingNote: z.string().trim().max(300).optional(),
  availabilityStatus: z.enum(["IN_STOCK", "ON_REQUEST", "BY_APPOINTMENT", "UNAVAILABLE"]).optional(),
  fulfilmentMethods: z.array(z.enum(["DELIVERY", "PICKUP", "PROVIDER_SITE_VISIT", "SHIPPING", "REMOTE"])).optional(),
  serviceArea: z.string().trim().max(100).optional(),
  radiusKm: z.coerce.number().int().min(0).max(500).optional(),
  depositAmount: z.coerce.number().min(0).optional(),
  includedItems: z.array(z.string().trim().min(1)).max(20).optional(),
  excludedItems: z.array(z.string().trim().min(1)).max(20).optional(),
  documents: z.array(offerDocumentSchema).max(10).optional(),
})

export type SaveOfferStepResult = { success: true; id: string } | { success: false; error: string }

export async function saveOfferStep(input: unknown): Promise<SaveOfferStepResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  // Generous enough that a real person clicking through (and back-and-forth
  // editing) all 10 steps never comes close — this is here to stop a script
  // hammering the endpoint, same rate-limit utility login already uses.
  const rateLimit = await checkRateLimit(`offer-step-save:${providerId}`, "offer-step-save", 60, 5 * 60 * 1000)
  if (!rateLimit.allowed) return { success: false, error: "Too many changes too quickly. Please wait a moment and try again." }

  const parsed = offerStepSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { id, step, images, attributes, documents, ...rest } = parsed.data

  if (!id) {
    if (!rest.description) return { success: false, error: "Describe your offer before continuing." }
    // actionType defaults to BOOK here purely as a schema placeholder — the
    // real value is chosen in Step 7 (Customer Actions) and overwrites this
    // via the same saveOfferStep call. Offer.actionType is NOT NULL because
    // every other reader of this model (marketplace, booking) already
    // assumes it's always set; loosening that for the sake of a
    // not-yet-answered wizard step would ripple everywhere else.
    const created = await db.offer.create({
      data: {
        providerId, title: rest.title ?? "", description: rest.description,
        actionType: rest.actionType ?? "BOOK", categoryId: rest.categoryId,
        images: images ?? [], status: "DRAFT", wizardStep: step,
        ...(attributes !== undefined ? { attributes: attributes as Prisma.InputJsonValue } : {}),
        ...(documents !== undefined ? { documents: documents as Prisma.InputJsonValue } : {}),
      },
    })
    return { success: true, id: created.id }
  }

  const offer = await db.offer.findUnique({ where: { id } })
  if (!offer || offer.providerId !== providerId) return { success: false, error: "Offer not found." }

  // Editing any step of a LIVE offer sends it back to DRAFT so it re-runs
  // the trust/safety check on the next publish, same rule updateOffer
  // already applies — a customer shouldn't see stale details go live from
  // an edit that never re-validated them.
  //
  // `attributes` is merged with whatever's already stored, not replaced —
  // Steps 2 and 3 both write into this same Json bag (youOffer/youServe vs.
  // the category-specific fields), and the wizard UI always resends the
  // full accumulated object anyway, but merging here server-side means a
  // partial-object caller can never silently wipe another step's answers.
  const existingAttributes = (offer.attributes as Record<string, unknown> | null) ?? {}
  await db.offer.update({
    where: { id },
    data: {
      ...rest,
      ...(images !== undefined ? { images } : {}),
      ...(attributes !== undefined ? { attributes: { ...existingAttributes, ...attributes } as Prisma.InputJsonValue } : {}),
      ...(documents !== undefined ? { documents: documents as Prisma.InputJsonValue } : {}),
      wizardStep: Math.max(offer.wizardStep, step),
      status: offer.status === "LIVE" ? "DRAFT" : offer.status,
    },
  })
  return { success: true, id }
}

export type OfferDraftDetail = {
  id: string
  wizardStep: number
  status: OfferStatus
  title: string
  description: string
  images: string[]
  categoryId: string | null
  actionType: OfferActionType
  attributes: Record<string, string | number | string[]>
  minimumOrder: string | null
  price: number | null
  pricingModel: OfferPricingModel
  unitLabel: string | null
  bulkPricingNote: string | null
  availabilityStatus: OfferAvailabilityStatus
  fulfilmentMethods: OfferFulfilmentMethod[]
  serviceArea: string | null
  radiusKm: number | null
  depositAmount: number
  includedItems: string[]
  excludedItems: string[]
  documents: OfferDocument[]
  reviewNote: string | null
} | null

/** Full read of one offer/draft, used to populate the wizard on resume or
 * edit — getMyOffers' ProviderOfferItem is a list-summary shape and
 * deliberately doesn't carry every wizard field. */
export async function getOfferDraft(id: string): Promise<OfferDraftDetail> {
  const providerId = await requireProviderId()
  if (!providerId) return null

  const offer = await db.offer.findUnique({ where: { id } })
  if (!offer || offer.providerId !== providerId) return null

  return {
    id: offer.id,
    wizardStep: offer.wizardStep,
    status: offer.status,
    title: offer.title,
    description: offer.description,
    images: offer.images,
    categoryId: offer.categoryId,
    actionType: offer.actionType as OfferActionType,
    attributes: (offer.attributes as Record<string, string | number | string[]>) ?? {},
    minimumOrder: offer.minimumOrder,
    price: offer.price != null ? Number(offer.price) : null,
    pricingModel: offer.pricingModel as OfferPricingModel,
    unitLabel: offer.unitLabel,
    bulkPricingNote: offer.bulkPricingNote,
    availabilityStatus: offer.availabilityStatus as OfferAvailabilityStatus,
    fulfilmentMethods: offer.fulfilmentMethods as OfferFulfilmentMethod[],
    serviceArea: offer.serviceArea,
    radiusKm: offer.radiusKm,
    depositAmount: Number(offer.depositAmount),
    includedItems: offer.includedItems,
    excludedItems: offer.excludedItems,
    documents: (offer.documents as OfferDocument[] | null) ?? [],
    reviewNote: offer.reviewNote,
  }
}

export type OfferDraftSummary = { id: string; title: string; wizardStep: number; updatedAt: string }

/** Powers "Continue creating your offer" on the My Offers page — every
 * DRAFT offer, including ones bounced back to DRAFT by a failed
 * publishOffer() trust/safety check, since those genuinely still need more
 * work too. */
export async function getMyOfferDrafts(): Promise<OfferDraftSummary[]> {
  const providerId = await requireProviderId()
  if (!providerId) return []

  const drafts = await db.offer.findMany({ where: { providerId, status: "DRAFT" }, orderBy: { updatedAt: "desc" } })
  return drafts.map((o) => ({ id: o.id, title: o.title || "Untitled offer", wizardStep: o.wizardStep, updatedAt: o.updatedAt.toISOString() }))
}

/** Step 2 ("SAJI Understands") — turns the Step 1 free-text description
 * into structured suggestions the provider then confirms/edits, using the
 * real category list so a suggested category can never be one that doesn't
 * exist. See lib/ai/offer-extraction.ts for the honest configured/
 * simulated/failed distinction; this wrapper just adds auth + the real
 * category list. */
export async function extractOfferFromDescription(description: string): Promise<OfferExtractionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { simulated: false, data: null }
  const categories = await getOfferCategoryOptions()
  return extractOfferDetails(description, categories.map((c) => c.name))
}

/** Wizard-facing copy assistance — a sharper title, a first-draft description
 *  and tags, for the provider to accept or ignore. Never auto-applied: the
 *  wizard shows the suggestion beside what they wrote. */
export async function suggestOfferCopy(input: {
  title?: string
  description?: string
  categoryId?: string
  youOffer?: string[]
}): Promise<OfferEnhancementResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { simulated: false, data: null }

  const category = input.categoryId
    ? await db.category.findUnique({ where: { id: input.categoryId }, select: { name: true } })
    : null

  return enhanceOfferCopy({
    title: String(input.title ?? "").trim(),
    description: String(input.description ?? "").trim(),
    categoryName: category?.name ?? null,
    youOffer: Array.isArray(input.youOffer) ? input.youOffer.filter(Boolean) : [],
  })
}

/** What comparable live offers in this category actually charge. Real rows,
 *  not a model estimate — withheld entirely when there are too few to be
 *  meaningful. */
export async function getOfferPriceBand(categoryId: string): Promise<PriceBand> {
  const providerId = await requireProviderId()
  if (!providerId) return { available: false, reason: "too_few_comparables", comparables: 0 }
  return getCategoryPriceBand(categoryId)
}

/** How many customers are currently asking for this category, against how many
 *  providers already list in it. */
/** Which photos to take for this category. Guidance only — SAJI never
 *  supplies or generates listing imagery, because a customer reads every
 *  photo on a listing as the provider's own work. */
export async function getOfferImageGuidance(categoryId: string): Promise<ImageGuidance> {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    select: { slug: true, type: true, parent: { select: { slug: true } } },
  })
  if (!category) return getImageGuidance(null, null, "SERVICE")
  return getImageGuidance(category.slug, category.parent?.slug ?? null, category.type)
}

export async function getOfferDemandSignal(categoryId: string): Promise<DemandSignal> {
  const providerId = await requireProviderId()
  if (!providerId) return { openRequests: 0, liveOffers: 0, requestsPerOffer: null }
  return getCategoryDemandSignal(categoryId)
}

// ============================= CUSTOMER-FACING =============================

export type PublicOfferListItem = {
  offerId: string
  title: string
  image: string | null
  providerId: string
  providerName: string
  providerAvatar: string | null
  categoryId: string | null
  categoryName: string | null
  categorySlug: string | null
  actionType: OfferActionType
  price: number | null
  depositAmount: number
  pricingModel: OfferPricingModel
  unitLabel: string | null
  rating: number
  reviewCount: number
  location: string
  verified: boolean
  createdAt: string
}

/** Powers the "mixed into existing service search" browse surfaces —
 * app/customer/services/more and the unified search results — each LIVE
 * Offer is interleaved with regular Services there, distinguished by a
 * "Saji Pro" badge rather than living in its own separate marketplace. */
/**
 * `limit` is optional and unbounded by default, because the browse-all page
 * (app/customer/services/more) genuinely wants the whole catalogue. The home
 * feed passes one: offer images are stored inline as base64 data URLs, so an
 * unbounded list grows the response by megabytes as offers are published,
 * and the home screen only ever renders the first handful anyway.
 */
export async function getLiveOffers(limit?: number): Promise<PublicOfferListItem[]> {
  const offers = await db.offer.findMany({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
    ...(limit != null ? { take: limit } : {}),
    include: { provider: { include: { user: true } }, category: true },
  })

  return offers.map((o) => ({
    offerId: o.id,
    title: o.title,
    image: o.images[0] ?? null,
    providerId: o.providerId,
    providerName: o.provider.user.name,
    providerAvatar: o.provider.user.image,
    categoryId: o.categoryId,
    categoryName: o.category?.name ?? null,
    categorySlug: o.category?.slug ?? null,
    actionType: o.actionType as OfferActionType,
    price: o.price != null ? Number(o.price) : null,
    depositAmount: Number(o.depositAmount),
    pricingModel: o.pricingModel as OfferPricingModel,
    unitLabel: o.unitLabel,
    rating: Number(o.provider.rating),
    reviewCount: o.provider.reviewCount,
    // Per-offer serviceArea override wins when the provider set one;
    // otherwise falls back to their profile default, same as before.
    location: o.serviceArea || o.provider.workAreas[0] || "Nairobi",
    verified: o.provider.verified,
    createdAt: o.createdAt.toISOString(),
  }))
}

export type OfferDetail = {
  offerId: string
  title: string
  description: string
  images: string[]
  providerId: string
  providerUserId: string
  providerName: string
  providerAvatar: string | null
  providerRating: number
  providerReviewCount: number
  categoryId: string | null
  categoryName: string | null
  actionType: OfferActionType
  price: number | null
  depositAmount: number
  currency: string
  location: string
  radiusKm: number | null
} | null

/** Bumps the offer's real view counter — no invented numbers, this is a
 * genuine per-open count. */
export async function getOfferDetail(offerId: string): Promise<OfferDetail> {
  const offer = await db.offer.findFirst({
    where: { id: offerId, status: "LIVE" },
    include: { provider: { include: { user: true, availability: true } }, category: true },
  })
  if (!offer) return null

  await db.offer.update({ where: { id: offerId }, data: { viewCount: { increment: 1 } } }).catch(() => {})

  return {
    offerId: offer.id,
    title: offer.title,
    description: offer.description,
    images: offer.images,
    providerId: offer.providerId,
    providerUserId: offer.provider.userId,
    providerName: offer.provider.user.name,
    providerAvatar: offer.provider.user.image,
    providerRating: Number(offer.provider.rating),
    providerReviewCount: offer.provider.reviewCount,
    categoryId: offer.categoryId,
    categoryName: offer.category?.name ?? null,
    actionType: offer.actionType as OfferActionType,
    price: offer.price != null ? Number(offer.price) : null,
    depositAmount: Number(offer.depositAmount),
    currency: offer.currency,
    location: offer.serviceArea || offer.provider.workAreas[0] || "Nairobi",
    radiusKm: offer.radiusKm ?? offer.provider.availability?.travelRadiusKm ?? null,
  }
}

export type OfferForBooking = {
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

/** Same shape as getServiceForBooking() in lib/actions/services.ts so
 * app/customer/booking/booking-content.tsx can drive its existing wizard
 * from either a Service or an Offer without branching field names. */
export async function getOfferForBooking(offerId: string): Promise<OfferForBooking> {
  const offer = await db.offer.findFirst({
    where: { id: offerId, status: "LIVE" },
    include: { provider: { include: { user: true } } },
  })
  if (!offer || !PRICED_ACTION_TYPES.includes(offer.actionType as OfferActionType) || offer.price == null) return null

  return {
    serviceId: offer.id,
    title: offer.title,
    description: offer.description,
    basePrice: Number(offer.price),
    currency: offer.currency,
    providerId: offer.providerId,
    providerName: offer.provider.user.name,
    providerAvatar: offer.provider.user.image,
    providerRating: Number(offer.provider.rating),
    providerReviewCount: offer.provider.reviewCount,
  }
}

const createOfferBookingSchema = z.object({
  offerId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  quantity: z.number().int().min(1).max(24),
  location: z.string().trim().min(1, "Location is required"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().trim().optional(),
})

export type CreateOfferBookingResult = { success: true; jobId: string; amount: number } | { success: false; error: string }

/** The Offer counterpart to createBooking() in lib/actions/jobs.ts — same
 * PENDING_PAYMENT Job pipeline (payments, disputes, reviews all just work
 * unchanged), only the source listing differs. Covers the Book/Hire/Buy
 * action types; Quote/Request never reach here. */
export async function createOfferBooking(input: unknown): Promise<CreateOfferBookingResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer to continue." }
  }

  // Progressive KYC: same commitment as a service booking — a provider's
  // time is reserved and money moves — so the same gate applies.
  const gate = await requireVerified("booking.create")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = createOfferBookingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  const offer = await db.offer.findUnique({ where: { id: data.offerId }, include: { provider: { include: { availability: true } } } })
  if (!offer || offer.status !== "LIVE" || !PRICED_ACTION_TYPES.includes(offer.actionType as OfferActionType) || offer.price == null) {
    return { success: false, error: "This offer is no longer available." }
  }
  if (offer.provider?.availability?.isOnVacation) {
    return { success: false, error: "This provider is currently unavailable for new bookings." }
  }
  // Only BUY offers with tracked stock (stockQuantity set) are checked here —
  // null means not tracked, same as every offer before this field existed.
  // The real, race-safe decrement happens once payment actually clears (see
  // confirmJobPayment in lib/actions/payments.ts); this is just an early,
  // friendly rejection so a customer isn't sent to checkout for something
  // that's already visibly out of stock.
  if (offer.actionType === "BUY" && offer.stockQuantity != null && offer.stockQuantity < data.quantity) {
    return {
      success: false,
      error: offer.stockQuantity === 0 ? "This product is out of stock." : `Only ${offer.stockQuantity} left in stock.`,
    }
  }

  const isBlocked = await db.blockedClient.findUnique({
    where: { providerId_customerId: { providerId: offer.providerId, customerId: session.user.id } },
  })
  if (isBlocked) return { success: false, error: "This provider isn't accepting bookings from you." }

  const scheduledDate = new Date(`${data.date}T${data.time}:00`)
  if (Number.isNaN(scheduledDate.getTime())) return { success: false, error: "Invalid date or time." }

  const amount = Number(offer.price) * data.quantity

  const job = await db.job.create({
    data: {
      customerId: session.user.id,
      providerId: offer.providerId,
      offerId: offer.id,
      title: offer.title,
      description: data.notes || offer.description,
      price: amount,
      currency: offer.currency,
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude,
      scheduledDate,
      status: "PENDING_PAYMENT",
      quantity: data.quantity,
    },
  })

  await db.offer.update({ where: { id: offer.id }, data: { bookingCount: { increment: 1 } } })

  await logJobEvent({
    jobId: job.id, type: "JOB_CREATED", actor: "CUSTOMER", actorUserId: session.user.id,
    description: `Customer booked the offer "${offer.title}"`,
  })

  return { success: true, jobId: job.id, amount }
}

const requestOfferSchema = z.object({
  offerId: z.string().trim().min(1),
  message: z.string().trim().min(1, "Write a short message for the provider").max(2000),
})

export type RequestOfferResult = { success: true; conversationId: string } | { success: false; error: string }

/** The REQUEST action type's real behavior — instead of a formal Job, this
 * opens (or reuses) a real conversation with the provider and drops in the
 * customer's message, reusing the same messaging infrastructure the
 * Request Board's "accept a response" flow already relies on. QUOTE-type
 * offers now use requestOfferFormalQuote below instead (a real structured
 * quote, not a chat message) — this function stays generic/callable for
 * either action type since nothing about the mechanics actually requires
 * that split, but the customer-facing offer detail page only calls it for
 * REQUEST. */
export async function requestOfferQuote(input: unknown): Promise<RequestOfferResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer to continue." }
  }

  // Progressive KYC: opens a real conversation with the provider, so it
  // is gated like any other approach to a provider.
  const gate = await requireVerified("service.request")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = requestOfferSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const offer = await db.offer.findFirst({ where: { id: parsed.data.offerId, status: "LIVE" }, include: { provider: true } })
  if (!offer) return { success: false, error: "This offer is no longer available." }

  const conversation = await getOrCreateConversation({ otherUserId: offer.provider.userId })
  if (!conversation.success) return { success: false, error: conversation.error }

  const label = offer.actionType === "QUOTE" ? "quote" : "request"
  const sent = await sendMessage({
    conversationId: conversation.conversationId,
    type: "TEXT",
    content: `Regarding your offer "${offer.title}": ${parsed.data.message}`,
  })
  if (!sent.success) return { success: false, error: `Couldn't send your ${label}. Please try again.` }

  await db.offer.update({ where: { id: offer.id }, data: { requestCount: { increment: 1 } } })

  return { success: true, conversationId: conversation.conversationId }
}

const requestFormalQuoteSchema = z.object({
  offerId: z.string().trim().min(1),
  description: z.string().trim().min(1, "Describe what you need").max(2000),
  location: z.string().trim().min(1, "Location is required"),
})

export type RequestFormalQuoteResult = { success: true; contractId: string } | { success: false; error: string }

/** QUOTE-type offers deserve a real formal quote — price, scope of work, an
 * estimated timeline the customer can actually accept or decline — not
 * just a chat message with no structure. Reuses the real Quote & Contract
 * Layer (createServiceRequest -> ServiceContract) instead of inventing a
 * second negotiation flow: this just seeds a ServiceContract from the
 * offer's own provider/category/title, exactly as if the customer had
 * started that request from the provider's profile directly. */
export async function requestOfferFormalQuote(input: unknown): Promise<RequestFormalQuoteResult> {
  const parsed = requestFormalQuoteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const offer = await db.offer.findFirst({ where: { id: parsed.data.offerId, status: "LIVE" } })
  if (!offer) return { success: false, error: "This offer is no longer available." }
  if (offer.actionType !== "QUOTE") return { success: false, error: "This offer doesn't take quote requests." }

  const result = await createServiceRequest({
    providerId: offer.providerId,
    categoryId: offer.categoryId ?? undefined,
    title: offer.title,
    description: parsed.data.description,
    location: parsed.data.location,
  })
  if (!result.success) return result

  await db.offer.update({ where: { id: offer.id }, data: { requestCount: { increment: 1 } } })
  return { success: true, contractId: result.contractId }
}
