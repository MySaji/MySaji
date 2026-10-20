"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { activeUser } from "@/backend/services/active-user"

const filters = z.object({
  days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).default(7),
  storeId: z.string().max(60).optional(), employeeId: z.string().max(60).optional(),
  action: z.string().max(60).optional(), search: z.string().trim().max(100).default(""),
  page: z.number().int().min(1).max(200).default(1),
  from: z.string().max(10).default(""), to: z.string().max(10).default(""),
})

export async function getPosEmployeeAudit(input: unknown = {}) {
  const user = await activeUser()
  if (!user) return { success: false as const, error: "Sign in as the Till owner to view employee activity." }
  // Ownership is checked directly: a staff permission or role cannot grant this report.
  const business = await db.posBusiness.findUnique({ where: { ownerUserId: user.id }, select: { id: true } })
  if (!business) return { success: false as const, error: "Only the business owner can view employee activity." }
  const parsed = filters.safeParse(input)
  if (!parsed.success) return { success: false as const, error: "Choose a valid date range and filters." }
  const f = parsed.data
  const calendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  if ((f.from || f.to) && (!f.from || !f.to || !calendarDate(f.from) || !calendarDate(f.to) || f.from > f.to)) {
    return { success: false as const, error: "Choose valid From and To dates, with From on or before To." }
  }
  const [staff, stores] = await Promise.all([
    db.posStaff.findMany({ where: { businessId: business.id }, select: { id: true, name: true, role: true, userId: true, isActive: true }, orderBy: { name: "asc" } }),
    db.posStore.findMany({ where: { businessId: business.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])
  if (f.storeId && !stores.some(s => s.id === f.storeId)) return { success: false as const, error: "That branch is not part of your business." }
  if (f.employeeId && !staff.some(s => s.id === f.employeeId)) return { success: false as const, error: "That employee is not part of your business." }
  // Calendar days include the whole selected day in East Africa Time (UTC+03).
  const endExclusive = f.to ? new Date(new Date(`${f.to}T00:00:00+03:00`).getTime() + 86_400_000) : null
  const until = endExclusive ? new Date(endExclusive.getTime() - 1) : new Date()
  const since = f.from ? new Date(`${f.from}T00:00:00+03:00`) : new Date(until.getTime() - f.days * 86_400_000)
  const base = { businessId: business.id, createdAt: { gte: since, ...(endExclusive ? { lt: endExclusive } : { lte: until }) }, ...(f.storeId ? { storeId: f.storeId } : {}) }
  const groups = await db.posAuditEvent.groupBy({
    by: ["actorStaffId", "actorUserId", "action"], where: base,
    _count: { _all: true }, _max: { createdAt: true },
  })
  const byStaff = new Map(staff.map(s => [s.id, s]))
  // An explicit counter PIN always wins over the account signed into the device.
  // Only unambiguous individual accounts can supply the legacy fallback.
  const staffForUser = (id: string | null) => {
    if (!id || id === user.id) return undefined
    const seats = staff.filter(s => s.userId === id)
    return seats.length === 1 ? seats[0] : undefined
  }
  const identify = (row: { actorStaffId: string | null; actorUserId: string | null }) => row.actorStaffId ? byStaff.get(row.actorStaffId) : staffForUser(row.actorUserId)
  const people = staff.map(s => ({ id: s.id, name: s.name, role: s.role, enabled: s.isActive, actions: 0, receipts: 0, catalogue: 0, stock: 0, shifts: 0, review: 0, lastActivity: null as string | null }))
  const ranking = new Map(people.map(s => [s.id, s]))
  let totalActions = 0, ownerActions = 0, unattributedActions = 0
  for (const row of groups) {
    const count = row._count._all
    totalActions += count
    const person = identify(row)
    const target = person ? ranking.get(person.id) : undefined
    if (!target) {
      if (!row.actorStaffId && row.actorUserId === user.id) ownerActions += count
      else unattributedActions += count
      continue
    }
    target.actions += count
    if (row.action === "receipt.issue") target.receipts += count
    if (row.action.startsWith("product.")) target.catalogue += count
    if (/^(stock|stocktake|transfer|purchase)\./.test(row.action)) target.stock += count
    if (row.action.startsWith("shift.")) target.shifts += count
    if (/void|refund|delete|revoke|permission|role_changed|^team\.(update|disable|enable)/.test(row.action)) target.review += count
    const at = row._max.createdAt?.toISOString() ?? null
    if (at && (!target.lastActivity || at > target.lastActivity)) target.lastActivity = at
  }
  people.sort((a, b) => b.actions - a.actions || (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "") || a.name.localeCompare(b.name))
  const selected = f.employeeId ? byStaff.get(f.employeeId) : undefined
  const fallback = selected?.userId && staffForUser(selected.userId)?.id === selected.id ? selected.userId : null
  const where = {
    ...base,
    ...(selected ? { OR: [{ actorStaffId: selected.id }, ...(fallback ? [{ actorStaffId: null, actorUserId: fallback }] : [])] } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.search ? { summary: { contains: f.search, mode: "insensitive" as const } } : {}),
  }
  const [count, events] = await Promise.all([
    db.posAuditEvent.count({ where }),
    db.posAuditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * 50, take: 50,
      select: { id: true, createdAt: true, action: true, summary: true, actorStaffId: true, actorUserId: true, storeId: true, entityType: true, entityId: true } }),
  ])
  return { success: true as const, data: {
    since: since.toISOString(), until: until.toISOString(), totalActions, ownerActions, unattributedActions,
    people, stores, actions: [...new Set(groups.map(g => g.action))].sort(), count, page: f.page,
    events: events.map(e => ({ id: e.id, at: e.createdAt.toISOString(), action: e.action, summary: e.summary,
      who: identify(e)?.name ?? (e.actorStaffId ? "Former or unavailable employee" : e.actorUserId === user.id ? `${user.name ?? "Business owner"} (owner)` : "Unattributed / system"),
      store: stores.find(s => s.id === e.storeId)?.name ?? "Business-wide / former branch", entityType: e.entityType, entityId: e.entityId })),
  } }
}

export type PosEmployeeAudit = Extract<Awaited<ReturnType<typeof getPosEmployeeAudit>>, { success: true }>["data"]
