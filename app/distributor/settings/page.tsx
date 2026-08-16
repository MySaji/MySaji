"use client"

import { useEffect, useState } from "react"
import {
  Bell, Lock, User, Shield, Eye, EyeOff, Globe,
  ChevronRight, Save, AlertCircle, CheckCircle2, Mail, Phone, MapPin, Loader2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getMyDistributorAccount, updateMyDistributorAccount, changeMyDistributorPassword,
  getDistributorNotificationPreferences, updateDistributorNotificationPreferences,
  type DistributorAccountData, type DistributorNotificationPreferences,
} from "@/lib/actions/distributor-account"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { Language } from "@/lib/i18n"
import type { CurrencyCode } from "@/lib/currency"
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card"

export default function DistributorSettingsPage() {
  const { t, language, setLanguage, currency, setCurrency } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("account")
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [account, setAccount] = useState<DistributorAccountData>(null)
  const [accountForm, setAccountForm] = useState({ companyName: "", businessLicense: "", phone: "", location: "", description: "" })
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [accountError, setAccountError] = useState("")

  const [notifPrefs, setNotifPrefs] = useState<DistributorNotificationPreferences | null>(null)
  const [isSavingNotifs, setIsSavingNotifs] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  useEffect(() => {
    Promise.all([getMyDistributorAccount(), getDistributorNotificationPreferences()]).then(([acc, prefs]) => {
      setAccount(acc)
      if (acc) {
        setAccountForm({
          companyName: acc.companyName, businessLicense: acc.businessLicense, phone: acc.phone ?? "",
          location: acc.location, description: acc.description,
        })
      }
      setNotifPrefs(prefs)
    }).finally(() => setIsLoading(false))
  }, [])

  const flashSuccess = () => {
    setShowSaveSuccess(true)
    setTimeout(() => setShowSaveSuccess(false), 3000)
  }

  const handleSaveAccount = async () => {
    setIsSavingAccount(true)
    setAccountError("")
    const result = await updateMyDistributorAccount(accountForm)
    setIsSavingAccount(false)
    if (!result.success) { setAccountError(result.error); return }
    flashSuccess()
  }

  const handleSaveNotifications = async () => {
    if (!notifPrefs) return
    setIsSavingNotifs(true)
    await updateDistributorNotificationPreferences(notifPrefs)
    setIsSavingNotifs(false)
    flashSuccess()
  }

  const languages = [
    { code: "en", name: "English", flag: "GB" },
    { code: "sw", name: "Kiswahili", flag: "KE" },
    { code: "fr", name: "Francais", flag: "FR" },
  ]

  const currencies = [
    { code: "KES", symbol: "KES", name: "Kenyan Shilling", region: "Kenya" },
    { code: "USD", symbol: "$", name: "US Dollar", region: "United States" },
    { code: "EUR", symbol: "E", name: "Euro", region: "Europe" },
    { code: "GBP", symbol: "P", name: "British Pound", region: "United Kingdom" },
  ]

  const handlePasswordChange = async () => {
    setPasswordError("")
    if (newPassword !== confirmPassword) { setPasswordError(t("distributor.settings.passwordMismatch")); return }
    setIsChangingPassword(true)
    const result = await changeMyDistributorPassword({ currentPassword, newPassword })
    setIsChangingPassword(false)
    if (!result.success) { setPasswordError(result.error); return }
    setShowPasswordDialog(false)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    flashSuccess()
  }

  const toggleNotifSetting = (key: keyof DistributorNotificationPreferences) => {
    setNotifPrefs((prev) => prev ? { ...prev, [key]: !prev[key] } : prev)
  }

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
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{t("settings.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t("distributor.settings.subtitle")}</p>
        </div>

        {showSaveSuccess && (
          <Card className="p-4 mb-6 border-0 shadow-lg bg-emerald-50 dark:bg-emerald-900/30 border-l-4 border-emerald-600">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-100">{t("distributor.settings.savedSuccessTitle")}</p>
                <p className="text-sm text-emerald-800 dark:text-emerald-200">{t("distributor.settings.savedSuccessBody")}</p>
              </div>
            </div>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <TabsTrigger value="account" className="gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">{t("distributor.settings.tabAccount")}</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">{t("settings.notifications")}</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">{t("distributor.settings.tabSecurity")}</span>
            </TabsTrigger>
            <TabsTrigger value="language" className="gap-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">{t("distributor.settings.languageAndRegion")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-6 mt-6">
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">{t("distributor.settings.companyInformation")}</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("distributor.settings.companyNameLabel")}</label>
                  <Input
                    value={accountForm.companyName}
                    onChange={(e) => setAccountForm({ ...accountForm, companyName: e.target.value })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("distributor.settings.businessRegistrationLabel")}</label>
                  <Input
                    value={accountForm.businessLicense}
                    onChange={(e) => setAccountForm({ ...accountForm, businessLicense: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("distributor.settings.companyDescriptionLabel")}</label>
                  <textarea
                    value={accountForm.description}
                    onChange={(e) => setAccountForm({ ...accountForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background resize-none h-20"
                  />
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("distributor.settings.contactInformation")}</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Mail className="w-5 h-5 text-teal-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">{t("distributor.settings.emailLabel")}</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">{account.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Phone className="w-5 h-5 text-teal-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">{t("distributor.settings.phoneLabel")}</p>
                        <Input
                          value={accountForm.phone}
                          onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })}
                          className="mt-1 bg-white dark:bg-gray-700"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <MapPin className="w-5 h-5 text-teal-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">{t("distributor.settings.companyHqLocationLabel")}</p>
                        <Input
                          value={accountForm.location}
                          onChange={(e) => setAccountForm({ ...accountForm, location: e.target.value })}
                          className="mt-1 bg-white dark:bg-gray-700"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {accountError && <p className="text-sm text-red-600 mt-4">{accountError}</p>}

              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Button onClick={handleSaveAccount} className="bg-teal-600 hover:bg-teal-700" disabled={isSavingAccount}>
                  {isSavingAccount ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {t("distributor.common.saveChanges")}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 mt-6">
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">{t("distributor.settings.notificationPreferences")}</h2>

              <div className="space-y-4">
                {([
                  { key: "emailNotifications", label: t("distributor.settings.notifEmailTitle"), description: t("distributor.settings.notifEmailDesc") },
                  { key: "smsNotifications", label: t("distributor.settings.notifSmsTitle"), description: t("distributor.settings.notifSmsDesc") },
                  { key: "orderNotifications", label: t("distributor.settings.notifOrderTitle"), description: t("distributor.settings.notifOrderDesc") },
                  { key: "reviewNotifications", label: t("distributor.settings.notifReviewTitle"), description: t("distributor.settings.notifReviewDesc") },
                  { key: "promotionalEmails", label: t("distributor.settings.notifPromoTitle"), description: t("distributor.settings.notifPromoDesc") },
                ] as { key: keyof DistributorNotificationPreferences; label: string; description: string }[]).map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <button
                      onClick={() => toggleNotifSetting(item.key)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                        notifPrefs[item.key] ? "bg-teal-600" : "bg-gray-300"
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
                <Button onClick={handleSaveNotifications} className="bg-teal-600 hover:bg-teal-700" disabled={isSavingNotifs}>
                  {isSavingNotifs ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {t("distributor.settings.savePreferences")}
                </Button>
              </div>
            </Card>

            <NotificationPreferencesCard />
          </TabsContent>

          <TabsContent value="security" className="space-y-6 mt-6">
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">{t("distributor.settings.securitySettings")}</h2>

              <div className="space-y-4">
                <Button
                  onClick={() => setShowPasswordDialog(true)}
                  className="w-full justify-between bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 h-auto py-4"
                >
                  <div className="flex items-center gap-3 text-left">
                    <Lock className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{t("distributor.settings.changePasswordTitle")}</p>
                      <p className="text-sm text-muted-foreground">{t("distributor.settings.changePasswordDesc")}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </Button>
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">{t("distributor.settings.securityRecommendationTitle")}</p>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">{t("distributor.settings.securityRecommendationBody")}</p>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="language" className="space-y-6 mt-6">
            <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">{t("distributor.settings.languageAndRegion")}</h2>
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t("settings.language")}</label>
                  <div className="space-y-1.5">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => setLanguage(lang.code as Language)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${language === lang.code ? "border-teal-600 bg-teal-50 dark:bg-teal-900/20" : "border-gray-200 dark:border-gray-700 hover:border-teal-300"}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-bold flex items-center justify-center text-gray-500 dark:text-gray-400">{lang.flag}</span>
                          <span className="font-medium text-sm text-gray-900 dark:text-white">{lang.name}</span>
                        </div>
                        {language === lang.code && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t("settings.currency")}</label>
                  <div className="space-y-1.5">
                    {currencies.map((curr) => (
                      <button
                        key={curr.code}
                        onClick={() => setCurrency(curr.code as CurrencyCode)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${currency === curr.code ? "border-teal-600 bg-teal-50 dark:bg-teal-900/20" : "border-gray-200 dark:border-gray-700 hover:border-teal-300"}`}
                      >
                        <div className="text-left">
                          <p className="font-medium text-sm text-gray-900 dark:text-white">{curr.symbol} {curr.code}</p>
                          <p className="text-[11px] text-muted-foreground">{curr.name}</p>
                        </div>
                        {currency === curr.code && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("distributor.settings.changePasswordTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t("distributor.settings.currentPasswordLabel")}</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("distributor.settings.currentPasswordPlaceholder")}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t("distributor.settings.newPasswordLabel")}</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("distributor.settings.newPasswordPlaceholder")} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t("distributor.settings.confirmPasswordLabel")}</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("distributor.settings.confirmPasswordPlaceholder")} />
            </div>

            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)} className="flex-1 bg-transparent" disabled={isChangingPassword}>{t("common.cancel")}</Button>
              <Button onClick={handlePasswordChange} className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={isChangingPassword}>
                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : t("distributor.settings.changePasswordButton")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
