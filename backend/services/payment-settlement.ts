import "server-only"
import { serialTransaction } from "@/backend/services/db-transaction"

/** Claims the payment and changes its purchased entitlement in one transaction. */
export async function settleConfirmedPayment(paymentId: string): Promise<void> {
  await serialTransaction(async tx => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status !== "COMPLETED" || payment.settledAt) return
    if (payment.contextType !== "SUBSCRIPTION" && payment.contextType !== "RENTAL") return
    const claimed = await tx.payment.updateMany({ where: { id: paymentId, status: "COMPLETED", settledAt: null }, data: { settledAt: new Date() } })
    if (claimed.count !== 1) return
    if (payment.contextType === "SUBSCRIPTION") {
      const profile = await tx.providerProfile.findUniqueOrThrow({ where: { userId: payment.payerId } })
      const current = await tx.providerSubscription.findUnique({ where: { providerId: profile.id } })
      const now = new Date(), base = current?.currentPeriodEnd && current.currentPeriodEnd > now ? current.currentPeriodEnd : now
      const data = { status: "ACTIVE" as const, currentPeriodEnd: new Date(base.getTime() + 30 * 86400000), lastPaymentAmount: payment.amount, lastPaymentAt: now }
      await tx.providerSubscription.upsert({ where: { providerId: profile.id }, create: { providerId: profile.id, ...data }, update: data })
    } else {
      if (!payment.rentalBookingId) throw new Error("Missing rental booking")
      await tx.rentalBooking.updateMany({ where: { id: payment.rentalBookingId, status: "PENDING_PAYMENT" }, data: { status: "CONFIRMED" } })
    }
  })
}
