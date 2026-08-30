"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, Shield, Moon, Loader2, CheckCircle2, CheckCircle, Globe } from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { Language } from "@/lib/i18n"
import type { CurrencyCode } from "@/lib/currency"
import {
  getSubAdminNotificationPreferences, updateSubAdminNotificationPreferences,
  changeSubAdminPassword,
  type SubAdminNotificationPreferences,
} from "@/lib/actions/sub-admin-account"
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card"

export default function SubAdminSettingsPage() {
  const { t, theme, setTheme, language, setLanguage, currency, setCurrency } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [notifications, setNotifications] = useState<SubAdminNotificationPreferences | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  useEffect(() => {
    getSubAdminNotificationPreferences().then(setNotifications).finally(() => setIsLoading(false))
  }, [])

  const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
    <button onClick={onChange} className={`w-10 h-5 rounded-full transition-colors flex items-center ${on?"bg-blue-600 justify-end":"bg-gray-300 dark:bg-gray-600 justify-start"}`}>
      <span className="w-4 h-4 bg-white rounded-full mx-0.5 shadow" />
    </button>
  )

  const handleSaveNotifications = async () => {
    if (!notifications) return
    setIsSaving(true)
    await updateSubAdminNotificationPreferences(notifications)
    setIsSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleChangePassword = async () => {
    setPasswordError("")
    setIsChangingPassword(true)
    const result = await changeSubAdminPassword({ currentPassword, newPassword })
    setIsChangingPassword(false)
    if (!result.success) { setPasswordError(result.error); return }
    setCurrentPassword("")
    setNewPassword("")
    setShowPasswordForm(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (isLoading || !notifications) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const languages = [
    { code: "en", name: "English" },
    { code: "sw", name: "Kiswahili" },
    { code: "fr", name: "Francais" },
  ]

  const currencies = [
    { code: "KES", symbol: "KES", name: "Kenyan Shilling" },
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "EUR", symbol: "E", name: "Euro" },
    { code: "GBP", symbol: "P", name: "British Pound" },
  ]

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("settings.title")}</h1>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t("subAdmin.settings.subtitle")}</p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-lg">
          <CheckCircle2 size={16} />{t("subAdmin.settings.changesSaved")}
        </div>
      )}

      <Card className="p-4 border-0 shadow-sm space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <Globe className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900 dark:text-white">{t("subAdmin.settings.languageAndRegionTitle")}</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-2 block">{t("settings.language")}</label>
            <div className="space-y-1.5">
              {languages.map((lang) => (
                <button key={lang.code} onClick={() => setLanguage(lang.code as Language)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border-2 transition-all ${language === lang.code ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10" : "border-gray-200 dark:border-gray-600 hover:border-blue-400"}`}
                >
                  <span className="font-medium text-xs text-gray-900 dark:text-white">{lang.name}</span>
                  {language === lang.code && <CheckCircle className="w-4 h-4 text-blue-600" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-2 block">{t("settings.currency")}</label>
            <div className="space-y-1.5">
              {currencies.map((curr) => (
                <button key={curr.code} onClick={() => setCurrency(curr.code as CurrencyCode)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border-2 transition-all ${currency === curr.code ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10" : "border-gray-200 dark:border-gray-600 hover:border-blue-400"}`}
                >
                  <div className="text-left">
                    <p className="font-medium text-xs text-gray-900 dark:text-white">{curr.symbol} {curr.code}</p>
                    <p className="text-[10px] text-gray-500">{curr.name}</p>
                  </div>
                  {currency === curr.code && <CheckCircle className="w-4 h-4 text-blue-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 border-0 shadow-sm space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <Bell className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900 dark:text-white">{t("settings.notifications")}</h2>
        </div>
        {[
          { key: "email" as const, label: t("subAdmin.settings.notifEmailLabel"), desc: t("subAdmin.settings.notifEmailDesc") },
          { key: "sms" as const, label: t("subAdmin.settings.notifSmsLabel"), desc: t("subAdmin.settings.notifSmsDesc") },
        ].map(n => (
          <div key={n.key} className="flex items-center justify-between py-1">
            <div><p className="text-xs font-medium text-gray-900 dark:text-white">{n.label}</p><p className="text-[11px] text-gray-500">{n.desc}</p></div>
            <Toggle on={notifications[n.key]} onChange={()=>setNotifications({...notifications, [n.key]: !notifications[n.key]})} />
          </div>
        ))}
        <Button size="sm" onClick={handleSaveNotifications} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : t("common.save")}
        </Button>
      </Card>

      <NotificationPreferencesCard />

      <Card className="p-4 border-0 shadow-sm space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <Moon className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900 dark:text-white">{t("subAdmin.settings.appearanceTitle")}</h2>
        </div>
        <div className="flex gap-2">
          {(["light","dark"] as const).map(opt => (
            <button key={opt} onClick={()=>setTheme(opt)} className={`px-4 py-2 rounded-lg text-xs font-medium ${theme===opt?"bg-blue-600 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}>{opt === "light" ? t("settings.lightMode") : t("settings.darkMode")}</button>
          ))}
        </div>
      </Card>

      <Card className="p-4 border-0 shadow-sm space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <Shield className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900 dark:text-white">{t("subAdmin.settings.securityTitle")}</h2>
        </div>
        <div className="flex items-center justify-between">
          <div><p className="text-xs font-medium text-gray-900 dark:text-white">{t("subAdmin.settings.changePasswordLabel")}</p><p className="text-[11px] text-gray-500">{t("subAdmin.settings.changePasswordDesc")}</p></div>
          <Button size="sm" variant="outline" className="bg-transparent text-[11px]" onClick={() => setShowPasswordForm(!showPasswordForm)}>
            {showPasswordForm ? t("common.cancel") : t("subAdmin.settings.updateButton")}
          </Button>
        </div>
        {showPasswordForm && (
          <div className="space-y-2 pt-2">
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t("subAdmin.settings.currentPasswordPlaceholder")} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-white" />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("subAdmin.settings.newPasswordPlaceholder")} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-white" />
            {passwordError && <p className="text-[11px] text-red-600">{passwordError}</p>}
            <Button size="sm" onClick={handleChangePassword} disabled={isChangingPassword || !currentPassword || !newPassword} className="bg-blue-600 hover:bg-blue-700 w-full">
              {isChangingPassword ? <Loader2 size={14} className="animate-spin" /> : t("subAdmin.settings.confirmChangeButton")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
