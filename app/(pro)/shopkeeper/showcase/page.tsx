"use client"

import { ArrowLeft, Upload, Trash2, Edit2, Eye, Check, Loader2, Video, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import {
  getMyShopPortfolio, addMyShopPortfolioItem, updateMyShopPortfolioItem, removeMyShopPortfolioItem, type ShopPortfolioItemData,
} from "@/backend/actions/shopkeeper-credentials"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function ShopShowcasePage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [items, setItems] = useState<ShopPortfolioItemData[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [editingItem, setEditingItem] = useState<ShopPortfolioItemData | null>(null)
  const [previewItem, setPreviewItem] = useState<ShopPortfolioItemData | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newImage, setNewImage] = useState("")
  const [newVideo, setNewVideo] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const refresh = () => getMyShopPortfolio().then(setItems)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleAddWork = () => {
    setEditingItem(null)
    setNewTitle("")
    setNewDescription("")
    setNewImage("")
    setNewVideo("")
    setFormError("")
    setShowUpload(true)
  }

  const handleEditWork = (item: ShopPortfolioItemData) => {
    setEditingItem(item)
    setNewTitle(item.title)
    setNewDescription(item.description ?? "")
    setFormError("")
    setShowUpload(true)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setNewImage(String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setNewVideo(String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleSaveWork = async () => {
    if (!newTitle.trim()) { setFormError(t("shopkeeper.showcase.titleRequiredError")); return }
    setIsSaving(true)
    setFormError("")

    const result = editingItem
      ? await updateMyShopPortfolioItem({ id: editingItem.id, title: newTitle, description: newDescription })
      : await addMyShopPortfolioItem({ title: newTitle, description: newDescription, imageUrl: newImage, videoUrl: newVideo || undefined })

    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowUpload(false)
    await refresh()
  }

  const handlePreview = (item: ShopPortfolioItemData) => {
    setPreviewItem(item)
    setShowPreview(true)
  }

  const removeItem = async (id: string) => {
    if (!confirm(t("shopkeeper.showcase.deleteConfirm"))) return
    setItems((prev) => prev.filter((i) => i.id !== id))
    await removeMyShopPortfolioItem({ id })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 dark:from-orange-700 dark:to-orange-800 text-white p-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/shopkeeper" className="lg:hidden hover:bg-orange-500/50 p-2 rounded-lg">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-lg font-bold">{t("shopkeeper.showcase.title")}</h1>
          </div>
          <Button onClick={handleAddWork} className="bg-white text-orange-600 hover:bg-gray-100"><Upload className="w-4 h-4 mr-2" />{t("shopkeeper.showcase.addWork")}</Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl space-y-6 py-6">
        <p className="text-xs text-muted-foreground">{t("shopkeeper.showcase.subtitle")}</p>

        {/* Add/Edit form — inline within the page, not a popup */}
        {showUpload && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-900/40 shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{editingItem ? t("shopkeeper.showcase.editWorkTitle") : t("shopkeeper.showcase.addNewWorkTitle")}</h2>
              <button onClick={() => setShowUpload(false)} aria-label={t("common.close")} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex-shrink-0">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              {!editingItem && (
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                  {newImage ? (
                    <img src={newImage} alt="preview" className="w-full h-40 object-cover rounded-lg mb-3" />
                  ) : (
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  )}
                  <p className="text-xs font-medium text-gray-900 dark:text-white mb-1">{newImage ? t("shopkeeper.showcase.imageSelected") : t("shopkeeper.showcase.chooseImage")}</p>
                  {!newImage && <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-3">{t("shopkeeper.showcase.clickToUpload")}</p>}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="bg-transparent">{newImage ? t("shopkeeper.showcase.chooseDifferentImage") : t("shopkeeper.showcase.chooseFiles")}</Button>
                </div>
              )}

              {!editingItem && (
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-900 dark:text-white flex items-center gap-2 min-w-0">
                      <Video className="w-4 h-4 flex-shrink-0" /><span className="truncate">{newVideo ? t("shopkeeper.showcase.videoAttached") : t("shopkeeper.showcase.addVideoOptional")}</span>
                    </p>
                    {newVideo ? (
                      <button onClick={() => setNewVideo("")} aria-label={t("shopkeeper.showcase.removeVideoLabel")} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"><X className="w-4 h-4 text-gray-500" /></button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => videoInputRef.current?.click()} className="bg-transparent flex-shrink-0">{t("shopkeeper.showcase.chooseVideo")}</Button>
                    )}
                  </div>
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoChange} />
                  {newVideo && <video src={newVideo} controls className="w-full h-32 object-cover rounded-lg mt-3" />}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("shopkeeper.showcase.projectTitleLabel")}</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t("shopkeeper.showcase.projectTitlePlaceholder")} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("shopkeeper.showcase.descriptionLabel")}</label>
                <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder={t("shopkeeper.showcase.descriptionPlaceholder")} rows={4} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
              </div>

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowUpload(false)} className="flex-1 bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button>
                <Button onClick={handleSaveWork} className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={isSaving || !newTitle.trim() || (!editingItem && !newImage)}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-2" />{editingItem ? t("shopkeeper.showcase.updateButton") : t("shopkeeper.showcase.uploadButton")}</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {items.length === 0 && !showUpload ? (
          <div className="text-center py-12">
            <Upload className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-white font-medium mb-2">{t("shopkeeper.showcase.noWorkTitle")}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-6">{t("shopkeeper.showcase.noWorkDesc")}</p>
            <Button onClick={handleAddWork} className="bg-orange-600 hover:bg-orange-700"><Upload className="w-4 h-4 mr-2" />{t("shopkeeper.showcase.addFirstWork")}</Button>
          </div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700">
                <div className="relative h-48 bg-gray-100 dark:bg-gray-700 overflow-hidden group">
                  <img src={item.imageUrl || "/placeholder.svg"} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  {item.videoUrl && (
                    <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-medium px-2 py-1 rounded-full flex items-center gap-1">
                      <Video className="w-3 h-3" />{t("shopkeeper.showcase.videoBadge")}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => handlePreview(item)} aria-label={t("common.preview")} className="p-2 bg-white rounded-full hover:bg-gray-100"><Eye className="w-5 h-5 text-gray-700" /></button>
                  </div>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-gray-900 dark:text-white text-base mb-1">{item.title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">{new Date(item.createdAt).toLocaleDateString()}</p>
                  {item.description && <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{item.description}</p>}
                  <div className="flex items-center justify-end">
                    <div className="flex gap-2">
                      <button onClick={() => handleEditWork(item)} aria-label={t("common.edit")} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit2 className="w-4 h-4 text-orange-600" /></button>
                      <button onClick={() => removeItem(item.id)} aria-label={t("common.delete")} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-600" /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{previewItem?.title}</DialogTitle></DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              <img src={previewItem.imageUrl || "/placeholder.svg"} alt={previewItem.title} className="w-full rounded-lg" />
              {previewItem.videoUrl && (
                <video src={previewItem.videoUrl} controls className="w-full rounded-lg" />
              )}
              {previewItem.description && (
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{t("shopkeeper.showcase.descriptionLabel")}</p>
                  <p className="text-gray-900 dark:text-white">{previewItem.description}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400">{t("shopkeeper.showcase.dateLabel")}</p>
                <p className="font-medium text-gray-900 dark:text-white">{new Date(previewItem.createdAt).toLocaleDateString()}</p>
              </div>
              <Button onClick={() => setShowPreview(false)} className="w-full bg-orange-600 hover:bg-orange-700">{t("common.close")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
