"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin, logAdminAction } from "@/backend/actions/admin-dashboard"
import type { BannerPlacement } from "@prisma/client"

export type BannerActionResult = { success: true } | { success: false; error: string }

export type AdminBanner = {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string
  linkUrl: string | null
  placement: BannerPlacement
  sortOrder: number
  isActive: boolean
  startDate: string | null
  endDate: string | null
  createdAt: string
}

function toAdminBanner(b: {
  id: string; title: string; subtitle: string | null; imageUrl: string; linkUrl: string | null
  placement: BannerPlacement; sortOrder: number; isActive: boolean
  startDate: Date | null; endDate: Date | null; createdAt: Date
}): AdminBanner {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    imageUrl: b.imageUrl,
    linkUrl: b.linkUrl,
    placement: b.placement,
    sortOrder: b.sortOrder,
    isActive: b.isActive,
    startDate: b.startDate?.toISOString() ?? null,
    endDate: b.endDate?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
  }
}

export async function getBannersForAdmin(): Promise<AdminBanner[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const banners = await db.banner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] })
  return banners.map(toAdminBanner)
}

const bannerSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  subtitle: z.string().trim().max(200).optional(),
  imageUrl: z.string().min(1, "An image is required"),
  linkUrl: z.string().trim().max(300).optional(),
  placement: z.enum(["HOME_HERO", "SERVICES_TOP", "PRODUCTS_TOP"]),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
}).refine(
  (data) => !data.startDate || !data.endDate || new Date(data.endDate) >= new Date(data.startDate),
  { message: "End date must be after the start date", path: ["endDate"] },
)

export async function createBanner(input: unknown): Promise<BannerActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = bannerSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const banner = await db.banner.create({
    data: {
      title: parsed.data.title,
      subtitle: parsed.data.subtitle || null,
      imageUrl: parsed.data.imageUrl,
      linkUrl: parsed.data.linkUrl || null,
      placement: parsed.data.placement,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      createdById: admin.userId,
    },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "banner.create",
    entityType: "Banner",
    entityId: banner.id,
    newValues: { title: banner.title, placement: banner.placement },
  })

  return { success: true }
}

const updateBannerSchema = bannerSchema.and(z.object({ id: z.string().trim().min(1) }))

export async function updateBanner(input: unknown): Promise<BannerActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = updateBannerSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.banner.findUnique({ where: { id: parsed.data.id } })
  if (!existing) return { success: false, error: "Banner not found." }

  await db.banner.update({
    where: { id: parsed.data.id },
    data: {
      title: parsed.data.title,
      subtitle: parsed.data.subtitle || null,
      imageUrl: parsed.data.imageUrl,
      linkUrl: parsed.data.linkUrl || null,
      placement: parsed.data.placement,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "banner.update",
    entityType: "Banner",
    entityId: parsed.data.id,
    oldValues: { title: existing.title, isActive: existing.isActive },
    newValues: { title: parsed.data.title, isActive: parsed.data.isActive },
  })

  return { success: true }
}

const bannerIdSchema = z.object({ id: z.string().trim().min(1) })

export async function deleteBanner(input: unknown): Promise<BannerActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = bannerIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const existing = await db.banner.findUnique({ where: { id: parsed.data.id } })
  if (!existing) return { success: false, error: "Banner not found." }

  await db.banner.delete({ where: { id: parsed.data.id } })

  await logAdminAction({
    userId: admin.userId,
    action: "banner.delete",
    entityType: "Banner",
    entityId: parsed.data.id,
    oldValues: { title: existing.title, placement: existing.placement },
  })

  return { success: true }
}

export type PublicBanner = { id: string; title: string; subtitle: string | null; imageUrl: string; linkUrl: string | null }

/** Public, no auth gate — the customer Home/Services pages call this
 * directly. A DB hiccup here must never break the page it decorates, so any
 * failure is swallowed to an empty list rather than thrown. */
export async function getActiveBanners(placement: BannerPlacement): Promise<PublicBanner[]> {
  try {
    const now = new Date()
    const banners = await db.banner.findMany({
      where: {
        placement,
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: { sortOrder: "asc" },
    })
    return banners.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, linkUrl: b.linkUrl }))
  } catch {
    return []
  }
}
