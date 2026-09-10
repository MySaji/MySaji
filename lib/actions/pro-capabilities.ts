"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { logAdminAction } from "@/lib/actions/admin-dashboard"
import { pushToUser } from "@/lib/actions/push"
import { buildProviderSlug } from "@/lib/provider-slug"
import {
  DEFAULT_MODULES_BY_TYPE,
  PRO_BUSINESS_TYPES,
  PRO_BUSINESS_TYPE_META,
  PRO_MODULES,
  resolveModuleKeys,
  resolveWorkSlot,
  type ProBusinessType,
} from "@/lib/pro-modules"

/**
 * Saji Pro business types — reading an account's own set, requesting more,
 * and the staff side that reviews those requests.
 *
 * Deliberately does not touch `User.role`, `kycStatus` or `verificationStatus`.
 * A Saji Pro account is `role: PROVIDER` before and after any of this; these
 * rows describe what the account *does*, and the portal reads them to decide
 * which of its existing pages to show. Approving PRODUCTS is the one case
 * that creates something — a ShopkeeperProfile — because the merchant pages
 * are backed by that profile and would have nothing to render without it.
 */

const businessTypeSchema = z.enum(["SERVICES", "PRODUCTS", "RENTALS", "FREELANCE", "TUTORING", "CONSULTING"])

// ---------------------------------------------------------------------------
// Pro side
// ---------------------------------------------------------------------------

export type MyProCapability = {
  id: string
  type: ProBusinessType
  status: "ACTIVE" | "PENDING" | "REJECTED"
  note: string | null
  reviewNote: string | null
  requestedAt: string
  reviewedAt: string | null
}

export type MyProCapabilities = {
  /** Business types this account is live with. */
  active: ProBusinessType[]
  /** Requested, waiting on admin/sub-admin/agent. */
  pending: ProBusinessType[]
  /** Turned down; can be asked for again. */
  rejected: ProBusinessType[]
  /** Every row, for the manage page's history list. */
  rows: MyProCapability[]
  /** Module keys the portal should show, defaults merged with admin overrides. */
  moduleKeys: string[]
  /** What the bottom nav's Work slot says and points at. */
  workSlot: { label: string; href: string }
  /** True once at least one business type is recorded (i.e. post-migration). */
  hasAnyType: boolean
}

/** Flat "TYPE:moduleKey" -> enabled map of every admin override on record. */
async function loadModuleOverrides(): Promise<Record<string, boolean>> {
  const rows = await db.proModuleSetting.findMany()
  const map: Record<string, boolean> = {}
  for (const row of rows) map[`${row.businessType}:${row.moduleKey}`] = row.enabled
  return map
}

const EMPTY_CAPABILITIES: MyProCapabilities = {
  active: [],
  pending: [],
  rejected: [],
  rows: [],
  moduleKeys: [],
  workSlot: { label: "Work", href: "/provider/jobs" },
  hasAnyType: false,
}

export async function getMyProCapabilities(): Promise<MyProCapabilities> {
  const session = await auth()
  if (!session?.user?.id) return EMPTY_CAPABILITIES

  const [rows, overrides, shop, sellingOffers] = await Promise.all([
    db.proCapability.findMany({
      where: { userId: session.user.id },
      orderBy: { requestedAt: "asc" },
    }),
    loadModuleOverrides(),
    // Neither of these is about access — they exist purely so an account that
    // was already selling before business types existed keeps its selling
    // pages in the nav. See below.
    db.shopkeeperProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } }),
    db.offer.count({ where: { provider: { userId: session.user.id }, actionType: "BUY" } }),
  ])

  const active = rows.filter((r) => r.status === "ACTIVE").map((r) => r.type as ProBusinessType)
  const pending = rows.filter((r) => r.status === "PENDING").map((r) => r.type as ProBusinessType)
  const rejected = rows.filter((r) => r.status === "REJECTED").map((r) => r.type as ProBusinessType)

  // What the portal should actually render for, which is not always the same
  // as what is on record:
  //
  //  - Every Saji Pro account that predates business types has no rows at
  //    all. Treating that as SERVICES keeps their portal exactly as it was
  //    rather than emptying their sidebar down to the core six.
  //  - An account that already owns a ShopkeeperProfile keeps the full set of
  //    merchant pages whether or not a PRODUCTS row was ever written. The
  //    merge that put those pages in this portal predates this feature, and
  //    silently taking a working shop out of somebody's nav is not a
  //    migration, it is a regression.
  const effective: ProBusinessType[] = active.length > 0 ? [...active] : ["SERVICES"]
  if (shop && !effective.includes("PRODUCTS")) effective.push("PRODUCTS")

  let moduleKeys = resolveModuleKeys(effective, overrides)

  //  - A provider with no shop but with live BUY offers is a narrower case:
  //    they were already selling, so they keep the two pages that answer for
  //    that — My Shop (where a provider's BUY offers are managed) and Sales —
  //    but not the rest of the merchant set, which is backed by a
  //    ShopkeeperProfile they do not have and would render empty. Adding
  //    PRODUCTS wholesale here would hand them five pages they never had.
  if (!shop && sellingOffers > 0) {
    const keep = new Set([...moduleKeys, "shop", "sales"])
    moduleKeys = PRO_MODULES.filter((m) => keep.has(m.key)).map((m) => m.key)
  }

  return {
    active,
    pending,
    rejected,
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type as ProBusinessType,
      status: r.status as "ACTIVE" | "PENDING" | "REJECTED",
      note: r.note,
      reviewNote: r.reviewNote,
      requestedAt: r.requestedAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
    moduleKeys,
    workSlot: resolveWorkSlot(effective),
    hasAnyType: active.length > 0,
  }
}

export type RequestCapabilityResult = { success: true } | { success: false; error: string }

const requestSchema = z.object({
  type: businessTypeSchema,
  note: z.string().trim().max(500).optional(),
})

/**
 * Ask staff to add a business type to this account. Never grants it — the row
 * lands PENDING and an admin, sub-admin or agent decides. Re-requesting after
 * a rejection reuses the same row (the @@unique([userId, type]) pair) and
 * clears the old verdict, so the queue shows one live request per pair rather
 * than a pile of duplicates.
 */
export async function requestProCapability(input: unknown): Promise<RequestCapabilityResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") {
    return { success: false, error: "Only a Saji Pro account can add business types." }
  }

  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { type, note } = parsed.data

  try {
    const existing = await db.proCapability.findUnique({
      where: { userId_type: { userId: session.user.id, type } },
    })
    if (existing?.status === "ACTIVE") {
      return { success: false, error: `${PRO_BUSINESS_TYPE_META[type].label} is already on your account.` }
    }
    if (existing?.status === "PENDING") {
      return { success: false, error: "That request is already with our team." }
    }

    await db.proCapability.upsert({
      where: { userId_type: { userId: session.user.id, type } },
      create: { userId: session.user.id, type, status: "PENDING", note: note || null },
      update: {
        status: "PENDING",
        note: note || null,
        reviewNote: null,
        reviewedAt: null,
        reviewedById: null,
        requestedAt: new Date(),
      },
    })

    await db.notification.create({
      data: {
        userId: session.user.id,
        title: "Request sent",
        message: `Your request to add "${PRO_BUSINESS_TYPE_META[type].label}" is with our team. We'll let you know as soon as it's reviewed.`,
        type: "SYSTEM",
        actionUrl: "/provider/business-types",
      },
    })

    return { success: true }
  } catch {
    return { success: false, error: "Could not send that request. Please try again." }
  }
}

/** Withdraw a request that hasn't been reviewed yet. */
export async function cancelProCapabilityRequest(input: unknown): Promise<RequestCapabilityResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = z.object({ type: businessTypeSchema }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const row = await db.proCapability.findUnique({
    where: { userId_type: { userId: session.user.id, type: parsed.data.type } },
  })
  if (!row) return { success: false, error: "Request not found." }
  if (row.status !== "PENDING") return { success: false, error: "That request has already been reviewed." }

  await db.proCapability.delete({ where: { id: row.id } })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

/** Same three roles that already review shop-upgrade requests. */
async function requireCapabilityReviewer(): Promise<{ userId: string; name: string } | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (!["admin", "sub-admin", "agent"].includes(session.user.role)) return null
  return { userId: session.user.id, name: session.user.name ?? "Staff" }
}

/** The module matrix is a platform-wide setting, so admin only. */
async function requireModuleAdmin(): Promise<{ userId: string } | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (!["admin", "sub-admin"].includes(session.user.role)) return null
  return { userId: session.user.id }
}

export type ProCapabilityRequest = {
  id: string
  userId: string
  userName: string
  email: string
  phone: string | null
  type: ProBusinessType
  typeLabel: string
  status: "ACTIVE" | "PENDING" | "REJECTED"
  note: string | null
  reviewNote: string | null
  requestedAt: string
  reviewedAt: string | null
  reviewedByName: string | null
  /** Business types already live on the account, for context in the queue. */
  currentTypes: ProBusinessType[]
}

export async function getProCapabilityRequests(): Promise<ProCapabilityRequest[]> {
  const reviewer = await requireCapabilityReviewer()
  if (!reviewer) return []

  const rows = await db.proCapability.findMany({
    where: { status: { in: ["PENDING", "REJECTED"] } },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 200,
    include: {
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          proCapabilities: { where: { status: "ACTIVE" }, select: { type: true } },
        },
      },
      reviewedBy: { select: { name: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    email: r.user.email,
    phone: r.user.phone,
    type: r.type as ProBusinessType,
    typeLabel: PRO_BUSINESS_TYPE_META[r.type as ProBusinessType].label,
    status: r.status as "ACTIVE" | "PENDING" | "REJECTED",
    note: r.note,
    reviewNote: r.reviewNote,
    requestedAt: r.requestedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedByName: r.reviewedBy?.name ?? null,
    currentTypes: r.user.proCapabilities.map((c) => c.type as ProBusinessType),
  }))
}

export type ReviewCapabilityResult = { success: true } | { success: false; error: string }

const reviewSchema = z.object({
  id: z.string().trim().min(1),
  approve: z.boolean(),
  reviewNote: z.string().trim().max(500).optional(),
})

/**
 * Approve or turn down one request.
 *
 * Approving PRODUCTS also creates the ShopkeeperProfile the merchant pages
 * read from, and approving anything at all makes sure a ProviderProfile
 * exists — the Saji Pro portal is mounted on that profile. Both are creates
 * with the same defaults registerUser() uses, and neither touches `role`, so
 * the account stays exactly where it was and simply gains the pages.
 */
export async function reviewProCapabilityRequest(input: unknown): Promise<ReviewCapabilityResult> {
  const reviewer = await requireCapabilityReviewer()
  if (!reviewer) return { success: false, error: "You must be signed in as Admin, Sub-Admin, or Agent." }

  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { id, approve, reviewNote } = parsed.data

  const row = await db.proCapability.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, providerProfile: { select: { id: true } }, shopkeeperProfile: { select: { id: true } } } } },
  })
  if (!row) return { success: false, error: "Request not found." }
  if (row.status !== "PENDING") return { success: false, error: "This request has already been reviewed." }

  const type = row.type as ProBusinessType
  const label = PRO_BUSINESS_TYPE_META[type].label

  try {
    await db.$transaction(
      async (tx) => {
        await tx.proCapability.update({
          where: { id: row.id },
          data: {
            status: approve ? "ACTIVE" : "REJECTED",
            reviewNote: reviewNote || null,
            reviewedAt: new Date(),
            reviewedById: reviewer.userId,
          },
        })

        if (approve) {
          if (!row.user.providerProfile) {
            const created = await tx.providerProfile.create({ data: { userId: row.userId } })
            await tx.providerProfile.update({
              where: { id: created.id },
              data: { slug: buildProviderSlug(row.user.name, `${row.userId}@saji`, created.id) },
            })
          }
          if (type === "PRODUCTS" && !row.user.shopkeeperProfile) {
            await tx.shopkeeperProfile.create({
              data: { userId: row.userId, shopName: `${row.user.name}'s Shop` },
            })
          }
        }

        await tx.notification.create({
          data: {
            userId: row.userId,
            title: approve ? `${label} added to your account` : `${label} request declined`,
            message: approve
              ? `You can now ${label.toLowerCase()} on Saji. The new pages are in your menu.`
              : reviewNote || "Our team reviewed your request and could not approve it at this time.",
            type: "SYSTEM",
            actionUrl: "/provider/business-types",
          },
        })
      },
      { timeout: 30000 },
    )
  } catch {
    return { success: false, error: "Could not save that decision. Please try again." }
  }

  await logAdminAction({
    userId: reviewer.userId,
    action: approve ? "APPROVE_PRO_CAPABILITY" : "REJECT_PRO_CAPABILITY",
    entityType: "ProCapability",
    entityId: row.id,
    newValues: { type, status: approve ? "ACTIVE" : "REJECTED" },
  })

  await pushToUser(row.userId, {
    title: approve ? `${label} added` : `${label} declined`,
    body: approve ? "Your new Saji Pro pages are ready." : "Tap to see what our team said.",
    url: "/provider/business-types",
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// Admin: which pages each business type unlocks
// ---------------------------------------------------------------------------

export type ProModuleMatrixCell = {
  moduleKey: string
  businessType: ProBusinessType
  enabled: boolean
  /** True when a ProModuleSetting row exists, i.e. an admin changed it. */
  isOverride: boolean
}

export type ProModuleMatrix = {
  /** One cell per (module, business type) pair, defaults already merged. */
  cells: ProModuleMatrixCell[]
  /** How many live Saji Pro accounts hold each business type. */
  accountsByType: Record<string, number>
  canEdit: boolean
}

export async function getProModuleMatrix(): Promise<ProModuleMatrix> {
  const session = await auth()
  const canEdit = !!session?.user && ["admin", "sub-admin"].includes(session.user.role)
  if (!session?.user || !["admin", "sub-admin", "agent"].includes(session.user.role)) {
    return { cells: [], accountsByType: {}, canEdit: false }
  }

  const [settings, counts] = await Promise.all([
    db.proModuleSetting.findMany(),
    db.proCapability.groupBy({ by: ["type"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ])

  const overrides = new Map<string, boolean>()
  for (const s of settings) overrides.set(`${s.businessType}:${s.moduleKey}`, s.enabled)

  const cells: ProModuleMatrixCell[] = []
  for (const mod of PRO_MODULES) {
    for (const type of PRO_BUSINESS_TYPES) {
      const key = `${type}:${mod.key}`
      const override = overrides.get(key)
      cells.push({
        moduleKey: mod.key,
        businessType: type,
        enabled: mod.core ? true : (override ?? DEFAULT_MODULES_BY_TYPE[type].includes(mod.key)),
        isOverride: override !== undefined,
      })
    }
  }

  const accountsByType: Record<string, number> = {}
  for (const c of counts) accountsByType[c.type] = c._count._all

  return { cells, accountsByType, canEdit }
}

export type SetModuleResult = { success: true } | { success: false; error: string }

const setModuleSchema = z.object({
  businessType: businessTypeSchema,
  moduleKey: z.string().trim().min(1),
  enabled: z.boolean(),
})

export async function setProModuleEnabled(input: unknown): Promise<SetModuleResult> {
  const admin = await requireModuleAdmin()
  if (!admin) return { success: false, error: "You must be signed in as Admin or Sub-Admin." }

  const parsed = setModuleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { businessType, moduleKey, enabled } = parsed.data

  const mod = PRO_MODULES.find((m) => m.key === moduleKey)
  if (!mod) return { success: false, error: "Unknown module." }
  if (mod.core) return { success: false, error: `${mod.label} is a core page and can't be switched off.` }

  await db.proModuleSetting.upsert({
    where: { businessType_moduleKey: { businessType, moduleKey } },
    create: { businessType, moduleKey, enabled, updatedById: admin.userId },
    update: { enabled, updatedById: admin.userId },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "SET_PRO_MODULE",
    entityType: "ProModuleSetting",
    entityId: `${businessType}:${moduleKey}`,
    newValues: { enabled },
  })

  return { success: true }
}

/** Drop the override and fall back to whatever lib/pro-modules.ts says. */
export async function resetProModuleToDefault(input: unknown): Promise<SetModuleResult> {
  const admin = await requireModuleAdmin()
  if (!admin) return { success: false, error: "You must be signed in as Admin or Sub-Admin." }

  const parsed = z.object({ businessType: businessTypeSchema, moduleKey: z.string().trim().min(1) }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.proModuleSetting.deleteMany({
    where: { businessType: parsed.data.businessType, moduleKey: parsed.data.moduleKey },
  })
  return { success: true }
}
