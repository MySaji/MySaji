"use client"

import { Check, AlertTriangle, RotateCcw } from "lucide-react"
import type { Receipt } from "@/lib/actions/pos-sales"

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

export function TillReceipt({
  receipt,
  onNewSale,
  onVoid,
}: {
  receipt: Receipt
  onNewSale?: () => void
  onVoid?: () => void
}) {
  const when = new Date(receipt.occurredAt)

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
          <p className="text-xs font-bold uppercase tracking-wide">{receipt.header}</p>
          {receipt.taxPin && <p className="mt-0.5 text-[10px] text-gray-500">PIN: {receipt.taxPin}</p>}
        </div>

        <div className="mt-2.5 border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 space-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          <div className="flex justify-between"><span>Receipt</span><span className="tabular-nums">#{receipt.saleNumber}</span></div>
          <div className="flex justify-between">
            <span>{when.toLocaleDateString("en-KE")}</span>
            <span>{when.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {receipt.cashierName && <div className="flex justify-between"><span>Served by</span><span>{receipt.cashierName}</span></div>}
          {receipt.customerName && <div className="flex justify-between"><span>Customer</span><span>{receipt.customerName}</span></div>}
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
          {receipt.taxRate > 0 && (
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              {/* Labelled as a rate, not as VAT. Nothing here is a tax
                  filing, and a receipt that implies one is a liability. */}
              <span>Tax {receipt.taxRate}%{receipt.taxInclusive ? " (included)" : ""}</span>
              <span className="tabular-nums">{sh(receipt.tax)}</span>
            </div>
          )}
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

        {receipt.footer && (
          <p className="mt-2.5 border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 text-center text-[10px] text-gray-500 leading-snug">
            {receipt.footer}
          </p>
        )}
      </div>

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
