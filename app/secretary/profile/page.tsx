"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Lock, Palette, Bell, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card"
import {
  getSecretaryAccount, updateSecretaryProfile, changeSecretaryPassword,
  getSecretaryNotificationPreferences, updateSecretaryNotificationPreferences,
  type SecretaryAccountData, type SecretaryNotificationPreferences,
} from "@/lib/actions/secretary-account"

export default function SecretaryProfilePage() {
  const { t, theme, setTheme } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "appearance" | "notifications">("profile")
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [saved, setSaved] = useState(false)

  const [account, setAccount] = useState<SecretaryAccountData>(null)
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" })
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [notifPrefs, setNotifPrefs] = useState<SecretaryNotificationPreferences | null>(null)
  const [isSavingNotifs, setIsSavingNotifs] = useState(false)

  useEffect(() => {
    Promise.all([getSecretaryAccount(), getSecretaryNotificationPreferences()]).then(([acc, prefs]) => {
      setAccount(acc)
      if (acc) setProfileForm({ name: acc.name, phone: acc.phone ?? "" })
      setNotifPrefs(prefs)
    }).finally(() => setIsLoading(false))
  }, [])

  const flashSaved = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleSaveProfile = async () => {
    setIsSavingProfile(true)
    const result = await updateSecretaryProfile(profileForm)
    setIsSavingProfile(false)
    if (!result.success) { alert(result.error); return }
    setAccount((prev) => prev ? { ...prev, name: profileForm.name, phone: profileForm.phone } : prev)
    flashSaved()
  }

  const handleChangePassword = async () => {
    setPasswordError("")
    setIsChangingPassword(true)
    const result = await changeSecretaryPassword({ currentPassword, newPassword })
    setIsChangingPassword(false)
    if (!result.success) { setPasswordError(result.error); return }
    setCurrentPassword("")
    setNewPassword("")
    flashSaved()
  }

  const handleSaveNotifications = async () => {
    if (!notifPrefs) return
    setIsSavingNotifs(true)
    await updateSecretaryNotificationPreferences(notifPrefs)
    setIsSavingNotifs(false)
    flashSaved()
  }

  if (isLoading || !account || !notifPrefs) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t("secretary.profile.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t("secretary.profile.subtitle")}</p>
        </div>

        <Card className="p-6 bg-white dark:bg-gray-800 border-0 rounded-xl shadow-sm mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {account.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{account.name}</h2>
              <p className="text-gray-600 dark:text-gray-400">{account.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{t("secretary.profile.roleLabel")}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 dark:border-gray-700 pb-4">
            {[
              { id: "profile" as const, icon: Settings, label: t("settings.profile") },
              { id: "security" as const, icon: Lock, label: t("secretary.profile.tabSecurity") },
              { id: "appearance" as const, icon: Palette, label: t("secretary.profile.tabAppearance") },
              { id: "notifications" as const, icon: Bell, label: t("settings.notifications") },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <tab.icon className="w-4 h-4 inline mr-2" />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "profile" && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("secretary.profile.fullNameLabel")}</label>
                  <Input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("auth.email")}</label>
                  <Input
                    type="email"
                    value={account.email}
                    className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 px-3 bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white cursor-not-allowed"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("secretary.profile.phoneLabel")}</label>
                  <Input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveProfile} disabled={isSavingProfile} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold h-10 rounded-lg">
                  {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : t("secretary.profile.saveChanges")}
                </Button>
                {saved && <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle2 size={16} />{t("secretary.profile.saved")}</span>}
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("secretary.profile.passwordResetTitle")}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("secretary.profile.currentPasswordLabel")}</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">{t("secretary.profile.newPasswordLabel")}</label>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
              <div className="flex items-center gap-3">
                <Button onClick={handleChangePassword} disabled={isChangingPassword || !currentPassword || !newPassword} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold h-10 rounded-lg">
                  {isChangingPassword ? <Loader2 size={16} className="animate-spin" /> : t("secretary.profile.updatePassword")}
                </Button>
                {saved && <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle2 size={16} />{t("secretary.profile.saved")}</span>}
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("secretary.profile.themePreferencesTitle")}</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <button onClick={() => setTheme("light")} className={`text-left p-4 rounded-lg border-2 transition-colors ${theme === "light" ? "border-blue-500" : "border-gray-200 dark:border-gray-600 hover:border-blue-400"}`}>
                    <p className="font-medium text-gray-900 dark:text-white">{t("settings.lightMode")}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{t("secretary.profile.lightModeDesc")}{theme === "light" ? ` ${t("secretary.profile.currentTag")}` : ""}</p>
                  </button>
                  <button onClick={() => setTheme("dark")} className={`text-left p-4 rounded-lg border-2 transition-colors ${theme === "dark" ? "border-blue-500" : "border-gray-200 dark:border-gray-600 hover:border-blue-400"}`}>
                    <p className="font-medium text-gray-900 dark:text-white">{t("settings.darkMode")}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{t("secretary.profile.darkModeDesc")}{theme === "dark" ? ` ${t("secretary.profile.currentTag")}` : ""}</p>
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3">{t("secretary.profile.appliesImmediately")}</p>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t("secretary.profile.platformNotificationsTitle")}</h3>
                <div className="space-y-3">
                  {([
                    { key: "email" as const, label: t("secretary.profile.notifEmail") },
                    { key: "sms" as const, label: t("secretary.profile.notifSms") },
                  ]).map((n) => (
                    <label key={n.key} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                      <input
                        type="checkbox"
                        checked={notifPrefs[n.key]}
                        onChange={() => setNotifPrefs({ ...notifPrefs, [n.key]: !notifPrefs[n.key] })}
                        className="w-5 h-5"
                      />
                      <span className="text-gray-700 dark:text-gray-300">{n.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveNotifications} disabled={isSavingNotifs} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold h-10 rounded-lg">
                  {isSavingNotifs ? <Loader2 size={16} className="animate-spin" /> : t("secretary.profile.savePreferences")}
                </Button>
                {saved && <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle2 size={16} />{t("secretary.profile.saved")}</span>}
              </div>

              <NotificationPreferencesCard />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
