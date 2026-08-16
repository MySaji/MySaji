"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import {
  getNotificationPreferences, updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/actions/settings"
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from "@/lib/actions/push"
import { useLocalization } from "@/lib/hooks/useLocalization"

const DEFAULT_PREFERENCES: NotificationPreferences = {
  jobUpdates: true, messages: true, payments: true, promotions: false, emailDigest: true, pushNotifications: true,
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

/** Self-contained "Notification Preferences" card — real per-category
 * toggles plus the actual browser Push API subscribe/unsubscribe flow
 * (permission request, service worker registration, VAPID subscription).
 * Originally built once for the customer portal only; every other portal's
 * settings/profile page renders this exact same component now, since the
 * backend (getNotificationPreferences/pushToUser/etc.) was already fully
 * role-agnostic — providers, shopkeepers, distributors, agents,
 * secretaries, sub-admins and admins just never had any UI to reach it. */
export function NotificationPreferencesCard() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [settings, setSettings] = useState<NotificationPreferences>(DEFAULT_PREFERENCES)
  const [pushError, setPushError] = useState("")

  useEffect(() => {
    getNotificationPreferences().then(setSettings).finally(() => setIsLoading(false))
  }, [])

  const notificationLabels: Record<keyof NotificationPreferences, { title: string; desc: string }> = {
    jobUpdates: { title: t("customer.settings.notifJobUpdates"), desc: t("customer.settings.notifJobUpdatesDesc") },
    messages: { title: t("customer.settings.notifMessages"), desc: t("customer.settings.notifMessagesDesc") },
    payments: { title: t("customer.settings.notifPayments"), desc: t("customer.settings.notifPaymentsDesc") },
    promotions: { title: t("customer.settings.notifPromotions"), desc: t("customer.settings.notifPromotionsDesc") },
    emailDigest: { title: t("customer.settings.notifEmailDigest"), desc: t("customer.settings.notifEmailDigestDesc") },
    pushNotifications: { title: t("customer.settings.notifPushNotifications"), desc: t("customer.settings.notifPushNotificationsDesc") },
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

  const handleToggle = async (key: keyof NotificationPreferences) => {
    const turningOn = !settings[key]

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

    const next = { ...settings, [key]: turningOn }
    setSettings(next)
    await updateNotificationPreferences(next)
  }

  if (isLoading) {
    return (
      <Card className="p-5 border-0 shadow-sm flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  return (
    <Card className="p-5 border-0 shadow-sm">
      <h3 className="font-semibold text-foreground mb-4">{t("customer.settings.notificationPreferences")}</h3>
      {pushError && (
        <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-400">
          {pushError}
        </div>
      )}
      <div className="space-y-2">
        {(Object.keys(settings) as (keyof NotificationPreferences)[]).map((key) => {
          const value = settings[key]
          const labels = notificationLabels[key]
          return (
            <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
              <div>
                <p className="font-medium text-sm text-foreground">{labels.title}</p>
                <p className="text-[11px] text-muted-foreground">{t("customer.settings.getNotifiedAbout", { topic: labels.desc })}</p>
              </div>
              <button onClick={() => handleToggle(key)} aria-label={labels.title} aria-pressed={value}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${value ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
