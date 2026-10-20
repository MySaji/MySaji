"use client"

import { useEffect, useState } from "react"
import { BellRing, Volume2, Loader2 } from "lucide-react"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { getVapidPublicKey, savePushSubscription, sendDeviceTestNotification } from "@/backend/actions/push"
import { getNotificationPreferences, updateNotificationPreferences } from "@/backend/actions/settings"
import { enableDevicePush, disableDevicePush, supportsDevicePush, rootPushWorker, clearDevicePushSession } from "@/frontend/lib/device-push"
import { playNotificationSound, markDeviceNotificationReceived, notificationSoundEnabled, setNotificationSoundEnabled } from "@/frontend/lib/notification-sound"

export function DevicePushSession() {
  const { user, isLoading } = useAuthContext()
  const { data: session } = useSession()
  const pathname = usePathname()
  const id = user?.isActive ? user.id : undefined
  const excluded = pathname.startsWith("/pos") || pathname.startsWith("/till-display")
  const expires = session?.expires
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const received = (event: MessageEvent) => { if (event.data?.type === "SAJI_PUSH_SHOWN") markDeviceNotificationReceived() }
    navigator.serviceWorker.addEventListener("message", received)
    return () => navigator.serviceWorker.removeEventListener("message", received)
  }, [])
  useEffect(() => {
    if (isLoading || !supportsDevicePush() || excluded) return
    let cancelled = false
    const sync = async () => {
      if (!id) { await clearDevicePushSession(); return }
      const registration = await rootPushWorker()
      if (cancelled) return
      registration.active?.postMessage({ type: "SAJI_PUSH_SESSION", session: { userId: id, expiresAt: expires ? Date.parse(expires) : Date.now() + 3600000 } })
      const subscription = await registration.pushManager.getSubscription()
      if (subscription && !cancelled) await savePushSubscription(subscription.toJSON())
    }
    void sync().catch(() => {})
    const changed = () => { void sync().catch(() => {}) }
    window.addEventListener("saji:push-updated", changed)
    return () => { cancelled = true; window.removeEventListener("saji:push-updated", changed) }
  }, [id, expires, isLoading, excluded])
  return null
}

export function DeviceNotificationsCard() {
  const [key, setKey] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [supported, setSupported] = useState(false)
  const [sound, setSound] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setSupported(supportsDevicePush()); setSound(notificationSoundEnabled())
      try {
        const publicKey = await getVapidPublicKey()
        const registration = supportsDevicePush() ? await navigator.serviceWorker.getRegistration("/") : undefined
        const subscription = await registration?.pushManager.getSubscription()
        const preferences = await getNotificationPreferences()
        if (!cancelled) { setKey(publicKey); setEnabled(!!subscription && Notification.permission === "granted" && preferences.pushNotifications) }
      } catch { if (!cancelled) setError("Device settings could not be checked. Refresh this page to try again.") }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [])
  return <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-label="Device notification controls">
    <div className="flex items-start gap-3"><BellRing className="mt-1 shrink-0 text-blue-700" size={22} /><div><h2 className="text-lg font-semibold">Alerts on this device</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Receive messages, incoming calls and important updates in your device notification center when MySaji is in the background.</p></div></div>
    <p role="status" className="mt-4 text-sm font-medium">{loading ? "Checking this browser..." : enabled ? "Device subscription active" : !supported ? "This browser needs a supported secure app context" : !key ? "Web Push setup is needed on this deployment" : "Device alerts are off"}</p>
    <div className="mt-4 flex flex-wrap gap-3"><button disabled={loading || busy || !supported || (!enabled && !key)} onClick={async () => {
      setBusy(true); setError(""); setMessage("")
      try {
        if (enabled) { await disableDevicePush(); setEnabled(false); setMessage("Notifications disabled on this device.") }
        else {
          const start = enableDevicePush(key || "")
          await start
          const preferences = await getNotificationPreferences()
          const result = await updateNotificationPreferences({ ...preferences, pushNotifications: true })
          if (!result.success) throw new Error(result.error)
          setEnabled(true); setMessage("Device alerts enabled. Your category preferences still apply.")
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update device alerts. Please try again.") }
      finally { setBusy(false) }
    }} className="flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />}{enabled ? "Disable on this device" : "Enable device alerts"}</button><button disabled={!enabled || busy} onClick={async () => { setBusy(true); setError(""); try { const result = await sendDeviceTestNotification(); if (!result.success) { setError(result.error); return } setMessage("Test alert requested. Check your device notification center; delivery depends on browser and device settings.") } catch { setError("The test alert could not be requested. Please try again.") } finally { setBusy(false) } }} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-40">Send device test</button><button aria-pressed={sound} onClick={() => { const next = !sound; setNotificationSoundEnabled(next); setSound(next) }} className="flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm"><Volume2 size={16} />In-app sound: {sound ? "On" : "Off"}</button><button onClick={() => { playNotificationSound(true); setMessage("Test sound requested. Check this device's volume if you cannot hear it.") }} className="min-h-11 rounded-lg border px-4 text-sm">Test sound</button></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-blue-800 dark:text-blue-200">{message}</p>}
    <p className="mt-4 text-xs leading-6 text-muted-foreground">Your device controls notification sound, Focus/Do Not Disturb and background delivery. On iPhone/iPad, add MySaji to the Home Screen first. Sign out to stop alerts on this device.</p>
  </section>
}
