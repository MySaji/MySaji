"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent } from "@/frontend/components/ui/dialog"
import { Loader2, FileEdit, Plus, CheckCircle2, XCircle, Ban } from "lucide-react"
import {
  getJobChangeOrders, createChangeOrder, cancelChangeOrder, respondToChangeOrder, type ChangeOrderItem,
} from "@/backend/actions/change-orders"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending your review", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  DECLINED: { label: "Declined", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

export function ChangeOrdersPanel({ jobId, viewerRole, canRequest }: { jobId: string; viewerRole: "customer" | "provider"; canRequest: boolean }) {
  const { formatMoney } = useLocalization()
  const [items, setItems] = useState<ChangeOrderItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ description: "", additionalWork: "", additionalCost: "", additionalTimeDays: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [respondingId, setRespondingId] = useState<string | null>(null)

  const refresh = () => getJobChangeOrders(jobId).then(setItems)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [jobId])

  const handleCreate = async () => {
    setIsSaving(true)
    setError("")
    const result = await createChangeOrder({
      jobId, description: form.description, additionalWork: form.additionalWork,
      additionalCost: Number(form.additionalCost) || 0, additionalTimeDays: form.additionalTimeDays ? Number(form.additionalTimeDays) : undefined,
    })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setShowCreate(false)
    setForm({ description: "", additionalWork: "", additionalCost: "", additionalTimeDays: "" })
    await refresh()
  }

  const handleCancel = async (id: string) => {
    await cancelChangeOrder({ changeOrderId: id })
    await refresh()
  }

  const handleRespond = async (id: string, approve: boolean) => {
    setRespondingId(id)
    await respondToChangeOrder({ changeOrderId: id, approve })
    setRespondingId(null)
    await refresh()
  }

  if (isLoading) return null
  if (items.length === 0 && !canRequest) return null

  return (
    <Card className="p-4 mb-4 border-0 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Change Orders</h3>
        </div>
        {viewerRole === "provider" && canRequest && (
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg bg-transparent" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />Request Change</Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No change requests on this job.</p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const status = STATUS_STYLE[c.status]
            return (
              <div key={c.id} className="rounded-xl border border-border/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{c.additionalWork}</p>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">+{formatMoney(c.additionalCost)}</span>
                  {c.additionalTimeDays != null && <span>+{c.additionalTimeDays} day{c.additionalTimeDays !== 1 ? "s" : ""}</span>}
                </div>
                {c.declineReason && <p className="mt-1 text-xs text-red-600">Reason: {c.declineReason}</p>}

                {c.status === "PENDING" && viewerRole === "customer" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg gap-1 bg-transparent" onClick={() => handleRespond(c.id, false)} disabled={respondingId === c.id}>
                      <XCircle className="h-3.5 w-3.5" />Decline
                    </Button>
                    <Button size="sm" className="flex-1 rounded-lg gap-1" onClick={() => handleRespond(c.id, true)} disabled={respondingId === c.id}>
                      {respondingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5" />Approve</>}
                    </Button>
                  </div>
                )}
                {c.status === "PENDING" && viewerRole === "provider" && (
                  <Button size="sm" variant="outline" className="mt-3 gap-1.5 rounded-lg bg-transparent" onClick={() => handleCancel(c.id)}>
                    <Ban className="h-3.5 w-3.5" />Cancel Request
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Request a Change</h2>
            <div><label className="text-sm text-muted-foreground mb-1 block">What changed / why</label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="min-h-[60px]" /></div>
            <div><label className="text-sm text-muted-foreground mb-1 block">Additional work</label><Input value={form.additionalWork} onChange={(e) => setForm((p) => ({ ...p, additionalWork: e.target.value }))} placeholder="e.g. Replace damaged pipe" /></div>
            <div><label className="text-sm text-muted-foreground mb-1 block">Additional cost (KES)</label><Input type="number" value={form.additionalCost} onChange={(e) => setForm((p) => ({ ...p, additionalCost: e.target.value }))} /></div>
            <div><label className="text-sm text-muted-foreground mb-1 block">Additional time (days, optional)</label><Input type="number" value={form.additionalTimeDays} onChange={(e) => setForm((p) => ({ ...p, additionalTimeDays: e.target.value }))} /></div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowCreate(false)} disabled={isSaving}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handleCreate} disabled={isSaving || !form.description.trim() || !form.additionalWork.trim() || !form.additionalCost}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
