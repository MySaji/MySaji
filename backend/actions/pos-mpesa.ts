"use server"

import { z } from "zod"
import crypto from "crypto"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { encryptAccountNumber, decryptAccountNumber, paymentEncryptionConfigured } from "@/backend/services/payment-method-crypto"

/**
 * Taking M-Pesa at the counter, into the shop's own account.
 *
 * TWO HALVES, AND THE FIRST ONE IS THE IMPORTANT ONE
 *
 * Most dukas already have a paybill or a till number painted on the wall.
 * The useful thing a POS can do is put that number on the screen at the
 * moment of payment, with the exact amount, so the cashier stops reciting it
 * and the customer stops mistyping it. That half needs no integration at
 * all: the shopkeeper types their number in once.
 *
 * The second half is the prompt. Safaricom can push a PIN request to the
 * customer's phone, which is what "nitumie prompt" means to a Kenyan buyer.
 * That requires Daraja credentials, and crucially they must be the SHOP'S
 * own, because the money settles into whichever shortcode signed the
 * request. Routing a shop's takings through the platform's shortcode would
 * make SAJI a deposit-taking intermediary, which it is not and must not
 * quietly become.
 *
 * RECORDED VERSUS CONFIRMED
 *
 * The till has always been careful to say that a typed M-Pesa code is
 * recorded, not verified. A prompt is the one case where the till genuinely
 * knows: Daraja answers with a receipt number against the request we sent.
 * Only that path sets stkConfirmed. Everything else stays "recorded".
 */

type ShopMpesa = {
  shortcode: string | null
  shortcodeType: "PAYBILL" | "TILL" | null
  accountRef: string | null
  promptEnabled: boolean
  env: "sandbox" | "production"
  /** Whether Daraja credentials are stored. Never the credentials themselves. */
  hasCredentials: boolean
  /** Why the prompt is unavailable, where it is. */
  promptBlockedReason: string | null
}

async function requireShop() {
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.role !== "provider" && session.user.role !== "shopkeeper") return null
  const shop = await db.shopkeeperProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true, shopName: true, posEnabled: true,
      mpesaShortcode: true, mpesaShortcodeType: true, mpesaAccountRef: true,
      mpesaPromptEnabled: true, mpesaConsumerKey: true, mpesaConsumerSecret: true,
      mpesaPasskey: true, mpesaEnv: true,
    },
  })
  if (!shop || !shop.posEnabled) return null
  return shop
}

function describe(shop: NonNullable<Awaited<ReturnType<typeof requireShop>>>): ShopMpesa {
  const hasCredentials = Boolean(shop.mpesaConsumerKey && shop.mpesaConsumerSecret && shop.mpesaPasskey)
  let blocked: string | null = null
  if (!shop.mpesaShortcode) blocked = "Add your paybill or till number first."
  else if (!hasCredentials) blocked = "Add your Daraja API details to send prompts."
  else if (!paymentEncryptionConfigured()) blocked = "Secure storage is not configured on this site."
  else if (!shop.mpesaPromptEnabled) blocked = "Prompts are switched off for this shop."

  return {
    shortcode: shop.mpesaShortcode,
    shortcodeType: (shop.mpesaShortcodeType as "PAYBILL" | "TILL" | null) ?? null,
    accountRef: shop.mpesaAccountRef,
    promptEnabled: shop.mpesaPromptEnabled,
    env: shop.mpesaEnv === "production" ? "production" : "sandbox",
    hasCredentials,
    promptBlockedReason: blocked,
  }
}

export async function getShopMpesa(): Promise<ShopMpesa | null> {
  const shop = await requireShop()
  if (!shop) return null
  return describe(shop)
}

export type SaveMpesaResult = { success: true; config: ShopMpesa } | { success: false; error: string }

const saveSchema = z.object({
  shortcode: z.string().trim().max(12).optional(),
  shortcodeType: z.enum(["PAYBILL", "TILL"]).optional(),
  accountRef: z.string().trim().max(40).optional(),
  promptEnabled: z.boolean().optional(),
  env: z.enum(["sandbox", "production"]).optional(),
  /** Blank means "leave what is stored alone", never "clear it". */
  consumerKey: z.string().trim().max(200).optional(),
  consumerSecret: z.string().trim().max(200).optional(),
  passkey: z.string().trim().max(200).optional(),
})

export async function saveShopMpesa(input: unknown): Promise<SaveMpesaResult> {
  const shop = await requireShop()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const d = parsed.data

  if (d.shortcode !== undefined && d.shortcode !== "" && !/^\d{5,9}$/.test(d.shortcode)) {
    return { success: false, error: "A paybill or till number is 5 to 9 digits." }
  }

  const data: Record<string, unknown> = {}
  if (d.shortcode !== undefined) data.mpesaShortcode = d.shortcode || null
  if (d.shortcodeType !== undefined) data.mpesaShortcodeType = d.shortcodeType
  if (d.accountRef !== undefined) data.mpesaAccountRef = d.accountRef || null
  if (d.env !== undefined) data.mpesaEnv = d.env

  // Credentials are write only. A blank field leaves the stored value in
  // place, so re-saving the page does not wipe them, and nothing ever sends
  // them back to a browser to be filled in.
  for (const [field, column] of [
    ["consumerKey", "mpesaConsumerKey"],
    ["consumerSecret", "mpesaConsumerSecret"],
    ["passkey", "mpesaPasskey"],
  ] as const) {
    const value = d[field]
    if (!value) continue
    if (!paymentEncryptionConfigured()) {
      return { success: false, error: "This site cannot store API details securely yet. Ask support to set it up." }
    }
    const enc = encryptAccountNumber(value)
    if (!enc) return { success: false, error: "Could not store those API details securely." }
    data[column] = enc
  }

  if (d.promptEnabled !== undefined) {
    // Turning it on with nothing behind it would put a button on the till
    // that fails in front of a customer.
    if (d.promptEnabled) {
      const willHaveCreds =
        (d.consumerKey || shop.mpesaConsumerKey) &&
        (d.consumerSecret || shop.mpesaConsumerSecret) &&
        (d.passkey || shop.mpesaPasskey)
      const willHaveShortcode = d.shortcode ?? shop.mpesaShortcode
      if (!willHaveShortcode) return { success: false, error: "Add your paybill or till number before switching prompts on." }
      if (!willHaveCreds) return { success: false, error: "Add all three Daraja details before switching prompts on." }
    }
    data.mpesaPromptEnabled = d.promptEnabled
  }

  await db.shopkeeperProfile.update({ where: { id: shop.id }, data })
  const again = await requireShop()
  return { success: true, config: describe(again!) }
}

// ---------------------------------------------------------------- prompting

function normalizePhone(raw: string): string | null {
  const digits = raw.trim().replace(/[^\d+]/g, "")
  if (/^\+254\d{9}$/.test(digits)) return digits.slice(1)
  if (/^254\d{9}$/.test(digits)) return digits
  if (/^0\d{9}$/.test(digits)) return "254" + digits.slice(1)
  if (/^\d{9}$/.test(digits)) return "254" + digits
  return null
}

function darajaBase(env: string) {
  return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke"
}

async function darajaToken(base: string, key: string, secret: string): Promise<string | null> {
  try {
    const res = await fetch(base + "/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: "Basic " + Buffer.from(key + ":" + secret).toString("base64") },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.access_token ?? null
  } catch {
    return null
  }
}

export type PromptResult =
  | { success: true; checkoutId: string; phone: string }
  | { success: false; error: string }

const promptSchema = z.object({
  phone: z.string().trim().min(9).max(16),
  amount: z.number().positive().max(300_000),
  /** Shown in the customer's prompt, so they know what they are paying for. */
  reference: z.string().trim().max(12).optional(),
})

/**
 * Send the customer a PIN prompt for this sale.
 *
 * Does NOT record a payment. The till asks separately whether it went
 * through, and only a confirmed answer is written against the sale. A
 * prompt that was sent is not money that arrived, and conflating the two
 * would let a customer walk out on a cancelled prompt.
 */
export async function promptCustomerPayment(input: unknown): Promise<PromptResult> {
  const shop = await requireShop()
  if (!shop) return { success: false, error: "There is no till on this account." }
  const parsed = promptSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Enter the customer's phone number and the amount." }

  const cfg = describe(shop)
  if (cfg.promptBlockedReason) return { success: false, error: cfg.promptBlockedReason }

  const phone = normalizePhone(parsed.data.phone)
  if (!phone) return { success: false, error: "That does not look like a Kenyan phone number." }

  const key = decryptAccountNumber(shop.mpesaConsumerKey!)
  const secret = decryptAccountNumber(shop.mpesaConsumerSecret!)
  const passkey = decryptAccountNumber(shop.mpesaPasskey!)
  if (!key || !secret || !passkey) {
    return { success: false, error: "Your saved API details could not be read. Enter them again." }
  }

  const base = darajaBase(cfg.env)
  const token = await darajaToken(base, key, secret)
  if (!token) return { success: false, error: "Safaricom did not accept your API details. Check them in settings." }

  // Daraja wants its own timestamp format and a password derived from it.
  const ts = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14)
  const shortcode = shop.mpesaShortcode!
  const password = Buffer.from(shortcode + passkey + ts).toString("base64")

  // Whole shillings: Daraja rejects decimals, and rounding UP would charge
  // the customer more than the receipt says.
  const amount = Math.floor(parsed.data.amount)
  if (amount < 1) return { success: false, error: "The amount is too small to send a prompt for." }

  try {
    const res = await fetch(base + "/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: cfg.shortcodeType === "TILL" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: (process.env.NEXTAUTH_URL || "https://example.invalid").replace(/\/+$/, "") + "/api/mpesa/pos-callback",
        AccountReference: (parsed.data.reference || shop.mpesaAccountRef || shop.shopName).slice(0, 12),
        TransactionDesc: "Payment",
      }),
    })
    const data = await res.json()
    if (!res.ok || !data?.CheckoutRequestID) {
      // Safaricom's own words, which are usually actionable here ("Invalid
      // PhoneNumber", "Wrong credentials"), unlike the generic 403 the SMS
      // product returns.
      const why = data?.errorMessage || data?.ResponseDescription || "Safaricom would not send the prompt."
      return { success: false, error: String(why).slice(0, 160) }
    }
    return { success: true, checkoutId: String(data.CheckoutRequestID), phone }
  } catch {
    return { success: false, error: "Could not reach Safaricom. Check the connection and try again." }
  }
}

export type PromptStatus =
  | { state: "pending" }
  | { state: "paid"; receipt: string | null }
  | { state: "failed"; reason: string }

/**
 * Ask Safaricom what happened to a prompt.
 *
 * Polled by the till while the customer has their phone out. "Pending" is a
 * real answer and the commonest one: the request is sitting on the handset
 * waiting for a PIN.
 */
export async function checkPromptStatus(input: unknown): Promise<PromptStatus> {
  const shop = await requireShop()
  if (!shop) return { state: "failed", reason: "There is no till on this account." }
  const parsed = z.object({ checkoutId: z.string().trim().min(1).max(80) }).safeParse(input)
  if (!parsed.success) return { state: "failed", reason: "Nothing to check." }

  const cfg = describe(shop)
  const key = shop.mpesaConsumerKey ? decryptAccountNumber(shop.mpesaConsumerKey) : null
  const secret = shop.mpesaConsumerSecret ? decryptAccountNumber(shop.mpesaConsumerSecret) : null
  const passkey = shop.mpesaPasskey ? decryptAccountNumber(shop.mpesaPasskey) : null
  if (!key || !secret || !passkey) return { state: "failed", reason: "API details unavailable." }

  const base = darajaBase(cfg.env)
  const token = await darajaToken(base, key, secret)
  if (!token) return { state: "pending" }

  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
  const password = Buffer.from(shop.mpesaShortcode! + passkey + ts).toString("base64")

  try {
    const res = await fetch(base + "/mpesa/stkpushquery/v1/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        BusinessShortCode: shop.mpesaShortcode,
        Password: password,
        Timestamp: ts,
        CheckoutRequestID: parsed.data.checkoutId,
      }),
    })
    const data = await res.json()

    // 500.001.1001 means the subscriber has not answered yet. It is an error
    // shaped response for an entirely normal state, so it must not be shown
    // to a cashier as a failure.
    if (data?.errorCode === "500.001.1001") return { state: "pending" }

    const code = String(data?.ResultCode ?? "")
    if (code === "0") {
      return { state: "paid", receipt: data?.MpesaReceiptNumber ? String(data.MpesaReceiptNumber) : null }
    }
    if (code === "1032") return { state: "failed", reason: "The customer cancelled the prompt." }
    if (code === "1037") return { state: "failed", reason: "The phone did not respond. Try again." }
    if (code === "1") return { state: "failed", reason: "Not enough money in the customer's M-Pesa." }
    if (code === "") return { state: "pending" }
    return { state: "failed", reason: String(data?.ResultDesc || "The payment did not go through.").slice(0, 160) }
  } catch {
    return { state: "pending" }
  }
}

/** A short unique reference for one prompt, so the customer sees something recognisable. */
export async function newPromptReference(): Promise<string> {
  return "T" + crypto.randomBytes(3).toString("hex").toUpperCase()
}
