"use server"

import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/actions/admin-dashboard"

export type AuditSeverity = "info" | "warning" | "critical"

export type AdminAuditLogEntry = {
  id: string
  user: string
  role: string
  action: string
  target: string
  category: string
  severity: AuditSeverity
  timestamp: string
  ip: string | null
  device: string | null
}

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Customer", PROVIDER: "Provider", SHOPKEEPER: "Shopkeeper", DISTRIBUTOR: "Distributor",
  AGENT: "Agent", SECRETARY: "Secretary", SUB_ADMIN: "Sub-Admin", ADMIN: "Admin",
}

function deriveSeverity(action: string): AuditSeverity {
  const a = action.toLowerCase()
  if (a.includes("delete") || a.includes("reject") || a.includes("suspend") || a.includes("deactivate") || a.includes("remove")) return "critical"
  if (a.includes("approve") || a.includes("create") || a.includes("reactivate") || a.includes("activate") || a.includes("resolve") || a.includes("send")) return "info"
  return "warning"
}

function describeTarget(entityType: string, entityId: string, newValues: unknown): string {
  const nv = newValues as Record<string, unknown> | null
  if (nv && typeof nv.title === "string") return `${entityType} — ${nv.title}`
  if (nv && typeof nv.name === "string") return `${entityType} — ${nv.name}`
  return `${entityType} #${entityId.slice(0, 8)}`
}

function parseDevice(userAgent: string | null): string | null {
  if (!userAgent) return null
  const browser = userAgent.includes("Chrome") ? "Chrome" : userAgent.includes("Firefox") ? "Firefox" : userAgent.includes("Safari") ? "Safari" : "Unknown"
  const os = userAgent.includes("Windows") ? "Windows" : userAgent.includes("Mac") ? "macOS" : userAgent.includes("Android") ? "Android" : userAgent.includes("Linux") ? "Linux" : "Unknown"
  return `${browser} / ${os}`
}

export async function getAuditLogs(): Promise<AdminAuditLogEntry[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true },
  })

  return logs.map((l) => ({
    id: l.id,
    user: l.user?.name ?? "System",
    role: l.user ? (ROLE_LABEL[l.user.role] ?? l.user.role) : "System",
    action: l.action.replace(/_/g, " ").replace(/\./g, " — "),
    target: describeTarget(l.entityType, l.entityId, l.newValues),
    category: l.entityType,
    severity: deriveSeverity(l.action),
    timestamp: l.createdAt.toISOString(),
    ip: l.ipAddress,
    device: parseDevice(l.userAgent),
  }))
}

export async function getAuditLogSummary(): Promise<{ totalToday: number; criticalCount: number; activeAdmins: number }> {
  const admin = await requireAdmin()
  if (!admin) return { totalToday: 0, criticalCount: 0, activeAdmins: 0 }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const todayLogs = await db.auditLog.findMany({
    where: { createdAt: { gte: startOfToday } },
    select: { action: true, userId: true },
  })

  const criticalCount = todayLogs.filter((l) => deriveSeverity(l.action) === "critical").length
  const activeAdmins = new Set(todayLogs.map((l) => l.userId).filter(Boolean)).size

  return { totalToday: todayLogs.length, criticalCount, activeAdmins }
}
