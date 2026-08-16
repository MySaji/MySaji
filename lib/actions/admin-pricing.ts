"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type AdminServiceRow = {
  id: string
  providerUserId: string
  name: string
  category: string
  provider: string
  basePrice: number
  skillLevel: "Skilled" | "Semi-Skilled" | "Non-Skilled"
  status: "Active" | "Inactive"
  approvalStatus: "Pending" | "Approved" | "Rejected"
  rejectionReason: string | null
}

const SKILL_LABEL: Record<string, "Skilled" | "Semi-Skilled" | "Non-Skilled"> = {
  SKILLED: "Skilled", SEMI_SKILLED: "Semi-Skilled", NON_SKILLED: "Non-Skilled",
}

const APPROVAL_LABEL: Record<string, "Pending" | "Approved" | "Rejected"> = {
  PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected",
}

export async function getAdminServices(): Promise<AdminServiceRow[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const services = await db.service.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { category: true, provider: { include: { user: true } } },
  })

  return services.map((s) => ({
    id: s.id,
    providerUserId: s.provider.userId,
    name: s.title,
    category: s.category?.name ?? "Uncategorized",
    provider: s.provider.user.name,
    basePrice: Number(s.basePrice),
    skillLevel: SKILL_LABEL[s.skillLevel] ?? "Skilled",
    status: s.isActive ? "Active" : "Inactive",
    approvalStatus: APPROVAL_LABEL[s.approvalStatus] ?? "Approved",
    rejectionReason: s.rejectionReason,
  }))
}

export type AdminServiceActionResult = { success: true } | { success: false; error: string }

const updateSchema = z.object({
  serviceId: z.string().trim().min(1),
  basePrice: z.number().positive("Enter a valid price"),
})

export async function updateServiceBasePrice(input: unknown): Promise<AdminServiceActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const service = await db.service.findUnique({ where: { id: parsed.data.serviceId } })
  if (!service) return { success: false, error: "Service not found." }

  await db.service.update({ where: { id: service.id }, data: { basePrice: parsed.data.basePrice } })

  await logAdminAction({
    userId: admin.userId,
    action: "service.update_price",
    entityType: "Service",
    entityId: service.id,
    oldValues: { basePrice: Number(service.basePrice) },
    newValues: { basePrice: parsed.data.basePrice },
  })

  return { success: true }
}

const idSchema = z.object({ serviceId: z.string().trim().min(1) })

export async function deleteAdminService(input: unknown): Promise<AdminServiceActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const service = await db.service.findUnique({ where: { id: parsed.data.serviceId } })
  if (!service) return { success: false, error: "Service not found." }

  try {
    await db.service.delete({ where: { id: service.id } })
  } catch {
    return { success: false, error: "This service can't be deleted because it has existing bookings. Try deactivating it instead." }
  }

  await logAdminAction({
    userId: admin.userId,
    action: "service.delete",
    entityType: "Service",
    entityId: service.id,
    oldValues: { title: service.title, basePrice: Number(service.basePrice) },
  })

  return { success: true }
}

export async function toggleServiceActive(input: unknown): Promise<AdminServiceActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const service = await db.service.findUnique({ where: { id: parsed.data.serviceId } })
  if (!service) return { success: false, error: "Service not found." }

  await db.service.update({ where: { id: service.id }, data: { isActive: !service.isActive } })

  await logAdminAction({
    userId: admin.userId,
    action: service.isActive ? "service.deactivate" : "service.activate",
    entityType: "Service",
    entityId: service.id,
    oldValues: { isActive: service.isActive },
    newValues: { isActive: !service.isActive },
  })

  return { success: true }
}

export async function approveService(input: unknown): Promise<AdminServiceActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const service = await db.service.findUnique({ where: { id: parsed.data.serviceId }, include: { provider: true } })
  if (!service) return { success: false, error: "Service not found." }

  await db.$transaction([
    db.service.update({
      where: { id: service.id },
      data: { approvalStatus: "APPROVED", reviewedAt: new Date(), reviewedById: admin.userId, rejectionReason: null },
    }),
    db.notification.create({
      data: {
        userId: service.provider.userId,
        title: "Service listing approved",
        message: `Your listing "${service.title}" is now live and visible to customers.`,
        type: "SYSTEM",
        actionUrl: "/provider/services",
      },
    }),
  ])

  await logAdminAction({
    userId: admin.userId,
    action: "service.approve",
    entityType: "Service",
    entityId: service.id,
    oldValues: { approvalStatus: service.approvalStatus },
    newValues: { approvalStatus: "APPROVED" },
  })

  return { success: true }
}

const rejectSchema = z.object({
  serviceId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "Please provide a rejection reason"),
})

export async function rejectService(input: unknown): Promise<AdminServiceActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const service = await db.service.findUnique({ where: { id: parsed.data.serviceId }, include: { provider: true } })
  if (!service) return { success: false, error: "Service not found." }

  await db.$transaction([
    db.service.update({
      where: { id: service.id },
      data: { approvalStatus: "REJECTED", reviewedAt: new Date(), reviewedById: admin.userId, rejectionReason: parsed.data.reason },
    }),
    db.notification.create({
      data: {
        userId: service.provider.userId,
        title: "Service listing rejected",
        message: `Your listing "${service.title}" was not approved: ${parsed.data.reason}`,
        type: "SYSTEM",
        actionUrl: "/provider/services",
      },
    }),
  ])

  await logAdminAction({
    userId: admin.userId,
    action: "service.reject",
    entityType: "Service",
    entityId: service.id,
    oldValues: { approvalStatus: service.approvalStatus },
    newValues: { approvalStatus: "REJECTED" },
  })

  return { success: true }
}
