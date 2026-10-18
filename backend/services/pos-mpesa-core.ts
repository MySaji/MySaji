import "server-only"
import { mpesaScope } from "@/backend/domain/pos-mpesa"
import crypto from "crypto"
import { db } from "@/backend/db"
import { decryptAccountNumber } from "@/backend/services/payment-method-crypto"

export const mpesaTokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex")
export const mpesaBase = (env: string | null) => env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke"
export function mpesaPublicUrl() {
  const url = new URL(process.env.NEXTAUTH_URL || "http://localhost:3000")
  if (url.protocol !== "https:") throw Error("A public HTTPS NEXTAUTH_URL is required for M-Pesa callbacks.")
  return url.origin
}
export async function merchantToken(shop: { mpesaConsumerKey: string | null; mpesaConsumerSecret: string | null; mpesaEnv: string | null }) {
  const key = shop.mpesaConsumerKey ? decryptAccountNumber(shop.mpesaConsumerKey) : null
  const secret = shop.mpesaConsumerSecret ? decryptAccountNumber(shop.mpesaConsumerSecret) : null
  if (!key || !secret) throw Error("Save this merchant's Daraja consumer key and secret first.")
  const response = await fetch(mpesaBase(shop.mpesaEnv) + "/oauth/v1/generate?grant_type=client_credentials", { headers: { Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64") }, cache: "no-store", signal: AbortSignal.timeout(15000) })
  const body = await response.json()
  if (!response.ok || typeof body.access_token !== "string") throw Error("Safaricom did not accept the merchant credentials.")
  return body.access_token as string
}

export async function confirmStkQuery(shopkeeperId: string, checkoutId: string): Promise<boolean> {
  const shop = await db.shopkeeperProfile.findUnique({ where: { id: shopkeeperId } })
  if (!shop) return false
  const { demo, shortcode, environment } = mpesaScope(shop)
  const passkey = demo ? process.env.MPESA_PASSKEY : shop.mpesaPasskey ? decryptAccountNumber(shop.mpesaPasskey) : null
  if (!shortcode || !passkey) return false
  let token: string
  if (demo) {
    const response = await fetch(mpesaBase("sandbox") + "/oauth/v1/generate?grant_type=client_credentials", { headers: { Authorization: "Basic " + Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64") }, cache: "no-store", signal: AbortSignal.timeout(15000) })
    token = (await response.json()).access_token
  } else token = await merchantToken(shop)
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
  const response = await fetch(mpesaBase(environment) + "/mpesa/stkpushquery/v1/query", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ BusinessShortCode: shortcode, Password: Buffer.from(shortcode + passkey + timestamp).toString("base64"), Timestamp: timestamp, CheckoutRequestID: checkoutId }), cache: "no-store", signal: AbortSignal.timeout(15000) })
  const body = await response.json()
  return response.ok && String(body.ResultCode) === "0"
}
