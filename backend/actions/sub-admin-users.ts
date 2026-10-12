"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireSubAdmin } from "@/backend/actions/sub-admin-dashboard"
import { logAdminAction } from "@/backend/actions/admin-dashboard"

export type SubAdminUserStatus = "active" | "pending" | "disputed" | "suspended"

export type SubAdminUserRow = {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  status: SubAdminUserStatus
  joined: string
  orders: number
}

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Customer", PROVIDER: "Provider", SHOPKEEPER: "Shopkeeper", DISTRIBUTOR: "Distributor", AGENT: "Agent",
}

export async function getSubAdminUsers(): Promise<SubAdminUserRow[]> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return []

  const users = await db.user.findMany({
    where: { deletedAt: null, role: { in: ["CUSTOMER", "PROVIDER", "SHOPKEEPER", "DISTRIBUTOR"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      providerProfile: { select: { id: true } },
      // ALL their shops: an admin asking how many orders this person has
      // means across the business, not at one counter.
      shopkeeperProfiles: { select: { id: true } },
      distributorProfile: { select: { id: true } },
    },
  })

  const providerProfileIds = users.map((u) => u.providerProfile?.id).filter((id): id is string => !!id)
  const shopkeeperProfileIds = users.flatMap((u) => u.shopkeeperProfiles.map((p) => p.id))
  const distributorProfileIds = users.map((u) => u.distributorProfile?.id).filter((id): id is string => !!id)
  const userIds = users.map((u) => u.id)

  const [customerOrderCounts, shopOrderCounts, distributorOrderCounts, customerJobCounts, providerJobCounts, openDisputeUsers] = await Promise.all([
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
    db.dispute.findMany({
      where: { status: { in: ["OPEN", "IN_REVIEW", "ESCALATED"] }, OR: [{ customerId: { in: userIds } }, { providerId: { in: providerProfileIds } }] },
      select: { customerId: true, providerId: true },
    }),
  ])

  const custOrderMap = new Map(customerOrderCounts.map((c) => [c.customerId, c._count]))
  const shopOrderMap = new Map(shopOrderCounts.map((c) => [c.shopkeeperId, c._count]))
  const distributorOrderMap = new Map(distributorOrderCounts.map((c) => [c.distributorId, c._count]))
  const custJobMap = new Map(customerJobCounts.map((c) => [c.customerId, c._count]))
  const provJobMap = new Map(providerJobCounts.map((c) => [c.providerId, c._count]))
  const openDisputeCustomerIds = new Set(openDisputeUsers.map((d) => d.customerId))
  const openDisputeProviderProfileIds = new Set(openDisputeUsers.map((d) => d.providerId).filter(Boolean))

  return users.map((u) => {
    const orders = (custOrderMap.get(u.id) ?? 0)
      + u.shopkeeperProfiles.reduce((t, p) => t + (shopOrderMap.get(p.id) ?? 0), 0)
      + (u.distributorProfile ? distributorOrderMap.get(u.distributorProfile.id) ?? 0 : 0)
      + (custJobMap.get(u.id) ?? 0)
      + (u.providerProfile ? provJobMap.get(u.providerProfile.id) ?? 0 : 0)
    const hasOpenDispute = openDisputeCustomerIds.has(u.id) || (u.providerProfile ? openDisputeProviderProfileIds.has(u.providerProfile.id) : false)

    let status: SubAdminUserStatus = "active"
    if (!u.isActive) status = "suspended"
    else if (hasOpenDispute) status = "disputed"
    else if (u.kycStatus === "PENDING" && (u.providerProfile || u.shopkeeperProfiles.length > 0 || u.distributorProfile)) status = "pending"

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: ROLE_LABEL[u.role] ?? u.role,
      status,
      joined: u.createdAt.toISOString(),
      orders,
    }
  })
}

export type SubAdminUserActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ userId: z.string().trim().min(1) })

export async function toggleSuspendUser(input: unknown): Promise<SubAdminUserActionResult> {
  const subAdmin = await requireSubAdmin()
  if (!subAdmin) return { success: false, error: "You must be signed in as a sub-admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const user = await db.user.findUnique({ where: { id: parsed.data.userId } })
  if (!user) return { success: false, error: "User not found." }

  const nextActive = !user.isActive
  await db.user.update({ where: { id: user.id }, data: { isActive: nextActive } })
  await logAdminAction({
    userId: subAdmin.userId,
    action: nextActive ? "user.reactivate" : "user.suspend",
    entityType: "User",
    entityId: user.id,
    oldValues: { isActive: user.isActive },
    newValues: { isActive: nextActive },
  })

  return { success: true }
}
