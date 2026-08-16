"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type CategoryAttributeFieldType = "TEXT" | "TEXTAREA" | "NUMBER" | "TAGS" | "SELECT"

export type AdminCategoryAttribute = {
  id: string
  categoryId: string
  key: string
  label: string
  type: CategoryAttributeFieldType
  options: string[]
  placeholder: string | null
  sortOrder: number
}

export async function getCategoryAttributesForAdmin(categoryId: string): Promise<AdminCategoryAttribute[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const rows = await db.categoryAttribute.findMany({ where: { categoryId }, orderBy: { sortOrder: "asc" } })
  return rows.map((r) => ({
    id: r.id, categoryId: r.categoryId, key: r.key, label: r.label, type: r.type,
    options: r.options, placeholder: r.placeholder, sortOrder: r.sortOrder,
  }))
}

export type CategoryAttributeActionResult = { success: true } | { success: false; error: string }

const keySchema = z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9]*$/, "Key must start with a letter and contain only letters/numbers (used as a field name)")

const attributeSchema = z.object({
  categoryId: z.string().trim().min(1),
  key: keySchema,
  label: z.string().trim().min(1, "Label is required"),
  type: z.enum(["TEXT", "TEXTAREA", "NUMBER", "TAGS", "SELECT"]),
  options: z.array(z.string().trim().min(1)).max(30).optional(),
  placeholder: z.string().trim().optional(),
})

/** Admin action: add a new Step-3 field for a category — this is the whole
 * point of the config-driven attribute architecture (see the schema.prisma
 * doc comment on CategoryAttribute): a new category-specific field is now
 * this one action call from Admin > Categories, never a code change. */
export async function createCategoryAttribute(input: unknown): Promise<CategoryAttributeActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = attributeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  if ((parsed.data.type === "SELECT" || parsed.data.type === "TAGS") && (parsed.data.type === "SELECT" && (parsed.data.options ?? []).length === 0)) {
    return { success: false, error: "Select fields need at least one option." }
  }

  const maxOrder = await db.categoryAttribute.aggregate({ where: { categoryId: parsed.data.categoryId }, _max: { sortOrder: true } })

  try {
    await db.categoryAttribute.create({
      data: {
        categoryId: parsed.data.categoryId, key: parsed.data.key, label: parsed.data.label, type: parsed.data.type,
        options: parsed.data.options ?? [], placeholder: parsed.data.placeholder || null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    })
  } catch {
    return { success: false, error: "A field with this key already exists for this category." }
  }

  await logAdminAction({ userId: admin.userId, action: "CREATE_CATEGORY_ATTRIBUTE", entityType: "CategoryAttribute", entityId: parsed.data.categoryId, newValues: parsed.data })
  return { success: true }
}

const updateAttributeSchema = attributeSchema.omit({ categoryId: true }).extend({ id: z.string().trim().min(1) })

export async function updateCategoryAttribute(input: unknown): Promise<CategoryAttributeActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = updateAttributeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  try {
    await db.categoryAttribute.update({
      where: { id: parsed.data.id },
      data: {
        key: parsed.data.key, label: parsed.data.label, type: parsed.data.type,
        options: parsed.data.options ?? [], placeholder: parsed.data.placeholder || null,
      },
    })
  } catch {
    return { success: false, error: "Couldn't update this field — the key may already be in use." }
  }

  await logAdminAction({ userId: admin.userId, action: "UPDATE_CATEGORY_ATTRIBUTE", entityType: "CategoryAttribute", entityId: parsed.data.id, newValues: parsed.data })
  return { success: true }
}

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function deleteCategoryAttribute(input: unknown): Promise<CategoryAttributeActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.categoryAttribute.delete({ where: { id: parsed.data.id } }).catch(() => {})
  await logAdminAction({ userId: admin.userId, action: "DELETE_CATEGORY_ATTRIBUTE", entityType: "CategoryAttribute", entityId: parsed.data.id })
  return { success: true }
}

const reorderSchema = z.object({ id: z.string().trim().min(1), direction: z.enum(["up", "down"]) })

/** Swaps this field's sortOrder with its immediate neighbor in the same
 * direction — simple adjacent-swap reordering rather than a full drag-drop
 * list, which is all ten-or-so fields per category actually needs. */
export async function reorderCategoryAttribute(input: unknown): Promise<CategoryAttributeActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = reorderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const current = await db.categoryAttribute.findUnique({ where: { id: parsed.data.id } })
  if (!current) return { success: false, error: "Field not found." }

  const neighbor = await db.categoryAttribute.findFirst({
    where: { categoryId: current.categoryId, sortOrder: parsed.data.direction === "up" ? { lt: current.sortOrder } : { gt: current.sortOrder } },
    orderBy: { sortOrder: parsed.data.direction === "up" ? "desc" : "asc" },
  })
  if (!neighbor) return { success: true }

  await db.$transaction([
    db.categoryAttribute.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
    db.categoryAttribute.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
  ])
  return { success: true }
}
