"use client"

import { ArrowLeft, Lock, Eye, Shield, Trash2, Download, Bell, LogOut, ChevronRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useAuthContext } from "@/lib/auth-context"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { Language } from "@/lib/i18n"
import type { CurrencyCode } from "@/lib/currency"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  getNotificationPreferences, updateNotificationPreferences, changeMyPassword, deleteMyAccount,
  type NotificationPreferences,
} from "@/lib/actions/provider-account"
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card"

export default function SettingsPage() {
  const { t, language, setLanguage, currency, setCurrency, theme, setTheme } = useLocalization()
  const { logout } = useAuthContext()
  const [isLoading, setIsLoading] = useState(true)
  const [settings, setSettings] = useState<NotificationPreferences>({
    pushNotifications: true, emailAlerts: true, jobNotifications: true,
    soundEnabled: true, smsNotifications: false, marketingEmails: false,
  })
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" })
  const [passwordError, setPasswordError] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    getNotificationPreferences().then(setSettings).finally(() => setIsLoading(false))
  }, [])

  const toggleSetting = async (key: keyof NotificationPreferences) => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    await updateNotificationPreferences(next)
  }

  const handlePasswordChange = async () => {
    if (passwordData.new !== passwordData.confirm) {
      setPasswordError(t("provider.settings.passwordMismatchError"))
      return
    }
    if (passwordData.new.length < 8) {
      setPasswordError(t("provider.settings.passwordTooShortError"))
      return
    }
    setIsChangingPassword(true)
    const result = await changeMyPassword({ currentPassword: passwordData.current, newPassword: passwordData.new })
    setIsChangingPassword(false)
    if (!result.success) { setPasswordError(result.error); return }
    setShowChangePassword(false)
    setPasswordData({ current: "", new: "", confirm: "" })
    setPasswordError("")
  }

  const handleExportData = () => {
    alert(t("provider.settings.exportDataAlert"))
  }

  // logout() (see lib/auth-context.tsx) clears the session heartbeat before
  // signing out and only navigates once the sign-out actually completes —
  // calling next-auth's signOut() directly here skipped that heartbeat
  // clear and used its own separate redirect, inconsistent with (and
  // missing the same race-safety as) every other sign-out button in the app.
  const handleSignOut = () => {
    logout()
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return
    setIsDeleting(true)
    const result = await deleteMyAccount()
    if (result.success) {
      logout()
      return
    }
    setIsDeleting(false)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 pb-24 lg:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white p-4 shadow-lg">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Link href="/provider/profile" className="lg:hidden hover:bg-blue-500/50 p-2 rounded-lg transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{t("settings.title")}</h1>
            <p className="text-blue-100 text-xs">{t("provider.settings.subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl space-y-6 mt-6">

        {/* Appearance Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-2.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Eye className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("provider.settings.appearanceTitle")}</h2>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("provider.settings.themePreference")}</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark")}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
              >
                <option value="light">{t("settings.lightMode")}</option>
                <option value="dark">{t("settings.darkMode")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("settings.language")}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
              >
                <option value="en">English</option>
                <option value="sw">Swahili (Kiswahili)</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("settings.currency")}</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
              >
                <option value="KES">KES (Kenyan Shilling)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
                <option value="TZS">TZS (Tanzanian Shilling)</option>
                <option value="UGX">UGX (Ugandan Shilling)</option>
                <option value="ZAR">ZAR (South African Rand)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("settings.notifications")}</h2>
          </div>
          <div className="space-y-3">
            {[
              { key: "emailAlerts" as const, label: t("provider.settings.emailAlerts"), desc: t("provider.settings.emailAlertsDesc") },
              { key: "jobNotifications" as const, label: t("provider.settings.jobNotifications"), desc: t("provider.settings.jobNotificationsDesc") },
              { key: "smsNotifications" as const, label: t("provider.settings.smsNotifications"), desc: t("provider.settings.smsNotificationsDesc") },
              { key: "soundEnabled" as const, label: t("provider.settings.soundNotifications"), desc: t("provider.settings.soundNotificationsDesc") },
              { key: "marketingEmails" as const, label: t("provider.settings.marketingEmails"), desc: t("provider.settings.marketingEmailsDesc") },
            ].map((setting) => (
              <div key={setting.key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">{setting.label}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{setting.desc}</p>
                </div>
                <button
                  onClick={() => toggleSetting(setting.key)}
                  className={`flex-shrink-0 w-12 h-7 rounded-full transition-all ${settings[setting.key] ? "bg-blue-600 shadow-lg shadow-blue-600/30" : "bg-gray-300 dark:bg-gray-600"}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full transition-transform shadow-md ${settings[setting.key] ? "translate-x-5.5" : "translate-x-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <NotificationPreferencesCard />

        {/* Security Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-2.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Lock className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("provider.settings.securityTitle")}</h2>
          </div>
          <div className="space-y-4">
            <button
              onClick={() => setShowChangePassword(true)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors border border-gray-200 dark:border-gray-700"
            >
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-white">{t("provider.settings.changePassword")}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t("provider.settings.changePasswordDesc")}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Privacy Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("provider.settings.privacyDataTitle")}</h2>
          </div>
          <div className="space-y-3">
            <button
              onClick={handleExportData}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors border border-gray-200 dark:border-gray-700"
            >
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-white">{t("provider.settings.exportDataTitle")}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{t("provider.settings.exportDataDesc")}</p>
              </div>
              <Download className="w-5 h-5 text-gray-400" />
            </button>
            <button
              onClick={() => setShowDeleteAccount(true)}
              className="w-full flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors border border-red-200 dark:border-red-900/30"
            >
              <div className="text-left">
                <p className="font-medium text-red-700 dark:text-red-400">{t("provider.settings.deleteAccountTitle")}</p>
                <p className="text-[11px] text-red-600 dark:text-red-300 mt-1">{t("provider.settings.deleteAccountDesc")}</p>
              </div>
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </button>
          </div>
        </div>

        {/* Session Management */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <LogOut className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("provider.settings.sessionTitle")}</h2>
          </div>
          <Button onClick={() => setShowSignOutConfirm(true)} className="w-full bg-amber-600 hover:bg-amber-700">
            {t("provider.settings.signOut")}
          </Button>
        </div>

      </div>

      {/* Change Password Modal */}
      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("provider.settings.changePassword")}</DialogTitle>
            <DialogDescription>{t("provider.settings.changePasswordModalDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-2">{t("provider.settings.currentPasswordLabel")}</label>
              <input type="password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder={t("provider.settings.currentPasswordPlaceholder")} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-2">{t("provider.settings.newPasswordLabel")}</label>
              <input type="password" value={passwordData.new} onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder={t("provider.settings.newPasswordPlaceholder")} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-2">{t("provider.settings.confirmPasswordLabel")}</label>
              <input type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder={t("provider.settings.confirmPasswordPlaceholder")} />
            </div>
            {passwordError && <p className="text-red-600 text-xs">{passwordError}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowChangePassword(false)} className="flex-1" disabled={isChangingPassword}>{t("common.cancel")}</Button>
              <Button onClick={handlePasswordChange} className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isChangingPassword}>
                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.settings.changePassword")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Account Modal */}
      <Dialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">{t("provider.settings.deleteAccountTitle")}</DialogTitle>
            <DialogDescription>{t("provider.settings.deleteAccountModalDesc")}</DialogDescription>
          </DialogHeader>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg p-4 text-xs text-red-700 dark:text-red-400">
            {t("provider.settings.deleteAccountWarning")}
          </div>
          <div>
            <label className="block text-xs font-medium mb-2">{t("provider.settings.typeDeleteLabel")}</label>
            <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())} placeholder={t("provider.settings.typeDeletePlaceholder")} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowDeleteAccount(false); setDeleteConfirmText("") }} className="flex-1 bg-transparent" disabled={isDeleting}>{t("common.cancel")}</Button>
            <Button onClick={handleDeleteAccount} disabled={deleteConfirmText !== "DELETE" || isDeleting} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.settings.deletePermanently")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign Out Confirmation Modal */}
      <Dialog open={showSignOutConfirm} onOpenChange={setShowSignOutConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("provider.settings.signOutConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("provider.settings.signOutConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowSignOutConfirm(false)} className="flex-1 bg-transparent">{t("common.cancel")}</Button>
            <Button onClick={handleSignOut} className="flex-1 bg-amber-600 hover:bg-amber-700">{t("provider.settings.signOut")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
