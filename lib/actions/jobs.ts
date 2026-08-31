"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { customerHasOpenDispute } from "@/lib/actions/account-status"
import { distanceKm } from "@/lib/google-maps"
import { resolveJobCancellation } from "@/lib/job-cancellation"
import { isWithinLateCancellationWindow } from "@/lib/cancellation-policy"
import { logJobEvent } from "@/lib/actions/job-events"
import { pushToUser } from "@/lib/actions/push"
import { notifyUser } from "@/lib/actions/notify"

const createBookingSchema = z.object({
  serviceId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  quantity: z.number().int().min(1).max(24),
  location: z.string().trim().min(1, "Location is required"),
  // Real coordinates from Google Places Autocomplete, when configured —
  // optional so the plain-text fallback keeps working either way.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().trim().optional(),
})

export type CreateBookingResult = { success: true; jobId: string; amount: number } | { success: false; error: string }

const REFERRAL_REWARD_AMOUNT = 500

/** Fires when a referred customer's first-ever *paid* Job is confirmed —
 * credits the referrer's real wallet and flips the Referral row to
 * REWARDED. Counts only jobs past PENDING_PAYMENT so an abandoned/unpaid
 * booking attempt can't burn the referral before a real one lands. */
export async function maybeRewardReferral(customerId: string) {
  const jobCount = await db.job.count({ where: { customerId, status: { not: "PENDING_PAYMENT" } } })
  if (jobCount !== 1) return

  const referral = await db.referral.findUnique({ where: { referredUserId: customerId } })
  if (!referral || referral.status !== "ACTIVATED") return

  const wallet = await db.wallet.findUnique({ where: { userId: referral.referrerId } })
  if (!wallet) return

  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore + REFERRAL_REWARD_AMOUNT

  await db.$transaction([
    db.referral.update({
      where: { id: referral.id },
      data: { status: "REWARDED", rewardAmount: REFERRAL_REWARD_AMOUNT, rewardGivenAt: new Date() },
    }),
    db.wallet.update({
      where: { userId: referral.referrerId },
      data: { balance: balanceAfter, totalEarned: { increment: REFERRAL_REWARD_AMOUNT } },
    }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount: REFERRAL_REWARD_AMOUNT,
        description: "Referral reward: your friend completed their first booking",
        referenceType: "REFERRAL",
        referenceId: referral.id,
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    }),
    db.notification.create({
      data: {
        userId: referral.referrerId,
        title: "Referral reward earned!",
        message: `KES ${REFERRAL_REWARD_AMOUNT} was added to your wallet for referring a friend.`,
        type: "PROMO",
        actionUrl: "/customer/referrals",
      },
    }),
  ])

  await pushToUser(referral.referrerId, {
    title: "Referral reward earned!",
    body: `KES ${REFERRAL_REWARD_AMOUNT} was added to your wallet for referring a friend.`,
    url: "/customer/referrals",
  }, "promo")
}

/** Creates a Job as PENDING_PAYMENT — the single real booking-creation path
 * for every customer-facing flow (Marketplace quick-book, Emergency, and
 * the dedicated wizard). The job isn't visible to the provider and doesn't
 * reward referrals until real payment actually clears via
 * `confirmJobPayment` — a customer abandoning payment leaves no side
 * effects behind. The frontend calls `/api/payments/initiate` with the
 * returned `jobId` next. */
export async function createBooking(input: unknown): Promise<CreateBookingResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer to book a service." }
  }

  if (await customerHasOpenDispute(session.user.id)) {
    return { success: false, error: "New bookings are restricted while you have an open dispute. Message admin support for help." }
  }

  const parsed = createBookingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const data = parsed.data

  const service = await db.service.findUnique({ where: { id: data.serviceId }, include: { provider: { include: { availability: true } } } })
  if (!service || !service.isActive || service.approvalStatus !== "APPROVED") {
    return { success: false, error: "This service is no longer available." }
  }
  if (service.provider?.availability?.isOnVacation) {
    return { success: false, error: "This provider is currently unavailable for new bookings." }
  }

  const isBlocked = await db.blockedClient.findUnique({
    where: { providerId_customerId: { providerId: service.providerId, customerId: session.user.id } },
  })
  if (isBlocked) return { success: false, error: "This provider isn't accepting bookings from you." }

  const scheduledDate = new Date(`${data.date}T${data.time}:00`)
  if (Number.isNaN(scheduledDate.getTime())) {
    return { success: false, error: "Invalid date or time." }
  }

  const amount = Number(service.basePrice) * data.quantity

  const job = await db.job.create({
    data: {
      customerId: session.user.id,
      providerId: service.providerId,
      serviceId: service.id,
      title: service.title,
      description: data.notes || service.description,
      price: amount,
      currency: service.currency,
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude,
      scheduledDate,
      status: "PENDING_PAYMENT",
    },
  })

  await db.service.update({ where: { id: service.id }, data: { totalBookings: { increment: 1 } } })

  await logJobEvent({
    jobId: job.id, type: "JOB_CREATED", actor: "CUSTOMER", actorUserId: session.user.id,
    description: `Customer requested "${service.title}"`,
  })

  return { success: true, jobId: job.id, amount }
}

const emergencyBookingSchema = z.object({
  categoryId: z.string().trim().min(1),
  price: z.number().positive(),
  description: z.string().trim().min(1, "Please describe the emergency"),
  location: z.string().trim().min(1, "Location is required"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

export type CreateEmergencyBookingResult =
  | { success: true; jobId: string; amount: number; assigned: boolean }
  | { success: false; error: string }

/** Attempts a real provider match (verified, active, in the requested
 * category, highest-rated first) instead of leaving the Job permanently
 * unassigned — matching itself doesn't require payment, only actually
 * *notifying* the matched provider and the customer does (fired from
 * `confirmJobPayment` once real payment clears, same PENDING_PAYMENT gate
 * every other booking flow now uses). */
export async function createEmergencyBooking(input: unknown): Promise<CreateEmergencyBookingResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "customer") {
    return { success: false, error: "You must be signed in as a customer to book emergency service." }
  }

  if (await customerHasOpenDispute(session.user.id)) {
    return { success: false, error: "New bookings are restricted while you have an open dispute. Message admin support for help." }
  }

  const parsed = emergencyBookingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { categoryId, price, description, location, latitude, longitude } = parsed.data

  const category = await db.category.findUnique({ where: { id: categoryId } })
  if (!category) return { success: false, error: "Invalid service category." }

  const matchedProvider = await db.providerProfile.findFirst({
    where: {
      categoryId: category.id,
      verified: true,
      user: { isActive: true },
      blockedClients: { none: { customerId: session.user.id } },
      OR: [{ availability: null }, { availability: { isOnVacation: false } }],
    },
    orderBy: [{ rating: "desc" }, { completedJobs: "desc" }],
  })

  const job = await db.job.create({
    data: {
      customerId: session.user.id,
      providerId: matchedProvider?.id,
      title: `Emergency: ${category.name}`,
      description,
      price,
      location,
      latitude,
      longitude,
      scheduledDate: new Date(),
      urgency: "URGENT",
      status: "PENDING_PAYMENT",
    },
  })

  await logJobEvent({
    jobId: job.id, type: "JOB_CREATED", actor: "CUSTOMER", actorUserId: session.user.id,
    description: `Customer requested emergency service: ${category.name}`,
  })

  return { success: true, jobId: job.id, amount: price, assigned: !!matchedProvider }
}

export type JobDetail = {
  id: string
  title: string
  status: string
  price: number
  currency: string
  location: string
  scheduledDate: string
  providerName: string
  providerAvatar: string | null
  providerRating: number
  providerReviewCount: number
  latitude: number | null
  longitude: number | null
  providerLatitude: number | null
  providerLongitude: number | null
  providerLocationUpdatedAt: string | null
  distanceKm: number | null
} | null

export async function getJobById(jobId: string): Promise<JobDetail> {
  const session = await auth()
  if (!session?.user?.id) return null

  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { provider: { include: { user: true } } },
  })
  if (!job || job.customerId !== session.user.id) return null

  const latitude = job.latitude != null ? Number(job.latitude) : null
  const longitude = job.longitude != null ? Number(job.longitude) : null
  const providerLatitude = job.providerLatitude != null ? Number(job.providerLatitude) : null
  const providerLongitude = job.providerLongitude != null ? Number(job.providerLongitude) : null

  return {
    id: job.id,
    title: job.title,
    status: job.status,
    price: Number(job.price),
    currency: job.currency,
    location: job.location,
    scheduledDate: job.scheduledDate.toISOString(),
    providerName: job.provider?.user.name ?? "Provider",
    providerAvatar: job.provider?.user.image ?? null,
    providerRating: job.provider ? Number(job.provider.rating) : 0,
    providerReviewCount: job.provider?.reviewCount ?? 0,
    latitude,
    longitude,
    providerLatitude,
    providerLongitude,
    providerLocationUpdatedAt: job.providerLocationUpdatedAt?.toISOString() ?? null,
    distanceKm: latitude != null && longitude != null && providerLatitude != null && providerLongitude != null
      ? distanceKm(providerLatitude, providerLongitude, latitude, longitude)
      : null,
  }
}

export type CustomerJob = {
  id: string
  title: string
  description: string
  status: string
  price: number
  location: string
  scheduledDate: string
  image: string | null
  providerId: string | null
  providerUserId: string | null
  providerName: string
  providerPhone: string | null
  providerAvatar: string | null
  providerRating: number
  reviewed: boolean
  myRating: number | null
  latitude: number | null
  longitude: number | null
  providerLatitude: number | null
  providerLongitude: number | null
  providerLocationUpdatedAt: string | null
  distanceKm: number | null
}

export async function getCustomerJobs(): Promise<CustomerJob[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const jobs = await db.job.findMany({
    where: { customerId: session.user.id },
    orderBy: { scheduledDate: "desc" },
    include: {
      provider: { include: { user: true } },
      service: true,
      review: true,
    },
  })

  return jobs.map((job) => {
    const latitude = job.latitude != null ? Number(job.latitude) : null
    const longitude = job.longitude != null ? Number(job.longitude) : null
    const providerLatitude = job.providerLatitude != null ? Number(job.providerLatitude) : null
    const providerLongitude = job.providerLongitude != null ? Number(job.providerLongitude) : null

    return {
      id: job.id,
      title: job.title,
      description: job.description,
      status: job.status,
      price: Number(job.price),
      location: job.location,
      scheduledDate: job.scheduledDate.toISOString(),
      image: job.service?.images[0] ?? null,
      providerId: job.providerId,
      providerUserId: job.provider?.user.id ?? null,
      providerName: job.provider?.user.name ?? "Provider",
      // Real phone numbers never leave the server to another user — Call
      // and Message both go through the in-app conversation/voice-call
      // system (providerUserId above), never a raw tel: link. See
      // lib/contact-info-filter.ts for the matching guard on chat text.
      providerPhone: null,
      providerAvatar: job.provider?.user.image ?? null,
      providerRating: job.provider ? Number(job.provider.rating) : 0,
      reviewed: job.review != null,
      myRating: job.review?.rating ?? null,
      latitude,
      longitude,
      providerLatitude,
      providerLongitude,
      providerLocationUpdatedAt: job.providerLocationUpdatedAt?.toISOString() ?? null,
      distanceKm: latitude != null && longitude != null && providerLatitude != null && providerLongitude != null
        ? distanceKm(providerLatitude, providerLongitude, latitude, longitude)
        : null,
    }
  })
}

export type ActiveEscrowJob = {
  jobId: string
  title: string
  providerName: string
  providerAvatar: string | null
  categoryName: string | null
  amount: number
  status: "ACCEPTED" | "IN_PROGRESS"
}

/** Real held-funds jobs — an ACCEPTED/IN_PROGRESS job with a COMPLETED
 * Payment means the customer's money genuinely is sitting in escrow right
 * now. Deliberately no progress percentage: this schema has no
 * milestone/percentage field on Job, so a "60% done" bar would be
 * invented rather than derived from anything real. */
export async function getActiveEscrowJobs(): Promise<ActiveEscrowJob[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const jobs = await db.job.findMany({
    where: {
      customerId: session.user.id,
      status: { in: ["ACCEPTED", "IN_PROGRESS"] },
      payments: { some: { status: "COMPLETED" } },
    },
    orderBy: { scheduledDate: "desc" },
    include: {
      provider: { include: { user: true, category: true } },
      payments: { where: { status: "COMPLETED" } },
    },
  })

  return jobs.map((job) => ({
    jobId: job.id,
    title: job.title,
    providerName: job.provider?.user.name ?? "Provider",
    providerAvatar: job.provider?.user.image ?? null,
    categoryName: job.provider?.category?.name ?? null,
    amount: job.payments.reduce((sum, p) => sum + Number(p.amount), 0),
    status: job.status as "ACCEPTED" | "IN_PROGRESS",
  }))
}

export type JobActionResult = { success: true } | { success: false; error: string }

const cancelJobSchema = z.object({ jobId: z.string().trim().min(1) })

const CUSTOMER_CANCELLABLE_STATUSES = ["PENDING", "ACCEPTED"] as const

/**
 * Self-service cancellation — only while the provider hasn't started work
 * yet (PENDING/ACCEPTED). Runs the Gap 6 dispatch-fee policy engine: a
 * full refund if it's still >=2h before the scheduled time, otherwise a
 * fixed dispatch fee is carved out and paid to the provider. Once a job is
 * IN_PROGRESS, this intentionally stops being self-service — that's what
 * the dispute flow is for.
 */
export async function cancelMyJob(input: unknown): Promise<JobActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = cancelJobSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.customerId !== session.user.id) return { success: false, error: "Booking not found." }
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(job.status as (typeof CUSTOMER_CANCELLABLE_STATUSES)[number])) {
    return { success: false, error: "This booking can no longer be cancelled. Please use the dispute option instead." }
  }

  const reason = isWithinLateCancellationWindow(job.scheduledDate) ? "LATE_CANCELLATION" : "EARLY_CANCELLATION"
  const result = await resolveJobCancellation(job.id, { reason })
  if (!result.success) return result

  const customerCancelMessage = result.feeAmount > 0
    ? `Your booking "${result.jobTitle}" was cancelled within 2 hours of the scheduled time, so a KES ${result.feeAmount.toLocaleString()} dispatch fee applies. KES ${result.refundAmount.toLocaleString()} has been refunded to your wallet.`
    : result.refundAmount > 0
      ? `Your booking "${result.jobTitle}" was cancelled and KES ${result.refundAmount.toLocaleString()} has been refunded to your wallet.`
      : `Your booking "${result.jobTitle}" was cancelled.`
  await notifyUser({
    userId: result.customerId,
    title: "Booking cancelled",
    message: customerCancelMessage,
    type: "PAYMENT",
    relatedType: "JOB",
    relatedId: job.id,
    actionUrl: "/customer/jobs",
  })

  if (result.providerUserId) {
    const providerCancelMessage = result.feeAmount > 0
      ? `The customer cancelled "${result.jobTitle}" within 2 hours of the scheduled time. You've been paid a KES ${result.feeAmount.toLocaleString()} dispatch fee.`
      : `The customer cancelled the booking "${result.jobTitle}".`
    await notifyUser({
      userId: result.providerUserId,
      title: "Booking cancelled",
      message: providerCancelMessage,
      type: "JOB",
      relatedType: "JOB",
      relatedId: job.id,
    })
  }

  return { success: true }
}

const submitJobReviewSchema = z.object({
  jobId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  // Comment is optional in the UI ("Additional comments (optional)") — the
  // star rating alone is a complete, real review.
  comment: z.string().trim().max(1000).optional().default(""),
})

export type SubmitJobReviewResult = { success: true } | { success: false; error: string }

/** Real review persistence for a completed job — mirrors submitProductReview
 * in lib/actions/products.ts exactly: write the Review row, then recompute
 * the provider's real rating/reviewCount from all their real reviews. This
 * is what makes provider ratings shown everywhere (Find Specialists,
 * service listings, the booking modal) reflect actual customer feedback
 * instead of staying frozen at whatever was seeded. */
export async function submitJobReview(input: unknown): Promise<SubmitJobReviewResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = submitJobReviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { jobId, rating, comment } = parsed.data

  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.customerId !== session.user.id) return { success: false, error: "Job not found." }
  if (job.status !== "COMPLETED") return { success: false, error: "You can only review a completed job." }

  const existing = await db.review.findUnique({ where: { jobId } })
  if (existing) return { success: false, error: "You've already reviewed this job." }

  await db.$transaction(async (tx) => {
    await tx.review.create({
      data: {
        customerId: session.user!.id,
        jobId,
        serviceId: job.serviceId,
        providerId: job.providerId,
        rating,
        comment,
      },
    })

    if (job.providerId) {
      const agg = await tx.review.aggregate({ where: { providerId: job.providerId }, _avg: { rating: true }, _count: true })
      await tx.providerProfile.update({
        where: { id: job.providerId },
        data: { rating: agg._avg.rating ?? rating, reviewCount: agg._count },
      })
    }

    if (job.serviceId) {
      const serviceAgg = await tx.review.aggregate({ where: { serviceId: job.serviceId }, _avg: { rating: true }, _count: true })
      await tx.service.update({
        where: { id: job.serviceId },
        data: { rating: serviceAgg._avg.rating ?? rating, reviewCount: serviceAgg._count },
      })
    }
  })

  await logJobEvent({
    jobId, type: "REVIEW_SUBMITTED", actor: "CUSTOMER", actorUserId: session.user.id,
    description: `Customer left a ${rating}-star review`, metadata: { rating },
  })

  return { success: true }
}
