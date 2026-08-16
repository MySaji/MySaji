"use client"

import { useEffect, useState } from "react"
import { FileText, Send, Plus, Search, Eye, X, Printer, CheckCircle2, Ban, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  getProviderInvoices, getProviderInvoiceStats, getBillingClientOptions,
  createProviderInvoice, sendProviderInvoice, markProviderInvoicePaid, cancelProviderInvoice,
  type ProviderInvoice, type ProviderInvoiceStats, type BillingClientOption,
} from "@/lib/actions/provider-billing"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

const statusColors: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  sent: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
}

const statusLabelKeys: Record<string, TranslationKey> = {
  paid: "provider.invoices.statusPaid",
  sent: "provider.invoices.statusSent",
  overdue: "provider.invoices.statusOverdue",
  draft: "provider.invoices.statusDraft",
  cancelled: "provider.invoices.statusCancelled",
}

export default function InvoicesPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [invoices, setInvoices] = useState<ProviderInvoice[]>([])
  const [stats, setStats] = useState<ProviderInvoiceStats>({ collected: 0, pending: 0, overdue: 0 })
  const [clients, setClients] = useState<BillingClientOption[]>([])
  const [viewInvoice, setViewInvoice] = useState<ProviderInvoice | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const [newInvoice, setNewInvoice] = useState({
    customerId: "",
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    items: [{ desc: "", qty: 1, rate: 0 }],
  })

  const refresh = async () => {
    const [invoiceList, statsData] = await Promise.all([getProviderInvoices(), getProviderInvoiceStats()])
    setInvoices(invoiceList)
    setStats(statsData)
  }

  useEffect(() => {
    Promise.all([refresh(), getBillingClientOptions().then(setClients)]).finally(() => setIsLoading(false))
  }, [])

  const filtered = invoices
    .filter(inv => filterStatus === "All" || inv.status === filterStatus.toLowerCase())
    .filter(inv => inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()))

  const addItem = () => setNewInvoice(p => ({ ...p, items: [...p.items, { desc: "", qty: 1, rate: 0 }] }))
  const removeItem = (idx: number) => setNewInvoice(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx: number, field: "desc" | "qty" | "rate", val: string | number) => {
    setNewInvoice(p => ({ ...p, items: p.items.map((item, i) => i === idx ? { ...item, [field]: val } : item) }))
  }

  const openCreate = () => {
    setNewInvoice({ customerId: clients[0]?.id ?? "", dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0], items: [{ desc: "", qty: 1, rate: 0 }] })
    setFormError("")
    setShowCreate(true)
  }

  const handleCreate = async () => {
    setIsSaving(true)
    setFormError("")
    const result = await createProviderInvoice({
      customerId: newInvoice.customerId,
      dueDate: newInvoice.dueDate,
      items: newInvoice.items.map(i => ({ description: i.desc, quantity: i.qty, rate: i.rate })),
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowCreate(false)
    await refresh()
  }

  const handleSend = async (id: string) => { await sendProviderInvoice({ id }); await refresh() }
  const handleMarkPaid = async (id: string) => { await markProviderInvoicePaid({ id }); await refresh() }
  const handleCancel = async (id: string) => { await cancelProviderInvoice({ id }); await refresh() }

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
          <h1 className="text-2xl font-bold text-foreground">{t("provider.invoices.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("provider.invoices.subtitle")}</p>
        </div>
        <Button onClick={openCreate} className="rounded-xl" disabled={clients.length === 0}><Plus className="w-4 h-4 mr-2" />{t("provider.invoices.createInvoice")}</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 border border-border rounded-xl">
          <p className="text-[11px] text-muted-foreground">{t("provider.invoices.statCollected")}</p>
          <p className="text-lg font-bold text-emerald-600">{formatMoney(stats.collected)}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl">
          <p className="text-[11px] text-muted-foreground">{t("provider.invoices.statPending")}</p>
          <p className="text-lg font-bold text-amber-600">{formatMoney(stats.pending)}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl">
          <p className="text-[11px] text-muted-foreground">{t("provider.invoices.statOverdue")}</p>
          <p className="text-lg font-bold text-destructive">{formatMoney(stats.overdue)}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("provider.invoices.searchPlaceholder")} className="pl-9 rounded-xl bg-card border-border" />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: "All", label: t("provider.invoices.filterAll") },
            { key: "Paid", label: t("provider.invoices.filterPaid") },
            { key: "Sent", label: t("provider.invoices.filterSent") },
            { key: "Overdue", label: t("provider.invoices.filterOverdue") },
            { key: "Draft", label: t("provider.invoices.filterDraft") },
          ].map(s => (
            <button key={s.key} onClick={() => setFilterStatus(s.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterStatus === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Invoice List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-sm text-muted-foreground">{t("provider.invoices.emptyText")}</p>
          </Card>
        )}
        {filtered.map(inv => (
          <Card key={inv.id} className="p-4 border border-border rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{inv.invoiceNumber}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[inv.status]}`}>{statusLabelKeys[inv.status] ? t(statusLabelKeys[inv.status]) : inv.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{inv.customerName}</p>
                  <p className="text-[10px] text-muted-foreground">{t("provider.invoices.dueLabel", { date: new Date(inv.dueDate).toLocaleDateString() })}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-foreground">{formatMoney(inv.total)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <button onClick={() => setViewInvoice(inv)} aria-label={t("common.viewDetails")} className="p-1 rounded hover:bg-muted transition-colors"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  {inv.status === "draft" && (
                    <>
                      <button onClick={() => handleSend(inv.id)} title={t("provider.invoices.sendToClientTitle")} className="p-1 rounded hover:bg-muted transition-colors"><Send className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => handleCancel(inv.id)} title={t("common.cancel")} className="p-1 rounded hover:bg-destructive/10 transition-colors"><Ban className="w-3.5 h-3.5 text-destructive" /></button>
                    </>
                  )}
                  {(inv.status === "sent" || inv.status === "overdue") && (
                    <button onClick={() => handleMarkPaid(inv.id)} title={t("provider.invoices.markAsPaidTitle")} className="p-1 rounded hover:bg-muted transition-colors"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /></button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* View Invoice Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="max-w-md rounded-xl p-0" showCloseButton={false}>
          {viewInvoice && (
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{viewInvoice.invoiceNumber}</h2>
                  <p className="text-xs text-muted-foreground">{t("provider.invoices.issuedLabel", { date: new Date(viewInvoice.createdAt).toLocaleDateString() })}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[viewInvoice.status]}`}>{statusLabelKeys[viewInvoice.status] ? t(statusLabelKeys[viewInvoice.status]) : viewInvoice.status}</span>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{t("provider.invoices.billTo")}</p>
                <p className="text-sm font-semibold text-foreground">{viewInvoice.customerName}</p>
                {viewInvoice.customerPhone && <p className="text-xs text-muted-foreground">{viewInvoice.customerPhone}</p>}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("provider.invoices.itemsLabel")}</p>
                {viewInvoice.items.map((item, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm text-foreground">{item.description}</p>
                      <p className="text-[10px] text-muted-foreground">{t("provider.invoices.qtyLabel", { qty: item.quantity })}</p>
                    </div>
                    <p className="text-sm font-medium text-foreground">{formatMoney(item.quantity * item.rate)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("provider.invoices.subtotal")}</span><span className="text-foreground">{formatMoney(viewInvoice.subtotal)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("provider.invoices.vat")}</span><span className="text-foreground">{formatMoney(viewInvoice.tax)}</span></div>
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-border"><span className="text-foreground">{t("payment.total")}</span><span className="text-foreground">{formatMoney(viewInvoice.total)}</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setViewInvoice(null)} className="flex-1 rounded-xl">{t("common.close")}</Button>
                <Button onClick={() => window.print()} className="flex-1 rounded-xl"><Printer className="w-4 h-4 mr-1" />{t("provider.invoices.print")}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-xl max-h-[85vh] overflow-y-auto" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">{t("provider.invoices.createInvoice")}</h2>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.invoices.clientLabel")}</label>
              <select value={newInvoice.customerId} onChange={(e) => setNewInvoice(p => ({ ...p, customerId: e.target.value }))} className="w-full h-9 rounded-lg bg-card border border-border text-sm text-foreground px-2">
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.invoices.dueDateLabel")}</label>
              <Input type="date" value={newInvoice.dueDate} onChange={(e) => setNewInvoice(p => ({ ...p, dueDate: e.target.value }))} className="rounded-lg bg-card border-border" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">{t("provider.invoices.lineItemsLabel")}</label>
                <button onClick={addItem} className="text-xs text-primary font-medium hover:underline">{t("provider.invoices.addItemButton")}</button>
              </div>
              {newInvoice.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <Input value={item.desc} onChange={(e) => updateItem(idx, "desc", e.target.value)} placeholder={t("provider.invoices.descriptionPlaceholder")} className="flex-1 rounded-lg bg-card border-border text-sm" />
                  <Input type="number" value={item.qty} onChange={(e) => updateItem(idx, "qty", Number(e.target.value))} className="w-14 rounded-lg bg-card border-border text-sm" />
                  <Input type="number" value={item.rate || ""} onChange={(e) => updateItem(idx, "rate", Number(e.target.value))} placeholder={t("provider.invoices.ratePlaceholder")} className="w-20 rounded-lg bg-card border-border text-sm" />
                  {newInvoice.items.length > 1 && <button onClick={() => removeItem(idx)} aria-label={t("common.removeItem")} className="p-1 text-destructive"><X className="w-4 h-4" /></button>}
                </div>
              ))}
              <div className="text-right text-sm font-semibold text-foreground mt-2">
                {t("provider.invoices.totalPrefix")} {formatMoney(Math.round(newInvoice.items.reduce((a, i) => a + i.qty * i.rate, 0) * (1 + 0.16)))}
              </div>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="flex-1 rounded-xl" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleCreate} disabled={!newInvoice.customerId || isSaving || newInvoice.items.some(i => !i.desc.trim())} className="flex-1 rounded-xl">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.invoices.createInvoice")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
