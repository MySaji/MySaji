"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireVerified } from "@/lib/verification-gate"

async function requireProviderId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  return profile?.id ?? null
}

export type RentalBookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "PICKED_UP" | "RETURNED" | "CANCELLED"

// Listing creation/editing/publishing for RENT-actionType offers now lives
// entirely in lib/actions/offers.ts (saveOfferStep, publishOffer,
// getOfferDraft, getLiveOffers, getOfferDetail) via the same 10-step wizard
// every other offer type uses — see the Offer model's doc comment in
// schema.prisma for why RentalListing was retired in favor of folding
// rentals into the one universal Offer model. This file is now scoped to
// what's genuinely still rental-specific: the date-range RentalBooking
// transaction (reserve, pay, pick up, return, deposit refund) — a real,
// deliberately separate booking shape from Job (see RentalBooking's own
// doc comment).

export type ProviderRentalBookingItem = {
  id: string
  offerId: string
  customerId: string
  listingTitle: string
  customerName: string
  startDate: string
  endDate: string
  days: number
  totalAmount: number
  depositAmount: number
  currency: string
  status: RentalBookingStatus
  location: string
}

/** Everything a provider needs to actually run the pickup/return side of
 * the business — every non-cancelled, non-pending booking across all of
 * this provider's RENT-actionType offers, most recent first. */
export async function getMyRentalBookingsAsProvider(): Promise<ProviderRentalBookingItem[]> {
  const providerId = await requireProviderId()
  if (!providerId) return []

  const bookings = await db.rentalBooking.findMany({
    where: { providerId, status: { in: ["CONFIRMED", "PICKED_UP", "RETURNED"] } },
    include: { offer: true, customer: true },
    orderBy: { startDate: "desc" },
  })

  return bookings.map((b) => ({
    id: b.id,
    offerId: b.offerId,
    customerId: b.customerId,
    listingTitle: b.offer.title,
    customerName: b.customer.name,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate.toISOString(),
    days: b.days,
    totalAmount: Number(b.totalAmount),
    depositAmount: Number(b.depositAmount),
    currency: b.offer.currency,
    status: b.status,
    location: b.location,
  }))
}

export type RentalActionResult = { success: true } | { success: false; error: string }

const idSchema = z.object({ id: z.string().trim().min(1) })

export async function markRentalPickedUp(input: unknown): Promise<RentalActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const booking = await db.rentalBooking.findUnique({ where: { id: parsed.data.id } })
  if (!booking || booking.providerId !== providerId) return { success: false, error: "Booking not found." }
  if (booking.status !== "CONFIRMED") return { success: false, error: "This booking isn't ready for pickup." }

  await db.rentalBooking.update({ where: { id: booking.id }, data: { status: "PICKED_UP", pickedUpAt: new Date() } })
  return { success: true }
}

const returnSchema = z.object({
  id: z.string().trim().min(1),
  depositRefundAmount: z.coerce.number().min(0),
  depositRefundNote: z.string().trim().optional(),
})

/** Closes out the rental — no payment gateway here supports a real fund
 * "hold," so the deposit was collected upfront as part of the original
 * charge; whatever the provider decides to refund (full, partial, or none
 * for damage/loss) is credited straight to the customer's real Wallet, the
 * same honest mechanism every other real money movement in this app uses. */
export async function returnRentalBooking(input: unknown): Promise<RentalActionResult> {
  const providerId = await requireProviderId()
  if (!providerId) return { success: false, error: "You must be signed in as a provider." }

  const parsed = returnSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const booking = await db.rentalBooking.findUnique({ where: { id: parsed.data.id } })
  if (!booking || booking.providerId !== providerId) return { success: false, error: "Booking not found." }
  if (booking.status !== "PICKED_UP") return { success: false, error: "This booking hasn't been picked up yet." }

  const refund = Math.min(parsed.data.depositRefundAmount, Number(booking.depositAmount))

  await db.$transaction(async (tx) => {
    await tx.rentalBooking.update({
      where: { id: booking.id },
      data: { status: "RETURNED", returnedAt: new Date(), depositRefundAmount: refund, depositRefundNote: parsed.data.depositRefundNote ?? null },
    })

    if (refund > 0) {
      const wallet = await tx.wallet.upsert({
        where: { userId: booking.customerId },
        update: {},
        create: { userId: booking.customerId, balance: 0 },
      })
      const balanceBefore = Number(wallet.balance)
      const balanceAfter = balanceBefore + refund
      await tx.wallet.update({ where: { userId: booking.customerId }, data: { balance: balanceAfter } })
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount: refund,
          description: "Rental deposit refund",
          referenceType: "RENTAL",
          referenceId: booking.id,
          status: "COMPLETED",
          balanceBefore,
          balanceAfter,
        },
      })
    }
  })

  return { success: true }
}

const cancelBookingSchema = z.object({ id: z.string().trim().min(1), reason: z.string().trim().optional() })

/** Cancellable up to (but not including) pickup — since nothing physical
 * has happened yet, a CONFIRMED (already-paid) booking is refunded in full
 * to the customer's Wallet rather than the app trying to reverse an
 * M-Pesa/Stripe/PayPal charge directly. */
export async function cancelRentalBooking(input: unknown): Promise<RentalActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = cancelBookingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const booking = await db.rentalBooking.findUnique({ where: { id: parsed.data.id }, include: { provider: true } })
  if (!booking) return { success: false, error: "Booking not found." }
  const isCustomer = booking.customerId === session.user.id
  const isProvider = booking.provider.userId === session.user.id
  if (!isCustomer && !isProvider) return { success: false, error: "Booking not found." }
  if (booking.status !== "PENDING_PAYMENT" && booking.status !== "CONFIRMED") {
    return { success: false, error: "This booking can no longer be cancelled." }
  }

  await db.$transaction(async (tx) => {
    const wasPaid = booking.status === "CONFIRMED"
    await tx.rentalBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancellationReason: parsed.data.reason ?? null } })

    if (wasPaid) {
      const refund = Number(booking.totalAmount)
      const wallet = await tx.wallet.upsert({ where: { userId: booking.customerId }, update: {}, create: { userId: booking.customerId, balance: 0 } })
      const balanceBefore = Number(wallet.balance)
      const balanceAfter = balanceBefore + refund
      await tx.wallet.update({ where: { userId: booking.customerId }, data: { balance: balanceAfter } })
      await tx.transaction.create({
        data: {
          walletId: wallet.id, type: "CREDIT", amount: refund, description: "Rental booking cancelled, full refund",
          referenceType: "RENTAL", referenceId: booking.id, status: "COMPLETED", balanceBefore, balanceAfter,
        },
      })
    }
  })

  return { success: true }
}

// ============================= CUSTOMER-FACING =============================

/** RENT-actionType offer detail, in the same shape the rental detail/
 * booking page expects — a thin wrapper over getOfferDetail's underlying
 * Offer row rather than a duplicate read, since the listing itself is a
 * normal Offer now. Bumps the same real view counter getOfferDetail does. */
export type RentalOfferDetail = {
  offerId: string
  title: string
  description: string
  images: string[]
  providerId: string
  providerName: string
  providerAvatar: string | null
  providerRating: number
  providerReviewCount: number
  categoryName: string | null
  pricePerDay: number
  depositAmount: number
  currency: string
} | null

export async function getRentalOfferDetail(offerId: string): Promise<RentalOfferDetail> {
  const offer = await db.offer.findFirst({
    where: { id: offerId, status: "LIVE", actionType: "RENT" },
    include: { provider: { include: { user: true } }, category: true },
  })
  if (!offer) return null

  await db.offer.update({ where: { id: offerId }, data: { viewCount: { increment: 1 } } }).catch(() => {})

  return {
    offerId: offer.id,
    title: offer.title,
    description: offer.description,
    images: offer.images,
    providerId: offer.providerId,
    providerName: offer.provider.user.name,
    providerAvatar: offer.provider.user.image,
    providerRating: Number(offer.provider.rating),
    providerReviewCount: offer.provider.reviewCount,
    categoryName: offer.category?.name ?? null,
    pricePerDay: Number(offer.price ?? 0),
    depositAmount: Number(offer.depositAmount),
    currency: offer.currency,
  }
}

/** Start/end dates already booked (CONFIRMED or PICKED_UP) on this offer —
 * the customer-facing date picker disables these so a double-booking is
 * caught before checkout, not just at payment time. */
export async function getRentalBookedRanges(offerId: string): Promise<{ startDate: string; endDate: string }[]> {
  const bookings = await db.rentalBooking.findMany({
    where: { offerId, status: { in: ["CONFIRMED", "PICKED_UP"] } },
    select: { startDate: true, endDate: true },
  })
  return bookings.map((b) => ({ startDate: b.startDate.toISOString(), endDate: b.endDate.toISOString() }))
}

const createRentalBookingSchema = z.object({
  offerId: z.string().trim().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date"),
  location: z.string().trim().min(1, "Location is required"),
})

export type CreateRentalBookingResult = { success: true; bookingId: string; amount: number } | { success: false; error: string }

export async function createRentalBooking(input: unknown): Promise<CreateRentalBookingResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer to continue." }
  }

  // Progressive KYC: a rental puts a provider's physical equipment in the
  // customer's hands, so identity matters here at least as much as it
  // does for a service booking.
  const gate = await requireVerified("booking.create")
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = createRentalBookingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const offer = await db.offer.findFirst({ where: { id: parsed.data.offerId, status: "LIVE", actionType: "RENT" } })
  if (!offer || offer.price == null) return { success: false, error: "This rental listing is no longer available." }

  const start = new Date(`${parsed.data.startDate}T00:00:00`)
  const end = new Date(`${parsed.data.endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { success: false, error: "Pick a valid end date after the start date." }
  }
  if (start < new Date(new Date().toDateString())) {
    return { success: false, error: "Start date can't be in the past." }
  }

  const days = Math.round((end.getTime() - start.getTime()) / 86400000)

  // Re-check for a conflicting confirmed booking right before creating this
  // one — the date-picker's disabled ranges are a UX hint, this is the real
  // guard against a race between two customers booking the same window.
  const conflict = await db.rentalBooking.findFirst({
    where: {
      offerId: offer.id,
      status: { in: ["CONFIRMED", "PICKED_UP"] },
      startDate: { lt: end },
      endDate: { gt: start },
    },
  })
  if (conflict) return { success: false, error: "Those dates were just booked by someone else. Pick a different range." }

  const rentalFee = Number(offer.price) * days
  const depositAmount = Number(offer.depositAmount)
  const totalAmount = rentalFee + depositAmount

  const booking = await db.rentalBooking.create({
    data: {
      offerId: offer.id,
      customerId: session.user.id,
      providerId: offer.providerId,
      startDate: start,
      endDate: end,
      days,
      rentalFee,
      depositAmount,
      totalAmount,
      location: parsed.data.location,
      status: "PENDING_PAYMENT",
    },
  })

  await db.offer.update({ where: { id: offer.id }, data: { bookingCount: { increment: 1 } } })

  return { success: true, bookingId: booking.id, amount: totalAmount }
}

export type RentalBookingForPayment = {
  bookingId: string
  listingTitle: string
  startDate: string
  endDate: string
  days: number
  rentalFee: number
  depositAmount: number
  totalAmount: number
  currency: string
} | null

export async function getRentalBookingForPayment(bookingId: string): Promise<RentalBookingForPayment> {
  const session = await auth()
  if (!session?.user?.id) return null

  const booking = await db.rentalBooking.findUnique({ where: { id: bookingId }, include: { offer: true } })
  if (!booking || booking.customerId !== session.user.id) return null

  return {
    bookingId: booking.id,
    listingTitle: booking.offer.title,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate.toISOString(),
    days: booking.days,
    rentalFee: Number(booking.rentalFee),
    depositAmount: Number(booking.depositAmount),
    totalAmount: Number(booking.totalAmount),
    currency: booking.offer.currency,
  }
}

/** Called by /api/payments/initiate once a RENTAL-context payment
 * completes (simulated or real gateway confirmation). */
export async function confirmRentalBookingPayment(bookingId: string): Promise<void> {
  await db.rentalBooking.updateMany({ where: { id: bookingId, status: "PENDING_PAYMENT" }, data: { status: "CONFIRMED" } })
}

export type RentalBookingPaymentStatus = { status: "PENDING_PAYMENT" | "CONFIRMED"; paymentStatus: "PENDING" | "COMPLETED" | "FAILED"; failureReason?: string | null }

/** The frontend polls this after initiating an M-Pesa/Stripe rental
 * payment — mirrors checkWalletTopupStatus()/checkProSubscriptionPaymentStatus()
 * elsewhere in this app, actively reconciling with the gateway since this
 * environment has no public webhook URL to be called back on. */
export async function checkRentalBookingPaymentStatus(bookingId: string): Promise<RentalBookingPaymentStatus | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const booking = await db.rentalBooking.findUnique({ where: { id: bookingId } })
  if (!booking || booking.customerId !== session.user.id) return null

  const payment = await db.payment.findFirst({ where: { rentalBookingId: bookingId }, orderBy: { createdAt: "desc" } })

  if (payment?.status === "PENDING" && payment.externalRef) {
    const { queryMpesaPayment, retrieveStripeSessionStatus } = await import("@/lib/actions/payments")
    const ref = payment.externalRef
    if (ref.startsWith("ws_CO_")) {
      const result = await queryMpesaPayment(ref)
      if (result) {
        if (result.resultCode === 0) {
          await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
          await confirmRentalBookingPayment(bookingId)
        } else {
          await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: result.reason ?? null } })
        }
      }
    } else if (ref.startsWith("cs_")) {
      const stripeStatus = await retrieveStripeSessionStatus(ref)
      if (stripeStatus === "paid") {
        await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
        await confirmRentalBookingPayment(bookingId)
      }
    }
  }

  const freshBooking = await db.rentalBooking.findUnique({ where: { id: bookingId } })
  const freshPayment = await db.payment.findFirst({ where: { rentalBookingId: bookingId }, orderBy: { createdAt: "desc" } })

  return {
    status: freshBooking?.status === "CONFIRMED" || freshBooking?.status === "PICKED_UP" || freshBooking?.status === "RETURNED" ? "CONFIRMED" : "PENDING_PAYMENT",
    paymentStatus: (freshPayment?.status as RentalBookingPaymentStatus["paymentStatus"]) ?? "PENDING",
    failureReason: freshPayment?.failureReason ?? null,
  }
}

export type MyRentalBookingItem = {
  id: string
  listingTitle: string
  image: string | null
  providerName: string
  startDate: string
  endDate: string
  status: RentalBookingStatus
  totalAmount: number
  depositAmount: number
  depositRefundAmount: number | null
}

export async function getMyRentalBookingsAsCustomer(): Promise<MyRentalBookingItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const bookings = await db.rentalBooking.findMany({
    where: { customerId: session.user.id },
    include: { offer: true, provider: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  })

  return bookings.map((b) => ({
    id: b.id,
    listingTitle: b.offer.title,
    image: b.offer.images[0] ?? null,
    providerName: b.provider.user.name,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate.toISOString(),
    status: b.status,
    totalAmount: Number(b.totalAmount),
    depositAmount: Number(b.depositAmount),
    depositRefundAmount: b.depositRefundAmount != null ? Number(b.depositRefundAmount) : null,
  }))
}
