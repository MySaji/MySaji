"use server"

import { z } from "zod"
import { MAX_PHOTOS, MAX_PHOTO_CHARS } from "@/lib/request-photos"
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

/**
 * What this account can answer an open request as.
 *
 * Derived from the profiles it actually owns rather than from `role`, which
 * can only ever name one of them. A Saji Pro is a single account that may
 * both offer services and sell products, and before this it was forked on
 * role alone — so a Pro who ticked "Sell Products" (role PROVIDER) could
 * never see a PRODUCT request, let alone bid on one. A plain shopkeeper
 * account and a plain service provider both keep exactly what they had.
 */
async function getResponderProfiles(): Promise<{
  userId: string
  provider: { providerId: string; categoryId: string | null } | null
  shop: { shopkeeperId: string } | null
} | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      providerProfile: { select: { id: true, categoryId: true } },
      shopkeeperProfile: { select: { id: true } },
      proCapabilities: { where: { status: "ACTIVE" }, select: { type: true } },
    },
  })
  if (!user) return null

  // Owning a profile is not the same as doing the work. Every Saji Pro has a
  // ProviderProfile — including one that only sells products — so the halves
  // are decided by the account's business types, not by which rows exist.
  // "Sell Products" answers the product board; every other business type
  // answers the service board (a rental or a lesson is requested under a
  // SERVICE category, there is no third board). An account with no business
  // types on record predates the feature and keeps what it had: both halves,
  // subject to the profiles it owns.
  const types = user.proCapabilities.map((c) => c.type as string)
  const legacy = types.length === 0
  const offersServices = legacy || types.some((t) => t !== "PRODUCTS")
  const sellsProducts = legacy || types.includes("PRODUCTS")

  return {
    userId: session.user.id,
    provider: user.providerProfile && offersServices
      ? { providerId: user.providerProfile.id, categoryId: user.providerProfile.categoryId }
      : null,
    shop: user.shopkeeperProfile && sellsProducts
      ? { shopkeeperId: user.shopkeeperProfile.id }
      : null,
  }
}

// ============================= CREATE / LIST (customer) =============================

const createSchema = z.object({
  title: z.string().trim().min(3, "Give your request a short title").max(120),
  description: z.string().trim().min(10, "Add a bit more detail").max(2000),
  categoryId: z.string().trim().min(1, "Choose a category"),
  budgetMin: z.number().positive().optional(),
  budgetMax: z.number().positive().optional(),
  location: z.string().trim().min(1, "Location is required").max(200),
  // Compressed data URLs from compressImageToDataUrl. Capped in count and in
  // size because these land in a Postgres column, not object storage: four
  // photos at the 1.5MB ceiling is already a heavy row, and letting an
  // arbitrary string through here would make the request board unloadable.
  photos: z
    .array(z.string().startsWith("data:image/", "Attachments must be images").max(MAX_PHOTO_CHARS, "That photo is too large"))
    .max(MAX_PHOTOS, `You can attach up to ${MAX_PHOTOS} photos`)
    .optional(),
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
  const { title, description, categoryId, budgetMin, budgetMax, location, photos } = parsed.data
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
      photos: photos?.length ? { create: photos.map((dataUrl) => ({ dataUrl })) } : undefined,
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
  /// Which pipeline accepting a response settles into — a SERVICE request
  /// becomes a Job and needs scheduling, a PRODUCT request becomes an Order
  /// and does not. The accept UI branches on this.
  categoryType: "SERVICE" | "PRODUCT"
  budgetMin: number | null
  budgetMax: number | null
  location: string
  status: string
  createdAt: string
  expiresAt: string
  photos: string[]
  responses: RequestResponseItem[]
} | null

export async function getCustomerRequestById(id: string): Promise<CustomerRequestDetail> {
  const session = await auth()
  if (!session?.user?.id) return null

  const request = await db.customerRequest.findUnique({
    where: { id },
    include: {
      category: { select: { name: true, type: true } },
      photos: { orderBy: { createdAt: "asc" }, select: { dataUrl: true } },
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
    categoryType: request.category.type === "PRODUCT" ? "PRODUCT" : "SERVICE",
    budgetMin: request.budgetMin != null ? Number(request.budgetMin) : null,
    budgetMax: request.budgetMax != null ? Number(request.budgetMax) : null,
    location: request.location,
    status: isExpired(request) ? "EXPIRED" : request.status,
    createdAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    photos: request.photos.map((p) => p.dataUrl),
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
  /// Count only — the photos themselves are fetched when a provider opens the
  /// request, so a board of ten requests is not tens of megabytes of base64.
  photoCount: number
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

  const me = await getResponderProfiles()
  if (!me || (!me.provider && !me.shop)) return []

  // An account that does both gets both halves of the board in one list,
  // rather than whichever half its `role` happens to name.
  const categoryClauses: { category: { type: "SERVICE" | "PRODUCT"; id?: string } }[] = []
  if (me.provider) {
    categoryClauses.push({
      category: { type: "SERVICE", ...(me.provider.categoryId ? { id: me.provider.categoryId } : {}) },
    })
  }
  if (me.shop) categoryClauses.push({ category: { type: "PRODUCT" } })

  const requests = await db.customerRequest.findMany({
    where: {
      status: "OPEN",
      expiresAt: { gt: new Date() },
      OR: categoryClauses,
    },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { name: true } },
      _count: { select: { responses: true, photos: true } },
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
    photoCount: r._count.photos,
    myResponse: r.responses[0] ? { price: Number(r.responses[0].price), status: r.responses[0].status } : null,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }))
}

/**
 * The photos on one open request, fetched only when a provider or shopkeeper
 * actually opens it to respond.
 *
 * Deliberately separate from getOpenRequestsBoard: these are base64 data URLs
 * in Postgres, so folding them into the list would put every photo of every
 * open request on the wire to draw a board that shows none of them. The board
 * carries photoCount; this fills in the pictures on demand.
 *
 * Scoped the same way the board is — a caller only ever gets photos for a
 * request they could already see there, or for their own request.
 */
export async function getRequestPhotos(requestId: string): Promise<string[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const request = await db.customerRequest.findUnique({
    where: { id: requestId },
    select: {
      customerId: true,
      status: true,
      expiresAt: true,
      categoryId: true,
      category: { select: { type: true } },
      photos: { orderBy: { createdAt: "asc" }, select: { dataUrl: true } },
    },
  })
  if (!request) return []

  if (request.customerId !== session.user.id) {
    // Anyone else must be a provider or shopkeeper looking at a request that
    // is still open to them, matching getOpenRequestsBoard's filter.
    if (request.status !== "OPEN" || request.expiresAt <= new Date()) return []
    const me = await getResponderProfiles()
    // Mirrors the board exactly: whichever half of the account the request
    // belongs to is the half that has to allow it.
    const asProvider =
      !!me?.provider &&
      request.category.type === "SERVICE" &&
      (!me.provider.categoryId || request.categoryId === me.provider.categoryId)
    const asShop = !!me?.shop && request.category.type === "PRODUCT"
    if (!asProvider && !asShop) {
      return []
    }
  }

  return request.photos.map((p) => p.dataUrl)
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
  // A shopkeeper answering a PRODUCT request names the catalogue item they
  // are offering. Accepting turns it into a real order line, which cannot
  // exist without a real product — so the item is collected here, at the
  // point the shopkeeper knows what they are selling, rather than guessed at
  // acceptance time. Providers answering SERVICE requests leave both unset.
  productId: z.string().trim().min(1).optional(),
  quantity: z.coerce.number().int().positive().max(999).optional(),
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
  // Which half of the account is answering is decided by the request, not by
  // `role` — a Saji Pro that both works and sells answers a SERVICE request
  // as a provider and a PRODUCT request as a shop, from the one account.
  const me = await getResponderProfiles()
  const respondingAsShop = request.category.type === "PRODUCT"
  if (respondingAsShop && !me?.shop) {
    return { success: false, error: "This request is for a product. Add \"Sell Products\" to your account to answer it." }
  }
  if (!respondingAsShop && !me?.provider) {
    return { success: false, error: "This request isn't open to your account." }
  }

  // Business staff can only bid on open requests under their own account if
  // their business has opted in — see ProviderProfile.allowStaffRequestResponses.
  // A solo pro or a business owner responding for themselves is unaffected.
  if (!respondingAsShop) {
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

  // Validate the offered item belongs to this shop and is sellable, here
  // rather than at acceptance: the customer should never accept an offer that
  // then cannot become an order.
  let productId: string | undefined
  if (respondingAsShop) {
    if (!parsed.data.productId) {
      return { success: false, error: "Choose which product you're offering." }
    }
    const product = await db.product.findFirst({
      where: { id: parsed.data.productId, shopkeeperId: me!.shop!.shopkeeperId, isActive: true },
      select: { id: true },
    })
    if (!product) return { success: false, error: "That product isn't available in your shop." }
    productId = product.id
  }

  await db.requestResponse.create({
    data: {
      requestId: request.id,
      responderId: session.user.id,
      productId,
      quantity: parsed.data.quantity ?? 1,
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
  // conversationId is nullable: opening the chat is a convenience alongside
  // the real outcome, not a condition of it. See the note where it is created.
  | { success: true; conversationId: string | null; kind: "job"; jobId: string; amount: number }
  | { success: true; conversationId: string | null; kind: "order"; orderId: string; amount: number }
  | { success: false; error: string }

const acceptSchema = z.object({
  requestId: z.string().trim().min(1),
  responseId: z.string().trim().min(1),
  // A request carries no date of its own, so the customer supplies one when
  // they accept — same as booking a listed service. Without it the job would
  // have to invent a scheduled date, and the provider would have no idea when
  // they are expected.
  // Only a service needs scheduling. A product order has nothing to schedule,
  // so these are optional and required below only for the job branch.
  date: z.string().trim().optional(),
  time: z.string().trim().optional(),
})

export async function acceptRequestResponse(input: unknown): Promise<AcceptResponseResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = acceptSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const request = await db.customerRequest.findUnique({
    where: { id: parsed.data.requestId },
    include: { responses: true, category: { select: { type: true } } },
  })
  if (!request || request.customerId !== session.user.id) return { success: false, error: "Request not found." }
  if (request.status !== "OPEN") return { success: false, error: "This request is no longer open." }

  const chosen = request.responses.find((r) => r.id === parsed.data.responseId)
  if (!chosen) return { success: false, error: "Response not found." }

  // Accepting has to produce something the system can track. Until now it
  // only closed the request and opened a chat, so the agreed work existed
  // nowhere: no status to advance, no payment to take, no completion to
  // record, and nothing in the provider's earnings or the customer's history.
  //
  // Which record depends on what was asked for: a SERVICE request settles
  // into a Job on the booking pipeline, a PRODUCT request into an Order on
  // the shop pipeline. respondToRequest already guarantees the responder
  // matches the request type.
  const amount = Number(chosen.price)
  const isProduct = request.category.type === "PRODUCT"

  let jobId: string | null = null
  let orderId: string | null = null

  if (isProduct) {
    const product = chosen.productId
      ? await db.product.findUnique({ where: { id: chosen.productId }, select: { id: true, shopkeeperId: true } })
      : null
    if (!product) {
      // Responses made before the shopkeeper had to name an item, or an item
      // since removed. Refusing beats closing the request with nothing behind
      // it, which is the bug being fixed.
      return { success: false, error: "That offer is no longer available. Please choose another response." }
    }

    const quantity = chosen.quantity || 1
    const unitPrice = amount / quantity
    const order = await db.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        customerId: session.user.id,
        shopkeeperId: product.shopkeeperId,
        requestId: request.id,
        status: "PENDING",
        subtotal: amount,
        total: amount,
        notes: `From request: ${request.title}`,
        items: {
          create: [{ productId: product.id, quantity, unitPrice, totalPrice: amount }],
        },
      },
    })
    orderId = order.id
  } else {
    const responderProfile = await db.providerProfile.findUnique({
      where: { userId: chosen.responderId },
      select: { id: true },
    })
    if (!responderProfile) {
      return { success: false, error: "That provider is no longer available. Please choose another response." }
    }

    if (!parsed.data.date || !parsed.data.time) {
      return { success: false, error: "Choose a date and time for the work." }
    }
    const scheduledDate = new Date(`${parsed.data.date}T${parsed.data.time}:00`)
    if (Number.isNaN(scheduledDate.getTime())) {
      return { success: false, error: "Invalid date or time." }
    }

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
    jobId = job.id

    await logJobEvent({
      jobId: job.id,
      type: "JOB_CREATED",
      actor: "CUSTOMER",
      actorUserId: session.user.id,
      description: `Customer accepted a response to "${request.title}"`,
    })
  }

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
        // A service job is still PENDING_PAYMENT at this point, so it is not
        // visible to the provider yet — promising it was already in their list
        // sent them looking for something that wasn't there.
        message: isProduct
          ? `Your offer for "${request.title}" was accepted. The order is now in your orders list.`
          : `Your offer for "${request.title}" was accepted. It moves into your active jobs once the customer's payment clears.`,
        type: "JOB",
        relatedType: "CUSTOMER_REQUEST",
        relatedId: request.id,
        actionUrl: isProduct ? "/shopkeeper/orders" : "/provider/jobs",
      },
    }),
  ])

  await pushToUser(chosen.responderId, {
    title: "Your offer was accepted!",
    body: `Your offer for "${request.title}" was accepted.`,
    url: "/messages",
  }, "job")

  // Opening the chat must not be able to fail the acceptance. By this point
  // the job or order exists, the response is accepted and the request is
  // closed — all committed. Returning the conversation's failure here undid
  // none of that; it just told the customer their acceptance had failed while
  // the record sat in the database, and stopped the client sending them on to
  // pay for it. canMessage() refusing the pair (see lib/message-permissions.ts)
  // is a real possibility, so this is not theoretical.
  const convResult = await getOrCreateConversation({ otherUserId: chosen.responderId })
  const conversationId = convResult.success ? convResult.conversationId : null

  return orderId
    ? { success: true, conversationId, kind: "order", orderId, amount }
    : { success: true, conversationId, kind: "job", jobId: jobId as string, amount }
}
