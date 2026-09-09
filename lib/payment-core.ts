import { db } from "@/lib/db"
import { logJobEvent } from "@/lib/actions/job-events"
import { maybeRewardReferral } from "@/lib/actions/jobs"
import { pushToUser } from "@/lib/actions/push"
import { notifyUser } from "@/lib/actions/notify"
import { canAcceptAnotherJob } from "@/lib/job-limits"
import { createAndEmailReceipt } from "@/lib/actions/receipts"

/**
 * Job-payment settlement, deliberately NOT a server action.
 *
 * These used to be exported from lib/actions/payments.ts, which carries
 * "use server" — and every export of such a file is a callable HTTP endpoint,
 * whether or not any client imports it. confirmJobPayment takes a job id and
 * advances the job out of PENDING_PAYMENT; as an endpoint that is "mark this
 * job paid" available to anyone who can name a job.
 *
 * None of it was ever meant to be reachable from a browser: the callers are
 * the payments API route (after a gateway confirms), the admin reconciliation
 * screen, and payment webhooks. Moving them into a plain module removes the
 * endpoints rather than guarding them — the same shape as
 * lib/kyc-review-core.ts and lib/wallet-core.ts.
 *
 * Re-exporting any of this from a "use server" file would recreate exactly the
 * endpoint this removes.
 */

/** The single place a Job actually becomes real to its provider: every
 * booking flow (Marketplace quick-book, Emergency, the dedicated wizard)
 * now creates the Job as PENDING_PAYMENT first, so this is where the
 * "provider gets notified" / "referral counts" / "status goes live"
 * side effects all actually happen — once, consistently, only once real
 * payment has cleared. */
export async function confirmJobPayment(jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.status !== "PENDING_PAYMENT") return

  const isEmergency = job.urgency === "URGENT"

  // Gap 4: a business staff member already at their concurrent-job cap
  // never lands straight on ACCEPTED — applies even to emergencies,
  // since force-stacking more work onto an already-slammed tech doesn't
  // actually serve the customer either.
  const canAccept = job.providerId ? await canAcceptAnotherJob(db, job.providerId) : false

  // A job that came from the request board needs no second acceptance. The
  // provider read the request, chose to bid on it and named a price; the
  // customer picked that bid and scheduled it. Routing it through PENDING
  // asked the provider to approve work they had already offered to do, and
  // left it sitting in "Awaiting approval" instead of Active Jobs — which is
  // where the customer was told it had gone. requestId is set only by
  // acceptRequestResponse, so this cannot catch an ordinary booking.
  const fromAcceptedBid = job.requestId != null

  let newStatus: "ACCEPTED" | "PENDING"
  if (fromAcceptedBid) {
    // Still subject to the concurrent-job cap, same as every other branch —
    // stacking work onto an already-full provider serves nobody.
    newStatus = job.providerId && canAccept ? "ACCEPTED" : "PENDING"
  } else if (isEmergency) {
    // Emergency dispatch always accepts a real match immediately, regardless
    // of that provider's ordinary autoAccept preference — urgency shouldn't
    // be gated behind a setting meant for routine bookings.
    newStatus = job.providerId && canAccept ? "ACCEPTED" : "PENDING"
  } else {
    const availability = job.providerId
      ? await db.providerAvailability.findUnique({ where: { providerId: job.providerId } }).catch(() => null)
      : null
    newStatus = (availability?.autoAccept ?? false) && canAccept ? "ACCEPTED" : "PENDING"
  }

  await db.job.update({ where: { id: job.id }, data: { status: newStatus } }).catch(() => {})

  // The real stock decrement for a BUY-offer purchase — deliberately here,
  // not at createOfferBooking() (lib/actions/offers.ts), so an abandoned/
  // unpaid PENDING_PAYMENT job never holds stock hostage. Guarded with a
  // conditional updateMany (stockQuantity >= job.quantity in the WHERE)
  // instead of a plain update so two concurrent payment confirmations for
  // the same low-stock offer can't both succeed and oversell it; the loser
  // simply leaves stock unchanged rather than going negative.
  if (job.offerId) {
    const offer = await db.offer.findUnique({ where: { id: job.offerId }, select: { actionType: true, stockQuantity: true } }).catch(() => null)
    if (offer?.actionType === "BUY" && offer.stockQuantity != null) {
      await db.offer.updateMany({
        where: { id: job.offerId, stockQuantity: { gte: job.quantity } },
        data: { stockQuantity: { decrement: job.quantity } },
      }).catch(() => {})
    }
  }

  if (isEmergency) {
    if (job.providerId) {
      const provider = await db.providerProfile.findUnique({ where: { id: job.providerId }, include: { user: true } }).catch(() => null)
      if (provider) {
        await db.notification.create({
          data: {
            userId: provider.userId,
            title: "Urgent job request",
            message: `${job.title} needs immediate attention.`,
            type: "JOB",
            relatedType: "JOB",
            relatedId: job.id,
            actionUrl: "/provider/jobs",
          },
        }).catch(() => {})
        await pushToUser(provider.userId, {
          title: "Urgent job request",
          body: `${job.title} needs immediate attention.`,
          url: "/provider/jobs",
        }, "job")
      }
      {
        const dispatchedMessage = `${provider?.user.name ?? "A provider"} has been notified and will contact you shortly.`
        await db.notification.create({
          data: {
            userId: job.customerId,
            title: "Emergency request dispatched",
            message: dispatchedMessage,
            type: "JOB",
            relatedType: "JOB",
            relatedId: job.id,
            actionUrl: "/customer/jobs",
          },
        }).catch(() => {})
        await pushToUser(job.customerId, { title: "Emergency request dispatched", body: dispatchedMessage, url: "/customer/jobs" }, "job")
      }
    } else {
      await db.notification.create({
        data: {
          userId: job.customerId,
          title: "Emergency request submitted",
          message: "Your payment was received. We'll notify you as soon as a provider accepts.",
          type: "JOB",
          relatedType: "JOB",
          relatedId: job.id,
          actionUrl: "/customer/jobs",
        },
      }).catch(() => {})
      await pushToUser(job.customerId, { title: "Emergency request submitted", body: "Your payment was received. We'll notify you as soon as a provider accepts.", url: "/customer/jobs" }, "job")
    }
  } else {
    await db.notification.create({
      data: {
        userId: job.customerId,
        title: "Payment received",
        message: "Your payment was successful and your booking is confirmed.",
        type: "PAYMENT",
        relatedType: "JOB",
        relatedId: job.id,
        actionUrl: "/customer/jobs",
      },
    }).catch(() => {})
    await pushToUser(job.customerId, { title: "Payment received", body: "Your payment was successful and your booking is confirmed.", url: "/customer/jobs" }, "payment")

    // Previously the assigned provider was never told a paid booking existed
    // at all — bell notification or push — until they happened to open the
    // app and check their job list themselves.
    if (job.providerId) {
      const provider = await db.providerProfile.findUnique({ where: { id: job.providerId }, include: { user: true } }).catch(() => null)
      if (provider) {
        const isAutoAccepted = newStatus === "ACCEPTED"
        const title = isAutoAccepted ? "New job added to your schedule" : "New job request"
        // "Automatically" is right for an autoAccept booking, but wrong for a
        // bid the provider made themselves — there the customer chose them and
        // picked the time, and saying so tells them where the job came from.
        const message = !isAutoAccepted
          ? `You have a new job request: "${job.title}". Review and respond in your job list.`
          : fromAcceptedBid
            ? `Your offer for "${job.title}" was accepted and scheduled. It's now in your active jobs.`
            : `"${job.title}" was automatically added to your schedule.`
        await db.notification.create({
          data: {
            userId: provider.userId,
            title,
            message,
            type: "JOB",
            relatedType: "JOB",
            relatedId: job.id,
            actionUrl: "/provider/jobs",
          },
        }).catch(() => {})
        await pushToUser(provider.userId, { title, body: message, url: "/provider/jobs" }, "job")
      }
    }
  }

  await maybeRewardReferral(job.customerId).catch(() => {})

  await logJobEvent({
    jobId: job.id, type: "PAYMENT_CONFIRMED", actor: "CUSTOMER", actorUserId: job.customerId,
    description: "Payment received, booking confirmed", metadata: { amount: Number(job.price) },
  })
  if (newStatus === "ACCEPTED") {
    await logJobEvent({ jobId: job.id, type: "JOB_ACCEPTED", actor: "SYSTEM", description: "Automatically assigned and accepted" })
  }

  // Fire-and-forget, same reasoning as the Smart Cart checkout receipt in
  // lib/actions/cart.ts — never block/fail this on a PDF or email hiccup.
  const jobPayment = await db.payment.findFirst({
    where: { jobId: job.id, status: "COMPLETED" },
    orderBy: { paidAt: "desc" },
  }).catch(() => null)
  void createAndEmailReceipt({
    userId: job.customerId,
    type: "PAYMENT",
    paymentMethod: "Online Payment",
    transactionRef: jobPayment?.externalRef ?? null,
    lineItems: [{ label: job.title, description: job.description, quantity: 1, amount: Number(job.price) }],
    subtotal: Number(job.price),
    adjustments: [],
    totalAmount: Number(job.price),
    currency: job.currency,
  })
}

export async function failJobPayment(jobId: string, reason?: string) {
  const job = await db.job.findUnique({ where: { id: jobId } })
  if (!job || job.status !== "PENDING_PAYMENT") return
  {
    const failMessage = reason ? `${reason} You can try again from your bookings.` : "Your payment could not be completed. You can try again from your bookings."
    await db.notification.create({
      data: {
        userId: job.customerId,
        title: "Payment failed",
        message: failMessage,
        type: "PAYMENT",
        relatedType: "JOB",
        relatedId: job.id,
        actionUrl: "/customer/jobs",
      },
    }).catch(() => {})
    await pushToUser(job.customerId, { title: "Payment failed", body: failMessage, url: "/customer/jobs" }, "payment")
  }

  await logJobEvent({
    jobId: job.id, type: "PAYMENT_FAILED", actor: "SYSTEM",
    description: reason ? `Payment failed: ${reason}` : "Payment failed",
  })
}

/** Marks a Payment (found by its externalRef) as completed and confirms the
 * linked job. Used for the sandbox-simulation path in the initiate route,
 * sharing the same completion logic the real webhooks/pollers use. */
export async function markPaymentCompleted(externalRef: string): Promise<void> {
  const payment = await db.payment.findFirst({ where: { externalRef } })
  if (!payment) return
  await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
  if (payment.jobId) await confirmJobPayment(payment.jobId)
}
