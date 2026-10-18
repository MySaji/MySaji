"use client"

import { useEffect, useState } from "react"
import { FileText, Send, Plus, Search, ChevronDown, Loader2 } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import {
  getProviderQuotes, getBillingClientOptions, createProviderQuote, sendProviderQuote,
  type ProviderQuote, type BillingClientOption,
} from "@/backend/actions/provider-billing"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import type { TranslationKey } from "@/backend/domain/i18n"

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
  const [pageError, setPageError] = useState("")
  const [sending, setSending] = useState<string | null>(null)
  const [notice, setNotice] = useState("")

  const [newQuote, setNewQuote] = useState({
    jobTitle: "", customerId: "", description: "", validDays: 14,
    items: [{ desc: "", qty: 1, rate: 0 }], notes: "",
  })

  const refresh = () => getProviderQuotes().then(setQuotes)

  useEffect(() => {
    Promise.all([refresh(), getBillingClientOptions().then(setClients)]).catch(() => setPageError("We could not load your quotes. Please try again.")).finally(() => setIsLoading(false))
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
    if (isSaving) return
    if (newQuote.items.some(item => !item.desc.trim() || !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.rate) || item.rate < 0)) { setFormError("Add a description, a positive quantity and a valid rate for every item."); return }
    setIsSaving(true)
    setFormError("")
    try {
    const result = await createProviderQuote({
      jobTitle: newQuote.jobTitle,
      customerId: newQuote.customerId,
      description: newQuote.description || undefined,
      validDays: newQuote.validDays,
      notes: newQuote.notes || undefined,
      items: newQuote.items.map(i => ({ description: i.desc, quantity: i.qty, rate: i.rate })),
    })
    if (!result.success) { setFormError(result.error); return }
    setShowCreate(false)
    await refresh()
    } catch { setFormError("Your quote could not be saved. Please check your connection and try again.") }
    finally { setIsSaving(false) }
  }

  const sendQuote = async (id: string) => {
    if (sending) return
    setSending(id); setPageError(""); setNotice("")
    try {
      const result = await sendProviderQuote({ id })
      if (!result.success) { setPageError(result.error); return }
      setNotice("Quote sent to your customer.")
      await refresh()
    } catch { setPageError("We could not confirm that the quote was sent. Refresh before trying again.") }
    finally { setSending(null) }
  }

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
          <h1 className="text-xl font-bold text-foreground">{t("provider.quotes.title")}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t("provider.quotes.subtitle")}</p>
        </div>
        <Button onClick={openCreate} className="rounded-xl" disabled={clients.length === 0}><Plus className="w-4 h-4 mr-2" />{t("provider.quotes.newQuote")}</Button>
      </div>

      {pageError && <div role="alert" className="rounded-xl border border-red-200 p-4 text-sm text-red-700">{pageError}<button className="ml-3 underline" onClick={async () => { try { await Promise.all([refresh(), getBillingClientOptions().then(setClients)]); setPageError("") } catch { setPageError("Still unable to connect. Please try again.") } }}>Refresh</button></div>}
      {notice && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{notice}</p>}
      <section className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 sm:grid-cols-3" aria-label="Quote workflow">{[{ title: "1. Agree the scope", text: "Describe the work and itemise the quantities and rates." }, { title: "2. Send for review", text: "Save a draft, check the totals, then send it to your customer." }, { title: "3. Follow the response", text: "Track sent and accepted quotes using the status filters below." }].map(item => <div key={item.title}><h2 className="text-sm font-semibold">{item.title}</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">{item.text}</p></div>)}</section>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t("provider.quotes.statTotal"), value: quotes.length, color: "text-foreground" },
          { label: t("provider.quotes.statAccepted"), value: quotes.filter(q => q.status === "accepted").length, color: "text-emerald-600" },
          { label: t("provider.quotes.statPending"), value: quotes.filter(q => q.status === "sent").length, color: "text-blue-600" },
          { label: t("provider.quotes.statWinRate"), value: `${Math.round(quotes.filter(q => q.status === "accepted").length / Math.max(quotes.filter(q => q.status !== "draft").length, 1) * 100)}%`, color: "text-primary" },
        ].map((s, i) => (
          <Card key={i} className="p-3 border border-border rounded-xl text-center">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
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
            <button key={s.key} onClick={() => setFilterStatus(s.key)} className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${filterStatus === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Quote List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-xs text-muted-foreground">{t("provider.quotes.emptyText")}</p>
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
                      <span className="text-xs font-semibold text-foreground truncate">{quote.jobTitle}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[quote.status]}`}>{statusLabelKeys[quote.status] ? t(statusLabelKeys[quote.status]) : quote.status}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{quote.customerName}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-3">
                  <p className="text-xs font-bold text-foreground">{formatMoney(quote.amount)}</p>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedQuote === quote.id ? "rotate-180" : ""}`} />
                </div>
              </div>
            </button>
            {expandedQuote === quote.id && (
              <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                {quote.description && <p className="text-[11px] text-muted-foreground">{quote.description}</p>}
                <div className="space-y-1">
                  {quote.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-[11px] py-1.5 border-b border-border last:border-0">
                      <span className="text-foreground">{item.description} (x{item.quantity})</span>
                      <span className="font-medium text-foreground">{formatMoney(item.quantity * item.rate)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-bold pt-1"><span className="text-foreground">{t("payment.total")}</span><span className="text-foreground">{formatMoney(quote.amount)}</span></div>
                </div>
                <p className="text-[10px] text-muted-foreground">{t("provider.quotes.validUntil", { date: new Date(quote.validUntil).toLocaleDateString() })}</p>
                {quote.notes && <p className="text-[10px] text-muted-foreground italic bg-muted/30 p-2 rounded-lg">{quote.notes}</p>}
                {quote.status === "draft" && (
                  <Button disabled={sending !== null} onClick={() => sendQuote(quote.id)} size="sm" className="rounded-lg"><Send className="w-3 h-3 mr-1" />{t("provider.quotes.sendToClient")}</Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Create Quote Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl rounded-xl max-h-[85vh] overflow-y-auto" showCloseButton={false}>
          <div className="space-y-4">
            <DialogTitle className="text-lg font-bold text-foreground">{t("provider.quotes.createNewQuoteTitle")}</DialogTitle><DialogDescription>Itemise your work and check the total before sending it to your customer.</DialogDescription>
            <Input aria-label="Quote title" value={newQuote.jobTitle} onChange={(e) => setNewQuote(p => ({ ...p, jobTitle: e.target.value }))} placeholder={t("provider.quotes.jobTitlePlaceholder")} className="rounded-lg bg-card border-border" />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("provider.quotes.clientLabel")}</label>
              <select aria-label="Customer" value={newQuote.customerId} onChange={(e) => setNewQuote(p => ({ ...p, customerId: e.target.value }))} className="w-full h-9 rounded-lg bg-card border border-border text-xs text-foreground px-2">
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Textarea aria-label="Scope of work" value={newQuote.description} onChange={(e) => setNewQuote(p => ({ ...p, description: e.target.value }))} placeholder={t("provider.quotes.descriptionPlaceholder")} className="rounded-lg bg-card border-border min-h-[60px]" />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("provider.quotes.validForDaysLabel")}</label>
              <Input aria-label="Quote validity in days" type="number" min={1} max={365} value={newQuote.validDays} onChange={(e) => setNewQuote(p => ({ ...p, validDays: Number(e.target.value) }))} className="rounded-lg bg-card border-border" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><label className="text-xs text-muted-foreground">{t("provider.quotes.itemsLabel")}</label><button onClick={addItem} className="text-[11px] text-primary font-medium">{t("provider.quotes.addButton")}</button></div>
              {newQuote.items.map((item, idx) => (
                <div key={idx} className="mb-3 grid grid-cols-2 gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[1fr_80px_100px_auto]">
                  <Input aria-label={`Item ${idx + 1} description`} value={item.desc} onChange={(e) => setNewQuote(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, desc: e.target.value } : it) }))} placeholder={t("provider.quotes.itemPlaceholder")} className="col-span-2 min-w-0 rounded-lg bg-card border-border text-sm sm:col-span-1" />
                  <Input aria-label={`Item ${idx + 1} quantity`} type="number" min={0.01} step="any" value={item.qty} onChange={(e) => setNewQuote(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, qty: Number(e.target.value) } : it) }))} className="w-full rounded-lg bg-card border-border text-sm" />
                  <Input aria-label={`Item ${idx + 1} rate`} type="number" min={0} step="0.01" value={item.rate || ""} onChange={(e) => setNewQuote(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, rate: Number(e.target.value) } : it) }))} placeholder={t("provider.quotes.ratePlaceholder")} className="w-full rounded-lg bg-card border-border text-sm" />
                  <button type="button" disabled={newQuote.items.length === 1} onClick={() => setNewQuote(previous => ({ ...previous, items: previous.items.filter((_, index) => index !== idx) }))} aria-label={`Remove item ${idx + 1}`} className="min-h-11 text-xs text-destructive underline disabled:opacity-30">Remove</button>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-4 text-blue-950"><span className="text-sm font-semibold">Quote total</span><strong>{formatMoney(newQuote.items.reduce((sum, item) => sum + (Number.isFinite(item.qty * item.rate) ? item.qty * item.rate : 0), 0))}</strong></div>
            </div>
            <Textarea aria-label="Additional notes" value={newQuote.notes} onChange={(e) => setNewQuote(p => ({ ...p, notes: e.target.value }))} placeholder={t("provider.quotes.notesPlaceholder")} className="rounded-lg bg-card border-border min-h-[50px]" />
            {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
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
