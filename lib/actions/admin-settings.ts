"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type PlatformPreferences = {
  platformFee: number
  autoApprove: boolean
  requireVerification: boolean
  enableDisputeResolution: boolean
  maintenanceMode: boolean
  // Gap 6: flat fee (KES) charged to a customer — and paid to the provider
  // — for a late cancellation (<2h before the scheduled time) or a
  // reported no-show. See lib/job-cancellation.ts.
  cancellationDispatchFee: number
  // Gap 3: the coverage figure shown in the "Saji Protection" trust
  // messaging (see components/saji-protection-banner.tsx) — a stated
  // policy tying protection to in-app payment, not a real insurance-claims
  // integration (there's no underwriting partner wired up), same honest
  // scope as every other unconfigured third-party integration in this app.
  protectionCoverageLimit: number
  // Monthly price (KES) for a provider's "Saji Pro" subscription — see
  // lib/actions/provider-subscription.ts. Admin-adjustable so this isn't a
  // hardcoded constant; changing it only affects future renewals, never
  // retroactively charges an already-active subscriber more.
  providerProPriceKES: number
  // How many live Offers a non-Pro provider may have at once — see
  // lib/actions/offers.ts. Saji Pro subscribers are exempt from this cap
  // entirely ("unlimited" per the Pro pitch); this only bounds the free tier.
  offerFreeTierCap: number
}

const DEFAULT_PREFERENCES: PlatformPreferences = {
  platformFee: 5, autoApprove: true, requireVerification: true, enableDisputeResolution: true, maintenanceMode: false,
  cancellationDispatchFee: 300,
  protectionCoverageLimit: 100000,
  providerProPriceKES: 1500,
  offerFreeTierCap: 3,
}

export async function getPlatformPreferences(): Promise<PlatformPreferences> {
  const admin = await requireAdmin()
  if (!admin) return DEFAULT_PREFERENCES

  return getEffectivePlatformPreferences()
}

/** Unlike `getPlatformPreferences`, this has no admin gate — it's the real
 * value other roles' actions (provider/customer flows) need to check to
 * actually enforce a toggle, not just display it in the admin settings UI. */
export async function getEffectivePlatformPreferences(): Promise<PlatformPreferences> {
  const setting = await db.platformSetting.findUnique({ where: { key: "general" } })
  const stored = setting?.value as Partial<PlatformPreferences> | undefined
  return { ...DEFAULT_PREFERENCES, ...stored }
}

// Read on every non-admin page navigation (see middleware.ts) — a raw DB hit
// there on every request would be a real latency risk given this project's
// documented Supabase pooler spikes, so this is cached in-process for a few
// seconds. updatePlatformPreferences() below busts it immediately on save so
// toggling maintenance mode on/off doesn't wait out the full TTL.
let maintenanceCache: { value: boolean; expiresAt: number } | null = null
const MAINTENANCE_CACHE_TTL_MS = 5000

export async function isMaintenanceModeActive(): Promise<boolean> {
  const now = Date.now()
  if (maintenanceCache && maintenanceCache.expiresAt > now) return maintenanceCache.value

  const setting = await db.platformSetting.findUnique({ where: { key: "general" } })
  const stored = setting?.value as Partial<PlatformPreferences> | undefined
  const value = stored?.maintenanceMode ?? DEFAULT_PREFERENCES.maintenanceMode
  maintenanceCache = { value, expiresAt: now + MAINTENANCE_CACHE_TTL_MS }
  return value
}

export type AdminSettingsActionResult = { success: true } | { success: false; error: string }

const preferencesSchema = z.object({
  platformFee: z.number().min(1).max(20),
  autoApprove: z.boolean(),
  requireVerification: z.boolean(),
  enableDisputeResolution: z.boolean(),
  maintenanceMode: z.boolean(),
  cancellationDispatchFee: z.number().min(0).max(10000),
  protectionCoverageLimit: z.number().min(0).max(10000000),
  providerProPriceKES: z.number().min(0).max(1000000),
  offerFreeTierCap: z.number().min(0).max(1000),
})

export async function updatePlatformPreferences(input: unknown): Promise<AdminSettingsActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = preferencesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.platformSetting.findUnique({ where: { key: "general" } })

  await db.platformSetting.upsert({
    where: { key: "general" },
    update: { value: parsed.data, updatedById: admin.userId },
    create: { key: "general", value: parsed.data, updatedById: admin.userId },
  })
  maintenanceCache = { value: parsed.data.maintenanceMode, expiresAt: Date.now() + MAINTENANCE_CACHE_TTL_MS }

  await logAdminAction({
    userId: admin.userId,
    action: "platform_settings.update",
    entityType: "PlatformSetting",
    entityId: "general",
    oldValues: existing?.value as Record<string, unknown> | undefined,
    newValues: parsed.data,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// Branding — logo shown on the public landing page, footer, and auth screens.
// Stored as a data: URL (same convention as every other photo upload in this
// app, e.g. shop logos / KYC documents) rather than pulling in object storage.
// ---------------------------------------------------------------------------

export type BrandingSettings = { logoUrl: string | null }
const DEFAULT_BRANDING: BrandingSettings = { logoUrl: null }

export async function getBrandingSettings(): Promise<BrandingSettings> {
  const admin = await requireAdmin()
  if (!admin) return DEFAULT_BRANDING
  const setting = await db.platformSetting.findUnique({ where: { key: "branding" } })
  return { ...DEFAULT_BRANDING, ...(setting?.value as Partial<BrandingSettings> | undefined) }
}

const brandingSchema = z.object({
  logoUrl: z.string().max(2_000_000, "Logo image is too large. Please use a smaller file.").nullable(),
})

export async function updateBrandingSettings(input: unknown): Promise<AdminSettingsActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = brandingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.platformSetting.findUnique({ where: { key: "branding" } })

  await db.platformSetting.upsert({
    where: { key: "branding" },
    update: { value: parsed.data, updatedById: admin.userId },
    create: { key: "branding", value: parsed.data, updatedById: admin.userId },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "platform_settings.update_branding",
    entityType: "PlatformSetting",
    entityId: "branding",
    oldValues: existing?.value as Record<string, unknown> | undefined,
    newValues: { logoUrl: parsed.data.logoUrl ? "(updated)" : null },
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// Contact information — shown in the footer and on the Terms/Privacy pages.
// ---------------------------------------------------------------------------

export type ContactSettings = {
  supportEmail: string
  supportPhone: string
  address: string
  facebookUrl: string
  twitterUrl: string
  instagramUrl: string
  linkedinUrl: string
}

const DEFAULT_CONTACT: ContactSettings = {
  supportEmail: "support@saji.app",
  supportPhone: "+254 700 000 000",
  address: "Nairobi, Kenya",
  facebookUrl: "",
  twitterUrl: "",
  instagramUrl: "",
  linkedinUrl: "",
}

export async function getContactSettings(): Promise<ContactSettings> {
  const admin = await requireAdmin()
  if (!admin) return DEFAULT_CONTACT
  const setting = await db.platformSetting.findUnique({ where: { key: "contact" } })
  return { ...DEFAULT_CONTACT, ...(setting?.value as Partial<ContactSettings> | undefined) }
}

const optionalUrl = z.union([z.literal(""), z.string().url("Must be a valid URL")])

const contactSchema = z.object({
  supportEmail: z.string().email("Must be a valid email address"),
  supportPhone: z.string().min(1, "Support phone is required").max(40),
  address: z.string().min(1, "Address is required").max(200),
  facebookUrl: optionalUrl,
  twitterUrl: optionalUrl,
  instagramUrl: optionalUrl,
  linkedinUrl: optionalUrl,
})

export async function updateContactSettings(input: unknown): Promise<AdminSettingsActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = contactSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.platformSetting.findUnique({ where: { key: "contact" } })

  await db.platformSetting.upsert({
    where: { key: "contact" },
    update: { value: parsed.data, updatedById: admin.userId },
    create: { key: "contact", value: parsed.data, updatedById: admin.userId },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "platform_settings.update_contact",
    entityType: "PlatformSetting",
    entityId: "contact",
    oldValues: existing?.value as Record<string, unknown> | undefined,
    newValues: parsed.data,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// Legal content — Terms of Service / Privacy Policy body text. Empty string
// means "not customized yet" — the public pages fall back to the built-in
// default template rather than showing a blank page.
// ---------------------------------------------------------------------------

export type LegalContent = { termsContent: string; privacyContent: string }
const DEFAULT_LEGAL: LegalContent = { termsContent: "", privacyContent: "" }

export async function getLegalContent(): Promise<LegalContent> {
  const admin = await requireAdmin()
  if (!admin) return DEFAULT_LEGAL
  const setting = await db.platformSetting.findUnique({ where: { key: "legal" } })
  return { ...DEFAULT_LEGAL, ...(setting?.value as Partial<LegalContent> | undefined) }
}

const legalSchema = z.object({
  termsContent: z.string().max(50_000, "Terms content is too long"),
  privacyContent: z.string().max(50_000, "Privacy content is too long"),
})

export async function updateLegalContent(input: unknown): Promise<AdminSettingsActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = legalSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.platformSetting.findUnique({ where: { key: "legal" } })

  await db.platformSetting.upsert({
    where: { key: "legal" },
    update: { value: parsed.data, updatedById: admin.userId },
    create: { key: "legal", value: parsed.data, updatedById: admin.userId },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "platform_settings.update_legal",
    entityType: "PlatformSetting",
    entityId: "legal",
    oldValues: existing?.value ? { changed: true } : undefined,
    newValues: { changed: true },
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// Public reads — no admin gate. Used by the landing page, footer, auth
// screens, and the Terms/Privacy pages to render whatever the admin has
// actually configured, with honest fallbacks to the built-in defaults.
// ---------------------------------------------------------------------------

export type PublicSiteSettings = {
  logoUrl: string | null
  supportEmail: string
  supportPhone: string
  address: string
  socialLinks: { facebook: string; twitter: string; instagram: string; linkedin: string }
}

export async function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  // Branding/contact info is cosmetic — used on the login screen among other
  // public pages, so a transient DB hiccup here must never be allowed to
  // take down authentication. Falling back to defaults on a thrown error
  // (not just a missing row) keeps this call non-fatal.
  const [brandingRow, contactRow] = await Promise.all([
    db.platformSetting.findUnique({ where: { key: "branding" } }).catch(() => null),
    db.platformSetting.findUnique({ where: { key: "contact" } }).catch(() => null),
  ])
  const branding = { ...DEFAULT_BRANDING, ...(brandingRow?.value as Partial<BrandingSettings> | undefined) }
  const contact = { ...DEFAULT_CONTACT, ...(contactRow?.value as Partial<ContactSettings> | undefined) }

  return {
    logoUrl: branding.logoUrl,
    supportEmail: contact.supportEmail,
    supportPhone: contact.supportPhone,
    address: contact.address,
    socialLinks: {
      facebook: contact.facebookUrl,
      twitter: contact.twitterUrl,
      instagram: contact.instagramUrl,
      linkedin: contact.linkedinUrl,
    },
  }
}

export async function getPublicLegalContent(): Promise<LegalContent & { updatedAt: Date | null }> {
  const setting = await db.platformSetting.findUnique({ where: { key: "legal" } })
  return {
    ...DEFAULT_LEGAL,
    ...(setting?.value as Partial<LegalContent> | undefined),
    updatedAt: setting?.updatedAt ?? null,
  }
}
