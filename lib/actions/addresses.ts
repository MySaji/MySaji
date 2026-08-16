"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export type AddressItem = {
  id: string
  label: string
  type: "HOME" | "OFFICE" | "OTHER"
  address: string
  city: string | null
  latitude: number | null
  longitude: number | null
  isDefault: boolean
}

export async function getAddresses(): Promise<AddressItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const addresses = await db.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  })
  return addresses.map((a) => ({
    id: a.id,
    label: a.label,
    type: a.type,
    address: a.address,
    city: a.city,
    latitude: a.latitude != null ? Number(a.latitude) : null,
    longitude: a.longitude != null ? Number(a.longitude) : null,
    isDefault: a.isDefault,
  }))
}

export type AddressActionResult = { success: true } | { success: false; error: string }

const addressSchema = z.object({
  label: z.string().trim().min(1, "Label is required"),
  type: z.enum(["HOME", "OFFICE", "OTHER"]).default("OTHER"),
  address: z.string().trim().min(1, "Address is required"),
  // Real coordinates from Google Places Autocomplete, when a Maps key is
  // configured — optional so the plain-text-input fallback still works.
  city: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export async function createAddress(input: unknown): Promise<AddressActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = addressSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const existingCount = await db.address.count({ where: { userId: session.user.id } })
  await db.address.create({ data: { userId: session.user.id, ...parsed.data, isDefault: existingCount === 0 } })
  return { success: true }
}

const updateAddressSchema = addressSchema.extend({ id: z.string().trim().min(1) })

export async function updateAddress(input: unknown): Promise<AddressActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = updateAddressSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { id, ...data } = parsed.data

  await db.address.updateMany({ where: { id, userId: session.user.id }, data })
  return { success: true }
}

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function deleteAddress(input: unknown): Promise<AddressActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.address.deleteMany({ where: { id: parsed.data.id, userId: session.user.id } })
  return { success: true }
}

export async function setDefaultAddress(input: unknown): Promise<AddressActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.$transaction([
    db.address.updateMany({ where: { userId: session.user.id }, data: { isDefault: false } }),
    db.address.updateMany({ where: { id: parsed.data.id, userId: session.user.id }, data: { isDefault: true } }),
  ])
  return { success: true }
}
