"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Warehouse, Store, Building2, Boxes, Plus, ArrowRightLeft, MapPin, Phone,
  Star, Loader2, Pencil, Trash2, Power, Package,
} from "lucide-react"
import {
  getMyLocations, createLocation, updateLocation, toggleLocationActive, deleteLocation,
  getMyDistributorProductOptions, transferStock, getStockTransferHistory,
  type DistributorLocationRow, type TransferProductOption, type StockTransferRow,
} from "@/lib/actions/distributor-locations"
import { useLocalization } from "@/lib/hooks/useLocalization"

type LocationType = "WAREHOUSE" | "RETAIL_STORE" | "WHOLESALER" | "DISTRIBUTOR"

const TYPE_LABEL_KEY: Record<LocationType, "distributor.locations.typeWarehouse" | "distributor.locations.typeRetailStore" | "distributor.locations.typeWholesaler" | "distributor.locations.typeDistributor"> = {
  WAREHOUSE: "distributor.locations.typeWarehouse",
  RETAIL_STORE: "distributor.locations.typeRetailStore",
  WHOLESALER: "distributor.locations.typeWholesaler",
  DISTRIBUTOR: "distributor.locations.typeDistributor",
}
const TYPE_ICON: Record<LocationType, typeof Warehouse> = {
  WAREHOUSE: Warehouse, RETAIL_STORE: Store, WHOLESALER: Boxes, DISTRIBUTOR: Building2,
}
const TYPE_COLOR: Record<LocationType, string> = {
  WAREHOUSE: "from-blue-500 to-blue-600",
  RETAIL_STORE: "from-purple-500 to-purple-600",
  WHOLESALER: "from-orange-500 to-orange-600",
  DISTRIBUTOR: "from-teal-500 to-cyan-600",
}

const EMPTY_LOCATION_FORM = { name: "", type: "WAREHOUSE" as LocationType, address: "", city: "", phone: "", isPrimary: false, deliveryFee: "500", deliveryRadiusKm: "", deliveryFeePerKm: "0" }

export default function DistributorLocationsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [locations, setLocations] = useState<DistributorLocationRow[]>([])
  const [activeTab, setActiveTab] = useState<"ALL" | LocationType>("ALL")

  const [showLocationModal, setShowLocationModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION_FORM)
  const [isSavingLocation, setIsSavingLocation] = useState(false)
  const [locationError, setLocationError] = useState("")

  const [showTransferModal, setShowTransferModal] = useState(false)
  const [productOptions, setProductOptions] = useState<TransferProductOption[]>([])
  const [transferForm, setTransferForm] = useState({ distributorProductId: "", fromLocationId: "", toLocationId: "", quantity: "", notes: "" })
  const [isTransferring, setIsTransferring] = useState(false)
  const [transferError, setTransferError] = useState("")

  const [transfers, setTransfers] = useState<StockTransferRow[]>([])

  const refresh = async () => {
    const [locs, hist] = await Promise.all([getMyLocations(), getStockTransferHistory()])
    setLocations(locs)
    setTransfers(hist)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filtered = activeTab === "ALL" ? locations : locations.filter((l) => l.type === activeTab)

  const tabs: { label: string; value: "ALL" | LocationType }[] = [
    { label: t("distributor.locations.tabAll"), value: "ALL" },
    { label: t("distributor.locations.typeWarehouse"), value: "WAREHOUSE" },
    { label: t("distributor.locations.typeRetailStore"), value: "RETAIL_STORE" },
    { label: t("distributor.locations.typeWholesaler"), value: "WHOLESALER" },
    { label: t("distributor.locations.typeDistributor"), value: "DISTRIBUTOR" },
  ]

  const openCreate = () => {
    setEditingId(null)
    setLocationForm(EMPTY_LOCATION_FORM)
    setLocationError("")
    setShowLocationModal(true)
  }

  const openEdit = (loc: DistributorLocationRow) => {
    setEditingId(loc.id)
    setLocationForm({ name: loc.name, type: loc.type, address: loc.address, city: loc.city ?? "", phone: loc.phone ?? "", isPrimary: loc.isPrimary, deliveryFee: String(loc.deliveryFee),
      deliveryRadiusKm: loc.deliveryRadiusKm != null ? String(loc.deliveryRadiusKm) : "",
      deliveryFeePerKm: String(loc.deliveryFeePerKm) })
    setLocationError("")
    setShowLocationModal(true)
  }

  const handleSaveLocation = async () => {
    const deliveryFee = Number(locationForm.deliveryFee)
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      setLocationError(t("distributor.locations.deliveryFeeInvalid"))
      return
    }
    setIsSavingLocation(true)
    setLocationError("")
    const radiusRaw = locationForm.deliveryRadiusKm.trim()
    const deliveryRadiusKm = radiusRaw === "" ? null : Number(radiusRaw)
    if (deliveryRadiusKm != null && (!Number.isFinite(deliveryRadiusKm) || deliveryRadiusKm <= 0)) {
      setLocationError(t("distributor.locations.deliveryRadiusInvalid"))
      return
    }
    const deliveryFeePerKm = Number(locationForm.deliveryFeePerKm || 0)
    if (!Number.isFinite(deliveryFeePerKm) || deliveryFeePerKm < 0) {
      setLocationError(t("distributor.locations.deliveryPerKmInvalid"))
      return
    }
    const payload = { ...locationForm, deliveryFee, deliveryRadiusKm, deliveryFeePerKm }
    const result = editingId
      ? await updateLocation({ id: editingId, ...payload })
      : await createLocation(payload)
    setIsSavingLocation(false)
    if (!result.success) { setLocationError(result.error); return }
    setShowLocationModal(false)
    await refresh()
  }

  const handleToggleActive = async (id: string) => {
    await toggleLocationActive({ id })
    await refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("distributor.locations.deleteConfirm"))) return
    const result = await deleteLocation({ id })
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const openTransferModal = async () => {
    const options = await getMyDistributorProductOptions()
    setProductOptions(options)
    setTransferForm({ distributorProductId: "", fromLocationId: "", toLocationId: "", quantity: "", notes: "" })
    setTransferError("")
    setShowTransferModal(true)
  }

  const handleTransfer = async () => {
    setIsTransferring(true)
    setTransferError("")
    const quantity = parseInt(transferForm.quantity, 10)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setTransferError(t("distributor.locations.quantityValidationError"))
      setIsTransferring(false)
      return
    }
    const result = await transferStock({ ...transferForm, quantity })
    setIsTransferring(false)
    if (!result.success) { setTransferError(result.error); return }
    setShowTransferModal(false)
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t("distributor.locations.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400">{t("distributor.locations.subtitle")}</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={openTransferModal}
              disabled={locations.length < 2}
              title={locations.length < 2 ? t("distributor.locations.transferDisabledTooltip") : undefined}
              className="gap-2 bg-transparent"
            >
              <ArrowRightLeft className="w-4 h-4" />
              {t("distributor.locations.transferStockButton")}
            </Button>
            <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700 gap-2">
              <Plus className="w-4 h-4" />
              {t("distributor.locations.addLocationButton")}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors text-xs ${
                activeTab === tab.value
                  ? "bg-teal-600 text-white shadow-lg"
                  : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card className="p-12 text-center border-0 shadow-lg mb-8">
            <Warehouse className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {locations.length === 0 ? t("distributor.locations.noLocationsYet") : t("distributor.locations.noLocationsMatchFilter")}
            </p>
            {locations.length === 0 && (
              <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700 gap-2 mx-auto">
                <Plus className="w-4 h-4" />
                {t("distributor.locations.addLocationButton")}
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {filtered.map((loc) => {
              const Icon = TYPE_ICON[loc.type]
              return (
                <Card key={loc.id} className="p-5 border-0 shadow-lg hover:shadow-xl transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-gradient-to-br ${TYPE_COLOR[loc.type]}`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex items-center gap-1">
                      {loc.isPrimary && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${loc.isActive ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"}`}>
                        {loc.isActive ? t("distributor.common.active") : t("distributor.common.inactive")}
                      </span>
                    </div>
                  </div>

                  <Link href={`/distributor/locations/${loc.id}`} className="block mb-1">
                    <h3 className="font-bold text-gray-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 transition-colors">{loc.name}</h3>
                  </Link>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">{t(TYPE_LABEL_KEY[loc.type])}</p>

                  <div className="space-y-1.5 mb-4 text-xs text-gray-600 dark:text-gray-400">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span className="truncate">{[loc.address, loc.city].filter(Boolean).join(", ")}</span>
                    </div>
                    {loc.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{loc.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mb-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Package className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold text-gray-900 dark:text-white">{loc.itemCount}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-[11px]">{t("distributor.locations.itemsLabel")}</span>
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-gray-900 dark:text-white">{loc.totalStock}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-[11px]"> {t("distributor.locations.unitsLabel")}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(loc)} className="flex-1 gap-1.5 bg-transparent">
                      <Pencil className="w-3.5 h-3.5" /> {t("common.edit")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleToggleActive(loc.id)} className="gap-1.5 bg-transparent">
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(loc.id)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 bg-transparent">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        <Card className="p-6 border-0 shadow-lg">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("distributor.locations.recentStockTransfers")}</h2>
          {transfers.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">{t("distributor.locations.noStockTransfersYet")}</p>
          ) : (
            <div className="space-y-3">
              {transfers.slice(0, 8).map((transfer) => (
                <div key={transfer.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-xs">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{transfer.productName}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{transfer.fromLocationName} <ArrowRightLeft className="inline w-3 h-3 mx-1" /> {transfer.toLocationName} · {t("distributor.locations.transferByLabel", { name: transfer.initiatedByName })}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">{t("distributor.locations.unitsSuffix", { count: transfer.quantity })}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{new Date(transfer.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showLocationModal} onOpenChange={setShowLocationModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("distributor.locations.editLocationTitle") : t("distributor.locations.addLocationTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>{t("distributor.locations.nameLabel")}</Label>
              <Input value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} placeholder={t("distributor.locations.namePlaceholder")} className="mt-1.5" />
            </div>
            <div>
              <Label>{t("distributor.locations.typeLabel")}</Label>
              <Select value={locationForm.type} onValueChange={(v) => setLocationForm({ ...locationForm, type: v as LocationType })}>
                <SelectTrigger className="w-full mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL_KEY) as LocationType[]).map((type) => (
                    <SelectItem key={type} value={type}>{t(TYPE_LABEL_KEY[type])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("distributor.locations.addressLabel")}</Label>
              <Input value={locationForm.address} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} placeholder={t("distributor.locations.addressPlaceholder")} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("distributor.locations.cityLabel")}</Label>
                <Input value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>{t("distributor.locations.phoneLabel")}</Label>
                <Input value={locationForm.phone} onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>{t("distributor.locations.deliveryFeeLabel")}</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">KES</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={locationForm.deliveryFee}
                  onChange={(e) => setLocationForm({ ...locationForm, deliveryFee: e.target.value })}
                  className="pl-12"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">{t("distributor.locations.deliveryFeeHint")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t("distributor.locations.deliveryRadiusLabel")}</Label>
                <div className="relative mt-1.5">
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={locationForm.deliveryRadiusKm}
                    onChange={(e) => setLocationForm({ ...locationForm, deliveryRadiusKm: e.target.value })}
                    placeholder={t("distributor.locations.deliveryRadiusPlaceholder")}
                    className="pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">km</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {locationForm.deliveryRadiusKm.trim() === ""
                    ? t("distributor.locations.deliveryRadiusUnset")
                    : t("distributor.locations.deliveryRadiusHint", { km: locationForm.deliveryRadiusKm })}
                </p>
              </div>
              <div>
                <Label>{t("distributor.locations.deliveryPerKmLabel")}</Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">KES</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={locationForm.deliveryFeePerKm}
                    onChange={(e) => setLocationForm({ ...locationForm, deliveryFeePerKm: e.target.value })}
                    className="pl-12"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">{t("distributor.locations.deliveryPerKmHint")}</p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={locationForm.isPrimary} onCheckedChange={(c) => setLocationForm({ ...locationForm, isPrimary: c === true })} />
              <span className="text-xs text-gray-700 dark:text-gray-300">{t("distributor.locations.setPrimaryLabel")}</span>
            </label>

            {locationError && <p className="text-xs text-red-600">{locationError}</p>}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSaveLocation} disabled={isSavingLocation || !locationForm.name.trim() || !locationForm.address.trim()} className="flex-1 bg-teal-600 hover:bg-teal-700">
                {isSavingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? t("distributor.common.saveChanges") : t("distributor.locations.addLocationSubmit")}
              </Button>
              <Button variant="outline" onClick={() => setShowLocationModal(false)} disabled={isSavingLocation}>{t("common.cancel")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("distributor.locations.transferStockTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {productOptions.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("distributor.locations.noProductsForTransfer")}</p>
            ) : (
              <>
                <div>
                  <Label>{t("distributor.locations.productLabel")}</Label>
                  <Select value={transferForm.distributorProductId} onValueChange={(v) => setTransferForm({ ...transferForm, distributorProductId: v })}>
                    <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder={t("distributor.locations.selectProductPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {productOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t("distributor.locations.fromLabel")}</Label>
                    <Select value={transferForm.fromLocationId} onValueChange={(v) => setTransferForm({ ...transferForm, fromLocationId: v })}>
                      <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder={t("distributor.locations.sourcePlaceholder")} /></SelectTrigger>
                      <SelectContent>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("distributor.locations.toLabel")}</Label>
                    <Select value={transferForm.toLocationId} onValueChange={(v) => setTransferForm({ ...transferForm, toLocationId: v })}>
                      <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder={t("distributor.locations.destinationPlaceholder")} /></SelectTrigger>
                      <SelectContent>
                        {locations.filter((l) => l.id !== transferForm.fromLocationId).map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>{t("distributor.locations.quantityLabel")}</Label>
                  <Input type="number" min={1} value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>{t("distributor.locations.notesLabel")}</Label>
                  <Input value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} placeholder={t("distributor.locations.notesPlaceholder")} className="mt-1.5" />
                </div>

                {transferError && <p className="text-xs text-red-600">{transferError}</p>}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleTransfer}
                    disabled={isTransferring || !transferForm.distributorProductId || !transferForm.fromLocationId || !transferForm.toLocationId || !transferForm.quantity}
                    className="flex-1 bg-teal-600 hover:bg-teal-700"
                  >
                    {isTransferring ? <Loader2 className="w-4 h-4 animate-spin" /> : t("distributor.locations.transferButton")}
                  </Button>
                  <Button variant="outline" onClick={() => setShowTransferModal(false)} disabled={isTransferring}>{t("common.cancel")}</Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
