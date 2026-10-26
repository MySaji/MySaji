"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, AlertTriangle, RotateCcw, Printer, Loader2 } from "lucide-react"
import { receiptVat } from "@/backend/domain/pos-receipt-details"
import type { Receipt } from "@/backend/actions/pos-sales"
import {
  printReceipt, receiptQrSvg, autoPrintEnabled, setAutoPrint, type PrintableReceipt,
} from "@/frontend/lib/receipt-print"

/**
 * The receipt, on screen.
 *
 * Narrow and monospaced on purpose: a shopkeeper comparing this against a
 * printed slip should be looking at the same shape, and a thermal printer is
 * 32 or 48 columns of fixed-width text. When printing arrives this layout is
 * what it mirrors, so getting the column discipline right now avoids a
 * redesign then.
 *
 * MONEY IS SHOWN IN SHILLINGS, ALWAYS.
 *
 * Every other page in this app formats money through useLocalization, which
 * converts KES into the viewer's chosen display currency. That is right for
 * browsing and wrong at a counter: the cashier is holding shillings and
 * counting change in shillings, and a till that says "$6.77" while the
 * customer hands over a thousand-shilling note is a till that causes losses.
 * So these are formatted directly, with no conversion, and the receipt says
 * KSh so nobody has to assume.
 */

function sh(n: number): string {
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash", MPESA: "M-Pesa", CARD: "Card", BANK: "Bank", CREDIT: "On credit", SPLIT: "Split",
}

/** What the printer needs, out of what the server returned. */
function toPrintable(receipt: Receipt, payTo: string | null, copyLabel: string | null): PrintableReceipt {
  return {
    shopName: receipt.shopName,
    header: receipt.header,
    footer: receipt.footer,
    taxPin: receipt.taxPin,
    payTo,
    saleNumber: receipt.saleNumber,
    occurredAt: receipt.occurredAt,
    cashierName: receipt.cashierName,
    customerName: receipt.customerName,
    customerPhone: receipt.customerPhone,
    loyalty: receipt.loyalty,
    lines: receipt.lines.map((l) => ({
      name: l.name,
      variantLabel: l.variantLabel,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPrice: l.unitPrice,
      lineTotal: l.totalPrice,
    })),
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    tax: receipt.tax,
    taxRate: receipt.taxRate,
    total: receipt.total,
    payments: receipt.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference })),
    amountPaid: receipt.amountPaid,
    change: receipt.changeGiven,
    copyLabel,
  }
}

export function TillReceipt({
  receipt,
  onNewSale,
  onVoid,
  payTo = null,
  autoPrintOnce = false,
}: {
  receipt: Receipt
  onNewSale?: () => void
  onVoid?: () => void
  /** "Paybill 400200, account DUKA01", printed so a customer can query it. */
  payTo?: string | null
  autoPrintOnce?: boolean
}) {
  const when = new Date(receipt.occurredAt)

  const [auto, setAuto] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printed, setPrinted] = useState(false)
  const [printFailed, setPrintFailed] = useState(false)
  // Guards the automatic print, which must happen once per sale and not
  // again on every re-render. A till that reprints each time React updates
  // would bury the counter in paper.
  const autoDone = useRef<string | null>(null)

  useEffect(() => { setAuto(autoPrintEnabled()) }, [])

  const doPrint = useCallback(async (isCopy: boolean) => {
    setPrinting(true)
    setPrintFailed(false)
    const ok = await printReceipt(toPrintable(receipt, payTo, isCopy ? "copy" : null))
    setPrinting(false)
    if (ok) setPrinted(true)
    else setPrintFailed(true)
  }, [receipt, payTo])

  // Print the moment the sale lands, where this device has a printer.
  //
  // A replayed sale is NOT reprinted: that is the same sale arriving twice
  // because a queued request went through, and the customer already has the
  // slip. Printing again would suggest a second sale happened.
  useEffect(() => {
    if (!auto && !autoPrintOnce) return
    if (receipt.replayed) return
    if (autoDone.current === receipt.saleId) return
    autoDone.current = receipt.saleId
    void doPrint(false)
  }, [auto, autoPrintOnce, receipt.replayed, receipt.saleId, doPrint])

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* The outcome, before the detail. A cashier with a queue needs the
          change figure and nothing else; the itemisation is for the customer
          who asks. */}
      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-center">
        <div className="mx-auto w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center">
          {receipt.replayed ? <RotateCcw className="w-5 h-5" /> : <Check className="w-5 h-5" strokeWidth={3} />}
        </div>
        <p className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          {receipt.replayed ? "Already recorded" : "Sale recorded"}
        </p>
        {receipt.changeGiven > 0 ? (
          <>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-emerald-700/70 dark:text-emerald-400/70">Change</p>
            <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
              KSh {sh(receipt.changeGiven)}
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-emerald-700/70 dark:text-emerald-400/70">Total</p>
            <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
              KSh {sh(receipt.total)}
            </p>
          </>
        )}
        {receipt.replayed && (
          <p className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 leading-snug">
            This sale had already gone through, so it was not charged again.
          </p>
        )}
      </div>

      {/* Stock warnings are NOT buried. A WARN-policy shop that has just sold
          into negative stock needs to know now, while the item is in front of
          them, not at close of day. */}
      {receipt.stockWarnings.length > 0 && (
        <div className="mt-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" /> Stock went below zero
          </p>
          <ul className="mt-1 space-y-0.5">
            {receipt.stockWarnings.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* The slip itself. */}
      <div className="mt-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 font-mono text-[11px] text-gray-900 dark:text-gray-100">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wide">{receipt.shopName}</p>
          {receipt.header && receipt.header !== receipt.shopName && <p className="mt-1 text-[10px]">{receipt.header}</p>}
          <p className="mt-1 text-[10px]">SALES RECEIPT</p>
          {receipt.taxPin && <p className="mt-0.5 text-[10px] text-gray-500">PIN: {receipt.taxPin}</p>}
        </div>

        <div className="mt-2.5 border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 space-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          <div className="flex justify-between"><span>Receipt</span><span className="tabular-nums">#{receipt.saleNumber}</span></div>
          <div className="flex justify-between">
            <span>{when.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}</span>
            <span>{when.toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {receipt.cashierName && <div className="flex justify-between"><span>Served by</span><span>{receipt.cashierName}</span></div>}
          {receipt.customerName && <div className="flex justify-between"><span>Customer</span><span>{receipt.customerName}</span></div>}
          {receipt.customerPhone && <div className="flex justify-between"><span>Phone</span><span>{receipt.customerPhone}</span></div>}
        </div>

        <div className="mt-2.5 border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 space-y-1.5">
          {receipt.lines.map((line, i) => (
            <div key={i}>
              <p className="leading-tight">
                {line.name}
                {line.variantLabel && <span className="text-gray-600"> &middot; {line.variantLabel}</span>}
              </p>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                {/* The quantity keeps the scale it was sold at: 1.35 kg reads
                    as 1.35, and 2 pieces reads as 2, not 2.000. */}
                <span className="tabular-nums">
                  {line.quantity}{line.unit === "piece" ? "" : ` ${line.unit}`} &times; {sh(line.unitPrice)}
                  {line.priceOverridden && <span className="ml-1 text-[9px] uppercase">(price set)</span>}
                </span>
                <span className="tabular-nums">{sh(line.totalPrice)}</span>
              </div>
              {line.lineDiscount > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>  less discount</span>
                  <span className="tabular-nums">-{sh(line.lineDiscount)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2.5 border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 space-y-0.5">
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Subtotal</span><span className="tabular-nums">{sh(receipt.subtotal)}</span>
          </div>
          {receipt.discount > 0 && (
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Discount</span><span className="tabular-nums">-{sh(receipt.discount)}</span>
            </div>
          )}
          {(receipt.taxRate > 0 || receipt.tax > 0) && <>
            <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Amount excl. VAT</span><span>{sh(receiptVat(receipt.total, receipt.tax).net)}</span></div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>VAT{receipt.taxRate > 0 ? ` ${receipt.taxRate}%` : ""}</span><span className="tabular-nums">{sh(receipt.tax)}</span></div>
            <p className="text-[9px] text-gray-500">VAT is included in the total.</p>
          </>}
          <div className="flex justify-between pt-1 text-sm font-bold">
            <span>TOTAL</span><span className="tabular-nums">KSh {sh(receipt.total)}</span>
          </div>
        </div>

        <div className="mt-2.5 border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 space-y-0.5 text-gray-600 dark:text-gray-400">
          {receipt.payments.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span>{METHOD_LABEL[p.method] ?? p.method}{p.reference ? ` ${p.reference}` : ""}</span>
              <span className="tabular-nums">{sh(p.amount)}</span>
            </div>
          ))}
          {receipt.changeGiven > 0 && (
            <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100">
              <span>Change</span><span className="tabular-nums">{sh(receipt.changeGiven)}</span>
            </div>
          )}
        </div>

        {receipt.loyalty && <div className="mt-3 space-y-1 border-t border-dashed border-gray-300 pt-3"><p className="text-center font-bold">CUSTOMER LOYALTY</p><div className="flex justify-between"><span>Points added</span><span>{receipt.loyalty.earned}</span></div><div className="flex justify-between"><span>Points redeemed</span><span>{receipt.loyalty.redeemed}</span></div><div className="flex justify-between font-bold"><span>Total points</span><span>{receipt.loyalty.balance}</span></div><p className="text-[9px] text-gray-500">Balance after this sale</p></div>}
        {receipt.footer && (
          <p className="mt-2.5 border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 text-center text-[10px] text-gray-500 leading-snug">
            {receipt.footer}
          </p>
        )}
      </div>

      <div className="my-3 text-center"><img alt="Receipt details QR code" width={132} height={132} className="mx-auto" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(receiptQrSvg(receipt))}`} /><p className="mt-1 text-[10px] text-muted-foreground">Scan for receipt details</p></div>

      {/* What the printer did, said out loud.
          A cashier needs to know whether paper came out without having to
          look at the machine, and needs a way to try again when it did not.
          Silence here is how a customer leaves without a slip. */}
      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug min-w-0 flex-1">
          {printing
            ? "Printing..."
            : printFailed
              ? "It did not print. Try the button."
              : printed
                ? "Printed."
                : auto
                  ? "Waiting for the printer..."
                  : "Automatic printing is off for this device."}
        </span>
        <button
          onClick={() => void doPrint(printed)}
          disabled={printing}
          aria-label={printed ? "Print another copy" : "Print the receipt"}
          className={`h-11 px-3 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50 flex-shrink-0 ${
            printFailed
              ? "border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400"
              : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
          }`}
        >
          {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
          {printed ? "Print again" : "Print"}
        </button>
      </div>

      <label className="mt-1.5 flex items-center gap-2 px-1 cursor-pointer">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => { setAuto(e.target.checked); setAutoPrint(e.target.checked) }}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          Print every sale automatically on this device
        </span>
      </label>

      <div className="mt-3 flex gap-2">
        {onNewSale && (
          <button
            onClick={onNewSale}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] transition-transform"
          >
            Next sale
          </button>
        )}
        {onVoid && !receipt.replayed && (
          <button
            onClick={onVoid}
            className="h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-600 dark:text-gray-300 active:scale-[0.98] transition-transform"
          >
            Void
          </button>
        )}
      </div>
    </div>
  )
}
