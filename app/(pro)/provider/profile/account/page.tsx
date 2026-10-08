"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, User, Mail, MapPin, Loader2, Store, X, Search, Building2 } from "lucide-react"
import Link from "next/link"
import {
  getMyAccount, updateMyAccount, getMyLinkedShop, searchShops, linkMyShop, unlinkMyShop,
  type LinkedShop, type ShopSearchResult,
} from "@/lib/actions/provider-account"
import { getMyProviderBusinessInfo, completeBusinessOnboarding, type ProviderBusinessInfo } from "@/lib/actions/provider-business"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { AddressAutocompleteInput, type PlaceResult } from "@/components/maps/address-autocomplete-input"

export default function MyAccountPage() {
  const { t } = useLocalization()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [formData, setFormData] = useState({ firstName: "", lastName: "", email: "", phone: "", location: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Coordinates for the location text above. Only set by picking a place out
  // of the autocomplete — free-typed text clears them (see handleLocationText)
  // rather than leaving the provider pinned somewhere they no longer claim.
  // A provider without coordinates simply doesn't appear in customers'
  // radius searches; they are never defaulted to a city centre.
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)

  const [linkedShop, setLinkedShop] = useState<LinkedShop>(null)
  const [shopQuery, setShopQuery] = useState("")
  const [shopResults, setShopResults] = useState<ShopSearchResult[]>([])
  const [isSearchingShops, setIsSearchingShops] = useState(false)
  const [isLinkingShop, setIsLinkingShop] = useState(false)

  const [businessInfo, setBusinessInfo] = useState<ProviderBusinessInfo | null>(null)
  const [showUpgradeForm, setShowUpgradeForm] = useState(false)
  const [upgradeRegistrationNumber, setUpgradeRegistrationNumber] = useState("")
  const [upgradeHqAddress, setUpgradeHqAddress] = useState("")
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState("")
  const [upgraded, setUpgraded] = useState(false)

  useEffect(() => {
    getMyAccount().then((data) => {
      if (!data) return
      setFormData({ firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone ?? "", location: data.location })
      if (data.latitude != null && data.longitude != null) {
        setCoords({ latitude: data.latitude, longitude: data.longitude })
      }
    }).finally(() => setIsLoading(false))
    getMyLinkedShop().then(setLinkedShop)
    getMyProviderBusinessInfo().then(setBusinessInfo)
  }, [])

  const handleUpgrade = async () => {
    if (!upgradeRegistrationNumber.trim() || !upgradeHqAddress.trim()) return
    setIsUpgrading(true)
    setUpgradeError("")
    const result = await completeBusinessOnboarding({ registrationNumber: upgradeRegistrationNumber, hqAddress: upgradeHqAddress })
    setIsUpgrading(false)
    if (!result.success) { setUpgradeError(result.error); return }
    setUpgraded(true)
    setTimeout(() => router.push("/provider/business/dashboard"), 1500)
  }

  useEffect(() => {
    if (shopQuery.trim().length < 2) { setShopResults([]); return }
    setIsSearchingShops(true)
    const timeout = setTimeout(() => {
      searchShops(shopQuery).then(setShopResults).finally(() => setIsSearchingShops(false))
    }, 300)
    return () => clearTimeout(timeout)
  }, [shopQuery])

  const handleLinkShop = async (shopId: string) => {
    setIsLinkingShop(true)
    const result = await linkMyShop({ shopId })
    setIsLinkingShop(false)
    if (result.success) {
      setLinkedShop(shopResults.find((s) => s.id === shopId) ?? null)
      setShopQuery("")
      setShopResults([])
    }
  }

  const handleUnlinkShop = async () => {
    setIsLinkingShop(true)
    await unlinkMyShop()
    setIsLinkingShop(false)
    setLinkedShop(null)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handlePlaceSelected = (place: PlaceResult) => {
    setFormData((prev) => ({ ...prev, location: place.address }))
    setCoords({ latitude: place.latitude, longitude: place.longitude })
  }

  /** Editing the text by hand invalidates the pin — the two must describe the
   *  same place, and there's no geocoder here to re-derive one from text. */
  const handleLocationText = (value: string) => {
    setFormData((prev) => ({ ...prev, location: value }))
    setCoords(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    const result = await updateMyAccount({ firstName: formData.firstName, lastName: formData.lastName, phone: formData.phone, location: formData.location, ...(coords ?? {}) })
    setIsSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      {/* Header */}
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Link href="/provider/profile" className="lg:hidden">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-bold">{t("provider.account.title")}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 space-y-6">
          {/* Personal Information */}
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5" />
              {t("provider.account.personalInfoTitle")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("provider.account.firstNameLabel")}</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("provider.account.lastNameLabel")}</label>
                <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {t("provider.account.contactInfoTitle")}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("auth.email")}</label>
                <input type="email" name="email" value={formData.email} disabled className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 cursor-not-allowed" />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t("provider.account.emailChangeHint")}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("provider.account.phoneLabel")}</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              {t("provider.account.locationTitle")}
            </h2>
            <AddressAutocompleteInput
              value={formData.location}
              onChange={handleLocationText}
              onPlaceSelected={handlePlaceSelected}
              placeholder={t("provider.account.locationPlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
              {coords
                ? t("provider.account.locationPinned", { lat: coords.latitude.toFixed(5), lng: coords.longitude.toFixed(5) })
                : t("provider.account.locationPinMissing")}
            </p>
          </div>

          {/* Linked Shop */}
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Store className="w-5 h-5" />
              {t("provider.account.linkedShopTitle")}
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">
              {t("provider.account.linkedShopDesc")}
            </p>
            {linkedShop ? (
              <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {linkedShop.logoUrl ? <img src={linkedShop.logoUrl} alt="" className="w-full h-full object-cover" /> : <Store className="w-5 h-5 text-gray-400" />}
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white text-xs">{linkedShop.name}</p>
                </div>
                <button onClick={handleUnlinkShop} disabled={isLinkingShop} aria-label={t("provider.account.unlinkShop")} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                  {isLinkingShop ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 text-red-600" />}
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={shopQuery}
                    onChange={(e) => setShopQuery(e.target.value)}
                    placeholder={t("provider.account.searchShopsPlaceholder")}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                  />
                </div>
                {shopQuery.trim().length >= 2 && (
                  <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 max-h-56 overflow-y-auto">
                    {isSearchingShops ? (
                      <div className="p-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                    ) : shopResults.length === 0 ? (
                      <p className="p-3 text-xs text-gray-500 dark:text-gray-400 text-center">{t("provider.account.noShopsFound")}</p>
                    ) : (
                      shopResults.map((shop) => (
                        <button
                          key={shop.id}
                          onClick={() => handleLinkShop(shop.id)}
                          disabled={isLinkingShop}
                          className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                            {shop.logoUrl ? <img src={shop.logoUrl} alt="" className="w-full h-full object-cover" /> : <Store className="w-4 h-4 text-gray-400" />}
                          </div>
                          <span className="text-xs font-medium text-gray-900 dark:text-white">{shop.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Convert to Business Account — Step 5 upgrade path */}
          {businessInfo && !businessInfo.isBusinessOwner && !businessInfo.parentBusinessId && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {t("provider.account.upgradeTitle")}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">{t("provider.account.upgradeDesc")}</p>

              {!showUpgradeForm ? (
                <button
                  onClick={() => setShowUpgradeForm(true)}
                  className="w-full border-2 border-dashed border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400 py-3 rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/10"
                >
                  {t("provider.account.upgradeButton")}
                </button>
              ) : upgraded ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{t("provider.account.upgradeSuccess")}</p>
              ) : (
                <div className="space-y-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4">
                  {upgradeError && <p className="text-xs text-red-600">{upgradeError}</p>}
                  <input
                    value={upgradeRegistrationNumber}
                    onChange={(e) => setUpgradeRegistrationNumber(e.target.value)}
                    placeholder={t("provider.onboarding.registrationNumberPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                  />
                  <input
                    value={upgradeHqAddress}
                    onChange={(e) => setUpgradeHqAddress(e.target.value)}
                    placeholder={t("provider.onboarding.hqAddressPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowUpgradeForm(false)} className="flex-1 py-2 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                      {t("common.cancel")}
                    </button>
                    <button
                      onClick={handleUpgrade}
                      disabled={isUpgrading || !upgradeRegistrationNumber.trim() || !upgradeHqAddress.trim()}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
                    >
                      {isUpgrading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {t("provider.account.upgradeConfirmButton")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          <button onClick={handleSave} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? t("provider.account.saving") : saved ? t("provider.account.saved") : t("provider.account.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  )
}
