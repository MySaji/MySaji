"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { notifyUser } from "@/backend/services/notifications-core"

const BUSINESS_ROLES = ["provider", "shopkeeper", "distributor"]

async function requireBusinessUser() {
  const session = await auth()
  if (!session?.user?.id || !BUSINESS_ROLES.includes(session.user.role)) return null
  return session.user
}

export type ProcurementStatus = "QUOTES_OPEN" | "PENDING_APPROVAL" | "APPROVED" | "PURCHASE_ORDER_CREATED" | "FULFILLED" | "CANCELLED"
export type ProcurementActionResult = { success: true } | { success: false; error: string }

const createSchema = z.object({
  productName: z.string().trim().min(1, "What do you need?"),
  quantity: z.coerce.number().int().positive(),
  deliveryLocation: z.string().trim().min(1, "Delivery location is required"),
  recurrenceDays: z.coerce.number().int().positive().optional(),
  budgetMax: z.coerce.number().positive().optional(),
  requirements: z.string().trim().optional(),
  requiresApproval: z.boolean().optional(),
})

/** If the requester is business staff (ProviderProfile.parentBusinessId
 * set — the same real business-owner hierarchy Phase-earlier's Business
 * Hub uses), requiresApproval routes to their real parent business owner.
 * Everyone else (the owner themselves, a shopkeeper, a distributor) has no
 * one above them in this schema, so an approval flag on their own request
 * is a no-op — approved immediately rather than pretending to gate on a
 * hierarchy that doesn't exist for that account. */
async function resolveApprover(userId: string): Promise<string | null> {
  const provider = await db.providerProfile.findUnique({ where: { userId }, include: { parentBusiness: { include: { user: true } } } })
  return provider?.parentBusiness?.user.id ?? null
}

export async function createProcurementRequest(input: unknown): Promise<ProcurementActionResult> {
  const user = await requireBusinessUser()
  if (!user) return { success: false, error: "You must be signed in as a business account." }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const approverUserId = parsed.data.requiresApproval ? await resolveApprover(user.id) : null

  await db.procurementRequest.create({
    data: {
      businessUserId: user.id, productName: parsed.data.productName, quantity: parsed.data.quantity,
      deliveryLocation: parsed.data.deliveryLocation, recurrenceDays: parsed.data.recurrenceDays, budgetMax: parsed.data.budgetMax,
      requirements: parsed.data.requirements, requiresApproval: !!(parsed.data.requiresApproval && approverUserId),
      approverUserId, status: "QUOTES_OPEN",
    },
  })

  return { success: true }
}

export type ProcurementRequestItem = {
  id: string
  productName: string
  quantity: number
  deliveryLocation: string
  recurrenceDays: number | null
  budgetMax: number | null
  status: ProcurementStatus
  quoteCount: number
  createdAt: string
}

export async function getMyProcurementRequests(): Promise<ProcurementRequestItem[]> {
  const user = await requireBusinessUser()
  if (!user) return []

  const requests = await db.procurementRequest.findMany({
    where: { businessUserId: user.id },
    include: { _count: { select: { supplierQuotes: true } } },
    orderBy: { createdAt: "desc" },
  })

  return requests.map((r) => ({
    id: r.id, productName: r.productName, quantity: r.quantity, deliveryLocation: r.deliveryLocation,
    recurrenceDays: r.recurrenceDays, budgetMax: r.budgetMax != null ? Number(r.budgetMax) : null,
    status: r.status, quoteCount: r._count.supplierQuotes, createdAt: r.createdAt.toISOString(),
  }))
}

export type OpenProcurementRequestItem = {
  id: string
  businessName: string
  productName: string
  quantity: number
  deliveryLocation: string
  recurrenceDays: number | null
  budgetMax: number | null
  requirements: string | null
  createdAt: string
}

/** Broadcast to real distributor accounts — same "open request board"
 * pattern as CustomerRequest, scoped to suppliers instead of providers. */
export async function getOpenProcurementRequests(): Promise<OpenProcurementRequestItem[]> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "distributor") return []

  const requests = await db.procurementRequest.findMany({ where: { status: "QUOTES_OPEN" }, orderBy: { createdAt: "desc" } })
  const businessIds = [...new Set(requests.map((r) => r.businessUserId))]
  const businesses = businessIds.length > 0 ? await db.user.findMany({ where: { id: { in: businessIds } }, select: { id: true, name: true } }) : []
  const nameById = new Map(businesses.map((b) => [b.id, b.name]))

  return requests.map((r) => ({
    id: r.id, businessName: nameById.get(r.businessUserId) ?? "Business", productName: r.productName, quantity: r.quantity,
    deliveryLocation: r.deliveryLocation, recurrenceDays: r.recurrenceDays, budgetMax: r.budgetMax != null ? Number(r.budgetMax) : null,
    requirements: r.requirements, createdAt: r.createdAt.toISOString(),
  }))
}

const submitQuoteSchema = z.object({
  procurementRequestId: z.string().trim().min(1),
  price: z.coerce.number().positive(),
  availability: z.string().trim().optional(),
  deliveryTime: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  validDays: z.coerce.number().int().positive().default(7),
})

export async function submitSupplierQuote(input: unknown): Promise<ProcurementActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "distributor") return { success: false, error: "You must be signed in as a distributor." }

  const parsed = submitQuoteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const request = await db.procurementRequest.findUnique({ where: { id: parsed.data.procurementRequestId } })
  if (!request || request.status !== "QUOTES_OPEN") return { success: false, error: "This request is no longer open for quotes." }

  await db.supplierQuote.create({
    data: {
      procurementRequestId: request.id, supplierUserId: session.user.id, price: parsed.data.price, availability: parsed.data.availability || null,
      deliveryTime: parsed.data.deliveryTime || null, terms: parsed.data.terms || null, validUntil: new Date(Date.now() + parsed.data.validDays * 86400000),
    },
  })

  await notifyUser({
    userId: request.businessUserId, title: "Supplier quote received", message: `A supplier quoted KES ${parsed.data.price.toLocaleString()} for "${request.productName}"`, type: "SYSTEM", actionUrl: "/provider/business/procurement",
  })

  return { success: true }
}

export type SupplierQuoteItem = {
  id: string
  supplierName: string
  price: number
  availability: string | null
  deliveryTime: string | null
  terms: string | null
  validUntil: string
  status: "SUBMITTED" | "SELECTED" | "DECLINED"
}

export async function getSupplierQuotesForRequest(procurementRequestId: string): Promise<SupplierQuoteItem[]> {
  const user = await requireBusinessUser()
  if (!user) return []

  const request = await db.procurementRequest.findUnique({ where: { id: procurementRequestId } })
  if (!request || request.businessUserId !== user.id) return []

  const quotes = await db.supplierQuote.findMany({ where: { procurementRequestId }, orderBy: { price: "asc" } })
  const supplierIds = [...new Set(quotes.map((q) => q.supplierUserId))]
  const suppliers = supplierIds.length > 0 ? await db.distributorProfile.findMany({ where: { userId: { in: supplierIds } }, select: { userId: true, companyName: true } }) : []
  const nameByUserId = new Map(suppliers.map((s) => [s.userId, s.companyName]))

  return quotes.map((q) => ({
    id: q.id, supplierName: nameByUserId.get(q.supplierUserId) ?? "Supplier", price: Number(q.price), availability: q.availability,
    deliveryTime: q.deliveryTime, terms: q.terms, validUntil: q.validUntil.toISOString(), status: q.status,
  }))
}

const selectQuoteSchema = z.object({ quoteId: z.string().trim().min(1) })

export async function selectSupplierQuote(input: unknown): Promise<ProcurementActionResult> {
  const user = await requireBusinessUser()
  if (!user) return { success: false, error: "You must be signed in as a business account." }

  const parsed = selectQuoteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const quote = await db.supplierQuote.findUnique({ where: { id: parsed.data.quoteId }, include: { procurementRequest: true } })
  if (!quote || quote.procurementRequest.businessUserId !== user.id) return { success: false, error: "Quote not found." }
  if (quote.procurementRequest.status !== "QUOTES_OPEN") return { success: false, error: "This request has already been resolved." }

  const needsApproval = quote.procurementRequest.requiresApproval
  const poStatus = needsApproval ? "PENDING_APPROVAL" : "APPROVED"

  await db.$transaction([
    db.supplierQuote.update({ where: { id: quote.id }, data: { status: "SELECTED" } }),
    db.procurementRequest.update({ where: { id: quote.procurementRequestId }, data: { status: needsApproval ? "PENDING_APPROVAL" : "PURCHASE_ORDER_CREATED" } }),
    db.purchaseOrder.create({
      data: { procurementRequestId: quote.procurementRequestId, supplierQuoteId: quote.id, status: poStatus, totalAmount: Number(quote.price) * quote.procurementRequest.quantity },
    }),
  ])

  return { success: true }
}

const poIdSchema = z.object({ purchaseOrderId: z.string().trim().min(1) })

export async function approvePurchaseOrder(input: unknown): Promise<ProcurementActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = poIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const po = await db.purchaseOrder.findUnique({ where: { id: parsed.data.purchaseOrderId }, include: { procurementRequest: true } })
  if (!po) return { success: false, error: "Purchase order not found." }
  if (po.procurementRequest.approverUserId !== session.user.id) return { success: false, error: "You're not the approver for this request." }
  if (po.status !== "PENDING_APPROVAL") return { success: false, error: "This purchase order isn't pending approval." }

  await db.$transaction([
    db.purchaseOrder.update({ where: { id: po.id }, data: { status: "APPROVED" } }),
    db.procurementRequest.update({ where: { id: po.procurementRequestId }, data: { status: "PURCHASE_ORDER_CREATED" } }),
  ])

  return { success: true }
}

const confirmDeliverySchema = z.object({
  purchaseOrderId: z.string().trim().min(1),
  deliveredQuantity: z.coerce.number().int().positive(),
  recipientName: z.string().trim().min(1),
  evidenceUrl: z.string().trim().optional(),
})

export async function confirmDelivery(input: unknown): Promise<ProcurementActionResult> {
  const user = await requireBusinessUser()
  if (!user) return { success: false, error: "You must be signed in." }

  const parsed = confirmDeliverySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const po = await db.purchaseOrder.findUnique({ where: { id: parsed.data.purchaseOrderId }, include: { procurementRequest: true } })
  if (!po || po.procurementRequest.businessUserId !== user.id) return { success: false, error: "Purchase order not found." }
  if (po.status !== "APPROVED") return { success: false, error: "This purchase order isn't ready to be marked delivered." }

  await db.$transaction([
    db.deliveryConfirmation.create({
      data: { purchaseOrderId: po.id, deliveredQuantity: parsed.data.deliveredQuantity, recipientName: parsed.data.recipientName, evidenceUrl: parsed.data.evidenceUrl || null, confirmedByUserId: user.id },
    }),
    db.purchaseOrder.update({ where: { id: po.id }, data: { status: "FULFILLED" } }),
    db.procurementRequest.update({ where: { id: po.procurementRequestId }, data: { status: "FULFILLED" } }),
  ])

  return { success: true }
}

export type PurchaseRecordItem = {
  purchaseOrderId: string
  productName: string
  totalAmount: number
  status: string
  createdAt: string
  deliveredQuantity: number | null
  deliveredAt: string | null
}

export async function getMyPurchaseRecords(): Promise<PurchaseRecordItem[]> {
  const user = await requireBusinessUser()
  if (!user) return []

  const orders = await db.purchaseOrder.findMany({
    where: { procurementRequest: { businessUserId: user.id } },
    include: { procurementRequest: true, deliveryConfirmation: true },
    orderBy: { createdAt: "desc" },
  })

  return orders.map((po) => ({
    purchaseOrderId: po.id, productName: po.procurementRequest.productName, totalAmount: Number(po.totalAmount), status: po.status,
    createdAt: po.createdAt.toISOString(), deliveredQuantity: po.deliveryConfirmation?.deliveredQuantity ?? null, deliveredAt: po.deliveryConfirmation?.deliveredAt.toISOString() ?? null,
  }))
}
