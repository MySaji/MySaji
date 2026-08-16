"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { useAuthContext } from "@/lib/auth-context"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  Sun, Moon, Bell, Shield, CreditCard, HelpCircle, LogOut,
  ChevronRight, User, Lock, Eye, EyeOff, Smartphone, Globe,
  FileText, Trash2, Download, CheckCircle, MessageCircle, Settings,
  AlertTriangle, Loader2, Database, Clock, FileArchive, X
} from "lucide-react"
import Image from "next/image"
import type { Language } from "@/lib/i18n"
import type { CurrencyCode } from "@/lib/currency"
import { getCustomerProfile, updateCustomerProfile, updateProfileAvatar, type CustomerProfileData } from "@/lib/actions/profile"
import {
  getNotificationPreferences, updateNotificationPreferences, changePassword,
  getBillingHistory, exportCustomerData, deleteMyAccount,
  type NotificationPreferences, type BillingHistoryItem,
} from "@/lib/actions/settings"
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from "@/lib/actions/push"
import { getWalletSummary, removePaymentMethod, type WalletSummary } from "@/lib/actions/wallet"

export function CustomerSettingsPage() {
  const router = useRouter()
  const { t, formatMoney, language, setLanguage, currency, setCurrency, theme, setTheme } = useLocalization()
  const { logout, refreshSession } = useAuthContext()
  const [activeSection, setActiveSection] = useState("account")
  const [showPassword, setShowPassword] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [profile, setProfile] = useState<CustomerProfileData>(null)
  const [profileForm, setProfileForm] = useState({ name: "", phone: "", location: "" })
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  const [notificationSettings, setNotificationSettings] = useState<NotificationPreferences>({
    jobUpdates: true, messages: true, payments: true, promotions: false, emailDigest: true, pushNotifications: true,
  })
  const [pushError, setPushError] = useState("")

  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" })
  const [passwordError, setPasswordError] = useState("")
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [wallet, setWallet] = useState<WalletSummary>(null)
  const [billing, setBilling] = useState<BillingHistoryItem[]>([])

  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Privacy / Download / Delete state
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadReady, setDownloadReady] = useState(false)
  const [exportedData, setExportedData] = useState<Record<string, unknown> | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState(1)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleteReason, setDeleteReason] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    Promise.all([getCustomerProfile(), getNotificationPreferences(), getWalletSummary(), getBillingHistory()])
      .then(([profileData, prefs, walletData, billingData]) => {
        setProfile(profileData)
        if (profileData) setProfileForm({ name: profileData.name, phone: profileData.phone ?? "", location: profileData.location })
        setNotificationSettings(prefs)
        setWallet(walletData)
        setBilling(billingData)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleSaveProfile = async () => {
    setIsSavingProfile(true)
    const result = await updateCustomerProfile(profileForm)
    setIsSavingProfile(false)
    if (result.success) {
      await refreshSession()
      setProfile(await getCustomerProfile())
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string
      const result = await updateProfileAvatar({ imageDataUrl: dataUrl })
      if (result.success) {
        await refreshSession()
        setProfile(await getCustomerProfile())
      }
    }
    reader.readAsDataURL(file)
  }

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
    const rawData = window.atob(base64)
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
  }

  /** Real browser push subscription — registers the actual service worker,
   * requests real OS notification permission, and subscribes via the
   * standard Push API. No-ops with an honest error if VAPID isn't
   * configured or the browser/permission doesn't support it. */
  const enableBrowserPush = async (): Promise<{ success: true } | { success: false; error: string }> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { success: false, error: t("customer.settings.pushNotSupported") }
    }
    const publicKey = await getVapidPublicKey()
    if (!publicKey) {
      return { success: false, error: t("customer.settings.pushNotConfigured") }
    }

    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      return { success: false, error: t("customer.settings.pushPermissionDenied") }
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { success: false, error: t("customer.settings.pushSubscriptionFailed") }
      }
      await savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } })
      return { success: true }
    } catch {
      return { success: false, error: t("customer.settings.pushEnableFailed") }
    }
  }

  const disableBrowserPush = async () => {
    if (!("serviceWorker" in navigator)) return
    const registration = await navigator.serviceWorker.getRegistration("/sw.js")
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await removePushSubscription({ endpoint: subscription.endpoint })
      await subscription.unsubscribe()
    }
  }

  const handleToggleNotification = async (key: keyof NotificationPreferences) => {
    const turningOn = !notificationSettings[key]

    if (key === "pushNotifications") {
      setPushError("")
      if (turningOn) {
        const result = await enableBrowserPush()
        if (!result.success) {
          setPushError(result.error)
          return
        }
      } else {
        await disableBrowserPush()
      }
    }

    const next = { ...notificationSettings, [key]: turningOn }
    setNotificationSettings(next)
    await updateNotificationPreferences(next)
  }

  const handleChangePassword = async () => {
    setPasswordError("")
    setPasswordSuccess(false)
    if (passwordForm.next !== passwordForm.confirm) { setPasswordError(t("customer.settings.passwordsDoNotMatch")); return }
    setIsChangingPassword(true)
    const result = await changePassword({ currentPassword: passwordForm.current, newPassword: passwordForm.next })
    setIsChangingPassword(false)
    if (!result.success) { setPasswordError(result.error); return }
    setPasswordForm({ current: "", next: "", confirm: "" })
    setPasswordSuccess(true)
    setTimeout(() => setPasswordSuccess(false), 3000)
  }

  const handleRemovePaymentMethod = async (id: string) => {
    setWallet((prev) => prev ? { ...prev, paymentMethods: prev.paymentMethods.filter((m) => m.id !== id) } : prev)
    await removePaymentMethod({ id })
  }

  const handleDownloadData = () => {
    setIsDownloading(true)
    setDownloadProgress(0)
    setDownloadReady(false)
    exportCustomerData().then((data) => setExportedData(data))
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) { clearInterval(interval); setIsDownloading(false); setDownloadReady(true); return 100 }
        return prev + Math.random() * 15
      })
    }, 400)
  }

  const handleTriggerDownload = () => {
    if (!exportedData) return
    const blob = new Blob([JSON.stringify(exportedData, null, 2)], { type: "application/json" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `saji-data-export-${new Date().toISOString().split("T")[0]}.json`
    link.click()
    setShowDownloadModal(false)
    setDownloadReady(false)
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    const result = await deleteMyAccount({ reason: deleteReason })
    if (result.success) {
      setTimeout(() => { setIsDeleting(false); setShowDeleteModal(false); logout(); router.push("/") }, 1500)
    } else {
      setIsDeleting(false)
    }
  }

  const settingsSections = [
    { id: "account", label: t("customer.settings.sectionAccount"), icon: User },
    { id: "security", label: t("customer.settings.sectionSecurity"), icon: Shield },
    { id: "appearance", label: t("customer.settings.sectionAppearance"), icon: Sun },
    { id: "notifications", label: t("settings.notifications"), icon: Bell },
    { id: "payment", label: t("customer.settings.sectionPayment"), icon: CreditCard },
    { id: "privacy", label: t("customer.settings.sectionPrivacy"), icon: Lock },
    { id: "help", label: t("customer.help.title"), icon: HelpCircle },
  ]

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

  const themes = [
    { id: "light", name: t("customer.settings.themeLight"), icon: Sun, desc: t("customer.settings.themeLightDesc") },
    { id: "dark", name: t("customer.settings.themeDark"), icon: Moon, desc: t("customer.settings.themeDarkDesc") },
  ]

  const notificationLabels: Record<string, { title: string; desc: string }> = {
    jobUpdates: { title: t("customer.settings.notifJobUpdates"), desc: t("customer.settings.notifJobUpdatesDesc") },
    messages: { title: t("customer.settings.notifMessages"), desc: t("customer.settings.notifMessagesDesc") },
    payments: { title: t("customer.settings.notifPayments"), desc: t("customer.settings.notifPaymentsDesc") },
    promotions: { title: t("customer.settings.notifPromotions"), desc: t("customer.settings.notifPromotionsDesc") },
    emailDigest: { title: t("customer.settings.notifEmailDigest"), desc: t("customer.settings.notifEmailDigestDesc") },
    pushNotifications: { title: t("customer.settings.notifPushNotifications"), desc: t("customer.settings.notifPushNotificationsDesc") },
  }

  const handleLogout = () => { logout(); router.push("/") }

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">{t("settings.title")}</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-56 flex-shrink-0">
            <Card className="border-0 shadow-sm overflow-hidden sticky top-20">
              <nav className="p-1.5">
                {settingsSections.map((section) => {
                  const Icon = section.icon
                  return (
                    <button key={section.id} onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        activeSection === section.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {section.label}
                    </button>
                  )
                })}
                <hr className="my-2 border-border/50 mx-3" />
                <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                  <LogOut className="w-4 h-4" /> {t("auth.logout")}
                </button>
              </nav>
            </Card>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-4">
            {/* Account */}
            {activeSection === "account" && (
              <>
                <Card className="p-5 border-0 shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("customer.settings.profileInformation")}</h3>
                  <div className="flex flex-col sm:flex-row items-start gap-5">
                    <div className="relative">
                      <div className="relative w-20 h-20 rounded-2xl bg-muted overflow-hidden">
                        <Image src={profile.avatar || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop"} alt="Profile" fill className="object-cover" />
                      </div>
                      <button onClick={() => avatarInputRef.current?.click()} aria-label={t("customer.settings.changePhoto")} className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-primary-foreground rounded-lg flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm">
                        <User className="w-3.5 h-3.5" />
                      </button>
                      <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                    </div>
                    <div className="flex-1 space-y-3 w-full">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("customer.profile.fullName")}</label><Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="rounded-xl" /></div>
                        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("auth.email")}</label><Input value={profile.email} disabled className="rounded-xl opacity-60" /></div>
                        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("customer.profile.phone")}</label><Input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="rounded-xl" /></div>
                        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("customer.settings.locationLabel")}</label><Input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} className="rounded-xl" /></div>
                      </div>
                      <Button className="rounded-xl" size="sm" onClick={handleSaveProfile} disabled={isSavingProfile}>
                        {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : profileSaved ? t("customer.settings.savedExclaim") : t("customer.profile.saveChanges")}
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="p-5 border-0 shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("customer.settings.languageAndRegion")}</h3>
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">{t("settings.language")}</label>
                      <div className="space-y-1.5">
                        {languages.map((lang) => (
                          <button key={lang.code} onClick={() => setLanguage(lang.code as Language)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${language === lang.code ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-7 h-5 bg-muted rounded text-[10px] font-bold flex items-center justify-center text-muted-foreground">{lang.flag}</span>
                              <span className="font-medium text-sm text-foreground">{lang.name}</span>
                            </div>
                            {language === lang.code && <CheckCircle className="w-4 h-4 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">{t("settings.currency")}</label>
                      <div className="space-y-1.5">
                        {currencies.map((curr) => (
                          <button key={curr.code} onClick={() => setCurrency(curr.code as CurrencyCode)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${currency === curr.code ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                          >
                            <div className="text-left">
                              <p className="font-medium text-sm text-foreground">{curr.symbol} {curr.code}</p>
                              <p className="text-[11px] text-muted-foreground">{curr.name}</p>
                            </div>
                            {currency === curr.code && <CheckCircle className="w-4 h-4 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* Security */}
            {activeSection === "security" && (
              <>
                <Card className="p-5 border-0 shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("customer.settings.changePassword")}</h3>
                  <div className="space-y-3 max-w-md">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("customer.settings.currentPassword")}</label>
                      <div className="relative">
                        <Input type={showPassword ? "text" : "password"} placeholder={t("customer.settings.enterCurrentPassword")} value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} className="rounded-xl pr-10" />
                        <button onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t("common.hidePassword") : t("common.showPassword")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("customer.settings.newPassword")}</label><Input type="password" placeholder={t("customer.settings.enterNewPassword")} value={passwordForm.next} onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })} className="rounded-xl" /></div>
                    <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("customer.settings.confirmNewPassword")}</label><Input type="password" placeholder={t("customer.settings.confirmNewPasswordPlaceholder")} value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} className="rounded-xl" /></div>
                    {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
                    {passwordSuccess && <p className="text-xs text-emerald-600">{t("customer.settings.passwordUpdatedSuccess")}</p>}
                    <Button className="rounded-xl" size="sm" onClick={handleChangePassword} disabled={isChangingPassword || !passwordForm.current || !passwordForm.next}>
                      {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.settings.updatePassword")}
                    </Button>
                  </div>
                </Card>

                <Card className="p-5 border-0 shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("customer.settings.twoFactorAuth")}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center"><Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /></div>
                      <div><p className="font-medium text-sm text-foreground">{t("customer.settings.smsAuthentication")}</p><p className="text-xs text-muted-foreground">{t("customer.settings.comingSoon")}</p></div>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-xl bg-transparent" disabled>{t("customer.settings.enableButton")}</Button>
                  </div>
                </Card>

                <Card className="p-5 border-0 shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("customer.settings.activeSessions")}</h3>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <div><p className="font-medium text-sm text-foreground">{t("customer.settings.thisDevice")}</p><p className="text-[11px] text-muted-foreground">{t("customer.settings.currentSession")}</p></div>
                    </div>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">{t("customer.settings.activeStatus")}</span>
                  </div>
                </Card>
              </>
            )}

            {/* Appearance */}
            {activeSection === "appearance" && (
              <Card className="p-5 border-0 shadow-sm">
                <h3 className="font-semibold text-foreground mb-4">{t("settings.theme")}</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {themes.map((themeOption) => {
                    const Icon = themeOption.icon
                    return (
                      <button key={themeOption.id} onClick={() => setTheme(themeOption.id as "light" | "dark")}
                        className={`p-5 rounded-xl border-2 transition-all text-left ${theme === themeOption.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      >
                        <Icon className={`w-8 h-8 mb-3 ${theme === themeOption.id ? "text-primary" : "text-muted-foreground"}`} />
                        <p className="font-semibold text-foreground">{themeOption.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{themeOption.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* Notifications */}
            {activeSection === "notifications" && (
              <Card className="p-5 border-0 shadow-sm">
                <h3 className="font-semibold text-foreground mb-4">{t("customer.settings.notificationPreferences")}</h3>
                {pushError && (
                  <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-400">
                    {pushError}
                  </div>
                )}
                <div className="space-y-2">
                  {(Object.keys(notificationSettings) as (keyof NotificationPreferences)[]).map((key) => {
                    const value = notificationSettings[key]
                    const labels = notificationLabels[key] ?? { title: key.replace(/([A-Z])/g, " $1"), desc: key.replace(/([A-Z])/g, " $1").toLowerCase() }
                    return (
                      <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
                        <div>
                          <p className="font-medium text-sm text-foreground capitalize">{labels.title}</p>
                          <p className="text-[11px] text-muted-foreground">{t("customer.settings.getNotifiedAbout", { topic: labels.desc })}</p>
                        </div>
                        <button onClick={() => handleToggleNotification(key)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* Payment */}
            {activeSection === "payment" && (
              <>
                <Card className="p-5 border-0 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">{t("customer.settings.paymentMethods")}</h3>
                    <Button size="sm" className="rounded-xl" onClick={() => router.push("/customer/wallet")}>{t("customer.savedAddresses.addNew")}</Button>
                  </div>
                  <div className="space-y-2">
                    {(!wallet || wallet.paymentMethods.length === 0) && (
                      <p className="text-sm text-muted-foreground p-2">{t("customer.wallet.noPaymentMethods")}</p>
                    )}
                    {wallet?.paymentMethods.map((method) => (
                      <div key={method.id} className="flex items-center justify-between p-3.5 bg-muted/50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-7 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-[9px] uppercase">{method.type}</div>
                          <div><p className="font-medium text-sm text-foreground">{method.name}</p><p className="text-[11px] text-muted-foreground">{method.number}</p></div>
                        </div>
                        {method.isDefault ? (
                          <span className="text-[11px] bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md font-semibold">{t("customer.savedAddresses.default")}</span>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleRemovePaymentMethod(method.id)}>{t("customer.settings.removeButton")}</Button>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 border-0 shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("customer.settings.billingHistory")}</h3>
                  <div className="space-y-2">
                    {billing.length === 0 && <p className="text-sm text-muted-foreground p-2">{t("customer.settings.noBillingHistory")}</p>}
                    {billing.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border/50">
                        <div><p className="font-medium text-sm text-foreground">{item.description}</p><p className="text-[11px] text-muted-foreground">{new Date(item.date).toLocaleDateString()}</p></div>
                        <div className="text-right"><p className="font-semibold text-sm text-foreground">{formatMoney(item.amount)}</p><span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium capitalize">{item.status.toLowerCase()}</span></div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {/* Privacy */}
            {activeSection === "privacy" && (
              <>
                <Card className="p-5 border-0 shadow-sm">
                  <h3 className="font-semibold text-foreground mb-1">{t("customer.settings.dataAndPrivacy")}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{t("customer.settings.manageDataAndAccount")}</p>

                  {/* Download Your Data */}
                  <div className="p-4 rounded-xl border border-border/50 mb-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-foreground">{t("customer.settings.downloadYourData")}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{t("customer.settings.downloadYourDataDesc")}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="rounded-xl bg-transparent flex-shrink-0" onClick={() => setShowDownloadModal(true)}>
                        {t("customer.settings.requestButton")}
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{t("customer.settings.dataExportHint")}</span>
                    </div>
                  </div>

                  {/* Data Included Info */}
                  <div className="p-4 rounded-xl bg-muted/30 mb-3">
                    <p className="text-xs font-medium text-foreground mb-2">{t("customer.settings.exportWillInclude")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: t("customer.settings.exportProfileInfo"), icon: User },
                        { label: t("customer.settings.exportBookingHistory"), icon: FileText },
                        { label: t("customer.orders.title"), icon: MessageCircle },
                        { label: t("customer.settings.exportWalletTransactions"), icon: CreditCard },
                        { label: t("customer.settings.exportReviewsGiven"), icon: CheckCircle },
                        { label: t("customer.layout.notifications"), icon: Database },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Icon className="w-3.5 h-3.5" />
                            <span>{item.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Card>

                {/* Delete Account */}
                <Card className="p-5 border-0 shadow-sm border-red-200/50 dark:border-red-900/20">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-red-600 dark:text-red-400">{t("customer.settings.deleteAccountPermanently")}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("customer.settings.deleteAccountWarning")}</p>
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-3.5 mb-4">
                    <p className="text-xs text-red-700 dark:text-red-300 font-medium mb-2">{t("customer.settings.deletingWillLabel")}</p>
                    <ul className="space-y-1.5">
                      {[
                        t("customer.settings.deleteBullet1"),
                        t("customer.settings.deleteBullet2"),
                        t("customer.settings.deleteBullet3", { amount: formatMoney(wallet?.balance ?? 0) }),
                        t("customer.settings.deleteBullet4"),
                      ].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-red-600/80 dark:text-red-400/80">
                          <span className="w-1 h-1 bg-red-400 rounded-full mt-1.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button variant="destructive" className="rounded-xl" size="sm" onClick={() => { setShowDeleteModal(true); setDeleteStep(1); setDeleteConfirmText(""); setDeleteReason("") }}>
                    <Trash2 className="w-4 h-4 mr-2" /> {t("customer.settings.deleteMyAccount")}
                  </Button>
                </Card>
              </>
            )}

            {/* Help */}
            {activeSection === "help" && (
              <Card className="border-0 shadow-sm overflow-hidden">
                {[
                  { title: t("customer.settings.faqs"), desc: t("customer.settings.commonQuestions"), icon: HelpCircle, href: "/customer/help" },
                  { title: t("customer.help.contactSupport"), desc: t("customer.help.fileTicketDesc"), icon: MessageCircle, href: "/customer/help" },
                  { title: t("customer.settings.termsOfService"), desc: t("customer.settings.readOurTerms"), icon: FileText, href: "/terms" },
                  { title: t("customer.settings.privacyPolicy"), desc: t("customer.settings.howWeProtectData"), icon: Shield, href: "/privacy" },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <button key={item.title} onClick={() => router.push(item.href)} className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center"><Icon className="w-4 h-4 text-muted-foreground" /></div>
                        <div className="text-left"><p className="font-medium text-sm text-foreground">{item.title}</p><p className="text-[11px] text-muted-foreground">{item.desc}</p></div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )
                })}
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Download Data Modal */}
      <Dialog open={showDownloadModal} onOpenChange={(open) => { if (!isDownloading) { setShowDownloadModal(open); setDownloadProgress(0); setDownloadReady(false) } }}>
        <DialogContent className="max-w-sm">
          <div className="text-center">
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {isDownloading ? (
                <Loader2 className="w-7 h-7 text-blue-600 dark:text-blue-400 animate-spin" />
              ) : downloadReady ? (
                <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <FileArchive className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">
              {isDownloading ? t("customer.settings.preparingYourData") : downloadReady ? t("customer.settings.downloadReady") : t("customer.settings.downloadYourData")}
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              {isDownloading
                ? t("customer.settings.packagingDataHint")
                : downloadReady
                  ? t("customer.settings.exportReadyHint")
                  : t("customer.settings.jsonFileHint")}
            </p>

            {/* Progress Bar */}
            {(isDownloading || downloadReady) && (
              <div className="mb-5">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${downloadReady ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(downloadProgress, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("customer.settings.percentComplete", { percent: Math.min(Math.round(downloadProgress), 100) })}</p>
              </div>
            )}

            {downloadReady ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowDownloadModal(false); setDownloadReady(false) }} className="flex-1 rounded-xl bg-transparent">
                  {t("common.close")}
                </Button>
                <Button className="flex-1 rounded-xl gap-2" onClick={handleTriggerDownload}>
                  <Download className="w-4 h-4" /> {t("customer.settings.downloadData")}
                </Button>
              </div>
            ) : isDownloading ? (
              <p className="text-xs text-muted-foreground">{t("customer.settings.pleaseWaitDoNotClose")}</p>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowDownloadModal(false)} className="flex-1 rounded-xl bg-transparent">
                  {t("common.cancel")}
                </Button>
                <Button className="flex-1 rounded-xl gap-2" onClick={handleDownloadData}>
                  <Download className="w-4 h-4" /> {t("customer.settings.startExport")}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Account Modal */}
      <Dialog open={showDeleteModal} onOpenChange={(open) => { if (!isDeleting) { setShowDeleteModal(open); setDeleteStep(1) } }}>
        <DialogContent className="max-w-md">
          {/* Step Indicator */}
          <div className="flex gap-2 mb-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${s <= deleteStep ? "bg-red-500" : "bg-muted"}`} />
            ))}
          </div>

          {/* Step 1: Reason */}
          {deleteStep === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">{t("customer.settings.whyAreYouLeaving")}</h3>
                  <p className="text-xs text-muted-foreground">{t("customer.settings.helpsUsImprove")}</p>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                {[
                  t("customer.settings.reasonBetterAlternative"),
                  t("customer.settings.reasonTooComplicated"),
                  t("customer.settings.reasonPrivacyConcerns"),
                  t("customer.settings.reasonTooManyNotifications"),
                  t("customer.settings.reasonNoLongerNeed"),
                  t("customer.settings.reasonOther"),
                ].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setDeleteReason(reason)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all text-sm ${
                      deleteReason === reason ? "border-red-500 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300" : "border-border text-foreground hover:border-red-300"
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowDeleteModal(false)} className="flex-1 rounded-xl bg-transparent">{t("common.cancel")}</Button>
                <Button variant="destructive" disabled={!deleteReason} onClick={() => setDeleteStep(2)} className="flex-1 rounded-xl">{t("customer.wallet.continue")}</Button>
              </div>
            </div>
          )}

          {/* Step 2: Warning */}
          {deleteStep === 2 && (
            <div>
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">{t("customer.settings.areYouAbsolutelySure")}</h3>
                <p className="text-sm text-muted-foreground">{t("customer.settings.deactivateImmediately")}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">{t("customer.settings.youWillLoseAccessTo")}</p>
                <ul className="space-y-1">
                  {[
                    t("customer.settings.loseBullet1"),
                    t("customer.settings.loseBullet2"),
                    t("customer.settings.loseBullet3", { amount: formatMoney(wallet?.balance ?? 0) }),
                    t("customer.settings.loseBullet4"),
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-xs text-red-600/80 dark:text-red-400/80">
                      <X className="w-3 h-3 flex-shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDeleteStep(1)} className="flex-1 rounded-xl bg-transparent">{t("customer.jobs.backButton")}</Button>
                <Button variant="destructive" onClick={() => setDeleteStep(3)} className="flex-1 rounded-xl">{t("customer.settings.iUnderstand")}</Button>
              </div>
            </div>
          )}

          {/* Step 3: Final Confirmation */}
          {deleteStep === 3 && (
            <div>
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-1">{t("customer.settings.finalStep")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("customer.settings.typeDeletePrefix")} <span className="font-mono font-bold text-foreground">DELETE</span> {t("customer.settings.typeDeleteSuffix")}
                </p>
              </div>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={t("customer.settings.typeDeletePlaceholder")}
                className="rounded-xl text-center font-mono text-lg mb-4 border-red-200 dark:border-red-900/30 focus-visible:ring-red-500"
              />
              {isDeleting ? (
                <div className="text-center py-4">
                  <Loader2 className="w-8 h-8 text-red-500 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t("customer.settings.deletingYourAccount")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("customer.settings.redirectedShortly")}</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDeleteStep(2)} className="flex-1 rounded-xl bg-transparent">{t("customer.jobs.backButton")}</Button>
                  <Button
                    variant="destructive"
                    disabled={deleteConfirmText !== "DELETE"}
                    onClick={handleDeleteAccount}
                    className="flex-1 rounded-xl gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> {t("customer.settings.deleteForever")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
