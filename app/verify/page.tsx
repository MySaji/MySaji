"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Search, Loader2, ShieldCheck, ShieldAlert, Download, ScanLine } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { getReceiptByNumber, type PublicReceiptView } from "@/lib/actions/receipts"

const TYPE_LABEL: Record<string, string> = {
  PAYMENT: "Payment Receipt",
  DEPOSIT: "Deposit Receipt",
  WITHDRAWAL: "Withdrawal Receipt",
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function VerifyReceiptPage() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [result, setResult] = useState<PublicReceiptView>(null)

  const runSearch = async (receiptNumber: string) => {
    if (!receiptNumber.trim()) return
    setIsLoading(true)
    setHasSearched(true)
    const data = await getReceiptByNumber(receiptNumber)
    setResult(data)
    setIsLoading(false)
  }

  useEffect(() => {
    const fromQuery = searchParams.get("receipt")
    if (fromQuery) {
      setQuery(fromQuery)
      runSearch(fromQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to SAJI
        </Link>

        <div className="flex flex-col items-center text-center mb-6">
          <BrandLogo size="large" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-3">Verify a Receipt</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter a receipt number, or scan its QR code, to confirm it's real.</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
                placeholder="e.g. SAJ-20260806-83920"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <button
              onClick={() => runSearch(query)}
              disabled={isLoading || !query.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </button>
          </div>
        </div>

        {hasSearched && !isLoading && !result && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 text-center">
            <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Receipt not found</h2>
            <p className="text-sm text-muted-foreground">Double-check the receipt number and try again.</p>
          </div>
        )}

        {result && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-900/40 p-4 flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-400">Receipt Verified</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-500">{TYPE_LABEL[result.type] ?? "Receipt"}</p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-sm">
              <Row label="Receipt No." value={result.receiptNumber} />
              <Row label="Date" value={new Date(result.createdAt).toLocaleString()} />
              <Row label="Name" value={result.customerName} />
              {result.paymentMethod && <Row label="Method" value={result.paymentMethod} />}
              {result.transactionRef && <Row label="Transaction ID" value={result.transactionRef} />}

              {result.lineItems.length > 0 && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                  {result.lineItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-300">{item.label}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatMoney(item.amount, result.currency)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className="font-semibold text-gray-900 dark:text-white">Total</span>
                <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{formatMoney(result.totalAmount, result.currency)}</span>
              </div>
              {result.balanceAfter != null && <Row label="Wallet Balance" value={formatMoney(result.balanceAfter, result.currency)} />}
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700">
              <a
                href={`/api/receipts/${result.receiptNumber}`}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium"
              >
                <Download className="w-4 h-4" /> Download PDF
              </a>
            </div>
          </div>
        )}

        {!hasSearched && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-6">
            <ScanLine className="w-3.5 h-3.5" /> Scanning a receipt's QR code brings you straight here.
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  )
}
