"use client"

import { useEffect, useState } from "react"
import { Search, Download, Edit, Trash2, DollarSign, TrendingUp, Loader2, Check, X } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import {
  getAdminServices, updateServiceBasePrice, deleteAdminService, toggleServiceActive,
  approveService, rejectService,
  type AdminServiceRow,
} from "@/backend/actions/admin-pricing"

const APPROVAL_BADGE: Record<AdminServiceRow["approvalStatus"], string> = {
  Pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  Approved: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  Rejected: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
}

export default function PricingPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [pricing, setPricing] = useState<AdminServiceRow[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState("All")
  const [selectedService, setSelectedService] = useState<AdminServiceRow | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editPrice, setEditPrice] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminServiceRow | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)

  const APPROVAL_LABEL: Record<AdminServiceRow["approvalStatus"], string> = {
    Pending: t("admin.pricing.approvalPending"),
    Approved: t("admin.pricing.approvalApproved"),
    Rejected: t("admin.pricing.approvalRejected"),
  }

  const STATUS_LABEL: Record<string, string> = {
    Active: t("admin.pricing.statusActive"),
    Inactive: t("admin.pricing.statusInactive"),
  }

  const refresh = async () => {
    const data = await getAdminServices()
    setPricing(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleExportPricing = () => {
    const data = {
      exportDate: new Date().toISOString(),
      totalServices: pricing.length,
      pricing: pricing.map(p => ({ id: p.id, name: p.name, category: p.category, provider: p.provider, basePrice: p.basePrice, skillLevel: p.skillLevel, status: p.status })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pricing-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleDeleteService = async (serviceId: string) => {
    if (!confirm(t("admin.pricing.confirmDeleteService"))) return
    setBusyId(serviceId)
    const result = await deleteAdminService({ serviceId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleToggleActive = async (serviceId: string) => {
    setBusyId(serviceId)
    const result = await toggleServiceActive({ serviceId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleApprove = async (serviceId: string) => {
    setBusyId(serviceId)
    const result = await approveService({ serviceId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return
    setIsRejecting(true)
    const result = await rejectService({ serviceId: rejectTarget.id, reason: rejectReason.trim() })
    setIsRejecting(false)
    if (!result.success) { alert(result.error); return }
    setRejectTarget(null)
    setRejectReason("")
    await refresh()
  }

  const handleSaveChanges = async () => {
    if (!selectedService || !editPrice) return
    setIsSaving(true)
    const result = await updateServiceBasePrice({ serviceId: selectedService.id, basePrice: Number(editPrice) })
    setIsSaving(false)
    if (!result.success) { alert(result.error); return }
    setShowModal(false)
    await refresh()
  }

  const filters = [
    { label: t("admin.pricing.filterAll"), type: "All", count: pricing.length },
    { label: t("admin.pricing.filterPendingApproval"), type: "Pending", count: pricing.filter(p => p.approvalStatus === "Pending").length },
    { label: STATUS_LABEL.Active, type: "Active", count: pricing.filter(p => p.status === "Active").length },
    { label: STATUS_LABEL.Inactive, type: "Inactive", count: pricing.filter(p => p.status === "Inactive").length },
  ]

  const filteredPricing = pricing.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()) || p.provider.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = activeFilter === "All" || (activeFilter === "Pending" ? p.approvalStatus === "Pending" : p.status === activeFilter)
    return matchesSearch && matchesFilter
  })

  const stats = [
    { label: t("admin.pricing.statTotalServices"), value: pricing.length, icon: DollarSign, color: "from-blue-50 to-blue-100" },
    { label: t("admin.pricing.statActiveServices"), value: pricing.filter(p => p.status === "Active").length, icon: TrendingUp, color: "from-emerald-50 to-emerald-100" },
    { label: t("admin.pricing.statAvgBasePrice"), value: pricing.length > 0 ? formatMoney(pricing.reduce((sum, p) => sum + p.basePrice, 0) / pricing.length) : formatMoney(0), icon: DollarSign, color: "from-yellow-50 to-yellow-100" },
    { label: t("admin.pricing.statTotalValue"), value: formatMoney(pricing.reduce((sum, p) => sum + p.basePrice, 0)), icon: TrendingUp, color: "from-purple-50 to-purple-100" },
  ]

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("admin.pricing.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.pricing.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={i} className={`p-4 border-0 shadow-lg bg-gradient-to-br ${stat.color} dark:from-gray-800 dark:to-gray-800`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{stat.label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
                </div>
                <Icon className="w-5 h-5 text-gray-400" />
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="w-full sm:flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t("admin.pricing.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
          />
        </div>
        <Button onClick={handleExportPricing} className="bg-green-600 hover:bg-green-700 gap-2">
          <Download size={18} />
          <span className="hidden sm:inline">{t("admin.pricing.export")}</span>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {filters.map((filter) => (
          <button
            key={filter.type}
            onClick={() => setActiveFilter(filter.type)}
            className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors flex items-center gap-2 text-xs ${
              activeFilter === filter.type
                ? "bg-blue-600 text-white shadow-lg"
                : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {filter.label}
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-200 dark:bg-gray-700">{filter.count}</span>
          </button>
        ))}
      </div>

      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.pricing.colService")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.pricing.providerLabel")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.pricing.colCategory")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.pricing.colBasePrice")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.pricing.colSkillLevel")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.pricing.colApproval")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("common.status")}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.pricing.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPricing.length > 0 ? filteredPricing.map((service) => (
                <tr key={service.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{service.name}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{service.provider}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{service.category}</td>
                  <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(service.basePrice)}</td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">{service.skillLevel}</td>
                  <td className="px-6 py-4">
                    <span title={service.rejectionReason ?? undefined} className={`px-3 py-1 rounded-full text-[11px] font-semibold ${APPROVAL_BADGE[service.approvalStatus]}`}>
                      {APPROVAL_LABEL[service.approvalStatus] ?? service.approvalStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(service.id)}
                      disabled={busyId === service.id}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                        service.status === "Active"
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {busyId === service.id ? "..." : (STATUS_LABEL[service.status] ?? service.status)}
                    </button>
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    {service.approvalStatus === "Pending" && (
                      <>
                        <button
                          onClick={() => handleApprove(service.id)}
                          disabled={busyId === service.id}
                          title={t("admin.pricing.approveListingTitle")}
                          className="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-colors text-emerald-600"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => { setRejectTarget(service); setRejectReason("") }}
                          disabled={busyId === service.id}
                          title={t("admin.pricing.rejectListingTitle")}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors text-red-600"
                        >
                          <X size={18} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => { setSelectedService(service); setEditPrice(service.basePrice.toString()); setShowModal(true) }}
                      className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-blue-600"
                    >
                      <Edit size={18} />
                    </button>
                    <button onClick={() => handleDeleteService(service.id)} disabled={busyId === service.id} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors text-red-600">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">{t("admin.pricing.noServicesFound")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.pricing.editServicePricingTitle")}</DialogTitle>
          </DialogHeader>
          {selectedService && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                <div>
                  <label className="text-[11px] text-muted-foreground">{t("admin.pricing.serviceNameLabel")}</label>
                  <p className="font-semibold mt-1">{selectedService.name}</p>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">{t("admin.pricing.providerLabel")}</label>
                  <p className="font-semibold mt-1">{selectedService.provider}</p>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">{t("admin.pricing.basePriceKesLabel")}</label>
                  <input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg mt-1 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowModal(false)} disabled={isSaving}>{t("common.cancel")}</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSaveChanges} disabled={isSaving || !editPrice}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.pricing.saveChanges")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.pricing.rejectServiceListingTitle")}</DialogTitle>
          </DialogHeader>
          {rejectTarget && (
            <div className="space-y-4 py-4">
              <p className="text-xs text-muted-foreground">
                {t("admin.pricing.rejectingNotice", { name: rejectTarget.name, provider: rejectTarget.provider })}
              </p>
              <Textarea
                placeholder={t("admin.pricing.rejectReasonPlaceholder")}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setRejectTarget(null)} disabled={isRejecting}>{t("common.cancel")}</Button>
                <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={isRejecting || !rejectReason.trim()}>
                  {isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.pricing.rejectListing")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
