import type { CustomerRow } from "@/backend/actions/pos-customers"

export type CustomerSegment = "all" | "active" | "returning" | "away" | "inactive"
export type CustomerSort = "recent" | "name" | "spent" | "points" | "visits"
export function customerDirectory(rows: CustomerRow[], segment: CustomerSegment, sort: CustomerSort, now = Date.now()): CustomerRow[] {
  const cutoff = now - 30 * 86400000
  return rows.filter(row => segment === "all" || (segment === "active" && row.isActive) || (segment === "inactive" && !row.isActive) || (segment === "returning" && row.isActive && row.visits >= 2) || (segment === "away" && row.isActive && !!row.lastSeenAt && Date.parse(row.lastSeenAt) < cutoff)).sort((a, b) => {
    const order = sort === "name" ? a.name.localeCompare(b.name) : sort === "spent" ? b.totalSpent - a.totalSpent : sort === "points" ? b.pointsBalance - a.pointsBalance : sort === "visits" ? b.visits - a.visits : (b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0) - (a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0)
    return order || a.id.localeCompare(b.id)
  })
}
