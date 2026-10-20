"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { DeviceNotificationsCard } from "@/frontend/components/notifications/device-notifications"
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from "@/backend/actions/settings"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export function NotificationPreferencesCard() {
  const { t } = useLocalization()
  const [settings, setSettings] = useState<NotificationPreferences | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const load = async () => { try { setSettings(await getNotificationPreferences()); setError("") } catch { setError("Notification preferences could not be loaded. Try again.") } }
  useEffect(() => { void load() }, [])
  const categories = [
    { key: "jobUpdates", title: t("customer.settings.notifJobUpdates"), description: t("customer.settings.notifJobUpdatesDesc") },
    { key: "messages", title: t("customer.settings.notifMessages"), description: t("customer.settings.notifMessagesDesc") },
    { key: "payments", title: t("customer.settings.notifPayments"), description: t("customer.settings.notifPaymentsDesc") },
    { key: "promotions", title: t("customer.settings.notifPromotions"), description: t("customer.settings.notifPromotionsDesc") },
    { key: "emailDigest", title: t("customer.settings.notifEmailDigest"), description: t("customer.settings.notifEmailDigestDesc") },
  ] as const
  return <div className="space-y-5"><DeviceNotificationsCard /><section className="rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">Choose which updates you receive</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">These preferences follow your account across devices. Essential system announcements remain visible in the app.</p>{error && <p role="alert" className="my-3 text-sm text-red-700">{error}{!settings && <button className="ml-2 underline" onClick={() => void load()}>Try again</button>}</p>}{notice && <p role="status" className="my-3 text-sm text-blue-700">{notice}</p>}{!settings && !error && <Loader2 className="my-5 animate-spin" size={20} />}<div className="mt-4 space-y-3">{settings && categories.map(item => <div key={item.key} className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{item.description}</p></div><button role="switch" aria-checked={settings[item.key]} aria-label={item.title} disabled={busy !== null} onClick={async () => { setBusy(item.key); setError(""); setNotice(""); const next = { ...settings, [item.key]: !settings[item.key] }; try { const result = await updateNotificationPreferences(next); if (!result.success) { setError(result.error); return } setSettings(next); setNotice("Notification preference saved.") } catch { setError("This preference could not be saved. Please try again.") } finally { setBusy(null) } }} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full disabled:opacity-50 ${settings[item.key] ? "bg-blue-700" : "bg-slate-300"}`}><span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${settings[item.key] ? "translate-x-6" : "translate-x-1"}`} /></button></div>)}</div></section></div>
}
