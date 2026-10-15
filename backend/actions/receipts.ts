"use server"
import { randomBytes } from "node:crypto"
import { auth } from "@/backend/auth"
import { checkRateLimit, getClientIp } from "@/backend/services/rate-limit"

import { createAndEmailReceipt } from "@/backend/services/receipts-core"

import { db } from "@/backend/db"
import { sendEmail } from "@/backend/services/email"
import { wrapEmailLayout, emailButton, siteOrigin } from "@/backend/services/email-templates"
import { getPublicSiteSettings } from "@/backend/actions/admin-settings"
import { generateReceiptPdf, type ReceiptLineItem, type ReceiptPdfData } from "@/backend/services/receipt-pdf"

export type { ReceiptLineItem }

function generateReceiptNumber(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  // Random, not sequential — a receipt number doubles as the public /verify
  // lookup key, so it shouldn't be trivially enumerable.
  const random = randomBytes(24).toString("hex").toUpperCase()
  return `SAJ-${y}${m}${d}-${random}`
}

export type ReceiptAdjustment = { label: string; amount: number }

type CreateReceiptInput = {
  userId: string
  type: "PAYMENT" | "DEPOSIT" | "WITHDRAWAL"
  paymentMethod?: string | null
  transactionRef?: string | null
  lineItems: ReceiptLineItem[]
  subtotal?: number | null
  adjustments?: ReceiptAdjustment[]
  totalAmount: number
  currency?: string
  balanceAfter?: number | null
}

async function buildPdfData(receipt: {
  receiptNumber: string
  type: "PAYMENT" | "DEPOSIT" | "WITHDRAWAL"
  createdAt: Date
  paymentMethod: string | null
  transactionRef: string | null
  lineItems: unknown
  subtotal: unknown
  adjustments: unknown
  totalAmount: unknown
  currency: string
  balanceAfter: unknown
}, customerName: string): Promise<ReceiptPdfData> {
  // Logo/contact are deliberately re-read live here, never stored on the
  // Receipt row — see the schema's Receipt doc comment for why.
  const site = await getPublicSiteSettings()
  return {
    receiptNumber: receipt.receiptNumber,
    type: receipt.type,
    createdAt: receipt.createdAt,
    paymentMethod: receipt.paymentMethod,
    transactionRef: null,
    customerName,
    lineItems: receipt.lineItems as ReceiptLineItem[],
    subtotal: receipt.subtotal != null ? Number(receipt.subtotal) : null,
    adjustments: (receipt.adjustments as ReceiptAdjustment[] | null) ?? [],
    totalAmount: Number(receipt.totalAmount),
    currency: receipt.currency,
    balanceAfter: null,
    logoDataUrl: site.logoUrl,
    supportEmail: site.supportEmail,
    supportPhone: site.supportPhone,
    address: site.address,
    verifyUrl: `${siteOrigin()}/verify?receipt=${receipt.receiptNumber}`,
  }
}

/**
 * Creates the snapshot Receipt row, generates its PDF (logo/contact read
 * live at generation time — see buildPdfData), and emails it as an
 * attachment. Best-effort by design, wrapped in try/catch so a PDF/email
 * failure can never break the real payment/deposit/withdrawal flow that
 * triggered it — same convention as emailUser. Deliberately NOT gated by
 * the emailDigest preference emailUser checks: a receipt is a transaction
 * record the customer is owed, not an optional update.
 */


export type PublicReceiptView = {
  receiptNumber: string
  type: "PAYMENT" | "DEPOSIT" | "WITHDRAWAL"
  createdAt: string
  customerName: string
  paymentMethod: string | null
  transactionRef: string | null
  lineItems: ReceiptLineItem[]
  subtotal: number | null
  adjustments: ReceiptAdjustment[]
  totalAmount: number
  currency: string
  balanceAfter: number | null
} | null

/** Public, unauthenticated lookup for /verify — the whole point is someone
 * without a session (or logged into a different account) can confirm a
 * receipt is real by its number or QR code, the same way a paper receipt
 * verification portal works. */
export async function getReceiptByNumber(receiptNumber: string): Promise<PublicReceiptView> {
  const normalized = receiptNumber.trim().toUpperCase()
  if (!/^SAJ-\d{8}-[A-Z0-9]+$/.test(normalized)) return null
  const limit = await checkRateLimit(`receipt:${await getClientIp()}`, "receipt", 30, 60_000)
  if (!limit.allowed) return null

  const receipt = await db.receipt.findUnique({ where: { receiptNumber: normalized }, include: { user: true } })
  if (!receipt) return null
  if (!/^SAJ-\d{8}-[A-F0-9]{48}$/.test(normalized)) {
    const session = await auth()
    if (session?.user?.id !== receipt.userId) return null
  }

  return {
    receiptNumber: receipt.receiptNumber,
    type: receipt.type,
    createdAt: receipt.createdAt.toISOString(),
    customerName: "Customer",
    paymentMethod: receipt.paymentMethod,
    transactionRef: null,
    lineItems: receipt.lineItems as ReceiptLineItem[],
    subtotal: receipt.subtotal != null ? Number(receipt.subtotal) : null,
    adjustments: (receipt.adjustments as ReceiptAdjustment[] | null) ?? [],
    totalAmount: Number(receipt.totalAmount),
    currency: receipt.currency,
    balanceAfter: null,
  }
}

/** Regenerates the PDF on demand (download button on /verify, or the
 * route handler backing it) — never cached, so it always reflects the
 * live logo/contact info same as the emailed copy did at send time. */
export async function getReceiptPdfBuffer(receiptNumber: string): Promise<Buffer | null> {
  const normalized = receiptNumber.trim().toUpperCase()
  if (!/^SAJ-\d{8}-[A-Z0-9]+$/.test(normalized)) return null
  const limit = await checkRateLimit(`receipt:${await getClientIp()}`, "receipt", 30, 60_000)
  if (!limit.allowed) return null

  const receipt = await db.receipt.findUnique({ where: { receiptNumber: normalized }, include: { user: true } })
  if (!receipt) return null
  if (!/^SAJ-\d{8}-[A-F0-9]{48}$/.test(normalized)) {
    const session = await auth()
    if (session?.user?.id !== receipt.userId) return null
  }

  const pdfData = await buildPdfData({ ...receipt, transactionRef: null, balanceAfter: null }, "Customer")
  return generateReceiptPdf(pdfData)
}
