"use client"

import { useEffect, useState } from "react"
import { Plus, Search, Edit2, Trash2, Clock, Star, Eye, EyeOff, Tag, Layers, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  getMyServices, getServiceCategoryOptions, createMyService, updateMyService, toggleMyServiceActive, deleteMyService,
  type ProviderServiceItem, type ServiceCategoryOption,
} from "@/lib/actions/provider-services"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ServicesCatalogPage() {
  const { t, tn, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [services, setServices] = useState<ProviderServiceItem[]>([])
  const [categories, setCategories] = useState<ServiceCategoryOption[]>([])
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingService, setEditingService] = useState<ProviderServiceItem | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("All")
  const [form, setForm] = useState({ title: "", description: "", categoryId: "", basePrice: "", duration: "", image: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = async () => {
    const [serviceList, categoryList] = await Promise.all([getMyServices(), getServiceCategoryOptions()])
    setServices(serviceList)
    setCategories(categoryList)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm(p => ({ ...p, image: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const filtered = services
    .filter(s => filterCategory === "All" || s.categoryName === filterCategory)
    .filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))

  const activeCount = services.filter(s => s.isActive).length
  const totalBookings = services.reduce((a, s) => a + s.totalBookings, 0)
  const avgRating = services.length > 0 ? (services.reduce((a, s) => a + s.rating, 0) / services.length).toFixed(1) : "0.0"

  const openAddDialog = () => {
    setForm({ title: "", description: "", categoryId: categories[0]?.id ?? "", basePrice: "", duration: "", image: "" })
    setEditingService(null)
    setFormError("")
    setShowAddDialog(true)
  }

  const openEditDialog = (service: ProviderServiceItem) => {
    setForm({ title: service.title, description: service.description, categoryId: service.categoryId ?? "", basePrice: String(service.basePrice), duration: "", image: service.image || "" })
    setEditingService(service)
    setFormError("")
    setShowAddDialog(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setIsSaving(true)
    setFormError("")
    const payload = { title: form.title, description: form.description, categoryId: form.categoryId, basePrice: Number(form.basePrice), image: form.image || undefined }
    const result = editingService
      ? await updateMyService({ id: editingService.id, ...payload })
      : await createMyService(payload)
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowAddDialog(false)
    await refresh()
  }

  const toggleActive = async (id: string) => {
    setServices(prev => prev.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s))
    await toggleMyServiceActive({ id })
  }

  const deleteService = async (id: string) => {
    const result = await deleteMyService({ id })
    if (result.success) setServices(prev => prev.filter(s => s.id !== id))
    else alert(result.error)
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
          <h1 className="text-2xl font-bold text-foreground">{t("provider.services.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("provider.services.subtitle")}</p>
        </div>
        <Button onClick={openAddDialog} className="rounded-xl" disabled={categories.length === 0}><Plus className="w-4 h-4 mr-2" />{t("provider.services.addService")}</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-2xl font-bold text-foreground">{activeCount}</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.services.statActive")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-2xl font-bold text-foreground">{totalBookings}</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.services.statBookings")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-2xl font-bold text-foreground">{avgRating}</p>
          <p className="text-[11px] text-muted-foreground">{t("provider.services.statAvgRating")}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("provider.services.searchPlaceholder")} className="pl-9 rounded-xl bg-card border-border" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["All", ...categories.map(c => c.name)].map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${filterCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Service List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-sm text-muted-foreground">{t("provider.services.emptyText")}</p>
          </Card>
        )}
        {filtered.map(service => (
          <Card key={service.id} className={`p-4 border rounded-xl transition-all ${service.isActive && service.approvalStatus === "APPROVED" ? "border-border" : "border-border opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-20 h-14 flex-shrink-0 bg-muted rounded-md overflow-hidden">
                  {service.image ? (
                    <img src={service.image} alt={service.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No Image</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">{service.title}</h3>
                    {!service.isActive && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{t("provider.services.hiddenBadge")}</span>}
                    {service.approvalStatus === "PENDING" && (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">{t("provider.services.pendingReviewBadge")}</span>
                    )}
                    {service.approvalStatus === "REJECTED" && (
                      <span title={service.rejectionReason ?? undefined} className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded-full">{t("provider.services.notApprovedBadge")}</span>
                    )}
                  </div>
                  {service.approvalStatus === "REJECTED" && service.rejectionReason && (
                    <p className="text-xs text-red-600 dark:text-red-400 mb-1">{t("provider.services.reasonLabel")} {service.rejectionReason}</p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{service.description}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {service.categoryName && <span className="flex items-center gap-1 text-muted-foreground"><Tag className="w-3 h-3" />{service.categoryName}</span>}
                    <span className="flex items-center gap-1 text-muted-foreground"><Layers className="w-3 h-3" />{tn("provider.services.bookingsCount", service.totalBookings)}</span>
                    {service.rating > 0 && <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-current" />{service.rating.toFixed(1)}</span>}
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="mb-2">
                  <span className="text-lg font-bold text-foreground">{formatMoney(service.basePrice)}</span>
                  <span className="text-[10px] text-muted-foreground block">{t("provider.services.perHour")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(service.id)}
                    aria-label={service.isActive ? t("provider.services.deactivate") : t("provider.services.activate")}
                    className={`p-1.5 rounded-lg transition-colors ${service.isActive ? "hover:bg-muted" : "hover:bg-primary/10"}`}
                  >
                    {service.isActive ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => openEditDialog(service)} aria-label={t("common.edit")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => deleteService(service.id)} aria-label={t("common.delete")} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md rounded-xl" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">{editingService ? t("provider.services.editServiceTitle") : t("provider.services.addServiceTitle")}</h2>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.services.serviceNameLabel")}</label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder={t("provider.services.serviceNamePlaceholder")} className="rounded-lg bg-card border-border" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.services.descriptionLabel")}</label>
              <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder={t("provider.services.descriptionPlaceholder")} className="rounded-lg bg-card border-border min-h-[80px]" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.services.categoryLabel")}</label>
              <select value={form.categoryId} onChange={(e) => setForm(p => ({ ...p, categoryId: e.target.value }))} className="w-full h-9 rounded-lg bg-card border border-border text-sm text-foreground px-2">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.services.basePriceLabel")}</label>
              <Input type="number" value={form.basePrice} onChange={(e) => setForm(p => ({ ...p, basePrice: e.target.value }))} placeholder="0" className="rounded-lg bg-card border-border" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t("provider.services.imageLabel")}</label>
              <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm text-foreground" />
              {form.image && (
                <img src={form.image} alt="preview" className="mt-2 w-full h-36 object-cover rounded-md" />
              )}
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)} className="flex-1 rounded-xl" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleSave} disabled={!form.title.trim() || !form.categoryId || isSaving} className="flex-1 rounded-xl">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingService ? t("provider.services.updateButton") : t("provider.services.addService")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
