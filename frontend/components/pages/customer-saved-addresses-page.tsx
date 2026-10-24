"use client"

import { useEffect, useRef, useState } from "react"
import { useJsApiLoader } from "@react-google-maps/api"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from "@/backend/services/google-maps"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { MapPin, Home, Building, Plus, MoreHorizontal, Pencil, Trash2, Star, Navigation, Loader2 } from "lucide-react"
import { getAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, type AddressItem } from "@/backend/actions/addresses"
import { AddressAutocompleteInput, type PlaceResult } from "@/frontend/components/maps/address-autocomplete-input"
import { StaticLocationMap } from "@/frontend/components/maps/static-location-map"
import { isGoogleMapsConfigured } from "@/backend/services/google-maps"
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

  const mapsConfigured = isGoogleMapsConfigured()
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  const refresh = () => getAddresses().then(setAddresses)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
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
        if (mapsConfigured && mapsLoaded && typeof google !== "undefined") {
          try {
            new google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
              if (request !== locationRequest.current) return
              if (status === "OK" && results?.[0]?.formatted_address) {
                setFormAddress(results[0].formatted_address)
                const cityComponent = results[0].address_components.find((c) => c.types.includes("locality"))
                setFormCity(cityComponent?.long_name ?? null)
              }
            })
          } catch { /* Keep the usable GPS address if the Maps lookup fails. */ }
        }
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
      city: formCity ?? undefined, latitude: formLat ?? undefined, longitude: formLng ?? undefined,
    }
    const result = editingId ? await updateAddress({ id: editingId, ...payload }) : await createAddress(payload)
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    await refresh()
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    setMenuOpen(null)
    setAddresses((prev) => prev.filter((a) => a.id !== id))
    await deleteAddress({ id })
  }

  const setDefault = async (id: string) => {
    setMenuOpen(null)
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })))
    await setDefaultAddress({ id })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 lg:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">{t("customer.savedAddresses.title")}</h1>
            <p className="text-xs text-muted-foreground mt-1">{t("customer.savedAddresses.subtitle")}</p>
          </div>
          <Button onClick={openAdd} className="rounded-xl gap-1.5"><Plus className="w-4 h-4" />{t("customer.savedAddresses.addNew")}</Button>
        </div>

        <div className="space-y-3">
          {addresses.length === 0 && (
            <Card className="p-10 text-center border-0 shadow-sm">
              <p className="text-xs text-muted-foreground">{t("customer.savedAddresses.empty")}</p>
            </Card>
          )}
          {addresses.map(addr => {
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
                          <button onClick={() => openEdit(addr)} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />{t("common.edit")}</button>
                          {!addr.isDefault && <button onClick={() => setDefault(addr.id)} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2"><Star className="w-3.5 h-3.5" />{t("customer.savedAddresses.setDefault")}</button>}
                          <button onClick={() => handleDelete(addr.id)} className="w-full px-3 py-2 text-xs text-left hover:bg-destructive/10 text-destructive flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />{t("common.delete")}</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={changeFormOpen}>
          <DialogContent className="max-w-md rounded-2xl" aria-describedby={undefined}>
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
                  onChange={(value) => { cancelLocationLookup(); setFormAddress(value) }}
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
