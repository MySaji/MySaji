"use client"

import { useEffect, useState } from "react"
import { Radar, Loader2, Plus, MapPin, Clock, MessageSquare } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  getOpenOpportunities, getMyOpportunities, postOpportunity, respondToOpportunity, getOpportunityResponses, closeOpportunity,
  type OpportunityItem, type OpportunityResponseItem,
} from "@/lib/actions/opportunities"
import { getOfferCategoryOptions, type OfferCategoryOption } from "@/lib/actions/offers"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ProviderOpportunitiesPage() {
  const { formatMoney } = useLocalization()
  const [tab, setTab] = useState<"nearby" | "mine">("nearby")
  const [nearby, setNearby] = useState<OpportunityItem[]>([])
  const [mine, setMine] = useState<OpportunityItem[]>([])
  const [categories, setCategories] = useState<OfferCategoryOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [showPost, setShowPost] = useState(false)
  const [form, setForm] = useState({ categoryId: "", location: "", preferredTime: "", budget: "", description: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const [respondingTo, setRespondingTo] = useState<OpportunityItem | null>(null)
  const [responseMessage, setResponseMessage] = useState("")

  const [viewingResponses, setViewingResponses] = useState<OpportunityItem | null>(null)
  const [responses, setResponses] = useState<OpportunityResponseItem[]>([])

  const refresh = () => Promise.all([getOpenOpportunities().then(setNearby), getMyOpportunities().then(setMine), getOfferCategoryOptions().then(setCategories)])

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handlePost = async () => {
    setIsSaving(true)
    setError("")
    const result = await postOpportunity({
      categoryId: form.categoryId, location: form.location, preferredTime: form.preferredTime || undefined,
      budget: form.budget ? Number(form.budget) : undefined, description: form.description,
    })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setShowPost(false)
    await refresh()
  }

  const handleRespond = async () => {
    if (!respondingTo) return
    const result = await respondToOpportunity({ opportunityId: respondingTo.id, message: responseMessage })
    if (!result.success) { alert(result.error); return }
    setRespondingTo(null)
    setResponseMessage("")
    await refresh()
  }

  const openResponses = async (opp: OpportunityItem) => {
    setViewingResponses(opp)
    setResponses(await getOpportunityResponses(opp.id))
  }

  const handleClose = async (id: string) => {
    await closeOpportunity({ id })
    setViewingResponses(null)
    await refresh()
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Radar className="h-6 w-6" /> Opportunities</h1>
          <p className="mt-1 text-xs text-muted-foreground">Post a need to other providers, or pick up nearby opportunities in your category.</p>
        </div>
        <Button onClick={() => { setShowPost(true); setError(""); setForm({ categoryId: categories[0]?.id ?? "", location: "", preferredTime: "", budget: "", description: "" }) }} className="gap-1.5 rounded-xl">
          <Plus className="h-4 w-4" />Post
        </Button>
      </div>

      <Card className="border-0 p-2 shadow-sm">
        <div className="flex gap-1">
          {(["nearby", "mine"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-medium transition-all ${tab === t ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted"}`}>
              {t === "nearby" ? "Nearby" : "My Posts"}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {(tab === "nearby" ? nearby : mine).length === 0 && (
          <Card className="p-10 text-center border-dashed"><p className="text-xs text-muted-foreground">Nothing here yet.</p></Card>
        )}
        {(tab === "nearby" ? nearby : mine).map((o) => (
          <Card key={o.id} className="border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{o.categoryName}</p>
                <p className="text-xs text-muted-foreground">{o.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{o.location}</span>
                  {o.preferredTime && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{o.preferredTime}</span>}
                  {o.budget != null && <span>Budget {formatMoney(o.budget)}</span>}
                </div>
                {tab === "nearby" && <p className="mt-1 text-[11px] text-muted-foreground">Posted by {o.postedByName}</p>}
              </div>
              {tab === "nearby" ? (
                <Button size="sm" className="flex-shrink-0 rounded-lg" onClick={() => { setRespondingTo(o); setResponseMessage("") }}>Respond</Button>
              ) : (
                <Button size="sm" variant="outline" className="flex-shrink-0 gap-1.5 rounded-lg bg-transparent" onClick={() => openResponses(o)}>
                  <MessageSquare className="h-3.5 w-3.5" />{o.responseCount}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={showPost} onOpenChange={setShowPost}>
        <DialogContent className="max-w-md rounded-xl max-h-[85vh] overflow-y-auto" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground">Post an Opportunity</h2>
            <select value={form.categoryId} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))} className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Location" />
            <Input value={form.preferredTime} onChange={(e) => setForm((p) => ({ ...p, preferredTime: e.target.value }))} placeholder="Preferred time (optional)" />
            <Input type="number" value={form.budget} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))} placeholder="Budget (optional)" />
            <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="What do you need?" className="min-h-[80px]" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowPost(false)} disabled={isSaving}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handlePost} disabled={isSaving || !form.categoryId || !form.location.trim() || !form.description.trim()}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!respondingTo} onOpenChange={(open) => !open && setRespondingTo(null)}>
        <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
          {respondingTo && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-foreground">Respond</h2>
              <Textarea value={responseMessage} onChange={(e) => setResponseMessage(e.target.value)} placeholder="Your message…" className="min-h-[80px]" />
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setRespondingTo(null)}>Cancel</Button>
                <Button className="flex-1 rounded-xl" onClick={handleRespond} disabled={!responseMessage.trim()}>Send</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingResponses} onOpenChange={(open) => !open && setViewingResponses(null)}>
        <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
          {viewingResponses && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-foreground">Responses</h2>
              {responses.length === 0 && <p className="text-xs text-muted-foreground">No responses yet.</p>}
              {responses.map((r) => (
                <div key={r.id} className="rounded-xl border border-border/70 p-3">
                  <p className="text-xs font-medium text-foreground">{r.responderName} · ★{r.responderRating.toFixed(1)}</p>
                  <p className="text-[11px] text-muted-foreground">{r.message}</p>
                </div>
              ))}
              {viewingResponses.status === "OPEN" && (
                <Button variant="outline" className="w-full rounded-xl bg-transparent" onClick={() => handleClose(viewingResponses.id)}>Close Opportunity</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
