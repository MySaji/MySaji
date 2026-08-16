"use server"

import { db } from "@/lib/db"

export type ProviderAvailabilityStatus = "available" | "busy" | "booked"

/** Real, per-provider status derived from actual Job/BlockedDate rows —
 * not a proxy like "has an active listing" or a provider's own on/off
 * toggle. "busy" = on a job right now, or has blocked today off entirely.
 * "booked" = free right now but already has an accepted job later today.
 * Batches all lookups across the given provider ids in 3 queries total,
 * regardless of how many providers are being rendered on a page. */
export async function getProviderAvailabilityStatuses(providerIds: string[]): Promise<Map<string, ProviderAvailabilityStatus>> {
  const uniqueIds = [...new Set(providerIds)]
  const statuses = new Map<string, ProviderAvailabilityStatus>(uniqueIds.map((id) => [id, "available" as const]))
  if (uniqueIds.length === 0) return statuses

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000)

  const [inProgressJobs, blockedToday, bookedTodayJobs] = await Promise.all([
    db.job.findMany({
      where: { providerId: { in: uniqueIds }, status: "IN_PROGRESS" },
      select: { providerId: true },
      distinct: ["providerId"],
    }),
    db.blockedDate.findMany({
      where: { providerId: { in: uniqueIds }, date: { gte: startOfToday, lt: startOfTomorrow } },
      select: { providerId: true },
      distinct: ["providerId"],
    }),
    db.job.findMany({
      where: { providerId: { in: uniqueIds }, status: "ACCEPTED", scheduledDate: { gte: startOfToday, lt: startOfTomorrow } },
      select: { providerId: true },
      distinct: ["providerId"],
    }),
  ])

  for (const { providerId } of blockedToday) statuses.set(providerId, "busy")
  for (const { providerId } of inProgressJobs) if (providerId) statuses.set(providerId, "busy")
  for (const { providerId } of bookedTodayJobs) {
    if (providerId && statuses.get(providerId) !== "busy") statuses.set(providerId, "booked")
  }

  return statuses
}

export async function getProviderAvailabilityStatus(providerId: string): Promise<ProviderAvailabilityStatus> {
  const statuses = await getProviderAvailabilityStatuses([providerId])
  return statuses.get(providerId) ?? "available"
}
