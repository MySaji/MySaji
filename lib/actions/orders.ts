"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { RETURN_REASONS, type ReturnReason } from "@/lib/order-return-reasons"
import { CANCEL_REASONS, type CancelReason } from "@/lib/order-cancel-reasons"
import { reverseOrder } from "@/lib/order-cancellation"
import { pushToUser } from "@/lib/actions/push"

export type CustomerOrder = {
  id: string
  orderNumber: string
  status: string
  total: number
  shopName: string
  shopId: string
  itemSummary: string
  itemCount: number
  createdAt: string
  /// Where this row's detail lives. Shop orders have an order page; a
  /// provider's product settles as a Job, so those point at the job dialog
  /// instead of an /orders/<id> route that would not resolve.
  detailHref: string
}

function toCustomerOrder(order: {
  id: string
  orderNumber: string
  status: string
  total: unknown
  createdAt: Date
  shopkeeper: { id: string; shopName: string }
  items: { quantity: number; product: { name: string } }[]
}): CustomerOrder {
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0)
  const itemSummary = order.items.length > 0
    ? order.items.length === 1
      ? order.items[0].product.name
      : `${order.items[0].product.name} +${order.items.length - 1} more`
    : "No items"

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: Number(order.total),
    shopName: order.shopkeeper.shopName,
    shopId: order.shopkeeper.id,
    itemSummary,
    itemCount,
    createdAt: order.createdAt.toISOString(),
    detailHref: `/customer/orders/${order.id}`,
  }
}

/** A Job status expressed in the order vocabulary the purchases list uses,
 *  so a bought product does not read as a booked appointment. */
const PURCHASE_STATUS_FROM_JOB: Record<string, string> = {
  PENDING_PAYMENT: "PENDING",
  PENDING: "PROCESSING",
  ACCEPTED: "PROCESSING",
  IN_PROGRESS: "PROCESSING",
  COMPLETED: "DELIVERED",
  CANCELLED: "CANCELLED",
  DISPUTED: "DISPUTED",
}

/**
 * Products bought from a provider's BUY offer.
 *
 * These are Job rows — that is the pipeline that carries their payment,
 * dispute and completion — but a customer bought a thing, so they belong
 * with their orders rather than in "My Jobs". Mapped into the same shape as
 * a shop order so both can share one list.
 */
async function getOfferPurchases(customerId: string, limit?: number): Promise<CustomerOrder[]> {
  const jobs = await db.job.findMany({
    where: { customerId, offer: { actionType: "BUY" } },
    orderBy: { createdAt: "desc" },
    ...(limit ? { take: limit } : {}),
    include: { provider: { include: { user: { select: { name: true } } } } },
  })

  return jobs.map((job) => ({
    id: job.id,
    // Job has no orderNumber; a stable, readable stand-in derived from its
    // own id keeps the row identifiable without inventing a second sequence.
    orderNumber: `PRO-${job.id.slice(-6).toUpperCase()}`,
    status: PURCHASE_STATUS_FROM_JOB[job.status] ?? job.status,
    total: Number(job.price),
    shopName: job.provider?.businessName || job.provider?.user.name || "Saji Pro",
    shopId: job.providerId ?? "",
    itemSummary: job.title,
    itemCount: job.quantity,
    createdAt: job.createdAt.toISOString(),
    detailHref: `/customer/jobs?job=${job.id}`,
  }))
}

export async function getRecentOrders(limit = 3): Promise<CustomerOrder[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const [orders, purchases] = await Promise.all([
    db.order.findMany({
      where: { customerId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { shopkeeper: { select: { id: true, shopName: true } }, items: { include: { product: { select: { name: true } } } } },
    }),
    getOfferPurchases(session.user.id, limit),
  ])

  // Both lists are already newest-first; merged and re-cut so the limit
  // applies across the two rather than returning `limit` of each.
  return [...orders.map(toCustomerOrder), ...purchases]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const [orders, purchases] = await Promise.all([
    db.order.findMany({
      where: { customerId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: { shopkeeper: { select: { id: true, shopName: true } }, items: { include: { product: { select: { name: true } } } } },
    }),
    getOfferPurchases(session.user.id),
  ])

  return [...orders.map(toCustomerOrder), ...purchases]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export type CustomerOrderDetailItem = {
  id: string
  productId: string
  name: string
  image: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
}

export type CustomerOrderExistingDispute = {
  id: string
  disputeNumber: string
  status: string
  reason: string
  resolution: string | null
  createdAt: string
}

export type CustomerOrderDetail = {
  id: string
  orderNumber: string
  status: string
  subtotal: number
  discount: number
  shippingCost: number
  tax: number
  total: number
  notes: string | null
  shopName: string
  shopId: string
  addressLabel: string | null
  items: CustomerOrderDetailItem[]
  createdAt: string
  processingAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  canCancel: boolean
  existingDispute: CustomerOrderExistingDispute | null
} | null

/** Real per-status timestamps (set exactly when a shopkeeper actually
 * advances the order, see advanceOrderStatus() in shopkeeper-orders.ts) —
 * the timeline UI only ever shows a step as "reached" when its timestamp is
 * genuinely set, never inferred/guessed. */
export async function getCustomerOrderById(orderId: string): Promise<CustomerOrderDetail> {
  const session = await auth()
  if (!session?.user?.id) return null

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      shopkeeper: { select: { id: true, shopName: true } },
      address: true,
      items: { include: { product: { select: { id: true, name: true, images: true } } } },
      disputes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  })
  if (!order || order.customerId !== session.user.id) return null

  const latestDispute = order.disputes[0]

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    shippingCost: Number(order.shippingCost),
    tax: Number(order.tax),
    total: Number(order.total),
    notes: order.notes,
    shopName: order.shopkeeper.shopName,
    shopId: order.shopkeeper.id,
    addressLabel: order.address ? [order.address.address, order.address.city].filter(Boolean).join(", ") : null,
    items: order.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      name: it.product.name,
      image: it.product.images[0] ?? null,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      totalPrice: Number(it.totalPrice),
    })),
    createdAt: order.createdAt.toISOString(),
    processingAt: order.processingAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    canCancel: order.status === "PENDING" || order.status === "PROCESSING",
    existingDispute: latestDispute
      ? {
          id: latestDispute.id,
          disputeNumber: latestDispute.disputeNumber,
          status: latestDispute.status,
          reason: latestDispute.reason,
          resolution: latestDispute.resolution,
          createdAt: latestDispute.createdAt.toISOString(),
        }
      : null,
  }
}

export type OrderActionResult = { success: true } | { success: false; error: string }

const REASON_LABEL: Record<ReturnReason, string> = {
  DAMAGED: "Item arrived damaged",
  WRONG_ITEM: "Received the wrong item",
  NOT_AS_DESCRIBED: "Item not as described",
  MISSING_ITEM: "Item(s) missing from order",
  OTHER: "Other",
}

const requestReturnSchema = z.object({
  orderId: z.string().trim().min(1),
  reason: z.enum(RETURN_REASONS),
  description: z.string().trim().min(10, "Please describe the issue in a bit more detail").max(2000),
  photos: z.array(z.string()).max(4, "You can attach up to 4 photos").optional().default([]),
})

const OPEN_STATUSES = ["OPEN", "IN_REVIEW", "ESCALATED"] as const

/** Self-service return/refund request — a real Dispute row scoped to the
 * order (Dispute.orderId already existed in the schema for exactly this),
 * so it shows up in the existing admin/agent dispute-resolution queues
 * with no separate review surface to build. Only allowed once per order
 * while a request is still open, and only after real delivery. */
export async function requestOrderReturn(input: unknown): Promise<OrderActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = requestReturnSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } })
  if (!order || order.customerId !== session.user.id) return { success: false, error: "Order not found." }
  if (order.status !== "DELIVERED") return { success: false, error: "Returns can only be requested for delivered orders." }

  const existing = await db.dispute.findFirst({ where: { orderId: order.id, status: { in: [...OPEN_STATUSES] } } })
  if (existing) return { success: false, error: "You already have an open request for this order." }

  const disputeNumber = `DISP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

  await db.dispute.create({
    data: {
      disputeNumber,
      orderId: order.id,
      customerId: session.user.id,
      reason: REASON_LABEL[parsed.data.reason],
      description: parsed.data.description,
      photos: parsed.data.photos,
      status: "OPEN",
      severity: "MEDIUM",
    },
  })

  return { success: true }
}

const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  CHANGED_MIND: "Changed my mind",
  ORDERED_BY_MISTAKE: "Ordered by mistake",
  FOUND_CHEAPER: "Found it cheaper elsewhere",
  TAKING_TOO_LONG: "Taking too long to ship",
  OTHER: "Other",
}

const cancelOrderSchema = z.object({
  orderId: z.string().trim().min(1),
  reason: z.enum(CANCEL_REASONS),
})

/** Self-service pre-shipment cancellation — shares the exact financial
 * reversal (wallet refund, shopkeeper payout reversal, inventory restock)
 * that the shopkeeper's own cancelMyOrder() already used, via
 * lib/order-cancellation.ts, so both paths stay in lockstep. Only the
 * notification target differs: the shopkeeper is told, not the customer,
 * since the customer is the one who just acted. */
export async function cancelOrder(input: unknown): Promise<OrderActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = cancelOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } })
  if (!order || order.customerId !== session.user.id) return { success: false, error: "Order not found." }

  const result = await reverseOrder(parsed.data.orderId)
  if (!result.success) return result

  const reasonLabel = CANCEL_REASON_LABEL[parsed.data.reason]
  await db.notification.create({
    data: {
      userId: result.shopkeeperUserId,
      title: "Order cancelled by customer",
      message: `Order ${result.orderNumber} was cancelled by the customer (${reasonLabel}). KES ${result.total.toLocaleString()} has been refunded.`,
      type: "PAYMENT",
      relatedType: "ORDER",
      relatedId: parsed.data.orderId,
      actionUrl: "/shopkeeper/orders",
    },
  })
  await pushToUser(result.shopkeeperUserId, {
    title: "Order cancelled",
    body: `Order ${result.orderNumber} was cancelled by the customer.`,
    url: "/shopkeeper/orders",
  }, "payment")

  return { success: true }
}
