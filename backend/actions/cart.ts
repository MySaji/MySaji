"use server"

import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getEffectivePlatformPreferences } from "@/backend/actions/admin-settings"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { requireVerified } from "@/backend/services/verification-gate"
import { isShopCurrentlyOpen, getNextOpeningLabel, resolveShopHoursForToday } from "@/backend/domain/format"
import { getEffectiveCommissionRate, splitByCommission } from "@/backend/services/commission"
import { pushToUser } from "@/backend/services/push-core"
import { resolvePromoDiscount } from "@/backend/services/promo-code"
import { canAcceptAnotherJob } from "@/backend/services/job-limits"
import { type ReceiptLineItem, type ReceiptAdjustment } from "@/backend/actions/receipts"
import { createAndEmailReceipt } from "@/backend/services/receipts-core"
import { quoteDelivery, outOfRangeMessage, type DeliveryZone } from "@/backend/domain/delivery-zone"
import { toCoordinates, type Coordinates } from "@/backend/domain/geo"
import { recordOrderMovements, orderStockDelta } from "@/backend/services/pos-ledger"

// Gap 2 (product+service sequencing): when the cart mixes a product with a
// service, the service can't be scheduled sooner than this lead time — a
// blunt stand-in for "wait for delivery" since there's no real per-product
// delivery-ETA or product<->service linkage anywhere in this schema (that
// would be its own catalog feature). Enforced both when a service line is
// added and again at checkout, since cart contents can change in between.
const SERVICE_MIN_LEAD_TIME_WITH_PRODUCT_MS = 2 * 24 * 60 * 60 * 1000

export type CartLine =
  | {
      kind: "product"
      productId: string
      name: string
      price: number
      image: string | null
      shop: string
      shopId?: string
      quantity: number
      stock: number
      shopIsOpen: boolean
      shopNextOpeningLabel: string | null
      shopDeliveryFee: number
      deliveryError?: string | null
      shopIsOnVacation: boolean
      shopVacationNote: string | null
    }
  | {
      kind: "offer"
      cartItemId: string
      offerId: string
      name: string
      image: string | null
      providerName: string
      price: number
      quantity: number
      /// null when the provider does not track stock on this offer, which is
      /// the default — same meaning as Offer.stockQuantity itself.
      stock: number | null
    }
  | {
      kind: "service"
      cartItemId: string
      serviceId: string
      servicePackageId: string | null
      name: string
      image: string | null
      providerName: string
      price: number
      quantity: number
      scheduledDate: string
      notes: string | null
    }

async function requireCustomerId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return session.user.id
}

/** The Smart Cart — one list holding both Product lines (existing) and
 * Service lines (new), so checkout() below can split a single payment into
 * per-shopkeeper Orders AND per-provider Jobs in one pass. */
export async function getCart(destinationInput?: { latitude: number; longitude: number }): Promise<CartLine[]> {
  const customerId = await requireCustomerId()
  if (!customerId) return []
  const destination = destinationInput && typeof destinationInput === "object"
    ? toCoordinates(destinationInput.latitude, destinationInput.longitude) : null

  const items = await db.cartItem.findMany({
    where: { customerId },
    orderBy: { createdAt: "asc" },
    include: {
      product: { include: { shopkeeper: true, inventory: true } },
      offer: { include: { provider: { include: { user: true } } } },
      service: { include: { provider: { include: { user: true } } } },
      servicePackage: true,
    },
  })

  return items.map((item): CartLine => {
    if (item.product) {
      const { openingTime, closingTime } = resolveShopHoursForToday(item.product.shopkeeper)
      const shopIsOpen = isShopCurrentlyOpen(openingTime, closingTime)
      const shop = item.product.shopkeeper
      const delivery = quoteDelivery({ radiusKm: shop.deliveryRadiusKm != null ? Number(shop.deliveryRadiusKm) : null, flatFee: Number(shop.deliveryFee), perKm: Number(shop.deliveryFeePerKm) }, toCoordinates(shop.latitude, shop.longitude), destination)
      return {
        kind: "product",
        productId: item.productId!,
        name: item.product.name,
        price: Number(item.product.discountPrice ?? item.product.price),
        image: item.product.images[0] ?? null,
        shop: item.product.shopkeeper.shopName,
        shopId: item.product.shopkeeperId,
        quantity: item.quantity,
        stock: item.product.inventory ? Math.max(item.product.inventory.currentStock - item.product.inventory.reservedStock, 0) : 0,
        shopIsOpen,
        shopNextOpeningLabel: shopIsOpen ? null : getNextOpeningLabel(item.product.shopkeeper),
        shopDeliveryFee: delivery.deliverable ? delivery.fee : Number(shop.deliveryFee),
        deliveryError: delivery.deliverable ? null : outOfRangeMessage(shop.shopName, delivery),
        shopIsOnVacation: item.product.shopkeeper.isOnVacation,
        shopVacationNote: item.product.shopkeeper.vacationNote,
      }
    }

    if (item.offer) {
      const offer = item.offer
      return {
        kind: "offer",
        cartItemId: item.id,
        offerId: offer.id,
        name: offer.title,
        image: offer.images[0] ?? null,
        providerName: offer.provider.businessName || offer.provider.user.name,
        price: Number(offer.price ?? 0),
        quantity: item.quantity,
        stock: offer.stockQuantity,
      }
    }

    const service = item.service!
    return {
      kind: "service",
      cartItemId: item.id,
      serviceId: service.id,
      servicePackageId: item.servicePackageId,
      name: service.title,
      image: service.images[0] ?? null,
      providerName: service.provider.businessName || service.provider.user.name,
      price: Number(item.servicePackage?.price ?? service.basePrice),
      quantity: item.quantity,
      scheduledDate: item.scheduledDate!.toISOString(),
      notes: item.notes,
    }
  })
}

export async function getCartCount(): Promise<number> {
  const customerId = await requireCustomerId()
  if (!customerId) return 0
  const result = await db.cartItem.aggregate({ where: { customerId }, _sum: { quantity: true } })
  return result._sum.quantity ?? 0
}

export type CartActionResult = { success: true } | { success: false; error: string }

// ============================= PRODUCT LINES =============================

const addToCartSchema = z.object({ productId: z.string().trim().min(1), quantity: z.number().int().min(1).default(1) })

export async function addToCart(input: unknown): Promise<CartActionResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  const parsed = addToCartSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { productId, quantity } = parsed.data

  const product = await db.product.findUnique({ where: { id: productId }, include: { inventory: true, shopkeeper: true } })
  if (!product || !product.isActive) return { success: false, error: "Product not found." }
  if (product.shopkeeper.isOnVacation) return { success: false, error: "This shop is temporarily closed and isn't accepting new orders right now." }

  const isBlocked = await db.blockedShopCustomer.findUnique({
    where: { shopkeeperId_customerId: { shopkeeperId: product.shopkeeperId, customerId } },
  })
  if (isBlocked) return { success: false, error: "This shop isn't able to accept orders from your account." }

  const existing = await db.cartItem.findUnique({ where: { customerId_productId: { customerId, productId } } })

  await db.cartItem.upsert({
    where: { customerId_productId: { customerId, productId } },
    update: { quantity: (existing?.quantity ?? 0) + quantity },
    create: { customerId, productId, quantity },
  })

  return { success: true }
}

const updateQuantitySchema = z.object({ productId: z.string().trim().min(1), quantity: z.number().int().min(0) })

export async function updateCartItemQuantity(input: unknown): Promise<CartActionResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  const parsed = updateQuantitySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { productId, quantity } = parsed.data

  if (quantity <= 0) {
    await db.cartItem.deleteMany({ where: { customerId, productId } })
  } else {
    await db.cartItem.updateMany({ where: { customerId, productId }, data: { quantity } })
  }

  return { success: true }
}

const removeSchema = z.object({ productId: z.string().trim().min(1) })

export async function removeCartItem(input: unknown): Promise<CartActionResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  const parsed = removeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.cartItem.deleteMany({ where: { customerId, productId: parsed.data.productId } })
  return { success: true }
}

// ============================= SERVICE LINES =============================

const addServiceToCartSchema = z.object({
  serviceId: z.string().trim().min(1),
  servicePackageId: z.string().trim().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  quantity: z.number().int().min(1).max(24).default(1),
  notes: z.string().trim().optional(),
})

/** Adds (or updates, if this service+package is already in the cart) a
 * Service line to the Smart Cart — the alternative to createBooking's
 * pay-now-via-gateway path (see app/customer/booking/booking-content.tsx),
 * for combining a booking with a product order into one wallet-paid
 * checkout via checkout() below. */
export async function addServiceToCart(input: unknown): Promise<CartActionResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  const parsed = addServiceToCartSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { serviceId, servicePackageId, date, time, quantity, notes } = parsed.data

  const service = await db.service.findUnique({ where: { id: serviceId }, include: { provider: { include: { availability: true } } } })
  if (!service || !service.isActive || service.approvalStatus !== "APPROVED") {
    return { success: false, error: "This service is no longer available." }
  }
  if (service.provider?.availability?.isOnVacation) {
    return { success: false, error: "This provider is currently unavailable for new bookings." }
  }

  const isBlocked = await db.blockedClient.findUnique({
    where: { providerId_customerId: { providerId: service.providerId, customerId } },
  })
  if (isBlocked) return { success: false, error: "This provider isn't accepting bookings from you." }

  if (servicePackageId) {
    const pkg = await db.servicePackage.findUnique({ where: { id: servicePackageId } })
    if (!pkg || pkg.serviceId !== serviceId) return { success: false, error: "Invalid service package." }
  }

  const scheduledDate = new Date(`${date}T${time}:00`)
  if (Number.isNaN(scheduledDate.getTime())) return { success: false, error: "Invalid date or time." }

  const hasProduct = await db.cartItem.findFirst({ where: { customerId, productId: { not: null } } })
  if (hasProduct && scheduledDate.getTime() < Date.now() + SERVICE_MIN_LEAD_TIME_WITH_PRODUCT_MS) {
    return { success: false, error: "Since your cart also has a product, please choose a service date at least 2 days out to allow time for delivery." }
  }

  const existing = await db.cartItem.findFirst({ where: { customerId, serviceId, servicePackageId: servicePackageId ?? null } })
  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity, scheduledDate, notes: notes || null } })
  } else {
    await db.cartItem.create({
      data: { customerId, serviceId, servicePackageId: servicePackageId ?? null, quantity, scheduledDate, notes: notes || null },
    })
  }

  return { success: true }
}

const removeServiceSchema = z.object({ cartItemId: z.string().trim().min(1) })

export async function removeServiceCartItem(input: unknown): Promise<CartActionResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  const parsed = removeServiceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.cartItem.deleteMany({ where: { id: parsed.data.cartItemId, customerId, serviceId: { not: null } } })
  return { success: true }
}

// ============================= OFFER LINES =============================

const addOfferToCartSchema = z.object({
  offerId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
})

/**
 * Adds a BUY-actionType Offer to the cart.
 *
 * Deliberately NOT gated on verification: filling a cart stays open, and
 * checkout() is where order.place is enforced — the same rule products
 * already follow. Only BUY reaches here; BOOK and HIRE reserve a provider's
 * time so they keep going through the booking screen, and RENT has its own
 * date-range flow.
 */
export async function addOfferToCart(input: unknown): Promise<CartActionResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  const parsed = addOfferToCartSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { offerId, quantity } = parsed.data

  const offer = await db.offer.findUnique({
    where: { id: offerId },
    include: { provider: { include: { availability: true } } },
  })
  if (!offer || offer.status !== "LIVE") return { success: false, error: "This offer is no longer available." }
  if (offer.actionType !== "BUY") return { success: false, error: "This offer can't be added to a cart." }
  if (offer.price == null) return { success: false, error: "This offer has no price yet." }
  if (offer.provider?.availability?.isOnVacation) {
    return { success: false, error: "This provider is currently unavailable for new orders." }
  }

  const isBlocked = await db.blockedClient.findUnique({
    where: { providerId_customerId: { providerId: offer.providerId, customerId } },
  })
  if (isBlocked) return { success: false, error: "This provider isn't able to accept orders from your account." }

  const existing = await db.cartItem.findUnique({ where: { customerId_offerId: { customerId, offerId } } })
  const nextQuantity = (existing?.quantity ?? 0) + quantity

  // Friendly early rejection only. The race-safe decrement still happens when
  // payment clears, exactly as createOfferBooking documents.
  if (offer.stockQuantity != null && offer.stockQuantity < nextQuantity) {
    return {
      success: false,
      error: offer.stockQuantity === 0 ? "This is out of stock." : `Only ${offer.stockQuantity} left in stock.`,
    }
  }

  await db.cartItem.upsert({
    where: { customerId_offerId: { customerId, offerId } },
    update: { quantity: nextQuantity },
    create: { customerId, offerId, quantity },
  })

  return { success: true }
}

const offerCartItemSchema = z.object({
  cartItemId: z.string().trim().min(1),
  quantity: z.number().int().min(0).max(99),
})

/** Quantity 0 removes the line, matching updateCartItemQuantity for products. */
export async function updateOfferCartItemQuantity(input: unknown): Promise<CartActionResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  const parsed = offerCartItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { cartItemId, quantity } = parsed.data

  const where = { id: cartItemId, customerId, offerId: { not: null } }
  if (quantity <= 0) {
    await db.cartItem.deleteMany({ where })
  } else {
    await db.cartItem.updateMany({ where, data: { quantity } })
  }
  return { success: true }
}

export async function removeOfferCartItem(input: unknown): Promise<CartActionResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  const parsed = removeServiceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.cartItem.deleteMany({ where: { id: parsed.data.cartItemId, customerId, offerId: { not: null } } })
  return { success: true }
}

// ============================= CHECKOUT (SPLITTER) =============================

const checkoutSchema = z.object({
  shippingAddress: z.string().trim().min(1, "Delivery address is required"),
  // Set when the customer picked their address from Places autocomplete.
  // Optional on purpose: a typed address still checks out, it just cannot
  // be distance-checked or distance-priced (see lib/delivery-zone.ts).
  shippingLatitude: z.number().min(-90).max(90).optional(),
  shippingLongitude: z.number().min(-180).max(180).optional(),
  shippingPhone: z.string().trim().min(7, "Enter a valid phone number"),
  notes: z.string().trim().optional(),
  promoCode: z.string().trim().optional(),
  paymentChoice: z.enum(["DIRECT", "WALLET"]).default("DIRECT"),
  expectedTotal: z.number().finite().nonnegative().optional(),
})

// Fallback only for the rare case a shop's own deliveryFee somehow isn't
// readable (e.g. profile lookup gap) — every ShopkeeperProfile row has a real
// deliveryFee value (schema default 500) set by the shop itself in
// app/shopkeeper/settings, so this constant is not the source of truth anymore.
const DEFAULT_SHIPPING_COST = 500

export type CheckoutResult = { success: true; orderIds: string[]; jobIds: string[]; totalAmount: number; paymentMode: "DIRECT" | "WALLET" } | { success: false; error: string }

/**
 * The Checkout Splitter: one customer payment (a single wallet debit) fans
 * out into one Order per shopkeeper (unchanged, existing behavior) AND one
 * Job per service line (new). Products pay the shopkeeper out immediately
 * (existing behavior, unchanged). Services deliberately do NOT pay the
 * provider here — that only happens when the provider marks the job
 * COMPLETED via completeJob() in provider-jobs.ts, exactly like every other
 * booking path (Marketplace, Emergency, wizard) already works. This keeps
 * one consistent payout rule for providers regardless of how a job was
 * booked, at the cost of the product/service sides paying out on different
 * schedules — an intentional asymmetry, not an oversight.
 */
export async function checkout(input: unknown): Promise<CheckoutResult> {
  const customerId = await requireCustomerId()
  if (!customerId) return { success: false, error: "You must be signed in." }

  // Progressive KYC: browsing and filling a cart stay open to everyone;
  // placing the order is where a verified identity starts to matter.
  const gate = await requireVerified("order.place")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { shippingAddress, shippingLatitude, shippingLongitude, shippingPhone, notes, promoCode } = parsed.data
  const policy = await getEffectivePlatformPreferences()
  const direct = parsed.data.paymentChoice === "DIRECT"
  if (!direct && !policy.customerAppPaymentsEnabled) return { success: false, error: "In-app payments are disabled. Choose payment directly to the owner." }
  if (!direct && policy.jobPaymentMode === "DIRECT") return { success: false, error: "Choose direct payment for this checkout." }
  const destination: Coordinates | null =
    shippingLatitude != null && shippingLongitude != null
      ? { latitude: shippingLatitude, longitude: shippingLongitude }
      : null

  const cartItems = await db.cartItem.findMany({
    where: { customerId },
    include: {
      product: { include: { inventory: true, shopkeeper: true } },
      offer: { include: { provider: { include: { user: true, availability: true } } } },
      service: { include: { provider: { include: { user: true, availability: true } } } },
      servicePackage: true,
    },
  })
  if (cartItems.length === 0) return { success: false, error: "Your cart is empty." }

  const productItems = cartItems.filter((item) => item.productId)
  const serviceItems = cartItems.filter((item) => item.serviceId)
  const offerItems = cartItems.filter((item) => item.offerId)

  const vacationingItem = productItems.find((item) => item.product!.shopkeeper.isOnVacation)
  if (vacationingItem) {
    return { success: false, error: `${vacationingItem.product!.shopkeeper.shopName} is temporarily closed and isn't accepting orders right now. Please remove their items from your cart.` }
  }

  const shopIds = [...new Set(productItems.map((item) => item.product!.shopkeeperId))]
  const blockedShopRows = await db.blockedShopCustomer.findMany({ where: { customerId, shopkeeperId: { in: shopIds } } })
  if (blockedShopRows.length > 0) {
    const blockedShopId = blockedShopRows[0].shopkeeperId
    const blockedItem = productItems.find((item) => item.product!.shopkeeperId === blockedShopId)
    return { success: false, error: `${blockedItem?.product!.shopkeeper.shopName ?? "One of these shops"} isn't able to accept your order. Please remove their items from your cart.` }
  }

  for (const item of productItems) {
    const available = item.product!.inventory ? item.product!.inventory.currentStock - item.product!.inventory.reservedStock : 0
    if (item.quantity > available) {
      return { success: false, error: `${item.product!.name} only has ${Math.max(available, 0)} left in stock.` }
    }
  }

  // A BUY offer can go dark, run out or have its provider go on holiday
  // between adding it and paying, exactly like a product can.
  for (const item of offerItems) {
    const offer = item.offer!
    if (offer.status !== "LIVE" || offer.actionType !== "BUY" || offer.price == null) {
      return { success: false, error: `${offer.title} is no longer available.` }
    }
    if (offer.provider.availability?.isOnVacation) {
      return { success: false, error: `${offer.provider.businessName || offer.provider.user.name} is currently unavailable for new orders.` }
    }
    if (offer.stockQuantity != null && offer.stockQuantity < item.quantity) {
      return { success: false, error: `${offer.title} only has ${Math.max(offer.stockQuantity, 0)} left in stock.` }
    }
  }
  const offerProviderIds = [...new Set(offerItems.map((item) => item.offer!.providerId))]
  if (offerProviderIds.length > 0) {
    const blocked = await db.blockedClient.findFirst({ where: { customerId, providerId: { in: offerProviderIds } } })
    if (blocked) {
      const blockedItem = offerItems.find((item) => item.offer!.providerId === blocked.providerId)
      return { success: false, error: `${blockedItem?.offer!.provider.businessName || "One of these providers"} isn't able to accept your order. Please remove their item from your cart.` }
    }
  }

  for (const item of serviceItems) {
    const service = item.service!
    if (!service.isActive || service.approvalStatus !== "APPROVED") {
      return { success: false, error: `${service.title} is no longer available.` }
    }
    if (service.provider.availability?.isOnVacation) {
      return { success: false, error: `${service.provider.businessName || service.provider.user.name} is currently unavailable for new bookings.` }
    }
    if (!item.scheduledDate) {
      return { success: false, error: `Please choose a date for ${service.title}.` }
    }
  }
  if (productItems.length > 0 && serviceItems.length > 0) {
    const tooSoon = serviceItems.find((item) => item.scheduledDate!.getTime() < Date.now() + SERVICE_MIN_LEAD_TIME_WITH_PRODUCT_MS)
    if (tooSoon) {
      return { success: false, error: `${tooSoon.service!.title} must be scheduled at least 2 days out since your cart also has a product, to allow time for delivery.` }
    }
  }
  const providerIds = [...new Set(serviceItems.map((item) => item.service!.providerId))]
  if (providerIds.length > 0) {
    const blockedProviderRow = await db.blockedClient.findFirst({ where: { customerId, providerId: { in: providerIds } } })
    if (blockedProviderRow) {
      const blockedItem = serviceItems.find((item) => item.service!.providerId === blockedProviderRow.providerId)
      return { success: false, error: `${blockedItem?.service!.provider.businessName || "One of these providers"} isn't able to accept your booking. Please remove their service from your cart.` }
    }
  }

  const byShop = new Map<string, typeof productItems>()
  for (const item of productItems) {
    const list = byShop.get(item.product!.shopkeeperId) ?? []
    list.push(item)
    byShop.set(item.product!.shopkeeperId, list)
  }

  const shopkeeperProfiles = await db.shopkeeperProfile.findMany({
    where: { id: { in: [...byShop.keys()] } },
    select: {
      id: true, userId: true, shopName: true, deliveryFee: true,
      deliveryRadiusKm: true, deliveryFeePerKm: true,
      latitude: true, longitude: true,
    },
  })
  const shopkeeperUserIdById = new Map(shopkeeperProfiles.map((s) => [s.id, s.userId]))

  // Delivery zones: each shop decides how far it will go and what that
  // costs. A shop with no radius set delivers anywhere, and an address with
  // no coordinates is never refused — see quoteDelivery for why.
  const shopkeeperDeliveryFeeById = new Map<string, number>()
  for (const shop of shopkeeperProfiles) {
    const zone: DeliveryZone = {
      radiusKm: shop.deliveryRadiusKm != null ? Number(shop.deliveryRadiusKm) : null,
      flatFee: Number(shop.deliveryFee),
      perKm: Number(shop.deliveryFeePerKm),
    }
    const quote = quoteDelivery(zone, toCoordinates(shop.latitude, shop.longitude), destination)
    if (!quote.deliverable) {
      return { success: false, error: outOfRangeMessage(shop.shopName, quote) }
    }
    shopkeeperDeliveryFeeById.set(shop.id, quote.fee)
  }

  const shippingTotal = [...byShop.keys()].reduce((sum, shopkeeperId) => sum + (shopkeeperDeliveryFeeById.get(shopkeeperId) ?? DEFAULT_SHIPPING_COST), 0)
  const productsSubtotal = productItems.reduce((sum, item) => sum + Number(item.product!.discountPrice ?? item.product!.price) * item.quantity, 0)
  const servicesSubtotal = serviceItems.reduce((sum, item) => sum + Number(item.servicePackage?.price ?? item.service!.basePrice) * item.quantity, 0)
  // No delivery fee is added for offer lines: a provider has no per-shop
  // deliveryFee setting, and fulfilment is arranged with them directly.
  const offersSubtotal = offerItems.reduce((sum, item) => sum + Number(item.offer!.price) * item.quantity, 0)

  // Resolved once, before the transaction, and trusted as-is inside it (no
  // re-check at commit time) — that keeps grandTotal (what the customer is
  // charged) and the sum of each shop's Order.total always in agreement.
  // Re-validating against a possibly-changed usedCount/status mid-flight
  // would risk the opposite bug: charging the customer less than their
  // receipt shows if the code expired in the gap between the two checks.
  let promo: { promotionId: string; shopkeeperId: string; discountAmount: number } | null = null
  if (promoCode) {
    const result = await resolvePromoDiscount(db, customerId, promoCode)
    if (!result.success) return { success: false, error: result.error }
    promo = result
  }
  const discountAmount = promo?.discountAmount ?? 0
  const grandTotal = productsSubtotal + shippingTotal - discountAmount + servicesSubtotal + offersSubtotal
  if (parsed.data.expectedTotal != null && Math.abs(parsed.data.expectedTotal - grandTotal) > 0.005) {
    return { success: false, error: "Your cart total changed. Refresh the cart and review the updated total before paying. No payment was taken." }
  }
  const partsSummary = [
    byShop.size > 0 ? `${byShop.size} shop${byShop.size > 1 ? "s" : ""}` : null,
    serviceItems.length > 0 ? `${serviceItems.length} service${serviceItems.length > 1 ? "s" : ""}` : null,
    offerItems.length > 0 ? `${offerItems.length} Pro offer${offerItems.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(", ")

  const wallet = direct ? null : await db.wallet.findUnique({ where: { userId: customerId } })
  if (!direct && !wallet) return { success: false, error: "Wallet not found." }
  if (!direct && wallet && Number(wallet.balance) < grandTotal) return { success: false, error: "Insufficient wallet balance for this order." }

  const orderIds: string[] = []
  const jobIds: string[] = []
  const shopNotifications: { shopkeeperUserId: string; orderNumber: string; shopTotal: number; orderId: string }[] = []
  const providerNotifications: { providerUserId: string; serviceTitle: string; jobId: string }[] = []
  const combinedNotes = [notes, `Contact phone: ${shippingPhone}`].filter(Boolean).join(" | ")

  try {
  await db.$transaction(async (tx) => {
    // Serialize checkouts for one account; stale concurrent requests see an empty cart.
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('customer-checkout'), hashtext(${customerId}))`
    const stillPresent = await tx.cartItem.count({ where: { customerId, id: { in: cartItems.map(item => item.id) } } })
    if (stillPresent !== cartItems.length) throw new Error("Cart changed during checkout")
    const currentWallet = direct ? null : await tx.wallet.findUnique({ where: { userId: customerId } })
    const balanceBefore = Number(currentWallet?.balance ?? 0)
    const balanceAfter = balanceBefore - grandTotal
    if (!direct) {
      const debited = await tx.wallet.updateMany({ where: { userId: customerId, balance: { gte: grandTotal } }, data: { balance: { decrement: grandTotal } } })
      if (debited.count !== 1) throw new Error("Insufficient wallet balance")
    }

    const address = productItems.length > 0
      // Coordinates are stored when known, so the order carries where it
      // was actually sent rather than only the text the customer typed.
      ? await tx.address.create({
          data: {
            userId: customerId, label: "Delivery", type: "OTHER", address: shippingAddress,
            latitude: destination?.latitude, longitude: destination?.longitude,
          },
        })
      : null

    for (const [shopkeeperId, items] of byShop) {
      const shopSubtotal = items.reduce((sum, item) => sum + Number(item.product!.discountPrice ?? item.product!.price) * item.quantity, 0)
      const shopDeliveryFee = shopkeeperDeliveryFeeById.get(shopkeeperId) ?? DEFAULT_SHIPPING_COST
      const shopDiscount = promo && promo.shopkeeperId === shopkeeperId ? promo.discountAmount : 0
      const shopTotal = shopSubtotal - shopDiscount + shopDeliveryFee
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

      if (shopDiscount > 0 && promo) {
        await tx.promotion.update({ where: { id: promo.promotionId }, data: { usedCount: { increment: 1 } } })
      }

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          shopkeeperId,
          addressId: address?.id,
          status: "PENDING",
          subtotal: shopSubtotal,
          discount: shopDiscount,
          shippingCost: shopDeliveryFee,
          total: shopTotal,
          notes: combinedNotes || undefined,
          items: {
            create: items.map((item) => ({
              productId: item.productId!,
              quantity: item.quantity,
              unitPrice: Number(item.product!.discountPrice ?? item.product!.price),
              totalPrice: Number(item.product!.discountPrice ?? item.product!.price) * item.quantity,
            })),
          },
        },
      })
      orderIds.push(order.id)

      const shopkeeperUserId = shopkeeperUserIdById.get(shopkeeperId)

      await tx.payment.create({
        data: {
          amount: shopTotal,
          status: direct ? "PENDING" : "COMPLETED",
          externalRef: direct ? `DIRECT:${randomUUID()}` : undefined,
          contextType: "ORDER",
          orderId: order.id,
          payerId: customerId,
          payeeId: shopkeeperUserId,
          paidAt: direct ? undefined : new Date(),
        },
      })

      // Stock leaves, and the ledger says why.
      //
      // Until POS existed this was a bare `decrement` and nothing recorded
      // that the order was the cause. A shop running a till as well as a
      // storefront then had two figures drifting apart with no way to tell
      // which sale moved what. recordOrderMovements appends the audit rows
      // in a fixed number of queries; the per-item update below still does
      // the arithmetic, and still does it ATOMICALLY — two customers buying
      // the last unit at the same instant must not lose one of the two
      // decrements, which is exactly what reading the balance first would
      // cost.
      const stockedItems = items.filter((item) => item.product!.inventory)
      if (stockedItems.length > 0) {
        const moved = await recordOrderMovements(tx as never, {
          shopkeeperId,
          kind: "ORDER_FULFILMENT",
          orderId: order.id,
          actorUserId: customerId,
          reason: `Order ${orderNumber}`,
          lines: stockedItems.map((item) => ({ productId: item.productId!, quantity: item.quantity })),
        })
        // Only reachable if a line names a product this shop does not own,
        // which the grouping above makes impossible — but a silent wrong
        // stock figure is worse than a failed checkout, so it throws rather
        // than continuing.
        if (!moved.ok) throw new Error(`stock ledger refused order ${orderNumber}: ${moved.message}`)
      }

      for (const item of items) {
        if (item.product!.inventory) {
          await tx.inventory.update({
            where: { productId: item.productId! },
            data: orderStockDelta("ORDER_FULFILMENT", item.quantity),
          })
        }
        await tx.product.update({ where: { id: item.productId! }, data: { totalSold: { increment: item.quantity } } })
      }

      // Credit the shopkeeper for the product subtotal minus platform
      // commission (shipping isn't part of their payout either way — same
      // convention as the platform handling delivery). totalSales still
      // tracks the gross subtotal (sales volume), while the wallet only
      // ever receives the net payout. A promo code is the shop's own
      // promotion, so the discount comes out of their payout, not the
      // platform's commission or the customer's total.
      if (shopkeeperUserId && !direct) {
        const deliveredOrderCount = await tx.order.count({ where: { shopkeeperId, status: "DELIVERED" } })
        const rate = await getEffectiveCommissionRate("SHOPKEEPER", deliveredOrderCount)
        const { commissionAmount, payoutAmount } = splitByCommission(shopSubtotal - shopDiscount, rate)

        const shopWallet = await tx.wallet.upsert({
          where: { userId: shopkeeperUserId },
          update: {},
          create: { userId: shopkeeperUserId },
        })
        const shopBalanceBefore = Number(shopWallet.balance)
        const shopBalanceAfter = shopBalanceBefore + payoutAmount

        await tx.wallet.update({
          where: { userId: shopkeeperUserId },
          data: { balance: shopBalanceAfter, totalEarned: { increment: payoutAmount } },
        })
        await tx.transaction.create({
          data: {
            walletId: shopWallet.id,
            type: "CREDIT",
            amount: payoutAmount,
            description: `Payment for order ${orderNumber}`,
            referenceType: "ORDER",
            referenceId: order.id,
            status: "COMPLETED",
            balanceBefore: shopBalanceBefore,
            balanceAfter: shopBalanceAfter,
          },
        })
        await tx.platformRevenue.create({
          data: {
            role: "SHOPKEEPER",
            sourceType: "ORDER",
            sourceId: order.id,
            userId: shopkeeperUserId,
            grossAmount: shopSubtotal,
            rate,
            commissionAmount,
            payoutAmount,
          },
        })
        await tx.shopkeeperProfile.update({ where: { id: shopkeeperId }, data: { totalSales: { increment: shopSubtotal } } })
        await tx.notification.create({
          data: {
            userId: shopkeeperUserId,
            title: "New order received",
            message: `Order ${orderNumber} for KES ${shopTotal.toLocaleString()} has been placed.`,
            type: "PAYMENT",
            relatedType: "ORDER",
            relatedId: order.id,
            actionUrl: "/shopkeeper/orders",
          },
        })
        shopNotifications.push({ shopkeeperUserId, orderNumber, shopTotal, orderId: order.id })
      }
    }

    if (direct) for (const [shopkeeperId] of byShop) {
      const shopkeeperUserId = shopkeeperUserIdById.get(shopkeeperId)
      const orderId = orderIds[[...byShop.keys()].indexOf(shopkeeperId)]
      if (shopkeeperUserId) await tx.notification.create({ data: { userId: shopkeeperUserId, title: "New order - payment direct", message: "Review the order and send your payment instructions in Messages. No money was collected by MySaji.", type: "JOB", relatedType: "ORDER", relatedId: orderId, actionUrl: "/shopkeeper/orders" } })
    }

    for (const item of serviceItems) {
      const service = item.service!
      const price = Number(item.servicePackage?.price ?? service.basePrice) * item.quantity
      // Gap 4: autoAccept alone isn't enough to land straight on ACCEPTED —
      // a business staff member already at their concurrent-job cap falls
      // back to PENDING for manual acceptance instead, same as if
      // autoAccept were off.
      const autoAccept = (service.provider.availability?.autoAccept ?? false) && (await canAcceptAnotherJob(tx, service.providerId))

      const job = await tx.job.create({
        data: {
          customerId,
          providerId: service.providerId,
          serviceId: service.id,
          servicePackageId: item.servicePackageId,
          title: service.title,
          description: item.notes || service.description,
          price,
          currency: service.currency,
          location: shippingAddress,
          scheduledDate: item.scheduledDate!,
          status: autoAccept ? "ACCEPTED" : "PENDING",
        },
      })
      jobIds.push(job.id)

      await tx.service.update({ where: { id: service.id }, data: { totalBookings: { increment: 1 } } })

      // Deliberately no wallet credit to the provider here — see the
      // function doc comment. This Payment row just records that the
      // customer's side of the transaction is settled.
      await tx.payment.create({
        data: {
          amount: price,
          status: direct ? "PENDING" : "COMPLETED",
          externalRef: direct ? `DIRECT:${randomUUID()}` : undefined,
          contextType: "JOB",
          jobId: job.id,
          payerId: customerId,
          payeeId: service.provider.userId,
          paidAt: direct ? undefined : new Date(),
        },
      })

      await tx.notification.create({
        data: {
          userId: service.provider.userId,
          title: autoAccept ? "New job booked" : "New job request",
          message: `${service.title} has been booked for ${item.scheduledDate!.toLocaleDateString()}.`,
          type: "JOB",
          relatedType: "JOB",
          relatedId: job.id,
          actionUrl: "/provider/jobs",
        },
      })
      providerNotifications.push({ providerUserId: service.provider.userId, serviceTitle: service.title, jobId: job.id })
    }

    // A BUY offer settles into the same Job pipeline createOfferBooking uses,
    // so payments, disputes and reviews all behave identically however the
    // offer was bought. Like services (see the function doc comment), the
    // provider is paid on completion rather than here.
    //
    // scheduledDate is the order time, not an appointment. Buying goods
    // reserves none of the provider's time — asking for a date and slot was
    // exactly what was wrong with routing BUY through the booking screen —
    // but Job.scheduledDate is non-null and is read in ~79 places (calendars,
    // reminders, provider lists), so widening it for this one case would be a
    // far larger change than the behaviour warrants. "Placed now, fulfil it"
    // is the honest reading for a purchase.
    const orderedAt = new Date()
    for (const item of offerItems) {
      const offer = item.offer!
      const price = Number(offer.price) * item.quantity

      const job = await tx.job.create({
        data: {
          customerId,
          providerId: offer.providerId,
          offerId: offer.id,
          title: offer.title,
          description: offer.description,
          price,
          currency: offer.currency,
          location: shippingAddress,
          scheduledDate: orderedAt,
          status: "PENDING",
        },
      })
      jobIds.push(job.id)

      if (offer.stockQuantity != null) {
        await tx.offer.update({ where: { id: offer.id }, data: { stockQuantity: { decrement: item.quantity } } })
      }

      await tx.payment.create({
        data: {
          amount: price,
          status: direct ? "PENDING" : "COMPLETED",
          externalRef: direct ? `DIRECT:${randomUUID()}` : undefined,
          contextType: "JOB",
          jobId: job.id,
          payerId: customerId,
          payeeId: offer.provider.userId,
          paidAt: direct ? undefined : new Date(),
        },
      })

      await tx.notification.create({
        data: {
          userId: offer.provider.userId,
          title: "New order received",
          message: `${offer.title} x${item.quantity} was ordered for KES ${price.toLocaleString()}.`,
          type: "JOB",
          relatedType: "JOB",
          relatedId: job.id,
          actionUrl: "/provider/jobs",
        },
      })
      providerNotifications.push({ providerUserId: offer.provider.userId, serviceTitle: offer.title, jobId: job.id })
    }

    if (!direct && wallet) await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: "DEBIT",
        amount: -grandTotal,
        description: `Cart checkout (${partsSummary})`,
        referenceType: "ORDER",
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    })

    await tx.cartItem.deleteMany({ where: { customerId } })

    await tx.notification.create({
      data: {
        userId: customerId,
        title: "Order placed",
        message: `Your order (${partsSummary}, KES ${grandTotal.toLocaleString()}) has been placed.`,
        type: "PAYMENT",
        actionUrl: "/customer/cart",
      },
    })
  }, { timeout: 60000, maxWait: 15000 })
  } catch (err) {
    console.error("checkout transaction failed:", err)
    return { success: false, error: "Something went wrong placing your order. Please try again." }
  }

  await Promise.all([
    pushToUser(customerId, {
      title: "Order placed",
      body: `Your order (${partsSummary}, KES ${grandTotal.toLocaleString()}) has been placed.`,
      url: "/customer/cart",
    }, "payment"),
    ...shopNotifications.map((n) =>
      pushToUser(n.shopkeeperUserId, {
        title: "New order received",
        body: `Order ${n.orderNumber} for KES ${n.shopTotal.toLocaleString()} has been placed.`,
        url: "/shopkeeper/orders",
      }, "payment")
    ),
    ...providerNotifications.map((n) =>
      pushToUser(n.providerUserId, {
        title: "New job request",
        body: `${n.serviceTitle} has been booked.`,
        url: "/provider/jobs",
      }, "job")
    ),
  ])

  // Fire-and-forget — PDF rendering + email delivery shouldn't add latency
  // to the checkout response, and createAndEmailReceipt already swallows
  // its own errors so a receipt hiccup can never surface here as a
  // (misleading) checkout failure.
  const receiptLineItems: ReceiptLineItem[] = [
    ...productItems.map((item) => ({
      label: item.product!.name,
      description: `Sold by: ${item.product!.shopkeeper.shopName}`,
      quantity: item.quantity,
      amount: Number(item.product!.discountPrice ?? item.product!.price) * item.quantity,
    })),
    ...serviceItems.map((item) => ({
      label: item.service!.title,
      description: `Provider: ${item.service!.provider.businessName || item.service!.provider.user.name}`,
      quantity: item.quantity,
      amount: Number(item.servicePackage?.price ?? item.service!.basePrice) * item.quantity,
    })),
    // Offer lines were missing here, so buying a provider's product produced
    // a receipt with no line items and a subtotal of zero against a non-zero
    // total — the customer was charged correctly and then emailed a receipt
    // that did not mention what they had bought.
    ...offerItems.map((item) => ({
      label: item.offer!.title,
      description: `Provider: ${item.offer!.provider.businessName || item.offer!.provider.user.name}`,
      quantity: item.quantity,
      amount: Number(item.offer!.price) * item.quantity,
    })),
  ]
  const receiptAdjustments: ReceiptAdjustment[] = []
  if (shippingTotal > 0) receiptAdjustments.push({ label: "Shipping", amount: shippingTotal })
  if (discountAmount > 0) receiptAdjustments.push({ label: "Discount", amount: -discountAmount })
  if (!direct) void createAndEmailReceipt({
    userId: customerId,
    type: "PAYMENT",
    paymentMethod: "Wallet",
    lineItems: receiptLineItems,
    subtotal: productsSubtotal + servicesSubtotal + offersSubtotal,
    adjustments: receiptAdjustments,
    totalAmount: grandTotal,
  })

  return { success: true, orderIds, jobIds, totalAmount: grandTotal, paymentMode: direct ? "DIRECT" : "WALLET" }
}
