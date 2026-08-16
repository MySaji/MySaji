"use client"

import { useEffect, useState } from "react"
import { FileText, Send, Plus, Search, ChevronDown, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  getProviderQuotes, getBillingClientOptions, createProviderQuote, sendProviderQuote,
  type ProviderQuote, type BillingClientOption,
} from "@/lib/actions/provider-billing"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

const statusColors: Record<string, string> = {
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
}

const statusLabelKeys: Record<string, TranslationKey> = {
  accepted: "provider.quotes.statusAccepted",
  sent: "provider.quotes.statusSent",
  rejected: "provider.quotes.statusRejected",
  expired: "provider.quotes.statusExpired",
  draft: "provider.quotes.statusDraft",
}

export default function QuotesPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [quotes, setQuotes] = useState<ProviderQuote[]>([])
  const [clients, setClients] = useState<BillingClientOption[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const [newQuote, setNewQuote] = useState({
    jobTitle: "", customerId: "", description: "", validDays: 14,
    items: [{ desc: "", qty: 1, rate: 0 }], notes: "",
  })

  const refresh = () => getProviderQuotes().then(setQuotes)

  useEffect(() => {
    Promise.all([refresh(), getBillingClientOptions().then(setClients)]).finally(() => setIsLoading(false))
  }, [])

  const filtered = quotes
    .filter(q => filterStatus === "All" || q.status === filterStatus.toLowerCase())
    .filter(q => q.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || q.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()))

  const addItem = () => setNewQuote(p => ({ ...p, items: [...p.items, { desc: "", qty: 1, rate: 0 }] }))

  const openCreate = () => {
    setNewQuote({ jobTitle: "", customerId: clients[0]?.id ?? "", description: "", validDays: 14, items: [{ desc: "", qty: 1, rate: 0 }], notes: "" })
    setFormError("")
    setShowCreate(true)
  }

  const handleCreate = async () => {
    setIsSaving(true)
    setFormError("")
    const result = await createProviderQuote({
      jobTitle: newQuote.jobTitle,
      customerId: newQuote.customerId,
      description: newQuote.description || undefined,
      validDays: newQuote.validDays,
      notes: newQuote.notes || undefined,
      items: newQuote.items.map(i => ({ description: i.desc, quantity: i.qty, rate: i.rate })),
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowCreate(false)
    await refresh()
  }

  const sendQuote = async (id: string) => { await sendProviderQuote({ id }); await refresh() }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("provider.quotes.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("provider.quotes.subtitle")}</p>
        </div>
        <Button onClick={openCreate} className="rounded-xl" disabled={clients.length === 0}><Plus className="w-4 h-4 mr-2" />{t("provider.quotes.newQuote")}</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t("provider.quotes.statTotal"), value: quotes.length, color: "text-foreground" },
          { label: t("provider.quotes.statAccepted"), value: quotes.filter(q => q.status === "accepted").length, color: "text-emerald-600" },
          { label: t("provider.quotes.statPending"), value: quotes.filter(q => q.status === "sent").length, color: "text-blue-600" },
          { label: t("provider.quotes.statWinRate"), value: `${Math.round(quotes.filter(q => q.status === "accepted").length / Math.max(quotes.filter(q => q.status !== "draft").length, 1) * 100)}%`, color: "text-primary" },
        ].map((s, i) => (
          <Card key={i} className="p-3 border border-border rounded-xl text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("provider.quotes.searchPlaceholder")} className="pl-9 rounded-xl bg-card border-border" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {[
            { key: "All", label: t("provider.quotes.filterAll") },
            { key: "Draft", label: t("provider.quotes.filterDraft") },
            { key: "Sent", label: t("provider.quotes.filterSent") },
            { key: "Accepted", label: t("provider.quotes.filterAccepted") },
            { key: "Rejected", label: t("provider.quotes.filterRejected") },
          ].map(s => (
            <button key={s.key} onClick={() => setFilterStatus(s.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${filterStatus === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Quote List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-sm text-muted-foreground">{t("provider.quotes.emptyText")}</p>
          </Card>
        )}
        {filtered.map(quote => (
          <Card key={quote.id} className="border border-border rounded-xl overflow-hidden">
            <button onClick={() => setExpandedQuote(expandedQuote === quote.id ? null : quote.id)} className="w-full p-4 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5 text-primary" /></div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">{quote.jobTitle}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[quote.status]}`}>{statusLabelKeys[quote.status] ? t(statusLabelKeys[quote.status]) : quote.status}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{quote.customerName}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-3">
                  <p className="text-sm font-bold text-foreground">{formatMoney(quote.amount)}</p>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedQuote === quote.id ? "rotate-180" : ""}`} />
                </div>
              </div>
            </button>
            {expandedQuote === quote.id && (
              <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                {quote.description && <p className="text-xs text-muted-foreground">{quote.description}</p>}
                <div className="space-y-1">
                  {quote.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs py-1.5 border-b border-border last:border-0">
                      <span className="text-foreground">{item.description} (x{item.quantity})</span>
                      <span className="font-medium text-foreground">{formatMoney(item.quantity * item.rate)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-1"><span className="text-foreground">{t("payment.total")}</span><span className="text-foreground">{formatMoney(quote.amount)}</span></div>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("provider.quotes.validUntil", { date: new Date(quote.validUntil).toLocaleDateString() })}</p>
                {quote.notes && <p className="text-[11px] text-muted-foreground italic bg-muted/30 p-2 rounded-lg">{quote.notes}</p>}
                {quote.status === "draft" && (
                  <Button onClick={() => sendQuote(quote.id)} size="sm" className="rounded-lg"><Send className="w-3 h-3 mr-1" />{t("provider.quotes.sendToClient")}</Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Create Quote Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-xl max-h-[85vh] overflow-y-auto" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">{t("provider.quotes.createNewQuoteTitle")}</h2>
            <Input value={newQuote.jobTitle} onChange={(e) => setNewQuote(p => ({ ...p, jobTitle: e.target.value }))} placeholder={t("provider.quotes.jobTitlePlaceholder")} className="rounded-lg bg-card border-border" />
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.quotes.clientLabel")}</label>
              <select value={newQuote.customerId} onChange={(e) => setNewQuote(p => ({ ...p, customerId: e.target.value }))} className="w-full h-9 rounded-lg bg-card border border-border text-sm text-foreground px-2">
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Textarea value={newQuote.description} onChange={(e) => setNewQuote(p => ({ ...p, description: e.target.value }))} placeholder={t("provider.quotes.descriptionPlaceholder")} className="rounded-lg bg-card border-border min-h-[60px]" />
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.quotes.validForDaysLabel")}</label>
              <Input type="number" value={newQuote.validDays} onChange={(e) => setNewQuote(p => ({ ...p, validDays: Number(e.target.value) }))} className="rounded-lg bg-card border-border" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><label className="text-sm text-muted-foreground">{t("provider.quotes.itemsLabel")}</label><button onClick={addItem} className="text-xs text-primary font-medium">{t("provider.quotes.addButton")}</button></div>
              {newQuote.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <Input value={item.desc} onChange={(e) => setNewQuote(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, desc: e.target.value } : it) }))} placeholder={t("provider.quotes.itemPlaceholder")} className="flex-1 rounded-lg bg-card border-border text-sm" />
                  <Input type="number" value={item.qty} onChange={(e) => setNewQuote(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, qty: Number(e.target.value) } : it) }))} className="w-14 rounded-lg bg-card border-border text-sm" />
                  <Input type="number" value={item.rate || ""} onChange={(e) => setNewQuote(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, rate: Number(e.target.value) } : it) }))} placeholder={t("provider.quotes.ratePlaceholder")} className="w-20 rounded-lg bg-card border-border text-sm" />
                </div>
              ))}
            </div>
            <Textarea value={newQuote.notes} onChange={(e) => setNewQuote(p => ({ ...p, notes: e.target.value }))} placeholder={t("provider.quotes.notesPlaceholder")} className="rounded-lg bg-card border-border min-h-[50px]" />
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="flex-1 rounded-xl" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleCreate} disabled={!newQuote.jobTitle.trim() || !newQuote.customerId || isSaving} className="flex-1 rounded-xl">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.quotes.createQuoteButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
