"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireVerified } from "@/lib/verification-gate"
import { getOrCreateConversation } from "@/lib/actions/messages"
import { pushToUser } from "@/lib/actions/push"
import { logJobEvent } from "@/lib/actions/job-events"

const REQUEST_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const MAX_NOTIFIED_PROVIDERS = 15

async function requireProvider(): Promise<{ userId: string; providerId: string; categoryId: string | null } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id, categoryId: profile.categoryId }
}

async function requireShopkeeper(): Promise<{ userId: string; shopkeeperId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "shopkeeper") return null
  const profile = await db.shopkeeperProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, shopkeeperId: profile.id }
}

// ============================= CREATE / LIST (customer) =============================

const createSchema = z.object({
  title: z.string().trim().min(3, "Give your request a short title").max(120),
  description: z.string().trim().min(10, "Add a bit more detail").max(2000),
  categoryId: z.string().trim().min(1, "Choose a category"),
  budgetMin: z.number().positive().optional(),
  budgetMax: z.number().positive().optional(),
  location: z.string().trim().min(1, "Location is required").max(200),
})

export type RequestActionResult = { success: true } | { success: false; error: string }
export type CreateRequestResult = { success: true; requestId: string } | { success: false; error: string }

/** Posts an open request and, for SERVICE-type categories, fans out a
 * notification to the top-rated verified providers in that category —
 * mirrors createEmergencyBooking's exact match filter (lib/actions/jobs.ts)
 * but as a findMany+createMany fan-out instead of picking just one.
 * PRODUCT-type categories skip fan-out: ShopkeeperProfile.shopCategory is
 * free text, not a Category FK, so there's no equivalent match query —
 * shopkeepers find these by browsing the board instead. */
export async function createCustomerRequest(input: unknown): Promise<CreateRequestResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer." }
  }

  // Progressive KYC: a posted request is broadcast to providers who will
  // spend time bidding on it, so the account behind it must be real.
  const gate = await requireVerified("service.request")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { title, description, categoryId, budgetMin, budgetMax, location } = parsed.data
  if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
    return { success: false, error: "Minimum budget can't be more than the maximum." }
  }

  const category = await db.category.findUnique({ where: { id: categoryId } })
  if (!category) return { success: false, error: "Invalid category." }

  const request = await db.customerRequest.create({
    data: {
      customerId: session.user.id,
      title,
      description,
      categoryId,
      budgetMin,
      budgetMax,
      location,
      expiresAt: new Date(Date.now() + REQUEST_LIFETIME_MS),
    },
  })

  if (category.type === "SERVICE") {
    const matchedProviders = await db.providerProfile.findMany({
      where: { categoryId, verified: true, user: { isActive: true } },
      orderBy: [{ rating: "desc" }, { completedJobs: "desc" }],
      take: MAX_NOTIFIED_PROVIDERS,
      select: { userId: true },
    })
    if (matchedProviders.length > 0) {
      await db.notification.createMany({
        data: matchedProviders.map((p) => ({
          userId: p.userId,
          title: "New request in your category",
          message: `A customer needs help with: ${title}`,
          type: "JOB" as const,
          relatedType: "CUSTOMER_REQUEST",
          relatedId: request.id,
          actionUrl: "/provider/requests",
        })),
      })
      await Promise.all(matchedProviders.map((p) =>
        pushToUser(p.userId, { title: "New request in your category", body: `A customer needs help with: ${title}`, url: "/provider/requests" }, "job"),
      ))
    }
  }

  return { success: true, requestId: request.id }
}

export type RequestResponseItem = {
  id: string
  responderId: string
  responderName: string
  responderAvatar: string | null
  message: string
  price: number
  status: "PENDING" | "ACCEPTED" | "DECLINED"
  createdAt: string
}

export type MyRequestItem = {
  id: string
  title: string
  description: string
  categoryName: string
  budgetMin: number | null
  budgetMax: number | null
  location: string
  status: string
  responseCount: number
  createdAt: string
  expiresAt: string
}

function isExpired(request: { status: string; expiresAt: Date }): boolean {
  return request.status === "OPEN" && request.expiresAt < new Date()
}

export async function getMyCustomerRequests(): Promise<MyRequestItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const requests = await db.customerRequest.findMany({
    where: { customerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { category: { select: { name: true } }, _count: { select: { responses: true } } },
  })

  return requests.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    categoryName: r.category.name,
    budgetMin: r.budgetMin != null ? Number(r.budgetMin) : null,
    budgetMax: r.budgetMax != null ? Number(r.budgetMax) : null,
    location: r.location,
    status: isExpired(r) ? "EXPIRED" : r.status,
    responseCount: r._count.responses,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }))
}

export type CustomerRequestDetail = {
  id: string
  title: string
  description: string
  categoryName: string
  budgetMin: number | null
  budgetMax: number | null
  location: string
  status: string
  createdAt: string
  expiresAt: string
  responses: RequestResponseItem[]
} | null

export async function getCustomerRequestById(id: string): Promise<CustomerRequestDetail> {
  const session = await auth()
  if (!session?.user?.id) return null

  const request = await db.customerRequest.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      responses: {
        orderBy: { createdAt: "desc" },
        include: { responder: { select: { id: true, name: true, image: true } } },
      },
    },
  })
  if (!request || request.customerId !== session.user.id) return null

  return {
    id: request.id,
    title: request.title,
    description: request.description,
    categoryName: request.category.name,
    budgetMin: request.budgetMin != null ? Number(request.budgetMin) : null,
    budgetMax: request.budgetMax != null ? Number(request.budgetMax) : null,
    location: request.location,
    status: isExpired(request) ? "EXPIRED" : request.status,
    createdAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    responses: request.responses.map((r) => ({
      id: r.id,
      responderId: r.responderId,
      responderName: r.responder.name,
      responderAvatar: r.responder.image,
      message: r.message,
      price: Number(r.price),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

const cancelSchema = z.object({ requestId: z.string().trim().min(1) })

export async function cancelCustomerRequest(input: unknown): Promise<RequestActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const request = await db.customerRequest.findUnique({ where: { id: parsed.data.requestId } })
  if (!request || request.customerId !== session.user.id) return { success: false, error: "Request not found." }
  if (request.status !== "OPEN") return { success: false, error: "This request can no longer be cancelled." }

  await db.customerRequest.update({ where: { id: request.id }, data: { status: "CANCELLED", closedAt: new Date() } })
  return { success: true }
}

// ============================= BOARD (provider / shopkeeper) =============================

export type BoardRequestItem = {
  id: string
  title: string
  description: string
  categoryName: string
  budgetMin: number | null
  budgetMax: number | null
  location: string
  responseCount: number
  myResponse: { price: number; status: string } | null
  createdAt: string
  expiresAt: string
}

/** Role-aware: providers see OPEN, non-expired SERVICE-type requests in
 * their own category; shopkeepers see OPEN, non-expired PRODUCT-type
 * requests (unscoped by category — see createCustomerRequest's note on why
 * shopkeeper category-matching isn't available). */
export async function getOpenRequestsBoard(): Promise<BoardRequestItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const provider = session.user.role === "provider" ? await requireProvider() : null
  const shopkeeper = session.user.role === "shopkeeper" ? await requireShopkeeper() : null
  if (!provider && !shopkeeper) return []

  const requests = await db.customerRequest.findMany({
    where: {
      status: "OPEN",
      expiresAt: { gt: new Date() },
      category: provider
        ? { type: "SERVICE", id: provider.categoryId ?? undefined }
        : { type: "PRODUCT" },
    },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { name: true } },
      _count: { select: { responses: true } },
      responses: { where: { responderId: session.user.id }, select: { price: true, status: true } },
    },
  })

  return requests.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    categoryName: r.category.name,
    budgetMin: r.budgetMin != null ? Number(r.budgetMin) : null,
    budgetMax: r.budgetMax != null ? Number(r.budgetMax) : null,
    location: r.location,
    responseCount: r._count.responses,
    myResponse: r.responses[0] ? { price: Number(r.responses[0].price), status: r.responses[0].status } : null,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }))
}

export type PopularRequestItem = {
  id: string
  title: string
  categoryName: string
  responseCount: number
}

/** The small "Popular requests" teaser on the customer home's Post Board
 * card. Deliberately NOT getOpenRequestsBoard — that one is the provider/
 * shopkeeper working list (role-gated, category-scoped, and it returns []
 * for a customer). This is the customer-facing social-proof view: open,
 * non-expired requests across the whole board ordered by how many
 * providers have replied, exposing only the title, category and reply
 * count — no author, budget, location or description, so nothing
 * identifying about another customer leaks onto this page.
 */
export async function getPopularOpenRequests(take = 3): Promise<PopularRequestItem[]> {
  const requests = await db.customerRequest.findMany({
    where: { status: "OPEN", expiresAt: { gt: new Date() } },
    orderBy: [{ responses: { _count: "desc" } }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      category: { select: { name: true } },
      _count: { select: { responses: true } },
    },
  })

  return requests.map((r) => ({
    id: r.id,
    title: r.title,
    categoryName: r.category.name,
    responseCount: r._count.responses,
  }))
}

const respondSchema = z.object({
  requestId: z.string().trim().min(1),
  message: z.string().trim().min(5, "Add a short message").max(1000),
  price: z.number().positive("Enter a valid price"),
})

export async function respondToRequest(input: unknown): Promise<RequestActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") {
    return { success: false, error: "Only providers and shopkeepers can respond to requests." }
  }

  // Progressive KYC: a bid is a commitment to a customer and reaches them
  // directly, so it carries the same bar as publishing an offer.
  const gate = await requireVerified("offer.submit")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = respondSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const request = await db.customerRequest.findUnique({
    where: { id: parsed.data.requestId },
    include: { category: { select: { type: true } } },
  })
  if (!request) return { success: false, error: "Request not found." }
  if (request.status !== "OPEN" || request.expiresAt < new Date()) {
    return { success: false, error: "This request is no longer open." }
  }
  if (session.user.role === "provider" && request.category.type !== "SERVICE") {
    return { success: false, error: "This request isn't open to providers." }
  }
  if (session.user.role === "shopkeeper" && request.category.type !== "PRODUCT") {
    return { success: false, error: "This request isn't open to shopkeepers." }
  }

  // Business staff can only bid on open requests under their own account if
  // their business has opted in — see ProviderProfile.allowStaffRequestResponses.
  // A solo pro or a business owner responding for themselves is unaffected.
  if (session.user.role === "provider") {
    const responderProfile = await db.providerProfile.findUnique({ where: { userId: session.user.id }, select: { parentBusinessId: true } })
    if (responderProfile?.parentBusinessId) {
      const parentBusiness = await db.providerProfile.findUnique({ where: { id: responderProfile.parentBusinessId }, select: { allowStaffRequestResponses: true } })
      if (!parentBusiness?.allowStaffRequestResponses) {
        return { success: false, error: "Your business hasn't enabled staff responses to open requests. Ask your manager to turn this on." }
      }
    }
  }

  const existing = await db.requestResponse.findFirst({ where: { requestId: request.id, responderId: session.user.id } })
  if (existing) return { success: false, error: "You've already responded to this request." }

  await db.requestResponse.create({
    data: {
      requestId: request.id,
      responderId: session.user.id,
      message: parsed.data.message,
      price: parsed.data.price,
    },
  })

  await db.notification.create({
    data: {
      userId: request.customerId,
      title: "New response to your request",
      message: `You have a new offer for "${request.title}"`,
      type: "JOB",
      relatedType: "CUSTOMER_REQUEST",
      relatedId: request.id,
      actionUrl: "/customer/requests",
    },
  })
  await pushToUser(request.customerId, {
    title: "New response to your request",
    body: `You have a new offer for "${request.title}"`,
    url: "/customer/requests",
  }, "job")

  return { success: true }
}

// ============================= ACCEPT (customer) =============================

export type AcceptResponseResult =
  | { success: true; conversationId: string; jobId: string; amount: number }
  | { success: false; error: string }

const acceptSchema = z.object({
  requestId: z.string().trim().min(1),
  responseId: z.string().trim().min(1),
  // A request carries no date of its own, so the customer supplies one when
  // they accept — same as booking a listed service. Without it the job would
  // have to invent a scheduled date, and the provider would have no idea when
  // they are expected.
  date: z.string().trim().min(1, "Choose a date"),
  time: z.string().trim().min(1, "Choose a time"),
})

export async function acceptRequestResponse(input: unknown): Promise<AcceptResponseResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = acceptSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const request = await db.customerRequest.findUnique({
    where: { id: parsed.data.requestId },
    include: { responses: true },
  })
  if (!request || request.customerId !== session.user.id) return { success: false, error: "Request not found." }
  if (request.status !== "OPEN") return { success: false, error: "This request is no longer open." }

  const chosen = request.responses.find((r) => r.id === parsed.data.responseId)
  if (!chosen) return { success: false, error: "Response not found." }

  // Accepting has to produce a real job. Until now it only closed the request
  // and opened a chat, so the agreed work existed nowhere the system could
  // track: no status to advance, no payment to take, no completion to record,
  // and nothing for the provider's earnings or the customer's order history.
  const responderProfile = await db.providerProfile.findUnique({
    where: { userId: chosen.responderId },
    select: { id: true },
  })
  if (!responderProfile) {
    // Only providers can respond to SERVICE requests (see respondToRequest),
    // so this means the responder's provider profile has gone since. Refusing
    // is right: silently closing the request with no job is the very bug this
    // is fixing.
    return { success: false, error: "That provider is no longer available. Please choose another response." }
  }

  const scheduledDate = new Date(`${parsed.data.date}T${parsed.data.time}:00`)
  if (Number.isNaN(scheduledDate.getTime())) {
    return { success: false, error: "Invalid date or time." }
  }

  const amount = Number(chosen.price)

  // PENDING_PAYMENT, exactly as createBooking leaves a new booking: the
  // customer pays into escrow next, and that payment is what moves the job
  // into the normal pipeline.
  const job = await db.job.create({
    data: {
      customerId: session.user.id,
      providerId: responderProfile.id,
      requestId: request.id,
      title: request.title,
      description: request.description,
      price: amount,
      location: request.location,
      scheduledDate,
      status: "PENDING_PAYMENT",
    },
  })

  await logJobEvent({
    jobId: job.id,
    type: "JOB_CREATED",
    actor: "CUSTOMER",
    actorUserId: session.user.id,
    description: `Customer accepted a response to "${request.title}"`,
  })

  await db.$transaction([
    db.requestResponse.update({ where: { id: chosen.id }, data: { status: "ACCEPTED" } }),
    db.requestResponse.updateMany({
      where: { requestId: request.id, id: { not: chosen.id } },
      data: { status: "DECLINED" },
    }),
    db.customerRequest.update({ where: { id: request.id }, data: { status: "ACCEPTED", closedAt: new Date() } }),
    db.notification.create({
      data: {
        userId: chosen.responderId,
        title: "Your offer was accepted!",
        message: `Your offer for "${request.title}" was accepted. The job is now in your jobs list.`,
        type: "JOB",
        relatedType: "CUSTOMER_REQUEST",
        relatedId: request.id,
        actionUrl: "/provider/jobs",
      },
    }),
  ])

  await pushToUser(chosen.responderId, {
    title: "Your offer was accepted!",
    body: `Your offer for "${request.title}" was accepted.`,
    url: "/messages",
  }, "job")

  const convResult = await getOrCreateConversation({ otherUserId: chosen.responderId })
  if (!convResult.success) return convResult

  return { success: true, conversationId: convResult.conversationId, jobId: job.id, amount }
}
