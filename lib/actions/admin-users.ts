"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type AdminUserStatus = "active" | "pending" | "disputed" | "suspended"

export type AdminUserRow = {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  status: AdminUserStatus
  earnings: number
  joined: string
  orders: number
  disputes: number
}

export type AdminUsersResult = {
  users: AdminUserRow[]
  totalCount: number
  page: number
  pageSize: number
}

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Customer", PROVIDER: "Provider", SHOPKEEPER: "Shopkeeper", DISTRIBUTOR: "Distributor",
  AGENT: "Agent", SECRETARY: "Secretary", SUB_ADMIN: "Sub-Admin", ADMIN: "Admin",
}

export async function getAdminUsers(params: {
  search?: string
  filter?: "all" | "active" | "pending" | "disputed" | "suspended"
  page?: number
  pageSize?: number
} = {}): Promise<AdminUsersResult> {
  const admin = await requireAdmin()
  if (!admin) return { users: [], totalCount: 0, page: 1, pageSize: 20 }

  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const search = params.search?.trim() ?? ""

  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { id: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const totalCount = await db.user.count({ where })

  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      wallet: { select: { totalEarned: true } },
      providerProfile: { select: { id: true } },
      shopkeeperProfile: { select: { id: true } },
      distributorProfile: { select: { id: true } },
    },
  })

  const providerProfileIds = users.map((u) => u.providerProfile?.id).filter((id): id is string => !!id)
  const shopkeeperProfileIds = users.map((u) => u.shopkeeperProfile?.id).filter((id): id is string => !!id)
  const distributorProfileIds = users.map((u) => u.distributorProfile?.id).filter((id): id is string => !!id)
  const userIds = users.map((u) => u.id)

  const [
    customerOrderCounts, shopOrderCounts, distributorOrderCounts, customerJobCounts, providerJobCounts,
    customerDisputeCounts, providerDisputeCounts,
  ] = await Promise.all([
    db.order.groupBy({ by: ["customerId"], where: { customerId: { in: userIds } }, _count: true }),
    shopkeeperProfileIds.length > 0
      ? db.order.groupBy({ by: ["shopkeeperId"], where: { shopkeeperId: { in: shopkeeperProfileIds } }, _count: true })
      : Promise.resolve([]),
    distributorProfileIds.length > 0
      ? db.wholesaleOrder.groupBy({ by: ["distributorId"], where: { distributorId: { in: distributorProfileIds } }, _count: true })
      : Promise.resolve([]),
    db.job.groupBy({ by: ["customerId"], where: { customerId: { in: userIds } }, _count: true }),
    providerProfileIds.length > 0
      ? db.job.groupBy({ by: ["providerId"], where: { providerId: { in: providerProfileIds } }, _count: true })
      : Promise.resolve([]),
    db.dispute.groupBy({ by: ["customerId"], where: { customerId: { in: userIds } }, _count: true }),
    providerProfileIds.length > 0
      ? db.dispute.groupBy({ by: ["providerId"], where: { providerId: { in: providerProfileIds } }, _count: true })
      : Promise.resolve([]),
  ])

  const openDisputeUsers = await db.dispute.findMany({
    where: {
      status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] },
      OR: [{ customerId: { in: userIds } }, { providerId: { in: providerProfileIds } }],
    },
    select: { customerId: true, providerId: true },
  })
  const openDisputeCustomerIds = new Set(openDisputeUsers.map((d) => d.customerId))
  const openDisputeProviderProfileIds = new Set(openDisputeUsers.map((d) => d.providerId).filter(Boolean))

  const custOrderMap = new Map(customerOrderCounts.map((c) => [c.customerId, c._count]))
  const shopOrderMap = new Map(shopOrderCounts.map((c) => [c.shopkeeperId, c._count]))
  const distributorOrderMap = new Map(distributorOrderCounts.map((c) => [c.distributorId, c._count]))
  const custJobMap = new Map(customerJobCounts.map((c) => [c.customerId, c._count]))
  const provJobMap = new Map(providerJobCounts.map((c) => [c.providerId, c._count]))
  const custDisputeMap = new Map(customerDisputeCounts.map((c) => [c.customerId, c._count]))
  const provDisputeMap = new Map(providerDisputeCounts.map((c) => [c.providerId, c._count]))

  const rows: AdminUserRow[] = users.map((u) => {
    const orders = (custOrderMap.get(u.id) ?? 0)
      + (u.shopkeeperProfile ? shopOrderMap.get(u.shopkeeperProfile.id) ?? 0 : 0)
      + (u.distributorProfile ? distributorOrderMap.get(u.distributorProfile.id) ?? 0 : 0)
      + (custJobMap.get(u.id) ?? 0)
      + (u.providerProfile ? provJobMap.get(u.providerProfile.id) ?? 0 : 0)
    const disputes = (custDisputeMap.get(u.id) ?? 0) + (u.providerProfile ? provDisputeMap.get(u.providerProfile.id) ?? 0 : 0)
    const hasOpenDispute = openDisputeCustomerIds.has(u.id) || (u.providerProfile ? openDisputeProviderProfileIds.has(u.providerProfile.id) : false)

    let status: AdminUserStatus = "active"
    if (!u.isActive) status = "suspended"
    else if (hasOpenDispute) status = "disputed"
    else if (u.kycStatus === "PENDING" && (u.providerProfile || u.shopkeeperProfile || u.distributorProfile)) status = "pending"

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: ROLE_LABEL[u.role] ?? u.role,
      status,
      earnings: Number(u.wallet?.totalEarned ?? 0),
      joined: u.createdAt.toISOString(),
      orders,
      disputes,
    }
  })

  const filtered = params.filter && params.filter !== "all" ? rows.filter((r) => r.status === params.filter) : rows

  return { users: filtered, totalCount, page, pageSize }
}

export type AdminUserActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ userId: z.string().trim().min(1) })

export async function toggleSuspendUser(input: unknown): Promise<AdminUserActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const user = await db.user.findUnique({ where: { id: parsed.data.userId } })
  if (!user) return { success: false, error: "User not found." }

  const nextActive = !user.isActive
  await db.user.update({ where: { id: user.id }, data: { isActive: nextActive } })
  await logAdminAction({
    userId: admin.userId,
    action: nextActive ? "user.reactivate" : "user.suspend",
    entityType: "User",
    entityId: user.id,
    oldValues: { isActive: user.isActive },
    newValues: { isActive: nextActive },
  })

  return { success: true }
}

export async function softDeleteUser(input: unknown): Promise<AdminUserActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const user = await db.user.findUnique({ where: { id: parsed.data.userId } })
  if (!user) return { success: false, error: "User not found." }

  await db.user.update({
    where: { id: user.id },
    data: { isActive: false, deletedAt: new Date(), deletionReason: "Removed by admin" },
  })
  await logAdminAction({
    userId: admin.userId,
    action: "user.delete",
    entityType: "User",
    entityId: user.id,
  })

  return { success: true }
}

const editUserSchema = z.object({
  userId: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
})

export async function editUser(input: unknown): Promise<AdminUserActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = editUserSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const user = await db.user.findUnique({ where: { id: parsed.data.userId } })
  if (!user) return { success: false, error: "User not found." }

  await db.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name, phone: parsed.data.phone || undefined },
  })
  await logAdminAction({
    userId: admin.userId,
    action: "user.edit",
    entityType: "User",
    entityId: user.id,
    oldValues: { name: user.name, phone: user.phone },
    newValues: { name: parsed.data.name, phone: parsed.data.phone },
  })

  return { success: true }
}
