"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireDistributor } from "@/backend/actions/distributor-dashboard"

export type DistributorLocationRow = {
  id: string
  name: string
  type: "WAREHOUSE" | "RETAIL_STORE" | "WHOLESALER" | "DISTRIBUTOR"
  address: string
  city: string | null
  phone: string | null
  isActive: boolean
  isPrimary: boolean
  deliveryFee: number
  deliveryRadiusKm: number | null
  deliveryFeePerKm: number
  itemCount: number
  totalStock: number
  createdAt: string
}

export async function getMyLocations(): Promise<DistributorLocationRow[]> {
  const distributor = await requireDistributor()
  if (!distributor) return []

  const locations = await db.distributorLocation.findMany({
    where: { distributorId: distributor.distributorId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { inventories: { select: { currentStock: true } } },
  })

  return locations.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    address: l.address,
    city: l.city,
    phone: l.phone,
    isActive: l.isActive,
    isPrimary: l.isPrimary,
    deliveryFee: Number(l.deliveryFee),
    deliveryRadiusKm: l.deliveryRadiusKm != null ? Number(l.deliveryRadiusKm) : null,
    deliveryFeePerKm: Number(l.deliveryFeePerKm),
    itemCount: l.inventories.length,
    totalStock: l.inventories.reduce((sum, i) => sum + i.currentStock, 0),
    createdAt: l.createdAt.toISOString(),
  }))
}

export type DistributorLocationActionResult = { success: true } | { success: false; error: string }

const locationTypeSchema = z.enum(["WAREHOUSE", "RETAIL_STORE", "WHOLESALER", "DISTRIBUTOR"])

const deliveryFeeSchema = z.number().min(0, "Delivery fee can't be negative").max(50000, "That delivery fee looks too high")
// Null is meaningful, not missing: it clears a radius back to "delivers
// anywhere", which is what every location had before zones existed.
const deliveryRadiusSchema = z.number().positive("Delivery radius must be greater than zero").max(2000, "That delivery radius looks too large").nullable()
const deliveryPerKmSchema = z.number().min(0, "Per-km fee can't be negative").max(5000, "That per-km fee looks too high")

const createLocationSchema = z.object({
  name: z.string().trim().min(1, "Location name is required"),
  type: locationTypeSchema,
  address: z.string().trim().min(1, "Address is required"),
  city: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isPrimary: z.boolean().optional(),
  deliveryFee: deliveryFeeSchema.optional(),
  deliveryRadiusKm: deliveryRadiusSchema.optional(),
  deliveryFeePerKm: deliveryPerKmSchema.optional(),
})

export async function createLocation(input: unknown): Promise<DistributorLocationActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = createLocationSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  await db.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.distributorLocation.updateMany({ where: { distributorId: distributor.distributorId }, data: { isPrimary: false } })
    }
    await tx.distributorLocation.create({
      data: {
        distributorId: distributor.distributorId,
        name: data.name,
        type: data.type,
        address: data.address,
        city: data.city || undefined,
        phone: data.phone || undefined,
        latitude: data.latitude,
        longitude: data.longitude,
        isPrimary: data.isPrimary ?? false,
        deliveryFee: data.deliveryFee ?? undefined,
        deliveryRadiusKm: data.deliveryRadiusKm ?? undefined,
        deliveryFeePerKm: data.deliveryFeePerKm ?? undefined,
      },
    })
  })

  return { success: true }
}

const updateLocationSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Location name is required").optional(),
  type: locationTypeSchema.optional(),
  address: z.string().trim().min(1).optional(),
  city: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isPrimary: z.boolean().optional(),
  deliveryFee: deliveryFeeSchema.optional(),
  deliveryRadiusKm: deliveryRadiusSchema.optional(),
  deliveryFeePerKm: deliveryPerKmSchema.optional(),
})

export async function updateLocation(input: unknown): Promise<DistributorLocationActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = updateLocationSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { id, ...data } = parsed.data

  const location = await db.distributorLocation.findUnique({ where: { id } })
  if (!location || location.distributorId !== distributor.distributorId) {
    return { success: false, error: "Location not found." }
  }

  await db.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.distributorLocation.updateMany({ where: { distributorId: distributor.distributorId }, data: { isPrimary: false } })
    }
    await tx.distributorLocation.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        address: data.address,
        city: data.city,
        phone: data.phone,
        latitude: data.latitude,
        longitude: data.longitude,
        isPrimary: data.isPrimary,
        deliveryFee: data.deliveryFee,
        deliveryRadiusKm: data.deliveryRadiusKm === undefined ? undefined : data.deliveryRadiusKm,
        deliveryFeePerKm: data.deliveryFeePerKm,
      },
    })
  })

  return { success: true }
}

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function toggleLocationActive(input: unknown): Promise<DistributorLocationActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const location = await db.distributorLocation.findUnique({ where: { id: parsed.data.id } })
  if (!location || location.distributorId !== distributor.distributorId) {
    return { success: false, error: "Location not found." }
  }

  await db.distributorLocation.update({ where: { id: location.id }, data: { isActive: !location.isActive } })
  return { success: true }
}

export async function deleteLocation(input: unknown): Promise<DistributorLocationActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const location = await db.distributorLocation.findUnique({
    where: { id: parsed.data.id },
    include: { inventories: true },
  })
  if (!location || location.distributorId !== distributor.distributorId) {
    return { success: false, error: "Location not found." }
  }

  const hasStock = location.inventories.some((i) => i.currentStock > 0)
  if (hasStock) return { success: false, error: "This location still has stock. Transfer or clear it first." }

  const openOrderCount = await db.wholesaleOrder.count({
    where: { locationId: location.id, status: { notIn: ["DELIVERED", "CANCELLED", "REFUNDED"] } },
  })
  if (openOrderCount > 0) return { success: false, error: "This location has open orders and can't be removed yet." }

  try {
    await db.distributorLocation.delete({ where: { id: location.id } })
  } catch {
    return { success: false, error: "This location is still referenced elsewhere and can't be removed." }
  }

  return { success: true }
}

export type TransferProductOption = { id: string; name: string; sku: string }

export async function getMyDistributorProductOptions(): Promise<TransferProductOption[]> {
  const distributor = await requireDistributor()
  if (!distributor) return []

  const products = await db.distributorProduct.findMany({
    where: { distributorId: distributor.distributorId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true },
  })
  return products
}

const transferStockSchema = z.object({
  distributorProductId: z.string().trim().min(1),
  fromLocationId: z.string().trim().min(1),
  toLocationId: z.string().trim().min(1),
  quantity: z.number().int().positive("Quantity must be a positive number"),
  notes: z.string().trim().optional(),
})

export async function transferStock(input: unknown): Promise<DistributorLocationActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  const parsed = transferStockSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { distributorProductId, fromLocationId, toLocationId, quantity, notes } = parsed.data

  if (fromLocationId === toLocationId) return { success: false, error: "Source and destination locations must be different." }

  const [fromLocation, toLocation, product] = await Promise.all([
    db.distributorLocation.findUnique({ where: { id: fromLocationId } }),
    db.distributorLocation.findUnique({ where: { id: toLocationId } }),
    db.distributorProduct.findUnique({ where: { id: distributorProductId } }),
  ])
  if (!fromLocation || fromLocation.distributorId !== distributor.distributorId) return { success: false, error: "Source location not found." }
  if (!toLocation || toLocation.distributorId !== distributor.distributorId) return { success: false, error: "Destination location not found." }
  if (!product || product.distributorId !== distributor.distributorId) return { success: false, error: "Product not found." }

  const sourceInventory = await db.distributorInventory.findUnique({
    where: { distributorProductId_locationId: { distributorProductId, locationId: fromLocationId } },
  })
  if (!sourceInventory || sourceInventory.currentStock < quantity) {
    return { success: false, error: "Not enough stock at the source location." }
  }

  await db.$transaction([
    db.distributorInventory.update({
      where: { distributorProductId_locationId: { distributorProductId, locationId: fromLocationId } },
      data: { currentStock: { decrement: quantity } },
    }),
    db.distributorInventory.upsert({
      where: { distributorProductId_locationId: { distributorProductId, locationId: toLocationId } },
      create: { distributorProductId, locationId: toLocationId, currentStock: quantity, lastRestockedAt: new Date() },
      update: { currentStock: { increment: quantity }, lastRestockedAt: new Date() },
    }),
    db.stockTransfer.create({
      data: {
        distributorId: distributor.distributorId,
        distributorProductId,
        fromLocationId,
        toLocationId,
        quantity,
        notes: notes || undefined,
        initiatedById: distributor.userId,
      },
    }),
  ])

  return { success: true }
}

export type DistributorLocationDetail = {
  id: string
  name: string
  type: "WAREHOUSE" | "RETAIL_STORE" | "WHOLESALER" | "DISTRIBUTOR"
  address: string
  city: string | null
  phone: string | null
  isActive: boolean
  isPrimary: boolean
  deliveryFee: number
  deliveryRadiusKm: number | null
  deliveryFeePerKm: number
  inventory: { id: string; productName: string; sku: string; currentStock: number; lowStockThreshold: number; unit: string | null }[]
} | null

export async function getLocationDetail(locationId: string): Promise<DistributorLocationDetail> {
  const distributor = await requireDistributor()
  if (!distributor) return null

  const location = await db.distributorLocation.findUnique({
    where: { id: locationId },
    include: { inventories: { include: { distributorProduct: { select: { name: true, sku: true, unit: true } } }, orderBy: { updatedAt: "desc" } } },
  })
  if (!location || location.distributorId !== distributor.distributorId) return null

  return {
    id: location.id,
    name: location.name,
    type: location.type,
    address: location.address,
    city: location.city,
    phone: location.phone,
    isActive: location.isActive,
    isPrimary: location.isPrimary,
    deliveryFee: Number(location.deliveryFee),
    deliveryRadiusKm: location.deliveryRadiusKm != null ? Number(location.deliveryRadiusKm) : null,
    deliveryFeePerKm: Number(location.deliveryFeePerKm),
    inventory: location.inventories.map((i) => ({
      id: i.id,
      productName: i.distributorProduct.name,
      sku: i.distributorProduct.sku,
      currentStock: i.currentStock,
      lowStockThreshold: i.lowStockThreshold,
      unit: i.distributorProduct.unit,
    })),
  }
}

export type StockTransferRow = {
  id: string
  productName: string
  fromLocationName: string
  toLocationName: string
  quantity: number
  notes: string | null
  initiatedByName: string
  createdAt: string
}

export async function getStockTransferHistory(): Promise<StockTransferRow[]> {
  const distributor = await requireDistributor()
  if (!distributor) return []

  const transfers = await db.stockTransfer.findMany({
    where: { distributorId: distributor.distributorId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      distributorProduct: { select: { name: true } },
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
      initiatedBy: { select: { name: true } },
    },
  })

  return transfers.map((t) => ({
    id: t.id,
    productName: t.distributorProduct.name,
    fromLocationName: t.fromLocation.name,
    toLocationName: t.toLocation.name,
    quantity: t.quantity,
    notes: t.notes,
    initiatedByName: t.initiatedBy.name,
    createdAt: t.createdAt.toISOString(),
  }))
}
