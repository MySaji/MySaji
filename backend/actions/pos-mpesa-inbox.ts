"use server"

import { mpesaScope } from "@/backend/domain/pos-mpesa"
import crypto from "crypto"
import { z } from "zod"
import { db } from "@/backend/db"
import { resolvePosActor, requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"
import { decryptAccountNumber, encryptAccountNumber } from "@/backend/services/payment-method-crypto"
import { merchantToken, mpesaBase, mpesaPublicUrl, mpesaTokenHash } from "@/backend/services/pos-mpesa-core"

export async function getMpesaInbox(input?: unknown) {
  const actor = await resolvePosActor()
  if (!actor?.shopkeeperId || !(["till.sell", "report.sales", "payment.settings"] as const).some(permission => actor.can(permission))) return null
  const parsed = z.object({ query: z.string().trim().max(80).optional(), availableOnly: z.boolean().optional() }).safeParse(input ?? {})
  if (!parsed.success) return null
  const shop = await db.shopkeeperProfile.findUnique({ where: { id: actor.shopkeeperId }, select: { mpesaShortcode: true, mpesaEnv: true, mpesaUseDemoCreds: true } })
  if (!shop) return null
  const { environment, shortcode } = mpesaScope(shop)
  const connection = await db.posMpesaConnection.findUnique({ where: { shopkeeperId: actor.shopkeeperId }, select: { registeredAt: true, shortcode: true, environment: true } })
  const query = parsed.data.query
  const rows = await db.posMpesaTransaction.findMany({ where: { shopkeeperId: actor.shopkeeperId, environment, shortcode, ...(parsed.data.availableOnly ? { status: "PAID", consumedSaleId: null } : {}), ...(query ? { OR: [{ receipt: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }, { accountReference: { contains: query, mode: "insensitive" } }, { payerName: { contains: query, mode: "insensitive" } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { id: true, source: true, status: true, amount: true, phone: true, payerName: true, accountReference: true, checkoutId: true, receipt: true, consumedSaleId: true, confirmedAt: true, createdAt: true, resultDescription: true } })
  return { shortcode, environment, connected: !!connection?.registeredAt && connection.shortcode === shortcode && connection.environment === environment, canConfigure: actor.can("payment.settings"), rows: rows.map(row => ({ ...row, amount: Number(row.amount), createdAt: row.createdAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null })) }
}

export async function connectMpesaNotifications(): Promise<{ success: true } | { success: false; error: string }> {
  const access = await requirePosPermission("payment.settings")
  if (!access.ok || !access.actor.shopkeeperId) return { success: false, error: "You cannot configure this store's payments." }
  try {
    const shop = await db.shopkeeperProfile.findUnique({ where: { id: access.actor.shopkeeperId } })
    if (!shop?.mpesaShortcode || shop.mpesaUseDemoCreds) throw Error("Save the shop's own Paybill/Till and Daraja credentials first. Demo credentials cannot register a merchant's shortcode.")
    const origin = mpesaPublicUrl()
    let connection = await db.posMpesaConnection.findUnique({ where: { shopkeeperId: shop.id } })
    const secret = connection ? decryptAccountNumber(connection.tokenCiphertext) : crypto.randomBytes(32).toString("hex")
    const ciphertext = secret ? encryptAccountNumber(secret) : null
    if (!secret || !ciphertext) throw Error("Secure payment credential storage is unavailable.")
    if (!connection) connection = await db.posMpesaConnection.create({ data: { shopkeeperId: shop.id, shortcode: shop.mpesaShortcode, environment: shop.mpesaEnv === "production" ? "production" : "sandbox", tokenHash: mpesaTokenHash(secret), tokenCiphertext: ciphertext } })
    const token = await merchantToken(shop)
    const response = await fetch(mpesaBase(shop.mpesaEnv) + "/mpesa/c2b/v2/registerurl", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ShortCode: shop.mpesaShortcode, ResponseType: "Completed", ConfirmationURL: `${origin}/api/mpesa/pos/c2b/${secret}`, ValidationURL: `${origin}/api/mpesa/pos/c2b/${secret}?validation=1` }), cache: "no-store", signal: AbortSignal.timeout(20000) })
    const body = await response.json()
    if (!response.ok || !/^0+$/.test(String(body.ResponseCode))) throw Error(String(body.errorMessage || body.ResponseDescription || "Safaricom could not register the callback URLs. Check the shortcode's C2B permissions."))
    await db.posMpesaConnection.update({ where: { id: connection.id }, data: { shortcode: shop.mpesaShortcode, environment: shop.mpesaEnv === "production" ? "production" : "sandbox", registeredAt: new Date() } })
    await recordPosAudit({ actor: access.actor, action: "mpesa.connect", summary: `Connected M-Pesa notifications for ${shop.mpesaShortcode}` })
    return { success: true }
  } catch (error) { return { success: false, error: error instanceof Error ? error.message.slice(0, 220) : "Could not connect payment notifications." } }
}
