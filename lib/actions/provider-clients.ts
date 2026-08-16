"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type ClientJobSummary = { id: string; service: string; date: string; amount: number; rating: number | null; status: string }

export type ProviderClient = {
  id: string
  name: string
  phone: string | null
  avatar: string | null
  location: string
  totalJobs: number
  totalSpent: number
  avgRating: number
  lastJobDate: string
  lastService: string
  isFavorite: boolean
  isBlocked: boolean
  clientSince: string
  jobs: ClientJobSummary[]
}

export async function getProviderClients(): Promise<ProviderClient[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const jobs = await db.job.findMany({
    where: { providerId: provider.providerId, status: { not: "PENDING_PAYMENT" } },
    orderBy: { scheduledDate: "desc" },
    include: { customer: true, review: true },
  })

  const favorites = await db.follow.findMany({ where: { followerId: provider.userId } })
  const favoriteIds = new Set(favorites.map((f) => f.followingId))

  const blocked = await db.blockedClient.findMany({ where: { providerId: provider.providerId } })
  const blockedIds = new Set(blocked.map((b) => b.customerId))

  const byCustomer = new Map<string, typeof jobs>()
  for (const job of jobs) {
    const list = byCustomer.get(job.customerId) ?? []
    list.push(job)
    byCustomer.set(job.customerId, list)
  }

  const clients: ProviderClient[] = []
  for (const [customerId, customerJobs] of byCustomer) {
    const customer = customerJobs[0].customer
    const completedJobs = customerJobs.filter((j) => j.status === "COMPLETED")
    const totalSpent = completedJobs.reduce((sum, j) => sum + Number(j.price), 0)
    const ratedJobs = customerJobs.filter((j) => j.review)
    const avgRating = ratedJobs.length > 0
      ? ratedJobs.reduce((sum, j) => sum + (j.review?.rating ?? 0), 0) / ratedJobs.length
      : 0
    const sortedByScheduled = [...customerJobs].sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime())
    const oldestJob = [...customerJobs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]

    clients.push({
      id: customerId,
      name: customer.name,
      phone: customer.phone,
      avatar: customer.image,
      location: sortedByScheduled[0].location,
      totalJobs: customerJobs.length,
      totalSpent,
      avgRating,
      lastJobDate: sortedByScheduled[0].scheduledDate.toISOString(),
      lastService: sortedByScheduled[0].title,
      isFavorite: favoriteIds.has(customerId),
      isBlocked: blockedIds.has(customerId),
      clientSince: oldestJob.createdAt.toISOString(),
      jobs: customerJobs.slice(0, 5).map((j) => ({
        id: j.id,
        service: j.title,
        date: j.scheduledDate.toISOString(),
        amount: Number(j.price),
        rating: j.review?.rating ?? null,
        status: j.status,
      })),
    })
  }

  return clients.sort((a, b) => b.totalSpent - a.totalSpent)
}

export type ProviderClientActionResult = { success: true } | { success: false; error: string }

const clientIdSchema = z.object({ clientId: z.string().trim().min(1) })

export async function toggleFavoriteClient(input: unknown): Promise<ProviderClientActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = clientIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { clientId } = parsed.data

  const existing = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: provider.userId, followingId: clientId } },
  })
  if (existing) {
    await db.follow.delete({ where: { id: existing.id } })
  } else {
    await db.follow.create({ data: { followerId: provider.userId, followingId: clientId } })
  }
  return { success: true }
}

const blockClientSchema = z.object({
  clientId: z.string().trim().min(1),
  reason: z.string().trim().max(300).optional(),
})

/** Blocking is enforced server-side, not just hidden in the UI — see the
 * blocked-provider checks in createBooking()/createEmergencyBooking()
 * (lib/actions/jobs.ts), which reject/exclude on this same BlockedClient
 * row rather than relying on the client simply not showing a "book" button. */
export async function blockClient(input: unknown): Promise<ProviderClientActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = blockClientSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.blockedClient.upsert({
    where: { providerId_customerId: { providerId: provider.providerId, customerId: parsed.data.clientId } },
    update: { reason: parsed.data.reason },
    create: { providerId: provider.providerId, customerId: parsed.data.clientId, reason: parsed.data.reason },
  })
  return { success: true }
}

export async function unblockClient(input: unknown): Promise<ProviderClientActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = clientIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.blockedClient.deleteMany({ where: { providerId: provider.providerId, customerId: parsed.data.clientId } })
  return { success: true }
}
