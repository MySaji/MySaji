"use client"

import { useEffect, useState } from "react"
import { FileText, Loader2, MapPin, Plus, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  getMyServiceRequestsAsProvider, getContractDetail, submitContractQuote, addContractMilestone, markMilestoneComplete,
  type ContractListItem, type ContractDetail,
} from "@/lib/actions/service-contracts"
import { useLocalization } from "@/lib/hooks/useLocalization"

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  REQUESTED: { label: "Needs Quote", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  QUOTED: { label: "Awaiting Customer", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  AGREED: { label: "Agreed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  DECLINED: { label: "Declined", className: "bg-muted text-muted-foreground" },
  IN_PROGRESS: { label: "In Progress", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

const TABS = [
  { key: "REQUESTED", label: "Needs Quote" },
  { key: "QUOTED", label: "Awaiting Customer" },
  { key: "ACTIVE", label: "Active" },
  { key: "ALL", label: "All" },
] as const

export default function ProviderServiceRequestsPage() {
  const { formatMoney } = useLocalization()
  const [requests, setRequests] = useState<ContractListItem[]>([])
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("REQUESTED")
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ContractDetail>(null)

  const [showQuoteDialog, setShowQuoteDialog] = useState(false)
  const [quoteForm, setQuoteForm] = useState({ price: "", scopeOfWork: "", estimatedDuration: "", materials: "", labourNotes: "", terms: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false)
  const [milestoneForm, setMilestoneForm] = useState({ title: "", description: "", amount: "" })

  const refreshList = () => getMyServiceRequestsAsProvider().then(setRequests)

  useEffect(() => {
    refreshList().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    getContractDetail(selectedId).then(setDetail)
  }, [selectedId])

  const filtered = requests.filter((r) => {
    if (tab === "ALL") return true
    if (tab === "ACTIVE") return r.status === "AGREED" || r.status === "IN_PROGRESS"
    return r.status === tab
  })

  const openQuoteDialog = () => {
    setQuoteForm({ price: "", scopeOfWork: "", estimatedDuration: "", materials: "", labourNotes: "", terms: "" })
    setFormError("")
    setShowQuoteDialog(true)
  }

  const handleSubmitQuote = async () => {
    if (!selectedId) return
    setIsSaving(true)
    setFormError("")
    const result = await submitContractQuote({
      contractId: selectedId, price: Number(quoteForm.price), scopeOfWork: quoteForm.scopeOfWork,
      estimatedDuration: quoteForm.estimatedDuration, materials: quoteForm.materials || undefined,
      labourNotes: quoteForm.labourNotes || undefined, terms: quoteForm.terms || undefined,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowQuoteDialog(false)
    await refreshList()
    getContractDetail(selectedId).then(setDetail)
  }

  const handleAddMilestone = async () => {
    if (!selectedId) return
    setIsSaving(true)
    const result = await addContractMilestone({
      contractId: selectedId, title: milestoneForm.title, description: milestoneForm.description || undefined,
      amount: milestoneForm.amount ? Number(milestoneForm.amount) : undefined,
    })
    setIsSaving(false)
    if (!result.success) { alert(result.error); return }
    setShowMilestoneDialog(false)
    setMilestoneForm({ title: "", description: "", amount: "" })
    getContractDetail(selectedId).then(setDetail)
  }

  const handleMarkComplete = async (milestoneId: string) => {
    await markMilestoneComplete({ milestoneId })
    if (selectedId) getContractDetail(selectedId).then(setDetail)
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (selectedId && detail) {
    const status = STATUS_STYLE[detail.status]
    return (
      <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedId(null)}>← Back</Button>

        <Card className="border-0 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-foreground">{detail.title}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">{detail.requestDescription}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {detail.location}</p>
          <p className="text-sm text-foreground">Customer: <span className="font-semibold">{detail.customerName}</span></p>

          {detail.status === "REQUESTED" && (
            <Button className="w-full rounded-xl" onClick={openQuoteDialog}>Submit Quote</Button>
          )}
          {detail.quotedPrice != null && (
            <div className="rounded-xl bg-muted p-3 text-sm space-y-1">
              <p className="font-bold text-foreground">{formatMoney(detail.quotedPrice)}</p>
              {detail.scopeOfWork && <p className="text-muted-foreground">{detail.scopeOfWork}</p>}
              {detail.estimatedDuration && <p className="text-muted-foreground">Est. {detail.estimatedDuration}</p>}
            </div>
          )}
        </Card>

        {(detail.status === "AGREED" || detail.status === "IN_PROGRESS") && (
          <Card className="border-0 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Milestones</h3>
              <Button size="sm" variant="outline" className="gap-1.5 rounded-lg bg-transparent" onClick={() => setShowMilestoneDialog(true)}><Plus className="h-3.5 w-3.5" />Add</Button>
            </div>
            {detail.milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones yet.</p>}
            {detail.milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{m.title}</p>
                  {m.amount != null && <p className="text-xs text-muted-foreground">{formatMoney(m.amount)}</p>}
                </div>
                {m.status === "PENDING" ? (
                  <Button size="sm" className="rounded-lg" onClick={() => handleMarkComplete(m.id)}>Mark Complete</Button>
                ) : (
                  <span className={`flex items-center gap-1 text-xs font-medium ${m.status === "APPROVED" ? "text-emerald-600" : "text-amber-600"}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> {m.status === "APPROVED" ? "Approved" : "Awaiting approval"}
                  </span>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Use the regular "Complete Job" action on your Jobs page once all work is done — milestones here are progress tracking, not a separate payment step.</p>
          </Card>
        )}

        {/* Quote Dialog */}
        <Dialog open={showQuoteDialog} onOpenChange={setShowQuoteDialog}>
          <DialogContent className="max-w-md rounded-xl max-h-[85vh] overflow-y-auto" showCloseButton={false}>
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-foreground">Submit Quote</h2>
              <div><label className="text-sm text-muted-foreground mb-1 block">Price (KES)</label><Input type="number" value={quoteForm.price} onChange={(e) => setQuoteForm((p) => ({ ...p, price: e.target.value }))} /></div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Scope of work</label><Textarea value={quoteForm.scopeOfWork} onChange={(e) => setQuoteForm((p) => ({ ...p, scopeOfWork: e.target.value }))} className="min-h-[80px]" /></div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Estimated duration</label><Input value={quoteForm.estimatedDuration} onChange={(e) => setQuoteForm((p) => ({ ...p, estimatedDuration: e.target.value }))} placeholder="e.g. 2 days" /></div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Materials (optional)</label><Textarea value={quoteForm.materials} onChange={(e) => setQuoteForm((p) => ({ ...p, materials: e.target.value }))} className="min-h-[60px]" /></div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Labour (optional)</label><Textarea value={quoteForm.labourNotes} onChange={(e) => setQuoteForm((p) => ({ ...p, labourNotes: e.target.value }))} className="min-h-[60px]" /></div>
              <div><label className="text-sm text-muted-foreground mb-1 block">Terms (optional)</label><Textarea value={quoteForm.terms} onChange={(e) => setQuoteForm((p) => ({ ...p, terms: e.target.value }))} className="min-h-[60px]" /></div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowQuoteDialog(false)} disabled={isSaving}>Cancel</Button>
                <Button className="flex-1 rounded-xl" onClick={handleSubmitQuote} disabled={isSaving || !quoteForm.price || !quoteForm.scopeOfWork || !quoteForm.estimatedDuration}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Quote"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Milestone Dialog */}
        <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
          <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-foreground">Add Milestone</h2>
              <Input value={milestoneForm.title} onChange={(e) => setMilestoneForm((p) => ({ ...p, title: e.target.value }))} placeholder="Milestone title" />
              <Textarea value={milestoneForm.description} onChange={(e) => setMilestoneForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" className="min-h-[60px]" />
              <Input type="number" value={milestoneForm.amount} onChange={(e) => setMilestoneForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Amount (optional)" />
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowMilestoneDialog(false)} disabled={isSaving}>Cancel</Button>
                <Button className="flex-1 rounded-xl" onClick={handleAddMilestone} disabled={isSaving || !milestoneForm.title.trim()}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><FileText className="h-6 w-6 text-primary" /> Service Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Customer requests waiting for a quote, plus agreed jobs with milestones.</p>
      </div>

      <Card className="border-0 p-2 shadow-sm">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${tab === t.key ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed"><p className="text-sm text-muted-foreground">Nothing here yet.</p></Card>
        )}
        {filtered.map((r) => {
          const status = STATUS_STYLE[r.status]
          return (
            <Card key={r.id} className="cursor-pointer border border-border rounded-xl p-4 transition-shadow hover:shadow-md" onClick={() => setSelectedId(r.id)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.otherPartyName}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  {r.quotedPrice != null && <p className="text-sm font-bold text-foreground">{formatMoney(r.quotedPrice)}</p>}
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
