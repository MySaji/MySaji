import { randomBytes } from "node:crypto"

import "server-only"

import { db } from "@/backend/db"

import { sendEmail } from "@/backend/services/email"

import { wrapEmailLayout, emailButton, siteOrigin } from "@/backend/services/email-templates"

import { getPublicSiteSettings } from "@/backend/actions/admin-settings"

import { generateReceiptPdf, type ReceiptLineItem, type ReceiptPdfData } from "@/backend/services/receipt-pdf"

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
