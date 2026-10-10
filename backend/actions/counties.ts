"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin, logAdminAction } from "@/backend/actions/admin-dashboard"

export type CountyRow = { id: string; name: string; isActive: boolean }
export type CountyActionResult = { success: true } | { success: false; error: string }

export async function getCountiesForAdmin(): Promise<CountyRow[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const counties = await db.county.findMany({ orderBy: { name: "asc" } })
  return counties.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))
}

/** Public read — replaces what used to be an identical hardcoded county
 * array duplicated in the shopkeeper and distributor registration forms. */
export async function getActiveCounties(): Promise<CountyRow[]> {
  const counties = await db.county.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
  return counties.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))
}

const nameSchema = z.string().trim().min(1, "Name is required").max(60)

export async function createCounty(name: unknown): Promise<CountyActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.county.findUnique({ where: { name: parsed.data } })
  if (existing) return { success: false, error: "That county already exists." }

  const county = await db.county.create({ data: { name: parsed.data } })
  await logAdminAction({ userId: admin.userId, action: "CREATE_COUNTY", entityType: "County", entityId: county.id, newValues: { name: parsed.data } })
  return { success: true }
}

export async function updateCounty(id: string, name: unknown): Promise<CountyActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existing = await db.county.findUnique({ where: { name: parsed.data } })
  if (existing && existing.id !== id) return { success: false, error: "That county already exists." }

  const before = await db.county.findUnique({ where: { id } })
  if (!before) return { success: false, error: "County not found." }

  await db.county.update({ where: { id }, data: { name: parsed.data } })
  await logAdminAction({ userId: admin.userId, action: "UPDATE_COUNTY", entityType: "County", entityId: id, oldValues: { name: before.name }, newValues: { name: parsed.data } })
  return { success: true }
}

export async function setCountyActive(id: string, isActive: boolean): Promise<CountyActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  await db.county.update({ where: { id }, data: { isActive } })
  await logAdminAction({ userId: admin.userId, action: isActive ? "ACTIVATE_COUNTY" : "DEACTIVATE_COUNTY", entityType: "County", entityId: id })
  return { success: true }
}

export async function deleteCounty(id: string): Promise<CountyActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "Not authorized." }

  const county = await db.county.findUnique({ where: { id } })
  if (!county) return { success: false, error: "County not found." }

  await db.county.delete({ where: { id } })
  await logAdminAction({ userId: admin.userId, action: "DELETE_COUNTY", entityType: "County", entityId: id, oldValues: { name: county.name } })
  return { success: true }
}
