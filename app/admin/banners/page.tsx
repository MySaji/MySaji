"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { Upload, Trash2, Edit2, ImageIcon, Loader2, Check, X, CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import {
  getBannersForAdmin, createBanner, updateBanner, deleteBanner, type AdminBanner,
} from "@/lib/actions/banners"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function AdminBannersPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [banners, setBanners] = useState<AdminBanner[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [placement, setPlacement] = useState<"HOME_HERO" | "SERVICES_TOP" | "PRODUCTS_TOP">("HOME_HERO")
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const PLACEMENT_LABEL: Record<string, string> = {
    HOME_HERO: t("admin.banners.placementHomeHero"),
    SERVICES_TOP: t("admin.banners.placementServicesTop"),
    PRODUCTS_TOP: t("admin.banners.placementProductsTop"),
  }

  function bannerStatus(b: AdminBanner): { label: string; className: string } {
    if (!b.isActive) return { label: t("admin.banners.statusInactive"), className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" }
    const now = Date.now()
    if (b.startDate && new Date(b.startDate).getTime() > now) return { label: t("admin.banners.statusScheduled"), className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" }
    if (b.endDate && new Date(b.endDate).getTime() < now) return { label: t("admin.banners.statusExpired"), className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" }
    return { label: t("admin.banners.statusActive"), className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" }
  }

  const refresh = () => getBannersForAdmin().then(setBanners)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [showForm])

  const resetForm = () => {
    setEditingId(null)
    setTitle("")
    setSubtitle("")
    setLinkUrl("")
    setImageUrl("")
    setPlacement("HOME_HERO")
    setSortOrder(0)
    setIsActive(true)
    setStartDate(undefined)
    setEndDate(undefined)
    setFormError("")
  }

  const handleAddBanner = () => {
    resetForm()
    setShowForm(true)
  }

  const handleEditBanner = (b: AdminBanner) => {
    setEditingId(b.id)
    setTitle(b.title)
    setSubtitle(b.subtitle ?? "")
    setLinkUrl(b.linkUrl ?? "")
    setImageUrl(b.imageUrl)
    setPlacement(b.placement as "HOME_HERO" | "SERVICES_TOP" | "PRODUCTS_TOP")
    setSortOrder(b.sortOrder)
    setIsActive(b.isActive)
    setStartDate(b.startDate ? new Date(b.startDate) : undefined)
    setEndDate(b.endDate ? new Date(b.endDate) : undefined)
    setFormError("")
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    resetForm()
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageUrl(String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!title.trim()) { setFormError(t("admin.banners.titleRequiredError")); return }
    if (!imageUrl) { setFormError(t("admin.banners.imageRequiredError")); return }
    setIsSaving(true)
    setFormError("")

    const input = {
      title, subtitle, linkUrl, imageUrl, placement, sortOrder, isActive,
      startDate: startDate ? startDate.toISOString() : undefined,
      endDate: endDate ? endDate.toISOString() : undefined,
    }
    const result = editingId ? await updateBanner({ ...input, id: editingId }) : await createBanner(input)

    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowForm(false)
    resetForm()
    await refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.banners.deleteConfirm"))) return
    setBanners((prev) => prev.filter((b) => b.id !== id))
    await deleteBanner({ id })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("admin.banners.title")}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t("admin.banners.subtitle")}</p>
        </div>
        {!showForm && (
          <Button onClick={handleAddBanner} className="gap-2"><Upload className="w-4 h-4" />{t("admin.banners.addBanner")}</Button>
        )}
      </div>

      {showForm && (
        <div ref={formRef} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
            <h2 className="font-semibold text-gray-900 dark:text-white">{editingId ? t("admin.banners.editBannerTitle") : t("admin.banners.addNewBannerTitle")}</h2>
            <button onClick={handleCancelForm} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 text-center flex flex-col items-center justify-center">
              {imageUrl ? (
                <img src={imageUrl} alt="preview" className="w-full max-h-48 object-cover rounded-lg mb-3" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-3">
                  <ImageIcon className="w-6 h-6 text-blue-500" />
                </div>
              )}
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{imageUrl ? t("admin.banners.imageSelected") : t("admin.banners.chooseImage")}</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="bg-transparent">
                {imageUrl ? t("admin.banners.chooseDifferentImage") : t("admin.banners.chooseImage")}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">{t("admin.banners.titleLabel")}</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("admin.banners.titlePlaceholder")} />
              </div>
              <div>
                <Label className="mb-2 block">{t("admin.banners.placementLabel")}</Label>
                <Select value={placement} onValueChange={(v) => setPlacement(v as "HOME_HERO" | "SERVICES_TOP" | "PRODUCTS_TOP")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOME_HERO">{t("admin.banners.placementHomeHero")}</SelectItem>
                    <SelectItem value="SERVICES_TOP">{t("admin.banners.placementServicesTop")}</SelectItem>
                    <SelectItem value="PRODUCTS_TOP">{t("admin.banners.placementProductsTop")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">{t("admin.banners.subtitleLabel")}</Label>
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder={t("admin.banners.subtitlePlaceholder")} />
            </div>

            <div>
              <Label className="mb-2 block">{t("admin.banners.linkUrlLabel")}</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="/customer/services?category=cleaners" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2 block">{t("admin.banners.sortOrderLabel")}</Label>
                <Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="mb-2 block">{t("admin.banners.startDateLabel")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {startDate ? format(startDate, "PP") : t("admin.banners.anytime")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startDate} onSelect={setStartDate} /></PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="mb-2 block">{t("admin.banners.endDateLabel")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {endDate ? format(endDate, "PP") : t("admin.banners.noEndDate")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={endDate} onSelect={setEndDate} /></PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>{t("admin.banners.activeLabel")}</Label>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
              <Button variant="outline" onClick={handleCancelForm} className="flex-1 bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleSave} className="flex-1" disabled={isSaving || !title.trim() || !imageUrl}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-2" />{editingId ? t("admin.banners.updateButton") : t("admin.banners.createButton")}</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {banners.length === 0 && !showForm ? (
        <Card className="p-12 text-center border-dashed">
          <ImageIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-900 dark:text-white font-medium mb-2">{t("admin.banners.noBannersTitle")}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t("admin.banners.noBannersDesc")}</p>
          <Button onClick={handleAddBanner} className="gap-2"><Upload className="w-4 h-4" />{t("admin.banners.addFirstBanner")}</Button>
        </Card>
      ) : banners.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banners.map((b) => {
            const status = bannerStatus(b)
            return (
              <div key={b.id} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 flex">
                <div className="relative w-32 flex-shrink-0 bg-gray-100 dark:bg-gray-700">
                  <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 p-3.5 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{b.title}</p>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => handleEditBanner(b)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5 text-blue-600" /></button>
                      <button onClick={() => handleDelete(b.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-600" /></button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{PLACEMENT_LABEL[b.placement]}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">#{b.sortOrder}</span>
                  </div>
                  {b.subtitle && <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{b.subtitle}</p>}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
