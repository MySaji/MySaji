"use client"

import { useEffect, useState } from "react"
import { Handshake, Loader2, MapPin, Send } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { getOpenProcurementRequests, submitSupplierQuote, type OpenProcurementRequestItem } from "@/lib/actions/procurement"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function DistributorProcurementPage() {
  const { formatMoney } = useLocalization()
  const [requests, setRequests] = useState<OpenProcurementRequestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [quoting, setQuoting] = useState<OpenProcurementRequestItem | null>(null)
  const [form, setForm] = useState({ price: "", availability: "", deliveryTime: "", terms: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const refresh = () => getOpenProcurementRequests().then(setRequests)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const openQuote = (req: OpenProcurementRequestItem) => {
    setQuoting(req)
    setForm({ price: "", availability: "", deliveryTime: "", terms: "" })
    setError("")
  }

  const handleSubmit = async () => {
    if (!quoting) return
    setIsSaving(true)
    setError("")
    const result = await submitSupplierQuote({
      procurementRequestId: quoting.id, price: Number(form.price), availability: form.availability || undefined,
      deliveryTime: form.deliveryTime || undefined, terms: form.terms || undefined,
    })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setQuoting(null)
    await refresh()
  }

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Handshake className="h-7 w-7" /> Procurement Requests</h1>
        <p className="mt-1 text-muted-foreground">Businesses looking for suppliers. Quote to be considered.</p>
      </div>

      {requests.length === 0 ? (
        <Card className="border-0 p-10 text-center shadow-lg"><p className="text-xs text-muted-foreground">No open requests right now.</p></Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="border-0 p-5 shadow-lg">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-foreground">{r.productName} × {r.quantity}</p>
                  <p className="text-xs text-muted-foreground">{r.businessName}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {r.deliveryLocation}{r.recurrenceDays ? ` · every ${r.recurrenceDays} days` : ""}</p>
                  {r.budgetMax != null && <p className="text-[11px] text-muted-foreground">Budget up to {formatMoney(r.budgetMax)}</p>}
                  {r.requirements && <p className="mt-1 text-xs text-foreground">{r.requirements}</p>}
                </div>
                <Button size="sm" className="flex-shrink-0 gap-1.5" onClick={() => openQuote(r)}><Send className="h-3.5 w-3.5" />Submit Quote</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!quoting} onOpenChange={(open) => !open && setQuoting(null)}>
        <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
          {quoting && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-foreground">Quote: {quoting.productName}</h2>
              <div><label className="mb-1 block text-xs text-muted-foreground">Price per unit (KES)</label><Input type="number" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} /></div>
              <div><label className="mb-1 block text-xs text-muted-foreground">Availability</label><Input value={form.availability} onChange={(e) => setForm((p) => ({ ...p, availability: e.target.value }))} placeholder="e.g. In stock" /></div>
              <div><label className="mb-1 block text-xs text-muted-foreground">Delivery time</label><Input value={form.deliveryTime} onChange={(e) => setForm((p) => ({ ...p, deliveryTime: e.target.value }))} placeholder="e.g. 2 business days" /></div>
              <div><label className="mb-1 block text-xs text-muted-foreground">Terms (optional)</label><Input value={form.terms} onChange={(e) => setForm((p) => ({ ...p, terms: e.target.value }))} /></div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setQuoting(null)} disabled={isSaving}>Cancel</Button>
                <Button className="flex-1 rounded-xl" onClick={handleSubmit} disabled={isSaving || !form.price}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Quote"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
