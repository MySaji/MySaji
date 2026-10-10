"use server"

import { z } from "zod"
import type { CategoryType } from "@prisma/client"
import { db } from "@/backend/db"
import { requireAdmin, logAdminAction } from "@/backend/actions/admin-dashboard"

export type CategoryRow = {
  id: string
  name: string
  slug: string
  type: CategoryType
  icon: string | null
  tier: string | null
  parentId: string | null
  parentName: string | null
  isActive: boolean
  isEmergencyEligible: boolean
  requiresLicense: boolean
  licenseName: string | null
  usageCount: number
}

export type CategoryActionResult = { success: true } | { success: false; error: string }

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "category"
  let candidate = base
  let n = 2
  while (await db.category.findFirst({ where: { slug: candidate, id: excludeId ? { not: excludeId } : undefined } })) {
    candidate = `${base}-${n}`
    n += 1
  }
  return candidate
}

export async function getCategoriesForAdmin(): Promise<CategoryRow[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const categories = await db.category.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      parent: { select: { name: true } },
      _count: { select: { services: true, products: true, providers: true, distributorProducts: true, promotions: true } },
    },
  })

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    type: c.type,
    icon: c.icon,
    tier: c.tier,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    isActive: c.isActive,
    isEmergencyEligible: c.isEmergencyEligible,
    requiresLicense: c.requiresLicense,
    licenseName: c.licenseName,
    usageCount: c._count.services + c._count.products + c._count.providers + c._count.distributorProducts + c._count.promotions,
  }))
}

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  type: z.enum(["SERVICE", "PRODUCT"]),
  icon: z.string().trim().optional(),
  tier: z.string().trim().optional(),
  parentId: z.string().trim().optional(),
  isEmergencyEligible: z.boolean().optional(),
  requiresLicense: z.boolean().optional(),
  licenseName: z.string().trim().max(120).optional(),
})

export async function createCategory(input: unknown): Promise<CategoryActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = createCategorySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { name, type, icon, tier, parentId, isEmergencyEligible, requiresLicense, licenseName } = parsed.data

  const slug = await uniqueSlug(name)
  const category = await db.category.create({
    data: {
      name,
      slug,
      type,
      icon: icon || undefined,
      tier: tier || undefined,
      parentId: parentId || undefined,
      isEmergencyEligible: type === "SERVICE" ? Boolean(isEmergencyEligible) : false,
      requiresLicense: type === "SERVICE" ? Boolean(requiresLicense) : false,
      licenseName: type === "SERVICE" && requiresLicense ? licenseName || null : null,
    },
  })

  await logAdminAction({ userId: admin.userId, action: "CREATE_CATEGORY", entityType: "Category", entityId: category.id, newValues: { name, type } })
  return { success: true }
}

const updateCategorySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name is required").max(80).optional(),
  icon: z.string().trim().optional(),
  tier: z.string().trim().optional(),
  parentId: z.string().trim().nullable().optional(),
  isEmergencyEligible: z.boolean().optional(),
  requiresLicense: z.boolean().optional(),
  licenseName: z.string().trim().max(120).optional(),
})

export async function updateCategory(input: unknown): Promise<CategoryActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = updateCategorySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { id, name, icon, tier, parentId, isEmergencyEligible, requiresLicense, licenseName } = parsed.data

  const existing = await db.category.findUnique({ where: { id } })
  if (!existing) return { success: false, error: "Category not found." }
  if (id === parentId) return { success: false, error: "A category can't be its own parent." }

  // Self-parenting is only the one-node case. A -> B -> A is just as broken and
  // was reachable here before: it existed in production data (Carpenters and AC
  // Repair were each other's parent) and stayed invisible because nothing walked
  // ancestors. getOfferAttributeFields now does, so walk the proposed chain and
  // refuse anything that loops back. The depth cap is a backstop in case a cycle
  // predates this check.
  if (parentId) {
    let cursor: string | null = parentId
    for (let depth = 0; cursor && depth < 16; depth += 1) {
      if (cursor === id) {
        return { success: false, error: "That would make the category its own ancestor." }
      }
      const next: { parentId: string | null } | null = await db.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      })
      cursor = next?.parentId ?? null
    }
  }

  await db.category.update({
    where: { id },
    data: {
      name: name || undefined,
      slug: name ? await uniqueSlug(name, id) : undefined,
      icon: icon !== undefined ? icon || null : undefined,
      tier: tier !== undefined ? tier || null : undefined,
      parentId: parentId !== undefined ? parentId || null : undefined,
      isEmergencyEligible: existing.type === "SERVICE" && isEmergencyEligible !== undefined ? isEmergencyEligible : undefined,
      requiresLicense: existing.type === "SERVICE" && requiresLicense !== undefined ? requiresLicense : undefined,
      licenseName: existing.type === "SERVICE" && requiresLicense !== undefined ? (requiresLicense ? licenseName || null : null) : undefined,
    },
  })

  await logAdminAction({ userId: admin.userId, action: "UPDATE_CATEGORY", entityType: "Category", entityId: id, oldValues: { name: existing.name }, newValues: { name } })
  return { success: true }
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<CategoryActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  await db.category.update({ where: { id }, data: { isActive } })
  await logAdminAction({ userId: admin.userId, action: isActive ? "ACTIVATE_CATEGORY" : "DEACTIVATE_CATEGORY", entityType: "Category", entityId: id })
  return { success: true }
}

export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const counts = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { services: true, products: true, providers: true, distributorProducts: true, promotions: true } } },
  })
  if (!counts) return { success: false, error: "Category not found." }

  const usageCount = counts._count.services + counts._count.products + counts._count.providers + counts._count.distributorProducts + counts._count.promotions
  if (usageCount > 0) {
    return { success: false, error: `This category is used by ${usageCount} existing record${usageCount === 1 ? "" : "s"}. Deactivate it instead of deleting.` }
  }

  await db.category.delete({ where: { id } })
  await logAdminAction({ userId: admin.userId, action: "DELETE_CATEGORY", entityType: "Category", entityId: id, oldValues: { name: counts.name } })
  return { success: true }
}
