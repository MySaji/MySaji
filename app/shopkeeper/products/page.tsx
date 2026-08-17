"use client"

import React from "react"

import { useEffect, useState } from "react"
import {
  Search, Plus, Edit, Trash2, Eye, Package,
  TrendingUp, Grid, List, Upload, Loader2, FileSpreadsheet, Download, AlertCircle, CheckCircle2
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Image from "next/image"
import {
  getMyProducts, getProductCategoryOptions, createMyProduct, updateMyProduct, toggleMyProductActive, deleteMyProduct,
  bulkImportProducts, type ShopkeeperProduct, type ShopkeeperProductCategoryOption, type BulkImportResult,
} from "@/lib/actions/shopkeeper-products"
import { parseCsv } from "@/lib/csv"
import { useLocalization } from "@/lib/hooks/useLocalization"

type ProductFormState = {
  name: string
  price: string
  discountPrice: string
  stock: string
  categoryId: string
  description: string
  images: string[]
}

const EMPTY_FORM: ProductFormState = { name: "", price: "", discountPrice: "", stock: "", categoryId: "", description: "", images: [] }

export default function ShopkeeperProductsPage() {
  const { t, formatMoney, currency } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [productsList, setProductsList] = useState<ShopkeeperProduct[]>([])
  const [categories, setCategories] = useState<ShopkeeperProductCategoryOption[]>([])
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ShopkeeperProduct | null>(null)
  const [newProductForm, setNewProductForm] = useState<ProductFormState>(EMPTY_FORM)
  const [editForm, setEditForm] = useState<ProductFormState>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkRows, setBulkRows] = useState<Record<string, string>[]>([])
  const [bulkFileName, setBulkFileName] = useState("")
  const [bulkError, setBulkError] = useState("")
  const [bulkIsProcessing, setBulkIsProcessing] = useState(false)
  const [bulkResult, setBulkResult] = useState<Extract<BulkImportResult, { success: true }> | null>(null)

  const refresh = async () => {
    const [products, cats] = await Promise.all([getMyProducts(), getProductCategoryOptions()])
    setProductsList(products)
    setCategories(cats)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filteredProducts = productsList.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === "all" || product.categoryId === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isNew: boolean) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4)
    if (files.length === 0) return

    const readers = files.map((file) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("Failed to read image"))
        reader.readAsDataURL(file)
      })
    )

    try {
      const results = await Promise.all(readers)
      if (isNew) setNewProductForm((prev) => ({ ...prev, images: results }))
      else setEditForm((prev) => ({ ...prev, images: results }))
    } catch (error) {
      console.error("Image upload failed", error)
    }
  }

  const openBulkModal = () => {
    setBulkRows([])
    setBulkFileName("")
    setBulkError("")
    setBulkResult(null)
    setShowBulkModal(true)
  }

  const downloadCsvTemplate = () => {
    const header = "name,description,price,discountPrice,stock,category,imageUrl"
    const example = `"Sample Product","A short description of the product",1200,999,25,"${categories[0]?.name ?? "Category"}",https://example.com/image.jpg`
    const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "product-import-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkError("")
    setBulkResult(null)
    setBulkFileName(file.name)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length === 0) { setBulkError(t("shopkeeper.products.bulkEmptyFile")); setBulkRows([]); return }
      setBulkRows(rows)
    } catch {
      setBulkError(t("shopkeeper.products.bulkReadError"))
      setBulkRows([])
    }
  }

  const submitBulkImport = async () => {
    if (bulkRows.length === 0) return
    setBulkIsProcessing(true)
    setBulkError("")
    const result = await bulkImportProducts(
      bulkRows.map((row) => ({
        name: row.name,
        description: row.description,
        price: row.price,
        discountPrice: row.discountPrice || undefined,
        stock: row.stock,
        category: row.category,
        imageUrl: row.imageUrl || undefined,
      }))
    )
    setBulkIsProcessing(false)
    if (!result.success) { setBulkError(result.error); return }
    setBulkResult(result)
    if (result.createdCount > 0) await refresh()
  }

  const openAddModal = () => {
    setNewProductForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" })
    setFormError("")
    setShowAddModal(true)
  }

  const handleEditProduct = (product: ShopkeeperProduct) => {
    setEditingProduct(product)
    setEditForm({
      name: product.name,
      price: String(product.price),
      discountPrice: product.discountPrice != null ? String(product.discountPrice) : "",
      stock: String(product.stock),
      categoryId: product.categoryId ?? "",
      description: product.description,
      images: product.images,
    })
    setFormError("")
    setShowEditModal(true)
  }

  const handleSaveProduct = async () => {
    if (!editingProduct) return
    setIsSaving(true)
    setFormError("")
    const result = await updateMyProduct({
      id: editingProduct.id,
      name: editForm.name,
      description: editForm.description,
      price: Number(editForm.price),
      discountPrice: editForm.discountPrice ? Number(editForm.discountPrice) : undefined,
      stock: Number(editForm.stock),
      categoryId: editForm.categoryId,
      images: editForm.images,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowEditModal(false)
    await refresh()
  }

  const handleAddProduct = async () => {
    setIsSaving(true)
    setFormError("")
    const result = await createMyProduct({
      name: newProductForm.name,
      description: newProductForm.description,
      price: Number(newProductForm.price),
      discountPrice: newProductForm.discountPrice ? Number(newProductForm.discountPrice) : undefined,
      stock: Number(newProductForm.stock),
      categoryId: newProductForm.categoryId,
      images: newProductForm.images,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowAddModal(false)
    await refresh()
  }

  const handleToggleActive = async (id: string) => {
    setProductsList((prev) => prev.map((p) => p.id === id ? { ...p, status: p.status === "inactive" ? "active" : "inactive" } : p))
    await toggleMyProductActive({ id })
    await refresh()
  }

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm(t("shopkeeper.products.deleteConfirm"))) return
    const result = await deleteMyProduct({ id: productId })
    if (result.success) setProductsList((prev) => prev.filter((p) => p.id !== productId))
    else alert(result.error)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      case "low_stock": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      case "out_of_stock": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "active": return t("shopkeeper.products.statusActive")
      case "low_stock": return t("shopkeeper.products.statusLowStock")
      case "out_of_stock": return t("shopkeeper.products.statusOutOfStock")
      default: return t("shopkeeper.products.statusHidden")
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-800 dark:to-orange-800 text-white p-4 sm:p-6 lg:rounded-b-3xl overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold truncate">{t("shopkeeper.products.headerTitle")}</h1>
              <p className="text-amber-100 text-sm truncate">{t("shopkeeper.products.headerSubtitle")}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={openBulkModal} variant="outline" className="flex-1 sm:flex-none bg-white/10 border-white/40 text-white hover:bg-white/20" disabled={categories.length === 0}>
                <FileSpreadsheet className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate">{t("shopkeeper.products.bulkImport")}</span>
              </Button>
              <Button onClick={openAddModal} className="flex-1 sm:flex-none bg-white text-amber-700 hover:bg-amber-50" disabled={categories.length === 0}>
                <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate">{t("shopkeeper.products.addProduct")}</span>
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4 min-w-0">
              <p className="text-2xl sm:text-3xl font-bold truncate">{productsList.length}</p>
              <p className="text-xs text-amber-100 truncate">{t("shopkeeper.products.statTotalProducts")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4 min-w-0">
              <p className="text-2xl sm:text-3xl font-bold truncate">{productsList.filter(p => p.status === "active").length}</p>
              <p className="text-xs text-amber-100 truncate">{t("shopkeeper.products.statActive")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4 min-w-0">
              <p className="text-2xl sm:text-3xl font-bold truncate">{productsList.filter(p => p.status === "low_stock" || p.status === "out_of_stock").length}</p>
              <p className="text-xs text-amber-100 truncate">{t("shopkeeper.products.statLowStock")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4 min-w-0">
              <p className="text-2xl sm:text-3xl font-bold truncate">{productsList.reduce((acc, p) => acc + p.sold, 0)}</p>
              <p className="text-xs text-amber-100 truncate">{t("shopkeeper.products.statTotalSold")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 -mt-4 overflow-x-hidden">
        {/* Filters */}
        <Card className="p-3 sm:p-4 mb-4 sm:mb-6 shadow-lg border-0">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("shopkeeper.products.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex-1 sm:flex-none min-w-0 px-3 py-2 bg-background border border-input rounded-md text-sm"
              >
                <option value="all">{t("shopkeeper.products.allCategories")}</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
              <div className="flex border border-input rounded-md overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setViewMode("grid")}
                  aria-label={t("shopkeeper.products.gridViewLabel")}
                  aria-pressed={viewMode === "grid"}
                  className={`p-2 transition-colors ${viewMode === "grid" ? "bg-amber-600 text-white" : "bg-background hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  aria-label={t("shopkeeper.products.listViewLabel")}
                  aria-pressed={viewMode === "list"}
                  className={`p-2 transition-colors ${viewMode === "list" ? "bg-amber-600 text-white" : "bg-background hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </Card>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">{t("shopkeeper.products.noProductsFound")}</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-all border-0">
                <div className="relative overflow-hidden bg-gray-200 dark:bg-gray-700 aspect-square">
                  <Image
                    src={product.images[0] || "/placeholder.svg"}
                    alt={product.name}
                    fill
                    className="object-cover hover:scale-105 transition-transform"
                  />
                  <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(product.status)}`}>
                    {getStatusText(product.status)}
                  </div>
                  <div className="absolute top-3 left-3 bg-black/60 text-white px-2 py-1 rounded text-xs font-medium">
                    {t("shopkeeper.products.soldLabel", { count: product.sold })}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2">{product.name}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{product.description}</p>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-bold text-amber-600">{formatMoney(product.price)}</span>
                    <span className={`text-xs px-2 py-1 rounded ${product.stock > 5 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                      {t("shopkeeper.products.stockLabel", { count: product.stock })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                    {product.reviewCount > 0 ? (
                      <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {t("shopkeeper.products.ratingReviews", { rating: product.rating.toFixed(1), count: product.reviewCount })}</span>
                    ) : (
                      <span>{t("shopkeeper.products.noReviewsYet")}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditProduct(product)} className="flex-1 bg-transparent">
                      <Edit className="w-3 h-3 mr-1" />
                      {t("shopkeeper.products.editButton")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleToggleActive(product.id)} className="flex-1 bg-transparent">
                      <Eye className="w-3 h-3 mr-1" />
                      {product.status === "inactive" ? t("shopkeeper.products.showButton") : t("shopkeeper.products.hideButton")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteProduct(product.id)} className="bg-transparent text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="p-3 sm:p-4 hover:shadow-lg transition-all border-0 overflow-hidden">
                <div className="flex gap-3 sm:gap-4">
                  <div className="relative w-16 h-16 sm:w-24 sm:h-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-200">
                    <Image src={product.images[0] || "/placeholder.svg"} alt={product.name} fill className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">{product.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 sm:line-clamp-2">{product.description}</p>
                      </div>
                      <div className={`flex-shrink-0 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap ${getStatusBadge(product.status)}`}>
                        {getStatusText(product.status)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm mb-3">
                      <span className="font-bold text-amber-600">{formatMoney(product.price)}</span>
                      <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">{t("shopkeeper.products.stockLabel", { count: product.stock })}</span>
                      <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">{t("shopkeeper.products.soldCountLabel", { count: product.sold })}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEditProduct(product)} className="bg-transparent">
                        <Edit className="w-3 h-3 mr-1" />
                        {t("shopkeeper.products.editButton")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleToggleActive(product.id)} className="bg-transparent">
                        <Eye className="w-3 h-3 mr-1" />
                        {product.status === "inactive" ? t("shopkeeper.products.showButton") : t("shopkeeper.products.hideButton")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteProduct(product.id)} className="bg-transparent text-red-600">
                        <Trash2 className="w-3 h-3 mr-1" />
                        {t("common.delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">{t("shopkeeper.products.addModalTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-4 dark:border-amber-700 dark:bg-amber-950/20">
              <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.photosLabel")}</label>
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center transition-colors hover:border-amber-500 dark:border-gray-600 dark:bg-gray-900">
                <input type="file" accept="image/*" multiple onChange={(e) => handleImageUpload(e, true)} className="hidden" id="new-image-input" />
                <label htmlFor="new-image-input" className="cursor-pointer">
                  {newProductForm.images.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {newProductForm.images.map((img, index) => (
                        <div key={`${img.slice(0, 20)}-${index}`} className="relative h-16 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                          <Image src={img} alt={`Preview ${index + 1}`} fill className="object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4">
                      <Upload className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("shopkeeper.products.uploadPhotosHint")}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("shopkeeper.products.photoFormatsHint")}</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.nameLabel")}</label>
                <Input value={newProductForm.name} onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })} placeholder={t("shopkeeper.products.namePlaceholder")} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.priceLabel", { currency })}</label>
                <Input type="number" value={newProductForm.price} onChange={(e) => setNewProductForm({ ...newProductForm, price: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.discountPriceLabel", { currency })}</label>
                <Input type="number" value={newProductForm.discountPrice} onChange={(e) => setNewProductForm({ ...newProductForm, discountPrice: e.target.value })} placeholder={t("shopkeeper.products.discountPricePlaceholder")} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.stockQtyLabel")}</label>
                <Input type="number" value={newProductForm.stock} onChange={(e) => setNewProductForm({ ...newProductForm, stock: e.target.value })} placeholder="0" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.categoryLabel")}</label>
              <select value={newProductForm.categoryId} onChange={(e) => setNewProductForm({ ...newProductForm, categoryId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2">
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.descriptionLabel")}</label>
              <textarea value={newProductForm.description} onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })} placeholder={t("shopkeeper.products.descriptionPlaceholder")} className="h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2" />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1 bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleAddProduct} className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={isSaving || !newProductForm.name || !newProductForm.price || !newProductForm.stock || newProductForm.images.length === 0}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" />{t("shopkeeper.products.addProduct")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">{t("shopkeeper.products.editModalTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-4 dark:border-amber-700 dark:bg-amber-950/20">
              <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.photosLabelOptional")}</label>
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center transition-colors hover:border-amber-500 dark:border-gray-600 dark:bg-gray-900">
                <input type="file" accept="image/*" multiple onChange={(e) => handleImageUpload(e, false)} className="hidden" id="edit-image-input" />
                <label htmlFor="edit-image-input" className="cursor-pointer">
                  {editForm.images.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {editForm.images.map((img, index) => (
                        <div key={`${img.slice(0, 20)}-${index}`} className="relative h-16 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                          <Image src={img} alt={`Preview ${index + 1}`} fill className="object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4">
                      <Upload className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("shopkeeper.products.replacePhotosHint")}</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.nameLabelPlain")}</label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder={t("shopkeeper.products.namePlaceholder")} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.priceLabelPlain", { currency })}</label>
                <Input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.discountPriceLabel", { currency })}</label>
                <Input type="number" value={editForm.discountPrice} onChange={(e) => setEditForm({ ...editForm, discountPrice: e.target.value })} placeholder={t("shopkeeper.products.discountPricePlaceholder")} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.stockQtyLabelPlain")}</label>
                <Input type="number" value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.categoryLabelPlain")}</label>
              <select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2">
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t("shopkeeper.products.descriptionLabelPlain")}</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder={t("shopkeeper.products.descriptionPlaceholder")} className="h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2" />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1 bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleSaveProduct} className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Edit className="mr-2 h-4 w-4" />{t("shopkeeper.products.saveChanges")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Modal */}
      <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">{t("shopkeeper.products.bulkImportTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t("shopkeeper.products.bulkImportHint")}</p>

            <Button variant="outline" onClick={downloadCsvTemplate} className="w-full bg-transparent">
              <Download className="w-4 h-4 mr-2" />
              {t("shopkeeper.products.downloadTemplate")}
            </Button>

            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center transition-colors hover:border-amber-500 dark:border-gray-600 dark:bg-gray-900">
              <input type="file" accept=".csv" onChange={handleBulkFileChange} className="hidden" id="bulk-csv-input" />
              <label htmlFor="bulk-csv-input" className="cursor-pointer">
                <Upload className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {bulkFileName || t("shopkeeper.products.chooseCsvFile")}
                </p>
                {bulkRows.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("shopkeeper.products.bulkRowsFound", { count: bulkRows.length })}</p>
                )}
              </label>
            </div>

            {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}

            {bulkResult && (
              <div className="space-y-3">
                {bulkResult.createdCount > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    {t("shopkeeper.products.bulkCreatedCount", { count: bulkResult.createdCount })}
                  </div>
                )}
                {bulkResult.errors.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                    {bulkResult.errors.map((err) => (
                      <div key={err.row} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span>{t("shopkeeper.products.bulkRowError", { row: err.row, name: err.name, error: err.error })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowBulkModal(false)} className="flex-1 bg-transparent" disabled={bulkIsProcessing}>{t("common.cancel")}</Button>
              <Button onClick={submitBulkImport} className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={bulkIsProcessing || bulkRows.length === 0}>
                {bulkIsProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{t("shopkeeper.products.importButton", { count: bulkRows.length })}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
