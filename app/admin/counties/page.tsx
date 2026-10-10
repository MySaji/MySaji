"use client"

import { useEffect, useState } from "react"
import { Search, Plus, Edit, Trash2, Loader2, MapPin } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Label } from "@/frontend/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import {
  getCountiesForAdmin, createCounty, updateCounty, setCountyActive, deleteCounty,
  type CountyRow,
} from "@/backend/actions/counties"

export default function AdminCountiesPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [counties, setCounties] = useState<CountyRow[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<CountyRow | null>(null)
  const [name, setName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => setCounties(await getCountiesForAdmin())

  useEffect(() => { refresh().finally(() => setIsLoading(false)) }, [])

  const openCreate = () => { setEditing(null); setName(""); setError(""); setShowModal(true) }
  const openEdit = (county: CountyRow) => { setEditing(county); setName(county.name); setError(""); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim()) { setError(t("admin.counties.nameRequired")); return }
    setIsSaving(true)
    setError("")
    const result = editing ? await updateCounty(editing.id, name) : await createCounty(name)
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setShowModal(false)
    await refresh()
  }

  const handleToggleActive = async (county: CountyRow) => {
    setBusyId(county.id)
    const result = await setCountyActive(county.id, !county.isActive)
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleDelete = async (county: CountyRow) => {
    if (!confirm(t("admin.counties.confirmDelete"))) return
    setBusyId(county.id)
    const result = await deleteCounty(county.id)
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const filtered = counties.filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("admin.counties.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.counties.subtitle")}</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Plus size={18} /> {t("admin.counties.addCounty")}
        </Button>
      </div>

      <div className="w-full sm:max-w-md relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder={t("admin.counties.searchPlaceholder")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
        />
      </div>

      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.counties.colName")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("common.status")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.counties.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.length > 0 ? filtered.map((county) => (
                <tr key={county.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <MapPin size={16} className="text-gray-400" /> {county.name}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(county)}
                      disabled={busyId === county.id}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                        county.isActive ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {busyId === county.id ? "..." : county.isActive ? t("admin.counties.statusActive") : t("admin.counties.statusInactive")}
                    </button>
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button onClick={() => openEdit(county)} title={t("common.edit")} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-blue-600">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => handleDelete(county)} disabled={busyId === county.id} title={t("common.delete")} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors text-red-600">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">{t("admin.counties.noCountiesFound")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("admin.counties.editTitle") : t("admin.counties.addCounty")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t("admin.counties.nameLabel")}</Label>
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("admin.counties.namePlaceholder")} />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowModal(false)} disabled={isSaving}>{t("common.cancel")}</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
