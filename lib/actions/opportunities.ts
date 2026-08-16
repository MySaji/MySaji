"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"

async function requireProvider(): Promise<{ userId: string; providerId: string; categoryId: string | null } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id, categoryId: profile.categoryId }
}

export type OpportunityStatus = "OPEN" | "CLOSED" | "EXPIRED"
export type OpportunityActionResult = { success: true } | { success: false; error: string }

const postSchema = z.object({
  categoryId: z.string().trim().min(1),
  location: z.string().trim().min(1, "Location is required"),
  preferredTime: z.string().trim().optional(),
  budget: z.coerce.number().positive().optional(),
  description: z.string().trim().min(1, "Describe what you need"),
  expiresInHours: z.coerce.number().int().positive().default(24),
})

/** Only real, matching-category providers get notified (no invented ML
 * matching — a direct categoryId filter, same honest scope as everywhere
 * else in this app that claims "matching" without a real recommendation
 * engine). Never notifies the poster themselves. */
export async function postOpportunity(input: unknown): Promise<OpportunityActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.providerOpportunity.create({
    data: {
      postedByProviderId: provider.providerId, categoryId: parsed.data.categoryId, location: parsed.data.location,
      preferredTime: parsed.data.preferredTime || null, budget: parsed.data.budget, description: parsed.data.description,
      expiresAt: new Date(Date.now() + parsed.data.expiresInHours * 3600000),
    },
  })

  const matchingProviders = await db.providerProfile.findMany({
    where: { categoryId: parsed.data.categoryId, id: { not: provider.providerId }, verified: true },
    select: { userId: true },
    take: 50,
  })
  await Promise.all(matchingProviders.map((p) =>
    db.notification.create({
      data: { userId: p.userId, title: "New opportunity nearby", message: parsed.data.description.slice(0, 100), type: "SYSTEM", actionUrl: "/provider/opportunities" },
    }).catch(() => {})
  ))

  return { success: true }
}

export type OpportunityItem = {
  id: string
  postedByName: string
  categoryName: string | null
  location: string
  preferredTime: string | null
  budget: number | null
  description: string
  status: OpportunityStatus
  responseCount: number
  createdAt: string
  expiresAt: string
}

export async function getOpenOpportunities(): Promise<OpportunityItem[]> {
  const provider = await requireProvider()
  if (!provider) return []

  // Lazy reconciliation — flip anything past its expiry before reading.
  await db.providerOpportunity.updateMany({ where: { status: "OPEN", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } })

  const opportunities = await db.providerOpportunity.findMany({
    where: { status: "OPEN", postedByProviderId: { not: provider.providerId }, ...(provider.categoryId ? { categoryId: provider.categoryId } : {}) },
    include: { postedBy: { include: { user: true } }, category: true, _count: { select: { responses: true } } },
    orderBy: { createdAt: "desc" },
  })

  return opportunities.map((o) => ({
    id: o.id, postedByName: o.postedBy.user.name, categoryName: o.category.name, location: o.location, preferredTime: o.preferredTime,
    budget: o.budget != null ? Number(o.budget) : null, description: o.description, status: o.status, responseCount: o._count.responses,
    createdAt: o.createdAt.toISOString(), expiresAt: o.expiresAt.toISOString(),
  }))
}

export async function getMyOpportunities(): Promise<OpportunityItem[]> {
  const provider = await requireProvider()
  if (!provider) return []

  await db.providerOpportunity.updateMany({ where: { status: "OPEN", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } })

  const opportunities = await db.providerOpportunity.findMany({
    where: { postedByProviderId: provider.providerId },
    include: { postedBy: { include: { user: true } }, category: true, _count: { select: { responses: true } } },
    orderBy: { createdAt: "desc" },
  })

  return opportunities.map((o) => ({
    id: o.id, postedByName: o.postedBy.user.name, categoryName: o.category.name, location: o.location, preferredTime: o.preferredTime,
    budget: o.budget != null ? Number(o.budget) : null, description: o.description, status: o.status, responseCount: o._count.responses,
    createdAt: o.createdAt.toISOString(), expiresAt: o.expiresAt.toISOString(),
  }))
}

const respondSchema = z.object({ opportunityId: z.string().trim().min(1), message: z.string().trim().min(1, "Write a short message") })

export async function respondToOpportunity(input: unknown): Promise<OpportunityActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = respondSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const opportunity = await db.providerOpportunity.findUnique({ where: { id: parsed.data.opportunityId }, include: { postedBy: true } })
  if (!opportunity || opportunity.status !== "OPEN") return { success: false, error: "This opportunity is no longer open." }

  await db.opportunityResponse.create({ data: { opportunityId: opportunity.id, responderProviderId: provider.providerId, message: parsed.data.message } })

  await db.notification.create({
    data: { userId: opportunity.postedBy.userId, title: "New response to your opportunity", message: parsed.data.message.slice(0, 100), type: "SYSTEM", actionUrl: "/provider/opportunities" },
  }).catch(() => {})

  return { success: true }
}

export type OpportunityResponseItem = { id: string; responderName: string; responderRating: number; message: string; createdAt: string }

export async function getOpportunityResponses(opportunityId: string): Promise<OpportunityResponseItem[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const opportunity = await db.providerOpportunity.findUnique({ where: { id: opportunityId } })
  if (!opportunity || opportunity.postedByProviderId !== provider.providerId) return []

  const responses = await db.opportunityResponse.findMany({ where: { opportunityId }, include: { responder: { include: { user: true } } }, orderBy: { createdAt: "desc" } })
  return responses.map((r) => ({ id: r.id, responderName: r.responder.user.name, responderRating: Number(r.responder.rating), message: r.message, createdAt: r.createdAt.toISOString() }))
}

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function closeOpportunity(input: unknown): Promise<OpportunityActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const result = await db.providerOpportunity.updateMany({ where: { id: parsed.data.id, postedByProviderId: provider.providerId }, data: { status: "CLOSED" } })
  if (result.count === 0) return { success: false, error: "Opportunity not found." }
  return { success: true }
}
