"use client"

import { useEffect, useState } from "react"
import {
  Bell, Lock, User, Shield, Eye, EyeOff,
  ChevronRight, Save, AlertCircle, CheckCircle2, Mail, Phone, MapPin, Loader2, Clock, PlaneTakeoff, LocateFixed
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getMyShopAccount, updateMyShopAccount, changeMyShopPassword,
  getShopNotificationPreferences, updateShopNotificationPreferences, setShopVacationMode,
  type ShopkeeperAccountData, type ShopNotificationPreferences,
} from "@/lib/actions/shopkeeper-account"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { Language } from "@/lib/i18n"
import type { CurrencyCode } from "@/lib/currency"
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card"

export default function ShopkeeperSettingsPage() {
  const { t, language, setLanguage, currency, setCurrency } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("account")
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [account, setAccount] = useState<ShopkeeperAccountData>(null)
  const [accountForm, setAccountForm] = useState({ shopName: "", businessLicense: "", phone: "", location: "", shopDescription: "", shopCategory: "", openingTime: "", closingTime: "", deliveryFee: "500" })
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [accountError, setAccountError] = useState("")
  // Shop coordinates are captured from the device rather than geocoded from
  // the address text — there's no geocoding service configured — and they're
  // what lets customers see a real distance to this shop.
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [isLocating, setIsLocating] = useState(false)

  const [notifPrefs, setNotifPrefs] = useState<ShopNotificationPreferences | null>(null)
  const [isSavingNotifs, setIsSavingNotifs] = useState(false)

  const [vacationEnabled, setVacationEnabled] = useState(false)
  const [vacationNote, setVacationNote] = useState("")
  const [isSavingVacation, setIsSavingVacation] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  useEffect(() => {
    Promise.all([getMyShopAccount(), getShopNotificationPreferences()]).then(([acc, prefs]) => {
      setAccount(acc)
      if (acc) {
        setAccountForm({
          shopName: acc.shopName, businessLicense: acc.businessLicense, phone: acc.phone ?? "",
          location: acc.location, shopDescription: acc.shopDescription, shopCategory: acc.shopCategory,
          openingTime: acc.openingTime ?? "", closingTime: acc.closingTime ?? "",
          deliveryFee: String(acc.deliveryFee),
        })
        setVacationEnabled(acc.isOnVacation)
        setVacationNote(acc.vacationNote ?? "")
        if (acc.latitude != null && acc.longitude != null) {
          setCoords({ latitude: acc.latitude, longitude: acc.longitude })
        }
      }
      setNotifPrefs(prefs)
    }).finally(() => setIsLoading(false))
  }, [])

  const flashSuccess = () => {
    setShowSaveSuccess(true)
    setTimeout(() => setShowSaveSuccess(false), 3000)
  }

  const handleSaveAccount = async () => {
    const deliveryFee = Number(accountForm.deliveryFee)
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      setAccountError(t("shopkeeper.settings.deliveryFeeInvalid"))
      return
    }
    setIsSavingAccount(true)
    setAccountError("")
    const result = await updateMyShopAccount({ ...accountForm, deliveryFee, ...(coords ?? {}) })
    setIsSavingAccount(false)
    if (!result.success) { setAccountError(result.error); return }
    flashSuccess()
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setAccountError(t("shopkeeper.settings.geoUnsupported"))
      return
    }
    setIsLocating(true)
    setAccountError("")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => {
        setIsLocating(false)
        setAccountError(t("shopkeeper.settings.geoError"))
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleToggleVacation = async (next: boolean) => {
    setVacationEnabled(next)
    setIsSavingVacation(true)
    const result = await setShopVacationMode({ isOnVacation: next, vacationNote })
    setIsSavingVacation(false)
    if (!result.success) { setVacationEnabled(!next); return }
    flashSuccess()
  }

  const handleSaveVacationNote = async () => {
    setIsSavingVacation(true)
    const result = await setShopVacationMode({ isOnVacation: vacationEnabled, vacationNote })
    setIsSavingVacation(false)
    if (result.success) flashSuccess()
  }

  const handleSaveNotifications = async () => {
    if (!notifPrefs) return
    setIsSavingNotifs(true)
    await updateShopNotificationPreferences(notifPrefs)
    setIsSavingNotifs(false)
    flashSuccess()
  }

  const handlePasswordChange = async () => {
    setPasswordError("")
    if (newPassword !== confirmPassword) { setPasswordError(t("shopkeeper.settings.passwordsDoNotMatch")); return }
    setIsChangingPassword(true)
    const result = await changeMyShopPassword({ currentPassword, newPassword })
    setIsChangingPassword(false)
    if (!result.success) { setPasswordError(result.error); return }
    setShowPasswordDialog(false)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    flashSuccess()
  }

  const toggleNotifSetting = (key: keyof ShopNotificationPreferences) => {
    setNotifPrefs((prev) => prev ? { ...prev, [key]: !prev[key] } : prev)
  }

  const languages = [
    { code: "en", name: "English", flag: "GB" },
    { code: "sw", name: "Kiswahili", flag: "KE" },
    { code: "fr", name: "Francais", flag: "FR" },
  ]

  const currencies = [
    { code: "KES", symbol: "KES", name: "Kenyan Shilling" },
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "EUR", symbol: "€", name: "Euro" },
    { code: "GBP", symbol: "£", name: "British Pound" },
  ]

  if (isLoading || !account || !notifPrefs) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t("shopkeeper.settings.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t("shopkeeper.settings.subtitle")}</p>
        </div>

        {showSaveSuccess && (
          <Card className="p-4 mb-6 border-0 shadow-lg bg-emerald-50 dark:bg-emerald-900/30 border-l-4 border-emerald-600">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-100">{t("shopkeeper.settings.savedSuccess")}</p>
                <p className="text-xs text-emerald-800 dark:text-emerald-200">{t("shopkeeper.settings.savedSuccessHint")}</p>
              </div>
            </div>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <TabsTrigger value="account" className="gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">{t("shopkeeper.settings.tabAccount")}</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">{t("shopkeeper.settings.tabNotifications")}</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">{t("shopkeeper.settings.tabSecurity")}</span>
            </TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6 mt-6">
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-6">{t("shopkeeper.settings.shopInfoTitle")}</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("shopkeeper.settings.shopNameLabel")}</label>
                  <Input
                    value={accountForm.shopName}
                    onChange={(e) => setAccountForm({ ...accountForm, shopName: e.target.value })}
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("shopkeeper.settings.businessRegistrationLabel")}</label>
                    <Input
                      value={accountForm.businessLicense}
                      onChange={(e) => setAccountForm({ ...accountForm, businessLicense: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("shopkeeper.settings.businessCategoryLabel")}</label>
                    <Input
                      value={accountForm.shopCategory}
                      onChange={(e) => setAccountForm({ ...accountForm, shopCategory: e.target.value })}
                      placeholder={t("shopkeeper.settings.businessCategoryPlaceholder")}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("shopkeeper.settings.businessDescriptionLabel")}</label>
                  <textarea
                    value={accountForm.shopDescription}
                    onChange={(e) => setAccountForm({ ...accountForm, shopDescription: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background resize-none h-20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("shopkeeper.settings.deliveryFeeLabel")}</label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">KES</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={accountForm.deliveryFee}
                      onChange={(e) => setAccountForm({ ...accountForm, deliveryFee: e.target.value })}
                      className="pl-12"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">{t("shopkeeper.settings.deliveryFeeHint")}</p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{t("shopkeeper.settings.workingHoursTitle")}</h3>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">{t("shopkeeper.settings.opensAtLabel")}</label>
                        <Input
                          type="time"
                          value={accountForm.openingTime}
                          onChange={(e) => setAccountForm({ ...accountForm, openingTime: e.target.value })}
                          className="bg-white dark:bg-gray-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">{t("shopkeeper.settings.closesAtLabel")}</label>
                        <Input
                          type="time"
                          value={accountForm.closingTime}
                          onChange={(e) => setAccountForm({ ...accountForm, closingTime: e.target.value })}
                          className="bg-white dark:bg-gray-700"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">{t("shopkeeper.settings.workingHoursHint")}</p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{t("shopkeeper.settings.contactInfoTitle")}</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Mail className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">{t("shopkeeper.settings.emailLabel")}</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">{account.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Phone className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">{t("shopkeeper.settings.phoneLabel")}</p>
                        <Input
                          value={accountForm.phone}
                          onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })}
                          className="mt-1 bg-white dark:bg-gray-700"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <MapPin className="w-5 h-5 text-amber-600 flex-shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">{t("shopkeeper.settings.shopLocationLabel")}</p>
                        <Input
                          value={accountForm.location}
                          onChange={(e) => setAccountForm({ ...accountForm, location: e.target.value })}
                          className="mt-1 bg-white dark:bg-gray-700"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleUseCurrentLocation}
                            disabled={isLocating}
                            className="gap-1.5 bg-transparent"
                          >
                            {isLocating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                            {t("shopkeeper.settings.useCurrentLocation")}
                          </Button>
                          <p className="text-[11px] text-muted-foreground">
                            {coords
                              ? t("shopkeeper.settings.pinSet", {
                                  lat: coords.latitude.toFixed(5),
                                  lng: coords.longitude.toFixed(5),
                                })
                              : t("shopkeeper.settings.pinMissing")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {accountError && <p className="text-xs text-red-600 mt-4">{accountError}</p>}

              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Button onClick={handleSaveAccount} className="bg-amber-600 hover:bg-amber-700" disabled={isSavingAccount}>
                  {isSavingAccount ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {t("shopkeeper.settings.saveChanges")}
                </Button>
              </div>
            </Card>

            <Card className="p-6 border-0 shadow-lg">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg">
                    <PlaneTakeoff className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("shopkeeper.settings.vacationModeTitle")}</h2>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("shopkeeper.settings.vacationModeHint")}</p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={vacationEnabled}
                  aria-label={t("shopkeeper.settings.vacationModeTitle")}
                  onClick={() => handleToggleVacation(!vacationEnabled)}
                  disabled={isSavingVacation}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${vacationEnabled ? "bg-amber-600" : "bg-gray-300 dark:bg-gray-600"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${vacationEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {vacationEnabled && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <p>{t("shopkeeper.settings.vacationModeActiveWarning")}</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("shopkeeper.settings.vacationNoteLabel")}</label>
                    <Textarea
                      value={vacationNote}
                      onChange={(e) => setVacationNote(e.target.value)}
                      onBlur={handleSaveVacationNote}
                      placeholder={t("shopkeeper.settings.vacationNotePlaceholder")}
                      className="min-h-[70px] resize-none"
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-6">{t("shopkeeper.settings.languageAndRegionTitle")}</h2>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-2 block">{t("settings.language")}</label>
                  <div className="space-y-1.5">
                    {languages.map((lang) => (
                      <button key={lang.code} onClick={() => setLanguage(lang.code as Language)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${language === lang.code ? "border-amber-600 bg-amber-600/5" : "border-border hover:border-amber-600/40"}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-5 bg-muted rounded text-[10px] font-bold flex items-center justify-center text-muted-foreground">{lang.flag}</span>
                          <span className="font-medium text-xs text-foreground">{lang.name}</span>
                        </div>
                        {language === lang.code && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-2 block">{t("settings.currency")}</label>
                  <div className="space-y-1.5">
                    {currencies.map((curr) => (
                      <button key={curr.code} onClick={() => setCurrency(curr.code as CurrencyCode)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${currency === curr.code ? "border-amber-600 bg-amber-600/5" : "border-border hover:border-amber-600/40"}`}
                      >
                        <div className="text-left">
                          <p className="font-medium text-xs text-foreground">{curr.symbol} {curr.code}</p>
                          <p className="text-[10px] text-muted-foreground">{curr.name}</p>
                        </div>
                        {currency === curr.code && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6 mt-6">
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-6">{t("shopkeeper.settings.notificationPrefsTitle")}</h2>

              <div className="space-y-4">
                {([
                  { key: "emailNotifications", label: t("shopkeeper.settings.notifEmailTitle"), description: t("shopkeeper.settings.notifEmailDesc") },
                  { key: "smsNotifications", label: t("shopkeeper.settings.notifSmsTitle"), description: t("shopkeeper.settings.notifSmsDesc") },
                  { key: "orderNotifications", label: t("shopkeeper.settings.notifOrderTitle"), description: t("shopkeeper.settings.notifOrderDesc") },
                  { key: "reviewNotifications", label: t("shopkeeper.settings.notifReviewTitle"), description: t("shopkeeper.settings.notifReviewDesc") },
                  { key: "promotionalEmails", label: t("shopkeeper.settings.notifPromoTitle"), description: t("shopkeeper.settings.notifPromoDesc") },
                ] as { key: keyof ShopNotificationPreferences; label: string; description: string }[]).map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <button
                      onClick={() => toggleNotifSetting(item.key)}
                      role="switch"
                      aria-checked={notifPrefs[item.key]}
                      aria-label={item.label}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                        notifPrefs[item.key] ? "bg-amber-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          notifPrefs[item.key] ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Button onClick={handleSaveNotifications} className="bg-amber-600 hover:bg-amber-700" disabled={isSavingNotifs}>
                  {isSavingNotifs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {t("shopkeeper.settings.savePreferences")}
                </Button>
              </div>
            </Card>

            <NotificationPreferencesCard />
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6 mt-6">
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-6">{t("shopkeeper.settings.securitySettingsTitle")}</h2>

              <div className="space-y-4">
                <Button
                  onClick={() => setShowPasswordDialog(true)}
                  className="w-full justify-between bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 h-auto py-4"
                >
                  <div className="flex items-center gap-3 text-left">
                    <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{t("shopkeeper.settings.changePassword")}</p>
                      <p className="text-xs text-muted-foreground">{t("shopkeeper.settings.updatePasswordHint")}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </Button>
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">{t("shopkeeper.settings.securityRecommendationTitle")}</p>
                    <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">{t("shopkeeper.settings.securityRecommendationHint")}</p>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Password Change Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("shopkeeper.settings.changePassword")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-xs font-medium mb-2">{t("shopkeeper.settings.currentPasswordLabel")}</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("shopkeeper.settings.enterCurrentPasswordPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t("shopkeeper.settings.hidePassword") : t("shopkeeper.settings.showPassword")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-2">{t("shopkeeper.settings.newPasswordLabel")}</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("shopkeeper.settings.enterNewPasswordPlaceholder")} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-2">{t("shopkeeper.settings.confirmPasswordLabel")}</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("shopkeeper.settings.confirmNewPasswordPlaceholder")} />
            </div>

            {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)} className="flex-1 bg-transparent" disabled={isChangingPassword}>{t("common.cancel")}</Button>
              <Button onClick={handlePasswordChange} className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={isChangingPassword}>
                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.settings.changePassword")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
