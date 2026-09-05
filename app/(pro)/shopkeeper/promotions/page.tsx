"use client"

import { useEffect, useState } from "react"
import {
  Tag, Plus, Search, Calendar, Percent, DollarSign, Trash2,
  Copy, CheckCircle2, Clock, XCircle, Users, Loader2, Gift
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  getMyPromotions, createMyPromotion, deleteMyPromotion, togglePromotionPause,
  type ShopkeeperPromotion, type ShopkeeperPromotionType,
} from "@/lib/actions/shopkeeper-promotions"
import { getProductCategoryOptions, type ShopkeeperProductCategoryOption } from "@/lib/actions/shopkeeper-products"
import { useLocalization } from "@/lib/hooks/useLocalization"

const TYPE_ICON: Record<ShopkeeperPromotionType, typeof Percent> = {
  percentage: Percent,
  fixed: DollarSign,
  bogo: Gift,
}

export default function ShopkeeperPromotionsPage() {
  const { t, formatMoney, currency } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [promotions, setPromotions] = useState<ShopkeeperPromotion[]>([])
  const [categories, setCategories] = useState<ShopkeeperProductCategoryOption[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const [newPromo, setNewPromo] = useState({
    name: "", code: "", type: "percentage" as ShopkeeperPromotionType, value: "",
    minOrder: "", maxUses: "", startDate: "", endDate: "", categoryId: "", description: "",
  })

  const refresh = async () => {
    const [promos, cats] = await Promise.all([getMyPromotions(), getProductCategoryOptions()])
    setPromotions(promos)
    setCategories(cats)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filters = [
    { key: "all", label: t("shopkeeper.promotions.filterAll") },
    { key: "active", label: t("shopkeeper.promotions.filterActive") },
    { key: "scheduled", label: t("shopkeeper.promotions.filterScheduled") },
    { key: "expired", label: t("shopkeeper.promotions.filterExpired") },
    { key: "paused", label: t("shopkeeper.promotions.filterPaused") },
  ]

  const filteredPromotions = promotions.filter(promo => {
    const matchesSearch = promo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      promo.code.toLowerCase().includes(searchQuery.toLowerCase())
    if (activeFilter === "all") return matchesSearch
    return matchesSearch && promo.status === activeFilter
  })

  const stats = {
    active: promotions.filter(p => p.status === "active").length,
    totalUsed: promotions.reduce((acc, p) => acc + p.usedCount, 0),
  }

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      active: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", icon: <CheckCircle2 className="w-3 h-3" /> },
      scheduled: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", icon: <Clock className="w-3 h-3" /> },
      expired: { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", icon: <XCircle className="w-3 h-3" /> },
      paused: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", icon: <Clock className="w-3 h-3" /> },
    }
    return configs[status] || configs.active
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: t("shopkeeper.promotions.filterActive"),
      scheduled: t("shopkeeper.promotions.filterScheduled"),
      expired: t("shopkeeper.promotions.filterExpired"),
      paused: t("shopkeeper.promotions.filterPaused"),
    }
    return labels[status] ?? status
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handleCreatePromo = async () => {
    if (!newPromo.name || !newPromo.code || !newPromo.value || !newPromo.startDate) {
      setFormError(t("shopkeeper.promotions.fillRequiredError"))
      return
    }
    setIsSaving(true)
    setFormError("")
    const result = await createMyPromotion({
      name: newPromo.name,
      code: newPromo.code,
      type: newPromo.type,
      value: Number(newPromo.value),
      minOrder: newPromo.minOrder ? Number(newPromo.minOrder) : 0,
      maxUses: newPromo.maxUses ? Number(newPromo.maxUses) : undefined,
      startDate: newPromo.startDate,
      endDate: newPromo.endDate || undefined,
      categoryId: newPromo.categoryId || undefined,
      description: newPromo.description || undefined,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowCreateModal(false)
    setNewPromo({ name: "", code: "", type: "percentage", value: "", minOrder: "", maxUses: "", startDate: "", endDate: "", categoryId: "", description: "" })
    await refresh()
  }

  const handleDeletePromo = async (id: string) => {
    if (!confirm(t("shopkeeper.promotions.deleteConfirm"))) return
    setBusyId(id)
    const result = await deleteMyPromotion({ id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleToggleStatus = async (id: string) => {
    setBusyId(id)
    const result = await togglePromotionPause({ id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("shopkeeper.promotions.title")}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("shopkeeper.promotions.subtitle")}</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="bg-amber-600 hover:bg-amber-700 gap-2 text-xs">
            <Plus className="w-4 h-4" />
            {t("shopkeeper.promotions.createPromotion")}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { label: t("shopkeeper.promotions.statActivePromos"), value: stats.active, icon: Tag, color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" },
            { label: t("shopkeeper.promotions.statTotalUses"), value: stats.totalUsed, icon: Users, color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600" },
          ].map((stat, idx) => {
            const Icon = stat.icon
            return (
              <Card key={idx} className="p-4 border-0 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${stat.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{stat.label}</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white">{stat.value}</p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        {/* Filters */}
        <Card className="p-3 mb-4 border-0 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t("shopkeeper.promotions.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <div className="flex gap-1.5">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setActiveFilter(filter.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                    activeFilter === filter.key
                      ? "bg-amber-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Promotions List */}
        <div className="space-y-3">
          {filteredPromotions.length > 0 ? (
            filteredPromotions.map((promo) => {
              const statusConfig = getStatusConfig(promo.status)
              const TypeIcon = TYPE_ICON[promo.type]
              const usagePercent = promo.maxUses ? Math.round((promo.usedCount / promo.maxUses) * 100) : 0
              const isBusy = busyId === promo.id

              return (
                <Card key={promo.id} className="p-4 lg:p-5 border-0 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{promo.name}</h3>
                          {promo.description && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{promo.description}</p>}
                        </div>
                        <div className={`px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 ${statusConfig.bg} ${statusConfig.text}`}>
                          {statusConfig.icon}
                          {getStatusLabel(promo.status)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <button
                          onClick={() => handleCopyCode(promo.code)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs font-mono font-bold text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          {copiedCode === promo.code ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                          {promo.code}
                        </button>
                        <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                          <TypeIcon className="w-3.5 h-3.5" />
                          {promo.type === "percentage" ? t("shopkeeper.promotions.percentOff", { value: promo.value }) : promo.type === "fixed" ? t("shopkeeper.promotions.fixedOffAmount", { amount: formatMoney(promo.value) }) : t("shopkeeper.promotions.bogoLabel")}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {t("shopkeeper.promotions.minOrderLabel", { amount: formatMoney(promo.minOrder) })}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {promo.endDate ? t("shopkeeper.promotions.dateRangeTo", { start: formatDate(promo.startDate), end: formatDate(promo.endDate) }) : `${formatDate(promo.startDate)} ${t("shopkeeper.promotions.noEndDate")}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {promo.categoryName ?? t("shopkeeper.promotions.allProducts")}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 lg:w-48 flex-shrink-0">
                      <div className="w-full">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-gray-500 dark:text-gray-400">{t("shopkeeper.promotions.usageLabel")}</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">{promo.usedCount}{promo.maxUses ? `/${promo.maxUses}` : ""}</span>
                        </div>
                        {promo.maxUses ? (
                          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${usagePercent >= 90 ? "bg-red-500" : usagePercent >= 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(usagePercent, 100)}%` }}
                            />
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400">{t("shopkeeper.promotions.unlimitedUses")}</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {(promo.status === "active" || promo.status === "paused") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[11px] h-7 bg-transparent"
                            onClick={() => handleToggleStatus(promo.id)}
                            disabled={isBusy}
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : promo.status === "active" ? t("shopkeeper.promotions.pauseButton") : t("shopkeeper.promotions.resumeButton")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 bg-transparent text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => handleDeletePromo(promo.id)}
                          disabled={isBusy}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })
          ) : (
            <Card className="p-12 border-0 shadow-sm text-center">
              <Tag className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{t("shopkeeper.promotions.noPromotionsFound")}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("shopkeeper.promotions.noPromotionsHint")}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Create Promotion Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("shopkeeper.promotions.createModalTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.nameLabel")}</label>
              <Input
                value={newPromo.name}
                onChange={(e) => setNewPromo({ ...newPromo, name: e.target.value })}
                placeholder={t("shopkeeper.promotions.namePlaceholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.codeLabel")}</label>
                <Input
                  value={newPromo.code}
                  onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                  placeholder={t("shopkeeper.promotions.codePlaceholder")}
                  className="font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.typeLabel")}</label>
                <select
                  value={newPromo.type}
                  onChange={(e) => setNewPromo({ ...newPromo, type: e.target.value as ShopkeeperPromotionType })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-xs"
                >
                  <option value="percentage">{t("shopkeeper.promotions.typePercentage")}</option>
                  <option value="fixed">{t("shopkeeper.promotions.typeFixed")}</option>
                  <option value="bogo">{t("shopkeeper.promotions.typeBogo")}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {newPromo.type === "percentage" ? t("shopkeeper.promotions.valueLabelPercent") : newPromo.type === "fixed" ? t("shopkeeper.promotions.valueLabelFixed", { currency }) : t("shopkeeper.promotions.valueLabelBogo")}
                </label>
                <Input
                  type="number"
                  value={newPromo.value}
                  onChange={(e) => setNewPromo({ ...newPromo, value: e.target.value })}
                  placeholder={newPromo.type === "percentage" ? t("shopkeeper.promotions.valuePercentPlaceholder") : t("shopkeeper.promotions.valueFixedPlaceholder")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.minOrderInputLabel", { currency })}</label>
                <Input
                  type="number"
                  value={newPromo.minOrder}
                  onChange={(e) => setNewPromo({ ...newPromo, minOrder: e.target.value })}
                  placeholder={t("shopkeeper.promotions.minOrderPlaceholder")}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.startDateLabel")}</label>
                <Input
                  type="date"
                  value={newPromo.startDate}
                  onChange={(e) => setNewPromo({ ...newPromo, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.endDateLabel")}</label>
                <Input
                  type="date"
                  value={newPromo.endDate}
                  onChange={(e) => setNewPromo({ ...newPromo, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.maxUsesLabel")}</label>
                <Input
                  type="number"
                  value={newPromo.maxUses}
                  onChange={(e) => setNewPromo({ ...newPromo, maxUses: e.target.value })}
                  placeholder={t("shopkeeper.promotions.maxUsesPlaceholder")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.appliesToLabel")}</label>
                <select
                  value={newPromo.categoryId}
                  onChange={(e) => setNewPromo({ ...newPromo, categoryId: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-xs"
                >
                  <option value="">{t("shopkeeper.promotions.allProducts")}</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">{t("shopkeeper.promotions.descriptionLabel")}</label>
              <Textarea
                value={newPromo.description}
                onChange={(e) => setNewPromo({ ...newPromo, description: e.target.value })}
                placeholder={t("shopkeeper.promotions.descriptionPlaceholder")}
                className="min-h-[80px]"
              />
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowCreateModal(false)} disabled={isSaving}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={handleCreatePromo} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.promotions.createPromotion")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
