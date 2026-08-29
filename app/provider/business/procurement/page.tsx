"use client"

import { useEffect, useState } from "react"
import { Handshake, Loader2, Plus, MapPin, CheckCircle2, Truck } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  getMyProcurementRequests, createProcurementRequest, getSupplierQuotesForRequest, selectSupplierQuote,
  confirmDelivery, getMyPurchaseRecords, type ProcurementRequestItem, type SupplierQuoteItem, type PurchaseRecordItem,
} from "@/lib/actions/procurement"
import { useLocalization } from "@/lib/hooks/useLocalization"

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  QUOTES_OPEN: { label: "Awaiting Quotes", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  PENDING_APPROVAL: { label: "Pending Approval", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  PURCHASE_ORDER_CREATED: { label: "Purchase Order Created", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  FULFILLED: { label: "Fulfilled", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

export default function BusinessProcurementPage() {
  const { formatMoney } = useLocalization()
  const [tab, setTab] = useState<"requests" | "records">("requests")
  const [requests, setRequests] = useState<ProcurementRequestItem[]>([])
  const [records, setRecords] = useState<PurchaseRecordItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<SupplierQuoteItem[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ productName: "", quantity: "1", deliveryLocation: "", recurrenceDays: "", budgetMax: "", requirements: "", requiresApproval: false })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const [showDeliveryDialog, setShowDeliveryDialog] = useState<string | null>(null)
  const [deliveryForm, setDeliveryForm] = useState({ deliveredQuantity: "", recipientName: "" })

  const refresh = () => Promise.all([getMyProcurementRequests().then(setRequests), getMyPurchaseRecords().then(setRecords)])

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (selectedId) getSupplierQuotesForRequest(selectedId).then(setQuotes)
  }, [selectedId])

  const handleCreate = async () => {
    setIsSaving(true)
    setError("")
    const result = await createProcurementRequest({
      productName: form.productName, quantity: Number(form.quantity), deliveryLocation: form.deliveryLocation,
      recurrenceDays: form.recurrenceDays ? Number(form.recurrenceDays) : undefined, budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
      requirements: form.requirements || undefined, requiresApproval: form.requiresApproval,
    })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setShowCreate(false)
    await refresh()
  }

  const handleSelectQuote = async (quoteId: string) => {
    const result = await selectSupplierQuote({ quoteId })
    if (!result.success) { alert(result.error); return }
    setSelectedId(null)
    await refresh()
  }

  const handleConfirmDelivery = async () => {
    if (!showDeliveryDialog) return
    const result = await confirmDelivery({
      purchaseOrderId: showDeliveryDialog, deliveredQuantity: Number(deliveryForm.deliveredQuantity), recipientName: deliveryForm.recipientName,
    })
    if (!result.success) { alert(result.error); return }
    setShowDeliveryDialog(null)
    setDeliveryForm({ deliveredQuantity: "", recipientName: "" })
    await refresh()
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Handshake className="h-6 w-6" /> Procurement</h1>
          <p className="mt-1 text-sm text-muted-foreground">Post a need, compare supplier quotes, track delivery.</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setError(""); setForm({ productName: "", quantity: "1", deliveryLocation: "", recurrenceDays: "", budgetMax: "", requirements: "", requiresApproval: false }) }} className="gap-1.5 rounded-xl">
          <Plus className="h-4 w-4" />New Request
        </Button>
      </div>

      <Card className="border-0 p-2 shadow-sm">
        <div className="flex gap-1">
          {(["requests", "records"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${tab === t ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted"}`}>
              {t === "requests" ? "Requests" : "Purchase Records"}
            </button>
          ))}
        </div>
      </Card>

      {tab === "requests" ? (
        <div className="space-y-3">
          {requests.length === 0 && <Card className="p-10 text-center border-dashed"><p className="text-sm text-muted-foreground">No procurement requests yet.</p></Card>}
          {requests.map((r) => {
            const status = STATUS_STYLE[r.status]
            return (
              <Card key={r.id} className="cursor-pointer border border-border rounded-xl p-4" onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{r.productName} × {r.quantity}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {r.deliveryLocation}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                    <p className="mt-1 text-xs text-muted-foreground">{r.quoteCount} quote{r.quoteCount !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                {selectedId === r.id && (
                  <div className="mt-3 space-y-2 border-t border-border/50 pt-3" onClick={(e) => e.stopPropagation()}>
                    {quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotes yet.</p>}
                    {quotes.map((q) => (
                      <div key={q.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{q.supplierName}, {formatMoney(q.price)}</p>
                          <p className="text-xs text-muted-foreground">{[q.availability, q.deliveryTime].filter(Boolean).join(" · ")}</p>
                        </div>
                        {q.status === "SUBMITTED" && r.status === "QUOTES_OPEN" && (
                          <Button size="sm" className="rounded-lg" onClick={() => handleSelectQuote(q.id)}>Select</Button>
                        )}
                        {q.status === "SELECTED" && <span className="text-xs font-semibold text-emerald-600">Selected</span>}
                      </div>
                    ))}
                    {r.status === "PURCHASE_ORDER_CREATED" && (
                      <Button size="sm" className="gap-1.5 rounded-lg" onClick={() => setShowDeliveryDialog(r.id)}><Truck className="h-3.5 w-3.5" />Confirm Delivery</Button>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {records.length === 0 && <Card className="p-10 text-center border-dashed"><p className="text-sm text-muted-foreground">No purchase records yet.</p></Card>}
          {records.map((rec) => (
            <Card key={rec.purchaseOrderId} className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{rec.productName}</p>
                  <p className="text-xs text-muted-foreground">{new Date(rec.createdAt).toLocaleDateString()}{rec.deliveredAt ? ` · delivered ${new Date(rec.deliveredAt).toLocaleDateString()}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground">{formatMoney(rec.totalAmount)}</p>
                  <span className="text-xs text-muted-foreground">{rec.status}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-xl max-h-[85vh] overflow-y-auto" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">New Procurement Request</h2>
            <Input value={form.productName} onChange={(e) => setForm((p) => ({ ...p, productName: e.target.value }))} placeholder="What do you need? e.g. Cartons" />
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} placeholder="Quantity" />
              <Input type="number" value={form.budgetMax} onChange={(e) => setForm((p) => ({ ...p, budgetMax: e.target.value }))} placeholder="Budget max (optional)" />
            </div>
            <Input value={form.deliveryLocation} onChange={(e) => setForm((p) => ({ ...p, deliveryLocation: e.target.value }))} placeholder="Delivery location" />
            <Input type="number" value={form.recurrenceDays} onChange={(e) => setForm((p) => ({ ...p, recurrenceDays: e.target.value }))} placeholder="Repeat every N days (optional)" />
            <Textarea value={form.requirements} onChange={(e) => setForm((p) => ({ ...p, requirements: e.target.value }))} placeholder="Requirements (optional)" className="min-h-[60px]" />
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.requiresApproval} onCheckedChange={(c) => setForm((p) => ({ ...p, requiresApproval: c === true }))} />
              <span className="text-sm text-foreground">Require manager approval before purchase</span>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowCreate(false)} disabled={isSaving}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handleCreate} disabled={isSaving || !form.productName.trim() || !form.deliveryLocation.trim()}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDeliveryDialog} onOpenChange={(open) => !open && setShowDeliveryDialog(null)}>
        <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Confirm Delivery</h2>
            <Input type="number" value={deliveryForm.deliveredQuantity} onChange={(e) => setDeliveryForm((p) => ({ ...p, deliveredQuantity: e.target.value }))} placeholder="Quantity received" />
            <Input value={deliveryForm.recipientName} onChange={(e) => setDeliveryForm((p) => ({ ...p, recipientName: e.target.value }))} placeholder="Received by (name)" />
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowDeliveryDialog(null)}>Cancel</Button>
              <Button className="flex-1 gap-1.5 rounded-xl" onClick={handleConfirmDelivery} disabled={!deliveryForm.deliveredQuantity || !deliveryForm.recipientName}>
                <CheckCircle2 className="h-4 w-4" />Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
