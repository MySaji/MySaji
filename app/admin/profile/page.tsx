"use client"

import { useEffect, useState } from "react"
import { User, Lock, Palette, Bell, Eye, EyeOff, Save, CheckCircle2, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getAdminAccount, updateAdminProfile, changeAdminPassword,
  getAdminNotificationPreferences, updateAdminNotificationPreferences,
  type AdminAccountData, type AdminNotificationPreferences,
} from "@/lib/actions/admin-account"

export default function AdminProfilePage() {
  const { t, theme, setTheme } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("profile")
  const [showPassword, setShowPassword] = useState(false)
  const [saved, setSaved] = useState(false)

  const [account, setAccount] = useState<AdminAccountData>(null)
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" })
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [notifPrefs, setNotifPrefs] = useState<AdminNotificationPreferences | null>(null)
  const [isSavingNotifs, setIsSavingNotifs] = useState(false)

  useEffect(() => {
    Promise.all([getAdminAccount(), getAdminNotificationPreferences()]).then(([acc, prefs]) => {
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
    const result = await updateAdminProfile(profileForm)
    setIsSavingProfile(false)
    if (!result.success) { alert(result.error); return }
    setAccount((prev) => prev ? { ...prev, name: profileForm.name, phone: profileForm.phone } : prev)
    flashSaved()
  }

  const handleChangePassword = async () => {
    setPasswordError("")
    if (newPassword !== confirmPassword) { setPasswordError(t("admin.profile.passwordsDoNotMatch")); return }
    setIsChangingPassword(true)
    const result = await changeAdminPassword({ currentPassword, newPassword })
    setIsChangingPassword(false)
    if (!result.success) { setPasswordError(result.error); return }
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    flashSaved()
  }

  const handleSaveNotifications = async () => {
    if (!notifPrefs) return
    setIsSavingNotifs(true)
    await updateAdminNotificationPreferences(notifPrefs)
    setIsSavingNotifs(false)
    flashSaved()
  }

  const toggleNotif = (key: keyof AdminNotificationPreferences) => {
    setNotifPrefs((prev) => prev ? { ...prev, [key]: !prev[key] } : prev)
  }

  const tabs = [
    { id: "profile", label: t("settings.profile"), icon: User },
    { id: "security", label: t("admin.profile.tabSecurity"), icon: Lock },
    { id: "appearance", label: t("admin.profile.tabAppearance"), icon: Palette },
    { id: "notifications", label: t("settings.notifications"), icon: Bell },
  ]

  if (isLoading || !account || !notifPrefs) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("settings.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">{t("admin.profile.subtitle")}</p>
      </div>

      <Card className="border-0 shadow-lg p-6 md:p-8">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {account.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{account.name}</h2>
              <CheckCircle2 size={20} className="text-emerald-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">{account.email}</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">{t("admin.profile.administrator")}</p>
          </div>
        </div>
      </Card>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap font-medium text-sm ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        {activeTab === "profile" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("admin.profile.personalInformation")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("admin.profile.fullName")}</label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("admin.profile.emailAddress")}</label>
                  <input
                    type="email"
                    value={account.email}
                    disabled
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 dark:text-gray-400 text-gray-600 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t("admin.profile.cannotBeChanged")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("admin.profile.phoneNumber")}</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 items-center">
              <Button onClick={handleSaveProfile} disabled={isSavingProfile} className="bg-blue-600 hover:bg-blue-700 gap-2">
                {isSavingProfile ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {t("admin.profile.saveChanges")}
              </Button>
              {saved && (
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <CheckCircle2 size={18} />
                  {t("admin.profile.savedSuccessfully")}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("admin.profile.changePassword")}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t("admin.profile.changePasswordDesc")}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("admin.profile.currentPassword")}</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("admin.profile.newPassword")}</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("admin.profile.confirmPassword")}</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}

                <Button onClick={handleChangePassword} disabled={isChangingPassword || !currentPassword || !newPassword} className="bg-blue-600 hover:bg-blue-700">
                  {isChangingPassword ? <Loader2 size={16} className="animate-spin" /> : t("admin.profile.updatePassword")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "appearance" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("admin.profile.themePreference")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: "light" as const, label: t("admin.profile.themeLight"), icon: "☀️", desc: t("admin.profile.themeLightDesc") },
                  { id: "dark" as const, label: t("admin.profile.themeDark"), icon: "🌙", desc: t("admin.profile.themeDarkDesc") },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setTheme(mode.id)}
                    className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-3 ${
                      theme === mode.id
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                    }`}
                  >
                    <span className="text-2xl">{mode.icon}</span>
                    <div className="text-center">
                      <p className="font-medium text-gray-900 dark:text-white">{mode.label}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{mode.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">{t("admin.profile.appliesImmediately")}</p>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("admin.profile.communicationPreferences")}</h3>
              <div className="space-y-3">
                {([
                  { id: "jobEmail", label: t("admin.profile.emailNotifJobActivities") },
                  { id: "jobPush", label: t("admin.profile.pushNotifJobActivities") },
                ] as { id: keyof AdminNotificationPreferences; label: string }[]).map((item) => (
                  <label key={item.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={notifPrefs[item.id]}
                      onChange={() => toggleNotif(item.id)}
                      className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("admin.profile.jobEvents")}</h3>
              <div className="space-y-3">
                {([
                  { id: "newJobs", label: t("admin.profile.newJobSubmissions"), desc: t("admin.profile.newJobSubmissionsDesc") },
                  { id: "disputes", label: t("admin.profile.disputeNotifications"), desc: t("admin.profile.disputeNotificationsDesc") },
                  { id: "completedJobs", label: t("admin.profile.completedJobsNotif"), desc: t("admin.profile.completedJobsNotifDesc") },
                ] as { id: keyof AdminNotificationPreferences; label: string; desc: string }[]).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={notifPrefs[item.id]}
                      onChange={() => toggleNotif(item.id)}
                      className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-gray-900 dark:text-white font-medium">{item.label}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("admin.profile.paymentEvents")}</h3>
              <div className="space-y-3">
                {([
                  { id: "paymentEmail", label: t("admin.profile.emailNotifPayments") },
                  { id: "paymentPush", label: t("admin.profile.pushNotifPayments") },
                  { id: "paymentsReleased", label: t("admin.profile.paymentsReleased"), desc: t("admin.profile.paymentsReleasedDesc") },
                  { id: "deposits", label: t("admin.profile.depositNotifications"), desc: t("admin.profile.depositNotificationsDesc") },
                  { id: "refunds", label: t("admin.profile.refundNotifications"), desc: t("admin.profile.refundNotificationsDesc") },
                ] as { id: keyof AdminNotificationPreferences; label: string; desc?: string }[]).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={notifPrefs[item.id]}
                      onChange={() => toggleNotif(item.id)}
                      className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-gray-900 dark:text-white font-medium">{item.label}</p>
                      {item.desc && <p className="text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleSaveNotifications} disabled={isSavingNotifs} className="bg-blue-600 hover:bg-blue-700 gap-2">
                {isSavingNotifs ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {t("admin.profile.saveNotificationSettings")}
              </Button>
              {saved && (
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <CheckCircle2 size={18} />
                  {t("admin.profile.savedSuccessfully")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
