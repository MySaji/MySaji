"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, Building2, X } from "lucide-react"
import {
  getMyBranches, addBranch, updateBranch, removeBranch, type BusinessBranchItem,
} from "@/lib/actions/provider-business"
import { useLocalization } from "@/lib/hooks/useLocalization"

type FormState = { id: string | null; name: string; address: string; phone: string; isActive: boolean }
const EMPTY_FORM: FormState = { id: null, name: "", address: "", phone: "", isActive: true }

export default function BranchOutletsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [branches, setBranches] = useState<BusinessBranchItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const refresh = async () => setBranches(await getMyBranches())

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const openAdd = () => { setForm(EMPTY_FORM); setError(""); setShowForm(true) }
  const openEdit = (branch: BusinessBranchItem) => {
    setForm({ id: branch.id, name: branch.name, address: branch.address, phone: branch.phone ?? "", isActive: branch.isActive })
    setError("")
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.address.trim()) return
    setIsSaving(true)
    setError("")
    const result = form.id
      ? await updateBranch({ id: form.id, name: form.name, address: form.address, phone: form.phone, isActive: form.isActive })
      : await addBranch({ name: form.name, address: form.address, phone: form.phone })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setShowForm(false)
    await refresh()
  }

  const handleRemove = async (id: string) => {
    await removeBranch({ id })
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/provider/business/dashboard" className="lg:hidden">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-lg font-bold">{t("provider.business.branches.title")}</h1>
              <p className="text-blue-100 text-xs">{t("provider.business.branches.subtitle")}</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-full text-xs font-medium">
            <Plus className="w-4 h-4" />{t("provider.business.branches.addButton")}
          </button>
        </div>
      </div>

      <div className="p-4 max-w-4xl mx-auto space-y-3">
        {branches.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
            {t("provider.business.branches.noBranches")}
          </div>
        ) : (
          branches.map((branch) => (
            <div key={branch.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border dark:border-gray-700 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{branch.name}</p>
                    {!branch.isActive && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        {t("provider.business.branches.inactiveBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{branch.address}</p>
                  {branch.phone && <p className="text-[11px] text-gray-400 dark:text-gray-500">{branch.phone}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(branch)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500" aria-label={t("common.edit")}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleRemove(branch.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-red-500" aria-label={t("common.removeItem")}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {form.id ? t("provider.business.branches.editTitle") : t("provider.business.branches.addTitle")}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("provider.business.branches.nameLabel")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={t("provider.business.branches.addressLabel")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t("provider.business.branches.phoneLabel")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              {form.id && (
                <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  {t("provider.business.branches.activeLabel")}
                </label>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving || !form.name.trim() || !form.address.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("provider.business.branches.saveButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
