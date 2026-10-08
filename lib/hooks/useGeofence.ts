"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { queryGeofence, type Geofence, type GeofenceKind, type GeofenceResult } from "@/lib/actions/geofence"
import { DEFAULT_RADIUS_KM, distanceKmBetween } from "@/lib/geo"

/**
 * How far the viewer must move before the fence is re-centred and pulled
 * again. Re-pulling for every GPS jitter would hammer the server for a list
 * that has not meaningfully changed; 500 m is well inside the granularity
 * the results are displayed at.
 */
const RECENTRE_THRESHOLD_KM = 0.5

/** Watch options: a cached fix up to five minutes old is fine for deciding
 *  what is nearby, and high accuracy is not worth the battery here. */
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15000,
  maximumAge: 5 * 60 * 1000,
}

export type UseGeofenceOptions = {
  radiusKm?: number
  kinds?: GeofenceKind[]
  limit?: number
  /** Keep following the viewer as they move. Off by default: most pages are
   *  a snapshot, and only something like a live map wants a running watch. */
  follow?: boolean
  /** Skip the pull entirely (a section that is collapsed, say). */
  enabled?: boolean
  /**
   * Re-pull on this interval, in milliseconds. Off by default: most
   * sections are a snapshot and polling them would be pure cost. Set it
   * where the answer genuinely changes underneath the viewer — someone
   * waiting on "who can help me right now" needs a provider who just came
   * online to appear without a manual refresh.
   */
  refreshIntervalMs?: number
}

export type UseGeofenceReturn = {
  data: GeofenceResult | undefined
  isLoading: boolean
  /** The fence currently being queried, once one is known. */
  fence: Geofence | null
  /** True once the browser has given us a position, so the UI can stop
   *  calling the results "approximate". */
  hasPreciseCentre: boolean
  /** Re-pull immediately, keeping the current centre. */
  refresh: () => void
  /** When the current data arrived, so a live view can say how fresh it is
   *  rather than implying everything is instantaneous. */
  updatedAt: Date | null
}

/**
 * Pull-model access to nearby data.
 *
 * The page owns a position and a radius, and asks the server what is inside
 * that circle. Three things make this worth a hook rather than a bare SWR
 * call:
 *
 *   - The first pull deliberately sends no centre. The server fills one in
 *     from the request's IP geolocation or the account's stored fix, so the
 *     section renders real nearby data before the browser has been asked
 *     for anything and without waiting on a permission dialog.
 *   - When the browser does produce a position, the fence re-centres and
 *     pulls again, but only once the viewer has actually moved far enough
 *     to change the answer.
 *   - Every section on a page that shares a fence shares one SWR key, so
 *     they collapse into a single request instead of one per section.
 */
export function useGeofence(options: UseGeofenceOptions = {}): UseGeofenceReturn {
  const {
    radiusKm = DEFAULT_RADIUS_KM,
    kinds,
    limit,
    follow = false,
    enabled = true,
    refreshIntervalMs = 0,
  } = options

  // null until the browser gives us something; the server fills the gap.
  const [centre, setCentre] = useState<{ latitude: number; longitude: number } | null>(null)
  const centreRef = useRef(centre)
  centreRef.current = centre

  const acceptPosition = useCallback((latitude: number, longitude: number) => {
    const current = centreRef.current
    // Ignore jitter: re-rendering every list because the fix wobbled by a
    // few metres is worse than being slightly stale.
    if (current && distanceKmBetween(current, { latitude, longitude }) < RECENTRE_THRESHOLD_KM) return
    setCentre({ latitude, longitude })
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === "undefined" || !navigator.geolocation) return

    let cancelled = false
    let watchId: number | null = null

    const onPosition = (position: GeolocationPosition) => {
      if (cancelled) return
      acceptPosition(position.coords.latitude, position.coords.longitude)
    }
    // Failure is expected and survivable — the server-resolved centre is
    // already in play, so there is nothing to report to the user here.
    const onError = () => {}

    if (follow) {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, WATCH_OPTIONS)
    } else {
      navigator.geolocation.getCurrentPosition(onPosition, onError, WATCH_OPTIONS)
    }

    return () => {
      cancelled = true
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [enabled, follow, acceptPosition])

  // Rounded into the key so that sub-threshold movement cannot produce a
  // new key (and therefore a new request) even if a re-render slips one in.
  const keyCentre = centre
    ? `${centre.latitude.toFixed(2)},${centre.longitude.toFixed(2)}`
    : "server"
  const key = enabled
    ? `geofence:${keyCentre}:${radiusKm}:${(kinds ?? ["all"]).join("+")}:${limit ?? "default"}`
    : null

  const { data, isLoading, mutate, isValidating } = useSWR(
    key,
    () => queryGeofence({
      fence: centreRef.current ? { ...centreRef.current, radiusKm } : { radiusKm },
      kinds,
      limit,
    }),
    {
      // Nearby results do not change second to second, and this is the
      // request the whole page waits on.
      revalidateOnFocus: false,
      // A poll must not be swallowed by deduping, so the dedupe window
      // tracks the interval when one is set.
      dedupingInterval: refreshIntervalMs > 0 ? Math.min(refreshIntervalMs, 10_000) : 60_000,
      refreshInterval: refreshIntervalMs,
      // SWR pauses polling on a hidden tab by default, which is what we
      // want: nobody needs their phone querying the database in a pocket.
      keepPreviousData: true,
    },
  )

  // Stamped every time a fetch settles with data, which is what "last
  // updated" means to a viewer. Done in an effect rather than during render
  // so polling actually advances it, and so render stays free of side
  // effects.
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  useEffect(() => {
    if (data === undefined || isValidating) return
    setUpdatedAt(new Date())
  }, [data, isValidating])

  return {
    data,
    isLoading,
    updatedAt,
    fence: data?.fence ?? null,
    hasPreciseCentre: data?.centreFrom === "CLIENT" || data?.centreFrom === "GPS",
    refresh: () => { void mutate() },
  }
}
