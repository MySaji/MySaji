"use client"

import { ArrowLeft, Upload, Trash2, Edit2, Eye, Check, Loader2, Video, X, ImageIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import {
  getMyPortfolio, addMyPortfolioItem, updateMyPortfolioItem, removeMyPortfolioItem, type ProviderPortfolioItem,
} from "@/backend/actions/provider-credentials"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function ProofOfWorkPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [proofs, setProofs] = useState<ProviderPortfolioItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [editingProof, setEditingProof] = useState<ProviderPortfolioItem | null>(null)
  const [previewProof, setPreviewProof] = useState<ProviderPortfolioItem | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newImage, setNewImage] = useState("")
  const [newVideo, setNewVideo] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const refresh = () => getMyPortfolio().then(setProofs)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [showForm])

  const handleAddWork = () => {
    setEditingProof(null)
    setNewTitle("")
    setNewDescription("")
    setNewImage("")
    setNewVideo("")
    setFormError("")
    setShowForm(true)
  }

  const handleEditWork = (proof: ProviderPortfolioItem) => {
    setEditingProof(proof)
    setNewTitle(proof.title)
    setNewDescription(proof.description ?? "")
    setFormError("")
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingProof(null)
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
    if (!newTitle.trim()) { setFormError("Please enter a title"); return }
    setIsSaving(true)
    setFormError("")

    const result = editingProof
      ? await updateMyPortfolioItem({ id: editingProof.id, title: newTitle, description: newDescription })
      : await addMyPortfolioItem({ title: newTitle, description: newDescription, imageUrl: newImage, videoUrl: newVideo || undefined })

    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowForm(false)
    setEditingProof(null)
    await refresh()
  }

  const handlePreview = (proof: ProviderPortfolioItem) => {
    setPreviewProof(proof)
    setShowPreview(true)
  }

  const removeProof = async (id: string) => {
    if (!confirm(t("provider.proof.deleteConfirm"))) return
    setProofs((prev) => prev.filter((p) => p.id !== id))
    await removeMyPortfolioItem({ id })
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
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white p-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {/* Reached from the sidebar now rather than from Profile, so the
                mobile back arrow goes home instead of to a page the customer
                never came through. */}
            <Link href="/provider" className="lg:hidden hover:bg-blue-500/50 p-2 rounded-lg">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="truncate text-base font-bold sm:text-lg">{t("provider.proof.title")}</h1>
          </div>
          {!showForm && (
            <Button onClick={handleAddWork} size="sm" className="flex-shrink-0 bg-white text-blue-600 hover:bg-gray-100 sm:h-10 sm:px-4">
              <Upload className="mr-1.5 h-4 w-4" />{t("provider.proof.addWork")}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl space-y-6 py-6">
        {/* Inline Add/Edit Form */}
        {showForm && (
          <div ref={formRef} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {editingProof ? t("provider.proof.editWorkTitle") : t("provider.proof.addNewWorkTitle")}
              </h2>
              <button onClick={handleCancelForm} aria-label={t("common.close")} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {!editingProof && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 text-center flex flex-col items-center justify-center">
                    {newImage ? (
                      <img src={newImage} alt="preview" className="w-full h-36 object-cover rounded-lg mb-3" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-3">
                        <ImageIcon className="w-6 h-6 text-blue-500" />
                      </div>
                    )}
                    <p className="text-xs font-medium text-gray-900 dark:text-white mb-1">{newImage ? t("provider.proof.imageSelected") : t("provider.proof.chooseImage")}</p>
                    {!newImage && <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-3">{t("provider.proof.clickToUpload")}</p>}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="bg-transparent">
                      {newImage ? t("provider.proof.chooseDifferentImage") : t("provider.proof.chooseFiles")}
                    </Button>
                  </div>

                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 flex flex-col">
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      {newVideo ? (
                        <video src={newVideo} controls className="w-full h-36 object-cover rounded-lg mb-3" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-3">
                          <Video className="w-6 h-6 text-blue-500" />
                        </div>
                      )}
                      <p className="text-xs font-medium text-gray-900 dark:text-white mb-1">{newVideo ? t("provider.proof.videoAttached") : t("provider.proof.addVideoOptional")}</p>
                    </div>
                    <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoChange} />
                    {newVideo ? (
                      <Button size="sm" variant="outline" onClick={() => setNewVideo("")} className="bg-transparent">
                        <X className="w-4 h-4 mr-1" />{t("common.cancel")}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => videoInputRef.current?.click()} className="bg-transparent">
                        {t("provider.proof.chooseVideo")}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("provider.proof.projectTitleLabel")}</label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t("provider.proof.projectTitlePlaceholder")} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("provider.proof.dateLabel")}</label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 h-10 flex items-center">
                    {editingProof ? new Date(editingProof.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("provider.proof.descriptionLabel")}</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t("provider.proof.descriptionPlaceholder")}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button variant="outline" onClick={handleCancelForm} className="flex-1 bg-transparent" disabled={isSaving}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleSaveWork}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={isSaving || !newTitle.trim() || (!editingProof && !newImage)}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-2" />{editingProof ? t("provider.proof.updateButton") : t("provider.proof.uploadButton")}</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {proofs.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <Upload className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-white font-medium mb-2">{t("provider.proof.noWorkTitle")}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-6">{t("provider.proof.noWorkDesc")}</p>
            <Button onClick={handleAddWork} className="bg-blue-600 hover:bg-blue-700"><Upload className="w-4 h-4 mr-2" />{t("provider.proof.addFirstWork")}</Button>
          </div>
        ) : proofs.length > 0 ? (
          // Two columns from the smallest phone up: one full-width card per
          // row turned a handful of samples into a very long scroll.
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {proofs.map((proof) => (
              <div key={proof.id} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
                {/* The whole image is the preview control. It used to be a
                    hover-only overlay button, which meant a provider on a
                    phone — where there is no hover — could never open their
                    own work at all. */}
                <button
                  type="button"
                  onClick={() => handlePreview(proof)}
                  aria-label={t("common.viewDetails")}
                  className="group relative block aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-700"
                >
                  <img src={proof.imageUrl || "/placeholder.svg"} alt={proof.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  {proof.videoUrl && (
                    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                      <Video className="h-3 w-3" />{t("provider.proof.videoBadge")}
                    </span>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm dark:bg-gray-900/80">
                    <Eye className="h-3.5 w-3.5 text-gray-700 dark:text-gray-200" />
                  </span>
                </button>

                <div className="flex flex-1 flex-col p-3">
                  <p className="text-sm font-semibold leading-snug text-gray-900 dark:text-white">{proof.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{new Date(proof.createdAt).toLocaleDateString()}</p>
                  {proof.description && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{proof.description}</p>}
                  {/* Pushed to the card's foot so every card's controls line
                      up regardless of how long its description runs. */}
                  <div className="mt-auto flex justify-end gap-1 pt-2">
                    <button onClick={() => handleEditWork(proof)} aria-label={t("common.edit")} className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 className="h-4 w-4 text-blue-600" /></button>
                    <button onClick={() => removeProof(proof.id)} aria-label={t("common.delete")} className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 className="h-4 w-4 text-red-600" /></button>
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
          <DialogHeader><DialogTitle>{previewProof?.title}</DialogTitle></DialogHeader>
          {previewProof && (
            <div className="space-y-4">
              <img src={previewProof.imageUrl || "/placeholder.svg"} alt={previewProof.title} className="w-full rounded-lg" />
              {previewProof.videoUrl && (
                <video src={previewProof.videoUrl} controls className="w-full rounded-lg" />
              )}
              {previewProof.description && (
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{t("provider.proof.descriptionLabel")}</p>
                  <p className="text-gray-900 dark:text-white">{previewProof.description}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400">{t("provider.proof.dateLabel")}</p>
                <p className="font-medium text-gray-900 dark:text-white">{new Date(previewProof.createdAt).toLocaleDateString()}</p>
              </div>
              <Button onClick={() => setShowPreview(false)} className="w-full bg-blue-600 hover:bg-blue-700">{t("common.close")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
