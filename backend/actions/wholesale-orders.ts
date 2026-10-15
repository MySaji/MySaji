"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { primaryShopOf } from "@/backend/services/shopkeeper-scope"
import { requireVerified } from "@/backend/services/verification-gate"
import { requireShopkeeper } from "@/backend/actions/shopkeeper-dashboard"
import { requireDistributor } from "@/backend/actions/distributor-dashboard"
import { getEffectiveCommissionRate, splitByCommission } from "@/backend/services/commission"
import { pushToUser } from "@/backend/services/push-core"
import { quoteDelivery, outOfRangeMessage, type DeliveryZone } from "@/backend/domain/delivery-zone"
import { toCoordinates } from "@/backend/domain/geo"

export type BuyerDistributorSummary = {
  id: string
  companyName: string
  logoUrl: string | null
  description: string | null
  rating: number
  reviewCount: number
  locationCount: number
  productCount: number
}

/** Verified-only, mirrors getAllShops's shape — a distributor only becomes
 * discoverable to shopkeepers once an admin has approved their KYC (see
 * approveVerification's DISTRIBUTOR branch, which flips isVerified). */
export async function browseDistributors(): Promise<BuyerDistributorSummary[]> {
  const distributors = await db.distributorProfile.findMany({
    where: { isVerified: true },
    orderBy: [{ isFeatured: "desc" }, { rating: "desc" }],
    include: {
      _count: { select: { locations: true, products: true } },
    },
  })

  return distributors.map((d) => ({
    id: d.id,
    companyName: d.companyName,
    logoUrl: d.logoUrl,
    description: d.description,
    rating: Number(d.rating),
    reviewCount: d.reviewCount,
    locationCount: d._count.locations,
    productCount: d._count.products,
  }))
}

export type BuyerDistributorProduct = {
  id: string
  name: string
  description: string
  images: string[]
  sku: string
  retailPrice: number
  wholesalePrice: number
  minWholesaleQty: number
  unit: string | null
  totalAvailableStock: number
  categoryName: string | null
}

export type BuyerDistributorDetail = {
  id: string
  companyName: string
  logoUrl: string | null
  description: string | null
  rating: number
  reviewCount: number
  locations: { id: string; name: string; type: string; city: string | null; deliveryFee: number }[]
  products: BuyerDistributorProduct[]
} | null

export async function getDistributorProductsForBuyer(distributorId: string): Promise<BuyerDistributorDetail> {
  const distributor = await db.distributorProfile.findUnique({
    where: { id: distributorId },
    include: {
      locations: { where: { isActive: true }, select: { id: true, name: true, type: true, city: true, deliveryFee: true } },
      products: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: { category: true, inventories: { where: { location: { isActive: true } } } },
      },
    },
  })
  if (!distributor || !distributor.isVerified) return null

  return {
    id: distributor.id,
    companyName: distributor.companyName,
    logoUrl: distributor.logoUrl,
    description: distributor.description,
    rating: Number(distributor.rating),
    reviewCount: distributor.reviewCount,
    locations: distributor.locations.map((l) => ({ ...l, deliveryFee: Number(l.deliveryFee) })),
    products: distributor.products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      images: p.images,
      sku: p.sku,
      retailPrice: Number(p.retailPrice),
      wholesalePrice: Number(p.wholesalePrice),
      minWholesaleQty: p.minWholesaleQty,
      unit: p.unit,
      totalAvailableStock: p.inventories.reduce((sum, i) => sum + i.currentStock, 0),
      categoryName: p.category?.name ?? null,
    })),
  }
}

export async function isCurrentUserVerifiedShopkeeper(): Promise<boolean> {
  const session = await auth()
  if (!session?.user?.id) return false
  // Keyed on the shop profile below, not on `role`: a Saji Pro that sells
  // products is role PROVIDER and can still be a verified shop buying stock.
  if (session.user.role !== "shopkeeper" && session.user.role !== "provider") return false
  const profile = await primaryShopOf(session.user.id)
  return profile?.isVerified ?? false
}

// Fallback only for the rare case a location's own deliveryFee somehow isn't
// readable — every DistributorLocation row has a real deliveryFee value
// (schema default 500) set by the distributor in app/distributor/locations,
// so this constant is not the source of truth anymore.
const DEFAULT_WHOLESALE_DELIVERY_FEE = 500

export type WholesaleOrderActionResult = { success: true; orderId: string } | { success: false; error: string }

const placeOrderSchema = z.object({
  distributorId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  items: z.array(z.object({
    distributorProductId: z.string().trim().min(1),
    quantity: z.number().int().positive("Quantity must be a positive number"),
    restockProductId: z.string().trim().optional(),
  })).min(1, "Add at least one item"),
  notes: z.string().trim().optional(),
})

/** Mirrors checkout()'s (lib/actions/cart.ts) transaction shape one level
 * deeper: one WholesaleOrder scoped to a single (distributor, location)
 * pair, wallet-funded exactly like retail Order/Payment today. Per-item
 * unit price picks whichever tier applies to the ordered quantity — not a
 * reject-below-MOQ rule (confirmed with the user: two pricing tiers for the
 * same buyer, not a separate storefront). */
export async function placeWholesaleOrder(input: unknown): Promise<WholesaleOrderActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const buyerProfile = await db.shopkeeperProfile.findUnique({ where: { id: shopkeeper.shopkeeperId } })
  if (!buyerProfile?.isVerified) return { success: false, error: "Your shop must be verified before placing wholesale orders." }

  const parsed = placeOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { distributorId, locationId, items, notes } = parsed.data

  const distributor = await db.distributorProfile.findUnique({ where: { id: distributorId } })
  if (!distributor || !distributor.isVerified) return { success: false, error: "Distributor not found." }

  const location = await db.distributorLocation.findUnique({ where: { id: locationId } })
  if (!location || location.distributorId !== distributorId || !location.isActive) {
    return { success: false, error: "Fulfillment location not found." }
  }

  const productIds = items.map((i) => i.distributorProductId)
  const products = await db.distributorProduct.findMany({ where: { id: { in: productIds }, distributorId, isActive: true } })
  const productById = new Map(products.map((p) => [p.id, p]))
  if (productById.size !== new Set(productIds).size) return { success: false, error: "One or more products are no longer available." }

  const inventories = await db.distributorInventory.findMany({
    where: { distributorProductId: { in: productIds }, locationId },
  })
  const inventoryByProduct = new Map(inventories.map((i) => [i.distributorProductId, i]))

  // Any restock link must point at a Product the buyer's own shop actually owns.
  const restockProductIds = items.map((i) => i.restockProductId).filter((id): id is string => !!id)
  if (restockProductIds.length > 0) {
    const ownedCount = await db.product.count({ where: { id: { in: restockProductIds }, shopkeeperId: shopkeeper.shopkeeperId } })
    if (ownedCount !== new Set(restockProductIds).size) return { success: false, error: "One of the linked restock products is invalid." }
  }

  let subtotal = 0
  const lineItems: { distributorProductId: string; quantity: number; unitPrice: number; totalPrice: number; restockProductId?: string }[] = []
  for (const item of items) {
    const product = productById.get(item.distributorProductId)!
    const inventory = inventoryByProduct.get(item.distributorProductId)
    const available = inventory?.currentStock ?? 0
    if (item.quantity > available) return { success: false, error: `${product.name} only has ${available} left at this location.` }

    const unitPrice = item.quantity >= product.minWholesaleQty ? Number(product.wholesalePrice) : Number(product.retailPrice)
    const totalPrice = unitPrice * item.quantity
    subtotal += totalPrice
    lineItems.push({ distributorProductId: item.distributorProductId, quantity: item.quantity, unitPrice, totalPrice, restockProductId: item.restockProductId })
  }

  // Delivery zone, same contract as retail checkout: a location with no
  // radius ships anywhere, and an unlocated buyer or location is never
  // refused — only priced at the flat fee. See lib/delivery-zone.ts.
  const zone: DeliveryZone = {
    radiusKm: location.deliveryRadiusKm != null ? Number(location.deliveryRadiusKm) : null,
    flatFee: location.deliveryFee != null ? Number(location.deliveryFee) : DEFAULT_WHOLESALE_DELIVERY_FEE,
    perKm: Number(location.deliveryFeePerKm),
  }
  const quote = quoteDelivery(
    zone,
    toCoordinates(location.latitude, location.longitude),
    toCoordinates(buyerProfile.latitude, buyerProfile.longitude),
  )
  if (!quote.deliverable) {
    return { success: false, error: outOfRangeMessage(location.name, quote) }
  }

  const deliveryFee = quote.fee
  const total = subtotal + deliveryFee

  const wallet = await db.wallet.findUnique({ where: { userId: shopkeeper.userId } })
  if (!wallet) return { success: false, error: "Wallet not found." }
  if (Number(wallet.balance) < total) return { success: false, error: "Insufficient wallet balance for this order." }

  const orderNumber = `WO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  let createdOrderId = ""

  try {
  await db.$transaction(async (tx) => {
    const balanceBefore = Number(wallet.balance)
    const balanceAfter = balanceBefore - total
    await tx.wallet.update({ where: { userId: shopkeeper.userId }, data: { balance: balanceAfter } })
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: "DEBIT",
        amount: -total,
        description: `Wholesale order ${orderNumber}`,
        referenceType: "WHOLESALE_ORDER",
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    })

    const order = await tx.wholesaleOrder.create({
      data: {
        orderNumber,
        buyerShopkeeperId: shopkeeper.shopkeeperId,
        distributorId,
        locationId,
        status: "PENDING",
        subtotal,
        deliveryFee,
        total,
        notes: notes || undefined,
        items: { create: lineItems },
      },
    })
    createdOrderId = order.id

    await tx.payment.create({
      data: {
        amount: total,
        status: "COMPLETED",
        contextType: "WHOLESALE_ORDER",
        wholesaleOrderId: order.id,
        payerId: shopkeeper.userId,
        payeeId: distributor.userId,
        paidAt: new Date(),
      },
    })

    for (const item of lineItems) {
      await tx.distributorInventory.update({
        where: { distributorProductId_locationId: { distributorProductId: item.distributorProductId, locationId } },
        data: { currentStock: { decrement: item.quantity } },
      })
      await tx.distributorProduct.update({ where: { id: item.distributorProductId }, data: { totalSoldWholesale: { increment: item.quantity } } })
    }

    const deliveredOrderCount = await tx.wholesaleOrder.count({ where: { distributorId, status: "DELIVERED" } })
    const rate = await getEffectiveCommissionRate("DISTRIBUTOR", deliveredOrderCount)
    const { commissionAmount, payoutAmount } = splitByCommission(subtotal, rate)

    const distributorWallet = await tx.wallet.upsert({
      where: { userId: distributor.userId },
      update: {},
      create: { userId: distributor.userId },
    })
    const distBefore = Number(distributorWallet.balance)
    const distAfter = distBefore + payoutAmount
    await tx.wallet.update({ where: { userId: distributor.userId }, data: { balance: distAfter, totalEarned: { increment: payoutAmount } } })
    await tx.transaction.create({
      data: {
        walletId: distributorWallet.id,
        type: "CREDIT",
        amount: payoutAmount,
        description: `Wholesale order ${orderNumber} from ${buyerProfile.shopName}`,
        referenceType: "WHOLESALE_ORDER",
        referenceId: order.id,
        status: "COMPLETED",
        balanceBefore: distBefore,
        balanceAfter: distAfter,
      },
    })
    await tx.platformRevenue.create({
      data: {
        role: "DISTRIBUTOR",
        sourceType: "WHOLESALE_ORDER",
        sourceId: order.id,
        userId: distributor.userId,
        grossAmount: subtotal,
        rate,
        commissionAmount,
        payoutAmount,
      },
    })

    await tx.notification.create({
      data: {
        userId: distributor.userId,
        title: "New wholesale order received",
        message: `Order ${orderNumber} for KES ${total.toLocaleString()} has been placed by ${buyerProfile.shopName}.`,
        type: "PAYMENT",
        relatedType: "WHOLESALE_ORDER",
        relatedId: order.id,
        actionUrl: "/distributor/orders",
      },
    })
    await tx.notification.create({
      data: {
        userId: shopkeeper.userId,
        title: "Wholesale order placed",
        message: `Your order ${orderNumber} (KES ${total.toLocaleString()}) has been placed and is being prepared.`,
        type: "PAYMENT",
        relatedType: "WHOLESALE_ORDER",
        relatedId: order.id,
        actionUrl: "/shopkeeper/wholesale-orders",
      },
    })
  }, { timeout: 60000, maxWait: 15000 })
  } catch (err) {
    console.error("wholesale order transaction failed:", err)
    return { success: false, error: "Something went wrong placing your order. Please try again." }
  }

  await pushToUser(distributor.userId, {
    title: "New wholesale order received",
    body: `Order ${orderNumber} for KES ${total.toLocaleString()} has been placed by ${buyerProfile.shopName}.`,
    url: "/distributor/orders",
  }, "payment")
  await pushToUser(shopkeeper.userId, {
    title: "Wholesale order placed",
    body: `Your order ${orderNumber} (KES ${total.toLocaleString()}) has been placed and is being prepared.`,
    url: "/shopkeeper/wholesale-orders",
  }, "payment")

  return { success: true, orderId: createdOrderId }
}

export type WholesaleOrderItemRow = {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export type MyWholesaleOrder = {
  id: string
  orderNumber: string
  distributorName: string
  locationName: string
  items: WholesaleOrderItemRow[]
  itemCount: number
  subtotal: number
  deliveryFee: number
  total: number
  status: string
  notes: string | null
  createdAt: string
}

export async function getMyWholesaleOrders(): Promise<MyWholesaleOrder[]> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return []

  const orders = await db.wholesaleOrder.findMany({
    where: { buyerShopkeeperId: shopkeeper.shopkeeperId },
    orderBy: { createdAt: "desc" },
    include: { distributor: true, location: true, items: { include: { distributorProduct: true } } },
  })

  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    distributorName: o.distributor.companyName,
    locationName: o.location.name,
    items: o.items.map((it) => ({
      id: it.id,
      productName: it.distributorProduct.name,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      totalPrice: Number(it.totalPrice),
    })),
    itemCount: o.items.reduce((sum, it) => sum + it.quantity, 0),
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.deliveryFee),
    total: Number(o.total),
    status: o.status,
    notes: o.notes,
    createdAt: o.createdAt.toISOString(),
  }))
}

const orderIdSchema = z.object({ wholesaleOrderId: z.string().trim().min(1) })

export async function cancelMyWholesaleOrder(input: unknown): Promise<WholesaleOrderActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = orderIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const order = await db.wholesaleOrder.findUnique({
    where: { id: parsed.data.wholesaleOrderId },
    include: { items: true, distributor: true },
  })
  if (!order || order.buyerShopkeeperId !== shopkeeper.shopkeeperId) return { success: false, error: "Order not found." }
  if (order.status !== "PENDING") return { success: false, error: "This order can no longer be cancelled." }

  const total = Number(order.total)
  const subtotal = Number(order.subtotal)

  // Reverse the amount actually credited (subtotal minus commission), not
  // the full gross subtotal — read from the PlatformRevenue ledger recorded
  // at placeWholesaleOrder() time so a since-changed commission rate can't
  // cause an over/under-correction. Orders placed before commission
  // enforcement have no ledger row, so payoutAmount falls back to subtotal.
  const revenueEntry = await db.platformRevenue.findUnique({ where: { sourceId: order.id } })
  const payoutToReverse = revenueEntry ? Number(revenueEntry.payoutAmount) : subtotal

  await db.$transaction(async (tx) => {
    await tx.wholesaleOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } })

    if (revenueEntry && !revenueEntry.reversedAt) {
      await tx.platformRevenue.update({ where: { id: revenueEntry.id }, data: { reversedAt: new Date() } })
    }

    for (const item of order.items) {
      await tx.distributorInventory.updateMany({
        where: { distributorProductId: item.distributorProductId, locationId: order.locationId },
        data: { currentStock: { increment: item.quantity } },
      })
      await tx.distributorProduct.update({ where: { id: item.distributorProductId }, data: { totalSoldWholesale: { decrement: item.quantity } } })
    }

    const buyerWallet = await tx.wallet.upsert({ where: { userId: shopkeeper.userId }, update: {}, create: { userId: shopkeeper.userId } })
    const buyerBefore = Number(buyerWallet.balance)
    const buyerAfter = buyerBefore + total
    await tx.wallet.update({ where: { userId: shopkeeper.userId }, data: { balance: buyerAfter } })
    await tx.transaction.create({
      data: {
        walletId: buyerWallet.id,
        type: "REFUND",
        amount: total,
        description: `Refund for cancelled wholesale order ${order.orderNumber}`,
        referenceType: "WHOLESALE_ORDER",
        referenceId: order.id,
        status: "COMPLETED",
        balanceBefore: buyerBefore,
        balanceAfter: buyerAfter,
      },
    })

    const distributorWallet = await tx.wallet.upsert({ where: { userId: order.distributor.userId }, update: {}, create: { userId: order.distributor.userId } })
    const distBefore = Number(distributorWallet.balance)
    const distAfter = distBefore - payoutToReverse
    await tx.wallet.update({ where: { userId: order.distributor.userId }, data: { balance: distAfter, totalEarned: { decrement: payoutToReverse } } })
    await tx.transaction.create({
      data: {
        walletId: distributorWallet.id,
        type: "DEBIT",
        amount: -payoutToReverse,
        description: `Wholesale order ${order.orderNumber} cancelled, payout reversed`,
        referenceType: "WHOLESALE_ORDER",
        referenceId: order.id,
        status: "COMPLETED",
        balanceBefore: distBefore,
        balanceAfter: distAfter,
      },
    })

    await tx.notification.create({
      data: {
        userId: order.distributor.userId,
        title: "Wholesale order cancelled",
        message: `Order ${order.orderNumber} was cancelled by the buyer.`,
        type: "PAYMENT",
        relatedType: "WHOLESALE_ORDER",
        relatedId: order.id,
        actionUrl: "/distributor/orders",
      },
    })
  }, { timeout: 20000, maxWait: 10000 })

  await pushToUser(order.distributor.userId, {
    title: "Wholesale order cancelled",
    body: `Order ${order.orderNumber} was cancelled by the buyer.`,
    url: "/distributor/orders",
  }, "payment")

  return { success: true, orderId: order.id }
}

export type IncomingWholesaleOrder = {
  id: string
  orderNumber: string
  buyerShopName: string
  locationName: string
  items: WholesaleOrderItemRow[]
  itemCount: number
  subtotal: number
  deliveryFee: number
  total: number
  status: string
  notes: string | null
  createdAt: string
}

export async function getIncomingWholesaleOrders(): Promise<IncomingWholesaleOrder[]> {
  const distributor = await requireDistributor()
  if (!distributor) return []

  const orders = await db.wholesaleOrder.findMany({
    where: { distributorId: distributor.distributorId },
    orderBy: { createdAt: "desc" },
    include: { buyerShopkeeper: true, location: true, items: { include: { distributorProduct: true } } },
  })

  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    buyerShopName: o.buyerShopkeeper.shopName,
    locationName: o.location.name,
    items: o.items.map((it) => ({
      id: it.id,
      productName: it.distributorProduct.name,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      totalPrice: Number(it.totalPrice),
    })),
    itemCount: o.items.reduce((sum, it) => sum + it.quantity, 0),
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.deliveryFee),
    total: Number(o.total),
    status: o.status,
    notes: o.notes,
    createdAt: o.createdAt.toISOString(),
  }))
}

const ADVANCE_WHOLESALE_STATUSES: Record<string, "PROCESSING" | "SHIPPED" | "DELIVERED"> = {
  processing: "PROCESSING",
  shipped: "SHIPPED",
  delivered: "DELIVERED",
}

const advanceWholesaleSchema = z.object({
  wholesaleOrderId: z.string().trim().min(1),
  status: z.enum(["processing", "shipped", "delivered"]),
})

/** Mirrors advanceOrderStatus (shopkeeper-orders.ts) exactly, plus one
 * addition: on DELIVERED, line items with a restockProductId linked at
 * order time get the buyer's own retail Inventory topped up by the ordered
 * quantity — the direct increment mirror of checkout()'s decrement. Items
 * without a link (raw materials, not resale stock) are a deliberate no-op. */
export async function advanceWholesaleOrderStatus(input: unknown): Promise<WholesaleOrderActionResult> {
  const distributor = await requireDistributor()
  if (!distributor) return { success: false, error: "You must be signed in as a distributor." }

  // Progressive KYC: same rule as a shopkeeper advancing a retail order.
  // placeWholesaleOrder above is deliberately not gated here — it already
  // requires buyerProfile.isVerified, which KYC approval sets in the same
  // transaction (see lib/kyc-review-core.ts), so a second check would only
  // cost a round-trip.
  const gate = await requireVerified("order.accept")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = advanceWholesaleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const order = await db.wholesaleOrder.findUnique({
    where: { id: parsed.data.wholesaleOrderId },
    include: { items: true, buyerShopkeeper: true },
  })
  if (!order || order.distributorId !== distributor.distributorId) return { success: false, error: "Order not found." }
  if (order.status === "CANCELLED" || order.status === "REFUNDED" || order.status === "DELIVERED") {
    return { success: false, error: "This order can no longer be updated." }
  }

  const nextStatus = ADVANCE_WHOLESALE_STATUSES[parsed.data.status]

  await db.$transaction(async (tx) => {
    await tx.wholesaleOrder.update({ where: { id: order.id }, data: { status: nextStatus } })

    if (nextStatus === "DELIVERED") {
      const restockItems = order.items.filter((it) => it.restockProductId)
      for (const item of restockItems) {
        await tx.inventory.updateMany({
          where: { productId: item.restockProductId! },
          data: { currentStock: { increment: item.quantity }, lastRestockedAt: new Date() },
        })
      }
      if (restockItems.length > 0) {
        await tx.notification.create({
          data: {
            userId: order.buyerShopkeeper.userId,
            title: "Stock auto-restocked",
            message: `${restockItems.length} product(s) were restocked from wholesale order ${order.orderNumber}.`,
            type: "SYSTEM",
            relatedType: "WHOLESALE_ORDER",
            relatedId: order.id,
            actionUrl: "/shopkeeper/products",
          },
        })
      }
    }

    await tx.notification.create({
      data: {
        userId: order.buyerShopkeeper.userId,
        title: "Wholesale order update",
        message: `Your order ${order.orderNumber} is now ${parsed.data.status}.`,
        type: "PAYMENT",
        relatedType: "WHOLESALE_ORDER",
        relatedId: order.id,
        actionUrl: "/shopkeeper/wholesale-orders",
      },
    })
  }, { timeout: 20000, maxWait: 10000 })

  if (nextStatus === "DELIVERED" && order.items.some((it) => it.restockProductId)) {
    const restockCount = order.items.filter((it) => it.restockProductId).length
    await pushToUser(order.buyerShopkeeper.userId, {
      title: "Stock auto-restocked",
      body: `${restockCount} product(s) were restocked from wholesale order ${order.orderNumber}.`,
      url: "/shopkeeper/products",
    })
  }
  await pushToUser(order.buyerShopkeeper.userId, {
    title: "Wholesale order update",
    body: `Your order ${order.orderNumber} is now ${parsed.data.status}.`,
    url: "/shopkeeper/wholesale-orders",
  }, "payment")

  return { success: true, orderId: order.id }
}
