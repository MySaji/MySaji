"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Percent, Save, History, TrendingUp, TrendingDown, Users, DollarSign, Plus, Trash2, Pencil, Eye, AlertTriangle, Loader2 } from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getCommissionTiers, createCommissionTier, updateCommissionTier, toggleCommissionTierStatus, deleteCommissionTier,
  getCommissionChangeHistory, getEstimatedCommissionRevenue,
  type AdminCommissionTier, type CommissionChangeEvent,
} from "@/lib/actions/admin-commissions"

export default function AdminCommissionsPage() {
  const { t, tn, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [tiers, setTiers] = useState<AdminCommissionTier[]>([])
  const [history, setHistory] = useState<CommissionChangeEvent[]>([])
  const [revenue, setRevenue] = useState({ ytd: 0, monthGrowthPct: 0 })
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedTier, setSelectedTier] = useState<AdminCommissionTier | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const [formName, setFormName] = useState("")
  const [formRole, setFormRole] = useState<"Provider" | "Shopkeeper" | "Agent" | "Distributor">("Provider")
  const [formRate, setFormRate] = useState("")
  const [formMinJobs, setFormMinJobs] = useState("")

  const ROLE_LABEL: Record<"Provider" | "Shopkeeper" | "Agent" | "Distributor", string> = {
    Provider: t("common.provider"),
    Shopkeeper: t("admin.commissions.roleShopkeeper"),
    Agent: t("admin.commissions.roleAgent"),
    Distributor: t("admin.commissions.roleDistributor"),
  }

  const CHANGE_TYPE_LABEL: Record<string, string> = {
    add: t("admin.commissions.changeTypeAdd"),
    edit: t("admin.commissions.changeTypeEdit"),
    delete: t("admin.commissions.changeTypeDelete"),
    pause: t("admin.commissions.changeTypePause"),
    activate: t("admin.commissions.changeTypeActivate"),
  }

  const refresh = async () => {
    const [tiersData, historyData, revenueData] = await Promise.all([
      getCommissionTiers(), getCommissionChangeHistory(), getEstimatedCommissionRevenue(),
    ])
    setTiers(tiersData)
    setHistory(historyData)
    setRevenue(revenueData)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const resetForm = () => {
    setFormName("")
    setFormRole("Provider")
    setFormRate("")
    setFormMinJobs("")
    setFormError("")
  }

  const openAdd = () => {
    resetForm()
    setShowAddModal(true)
  }

  const openEdit = (tier: AdminCommissionTier) => {
    setSelectedTier(tier)
    setFormName(tier.name)
    setFormRole(tier.role)
    setFormRate(tier.rate.toString())
    setFormMinJobs(tier.minJobs.toString())
    setFormError("")
    setShowEditModal(true)
  }

  const openView = (tier: AdminCommissionTier) => {
    setSelectedTier(tier)
    setShowViewModal(true)
  }

  const openDelete = (tier: AdminCommissionTier) => {
    setSelectedTier(tier)
    setShowDeleteConfirm(true)
  }

  const handleAdd = async () => {
    setIsSaving(true)
    setFormError("")
    const result = await createCommissionTier({
      name: formName, role: formRole, rate: Number(formRate), minJobs: formMinJobs ? Number(formMinJobs) : 0,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowAddModal(false)
    resetForm()
    await refresh()
  }

  const handleEdit = async () => {
    if (!selectedTier) return
    setIsSaving(true)
    setFormError("")
    const result = await updateCommissionTier({
      id: selectedTier.id, name: formName, role: formRole, rate: Number(formRate), minJobs: formMinJobs ? Number(formMinJobs) : 0,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowEditModal(false)
    setSelectedTier(null)
    await refresh()
  }

  const handleDelete = async () => {
    if (!selectedTier) return
    setIsSaving(true)
    const result = await deleteCommissionTier({ id: selectedTier.id })
    setIsSaving(false)
    if (!result.success) { alert(result.error); return }
    setShowDeleteConfirm(false)
    setSelectedTier(null)
    await refresh()
  }

  const toggleStatus = async (id: string) => {
    const result = await toggleCommissionTierStatus({ id })
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const avgRate = tiers.length > 0 ? (tiers.reduce((s, r) => s + r.rate, 0) / tiers.length).toFixed(1) : "0"

  const roleBadge = (role: string) => {
    switch (role) {
      case "Provider": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
      case "Shopkeeper": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
      case "Distributor": return "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400"
      default: return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
    }
  }

  const TierForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4 mt-2">
      <div>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("admin.commissions.tierNameLabel")}</label>
        <input value={formName} onChange={e => setFormName(e.target.value)} placeholder={t("admin.commissions.tierNamePlaceholder")} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("admin.commissions.roleLabel")}</label>
          <select value={formRole} onChange={e => setFormRole(e.target.value as typeof formRole)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
            <option value="Provider">{ROLE_LABEL.Provider}</option>
            <option value="Shopkeeper">{ROLE_LABEL.Shopkeeper}</option>
            <option value="Agent">{ROLE_LABEL.Agent}</option>
            <option value="Distributor">{ROLE_LABEL.Distributor}</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("admin.commissions.commissionRateLabel")}</label>
          <input value={formRate} onChange={e => setFormRate(e.target.value)} type="number" min="0" max="50" step="0.5" placeholder={t("admin.commissions.commissionRatePlaceholder")} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("admin.commissions.minJobsRequirementLabel")}</label>
        <input value={formMinJobs} onChange={e => setFormMinJobs(e.target.value)} type="number" min="0" placeholder={t("admin.commissions.minJobsPlaceholder")} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
      </div>
      {formError && <p className="text-xs text-red-600">{formError}</p>}
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={() => { setShowAddModal(false); setShowEditModal(false) }} className="rounded-lg" disabled={isSaving}>{t("common.cancel")}</Button>
        <Button onClick={onSubmit} className="bg-blue-600 hover:bg-blue-700 rounded-lg gap-1.5" disabled={isSaving || !formName.trim() || !formRate}>
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{submitLabel}
        </Button>
      </DialogFooter>
    </div>
  )

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("admin.commissions.title")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("admin.commissions.subtitle")}</p>
        </div>
        <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs w-fit rounded-lg"><Plus size={16} />{t("admin.commissions.addNewTier")}</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t("admin.commissions.statCommissionRevenue"), value: formatMoney(revenue.ytd), icon: DollarSign, color: "text-emerald-600" },
          { label: t("admin.commissions.statAvgCommissionRate"), value: `${avgRate}%`, icon: Percent, color: "text-blue-600" },
          { label: t("admin.commissions.statActiveTiers"), value: tiers.filter(t => t.status === "active").length.toString(), icon: Users, color: "text-amber-600" },
          { label: t("admin.commissions.statGrowthVsLastMonth"), value: `${revenue.monthGrowthPct >= 0 ? "+" : ""}${revenue.monthGrowthPct}%`, icon: revenue.monthGrowthPct >= 0 ? TrendingUp : TrendingDown, color: revenue.monthGrowthPct >= 0 ? "text-emerald-600" : "text-red-600" },
        ].map((s, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("admin.commissions.commissionTiers")}</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{tn("admin.commissions.tiersConfigured", tiers.length)}</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {tiers.map(tier => (
            <div key={tier.id} className={`px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${tier.status === "paused" ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-white">{tier.name}</h3>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${roleBadge(tier.role)}`}>{ROLE_LABEL[tier.role] ?? tier.role}</span>
                  {tier.status === "paused" && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500">{t("admin.commissions.paused")}</span>}
                </div>
                {tier.minJobs > 0 && <p className="text-[10px] text-gray-400 mt-0.5">{t("admin.commissions.requirementJobs", { count: tier.minJobs })}</p>}
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 text-center min-w-[60px]">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{tier.rate}</span>
                  <span className="text-xs text-gray-500 ml-0.5">%</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openView(tier)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-blue-600" title={t("admin.commissions.viewDetailsTitle")}>
                    <Eye size={16} />
                  </button>
                  <button onClick={() => openEdit(tier)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-amber-600" title={t("admin.commissions.editTierTitle")}>
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => toggleStatus(tier.id)} className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-[11px] font-medium ${tier.status === "active" ? "text-gray-400 hover:text-orange-500" : "text-emerald-500 hover:text-emerald-600"}`} title={tier.status === "active" ? t("admin.commissions.pauseTier") : t("admin.commissions.activateTier")}>
                    {tier.status === "active" ? t("admin.commissions.pause") : t("admin.commissions.activate")}
                  </button>
                  <button onClick={() => openDelete(tier)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-400 hover:text-red-600" title={t("admin.commissions.deleteTierTitle")}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {tiers.length === 0 && (
            <div className="p-8 text-center">
              <Percent size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("admin.commissions.noTiersConfigured")}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 lg:p-6">
        <div className="flex items-center gap-2 mb-4">
          <History size={18} className="text-gray-500" />
          <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("admin.commissions.rateChangeHistory")}</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">{t("admin.commissions.noChangesRecorded")}</p>
        ) : (
          <div className="space-y-3">
            {history.map((c) => (
              <div key={c.id} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${c.type === "delete" ? "bg-red-500" : c.type === "add" ? "bg-emerald-500" : "bg-blue-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 dark:text-gray-200">{c.change}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{new Date(c.date).toLocaleDateString()} -- {c.by}</p>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${c.type === "delete" ? "bg-red-100 dark:bg-red-900/30 text-red-600" : c.type === "add" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"}`}>
                  {CHANGE_TYPE_LABEL[c.type] ?? c.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.commissions.addTierTitle")}</DialogTitle>
            <DialogDescription>{t("admin.commissions.addTierDesc")}</DialogDescription>
          </DialogHeader>
          <TierForm onSubmit={handleAdd} submitLabel={t("admin.commissions.createTier")} />
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.commissions.editTierModalTitle")}</DialogTitle>
            <DialogDescription>{t("admin.commissions.editTierModalDesc", { name: selectedTier?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <TierForm onSubmit={handleEdit} submitLabel={t("admin.users.saveChanges")} />
        </DialogContent>
      </Dialog>

      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.commissions.tierDetailsTitle")}</DialogTitle>
            <DialogDescription>{t("admin.commissions.tierDetailsDesc")}</DialogDescription>
          </DialogHeader>
          {selectedTier && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Percent size={24} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{selectedTier.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${roleBadge(selectedTier.role)}`}>{ROLE_LABEL[selectedTier.role] ?? selectedTier.role}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("admin.commissions.commissionRate")}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{selectedTier.rate}%</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("admin.commissions.minJobsRequired")}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{selectedTier.minJobs}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("common.status")}</p>
                  <p className={`text-xs font-semibold ${selectedTier.status === "active" ? "text-emerald-600" : "text-gray-500"}`}>{selectedTier.status === "active" ? t("admin.dashboard.active") : t("admin.commissions.paused")}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("admin.commissions.created")}</p>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">{new Date(selectedTier.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setShowViewModal(false)} className="rounded-lg">{t("admin.commissions.close")}</Button>
                <Button onClick={() => { setShowViewModal(false); openEdit(selectedTier) }} className="bg-blue-600 hover:bg-blue-700 rounded-lg gap-1.5"><Pencil size={14} />{t("admin.commissions.editTier")}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("admin.commissions.deleteTierModalTitle")}</DialogTitle>
            <DialogDescription>{t("admin.commissions.deleteTierModalDesc")}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-800 dark:text-red-300">{t("admin.commissions.confirmDeleteTier", { name: selectedTier?.name ?? "" })}</p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="rounded-lg" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 rounded-lg gap-1.5" disabled={isSaving}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}{t("admin.commissions.deleteTier")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
