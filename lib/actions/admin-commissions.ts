"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"

export type AdminCommissionTier = {
  id: string
  name: string
  role: "Provider" | "Shopkeeper" | "Agent" | "Distributor"
  rate: number
  minJobs: number
  status: "active" | "paused"
  createdAt: string
}

const ROLE_TO_DB: Record<string, "PROVIDER" | "SHOPKEEPER" | "AGENT" | "DISTRIBUTOR"> = { Provider: "PROVIDER", Shopkeeper: "SHOPKEEPER", Agent: "AGENT", Distributor: "DISTRIBUTOR" }
const ROLE_FROM_DB: Record<string, "Provider" | "Shopkeeper" | "Agent" | "Distributor"> = { PROVIDER: "Provider", SHOPKEEPER: "Shopkeeper", AGENT: "Agent", DISTRIBUTOR: "Distributor" }

export async function getCommissionTiers(): Promise<AdminCommissionTier[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const tiers = await db.commissionTier.findMany({ orderBy: [{ role: "asc" }, { rate: "desc" }] })
  return tiers.map((t) => ({
    id: t.id,
    name: t.name,
    role: ROLE_FROM_DB[t.role] ?? "Provider",
    rate: Number(t.rate),
    minJobs: t.minJobs ?? 0,
    status: t.status === "ACTIVE" ? "active" : "paused",
    createdAt: t.createdAt.toISOString(),
  }))
}

export type AdminCommissionActionResult = { success: true } | { success: false; error: string }

const tierSchema = z.object({
  name: z.string().trim().min(1, "Tier name is required"),
  role: z.enum(["Provider", "Shopkeeper", "Agent", "Distributor"]),
  rate: z.number().min(0, "Rate must be 0 or higher").max(50, "Rate can't exceed 50%"),
  minJobs: z.number().int().min(0).optional(),
})

export async function createCommissionTier(input: unknown): Promise<AdminCommissionActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = tierSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { name, role, rate, minJobs } = parsed.data

  const tier = await db.commissionTier.create({
    data: { name, role: ROLE_TO_DB[role], rate, minJobs: minJobs ?? 0, createdById: admin.userId },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "commission_tier.create",
    entityType: "CommissionTier",
    entityId: tier.id,
    newValues: { name, role, rate, minJobs },
  })

  return { success: true }
}

const updateTierSchema = tierSchema.extend({ id: z.string().trim().min(1) })

export async function updateCommissionTier(input: unknown): Promise<AdminCommissionActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = updateTierSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { id, name, role, rate, minJobs } = parsed.data

  const existing = await db.commissionTier.findUnique({ where: { id } })
  if (!existing) return { success: false, error: "Tier not found." }

  await db.commissionTier.update({
    where: { id },
    data: { name, role: ROLE_TO_DB[role], rate, minJobs: minJobs ?? 0 },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "commission_tier.update",
    entityType: "CommissionTier",
    entityId: id,
    oldValues: { name: existing.name, role: existing.role, rate: Number(existing.rate), minJobs: existing.minJobs },
    newValues: { name, role, rate, minJobs },
  })

  return { success: true }
}

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function toggleCommissionTierStatus(input: unknown): Promise<AdminCommissionActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const tier = await db.commissionTier.findUnique({ where: { id: parsed.data.id } })
  if (!tier) return { success: false, error: "Tier not found." }

  const nextStatus = tier.status === "ACTIVE" ? "PAUSED" : "ACTIVE"
  await db.commissionTier.update({ where: { id: tier.id }, data: { status: nextStatus } })

  await logAdminAction({
    userId: admin.userId,
    action: nextStatus === "PAUSED" ? "commission_tier.pause" : "commission_tier.activate",
    entityType: "CommissionTier",
    entityId: tier.id,
    oldValues: { status: tier.status },
    newValues: { status: nextStatus },
  })

  return { success: true }
}

export async function deleteCommissionTier(input: unknown): Promise<AdminCommissionActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const tier = await db.commissionTier.findUnique({ where: { id: parsed.data.id } })
  if (!tier) return { success: false, error: "Tier not found." }

  await db.commissionTier.delete({ where: { id: tier.id } })

  await logAdminAction({
    userId: admin.userId,
    action: "commission_tier.delete",
    entityType: "CommissionTier",
    entityId: tier.id,
    oldValues: { name: tier.name, role: tier.role, rate: Number(tier.rate) },
  })

  return { success: true }
}

export type CommissionChangeEvent = { id: string; date: string; change: string; by: string; type: "add" | "edit" | "delete" | "pause" | "activate" }

const ACTION_TYPE: Record<string, CommissionChangeEvent["type"]> = {
  "commission_tier.create": "add",
  "commission_tier.update": "edit",
  "commission_tier.delete": "delete",
  "commission_tier.pause": "pause",
  "commission_tier.activate": "activate",
}

function describeChange(action: string, oldValues: unknown, newValues: unknown): string {
  const nv = newValues as { name?: string; rate?: number } | null
  const ov = oldValues as { name?: string; rate?: number } | null
  if (action === "commission_tier.create") return `New tier "${nv?.name}" added at ${nv?.rate}%`
  if (action === "commission_tier.delete") return `Tier "${ov?.name}" deleted`
  if (action === "commission_tier.pause") return `Tier "${ov?.name ?? nv?.name}" paused`
  if (action === "commission_tier.activate") return `Tier "${ov?.name ?? nv?.name}" activated`
  if (action === "commission_tier.update" && ov?.rate !== nv?.rate) return `"${nv?.name}" rate changed from ${ov?.rate}% to ${nv?.rate}%`
  return `"${nv?.name ?? ov?.name}" updated`
}

export async function getCommissionChangeHistory(): Promise<CommissionChangeEvent[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const logs = await db.auditLog.findMany({
    where: { entityType: "CommissionTier" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: true },
  })

  return logs.map((l) => ({
    id: l.id,
    date: l.createdAt.toISOString(),
    change: describeChange(l.action, l.oldValues, l.newValues),
    by: l.user?.name ?? "System",
    type: ACTION_TYPE[l.action] ?? "edit",
  }))
}

/** Real collected commission (not a projection) — summed from the
 * PlatformRevenue ledger written by completeJob/checkout/placeWholesaleOrder
 * at the moment each is settled. Reversed entries (cancelled orders) are
 * excluded so this always reflects commission actually retained. */
export async function getEstimatedCommissionRevenue(): Promise<{ ytd: number; monthGrowthPct: number }> {
  const admin = await requireAdmin()
  if (!admin) return { ytd: 0, monthGrowthPct: 0 }

  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [ytdAgg, thisMonthAgg, lastMonthAgg] = await Promise.all([
    db.platformRevenue.aggregate({ where: { reversedAt: null, createdAt: { gte: startOfYear } }, _sum: { commissionAmount: true } }),
    db.platformRevenue.aggregate({ where: { reversedAt: null, createdAt: { gte: startOfThisMonth } }, _sum: { commissionAmount: true } }),
    db.platformRevenue.aggregate({ where: { reversedAt: null, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } }, _sum: { commissionAmount: true } }),
  ])

  const ytd = Number(ytdAgg._sum.commissionAmount ?? 0)
  const thisMonth = Number(thisMonthAgg._sum.commissionAmount ?? 0)
  const lastMonth = Number(lastMonthAgg._sum.commissionAmount ?? 0)
  const monthGrowthPct = lastMonth === 0 ? (thisMonth > 0 ? 100 : 0) : Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10

  return { ytd: Math.round(ytd), monthGrowthPct }
}
