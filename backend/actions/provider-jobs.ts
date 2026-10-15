"use server"

import { z } from "zod"
import { awardLoyaltyPoints } from "@/backend/services/settlement-core"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { requireVerified } from "@/backend/services/verification-gate"
import { pushToUser } from "@/backend/services/push-core"
import { notifyUser } from "@/backend/services/notifications-core"
import { maybeRewardReferralForProvider } from "@/backend/services/provider-referral-core"
import { providerHasOpenDispute } from "@/backend/actions/account-status"
import { getEffectivePlatformPreferences } from "@/backend/actions/admin-settings"
import { getEffectiveCommissionRate, splitByCommission } from "@/backend/services/commission"
import {
  debtStateOf, chargeCommissionDebt, reverseCommissionDebt, jobIsProviderPaid,
} from "@/backend/services/commission-debt"

import { canAcceptAnotherJob, BUSINESS_STAFF_MAX_CONCURRENT_JOBS } from "@/backend/services/job-limits"
import { resolveJobCancellation } from "@/backend/services/job-cancellation"
import { logJobEvent } from "@/backend/services/job-events-core"
import { checkProviderLicenseForJob } from "@/backend/actions/provider-licensing"
import { requireVerifiedIdentityForJob } from "@/backend/actions/identity-verification"

// Address privacy for a not-yet-accepted job: freeform addresses in this
// app are typically "specific spot, area, city" — keeping only the last
// couple of comma-separated segments hides the exact house/street while
// still telling the provider roughly where the job is, enough to decide
// whether to accept. A single-segment address (no comma) is left as-is
// rather than guessing at a mangled truncation.
function coarsenLocation(location: string): string {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean)
  if (parts.length <= 1) return location
  return parts.slice(-2).join(", ")
}

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type ProviderJobItem = {
  id: string
  title: string
  description: string
  customerId: string
  clientName: string
  clientAvatar: string | null
  clientPhone: string | null
  location: string
  latitude: number | null
  longitude: number | null
  scheduledDate: string
  price: number
  currency: string
  status: string
  urgency: string
  rating: number | null
  reviewComment: string | null
}

export async function getProviderJobs(): Promise<ProviderJobItem[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const jobs = await db.job.findMany({
    // Jobs awaiting payment shouldn't be visible to the provider yet — they
    // aren't real bookings until the customer's payment actually clears.
    where: { providerId: provider.providerId, status: { not: "PENDING_PAYMENT" } },
    orderBy: { scheduledDate: "desc" },
    include: { customer: true, review: true },
  })

  return jobs.map((j) => {
    // Address & Phone Privacy: a still-PENDING job hasn't been accepted yet
    // — the provider knows enough to decide (title, price, coarse area,
    // schedule) but not the customer's real phone number or exact
    // address/GPS pin, same "enough to decide, not enough to contact
    // directly" convention ride-hailing apps use pre-accept. Both unlock
    // the moment the provider actually accepts.
    const isPending = j.status === "PENDING"
    return {
    id: j.id,
    title: j.title,
    description: j.description,
    customerId: j.customerId,
    clientName: j.customer.name,
    clientAvatar: j.customer.image,
    // Real phone numbers never leave the server to another user — Call and
    // Message both go through the in-app conversation/voice-call system
    // (customerId above), never a raw tel: link.
    clientPhone: null,
    location: isPending ? coarsenLocation(j.location) : j.location,
    latitude: isPending ? null : (j.latitude != null ? Number(j.latitude) : null),
    longitude: isPending ? null : (j.longitude != null ? Number(j.longitude) : null),
    scheduledDate: j.scheduledDate.toISOString(),
    price: Number(j.price),
    currency: j.currency,
    status: j.status,
    urgency: j.urgency,
    rating: j.review?.rating ?? null,
    reviewComment: j.review?.comment ?? null,
    }
  })
}

export type ProviderJobActionResult = { success: true } | { success: false; error: string }

const jobIdSchema = z.object({ jobId: z.string().trim().min(1) })

export async function acceptJob(input: unknown): Promise<ProviderJobActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  // Progressive KYC: accepting puts this provider in a customer's home or
  // hands, against escrowed money. declineJob below stays ungated — a
  // provider must always be able to release a job they cannot take.
  const gate = await requireVerified("job.accept")
  if (!gate.ok) return { success: false, error: gate.error }

  if (await providerHasOpenDispute(provider.providerId)) {
    return { success: false, error: "Accepting new jobs is restricted while you have an open dispute. Message admin support for help." }
  }

  const parsed = jobIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }
  if (job.status !== "PENDING") return { success: false, error: "This job is no longer pending." }

  const licenseCheck = await checkProviderLicenseForJob(job.id, provider.providerId)
  if (licenseCheck.blocked) return { success: false, error: licenseCheck.reason }

  if (!(await canAcceptAnotherJob(db, provider.providerId))) {
    return { success: false, error: `You already have ${BUSINESS_STAFF_MAX_CONCURRENT_JOBS} active jobs. Complete one before accepting another.` }
  }

  // Commission owed on work already taken. Checked here rather than at
  // completion because this is the moment that costs somebody something: a
  // provider who cannot settle up should not be taking a customer's booking
  // off the market. Jobs already in hand are untouched, so nobody is left
  // waiting on a provider who has just been cut off mid-job.
  const debt = await debtStateOf(provider.userId)
  if (!debt.canAcceptWork) {
    return {
      success: false,
      error: "You owe KSh " + debt.owed.toLocaleString("en-KE") + " in commission, which is the limit of KSh " +
        debt.cap.toLocaleString("en-KE") + ". Settle it from Earnings to start accepting work again.",
    }
  }

  await db.$transaction([
    db.job.update({ where: { id: job.id }, data: { status: "ACCEPTED" } }),
    db.notification.create({
      data: {
        userId: job.customerId,
        title: "Booking accepted",
        message: `Your booking for ${job.title} has been accepted by the provider.`,
        type: "JOB",
        relatedType: "JOB",
        relatedId: job.id,
        actionUrl: "/customer/jobs",
      },
    }),
  ])

  // Where the customer pays the provider directly, the platform's cut is
  // charged now, against this provider. Deliberately after the job is
  // accepted and outside that transaction: a commission row that failed to
  // write must not undo an acceptance the customer has already been told
  // about. It is idempotent per job, so a sweep can pick up anything missed.
  if (await jobIsProviderPaid(job.id)) {
    await chargeCommissionDebt({
      jobId: job.id,
      providerUserId: provider.userId,
      providerProfileId: provider.providerId,
    })
  }

  await pushToUser(job.customerId, { title: "Booking accepted", body: `Your booking for ${job.title} has been accepted by the provider.`, url: "/customer/jobs" }, "job")

  await logJobEvent({ jobId: job.id, type: "JOB_ACCEPTED", actor: "PROVIDER", actorUserId: provider.userId, description: "Provider accepted the booking" })

  return { success: true }
}

export async function declineJob(input: unknown): Promise<ProviderJobActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = jobIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }
  if (job.status !== "PENDING") return { success: false, error: "This job is no longer pending." }

  // A job never accepted was never charged, but reversing is free and
  // idempotent, and it closes the case where a provider accepts, the
  // customer reverts it to pending, and it is then declined.
  await reverseCommissionDebt(job.id)

  await db.$transaction([
    db.job.update({ where: { id: job.id }, data: { status: "CANCELLED" } }),
    db.notification.create({
      data: {
        userId: job.customerId,
        title: "Booking declined",
        message: `Your booking for ${job.title} was declined by the provider.`,
        type: "JOB",
        relatedType: "JOB",
        relatedId: job.id,
        actionUrl: "/customer/jobs",
      },
    }),
  ])

  await pushToUser(job.customerId, { title: "Booking declined", body: `Your booking for ${job.title} was declined by the provider.`, url: "/customer/jobs" }, "job")

  await logJobEvent({ jobId: job.id, type: "JOB_DECLINED", actor: "PROVIDER", actorUserId: provider.userId, description: "Provider declined the booking" })

  return { success: true }
}

/**
 * Gap 6 — the provider's "customer wasn't there" report. Only allowed
 * from ACCEPTED (once IN_PROGRESS, work has started — that's a dispute,
 * not a no-show) and only at or after the scheduled time, so it can't be
 * used to preempt a booking early. Runs the same dispatch-fee policy
 * engine as a late customer cancellation.
 */
export async function reportNoShow(input: unknown): Promise<ProviderJobActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = jobIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }
  if (job.status !== "ACCEPTED") return { success: false, error: "This job can't be reported as a no-show." }
  if (job.scheduledDate.getTime() > Date.now()) {
    return { success: false, error: "You can only report a no-show at or after the scheduled time." }
  }

  const result = await resolveJobCancellation(job.id, { reason: "NO_SHOW" })
  if (!result.success) return result

  const noShowMessage = result.feeAmount > 0
    ? `Your provider reported you as a no-show for "${result.jobTitle}". A KES ${result.feeAmount.toLocaleString()} dispatch fee applies. KES ${result.refundAmount.toLocaleString()} has been refunded to your wallet.`
    : `Your provider reported you as a no-show for "${result.jobTitle}".`
  await notifyUser({
    userId: result.customerId,
    title: "Marked as no-show",
    message: noShowMessage,
    type: "JOB",
    relatedType: "JOB",
    relatedId: job.id,
    actionUrl: "/customer/jobs",
  })

  await logJobEvent({
    jobId: job.id, type: "NO_SHOW_REPORTED", actor: "PROVIDER", actorUserId: provider.userId,
    description: result.feeAmount > 0 ? `Provider reported a no-show, KES ${result.feeAmount.toLocaleString()} dispatch fee applied` : "Provider reported a no-show",
  })

  return { success: true }
}

export async function startJob(input: unknown): Promise<ProviderJobActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = jobIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }
  if (job.status !== "ACCEPTED") return { success: false, error: "This job hasn't been accepted yet." }

  const identityCheck = await requireVerifiedIdentityForJob(job.id)
  if (!identityCheck.ok) return { success: false, error: identityCheck.reason }

  await db.job.update({ where: { id: job.id }, data: { status: "IN_PROGRESS" } })
  await logJobEvent({ jobId: job.id, type: "WORK_STARTED", actor: "PROVIDER", actorUserId: provider.userId, description: "Provider started work" })
  return { success: true }
}

export async function completeJob(input: unknown): Promise<ProviderJobActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = jobIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }
  if (job.status !== "ACCEPTED" && job.status !== "IN_PROGRESS") {
    return { success: false, error: "This job can't be marked complete yet." }
  }

  // Paid directly by the customer? Then there is nothing here to pay out:
  // the provider already has the money in their hand, and the platform's
  // share was charged to them when they accepted. Crediting the wallet as
  // well would hand them the fare twice.
  const providerPaidDirectly = await jobIsProviderPaid(job.id)
  if (providerPaidDirectly) {
    // Named in the message below. One cheap read on a path that already does
    // several, and "pay Mwangi 2,500" is an instruction where "pay your
    // provider" is a reminder.
    const me = await db.user.findUnique({
      where: { id: provider.userId },
      select: { name: true },
    })
    await db.$transaction([
      db.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
      db.providerProfile.update({ where: { id: provider.providerId }, data: { completedJobs: { increment: 1 } } }),
      db.notification.create({
        data: {
          userId: job.customerId,
          title: "Work finished",
          // The customer still owes the money at this point: that is the
          // whole shape of direct payment, and a message that only asks for
          // a review leaves the one outstanding action unsaid. The amount is
          // named because "pay the provider" without a figure is not an
          // instruction anybody can act on.
          message:
            `${job.title} has been marked complete. Pay ` +
            `${me?.name ?? "your provider"} ` +
            `${job.currency ?? "KES"} ${Number(job.price ?? 0).toLocaleString("en-KE")} ` +
            "directly, then leave them a review.",
          type: "JOB",
          relatedType: "JOB",
          relatedId: job.id,
          actionUrl: "/customer/jobs",
        },
      }),
    ])

    // The commission is charged on acceptance, but a job that reached
    // completion without one (accepted before this was switched on, or a
    // write that failed) is charged now rather than slipping through.
    await chargeCommissionDebt({
      jobId: job.id,
      providerUserId: provider.userId,
      providerProfileId: provider.providerId,
    })

    await pushToUser(job.customerId, { title: "Job completed", body: `${job.title} has been marked complete. Please leave a review!`, url: "/customer/jobs" }, "job")
    await logJobEvent({ jobId: job.id, type: "JOB_COMPLETED", actor: "PROVIDER", actorUserId: provider.userId, description: "Provider marked the job complete" })
    return { success: true }
  }

  const wallet = await db.wallet.findUnique({ where: { userId: provider.userId } })
  if (!wallet) return { success: false, error: "Wallet not found." }

  const providerProfile = await db.providerProfile.findUnique({ where: { id: provider.providerId }, select: { completedJobs: true } })
  const rate = await getEffectiveCommissionRate("PROVIDER", providerProfile?.completedJobs ?? 0)
  const grossAmount = Number(job.price)
  const { commissionAmount, payoutAmount } = splitByCommission(grossAmount, rate)

  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore + payoutAmount

  await db.$transaction([
    db.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    db.providerProfile.update({ where: { id: provider.providerId }, data: { completedJobs: { increment: 1 } } }),
    db.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter, totalEarned: { increment: payoutAmount } } }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount: payoutAmount,
        description: `Payment for ${job.title}`,
        referenceType: "JOB",
        referenceId: job.id,
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    }),
    db.platformRevenue.create({
      data: {
        role: "PROVIDER",
        sourceType: "JOB",
        sourceId: job.id,
        userId: provider.userId,
        grossAmount,
        rate,
        commissionAmount,
        payoutAmount,
      },
    }),
    db.notification.create({
      data: {
        userId: job.customerId,
        title: "Job completed",
        message: `${job.title} has been marked complete. Please leave a review!`,
        type: "JOB",
        relatedType: "JOB",
        relatedId: job.id,
        actionUrl: "/customer/jobs",
      },
    }),
  ])

  await pushToUser(job.customerId, { title: "Job completed", body: `${job.title} has been marked complete. Please leave a review!`, url: "/customer/jobs" }, "job")

  await maybeRewardReferralForProvider(provider.userId)
  await awardLoyaltyPoints(job.customerId, Number(job.price), { referenceType: "JOB", referenceId: job.id })

  await logJobEvent({
    jobId: job.id, type: "WORK_COMPLETED", actor: "PROVIDER", actorUserId: provider.userId,
    description: "Provider marked work completed", metadata: { payoutAmount, commissionAmount },
  })

  return { success: true }
}

const fileDisputeSchema = z.object({ jobId: z.string().trim().min(1), reason: z.string().trim().min(1, "Please describe the issue") })

export async function fileProviderDispute(input: unknown): Promise<ProviderJobActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const { enableDisputeResolution } = await getEffectivePlatformPreferences()
  if (!enableDisputeResolution) {
    return { success: false, error: "Dispute reporting is currently unavailable. Please contact support directly." }
  }

  const parsed = fileDisputeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }

  const disputeNumber = `DSP-${Date.now().toString(36).toUpperCase()}`

  await db.$transaction([
    db.dispute.create({
      data: {
        disputeNumber,
        jobId: job.id,
        customerId: job.customerId,
        providerId: provider.providerId,
        reason: "Reported by provider",
        description: parsed.data.reason,
      },
    }),
    db.job.update({ where: { id: job.id }, data: { status: "DISPUTED" } }),
  ])

  await logJobEvent({
    jobId: job.id, type: "DISPUTE_FILED", actor: "PROVIDER", actorUserId: provider.userId,
    description: `Provider filed a dispute: ${parsed.data.reason}`,
  })

  return { success: true }
}

const updateLocationSchema = z.object({
  jobId: z.string().trim().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

/** Real last-known-position write, called periodically by the provider's own
 * browser (navigator.geolocation) while a job is ACCEPTED/IN_PROGRESS — no
 * history table, just the latest fix, which is all the customer's live
 * tracking view needs. */
export async function updateJobProviderLocation(input: unknown): Promise<ProviderJobActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = updateLocationSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } })
  if (!job || job.providerId !== provider.providerId) return { success: false, error: "Job not found." }
  if (job.status !== "ACCEPTED" && job.status !== "IN_PROGRESS") {
    return { success: false, error: "Location sharing is only available for active jobs." }
  }

  await db.job.update({
    where: { id: job.id },
    data: {
      providerLatitude: parsed.data.latitude,
      providerLongitude: parsed.data.longitude,
      providerLocationUpdatedAt: new Date(),
    },
  })
  return { success: true }
}

export type ProviderJobStats = {
  activeCount: number
  pendingCount: number
  completedCount: number
  disputedCount: number
  totalEarned: number
}

export async function getProviderJobStats(): Promise<ProviderJobStats> {
  const provider = await requireProvider()
  if (!provider) return { activeCount: 0, pendingCount: 0, completedCount: 0, disputedCount: 0, totalEarned: 0 }

  const [activeCount, pendingCount, completedCount, disputedCount, earnedAgg] = await Promise.all([
    db.job.count({ where: { providerId: provider.providerId, status: { in: ["ACCEPTED", "IN_PROGRESS"] } } }),
    db.job.count({ where: { providerId: provider.providerId, status: "PENDING" } }),
    db.job.count({ where: { providerId: provider.providerId, status: "COMPLETED" } }),
    db.job.count({ where: { providerId: provider.providerId, status: "DISPUTED" } }),
    db.job.aggregate({ where: { providerId: provider.providerId, status: "COMPLETED" }, _sum: { price: true } }),
  ])

  return {
    activeCount,
    pendingCount,
    completedCount,
    disputedCount,
    totalEarned: Number(earnedAgg._sum.price ?? 0),
  }
}
