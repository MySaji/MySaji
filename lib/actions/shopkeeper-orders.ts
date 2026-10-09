"use server"

import { z } from "zod"
import { awardLoyaltyPoints } from "@/lib/settlement-core"
import { db } from "@/lib/db"
import { requireVerified } from "@/lib/verification-gate"
import { requireShopkeeper } from "@/lib/actions/shopkeeper-dashboard"
import { pushToUser } from "@/lib/actions/push"
import { recordOrderMovements, orderStockDelta } from "@/lib/pos-ledger"
import { reverseOrder } from "@/lib/order-cancellation"

export type ShopkeeperOrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded"

export type ShopkeeperOrderItem = {
  id: string
  productId: string
  productName: string
  image: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
}

export type ShopkeeperOrder = {
  id: string
  orderNumber: string
  customerId: string
  customerName: string
  customerPhone: string | null
  customerEmail: string
  customerAvatar: string | null
  items: ShopkeeperOrderItem[]
  itemCount: number
  subtotal: number
  shippingCost: number
  amount: number
  status: ShopkeeperOrderStatus
  location: string
  createdAt: string
  paymentMethod: string
  notes: string | null
}

export async function getShopkeeperActiveOrderCount(): Promise<number> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return 0
  return db.order.count({ where: { shopkeeperId: shopkeeper.shopkeeperId, status: { in: ["PENDING", "PROCESSING"] } } })
}

export async function getMyOrders(): Promise<ShopkeeperOrder[]> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return []

  const orders = await db.order.findMany({
    where: { shopkeeperId: shopkeeper.shopkeeperId },
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      address: true,
      items: { include: { product: true } },
    },
  })

  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    customerName: o.customer.name,
    // Real phone numbers never leave the server to another user — Message
    // goes through the in-app conversation system (customerId above),
    // never a raw tel: link.
    customerPhone: null,
    customerEmail: o.customer.email,
    customerAvatar: o.customer.image,
    items: o.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      image: it.product.images[0] ?? null,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      totalPrice: Number(it.totalPrice),
    })),
    itemCount: o.items.reduce((sum, it) => sum + it.quantity, 0),
    subtotal: Number(o.subtotal),
    shippingCost: Number(o.shippingCost),
    amount: Number(o.total),
    status: o.status.toLowerCase() as ShopkeeperOrderStatus,
    location: o.address ? [o.address.address, o.address.city].filter(Boolean).join(", ") : "N/A",
    createdAt: o.createdAt.toISOString(),
    paymentMethod: "Wallet",
    notes: o.notes,
  }))
}

export type ShopkeeperOrderActionResult = { success: true } | { success: false; error: string }

const ADVANCE_STATUSES: Record<string, "PROCESSING" | "SHIPPED" | "DELIVERED"> = {
  processing: "PROCESSING",
  shipped: "SHIPPED",
  delivered: "DELIVERED",
}

const advanceSchema = z.object({
  orderId: z.string().trim().min(1),
  status: z.enum(["processing", "shipped", "delivered"]),
})

export async function advanceOrderStatus(input: unknown): Promise<ShopkeeperOrderActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  // Progressive KYC: taking on a customer's order means taking on their
  // money. Note that cancelMyOrder and the return-handling actions below are
  // deliberately left ungated — a merchant who loses verification must still
  // be able to release customers who are already waiting on them.
  const gate = await requireVerified("order.accept")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = advanceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } })
  if (!order || order.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Order not found." }
  if (order.status === "CANCELLED" || order.status === "REFUNDED" || order.status === "DELIVERED") {
    return { success: false, error: "This order can no longer be updated." }
  }

  const nextStatus = ADVANCE_STATUSES[parsed.data.status]
  const TIMESTAMP_FIELD: Record<typeof nextStatus, "processingAt" | "shippedAt" | "deliveredAt"> = {
    PROCESSING: "processingAt",
    SHIPPED: "shippedAt",
    DELIVERED: "deliveredAt",
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: nextStatus, [TIMESTAMP_FIELD[nextStatus]]: new Date() } })
    await tx.notification.create({
      data: {
        userId: order.customerId,
        title: "Order update",
        message: `Your order ${order.orderNumber} is now ${parsed.data.status}.`,
        type: "PAYMENT",
        relatedType: "ORDER",
        relatedId: order.id,
        actionUrl: "/customer/orders",
      },
    })
  })

  await pushToUser(order.customerId, {
    title: "Order update",
    body: `Your order ${order.orderNumber} is now ${parsed.data.status}.`,
    url: "/customer/orders",
  }, "payment")

  if (nextStatus === "DELIVERED") {
    await awardLoyaltyPoints(order.customerId, Number(order.subtotal) - Number(order.discount), { referenceType: "ORDER", referenceId: order.id })
  }

  return { success: true }
}

const cancelSchema = z.object({ orderId: z.string().trim().min(1) })

export async function cancelMyOrder(input: unknown): Promise<ShopkeeperOrderActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } })
  if (!order || order.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Order not found." }

  const result = await reverseOrder(parsed.data.orderId)
  if (!result.success) return result

  await db.notification.create({
    data: {
      userId: result.customerId,
      title: "Order cancelled",
      message: `Your order ${result.orderNumber} was cancelled and KES ${result.total.toLocaleString()} has been refunded to your wallet.`,
      type: "PAYMENT",
      relatedType: "ORDER",
      relatedId: parsed.data.orderId,
      actionUrl: "/customer/orders",
    },
  })
  await pushToUser(result.customerId, {
    title: "Order cancelled",
    body: `Your order ${result.orderNumber} was cancelled and KES ${result.total.toLocaleString()} has been refunded to your wallet.`,
    url: "/customer/orders",
  }, "payment")

  return { success: true }
}

// ============================= RETURN/REFUND REQUESTS =============================
// A customer's requestOrderReturn() (lib/actions/orders.ts) creates a real
// Dispute row scoped to the order. The shopkeeper is the first line of
// review for their own shop's orders — accepting genuinely refunds the
// customer and reverses the shop's payout (finally making OrderStatus.
// REFUNDED a reachable state, not a dead enum value); rejecting doesn't
// unilaterally deny the customer, it escalates to admin/agent for a human
// call, same as any other disputed claim.

export type ShopOrderDispute = {
  id: string
  disputeNumber: string
  orderId: string
  orderNumber: string
  customerName: string
  reason: string
  description: string
  photos: string[]
  status: string
  createdAt: string
}

export async function getShopOrderDisputes(): Promise<ShopOrderDispute[]> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return []

  const disputes = await db.dispute.findMany({
    where: { order: { shopkeeperId: shopkeeper.shopkeeperId }, status: { in: ["OPEN", "IN_REVIEW"] } },
    include: { order: true, customer: true },
    orderBy: { createdAt: "desc" },
  })

  return disputes
    .filter((d) => d.order)
    .map((d) => ({
      id: d.id,
      disputeNumber: d.disputeNumber,
      orderId: d.order!.id,
      orderNumber: d.order!.orderNumber,
      customerName: d.customer.name,
      reason: d.reason,
      description: d.description,
      photos: d.photos,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    }))
}

const disputeIdSchema = z.object({ disputeId: z.string().trim().min(1) })

export async function acceptShopReturnRequest(input: unknown): Promise<ShopkeeperOrderActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = disputeIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const dispute = await db.dispute.findUnique({ where: { id: parsed.data.disputeId }, include: { order: { include: { items: true } } } })
  if (!dispute || !dispute.order || dispute.order.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Request not found." }
  if (dispute.status !== "OPEN" && dispute.status !== "IN_REVIEW") return { success: false, error: "This request has already been resolved." }

  const order = dispute.order
  const shopkeeperProfile = await db.shopkeeperProfile.findUnique({ where: { id: shopkeeper.shopkeeperId } })
  if (!shopkeeperProfile) return { success: false, error: "Shop not found." }

  const subtotal = Number(order.subtotal)
  const total = Number(order.total)
  const revenueEntry = await db.platformRevenue.findUnique({ where: { sourceId: order.id } })
  const payoutToReverse = revenueEntry ? Number(revenueEntry.payoutAmount) : subtotal

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } })
    await tx.dispute.update({ where: { id: dispute.id }, data: { status: "RESOLVED", resolution: "Return accepted by shop, refunded.", refundAmount: total, resolvedAt: new Date() } })

    if (revenueEntry && !revenueEntry.reversedAt) {
      await tx.platformRevenue.update({ where: { id: revenueEntry.id }, data: { reversedAt: new Date() } })
    }

    // Returned goods go back on the shelf, with the return named as the
    // reason rather than the stock simply rising.
    const restock = await recordOrderMovements(tx as never, {
      shopkeeperId: order.shopkeeperId,
      kind: "ORDER_RESTOCK",
      orderId: order.id,
      reason: `Order ${order.orderNumber} returned`,
      lines: order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    })
    if (!restock.ok) throw new Error(`stock ledger refused the return of ${order.orderNumber}: ${restock.message}`)

    for (const item of order.items) {
      await tx.inventory.updateMany({
        where: { productId: item.productId },
        data: orderStockDelta("ORDER_RESTOCK", item.quantity),
      })
      await tx.product.update({ where: { id: item.productId }, data: { totalSold: { decrement: item.quantity } } })
    }

    const customerWallet = await tx.wallet.upsert({ where: { userId: order.customerId }, update: {}, create: { userId: order.customerId } })
    const custBefore = Number(customerWallet.balance)
    const custAfter = custBefore + total
    await tx.wallet.update({ where: { userId: order.customerId }, data: { balance: custAfter } })
    await tx.transaction.create({
      data: {
        walletId: customerWallet.id, type: "REFUND", amount: total,
        description: `Refund for returned order ${order.orderNumber}`,
        referenceType: "ORDER", referenceId: order.id, status: "COMPLETED",
        balanceBefore: custBefore, balanceAfter: custAfter,
      },
    })

    const shopWallet = await tx.wallet.upsert({ where: { userId: shopkeeperProfile.userId }, update: {}, create: { userId: shopkeeperProfile.userId } })
    const shopBefore = Number(shopWallet.balance)
    const shopAfter = shopBefore - payoutToReverse
    await tx.wallet.update({ where: { userId: shopkeeperProfile.userId }, data: { balance: shopAfter, totalEarned: { decrement: payoutToReverse } } })
    await tx.transaction.create({
      data: {
        walletId: shopWallet.id, type: "DEBIT", amount: -payoutToReverse,
        description: `Order ${order.orderNumber} returned, payout reversed`,
        referenceType: "ORDER", referenceId: order.id, status: "COMPLETED",
        balanceBefore: shopBefore, balanceAfter: shopAfter,
      },
    })
    await tx.shopkeeperProfile.update({ where: { id: shopkeeper.shopkeeperId }, data: { totalSales: { decrement: subtotal } } })

    await tx.notification.create({
      data: {
        userId: order.customerId,
        title: "Return accepted",
        message: `Your return for order ${order.orderNumber} was accepted. KES ${total.toLocaleString()} has been refunded to your wallet.`,
        type: "PAYMENT", relatedType: "ORDER", relatedId: order.id, actionUrl: "/customer/orders",
      },
    })
  }, { timeout: 20000, maxWait: 10000 })

  await pushToUser(order.customerId, {
    title: "Return accepted",
    body: `Your return for order ${order.orderNumber} was accepted and refunded.`,
    url: "/customer/orders",
  }, "payment")

  return { success: true }
}

const rejectReturnSchema = z.object({ disputeId: z.string().trim().min(1), reason: z.string().trim().min(5, "Please explain why you're declining this return") })

/** Rejecting doesn't close the case — it escalates to admin/agent, who
 * already handle ESCALATED disputes in their own queues. A shopkeeper
 * saying no isn't the final word on a customer's claim. */
export async function rejectShopReturnRequest(input: unknown): Promise<ShopkeeperOrderActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = rejectReturnSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const dispute = await db.dispute.findUnique({ where: { id: parsed.data.disputeId }, include: { order: true } })
  if (!dispute || !dispute.order || dispute.order.shopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Request not found." }
  if (dispute.status !== "OPEN" && dispute.status !== "IN_REVIEW") return { success: false, error: "This request has already been resolved." }

  await db.dispute.update({
    where: { id: dispute.id },
    data: { status: "ESCALATED", description: `${dispute.description}\n\n[Shop response]: ${parsed.data.reason}`, severity: "HIGH" },
  })

  await db.notification.create({
    data: {
      userId: dispute.customerId,
      title: "Return request under review",
      message: `The shop declined your return for order ${dispute.order.orderNumber}. Our support team is now reviewing your request.`,
      type: "SYSTEM", relatedType: "ORDER", relatedId: dispute.order.id, actionUrl: "/customer/orders",
    },
  })
  await pushToUser(dispute.customerId, {
    title: "Return request under review",
    body: `Your return request needs a closer look. Our support team is on it.`,
    url: "/customer/orders",
  }, "payment")

  return { success: true }
}
