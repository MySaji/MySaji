"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { requireVerified } from "@/backend/services/verification-gate"
import { requirePro } from "@/backend/actions/provider-subscription"
import { logJobEvent } from "@/backend/actions/job-events"
import { notifyUser } from "@/backend/actions/notify"
import { openingJobStatus } from "@/backend/services/commission-debt"

async function requireProviderId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  return profile?.id ?? null
}

export type ContractStatus = "REQUESTED" | "QUOTED" | "AGREED" | "DECLINED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
export type MilestoneStatus = "PENDING" | "COMPLETED" | "APPROVED"

// ============================= CUSTOMER: CREATE REQUEST =============================

const createRequestSchema = z.object({
  providerId: z.string().trim().min(1),
  categoryId: z.string().trim().optional(),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().min(1, "Describe what you need"),
  location: z.string().trim().min(1, "Location is required"),
})

export type CreateRequestResult = { success: true; contractId: string } | { success: false; error: string }

/** Step 1 of the Quote & Contract Layer — REQUESTED. No price exists yet;
 * that's the provider's job in submitContractQuote. */
export async function createServiceRequest(input: unknown): Promise<CreateRequestResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer to request a quote." }
  }

  // Progressive KYC: gated here rather than at each caller, because this is
  // the single entry point for formal quote requests —
  // requestOfferFormalQuote in lib/actions/offers.ts has no auth check of
  // its own and relies entirely on this one.
  const gate = await requireVerified("service.request")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = createRequestSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const provider = await db.providerProfile.findUnique({ where: { id: parsed.data.providerId }, include: { user: true } })
  if (!provider) return { success: false, error: "Provider not found." }

  const contract = await db.serviceContract.create({
    data: {
      customerId: session.user.id,
      providerId: provider.id,
      categoryId: parsed.data.categoryId,
      title: parsed.data.title,
      requestDescription: parsed.data.description,
      location: parsed.data.location,
      status: "REQUESTED",
    },
  })

  await logJobEvent({
    contractId: contract.id, type: "REQUEST_CREATED", actor: "CUSTOMER", actorUserId: session.user.id,
    description: `Customer created service request: "${parsed.data.title}"`,
  })

  await notifyUser({
    userId: provider.userId, title: "New service request", message: `New request: "${parsed.data.title}"`,
    type: "JOB", relatedType: "JOB", relatedId: contract.id, actionUrl: "/provider/requests?tab=quotes",
  })

  return { success: true, contractId: contract.id }
}

// ============================= PROVIDER: SUBMIT QUOTE =============================

const submitQuoteSchema = z.object({
  contractId: z.string().trim().min(1),
  price: z.coerce.number().positive("Enter a price greater than zero"),
  scopeOfWork: z.string().trim().min(1, "Describe the scope of work"),
  estimatedDuration: z.string().trim().min(1, "Give an estimated duration"),
  materials: z.string().trim().optional(),
  labourNotes: z.string().trim().optional(),
  terms: z.string().trim().optional(),
})

export type ContractActionResult = { success: true } | { success: false; error: string }

export async function submitContractQuote(input: unknown): Promise<ContractActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }
  const denied = await requirePro()
  if (denied) return denied

  // Progressive KYC: a contract quote is the provider's entry into an
  // escrowed, milestone-based engagement — the deepest financial commitment
  // on the platform.
  const gate = await requireVerified("escrow.participate")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = submitQuoteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const contract = await db.serviceContract.findUnique({ where: { id: parsed.data.contractId } })
  if (!contract || contract.providerId !== providerId) return { success: false, error: "Request not found." }
  if (contract.status !== "REQUESTED") return { success: false, error: "This request already has a quote." }

  await db.serviceContract.update({
    where: { id: contract.id },
    data: {
      status: "QUOTED",
      quotedPrice: parsed.data.price,
      scopeOfWork: parsed.data.scopeOfWork,
      estimatedDuration: parsed.data.estimatedDuration,
      materials: parsed.data.materials || null,
      labourNotes: parsed.data.labourNotes || null,
      terms: parsed.data.terms || null,
      quotedAt: new Date(),
    },
  })

  await logJobEvent({
    contractId: contract.id, type: "QUOTE_SUBMITTED", actor: "PROVIDER",
    description: `Provider submitted a quote: KES ${parsed.data.price.toLocaleString()}, est. ${parsed.data.estimatedDuration}`,
    metadata: { price: parsed.data.price, estimatedDuration: parsed.data.estimatedDuration },
  })

  await notifyUser({
    userId: contract.customerId, title: "Quote received", message: `You received a quote for "${contract.title}": KES ${parsed.data.price.toLocaleString()}`,
    type: "JOB", relatedType: "JOB", relatedId: contract.id, actionUrl: "/customer/requests?tab=quotes",
  })

  return { success: true }
}

// ============================= CUSTOMER: ACCEPT / DECLINE QUOTE =============================

const respondSchema = z.object({
  contractId: z.string().trim().min(1),
  accept: z.boolean(),
  declineReason: z.string().trim().optional(),
})

export type RespondToQuoteResult = { success: true; jobId?: string } | { success: false; error: string }

/** Accepting creates the real Job (reusing the existing PENDING_PAYMENT ->
 * payment -> ACCEPTED pipeline unchanged) and re-parents this contract's
 * prior REQUESTED/QUOTED events onto that job's timeline, so the Evidence
 * Timeline reads as one continuous history from "request created" through
 * to "payment released" — not two disconnected logs. */
export async function respondToContractQuote(input: unknown): Promise<RespondToQuoteResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer." }
  }

  // Progressive KYC: accepting the quote is what commits the customer's
  // money to escrow, so both sides of the contract are gated.
  const gate = await requireVerified("escrow.participate")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = respondSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const contract = await db.serviceContract.findUnique({ where: { id: parsed.data.contractId }, include: { provider: true } })
  if (!contract || contract.customerId !== session.user.id) return { success: false, error: "Request not found." }
  if (contract.status !== "QUOTED") return { success: false, error: "This request doesn't have a pending quote." }

  if (!parsed.data.accept) {
    await db.serviceContract.update({
      where: { id: contract.id },
      data: { status: "DECLINED", declinedAt: new Date(), declineReason: parsed.data.declineReason || null },
    })
    await logJobEvent({
      contractId: contract.id, type: "QUOTE_DECLINED", actor: "CUSTOMER", actorUserId: session.user.id,
      description: parsed.data.declineReason ? `Customer declined the quote: ${parsed.data.declineReason}` : "Customer declined the quote",
    })
    await notifyUser({
      userId: contract.provider.userId, title: "Quote declined", message: `Your quote for "${contract.title}" was declined.`, type: "JOB", relatedType: "JOB", relatedId: contract.id, actionUrl: "/provider/requests?tab=quotes",
    })
    return { success: true }
  }

  if (contract.quotedPrice == null) return { success: false, error: "This quote is missing a price." }

  const job = await db.job.create({
    data: {
      customerId: session.user.id,
      providerId: contract.providerId,
      title: contract.title,
      description: contract.scopeOfWork || contract.requestDescription,
      price: contract.quotedPrice,
      location: contract.location,
      scheduledDate: new Date(),
      // Not hardcoded: where the customer pays the provider directly this
      // must open as PENDING or the job is invisible to the provider and
      // waits forever for money that is never coming through the platform.
      status: await openingJobStatus(),
    },
  })

  await db.serviceContract.update({
    where: { id: contract.id },
    data: { status: "AGREED", agreedAt: new Date(), jobId: job.id },
  })

  // Re-parent the pre-agreement events onto the new job's timeline.
  await db.jobEvent.updateMany({ where: { contractId: contract.id }, data: { jobId: job.id } })

  await logJobEvent({
    jobId: job.id, type: "AGREEMENT_REACHED", actor: "CUSTOMER", actorUserId: session.user.id,
    description: "Customer accepted the quote and entered into agreement",
  })

  await notifyUser({
    userId: contract.provider.userId, title: "Quote accepted", message: `"${contract.title}" was accepted, awaiting payment.`, type: "JOB", relatedType: "JOB", relatedId: job.id, actionUrl: "/provider/jobs",
  })

  return { success: true, jobId: job.id }
}

// ============================= MILESTONES =============================

const addMilestoneSchema = z.object({
  contractId: z.string().trim().min(1),
  title: z.string().trim().min(1, "Milestone title is required"),
  description: z.string().trim().optional(),
  amount: z.coerce.number().positive().optional(),
})

export async function addContractMilestone(input: unknown): Promise<ContractActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }
  const denied = await requirePro()
  if (denied) return denied

  const parsed = addMilestoneSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const contract = await db.serviceContract.findUnique({ where: { id: parsed.data.contractId } })
  if (!contract || contract.providerId !== providerId) return { success: false, error: "Contract not found." }
  if (contract.status !== "AGREED" && contract.status !== "IN_PROGRESS") {
    return { success: false, error: "Milestones can only be added once the agreement is in place." }
  }

  const count = await db.contractMilestone.count({ where: { contractId: contract.id } })
  await db.contractMilestone.create({
    data: { contractId: contract.id, title: parsed.data.title, description: parsed.data.description || null, amount: parsed.data.amount, order: count },
  })

  if (contract.jobId) {
    await logJobEvent({ jobId: contract.jobId, type: "MILESTONE_ADDED", actor: "PROVIDER", description: `Milestone added: ${parsed.data.title}` })
  }

  return { success: true }
}

const milestoneIdSchema = z.object({ milestoneId: z.string().trim().min(1) })

export async function markMilestoneComplete(input: unknown): Promise<ContractActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = milestoneIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const milestone = await db.contractMilestone.findUnique({ where: { id: parsed.data.milestoneId }, include: { contract: true } })
  if (!milestone || milestone.contract.providerId !== providerId) return { success: false, error: "Milestone not found." }
  if (milestone.status !== "PENDING") return { success: false, error: "This milestone was already marked complete." }

  await db.contractMilestone.update({ where: { id: milestone.id }, data: { status: "COMPLETED", completedAt: new Date() } })

  if (milestone.contract.jobId) {
    await logJobEvent({ jobId: milestone.contract.jobId, type: "MILESTONE_COMPLETED", actor: "PROVIDER", description: `Provider marked milestone complete: ${milestone.title}` })
  }

  await notifyUser({
    userId: milestone.contract.customerId, title: "Milestone completed", message: `"${milestone.title}" is ready for your approval.`, type: "JOB", relatedType: "JOB", relatedId: milestone.contract.jobId ?? milestone.contractId, actionUrl: "/customer/jobs",
  })

  return { success: true }
}

export async function approveMilestone(input: unknown): Promise<ContractActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") return { success: false, error: "You must be signed in as a customer." }

  const parsed = milestoneIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const milestone = await db.contractMilestone.findUnique({ where: { id: parsed.data.milestoneId }, include: { contract: true } })
  if (!milestone || milestone.contract.customerId !== session.user.id) return { success: false, error: "Milestone not found." }
  if (milestone.status !== "COMPLETED") return { success: false, error: "This milestone isn't ready for approval yet." }

  await db.contractMilestone.update({ where: { id: milestone.id }, data: { status: "APPROVED", approvedAt: new Date() } })

  if (milestone.contract.jobId) {
    await logJobEvent({ jobId: milestone.contract.jobId, type: "MILESTONE_APPROVED", actor: "CUSTOMER", actorUserId: session.user.id, description: `Customer approved milestone: ${milestone.title}` })
  }

  return { success: true }
}

// ============================= READS =============================

export type ContractListItem = {
  id: string
  title: string
  status: ContractStatus
  otherPartyName: string
  otherPartyAvatar: string | null
  quotedPrice: number | null
  location: string
  jobId: string | null
  createdAt: string
}

export async function getMyServiceRequestsAsCustomer(): Promise<ContractListItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const contracts = await db.serviceContract.findMany({
    where: { customerId: session.user.id },
    include: { provider: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  })

  return contracts.map((c) => ({
    id: c.id, title: c.title, status: c.status, otherPartyName: c.provider.user.name, otherPartyAvatar: c.provider.user.image,
    quotedPrice: c.quotedPrice != null ? Number(c.quotedPrice) : null, location: c.location, jobId: c.jobId, createdAt: c.createdAt.toISOString(),
  }))
}

export async function getMyServiceRequestsAsProvider(): Promise<ContractListItem[]> {
  const providerId = await requireProviderId()
  if (!providerId) return []

  const contracts = await db.serviceContract.findMany({
    where: { providerId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  })

  return contracts.map((c) => ({
    id: c.id, title: c.title, status: c.status, otherPartyName: c.customer.name, otherPartyAvatar: c.customer.image,
    quotedPrice: c.quotedPrice != null ? Number(c.quotedPrice) : null, location: c.location, jobId: c.jobId, createdAt: c.createdAt.toISOString(),
  }))
}

export type ContractMilestoneItem = {
  id: string
  title: string
  description: string | null
  amount: number | null
  status: MilestoneStatus
}

export type ContractDetail = {
  id: string
  title: string
  requestDescription: string
  location: string
  status: ContractStatus
  customerId: string
  customerName: string
  providerId: string
  providerName: string
  providerAvatar: string | null
  quotedPrice: number | null
  scopeOfWork: string | null
  estimatedDuration: string | null
  materials: string | null
  labourNotes: string | null
  terms: string | null
  declineReason: string | null
  jobId: string | null
  milestones: ContractMilestoneItem[]
} | null

export async function getContractDetail(contractId: string): Promise<ContractDetail> {
  const session = await auth()
  if (!session?.user?.id) return null

  const contract = await db.serviceContract.findUnique({
    where: { id: contractId },
    include: { provider: { include: { user: true } }, customer: true, milestones: { orderBy: { order: "asc" } } },
  })
  if (!contract) return null

  const isCustomer = contract.customerId === session.user.id
  const isProvider = contract.provider.userId === session.user.id
  if (!isCustomer && !isProvider && session.user.role !== "admin") return null

  return {
    id: contract.id,
    title: contract.title,
    requestDescription: contract.requestDescription,
    location: contract.location,
    status: contract.status,
    customerId: contract.customerId,
    customerName: contract.customer.name,
    providerId: contract.providerId,
    providerName: contract.provider.user.name,
    providerAvatar: contract.provider.user.image,
    quotedPrice: contract.quotedPrice != null ? Number(contract.quotedPrice) : null,
    scopeOfWork: contract.scopeOfWork,
    estimatedDuration: contract.estimatedDuration,
    materials: contract.materials,
    labourNotes: contract.labourNotes,
    terms: contract.terms,
    declineReason: contract.declineReason,
    jobId: contract.jobId,
    milestones: contract.milestones.map((m) => ({
      id: m.id, title: m.title, description: m.description, amount: m.amount != null ? Number(m.amount) : null, status: m.status,
    })),
  }
}

/** Milestones for a Job (once agreed) — used by the job detail views
 * alongside the Evidence Timeline. Empty for jobs that didn't go through
 * the Quote & Contract Layer (a regular instant-book Job has no contract
 * at all). */
export async function getJobMilestones(jobId: string): Promise<ContractMilestoneItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const contract = await db.serviceContract.findUnique({ where: { jobId }, include: { provider: true, milestones: { orderBy: { order: "asc" } } } })
  if (!contract) return []

  const isCustomer = contract.customerId === session.user.id
  const isProvider = contract.provider.userId === session.user.id
  if (!isCustomer && !isProvider && session.user.role !== "admin") return []

  return contract.milestones.map((m) => ({
    id: m.id, title: m.title, description: m.description, amount: m.amount != null ? Number(m.amount) : null, status: m.status,
  }))
}
