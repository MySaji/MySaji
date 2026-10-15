import "server-only"

import crypto from "crypto"

import { mpesaB2CConfigured } from "@/backend/services/mpesa-config"

let mpesaToken: { access_token: string; expires_at: number } | null = null

async function getMpesaToken() {
  const now = Date.now()
  if (mpesaToken && mpesaToken.expires_at > now + 5000) return mpesaToken.access_token

  const key = process.env.MPESA_CONSUMER_KEY
  const secret = process.env.MPESA_CONSUMER_SECRET
  if (!key || !secret) throw new Error("Missing M-PESA credentials")

  const cred = Buffer.from(`${key}:${secret}`).toString("base64")
  const tokenUrl = process.env.MPESA_ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"

  const res = await fetch(tokenUrl, { headers: { Authorization: `Basic ${cred}` } })
  const json = await res.json()
  if (!json.access_token) throw new Error("Failed to get M-PESA token")
  mpesaToken = { access_token: json.access_token, expires_at: Date.now() + (json.expires_in || 3600) * 1000 }
  return mpesaToken.access_token
}

function b2cSecurityCredential(): string {
  // Safaricom's cert-encrypted initiator password, PKCS1 v1.5 padding —
  // required padding scheme per the Daraja spec (OAEP will not verify).
  // The cert is stored as a single-line env var with literal "\n" escapes
  // (the standard trick for putting PEM content in a .env file).
  const cert = process.env.MPESA_B2C_CERT!.replace(/\\n/g, "\n")
  const password = process.env.MPESA_INITIATOR_PASSWORD!
  return crypto.publicEncrypt({ key: cert, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(password)).toString("base64")
}

export type InitiateB2CResult = { success: boolean; conversationId?: string; message?: string }

export async function initiateB2CPayment(phone: string, amount: number, remarks: string, resultUrl: string, timeoutUrl: string): Promise<InitiateB2CResult> {
  if (!mpesaB2CConfigured()) return { success: false, message: "B2C payouts are not configured yet." }

  try {
    const token = await getMpesaToken()
    const payload = {
      InitiatorName: process.env.MPESA_INITIATOR_NAME,
      SecurityCredential: b2cSecurityCredential(),
      CommandID: process.env.MPESA_B2C_COMMAND_ID || "BusinessPayment",
      Amount: Math.round(amount),
      PartyA: process.env.MPESA_B2C_SHORTCODE,
      PartyB: phone,
      Remarks: remarks.slice(0, 100),
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: "Withdrawal",
    }

    const endpoint = process.env.MPESA_ENVIRONMENT === "production"
      ? "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest"

    const res = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok || data?.ResponseCode !== "0" || !data?.ConversationID) {
      return { success: false, message: data?.errorMessage || data?.ResponseDescription || "Failed to initiate M-PESA payout" }
    }

    return { success: true, conversationId: data.ConversationID }
  } catch (err: any) {
    return { success: false, message: err?.message ?? "B2C payout error" }
  }
}
