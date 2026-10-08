"use client"

import { useEffect, useState } from "react"
import { Loader2, Power } from "lucide-react"
import { getMyOnlineStatus, setOnlineStatus, heartbeat } from "@/lib/actions/provider-availability"
import { HEARTBEAT_INTERVAL_MS } from "@/lib/provider-presence"
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
 *
 * While online it also sends a heartbeat. That is what makes the green dot
 * mean something: the server treats a provider whose device has stopped
 * checking in as offline, so closing the tab, losing signal, logging out
 * or letting a session expire all retire the listing on their own. The
 * heartbeat cannot turn anyone online — only refresh a provider who
 * already is — because a client that could assert its own status would
 * defeat the mechanism entirely.
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

  // The heartbeat. Carries a position when the browser will give one
  // cheaply, so a provider who moves while online stays discoverable where
  // they actually are. Only runs while online, so an offline provider is
  // never located — see the battery/permission rules this feature follows.
  useEffect(() => {
    if (!isOnline) return
    let cancelled = false

    const beat = () => {
      if (cancelled) return
      if (!navigator.geolocation) { void heartbeat({}); return }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!cancelled) void heartbeat({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        },
        // No position is fine; the point of the beat is "still here".
        () => { if (!cancelled) void heartbeat({}) },
        // Deliberately low accuracy and a generous cache: this runs every
        // 90s for as long as someone is working, and a precise fix each
        // time would cost battery for precision nobody uses.
        { enableHighAccuracy: false, timeout: 20000, maximumAge: HEARTBEAT_INTERVAL_MS },
      )
    }

    beat()
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [isOnline])

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
