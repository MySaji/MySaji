"use client"

import { useEffect, useState } from "react"
import { Loader2, Power } from "lucide-react"
import { getMyOnlineStatus, setOnlineStatus } from "@/lib/actions/provider-availability"
import { useLocalization } from "@/lib/hooks/useLocalization"

/**
 * The Solo Pro / field-tech "Go Online" control (Adaptive UI Workspaces) —
 * self-contained (fetches its own status, owns its own state) so it can be
 * dropped anywhere: the jobs page header, the topbar, the field-tech home.
 * Extracted from app/provider/jobs/page.tsx so there's exactly one copy of
 * this geolocation logic instead of one per surface.
 *
 * Going online captures a one-shot GPS location (not continuous tracking —
 * that's the separate per-job "Share My Location" toggle) so the Business
 * Portal's technician map and nearest-staff auto-assign have something to
 * work with. A silent retry runs on mount if already online, in case a
 * prior attempt never got a location (permission denied, transient GPS
 * error) — self-heals without requiring an off/on cycle.
 */
export function ProviderOnlineToggle({ variant = "full" }: { variant?: "full" | "compact" }) {
  const { t } = useLocalization()
  const [isOnline, setIsOnline] = useState(false)
  const [isTogglingOnline, setIsTogglingOnline] = useState(false)
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false)
  const [onlineError, setOnlineError] = useState("")

  useEffect(() => {
    getMyOnlineStatus().then((status) => {
      setIsOnline(status?.isOnline ?? false)
      if (status?.isOnline && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => { setOnlineStatus({ isOnline: true, latitude: position.coords.latitude, longitude: position.coords.longitude }) },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 },
        )
      }
    })
  }, [])

  const handleToggleOnline = () => {
    setOnlineError("")
    if (isOnline) {
      setIsTogglingOnline(true)
      setOnlineStatus({ isOnline: false }).then(() => { setIsOnline(false); setIsTogglingOnline(false) })
      return
    }
    setIsTogglingOnline(true)
    if (!navigator.geolocation) {
      setOnlineStatus({ isOnline: true }).then(() => { setIsOnline(true); setIsTogglingOnline(false) })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOnlineStatus({ isOnline: true, latitude: position.coords.latitude, longitude: position.coords.longitude })
          .then(() => { setIsOnline(true); setIsTogglingOnline(false) })
      },
      () => {
        setOnlineError(t("provider.jobs.geoPermissionDenied"))
        setOnlineStatus({ isOnline: true }).then(() => { setIsOnline(true); setIsTogglingOnline(false) })
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleUpdateLocationNow = () => {
    setOnlineError("")
    if (!navigator.geolocation) { setOnlineError(t("provider.jobs.geoNotSupported")); return }
    setIsUpdatingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOnlineStatus({ isOnline: true, latitude: position.coords.latitude, longitude: position.coords.longitude })
          .then(() => setIsUpdatingLocation(false))
      },
      () => { setOnlineError(t("provider.jobs.geoPermissionDenied")); setIsUpdatingLocation(false) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  if (variant === "compact") {
    return (
      <button
        onClick={handleToggleOnline}
        disabled={isTogglingOnline}
        title={onlineError || undefined}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
          isOnline
            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
            : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
        }`}
      >
        {isTogglingOnline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
        {isOnline ? t("provider.jobs.onlineStatusOn") : t("provider.jobs.onlineStatusOff")}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleToggleOnline}
        disabled={isTogglingOnline}
        className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
          isOnline ? "bg-emerald-500 text-white" : "bg-white/10 text-blue-100 hover:bg-white/20"
        }`}
      >
        {isTogglingOnline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
        {isOnline ? t("provider.jobs.onlineStatusOn") : t("provider.jobs.onlineStatusOff")}
      </button>
      {isOnline && (
        <button onClick={handleUpdateLocationNow} disabled={isUpdatingLocation} className="text-[11px] text-blue-100 hover:text-white underline flex items-center gap-1">
          {isUpdatingLocation && <Loader2 className="w-3 h-3 animate-spin" />}
          {t("provider.jobs.updateLocationButton")}
        </button>
      )}
      {onlineError && <p className="text-[11px] text-amber-200">{onlineError}</p>}
    </div>
  )
}
