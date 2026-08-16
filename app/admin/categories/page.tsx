"use client"

import { useEffect, useState } from "react"
import { Search, Plus, Edit, Trash2, Loader2, ListTree, ArrowUp, ArrowDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getCategoriesForAdmin, createCategory, updateCategory, setCategoryActive, deleteCategory,
  type CategoryRow,
} from "@/lib/actions/categories"
import {
  getCategoryAttributesForAdmin, createCategoryAttribute, deleteCategoryAttribute, reorderCategoryAttribute,
  type AdminCategoryAttribute, type CategoryAttributeFieldType,
} from "@/lib/actions/admin-category-attributes"

const EMPTY_FORM = { name: "", type: "SERVICE" as "SERVICE" | "PRODUCT", tier: "", parentId: "", isEmergencyEligible: false, requiresLicense: false, licenseName: "" }
const FIELD_TYPES: CategoryAttributeFieldType[] = ["TEXT", "TEXTAREA", "NUMBER", "TAGS", "SELECT"]
const EMPTY_ATTR_FORM = { key: "", label: "", type: "TEXT" as CategoryAttributeFieldType, options: "", placeholder: "" }

export default function AdminCategoriesPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<"All" | "SERVICE" | "PRODUCT">("All")
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CategoryRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const [attrCategory, setAttrCategory] = useState<CategoryRow | null>(null)
  const [attrFields, setAttrFields] = useState<AdminCategoryAttribute[]>([])
  const [attrLoading, setAttrLoading] = useState(false)
  const [attrForm, setAttrForm] = useState(EMPTY_ATTR_FORM)
  const [attrError, setAttrError] = useState("")
  const [attrSaving, setAttrSaving] = useState(false)

  const refresh = async () => setCategories(await getCategoriesForAdmin())

  useEffect(() => { refresh().finally(() => setIsLoading(false)) }, [])

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setError(""); setShowModal(true) }
  const openEdit = (cat: CategoryRow) => {
    setEditing(cat)
    setForm({ name: cat.name, type: cat.type, tier: cat.tier ?? "", parentId: cat.parentId ?? "", isEmergencyEligible: cat.isEmergencyEligible, requiresLicense: cat.requiresLicense, licenseName: cat.licenseName ?? "" })
    setError("")
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t("admin.categories.nameRequired")); return }
    setIsSaving(true)
    setError("")
    const result = editing
      ? await updateCategory({ id: editing.id, name: form.name, tier: form.tier || undefined, parentId: form.parentId || null, isEmergencyEligible: form.isEmergencyEligible, requiresLicense: form.requiresLicense, licenseName: form.licenseName || undefined })
      : await createCategory({ name: form.name, type: form.type, tier: form.tier || undefined, parentId: form.parentId || undefined, isEmergencyEligible: form.isEmergencyEligible, requiresLicense: form.requiresLicense, licenseName: form.licenseName || undefined })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setShowModal(false)
    await refresh()
  }

  const handleToggleActive = async (cat: CategoryRow) => {
    setBusyId(cat.id)
    const result = await setCategoryActive(cat.id, !cat.isActive)
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleDelete = async (cat: CategoryRow) => {
    if (!confirm(t("admin.categories.confirmDelete"))) return
    setBusyId(cat.id)
    const result = await deleteCategory(cat.id)
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const openAttributes = async (cat: CategoryRow) => {
    setAttrCategory(cat)
    setAttrForm(EMPTY_ATTR_FORM)
    setAttrError("")
    setAttrLoading(true)
    setAttrFields(await getCategoryAttributesForAdmin(cat.id))
    setAttrLoading(false)
  }

  const refreshAttributes = async () => {
    if (!attrCategory) return
    setAttrFields(await getCategoryAttributesForAdmin(attrCategory.id))
  }

  const handleAddAttribute = async () => {
    if (!attrCategory || !attrForm.key.trim() || !attrForm.label.trim()) return
    setAttrSaving(true)
    setAttrError("")
    const options = attrForm.options.split(",").map((o) => o.trim()).filter(Boolean)
    const result = await createCategoryAttribute({
      categoryId: attrCategory.id, key: attrForm.key.trim(), label: attrForm.label.trim(), type: attrForm.type,
      options: options.length > 0 ? options : undefined, placeholder: attrForm.placeholder || undefined,
    })
    setAttrSaving(false)
    if (!result.success) { setAttrError(result.error); return }
    setAttrForm(EMPTY_ATTR_FORM)
    await refreshAttributes()
  }

  const handleDeleteAttribute = async (id: string) => {
    await deleteCategoryAttribute({ id })
    await refreshAttributes()
  }

  const handleReorderAttribute = async (id: string, direction: "up" | "down") => {
    await reorderCategoryAttribute({ id, direction })
    await refreshAttributes()
  }

  const filtered = categories.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = typeFilter === "All" || c.type === typeFilter
    return matchesSearch && matchesType
  })

  const parentOptions = categories.filter((c) => c.type === form.type && c.id !== editing?.id)

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("admin.categories.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.categories.subtitle")}</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Plus size={18} /> {t("admin.categories.addCategory")}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="w-full sm:flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t("admin.categories.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div className="flex gap-2">
          {(["All", "SERVICE", "PRODUCT"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                typeFilter === type ? "bg-blue-600 text-white shadow-lg" : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {type === "All" ? t("admin.categories.filterAll") : type === "SERVICE" ? t("admin.categories.filterService") : t("admin.categories.filterProduct")}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.categories.colName")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.categories.colType")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.categories.colTier")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.categories.colParent")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.categories.colEmergency")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.categories.colLicense")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.categories.colUsage")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("common.status")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.categories.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.length > 0 ? filtered.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">{cat.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{cat.type === "SERVICE" ? t("admin.categories.filterService") : t("admin.categories.filterProduct")}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{cat.tier ?? "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{cat.parentName ?? "—"}</td>
                  <td className="px-6 py-4 text-sm">
                    {cat.type === "SERVICE" ? (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${cat.isEmergencyEligible ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                        {cat.isEmergencyEligible ? t("admin.categories.emergencyYes") : t("admin.categories.emergencyNo")}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {cat.type === "SERVICE" && cat.requiresLicense ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title={cat.licenseName ?? undefined}>
                        {t("admin.categories.licenseYes")}
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500">{t("admin.categories.licenseNo")}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{cat.usageCount}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(cat)}
                      disabled={busyId === cat.id}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        cat.isActive ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {busyId === cat.id ? "..." : cat.isActive ? t("admin.categories.statusActive") : t("admin.categories.statusInactive")}
                    </button>
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button onClick={() => openAttributes(cat)} title="Offer fields" className="p-2 hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded-lg transition-colors text-violet-600">
                      <ListTree size={18} />
                    </button>
                    <button onClick={() => openEdit(cat)} title={t("common.edit")} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-blue-600">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => handleDelete(cat)} disabled={busyId === cat.id} title={t("common.delete")} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors text-red-600">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">{t("admin.categories.noCategoriesFound")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("admin.categories.editTitle") : t("admin.categories.addCategory")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t("admin.categories.nameLabel")}</Label>
              <Input className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("admin.categories.namePlaceholder")} />
            </div>
            {!editing && (
              <div>
                <Label>{t("admin.categories.colType")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "SERVICE" | "PRODUCT", parentId: "" })}>
                  <SelectTrigger className="w-full mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SERVICE">{t("admin.categories.filterService")}</SelectItem>
                    <SelectItem value="PRODUCT">{t("admin.categories.filterProduct")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{t("admin.categories.tierLabel")}</Label>
              <Input className="mt-1.5" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} placeholder={t("admin.categories.tierPlaceholder")} />
              <p className="text-xs text-muted-foreground mt-1.5">{t("admin.categories.tierHint")}</p>
            </div>
            <div>
              <Label>{t("admin.categories.colParent")}</Label>
              <Select value={form.parentId || "none"} onValueChange={(v) => setForm({ ...form, parentId: v === "none" ? "" : v })}>
                <SelectTrigger className="w-full mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("admin.categories.noParent")}</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.type === "SERVICE" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.isEmergencyEligible} onCheckedChange={(c) => setForm({ ...form, isEmergencyEligible: c === true })} />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t("admin.categories.emergencyEligibleLabel")}</span>
              </label>
            )}
            {form.type === "SERVICE" && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form.requiresLicense} onCheckedChange={(c) => setForm({ ...form, requiresLicense: c === true })} />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{t("admin.categories.requiresLicenseLabel")}</span>
                </label>
                {form.requiresLicense && (
                  <div>
                    <Label>{t("admin.categories.licenseNameLabel")}</Label>
                    <Input className="mt-1.5" value={form.licenseName} onChange={(e) => setForm({ ...form, licenseName: e.target.value })} placeholder={t("admin.categories.licenseNamePlaceholder")} />
                  </div>
                )}
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowModal(false)} disabled={isSaving}>{t("common.cancel")}</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!attrCategory} onOpenChange={(open) => !open && setAttrCategory(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Offer Fields — {attrCategory?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            These are the "Offer Details" fields providers see in Step 3 of Create Offer for this category. No rows means providers get a small generic fallback instead.
          </p>
          <div className="space-y-4 py-2">
            {attrLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-2">
                {attrFields.length === 0 && <p className="text-sm text-muted-foreground">No custom fields yet — using the generic fallback.</p>}
                {attrFields.map((f, i) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{f.label} <span className="text-xs font-normal text-muted-foreground">({f.key} · {f.type.toLowerCase()})</span></p>
                      {f.options.length > 0 && <p className="truncate text-xs text-muted-foreground">{f.options.join(", ")}</p>}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button onClick={() => handleReorderAttribute(f.id, "up")} disabled={i === 0} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowUp size={14} /></button>
                      <button onClick={() => handleReorderAttribute(f.id, "down")} disabled={i === attrFields.length - 1} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowDown size={14} /></button>
                      <button onClick={() => handleDeleteAttribute(f.id)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-xs font-semibold text-foreground">Add a field</p>
              <div className="grid grid-cols-2 gap-2">
                <Input value={attrForm.label} onChange={(e) => setAttrForm((p) => ({ ...p, label: e.target.value }))} placeholder="Label, e.g. Event Type" className="text-sm" />
                <Input value={attrForm.key} onChange={(e) => setAttrForm((p) => ({ ...p, key: e.target.value }))} placeholder="Key, e.g. eventType" className="text-sm" />
              </div>
              <Select value={attrForm.type} onValueChange={(v) => setAttrForm((p) => ({ ...p, type: v as CategoryAttributeFieldType }))}>
                <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {(attrForm.type === "SELECT" || attrForm.type === "TAGS") && (
                <Input value={attrForm.options} onChange={(e) => setAttrForm((p) => ({ ...p, options: e.target.value }))} placeholder="Options, comma-separated" className="text-sm" />
              )}
              <Input value={attrForm.placeholder} onChange={(e) => setAttrForm((p) => ({ ...p, placeholder: e.target.value }))} placeholder="Placeholder (optional)" className="text-sm" />
              {attrError && <p className="text-xs text-red-600">{attrError}</p>}
              <Button size="sm" className="w-full gap-1.5" disabled={!attrForm.key.trim() || !attrForm.label.trim() || attrSaving} onClick={handleAddAttribute}>
                {attrSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add Field
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
