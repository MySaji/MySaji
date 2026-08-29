import { NextResponse } from "next/server"
import { initiateMpesaPayment, initiateAirtelPayment, initiatePaypalPayment, createStripeCheckout, markPaymentCompleted, confirmJobPayment } from "@/lib/actions/payments"
import { confirmWalletTopup } from "@/lib/actions/wallet"
import { confirmProSubscriptionPayment } from "@/lib/actions/provider-subscription"
import { confirmRentalBookingPayment } from "@/lib/actions/rentals"
import { getEffectivePlatformPreferences } from "@/lib/actions/admin-settings"
import { auth } from "@/auth"
import { db } from "@/lib/db"

const WALLET_TOPUP_METHOD_LABEL: Record<string, string> = { mpesa: "M-Pesa", airtel: "Airtel Money", paypal: "PayPal", card: "Card", stripe: "Card" }

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { provider, phone } = body

    if (!provider) return NextResponse.json({ success: false, message: "Missing provider" }, { status: 400 })

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 })

    if (body.context === "wallet-topup") {
      const amount = Number(body.amount)
      if (!(amount > 0) || amount > 1_000_000) {
        return NextResponse.json({ success: false, message: "Enter a valid amount." }, { status: 400 })
      }

      const origin = req.headers.get("origin") || new URL(req.url).origin
      // Wallet top-up is now available from more than just the customer
      // wallet page (e.g. shopkeeper earnings, for funding distributor
      // orders) — the caller tells us where to redirect back to instead of
      // this route assuming /customer/wallet for every role.
      const returnPath = typeof body.returnPath === "string" && body.returnPath.startsWith("/") ? body.returnPath : "/customer/wallet"
      // Stripe substitutes the literal {CHECKOUT_SESSION_ID} token with the
      // real session id on redirect — that's how the wallet page identifies
      // which pending Payment to poll, the same role `jobId` plays for the
      // booking flow's Stripe redirect.
      const successUrl = `${origin}${returnPath}?stripe=success&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${origin}${returnPath}?stripe=cancel`
      const paypalReturnUrl = `${origin}${returnPath}?paypal=return`
      const paypalCancelUrl = `${origin}${returnPath}?paypal=cancel`

      async function recordWalletPayment(requestId: string | undefined, simulated: boolean | undefined) {
        const payment = await db.payment.create({
          data: { amount, currency: "KES", status: "PENDING", contextType: "WALLET_TOPUP", payerId: session!.user!.id, externalRef: requestId ?? null },
        })
        if (simulated) await confirmWalletTopup(payment.id, WALLET_TOPUP_METHOD_LABEL[provider] ?? "your payment method")
        return payment
      }

      switch (provider) {
        case "mpesa": {
          const res = await initiateMpesaPayment(phone, amount, "SAJI wallet top-up")
          if (res.success) {
            const payment = await recordWalletPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        case "paypal": {
          const res = await initiatePaypalPayment(amount, paypalReturnUrl, paypalCancelUrl)
          if (res.success) {
            const payment = await recordWalletPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        case "card":
        case "stripe": {
          const res = await createStripeCheckout(amount, successUrl, cancelUrl)
          if (res.success) {
            const payment = await recordWalletPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        default:
          return NextResponse.json({ success: false, message: "Unsupported provider" }, { status: 400 })
      }
    }

    if (body.context === "provider-subscription") {
      const providerProfile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
      if (!providerProfile) return NextResponse.json({ success: false, message: "Provider profile not found" }, { status: 404 })

      // Never trust a client-supplied amount here either — the Saji Pro
      // price is admin-configurable, so re-derive it server-side.
      const prefs = await getEffectivePlatformPreferences()
      const amount = prefs.providerProPriceKES

      const origin = req.headers.get("origin") || new URL(req.url).origin
      const returnPath = "/provider/pro"
      const successUrl = `${origin}${returnPath}?stripe=success&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${origin}${returnPath}?stripe=cancel`
      const paypalReturnUrl = `${origin}${returnPath}?paypal=return`
      const paypalCancelUrl = `${origin}${returnPath}?paypal=cancel`

      async function recordSubscriptionPayment(requestId: string | undefined, simulated: boolean | undefined) {
        const payment = await db.payment.create({
          data: { amount, currency: "KES", status: "PENDING", contextType: "SUBSCRIPTION", payerId: session!.user!.id, externalRef: requestId ?? null },
        })
        if (simulated) {
          await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
          await confirmProSubscriptionPayment(providerProfile!.id, amount)
        }
        return payment
      }

      switch (provider) {
        case "mpesa": {
          const res = await initiateMpesaPayment(phone, amount, "SAJI Pro subscription")
          if (res.success) {
            const payment = await recordSubscriptionPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        case "paypal": {
          const res = await initiatePaypalPayment(amount, paypalReturnUrl, paypalCancelUrl)
          if (res.success) {
            const payment = await recordSubscriptionPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        case "card":
        case "stripe": {
          const res = await createStripeCheckout(amount, successUrl, cancelUrl)
          if (res.success) {
            const payment = await recordSubscriptionPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        default:
          return NextResponse.json({ success: false, message: "Unsupported provider" }, { status: 400 })
      }
    }

    if (body.context === "rental-booking") {
      const bookingId = body.bookingId
      if (!bookingId) return NextResponse.json({ success: false, message: "Missing bookingId" }, { status: 400 })

      // Never trust a client-supplied amount — always re-derive it from the
      // real RentalBooking row (rentalFee + depositAmount, computed at
      // booking-creation time) so a tampered request can't underpay.
      const booking = await db.rentalBooking.findUnique({ where: { id: bookingId }, include: { offer: true } })
      if (!booking || booking.customerId !== session.user.id) {
        return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 })
      }
      if (booking.status !== "PENDING_PAYMENT") {
        return NextResponse.json({ success: false, message: "This booking is not awaiting payment" }, { status: 409 })
      }
      const amount = Number(booking.totalAmount)

      const origin = req.headers.get("origin") || new URL(req.url).origin
      const returnPath = `/customer/rentals/${booking.offerId}?bookingId=${bookingId}`
      const successUrl = `${origin}${returnPath}&stripe=success&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${origin}${returnPath}&stripe=cancel`
      const paypalReturnUrl = `${origin}${returnPath}&paypal=return`
      const paypalCancelUrl = `${origin}${returnPath}&paypal=cancel`

      async function recordRentalPayment(requestId: string | undefined, simulated: boolean | undefined) {
        const payment = await db.payment.create({
          data: { amount, currency: "KES", status: "PENDING", contextType: "RENTAL", rentalBookingId: bookingId, payerId: session!.user!.id, externalRef: requestId ?? null },
        })
        if (simulated) {
          await db.payment.update({ where: { id: payment.id }, data: { status: "COMPLETED", paidAt: new Date() } })
          await confirmRentalBookingPayment(bookingId)
        }
        return payment
      }

      switch (provider) {
        case "mpesa": {
          const res = await initiateMpesaPayment(phone, amount, `Rental: ${booking.offer.title}`)
          if (res.success) {
            const payment = await recordRentalPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        case "paypal": {
          const res = await initiatePaypalPayment(amount, paypalReturnUrl, paypalCancelUrl)
          if (res.success) {
            const payment = await recordRentalPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        case "card":
        case "stripe": {
          const res = await createStripeCheckout(amount, successUrl, cancelUrl)
          if (res.success) {
            const payment = await recordRentalPayment(res.requestId, res.simulated)
            return NextResponse.json({ ...res, paymentId: payment.id })
          }
          return NextResponse.json(res)
        }
        default:
          return NextResponse.json({ success: false, message: "Unsupported provider" }, { status: 400 })
      }
    }

    const jobId = body.jobId
    if (!jobId) return NextResponse.json({ success: false, message: "Missing jobId" }, { status: 400 })

    // Never trust a client-supplied amount for a job payment — always re-derive
    // it from the real Job row so a tampered request can't underpay.
    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job || job.customerId !== session.user.id) {
      return NextResponse.json({ success: false, message: "Job not found" }, { status: 404 })
    }
    if (job.status !== "PENDING_PAYMENT") {
      return NextResponse.json({ success: false, message: "This job is not awaiting payment" }, { status: 409 })
    }
    const amount = Number(job.price)

    // CALLBACK_URL isn't configured in this environment; Stripe/PayPal need
    // absolute redirect URLs, so derive the origin from the request itself.
    const origin = req.headers.get("origin") || new URL(req.url).origin
    const successUrl = `${origin}/customer/booking-confirmation?jobId=${jobId}`
    const cancelUrl = `${origin}/customer/booking?service=${job.serviceId ?? ""}&jobId=${jobId}&status=cancelled`
    const paypalReturnUrl = `${origin}/customer/booking?paypal=return&jobId=${jobId}`
    const paypalCancelUrl = `${origin}/customer/booking?paypal=cancel&jobId=${jobId}`

    async function recordPayment(requestId: string | undefined, simulated: boolean | undefined) {
      await db.payment.create({ data: { amount, currency: "KES", status: "PENDING", contextType: "JOB", jobId, payerId: session!.user!.id, externalRef: requestId ?? null } }).catch(() => {})
      if (simulated && requestId) await markPaymentCompleted(requestId)
    }

    switch (provider) {
      case "wallet": {
        // Instant, real, no redirect needed — the customer's own real
        // wallet balance is a legitimate funding source alongside the
        // external gateways, and doing it here (rather than a separate
        // wallet-only code path) is what makes this one real payment flow
        // instead of two divergent ones.
        const wallet = await db.wallet.findUnique({ where: { userId: session.user.id } })
        if (!wallet) return NextResponse.json({ success: false, message: "Wallet not found." })
        if (Number(wallet.balance) < amount) {
          return NextResponse.json({ success: false, message: "Insufficient wallet balance for this amount." })
        }

        const balanceBefore = Number(wallet.balance)
        const balanceAfter = balanceBefore - amount
        const payment = await db.payment.create({
          data: { amount, currency: "KES", status: "COMPLETED", contextType: "JOB", jobId, payerId: session.user.id, paidAt: new Date() },
        })
        await db.$transaction([
          db.wallet.update({ where: { userId: session.user.id }, data: { balance: balanceAfter } }),
          db.transaction.create({
            data: {
              walletId: wallet.id,
              type: "DEBIT",
              amount: -amount,
              description: `Payment for ${job.title}`,
              referenceType: "JOB",
              referenceId: jobId,
              status: "COMPLETED",
              balanceBefore,
              balanceAfter,
            },
          }),
        ])
        await confirmJobPayment(jobId)
        return NextResponse.json({ success: true, provider: "wallet", requestId: payment.id })
      }
      case "mpesa": {
        const res = await initiateMpesaPayment(phone, amount)
        if (res.success) await recordPayment(res.requestId, res.simulated)
        return NextResponse.json(res)
      }
      case "airtel": {
        const res = await initiateAirtelPayment(phone, amount)
        if (res.success) await recordPayment(res.requestId, res.simulated)
        return NextResponse.json(res)
      }
      case "paypal": {
        const res = await initiatePaypalPayment(amount, paypalReturnUrl, paypalCancelUrl)
        if (res.success) await recordPayment(res.requestId, res.simulated)
        return NextResponse.json(res)
      }
      case "card":
      case "stripe": {
        const res = await createStripeCheckout(amount, successUrl, cancelUrl)
        if (res.success) await recordPayment(res.requestId, res.simulated)
        return NextResponse.json(res)
      }
      default:
        return NextResponse.json({ success: false, message: "Unsupported provider" }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message ?? "initiate error" }, { status: 500 })
  }
}
