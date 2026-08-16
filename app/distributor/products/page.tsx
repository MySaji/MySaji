"use client"

import React from "react"

import { useEffect, useState } from "react"
import {
  Search, Plus, Edit, Trash2, Eye, Package, Upload, Loader2, Warehouse,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Image from "next/image"
import {
  getMyDistributorProducts, getDistributorProductCategoryOptions, getMyLocationOptions,
  createDistributorProduct, updateDistributorProduct, toggleDistributorProductActive, deleteDistributorProduct,
  adjustLocationStock,
  type DistributorProductRow, type DistributorProductCategoryOption, type DistributorLocationOption,
} from "@/lib/actions/distributor-products"
import { useLocalization } from "@/lib/hooks/useLocalization"

type ProductFormState = {
  name: string
  retailPrice: string
  wholesalePrice: string
  minWholesaleQty: string
  unit: string
  categoryId: string
  description: string
  images: string[]
  initialStock: Record<string, string>
}

const EMPTY_FORM: ProductFormState = {
  name: "", retailPrice: "", wholesalePrice: "", minWholesaleQty: "1", unit: "", categoryId: "", description: "", images: [], initialStock: {},
}

export default function DistributorProductsPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [productsList, setProductsList] = useState<DistributorProductRow[]>([])
  const [categories, setCategories] = useState<DistributorProductCategoryOption[]>([])
  const [locations, setLocations] = useState<DistributorLocationOption[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<DistributorProductRow | null>(null)
  const [newProductForm, setNewProductForm] = useState<ProductFormState>(EMPTY_FORM)
  const [editForm, setEditForm] = useState<ProductFormState>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const [showStockModal, setShowStockModal] = useState(false)
  const [stockProduct, setStockProduct] = useState<DistributorProductRow | null>(null)
  const [stockForm, setStockForm] = useState<Record<string, string>>({})
  const [isSavingStock, setIsSavingStock] = useState(false)

  const refresh = async () => {
    const [products, cats, locs] = await Promise.all([getMyDistributorProducts(), getDistributorProductCategoryOptions(), getMyLocationOptions()])
    setProductsList(products)
    setCategories(cats)
    setLocations(locs)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filteredProducts = productsList.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isNew: boolean) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4)
    if (files.length === 0) return
    const readers = files.map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("Failed to read image"))
      reader.readAsDataURL(file)
    }))
    const results = await Promise.all(readers)
    if (isNew) setNewProductForm((prev) => ({ ...prev, images: results }))
    else setEditForm((prev) => ({ ...prev, images: results }))
  }

  const openAddModal = () => {
    setNewProductForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" })
    setFormError("")
    setShowAddModal(true)
  }

  const handleEditProduct = (product: DistributorProductRow) => {
    setEditingProduct(product)
    setEditForm({
      name: product.name,
      retailPrice: String(product.retailPrice),
      wholesalePrice: String(product.wholesalePrice),
      minWholesaleQty: String(product.minWholesaleQty),
      unit: product.unit ?? "",
      categoryId: product.categoryId ?? "",
      description: product.description,
      images: product.images,
      initialStock: {},
    })
    setFormError("")
    setShowEditModal(true)
  }

  const handleAddProduct = async () => {
    setIsSaving(true)
    setFormError("")
    const initialStock = Object.entries(newProductForm.initialStock)
      .filter(([, qty]) => qty.trim() !== "")
      .map(([locationId, qty]) => ({ locationId, quantity: Number(qty) }))
    const result = await createDistributorProduct({
      name: newProductForm.name,
      description: newProductForm.description,
      retailPrice: Number(newProductForm.retailPrice),
      wholesalePrice: Number(newProductForm.wholesalePrice),
      minWholesaleQty: Number(newProductForm.minWholesaleQty),
      unit: newProductForm.unit,
      categoryId: newProductForm.categoryId,
      images: newProductForm.images,
      initialStock,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowAddModal(false)
    await refresh()
  }

  const handleSaveProduct = async () => {
    if (!editingProduct) return
    setIsSaving(true)
    setFormError("")
    const result = await updateDistributorProduct({
      id: editingProduct.id,
      name: editForm.name,
      description: editForm.description,
      retailPrice: Number(editForm.retailPrice),
      wholesalePrice: Number(editForm.wholesalePrice),
      minWholesaleQty: Number(editForm.minWholesaleQty),
      unit: editForm.unit,
      categoryId: editForm.categoryId,
      images: editForm.images,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowEditModal(false)
    await refresh()
  }

  const handleToggleActive = async (id: string) => {
    await toggleDistributorProductActive({ id })
    await refresh()
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm(t("distributor.products.deleteConfirm"))) return
    const result = await deleteDistributorProduct({ id })
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const openStockModal = (product: DistributorProductRow) => {
    setStockProduct(product)
    const form: Record<string, string> = {}
    for (const loc of locations) {
      const existing = product.locationStock.find((s) => s.locationId === loc.id)
      form[loc.id] = existing ? String(existing.currentStock) : "0"
    }
    setStockForm(form)
    setShowStockModal(true)
  }

  const handleSaveStock = async () => {
    if (!stockProduct) return
    setIsSavingStock(true)
    await Promise.all(
      Object.entries(stockForm).map(([locationId, qty]) =>
        adjustLocationStock({ distributorProductId: stockProduct.id, locationId, newStock: Number(qty) || 0 })
      )
    )
    setIsSavingStock(false)
    setShowStockModal(false)
    await refresh()
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
      <div className="bg-gradient-to-r from-teal-700 to-cyan-700 text-white p-6 lg:rounded-b-3xl">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">{t("distributor.products.title")}</h1>
              <p className="text-teal-100 text-sm">{t("distributor.products.subtitle")}</p>
            </div>
            <Button onClick={openAddModal} className="bg-white text-teal-700 hover:bg-teal-50" disabled={categories.length === 0}>
              <Plus className="w-4 h-4 mr-2" />
              {t("distributor.common.addProduct")}
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <p className="text-3xl font-bold">{productsList.length}</p>
              <p className="text-xs text-teal-100">{t("distributor.products.totalProducts")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <p className="text-3xl font-bold">{productsList.filter((p) => p.isActive).length}</p>
              <p className="text-xs text-teal-100">{t("distributor.common.active")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <p className="text-3xl font-bold">{productsList.reduce((sum, p) => sum + p.totalStock, 0)}</p>
              <p className="text-xs text-teal-100">{t("distributor.products.totalStock")}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <p className="text-3xl font-bold">{productsList.reduce((sum, p) => sum + p.totalSoldWholesale, 0)}</p>
              <p className="text-xs text-teal-100">{t("distributor.products.totalSold")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-4">
        <Card className="p-4 mb-6 shadow-lg border-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("distributor.products.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
        </Card>

        {categories.length === 0 && (
          <Card className="p-4 mb-6 border-0 shadow-lg bg-amber-50 dark:bg-amber-900/20">
            <p className="text-sm text-amber-800 dark:text-amber-300">{t("distributor.products.noCategoriesWarning")}</p>
          </Card>
        )}

        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">{t("distributor.products.noProductsFound")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-all border-0">
                <div className="relative overflow-hidden bg-gray-200 dark:bg-gray-700 aspect-square">
                  <Image src={product.images[0] || "/placeholder.svg"} alt={product.name} fill className="object-cover hover:scale-105 transition-transform" />
                  <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold ${product.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
                    {product.isActive ? t("distributor.common.active") : t("distributor.products.hiddenLabel")}
                  </div>
                  <div className="absolute top-3 left-3 bg-black/60 text-white px-2 py-1 rounded text-xs font-medium">
                    {t("distributor.products.soldBadge", { count: product.totalSoldWholesale })}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2">{product.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t("distributor.products.skuLabel", { sku: product.sku })}</p>

                  <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{t("distributor.products.retailLabel")}</p>
                      <p className="font-bold text-gray-900 dark:text-white">{formatMoney(product.retailPrice)}</p>
                    </div>
                    <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-2">
                      <p className="text-[10px] text-teal-600 dark:text-teal-400">{t("distributor.products.wholesaleMoqLabel", { moq: `${product.minWholesaleQty}${product.unit ? ` ${product.unit}` : ""}` })}</p>
                      <p className="font-bold text-teal-700 dark:text-teal-400">{formatMoney(product.wholesalePrice)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <span>{t("distributor.products.totalStockLabel")} <span className="font-semibold text-gray-900 dark:text-white">{product.totalStock}</span></span>
                    <button onClick={() => openStockModal(product)} className="flex items-center gap-1 text-teal-600 hover:underline">
                      <Warehouse className="w-3 h-3" /> {t("distributor.products.adjustStock")}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditProduct(product)} className="flex-1 bg-transparent">
                      <Edit className="w-3 h-3 mr-1" /> {t("common.edit")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleToggleActive(product.id)} className="flex-1 bg-transparent">
                      <Eye className="w-3 h-3 mr-1" /> {product.isActive ? t("distributor.products.hideButton") : t("distributor.products.showButton")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteProduct(product.id)} className="bg-transparent text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-xl font-semibold">{t("distributor.products.addModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            <div className="rounded-xl border border-dashed border-teal-300 bg-teal-50/70 p-4 dark:border-teal-700 dark:bg-teal-950/20">
              <label className="mb-2 block text-sm font-medium">{t("distributor.products.productPhotosLabel")}</label>
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center transition-colors hover:border-teal-500 dark:border-gray-600 dark:bg-gray-900">
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
                      <Upload className="mx-auto mb-2 h-8 w-8 text-teal-500" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("distributor.products.uploadPhotosPrompt")}</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium">{t("distributor.products.productNameLabel")}</label>
              <Input value={newProductForm.name} onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })} placeholder={t("distributor.products.productNamePlaceholder")} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.retailPriceLabel")}</label>
                <Input type="number" value={newProductForm.retailPrice} onChange={(e) => setNewProductForm({ ...newProductForm, retailPrice: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.wholesalePriceLabel")}</label>
                <Input type="number" value={newProductForm.wholesalePrice} onChange={(e) => setNewProductForm({ ...newProductForm, wholesalePrice: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.minWholesaleQtyLabel")}</label>
                <Input type="number" value={newProductForm.minWholesaleQty} onChange={(e) => setNewProductForm({ ...newProductForm, minWholesaleQty: e.target.value })} placeholder={t("distributor.products.minWholesaleQtyPlaceholder")} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.unitLabel")}</label>
                <Input value={newProductForm.unit} onChange={(e) => setNewProductForm({ ...newProductForm, unit: e.target.value })} placeholder={t("distributor.products.unitPlaceholder")} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.categoryLabel")}</label>
                <select value={newProductForm.categoryId} onChange={(e) => setNewProductForm({ ...newProductForm, categoryId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 h-10">
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t("distributor.products.descriptionLabel")}</label>
              <textarea value={newProductForm.description} onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })} placeholder={t("distributor.products.descriptionPlaceholder")} className="h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2" />
            </div>

            {locations.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.initialStockLabel")}</label>
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <div key={loc.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">{loc.name}</span>
                      <Input
                        type="number"
                        placeholder="0"
                        className="w-28"
                        value={newProductForm.initialStock[loc.id] ?? ""}
                        onChange={(e) => setNewProductForm({ ...newProductForm, initialStock: { ...newProductForm.initialStock, [loc.id]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1 bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button
                onClick={handleAddProduct}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
                disabled={isSaving || !newProductForm.name || !newProductForm.retailPrice || !newProductForm.wholesalePrice || !newProductForm.minWholesaleQty || newProductForm.images.length === 0}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" />{t("distributor.common.addProduct")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-xl font-semibold">{t("distributor.products.editModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium">{t("distributor.products.productNameLabelPlain")}</label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.retailPriceLabelPlain")}</label>
                <Input type="number" value={editForm.retailPrice} onChange={(e) => setEditForm({ ...editForm, retailPrice: e.target.value })} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.wholesalePriceLabelPlain")}</label>
                <Input type="number" value={editForm.wholesalePrice} onChange={(e) => setEditForm({ ...editForm, wholesalePrice: e.target.value })} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.minWholesaleQtyLabelPlain")}</label>
                <Input type="number" value={editForm.minWholesaleQty} onChange={(e) => setEditForm({ ...editForm, minWholesaleQty: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.unitLabelPlain")}</label>
                <Input value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t("distributor.products.categoryLabelPlain")}</label>
                <select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 h-10">
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">{t("distributor.products.descriptionLabelPlain")}</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2" />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1 bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleSaveProduct} className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Edit className="mr-2 h-4 w-4" />{t("distributor.common.saveChanges")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showStockModal} onOpenChange={setShowStockModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("distributor.products.adjustStockModalTitle", { name: stockProduct?.name ?? "" })}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {locations.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("distributor.products.noLocationsForStock")}</p>
            ) : (
              locations.map((loc) => (
                <div key={loc.id} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">{loc.name}</span>
                  <Input
                    type="number"
                    className="w-28"
                    value={stockForm[loc.id] ?? "0"}
                    onChange={(e) => setStockForm({ ...stockForm, [loc.id]: e.target.value })}
                  />
                </div>
              ))
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSaveStock} disabled={isSavingStock || locations.length === 0} className="flex-1 bg-teal-600 hover:bg-teal-700">
                {isSavingStock ? <Loader2 className="w-4 h-4 animate-spin" /> : t("distributor.products.saveStockButton")}
              </Button>
              <Button variant="outline" onClick={() => setShowStockModal(false)} disabled={isSavingStock}>{t("common.cancel")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
