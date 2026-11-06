"use client"

import { useMapSettings, reverseMapLocation } from "@/frontend/lib/maps-provider"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { MapPin, Home, Building, Plus, MoreHorizontal, Pencil, Trash2, Star, Navigation, Loader2 } from "lucide-react"
import { getAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, type AddressItem } from "@/backend/actions/addresses"
import { AddressAutocompleteInput, type PlaceResult } from "@/frontend/components/maps/address-autocomplete-input"
import { StaticLocationMap } from "@/frontend/components/maps/static-location-map"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

type UiType = "home" | "office" | "other"

const typeIcons: Record<UiType, typeof Home> = { home: Home, office: Building, other: MapPin }
const TYPE_TO_DB: Record<UiType, "HOME" | "OFFICE" | "OTHER"> = { home: "HOME", office: "OFFICE", other: "OTHER" }
const TYPE_FROM_DB: Record<string, UiType> = { HOME: "home", OFFICE: "office", OTHER: "other" }

export function CustomerSavedAddressesPage() {
  const { t } = useLocalization()
  const typeLabels: Record<UiType, string> = {
    home: t("customer.savedAddresses.typeHome"),
    office: t("customer.savedAddresses.typeOffice"),
    other: t("customer.savedAddresses.typeOther"),
  }
  const [addresses, setAddresses] = useState<AddressItem[]>([])
  const [query,setQuery]=useState("")
  const [typeFilter,setTypeFilter]=useState("ALL")
  const [pageError,setPageError]=useState("")
  const [busyAddress,setBusyAddress]=useState(false)
  const [deleteTarget,setDeleteTarget]=useState<AddressItem|null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formLabel, setFormLabel] = useState("")
  const [formAddress, setFormAddress] = useState("")
  const [formType, setFormType] = useState<UiType>("home")
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [formCity, setFormCity] = useState<string | null>(null)
  const [formLat, setFormLat] = useState<number | null>(null)
  const [formLng, setFormLng] = useState<number | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locateError, setLocateError] = useState("")
  const locationRequest = useRef(0)
  const cancelLocationLookup = () => { locationRequest.current++; setIsLocating(false) }
  const changeFormOpen = (open: boolean) => { cancelLocationLookup(); setShowForm(open) }

  useEffect(() => () => { locationRequest.current++ }, [])

  const { data: mapConfig } = useMapSettings()

  const refresh = () => getAddresses().then(setAddresses)

  useEffect(() => {
    refresh().catch(()=>setPageError("Saved addresses could not load. Please retry.")).finally(() => setIsLoading(false))
  }, [])

  const openAdd = () => {
    cancelLocationLookup()
    setEditingId(null); setFormLabel(""); setFormAddress(""); setFormType("home")
    setFormCity(null); setFormLat(null); setFormLng(null)
    setShowForm(true); setFormError(""); setLocateError("")
  }
  const openEdit = (a: AddressItem) => {
    cancelLocationLookup()
    setEditingId(a.id); setFormLabel(a.label); setFormAddress(a.address); setFormType(TYPE_FROM_DB[a.type] ?? "other")
    setFormCity(a.city); setFormLat(a.latitude); setFormLng(a.longitude)
    setShowForm(true); setMenuOpen(null); setFormError(""); setLocateError("")
  }

  const handlePlaceSelected = (place: PlaceResult) => {
    cancelLocationLookup()
    setFormAddress(place.address)
    setFormCity(place.city)
    setFormLat(place.latitude)
    setFormLng(place.longitude)
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) { setLocateError(t("customer.savedAddresses.geoUnsupported")); return }
    const request = ++locationRequest.current
    setIsLocating(true)
    setLocateError("")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest.current) return
        const { latitude, longitude } = position.coords
        // A failed, denied or slow geocoder must never leave the address blank
        // (or leave an old address attached to a newly detected GPS pin).
        setFormLat(latitude)
        setFormLng(longitude)
        setFormCity(null)
        setFormAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
        setIsLocating(false)
        void reverseMapLocation(mapConfig?.provider, latitude, longitude).then(place => {
          if (request !== locationRequest.current || !place) return
          setFormAddress(place.address)
          setFormCity(place.city)
        }).catch(() => { /* Keep the usable GPS address when lookup fails. */ })
      },
      () => {
        if (request !== locationRequest.current) return
        setIsLocating(false); setLocateError(t("customer.savedAddresses.geoError"))
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleSave = async () => {
    if (!formLabel || !formAddress) return
    cancelLocationLookup()
    setIsSaving(true)
    setFormError("")
    const payload = {
      label: formLabel, address: formAddress, type: TYPE_TO_DB[formType],
      city: formCity, latitude: formLat, longitude: formLng,
    }
    try{
      const result = editingId ? await updateAddress({ id: editingId, ...payload }) : await createAddress(payload)
      if (!result.success) { setFormError(result.error); return }
      await refresh();setShowForm(false)
    }catch{setFormError("The address could not be confirmed. Refresh before retrying.")}
    finally{setIsSaving(false)}
  }

  const handleDelete = async () => {
    if(!deleteTarget||busyAddress)return
    setBusyAddress(true);setPageError("")
    try{const result=await deleteAddress({id:deleteTarget.id});if(!result.success){setPageError(result.error);return}await refresh();setDeleteTarget(null)}catch{setPageError("The address could not be removed. Please retry.")}finally{setBusyAddress(false)}
  }
  const setDefault = async (id: string) => {
    if(busyAddress)return
    setMenuOpen(null);setBusyAddress(true);setPageError("")
    try{const result=await setDefaultAddress({id});if(!result.success){setPageError(result.error);return}await refresh()}catch{setPageError("The default address could not be updated.")}finally{setBusyAddress(false)}
  }
  const visibleAddresses=addresses.filter(address=>(typeFilter==="ALL"||address.type===typeFilter)&&`${address.label} ${address.address} ${address.city??""}`.toLowerCase().includes(query.toLowerCase()))

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">{t("customer.savedAddresses.title")}</h1>
            <p className="text-xs text-muted-foreground mt-1">{t("customer.savedAddresses.subtitle")}</p>
          </div>
          <Button onClick={openAdd} className="rounded-xl gap-1.5"><Plus className="w-4 h-4" />{t("customer.savedAddresses.addNew")}</Button>
        </div>

        <section aria-label="Find a saved address" className="customer-surface mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><Input aria-label="Search saved addresses" placeholder="Search a name, area or landmark" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="Address type filter" className="min-h-11 rounded-xl border bg-background px-3 text-sm" value={typeFilter} onChange={event=>setTypeFilter(event.target.value)}><option value="ALL">All address types</option><option value="HOME">Home</option><option value="OFFICE">Office</option><option value="OTHER">Other</option></select><p className="text-xs text-muted-foreground sm:col-span-2">{visibleAddresses.length} of {addresses.length} saved places. Your default address helps prefill supported booking and delivery flows.</p></section>
        {pageError&&<div role="alert" className="mb-4 rounded-xl border border-red-200 p-4 text-sm text-red-800">{pageError}<button type="button" className="ml-3 min-h-11 underline" onClick={()=>void refresh().then(()=>setPageError("")).catch(()=>setPageError("Addresses still could not load."))}>Retry</button></div>}
        <div className="grid items-start gap-4 md:grid-cols-2">
          {addresses.length === 0 && (
            <Card className="p-10 text-center border-0 shadow-sm">
              <p className="text-xs text-muted-foreground">{t("customer.savedAddresses.empty")}</p>
            </Card>
          )}
          {visibleAddresses.map(addr => {
            const uiType = TYPE_FROM_DB[addr.type] ?? "other"
            const Icon = typeIcons[uiType]
            return (
              <Card key={addr.id} className="p-4 border-0 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${addr.isDefault ? "bg-primary/10" : "bg-muted"}`}>
                    <Icon className={`w-5 h-5 ${addr.isDefault ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-xs text-foreground">{addr.label}</p>
                      {addr.isDefault && (
                        <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t("customer.savedAddresses.default")}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{addr.address}</p>
                  </div>
                  <div className="relative flex-shrink-0">
                    <button onClick={() => setMenuOpen(menuOpen === addr.id ? null : addr.id)} aria-label={t("customer.messages.moreOptions")} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {menuOpen === addr.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                        <div className="absolute right-0 top-8 w-40 bg-card rounded-xl shadow-xl border border-border z-50 overflow-hidden py-1">
                          <button onClick={() => openEdit(addr)} className="min-h-11 w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />{t("common.edit")}</button>
                          {!addr.isDefault && <button onClick={() => setDefault(addr.id)} className="min-h-11 w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2"><Star className="w-3.5 h-3.5" />{t("customer.savedAddresses.setDefault")}</button>}
                          <button onClick={() => {setMenuOpen(null);setDeleteTarget(addr)}} className="min-h-11 w-full px-3 py-2 text-sm text-left hover:bg-destructive/10 text-destructive flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />{t("common.delete")}</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        {!visibleAddresses.length&&addresses.length>0&&<p className="customer-surface mt-4 text-sm text-muted-foreground">No addresses match these filters.</p>}
        <Dialog open={!!deleteTarget} onOpenChange={open=>{if(!open&&!busyAddress)setDeleteTarget(null)}}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Remove this saved address?</DialogTitle></DialogHeader><p className="text-sm leading-6 text-muted-foreground">{deleteTarget?.label}: {deleteTarget?.address}. Previous orders keep their original delivery information.</p>{pageError&&<p role="alert" className="text-sm text-destructive">{pageError}</p>}<div className="flex gap-3"><Button variant="outline" disabled={busyAddress} onClick={()=>setDeleteTarget(null)}>Keep address</Button><Button variant="destructive" disabled={busyAddress} onClick={()=>void handleDelete()}>Remove address</Button></div></DialogContent></Dialog>
        {/* Add/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={changeFormOpen}>
          <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl rounded-2xl" aria-describedby={undefined}>
            <DialogHeader><DialogTitle>{editingId ? t("customer.savedAddresses.editAddress") : t("customer.savedAddresses.addAddress")}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div><label className="text-xs font-medium mb-2 block">{t("customer.savedAddresses.label")}</label><Input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder={t("customer.savedAddresses.labelPlaceholder")} className="rounded-xl" /></div>
              <div><label className="text-xs font-medium mb-2 block">{t("customer.savedAddresses.type")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["home", "office", "other"] as const).map(uiType => {
                    const TIcon = typeIcons[uiType]
                    return (<button key={uiType} onClick={() => setFormType(uiType)} className={`p-3 rounded-xl text-center border-2 transition-all ${formType === uiType ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}><TIcon className="w-5 h-5 mx-auto mb-1" /><span className="text-[11px] font-medium">{typeLabels[uiType]}</span></button>)
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-2 block">{t("customer.savedAddresses.fullAddress")}</label>
                <AddressAutocompleteInput
                  value={formAddress}
                  ariaLabel={t("customer.savedAddresses.fullAddress")}
                  onChange={(value) => { cancelLocationLookup(); setFormAddress(value);setFormLat(null);setFormLng(null);setFormCity(null) }}
                  onPlaceSelected={handlePlaceSelected}
                  placeholder={t("customer.savedAddresses.fullAddressPlaceholder")}
                  className="rounded-xl"
                />
              </div>
              {formLat != null && formLng != null && (
                <StaticLocationMap latitude={formLat} longitude={formLng} label={formAddress} className="h-32 w-full rounded-xl" />
              )}
              <Button onClick={handleUseCurrentLocation} variant="outline" disabled={isLocating} className="w-full rounded-xl bg-transparent gap-2">
                {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                {t("customer.savedAddresses.useCurrentLocation")}
              </Button>
              {locateError && <p role="alert" className="text-[11px] text-red-600">{locateError}</p>}
              {formError && <p className="text-[11px] text-red-600">{formError}</p>}
            </div>
            <div className="flex gap-3"><Button variant="outline" onClick={() => changeFormOpen(false)} className="flex-1 rounded-xl bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button><Button onClick={handleSave} className="flex-1 rounded-xl" disabled={!formLabel || !formAddress || isSaving || isLocating}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.save")}</Button></div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
