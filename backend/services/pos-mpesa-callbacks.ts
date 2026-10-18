import "server-only"
import { z } from "zod"
import { db } from "@/backend/db"
import { confirmStkQuery, mpesaTokenHash } from "@/backend/services/pos-mpesa-core"

const receiptCode = z.string().trim().regex(/^[A-Za-z0-9]{8,30}$/).transform(value => value.toUpperCase())
const amountValue = z.coerce.number().finite().positive().max(999999999).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001)

export async function receiveC2b(token: string, body: unknown, validation: boolean) {
  const connection = await db.posMpesaConnection.findUnique({ where: { tokenHash: mpesaTokenHash(token) } })
  if (!connection?.registeredAt) return false
  const parsed = z.object({ BusinessShortCode: z.coerce.string(), TransID: receiptCode.optional(), TransAmount: amountValue, MSISDN: z.coerce.string().max(40).optional(), BillRefNumber: z.string().max(100).optional(), FirstName: z.string().max(80).optional(), MiddleName: z.string().max(80).optional(), LastName: z.string().max(80).optional() }).safeParse(body)
  if (!parsed.success || parsed.data.BusinessShortCode !== connection.shortcode) return false
  const shop = await db.shopkeeperProfile.findUnique({ where: { id: connection.shopkeeperId }, select: { mpesaShortcode: true, mpesaEnv: true, posEnabled: true } })
  if (!shop?.posEnabled || shop.mpesaShortcode !== connection.shortcode || (shop.mpesaEnv === "production" ? "production" : "sandbox") !== connection.environment) return false
  if (validation) return true
  const data = parsed.data
  if (!data.TransID) return false
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${connection.environment + ":" + connection.shortcode}), hashtext(${data.TransID!}))::text`
    const existing = await tx.posMpesaTransaction.findUnique({ where: { environment_shortcode_receipt: { environment: connection.environment, shortcode: connection.shortcode, receipt: data.TransID! } } })
    if (existing) {
      if (existing.shopkeeperId !== connection.shopkeeperId || Number(existing.amount) !== data.TransAmount) throw Error("Conflicting provider receipt")
      return
    }
    await tx.posMpesaTransaction.create({ data: { shopkeeperId: connection.shopkeeperId, shortcode: connection.shortcode, environment: connection.environment, source: "C2B", status: "PAID", amount: data.TransAmount, receipt: data.TransID, phone: data.MSISDN, payerName: [data.FirstName, data.MiddleName, data.LastName].filter(Boolean).join(" ") || null, accountReference: data.BillRefNumber, confirmedAt: new Date() } })
  })
  return true
}

export async function receiveStk(token: string, body: unknown) {
  const request = await db.posMpesaTransaction.findUnique({ where: { callbackTokenHash: mpesaTokenHash(token) } })
  if (!request) return false
  const parsed = z.object({ Body: z.object({ stkCallback: z.object({ CheckoutRequestID: z.string().min(1).max(100), ResultCode: z.coerce.number().int(), ResultDesc: z.string().max(300).optional(), CallbackMetadata: z.object({ Item: z.array(z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() })).max(20) }).optional() }) }) }).safeParse(body)
  if (!parsed.success) return false
  const callback = parsed.data.Body.stkCallback
  if (request.checkoutId && request.checkoutId !== callback.CheckoutRequestID) return false
  if (callback.ResultCode !== 0) {
    await db.posMpesaTransaction.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "FAILED", resultDescription: callback.ResultDesc || "Prompt was not paid" } })
    return true
  }
  const metadata = Object.fromEntries((callback.CallbackMetadata?.Item ?? []).map(item => [item.Name, item.Value]))
  const receipt = receiptCode.safeParse(metadata.MpesaReceiptNumber)
  const amount = amountValue.safeParse(metadata.Amount)
  if (!receipt.success || !amount.success || Number(request.amount) !== amount.data) return false
  if (String(metadata.PhoneNumber ?? "").replace(/\D/g, "") !== request.phone?.replace(/\D/g, "")) return false
  if (!(await confirmStkQuery(request.shopkeeperId, callback.CheckoutRequestID))) throw Error("Provider confirmation unavailable")
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${request.environment + ":" + request.shortcode}), hashtext(${receipt.data}))::text`
    const existing = await tx.posMpesaTransaction.findUnique({ where: { environment_shortcode_receipt: { environment: request.environment, shortcode: request.shortcode, receipt: receipt.data } } })
    if (existing && existing.id !== request.id) {
      if (existing.shopkeeperId !== request.shopkeeperId || Number(existing.amount) !== amount.data) throw Error("Conflicting provider receipt")
      await tx.posMpesaTransaction.update({ where: { id: request.id }, data: { status: "MERGED", checkoutId: null, callbackTokenHash: null } })
      await tx.posMpesaTransaction.update({ where: { id: existing.id }, data: { checkoutId: callback.CheckoutRequestID, callbackTokenHash: request.callbackTokenHash, source: "STK", status: "PAID", phone: request.phone, confirmedAt: existing.confirmedAt ?? new Date() } })
    } else {
      await tx.posMpesaTransaction.update({ where: { id: request.id }, data: { checkoutId: callback.CheckoutRequestID, receipt: receipt.data, status: "PAID", confirmedAt: request.confirmedAt ?? new Date(), resultDescription: null } })
    }
  })
  return true
}
