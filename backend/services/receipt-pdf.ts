// PDF generation for Receipt rows (see prisma/schema.prisma Receipt model
// doc comment). Not a "use server" file — it's a plain rendering module
// called from lib/actions/receipts.ts (email attachment) and the
// /api/receipts/[receiptNumber] route handler (browser download), neither
// of which needs this to be a server action itself.
//
// jsPDF has a real Node build (package.json "main": dist/jspdf.node.min.js)
// so this runs server-side with no headless-browser dependency — the same
// import shape already used client-side in app/admin/users/page.tsx.
import jsPDF from "jspdf"
import QRCode from "qrcode"
import { readFileSync } from "fs"
import path from "path"

export type ReceiptLineItem = { label: string; description?: string | null; quantity: number; amount: number }

export type ReceiptPdfData = {
  receiptNumber: string
  type: "PAYMENT" | "DEPOSIT" | "WITHDRAWAL"
  createdAt: Date
  paymentMethod: string | null
  transactionRef: string | null
  customerName: string
  lineItems: ReceiptLineItem[]
  subtotal: number | null
  adjustments: { label: string; amount: number }[]
  totalAmount: number
  currency: string
  balanceAfter: number | null
  // Always read live (see the Receipt model's doc comment) — never stored
  // on the Receipt row itself, so an admin changing the logo/contact info
  // updates every past receipt, not just future ones.
  logoDataUrl: string | null
  supportEmail: string
  supportPhone: string
  address: string
  verifyUrl: string
}

const BRAND_GREEN: [number, number, number] = [22, 101, 52] // emerald-800-ish, matches the reference receipt
const BRAND_GREEN_LIGHT: [number, number, number] = [236, 253, 245]
const BRAND_PURPLE: [number, number, number] = [107, 33, 168]
const BRAND_PURPLE_LIGHT: [number, number, number] = [245, 237, 254]
const GRAY_TEXT: [number, number, number] = [107, 114, 128]
const DARK_TEXT: [number, number, number] = [17, 24, 39]
const PAGE_WIDTH = 595.28 // A4 @ 72dpi points
const MARGIN = 44

// The real SAJI app icon (public/icon-512.png — same file used for the PWA
// manifest/app icon) — the fallback logo whenever no admin-uploaded logo is
// configured, so a receipt never ships with a generic placeholder mark.
// Read once and cached, not per-PDF: this file never changes at runtime.
let cachedAppIconDataUrl: string | null | undefined

function appIconDataUrl(): string | null {
  if (cachedAppIconDataUrl !== undefined) return cachedAppIconDataUrl
  try {
    const bytes = readFileSync(path.join(process.cwd(), "public", "icon-512.png"))
    cachedAppIconDataUrl = `data:image/png;base64,${bytes.toString("base64")}`
  } catch {
    cachedAppIconDataUrl = null
  }
  return cachedAppIconDataUrl
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
const CURRENCY_WORDS: Record<string, string> = { KES: "Kenya Shillings", USD: "US Dollars", EUR: "Euros", GBP: "British Pounds" }

function threeDigitsToWords(n: number): string {
  let out = ""
  if (n >= 100) {
    out += `${ONES[Math.floor(n / 100)]} Hundred `
    n %= 100
  }
  if (n >= 20) {
    out += `${TENS[Math.floor(n / 10)]} `
    n %= 10
  }
  if (n > 0) out += `${ONES[n]} `
  return out.trim()
}

/** Whole-number-of-currency-units to words (cents are dropped, matching
 * the reference receipt's "Six Thousand Three Hundred Kenya Shillings
 * Only" style — this app never deals in sub-unit KES amounts anyway). */
export function amountToWords(amount: number, currency: string): string {
  let n = Math.round(amount)
  if (n === 0) return `Zero ${CURRENCY_WORDS[currency] ?? currency} Only`

  const groups = ["", "Thousand", "Million", "Billion"]
  const parts: string[] = []
  let groupIndex = 0
  while (n > 0) {
    const chunk = n % 1000
    if (chunk > 0) {
      parts.unshift(`${threeDigitsToWords(chunk)} ${groups[groupIndex]}`.trim())
    }
    n = Math.floor(n / 1000)
    groupIndex++
  }
  return `${parts.join(" ")} ${CURRENCY_WORDS[currency] ?? currency} Only`
}

async function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#111827", light: "#ffffff" } })
}

/** Admin-uploaded logo when set (same source BrandLogo uses everywhere
 * else in the app); otherwise the real SAJI app icon file — never the
 * hand-drawn placeholder a receipt shouldn't ship with. */
function drawWordmark(doc: jsPDF, data: ReceiptPdfData, x: number, y: number, boxSize: number) {
  const image = data.logoDataUrl ?? appIconDataUrl()
  if (image) {
    try {
      doc.addImage(image, x, y, boxSize, boxSize, undefined, "FAST")
      return
    } catch {
      // fall through to the vector mark below
    }
  }
  drawFallbackMark(doc, x, y, boxSize)
}

/** Last-resort vector mark (a rounded green square with a white "S") —
 * only reached if even the bundled app icon file can't be read, mirroring
 * BrandLogo's own React fallback drawn instead of rendered. */
function drawFallbackMark(doc: jsPDF, x: number, y: number, size: number) {
  doc.setFillColor(...BRAND_GREEN)
  doc.roundedRect(x, y, size, size, size * 0.2, size * 0.2, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(size * 0.55)
  doc.text("S", x + size / 2, y + size / 2 + size * 0.19, { align: "center" })
}

function kvRow(doc: jsPDF, label: string, value: string, x: number, y: number, labelWidth: number) {
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(...GRAY_TEXT)
  doc.text(label, x, y)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...DARK_TEXT)
  doc.text(value, x + labelWidth, y)
}

/** The "Payment Receipt" style (image 1) — one payment that may cover
 * several vendors' line items in one checkout (the Smart Cart / Checkout
 * Splitter), or a single service booking. */
function renderPaymentReceipt(doc: jsPDF, data: ReceiptPdfData, qr: string) {
  let y = 50

  drawWordmark(doc, data, MARGIN, y, 40)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(...BRAND_GREEN)
  doc.text("SAJI", MARGIN + 50, y + 18)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...GRAY_TEXT)
  doc.text("Your Marketplace, Your Way", MARGIN + 50, y + 31)

  // "PAID" status pill, top-right — standard receipt/invoice convention
  // that was previously missing entirely.
  const pillW = 64, pillH = 22
  doc.setFillColor(...BRAND_GREEN_LIGHT)
  doc.roundedRect(PAGE_WIDTH - MARGIN - pillW, y, pillW, pillH, pillH / 2, pillH / 2, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...BRAND_GREEN)
  doc.text("PAID", PAGE_WIDTH - MARGIN - pillW / 2, y + pillH / 2 + 3.5, { align: "center" })

  y += 62
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(...DARK_TEXT)
  doc.text("PAYMENT RECEIPT", PAGE_WIDTH / 2, y, { align: "center" })

  y += 24
  doc.setDrawColor(229, 231, 235)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 22

  const rightColX = PAGE_WIDTH / 2 + 10
  const leftTop = y
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY_TEXT)
  doc.text("FROM", MARGIN, y)
  y += 13
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...DARK_TEXT)
  doc.text("SAJI Marketplace", MARGIN, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...GRAY_TEXT)
  y += 14
  doc.text(data.address, MARGIN, y)
  y += 13
  doc.text(`${data.supportEmail}  |  ${data.supportPhone}`, MARGIN, y)

  y += 20
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY_TEXT)
  doc.text("BILLED TO", MARGIN, y)
  y += 13
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...DARK_TEXT)
  doc.text(data.customerName, MARGIN, y)

  let ry = leftTop
  kvRow(doc, "Receipt No.", data.receiptNumber, rightColX, ry, 78)
  ry += 14
  kvRow(doc, "Date & Time", data.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }), rightColX, ry, 78)
  ry += 14
  kvRow(doc, "Payment Method", data.paymentMethod ?? "Wallet", rightColX, ry, 78)
  ry += 14
  if (data.transactionRef) kvRow(doc, "Transaction ID", data.transactionRef, rightColX, ry, 78)

  y = Math.max(y, ry) + 24
  doc.setDrawColor(229, 231, 235)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 22

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...BRAND_GREEN)
  doc.text("ORDER SUMMARY", MARGIN, y)
  y += 18

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...GRAY_TEXT)
  doc.text("Item", MARGIN, y)
  doc.text("Qty", PAGE_WIDTH - MARGIN - 110, y, { align: "center" })
  doc.text("Amount", PAGE_WIDTH - MARGIN, y, { align: "right" })
  y += 8
  doc.setDrawColor(229, 231, 235)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 18

  for (const item of data.lineItems) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10.5)
    doc.setTextColor(...DARK_TEXT)
    doc.text(item.label, MARGIN, y)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...GRAY_TEXT)
    doc.text(String(item.quantity), PAGE_WIDTH - MARGIN - 110, y, { align: "center" })
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...DARK_TEXT)
    doc.text(formatMoney(item.amount, data.currency), PAGE_WIDTH - MARGIN, y, { align: "right" })
    if (item.description) {
      y += 13
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(...GRAY_TEXT)
      doc.text(item.description, MARGIN, y)
    }
    y += 20
  }

  y += 4
  doc.setDrawColor(229, 231, 235)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 20

  const summaryLabelX = PAGE_WIDTH - MARGIN - 160
  if (data.subtotal != null) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(...GRAY_TEXT)
    doc.text("Subtotal", summaryLabelX, y)
    doc.setTextColor(...DARK_TEXT)
    doc.text(formatMoney(data.subtotal, data.currency), PAGE_WIDTH - MARGIN, y, { align: "right" })
    y += 16
  }
  for (const adjustment of data.adjustments) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(...GRAY_TEXT)
    doc.text(adjustment.label, summaryLabelX, y)
    doc.setTextColor(...DARK_TEXT)
    doc.text(`${adjustment.amount < 0 ? "-" : ""}${formatMoney(Math.abs(adjustment.amount), data.currency)}`, PAGE_WIDTH - MARGIN, y, { align: "right" })
    y += 16
  }
  doc.setDrawColor(209, 213, 219)
  doc.line(summaryLabelX, y, PAGE_WIDTH - MARGIN, y)
  y += 18
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(...DARK_TEXT)
  doc.text("TOTAL PAID", summaryLabelX, y)
  doc.setTextColor(...BRAND_GREEN)
  doc.setFontSize(14)
  doc.text(formatMoney(data.totalAmount, data.currency), PAGE_WIDTH - MARGIN, y, { align: "right" })

  y += 34
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...DARK_TEXT)
  doc.text("Amount in Words:", MARGIN, y)
  y += 14
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)
  doc.setTextColor(...GRAY_TEXT)
  const wordsLines = doc.splitTextToSize(amountToWords(data.totalAmount, data.currency), PAGE_WIDTH - MARGIN * 2)
  doc.text(wordsLines, MARGIN, y)
  y += wordsLines.length * 12 + 16

  const boxHeight = 46
  doc.setFillColor(...BRAND_GREEN_LIGHT)
  doc.roundedRect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, boxHeight, 8, 8, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.setTextColor(...BRAND_GREEN)
  doc.text("Thank you for using SAJI!", MARGIN + 16, y + 18)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY_TEXT)
  doc.text("Your payment is secure. All transactions on SAJI are protected by our Buyer Protection Policy.", MARGIN + 16, y + 32)
  y += boxHeight + 26

  drawVerifyFooter(doc, data, qr, y)
}

/** The "Deposit / Withdraw Receipt" style (image 2) — given the same
 * header weight as the Payment Receipt (logo, wordmark, tagline, a bold
 * document title) rather than the old thin colour strip, just set inside
 * a full accent-coloured banner instead of on a white background. */
function renderWalletReceipt(doc: jsPDF, data: ReceiptPdfData, qr: string) {
  const isDeposit = data.type === "DEPOSIT"
  const accent = isDeposit ? BRAND_GREEN : BRAND_PURPLE
  const accentLight = isDeposit ? BRAND_GREEN_LIGHT : BRAND_PURPLE_LIGHT

  const bannerHeight = 138
  doc.setFillColor(...accent)
  doc.rect(0, 0, PAGE_WIDTH, bannerHeight, "F")

  const logoSize = 46
  const logoX = PAGE_WIDTH / 2 - logoSize / 2
  let y = 22
  // White backdrop behind the logo so it reads cleanly against the
  // coloured banner regardless of what the logo image itself looks like.
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(logoX - 5, y - 5, logoSize + 10, logoSize + 10, 12, 12, "F")
  drawWordmark(doc, data, logoX, y, logoSize)

  y += logoSize + 16
  doc.setFont("helvetica", "bold")
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text("SAJI", PAGE_WIDTH / 2, y, { align: "center" })
  y += 13
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text("Your Marketplace, Your Way", PAGE_WIDTH / 2, y, { align: "center" })

  y += 16
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.setTextColor(255, 255, 255)
  doc.text(isDeposit ? "D E P O S I T   R E C E I P T" : "W I T H D R A W A L   R E C E I P T", PAGE_WIDTH / 2, y, { align: "center" })

  y = bannerHeight + 26
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(...accent)
  doc.text(isDeposit ? "DEPOSIT SUCCESSFUL" : "WITHDRAW SUCCESSFUL", PAGE_WIDTH / 2, y, { align: "center" })
  y += 16
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)
  doc.setTextColor(...GRAY_TEXT)
  doc.text(
    isDeposit ? "Your funds have been added to your SAJI Wallet" : "Your funds have been sent successfully",
    PAGE_WIDTH / 2, y, { align: "center" },
  )

  y += 24
  const contentX = MARGIN + 20
  doc.setDrawColor(229, 231, 235)
  doc.line(contentX, y, PAGE_WIDTH - contentX, y)
  y += 22

  // Same FROM / receipt-meta / BILLED TO structure as the Payment Receipt
  // — this was missing entirely before, the wallet receipts only ever had
  // the flat Transaction ID/Date/Method rows further below.
  const rightColX = PAGE_WIDTH / 2 + 10
  const leftTop = y
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY_TEXT)
  doc.text("FROM", contentX, y)
  y += 13
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...DARK_TEXT)
  doc.text("SAJI Marketplace", contentX, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...GRAY_TEXT)
  y += 14
  doc.text(data.address, contentX, y)
  y += 13
  doc.text(`${data.supportEmail}  |  ${data.supportPhone}`, contentX, y)

  y += 20
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY_TEXT)
  doc.text("BILLED TO", contentX, y)
  y += 13
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...DARK_TEXT)
  doc.text(data.customerName, contentX, y)

  let ry = leftTop
  kvRow(doc, "Receipt No.", data.receiptNumber, rightColX, ry, 78)
  ry += 14
  kvRow(doc, "Date & Time", data.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }), rightColX, ry, 78)
  ry += 14
  kvRow(doc, isDeposit ? "Payment Method" : "Withdrawal Method", data.paymentMethod ?? "—", rightColX, ry, 78)
  ry += 14
  if (data.transactionRef) kvRow(doc, "Transaction ID", data.transactionRef, rightColX, ry, 78)

  y = Math.max(y, ry) + 22
  doc.setDrawColor(229, 231, 235)
  doc.line(contentX, y, PAGE_WIDTH - contentX, y)
  y += 22

  const rows: [string, string][] = [
    [isDeposit ? "Amount Deposited" : "Amount Withdrawn", formatMoney(data.totalAmount, data.currency)],
  ]
  if (data.balanceAfter != null) rows.push(["Wallet Balance", formatMoney(data.balanceAfter, data.currency)])

  for (const [label, value] of rows) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(...GRAY_TEXT)
    doc.text(label, contentX, y)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...DARK_TEXT)
    doc.text(value, PAGE_WIDTH - contentX, y, { align: "right" })
    y += 20
  }

  y += 10
  const noticeHeight = 32
  doc.setFillColor(...accentLight)
  doc.roundedRect(contentX, y, PAGE_WIDTH - contentX * 2, noticeHeight, 8, 8, "F")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...accent)
  const noticeText = isDeposit
    ? "This deposit is secure and encrypted. Thank you for using SAJI."
    : "The amount will reflect in your account depending on your provider."
  doc.text(noticeText, PAGE_WIDTH / 2, y + noticeHeight / 2 + 3, { align: "center" })
  y += noticeHeight + 26

  drawVerifyFooter(doc, data, qr, y, true)
}

function drawVerifyFooter(doc: jsPDF, data: ReceiptPdfData, qr: string, y: number, compact = false) {
  const qrSize = compact ? 90 : 100
  const qrX = PAGE_WIDTH / 2 - qrSize / 2

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.setTextColor(...DARK_TEXT)
  doc.text(compact ? "Scan to verify this receipt" : "SCAN TO VIEW RECEIPT DETAILS", PAGE_WIDTH / 2, y, { align: "center" })
  y += 12

  doc.addImage(qr, "PNG", qrX, y, qrSize, qrSize)
  y += qrSize + 16

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY_TEXT)
  doc.text(`or visit: ${data.verifyUrl}`, PAGE_WIDTH / 2, y, { align: "center" })
  y += 12
  doc.text(`Enter Receipt No. ${data.receiptNumber} or scan the QR code`, PAGE_WIDTH / 2, y, { align: "center" })
  y += 20

  doc.setDrawColor(229, 231, 235)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 16
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...GRAY_TEXT)
  // The wallet-receipt (compact) caller already shows a dedicated contact
  // block right above this footer, so it just gets a short sign-off
  // instead of repeating the same email/phone a second time.
  doc.text(
    compact ? "Secure Payments  ·  Thank you!" : `Secure Payments  ·  ${data.supportEmail}  ·  ${data.supportPhone}`,
    PAGE_WIDTH / 2, y, { align: "center" },
  )
}

export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  doc.setProperties({ title: `SAJI Receipt ${data.receiptNumber}` })

  const qr = await qrDataUrl(data.verifyUrl)

  if (data.type === "PAYMENT") {
    renderPaymentReceipt(doc, data, qr)
  } else {
    renderWalletReceipt(doc, data, qr)
  }

  const arrayBuffer = doc.output("arraybuffer")
  return Buffer.from(arrayBuffer)
}
