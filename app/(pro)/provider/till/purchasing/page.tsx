"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Plus, Truck, ClipboardList, Users,
  X, PackageCheck, Ban, Package,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getSuppliers, saveSupplier, setSupplierActive,
  getPurchaseOrders, createPurchaseOrder, approvePurchaseOrder, getPurchaseOrderDetail,
  getGoodsReceipts, receiveGoods,
  type SupplierRow, type PurchaseOrderRow, type GoodsReceiptRow,
} from "@/backend/actions/pos-purchasing"
import { getStockView, type StockRow } from "@/backend/actions/pos-stock"
import { ScanButton } from "@/frontend/components/pos/barcode-scanner"

/**
 * Buying: who from, what was ordered, and what turned up.
 *
 * Three tabs because they are three different jobs done by different people
 * at different times. A stock controller lives in Deliveries, an owner in
 * Orders, and Suppliers is opened twice a year.
 *
 * The order of the tabs is the order of the work, and Deliveries is first
 * because it is the one done daily with a lorry waiting outside.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Tab = "receive" | "orders" | "suppliers"

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "Draft", cls: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300" },
  ORDERED: { text: "Sent", cls: "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400" },
  PART_RECEIVED: { text: "Part delivered", cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
  RECEIVED: { text: "Delivered", cls: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
  CANCELLED: { text: "Cancelled", cls: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400" },
}

export default function PurchasingPage() {
  const [tab, setTab] = useState<Tab>("receive")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([])
  const [receipts, setReceipts] = useState<GoodsReceiptRow[]>([])
  const [products, setProducts] = useState<StockRow[]>([])

  const [supplierForm, setSupplierForm] = useState<{ open: boolean; id?: string; name: string; phone: string; terms: string }>(
    { open: false, name: "", phone: "", terms: "" },
  )

  const [orderForm, setOrderForm] = useState<{ open: boolean; supplierId: string; lines: { productId: string; name: string; quantity: string; unitCost: string }[] }>(
    { open: false, supplierId: "", lines: [] },
  )

  const [receiveForm, setReceiveForm] = useState<{
    open: boolean
    orderId?: string
    orderNumber?: string
    supplierId: string
    supplierRef: string
    lines: { productId: string; orderItemId?: string; name: string; quantity: string; unitCost: string; batchNumber: string; expiryDate: string }[]
  }>({ open: false, supplierId: "", supplierRef: "", lines: [] })

  const refresh = async () => {
    const [s, o, r, p] = await Promise.all([
      getSuppliers({}), getPurchaseOrders({}), getGoodsReceipts({}), getStockView(),
    ])
    setSuppliers(s)
    setOrders(o)
    setReceipts(r)
    setProducts(p?.rows ?? [])
  }

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 2500) }

  // ---- suppliers ---------------------------------------------------------
  const submitSupplier = async () => {
    setBusy(true); setError("")
    const r = await saveSupplier({
      ...(supplierForm.id ? { supplierId: supplierForm.id } : {}),
      name: supplierForm.name,
      phone: supplierForm.phone || undefined,
      paymentTerms: supplierForm.terms || undefined,
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refresh()
    setSupplierForm({ open: false, name: "", phone: "", terms: "" })
    flash("Supplier saved")
  }

  // ---- orders ------------------------------------------------------------
  const submitOrder = async () => {
    const lines = orderForm.lines.filter((l) => l.productId && Number(l.quantity) > 0)
    if (lines.length === 0) { setError("Add at least one thing to order."); return }
    setBusy(true); setError("")
    const r = await createPurchaseOrder({
      supplierId: orderForm.supplierId,
      lines: lines.map((l) => ({ productId: l.productId, name: l.name, quantity: Number(l.quantity), unitCost: Number(l.unitCost || 0) })),
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refresh()
    setOrderForm({ open: false, supplierId: "", lines: [] })
    flash(r.orderNumber + " drafted")
  }

  const approve = async (orderId: string) => {
    setBusy(true); setError("")
    const r = await approvePurchaseOrder({ orderId })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refresh()
    flash(r.orderNumber + " sent")
  }

  // ---- receiving ----------------------------------------------------------
  const openReceiveFor = async (orderId: string) => {
    setBusy(true); setError("")
    const d = await getPurchaseOrderDetail({ orderId })
    setBusy(false)
    if (!d) { setError("That order could not be opened."); return }
    setReceiveForm({
      open: true,
      orderId: d.id,
      orderNumber: d.orderNumber,
      supplierId: d.supplierId,
      supplierRef: "",
      // Pre-filled with what is still outstanding, which is what usually
      // arrives. The storeman corrects it against the lorry.
      lines: d.lines
        .filter((l) => l.productId && l.receivedQuantity < l.quantity)
        .map((l) => ({
          productId: l.productId!,
          orderItemId: l.id,
          name: l.name,
          quantity: String(l.quantity - l.receivedQuantity),
          unitCost: String(l.unitCost),
          batchNumber: "",
          expiryDate: "",
        })),
    })
  }

  const submitReceive = async () => {
    const lines = receiveForm.lines.filter((l) => l.productId && Number(l.quantity) > 0)
    if (lines.length === 0) { setError("Nothing was marked as arrived."); return }
    setBusy(true); setError("")
    const r = await receiveGoods({
      ...(receiveForm.orderId ? { orderId: receiveForm.orderId } : {}),
      ...(receiveForm.supplierId ? { supplierId: receiveForm.supplierId } : {}),
      supplierRef: receiveForm.supplierRef || undefined,
      lines: lines.map((l) => ({
        productId: l.productId,
        ...(l.orderItemId ? { orderItemId: l.orderItemId } : {}),
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost || 0),
        ...(l.batchNumber ? { batchNumber: l.batchNumber } : {}),
        ...(l.expiryDate ? { expiryDate: new Date(l.expiryDate).toISOString() } : {}),
      })),
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    await refresh()
    setReceiveForm({ open: false, supplierId: "", supplierRef: "", lines: [] })
    flash(r.receiptNumber + ": stock is in, " + sh(r.totalCost) + " of goods")
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  const activeSuppliers = suppliers.filter((s) => s.isActive)

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <Link href="/provider/till/dashboard" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95 transition-transform">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Buying</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          What you ordered and what actually turned up. Only a delivery moves stock.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{saved}</p>
        </div>
      )}

      <div className="flex gap-1.5">
        {([["receive", "Deliveries", Truck], ["orders", "Orders", ClipboardList], ["suppliers", "Suppliers", Users]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => { setTab(k); setError("") }}
            aria-pressed={tab === k}
            className={
              tab === k
                ? "flex-1 h-11 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 active:scale-95 border-primary bg-primary/10 text-primary"
                : "flex-1 h-11 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
            }
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ================= DELIVERIES ================= */}
      {tab === "receive" && (
        <>
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Record a delivery</h2>
              {!receiveForm.open && (
                <Button
                  onClick={() => setReceiveForm({ open: true, supplierId: activeSuppliers[0]?.id ?? "", supplierRef: "", lines: [] })}
                  className="h-9 px-3 rounded-xl text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> New
                </Button>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
              Goods bought off a lorry with no order behind them count too.
            </p>

            {receiveForm.open && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5">
                {receiveForm.orderNumber && (
                  <p className="text-[11px] font-semibold text-primary">Against {receiveForm.orderNumber}</p>
                )}
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Supplier</label>
                  <select
                    value={receiveForm.supplierId}
                    onChange={(e) => setReceiveForm((f) => ({ ...f, supplierId: e.target.value }))}
                    disabled={!!receiveForm.orderId}
                    className="mt-1 w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 text-sm text-gray-900 dark:text-white disabled:opacity-60"
                  >
                    <option value="">Not recorded</option>
                    {activeSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Their delivery note number</label>
                  <Input
                    value={receiveForm.supplierRef}
                    onChange={(e) => setReceiveForm((f) => ({ ...f, supplierRef: e.target.value }))}
                    placeholder="DN-5521"
                    className="mt-1 h-11 rounded-xl text-sm"
                  />
                </div>

                <div className="space-y-2">
                  {receiveForm.lines.map((l, i) => (
                    <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 bg-white dark:bg-gray-900">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 text-xs font-semibold text-gray-900 dark:text-white truncate">{l.name}</p>
                        <button
                          onClick={() => setReceiveForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}
                          aria-label={"Remove " + l.name}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-95"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <Input
                          value={l.quantity}
                          onChange={(e) => setReceiveForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, "") } : x) }))}
                          inputMode="decimal"
                          placeholder="How many"
                          className="h-11 rounded-xl text-sm tabular-nums"
                        />
                        <Input
                          value={l.unitCost}
                          onChange={(e) => setReceiveForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, unitCost: e.target.value.replace(/[^\d.]/g, "") } : x) }))}
                          inputMode="decimal"
                          placeholder="Cost each"
                          className="h-11 rounded-xl text-sm tabular-nums"
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Input
                          value={l.batchNumber}
                          onChange={(e) => setReceiveForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, batchNumber: e.target.value } : x) }))}
                          placeholder="Batch (optional)"
                          className="h-11 rounded-xl text-xs"
                        />
                        <Input
                          value={l.expiryDate}
                          onChange={(e) => setReceiveForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, expiryDate: e.target.value } : x) }))}
                          type="date"
                          className="h-11 rounded-xl text-xs"
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-gray-400 leading-snug">
                        Expiry is easiest to read at the door. It is what makes the till sell the
                        oldest first.
                      </p>
                    </div>
                  ))}
                </div>

                <AddLine
                  products={products}
                  onAdd={(p) => setReceiveForm((f) => ({
                    ...f,
                    lines: [...f.lines, { productId: p.productId, name: p.name, quantity: "1", unitCost: "", batchNumber: "", expiryDate: "" }],
                  }))}
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => { setReceiveForm({ open: false, supplierId: "", supplierRef: "", lines: [] }); setError("") }}
                    className="h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 active:scale-95"
                  >
                    Cancel
                  </button>
                  <Button onClick={submitReceive} disabled={busy || receiveForm.lines.length === 0} className="flex-1 h-11 rounded-xl text-sm">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><PackageCheck className="w-4 h-4 mr-1.5" /> Put it in stock</>}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4 rounded-2xl">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Deliveries so far</h2>
            {receipts.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Nothing received yet. Recording a delivery is what puts stock on the shelf.
              </p>
            ) : (
              <div className="mt-2.5 space-y-1.5">
                {receipts.map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                    <Truck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                        {r.receiptNumber}
                        {r.supplierName && <span className="font-normal text-gray-500"> &middot; {r.supplierName}</span>}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {new Date(r.occurredAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                        {" · "}{r.itemCount} {r.itemCount === 1 ? "line" : "lines"}
                        {r.orderNumber ? " · " + r.orderNumber : " · no order"}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums flex-shrink-0">{sh(r.totalCost)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ================= ORDERS ================= */}
      {tab === "orders" && (
        <>
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Orders</h2>
              {!orderForm.open && activeSuppliers.length > 0 && (
                <Button onClick={() => setOrderForm({ open: true, supplierId: activeSuppliers[0].id, lines: [] })} className="h-9 px-3 rounded-xl text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> New order
                </Button>
              )}
            </div>
            {activeSuppliers.length === 0 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Add a supplier first. An order has to be to somebody.
              </p>
            )}

            {orderForm.open && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Supplier</label>
                  <select
                    value={orderForm.supplierId}
                    onChange={(e) => setOrderForm((f) => ({ ...f, supplierId: e.target.value }))}
                    className="mt-1 w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 text-sm text-gray-900 dark:text-white"
                  >
                    {activeSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {orderForm.lines.map((l, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 text-xs font-semibold text-gray-900 dark:text-white truncate">{l.name}</p>
                      <button
                        onClick={() => setOrderForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}
                        aria-label={"Remove " + l.name}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-95"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      <Input
                        value={l.quantity}
                        onChange={(e) => setOrderForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, "") } : x) }))}
                        inputMode="decimal"
                        placeholder="How many"
                        className="h-11 rounded-xl text-sm tabular-nums"
                      />
                      <Input
                        value={l.unitCost}
                        onChange={(e) => setOrderForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, unitCost: e.target.value.replace(/[^\d.]/g, "") } : x) }))}
                        inputMode="decimal"
                        placeholder="Cost each"
                        className="h-11 rounded-xl text-sm tabular-nums"
                      />
                    </div>
                  </div>
                ))}

                <AddLine
                  products={products}
                  onAdd={(p) => setOrderForm((f) => ({
                    ...f,
                    lines: [...f.lines, { productId: p.productId, name: p.name, quantity: "1", unitCost: "" }],
                  }))}
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => { setOrderForm({ open: false, supplierId: "", lines: [] }); setError("") }}
                    className="h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 active:scale-95"
                  >
                    Cancel
                  </button>
                  <Button onClick={submitOrder} disabled={busy || orderForm.lines.length === 0} className="flex-1 h-11 rounded-xl text-sm">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save as draft"}
                  </Button>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  A draft commits nothing. Sending it is a separate step, because that is the
                  moment the shop owes money.
                </p>
              </div>
            )}

            {orders.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {orders.map((o) => {
                  const st = STATUS_LABEL[o.status] ?? { text: o.status, cls: "bg-gray-100 text-gray-600" }
                  return (
                    <div key={o.id} className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                            {o.orderNumber} <span className="font-normal text-gray-500">&middot; {o.supplierName}</span>
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {o.itemCount} {o.itemCount === 1 ? "line" : "lines"} &middot; {sh(o.expectedTotal)}
                          </p>
                        </div>
                        <span className={`inline-flex h-6 px-2 rounded-md text-[10px] font-bold items-center flex-shrink-0 ${st.cls}`}>
                          {st.text}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {o.status === "DRAFT" && (
                          <Button onClick={() => approve(o.id)} disabled={busy} className="h-10 rounded-xl text-xs flex-1">
                            Send to supplier
                          </Button>
                        )}
                        {(o.status === "ORDERED" || o.status === "PART_RECEIVED") && (
                          <Button onClick={() => { setTab("receive"); void openReceiveFor(o.id) }} disabled={busy} className="h-10 rounded-xl text-xs flex-1">
                            <Truck className="w-3.5 h-3.5 mr-1.5" /> It arrived
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ================= SUPPLIERS ================= */}
      {tab === "suppliers" && (
        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Suppliers</h2>
            {!supplierForm.open && (
              <Button onClick={() => setSupplierForm({ open: true, name: "", phone: "", terms: "" })} className="h-9 px-3 rounded-xl text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            )}
          </div>

          {supplierForm.open && (
            <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5">
              <Input
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Who they are"
                className="h-11 rounded-xl text-sm"
              />
              <Input
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))}
                inputMode="tel"
                placeholder="Phone"
                className="h-11 rounded-xl text-sm"
              />
              <Input
                value={supplierForm.terms}
                onChange={(e) => setSupplierForm((f) => ({ ...f, terms: e.target.value }))}
                placeholder="Terms, e.g. 30 days or cash on delivery"
                className="h-11 rounded-xl text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setSupplierForm({ open: false, name: "", phone: "", terms: "" }); setError("") }}
                  className="h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 active:scale-95"
                >
                  Cancel
                </button>
                <Button onClick={submitSupplier} disabled={busy || supplierForm.name.trim().length < 2} className="flex-1 h-11 rounded-xl text-sm">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}

          {suppliers.length === 0 && !supplierForm.open ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Nobody yet. Add the depot or wholesaler you buy from most.
            </p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {suppliers.map((s) => (
                <div key={s.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                  s.isActive ? "border-gray-200 dark:border-gray-700" : "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40"
                }`}>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold truncate ${s.isActive ? "text-gray-900 dark:text-white" : "text-gray-400 line-through"}`}>
                      {s.name}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {s.phone ?? "no phone"}
                      {s.paymentTerms ? " · " + s.paymentTerms : ""}
                      {" · "}{s.orderCount} {s.orderCount === 1 ? "order" : "orders"}
                    </p>
                  </div>
                  <button
                    onClick={() => setSupplierForm({ open: true, id: s.id, name: s.name, phone: s.phone ?? "", terms: s.paymentTerms ?? "" })}
                    className="h-9 px-3 rounded-lg text-[11px] font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 active:scale-95"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => { setBusy(true); await setSupplierActive({ supplierId: s.id, isActive: !s.isActive }); await refresh(); setBusy(false) }}
                    disabled={busy}
                    aria-label={s.isActive ? "Stop using " + s.name : "Use " + s.name + " again"}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-95 disabled:opacity-50"
                  >
                    {s.isActive ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
            A supplier you stop using is kept, not deleted: their name is on past orders and
            deliveries that have to stay readable.
          </p>
        </Card>
      )}
    </div>
  )
}

/** Picking a product to add to an order or a delivery, by name or by scan. */
function AddLine({ products, onAdd }: { products: StockRow[]; onAdd: (p: StockRow) => void }) {
  const [q, setQ] = useState("")
  const hits = q.trim().length === 0
    ? []
    : products.filter((p) =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(q.toLowerCase()) ||
        (p.barcode ?? "").includes(q),
      ).slice(0, 6)

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Add a product by name or code"
          className="h-11 rounded-xl text-sm flex-1"
        />
        <ScanButton label="product barcode" onScanned={(code) => setQ(code)} />
      </div>
      {hits.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {hits.map((p) => (
            <button
              key={p.productId}
              onClick={() => { onAdd(p); setQ("") }}
              className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-left active:scale-[0.99]"
            >
              <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="min-w-0 flex-1 text-xs text-gray-900 dark:text-white truncate">{p.name}</span>
              <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">{p.onHand} {p.unit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
