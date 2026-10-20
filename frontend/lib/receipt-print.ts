import { receiptVat, type ReceiptLoyalty } from "@/backend/domain/pos-receipt-details"

/**
 * Getting a receipt out of a thermal printer.
 *
 * WHAT A BROWSER CAN AND CANNOT DO
 *
 * A web page cannot talk to a USB printer directly, and it cannot print
 * without the operating system being involved. What it CAN do is hand the
 * OS a page sized for 80mm paper and ask it to print, which is how a
 * receipt printer set as the default printer ends up producing a slip.
 *
 * So "automatic printing" here means: the moment a sale completes, the
 * receipt is rendered at thermal width and sent to the printer the machine
 * already has. On a counter PC with the printer set as default and the
 * browser's print dialog suppressed (Chrome's kiosk-printing flag), that is
 * genuinely automatic. Without those, the OS shows its dialog, which is why
 * there is ALWAYS a print button as well.
 *
 * WHY A HIDDEN IFRAME AND NOT window.print()
 *
 * window.print() prints the whole page: the sidebar, the search box, the
 * basket. Even with print CSS hiding them, one stray element leaves a blank
 * second page, and a thermal roll does not fold, it just keeps coming. An
 * iframe containing ONLY the slip cannot do that.
 *
 * ESC/POS is deliberately not attempted. It needs a local agent or WebUSB
 * and a driver per printer model, which is a support burden a duka should
 * not carry to print a receipt.
 */

export type PrintableLine = {
  name: string
  variantLabel?: string | null
  quantity: number
  unit: string
  unitPrice: number
  lineTotal: number
}

export type PrintablePayment = {
  method: string
  amount: number
  reference?: string | null
  /** Safaricom confirmed it, as opposed to a cashier typing a code in. */
  confirmed?: boolean
}

/**
 * What KRA signed, where they have.
 *
 * All of it has to appear on the slip for it to be a tax invoice: their
 * receipt number, the control unit's signature and internal data, and the
 * timestamp THEY stamped, which is not necessarily when the sale happened.
 */
export type PrintableEtims = {
  invoiceNumber: string
  receiptNumber: string
  receiptSignature: string
  internalData: string
  sdcDateTime: string
  verificationUrl?: string | null
  tin: string
  branchId: string
}

export type PrintableReceipt = {
  shopName: string
  header?: string | null
  footer?: string | null
  taxPin?: string | null
  /** The shop's paybill or till, so a customer can pay later or query it. */
  payTo?: string | null
  /**
   * KRA's signature, where this sale has been declared and signed.
   *
   * Absent in two different situations that must not look alike on paper: a
   * shop that does not file at all, and a shop that does but whose invoice
   * has not been signed yet. `etimsPending` tells them apart.
   */
  etims?: PrintableEtims | null
  /** True where the shop files but KRA have not answered for this sale yet. */
  etimsPending?: boolean
  saleNumber: string
  occurredAt: string
  cashierName?: string | null
  customerName?: string | null
  customerPhone?: string | null
  loyalty?: ReceiptLoyalty | null
  lines: PrintableLine[]
  subtotal: number
  discount: number
  tax: number
  taxRate?: number
  total: number
  payments: PrintablePayment[]
  amountPaid: number
  change: number
  /** Printed under the total when this is a copy rather than the original. */
  copyLabel?: string | null
}

const COLS = 32

function sh(n: number): string {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Left text, right figure, padded to the roll's width. */
function row(left: string, right: string): string {
  const space = Math.max(1, COLS - left.length - right.length)
  return esc(left + " ".repeat(space) + right)
}

function rule(ch = "-"): string {
  return ch.repeat(COLS)
}

/**
 * The slip, as plain monospaced text inside a minimal document.
 *
 * Deliberately not styled with the app's CSS: a thermal printer renders
 * black on white at one font, and anything else either fails to print or
 * wastes paper.
 */
export function receiptHtml(r: PrintableReceipt): string {
  const when = new Date(r.occurredAt)
  const body: string[] = []

  body.push(esc((r.header || r.shopName).toUpperCase()))
  if (r.taxPin) body.push(esc("PIN: " + r.taxPin))
  if (r.payTo) body.push(esc(r.payTo))
  body.push(rule("="))
  body.push(esc("Receipt: " + r.saleNumber))
  body.push(esc(when.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })))
  if (r.cashierName) body.push(esc("Served by: " + r.cashierName))
  if (r.customerName) body.push(esc("Customer: " + r.customerName))
  if (r.customerPhone) body.push(esc("Customer phone: " + r.customerPhone))
  body.push(rule())

  for (const l of r.lines) {
    const label = l.variantLabel ? l.name + " (" + l.variantLabel + ")" : l.name
    body.push(esc(label))
    // The arithmetic a customer checks, laid out so it can be checked.
    const qty = Number.isInteger(l.quantity) ? String(l.quantity) : l.quantity.toFixed(3)
    body.push(row("  " + qty + " " + l.unit + " x " + sh(l.unitPrice), sh(l.lineTotal)))
  }

  body.push(rule())
  body.push(row("Subtotal", sh(r.subtotal)))
  if (r.discount > 0) body.push(row("Discount", "-" + sh(r.discount)))
  if (r.tax > 0 || (r.taxRate ?? 0) > 0) {
    body.push(row("Amount excl. VAT", sh(receiptVat(r.total, r.tax).net)))
    body.push(row("VAT" + (r.taxRate ? " " + r.taxRate + "%" : ""), sh(r.tax)))
    body.push(esc("VAT is included in the total."))
  }
  body.push(rule("="))
  body.push(row("TOTAL", "KSh " + sh(r.total)))
  body.push(rule("="))

  for (const p of r.payments) {
    body.push(row(p.method + (p.confirmed ? " (confirmed)" : ""), sh(p.amount)))
    if (p.reference) body.push(esc("  " + p.reference))
  }
  if (r.change > 0) body.push(row("Change", sh(r.change)))

  if (r.loyalty) {
    body.push(rule())
    body.push(esc("CUSTOMER LOYALTY"))
    body.push(row("Points added", String(r.loyalty.earned)))
    body.push(row("Points redeemed", String(r.loyalty.redeemed)))
    body.push(row("Total points", String(r.loyalty.balance)))
    body.push(esc("Balance after this sale"))
  }

  if (r.copyLabel) {
    body.push("")
    body.push(esc("*** " + r.copyLabel.toUpperCase() + " ***"))
  }

  // --- KRA ---------------------------------------------------------------
  //
  // A signed invoice prints everything KRA require. An unsigned one says so
  // plainly instead, because a slip that merely omits the block looks exactly
  // like a compliant receipt to anyone glancing at it, and is not one.
  if (r.etims) {
    body.push("")
    body.push(rule())
    body.push(esc("TAX INVOICE"))
    body.push(esc("PIN: " + r.etims.tin + "  BHF: " + r.etims.branchId))
    body.push(esc("Invoice: " + r.etims.invoiceNumber))
    body.push(esc("CU Receipt: " + r.etims.receiptNumber))
    body.push(esc("CU Sign: " + r.etims.receiptSignature))
    if (r.etims.internalData) body.push(esc("Internal: " + r.etims.internalData))
    body.push(esc("CU Date: " + new Date(r.etims.sdcDateTime).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })))
    if (r.etims.verificationUrl) {
      body.push(esc("Verify:"))
      body.push(esc(r.etims.verificationUrl))
    }
  } else if (r.etimsPending) {
    body.push("")
    body.push(rule())
    body.push(esc("NOT YET A TAX INVOICE"))
    body.push(esc("Waiting for KRA to sign it."))
    body.push(esc("Ask for a reprint once it is."))
  }

  body.push("")
  if (r.footer) body.push(esc(r.footer))
  body.push(esc("Thank you"))
  body.push("")
  body.push("")

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(r.saleNumber)}</title>
<style>
  /* 80mm roll. The margin is zero because the printer owns its own, and a
     browser margin on top of it pushes the slip off the paper. */
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  pre {
    margin: 0;
    padding: 4mm 3mm;
    font-family: "Courier New", ui-monospace, monospace;
    font-size: 11pt;
    line-height: 1.25;
    color: #000;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style></head>
<body><pre>${body.join("\n")}</pre></body></html>`
}

/**
 * Send one slip to the printer.
 *
 * Resolves once the print has been handed to the OS, or immediately if the
 * browser refused. It never throws: a sale must not fail because a printer
 * did not answer, and the till keeps a button to try again.
 */
export function printReceipt(r: PrintableReceipt): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") { resolve(false); return }

    let frame: HTMLIFrameElement | null = null
    const cleanup = () => {
      // Left in place briefly: removing it the instant print() returns can
      // cancel the job on some platforms.
      window.setTimeout(() => { try { frame?.remove() } catch { /* gone already */ } }, 2000)
    }

    try {
      frame = document.createElement("iframe")
      frame.setAttribute("aria-hidden", "true")
      frame.style.position = "fixed"
      frame.style.right = "0"
      frame.style.bottom = "0"
      frame.style.width = "0"
      frame.style.height = "0"
      frame.style.border = "0"
      frame.style.visibility = "hidden"
      document.body.appendChild(frame)

      const doc = frame.contentDocument
      if (!doc) { cleanup(); resolve(false); return }
      doc.open()
      doc.write(receiptHtml(r))
      doc.close()

      const go = () => {
        try {
          frame?.contentWindow?.focus()
          frame?.contentWindow?.print()
          cleanup()
          resolve(true)
        } catch {
          cleanup()
          resolve(false)
        }
      }

      // Give the document a tick to lay out; printing an empty frame is the
      // commonest way this silently produces a blank slip.
      if (frame.contentWindow?.document.readyState === "complete") window.setTimeout(go, 60)
      else frame.onload = () => window.setTimeout(go, 60)
    } catch {
      cleanup()
      resolve(false)
    }
  })
}

const AUTO_KEY = "saji.till.autoprint"

/** Whether this device prints automatically. Per device, not per shop: one counter has a printer and another does not. */
export function autoPrintEnabled(): boolean {
  try {
    const v = localStorage.getItem(AUTO_KEY)
    // On by default where a shop has a printer at all. A till that has to be
    // told to print every sale is a till nobody uses the printer with.
    return v === null ? true : v === "1"
  } catch {
    return false
  }
}

export function setAutoPrint(on: boolean): void {
  try { localStorage.setItem(AUTO_KEY, on ? "1" : "0") } catch { /* private window */ }
}
