"use server"

import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { wrapEmailLayout, emailButton, siteOrigin } from "@/lib/email-templates"
import { getPublicSiteSettings } from "@/lib/actions/admin-settings"
import { generateReceiptPdf, type ReceiptLineItem, type ReceiptPdfData } from "@/lib/receipt-pdf"

export type { ReceiptLineItem }

function generateReceiptNumber(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  // Random, not sequential — a receipt number doubles as the public /verify
  // lookup key, so it shouldn't be trivially enumerable.
  const random = Math.floor(10000 + Math.random() * 90000)
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
    transactionRef: receipt.transactionRef,
    customerName,
    lineItems: receipt.lineItems as ReceiptLineItem[],
    subtotal: receipt.subtotal != null ? Number(receipt.subtotal) : null,
    adjustments: (receipt.adjustments as ReceiptAdjustment[] | null) ?? [],
    totalAmount: Number(receipt.totalAmount),
    currency: receipt.currency,
    balanceAfter: receipt.balanceAfter != null ? Number(receipt.balanceAfter) : null,
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
export async function createAndEmailReceipt(input: CreateReceiptInput): Promise<{ receiptNumber: string } | null> {
  try {
    const user = await db.user.findUnique({ where: { id: input.userId } })
    if (!user) return null

    let receiptNumber = generateReceiptNumber()
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await db.receipt.findUnique({ where: { receiptNumber }, select: { id: true } })
      if (!existing) break
      receiptNumber = generateReceiptNumber()
    }

    const receipt = await db.receipt.create({
      data: {
        receiptNumber,
        userId: input.userId,
        type: input.type,
        paymentMethod: input.paymentMethod ?? null,
        transactionRef: input.transactionRef ?? null,
        lineItems: input.lineItems,
        subtotal: input.subtotal ?? undefined,
        adjustments: input.adjustments && input.adjustments.length > 0 ? input.adjustments : undefined,
        totalAmount: input.totalAmount,
        currency: input.currency ?? "KES",
        balanceAfter: input.balanceAfter ?? undefined,
        emailedTo: user.email,
      },
    })

    const pdfData = await buildPdfData(receipt, user.name)
    const pdf = await generateReceiptPdf(pdfData)

    const subject = input.type === "PAYMENT" ? "Your SAJI payment receipt"
      : input.type === "DEPOSIT" ? "Your SAJI wallet deposit receipt"
      : "Your SAJI withdrawal receipt"
    const html = wrapEmailLayout({
      title: subject,
      bodyHtml: `
        <p>Hi ${user.name},</p>
        <p>Your receipt <strong>${receiptNumber}</strong> is attached as a PDF.</p>
        ${emailButton("Verify this receipt", pdfData.verifyUrl)}
      `,
    })
    await sendEmail({
      to: user.email,
      subject,
      html,
      attachments: [{ filename: `SAJI-Receipt-${receiptNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
    })

    return { receiptNumber }
  } catch (err) {
    console.error("createAndEmailReceipt failed:", err)
    return null
  }
}

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
  if (!normalized) return null

  const receipt = await db.receipt.findUnique({ where: { receiptNumber: normalized }, include: { user: true } })
  if (!receipt) return null

  return {
    receiptNumber: receipt.receiptNumber,
    type: receipt.type,
    createdAt: receipt.createdAt.toISOString(),
    customerName: receipt.user.name,
    paymentMethod: receipt.paymentMethod,
    transactionRef: receipt.transactionRef,
    lineItems: receipt.lineItems as ReceiptLineItem[],
    subtotal: receipt.subtotal != null ? Number(receipt.subtotal) : null,
    adjustments: (receipt.adjustments as ReceiptAdjustment[] | null) ?? [],
    totalAmount: Number(receipt.totalAmount),
    currency: receipt.currency,
    balanceAfter: receipt.balanceAfter != null ? Number(receipt.balanceAfter) : null,
  }
}

/** Regenerates the PDF on demand (download button on /verify, or the
 * route handler backing it) — never cached, so it always reflects the
 * live logo/contact info same as the emailed copy did at send time. */
export async function getReceiptPdfBuffer(receiptNumber: string): Promise<Buffer | null> {
  const normalized = receiptNumber.trim().toUpperCase()
  if (!normalized) return null

  const receipt = await db.receipt.findUnique({ where: { receiptNumber: normalized }, include: { user: true } })
  if (!receipt) return null

  const pdfData = await buildPdfData(receipt, receipt.user.name)
  return generateReceiptPdf(pdfData)
}
