"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import type { PublicMapConfig, MapProvider } from "@/backend/domain/map-provider"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from "@/backend/services/google-maps"

export const MAP_CONFIG_KEY = "/api/maps/config"
export function useMapSettings() {
  return useSWR<PublicMapConfig>(MAP_CONFIG_KEY, async url => {
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) throw new Error("Map settings could not be loaded.")
    return response.json()
  }, { dedupingInterval: 10_000, refreshInterval: 60_000, refreshWhenHidden: false, revalidateOnFocus: true })
}
let googlePromise: Promise<typeof google> | null = null
export function loadSelectedGoogleMaps() {
  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("Google Maps is not configured."))
  googlePromise ??= import("@googlemaps/js-api-loader").then(({ Loader }) => new Loader({ id: GOOGLE_MAPS_LOADER_ID, apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, version: "weekly", libraries: GOOGLE_MAPS_LIBRARIES }).load()).catch(error => { googlePromise = null; throw error })
  return googlePromise
}
/** The remote SDK is never requested until the persisted provider is known. */
export function usePlatformGoogleMaps() {
  const { data: mapConfig, error: settingsError } = useMapSettings()
  const [isLoaded, setLoaded] = useState(false)
  const [loadError, setError] = useState<Error>()
  useEffect(() => {
    if (mapConfig?.provider !== "GOOGLE" || !mapConfig.googleConfigured) return
    let active = true
    loadSelectedGoogleMaps().then(() => { if (active) setLoaded(true) }).catch(error => { if (active) setError(error instanceof Error ? error : new Error("Map failed to load.")) })
    return () => { active = false }
  }, [mapConfig?.provider, mapConfig?.googleConfigured])
  return { isLoaded: mapConfig?.provider === "GOOGLE" && isLoaded, loadError: settingsError || loadError, mapConfig, osm: mapConfig?.provider === "OPENSTREETMAP" }
}
export type MapPlace = { address: string; city: string | null; latitude: number; longitude: number }
export async function reverseMapLocation(provider: MapProvider | undefined, latitude: number, longitude: number): Promise<MapPlace | null> {
  if (provider === "GOOGLE") {
    const maps = await loadSelectedGoogleMaps()
    const { results } = await new maps.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } })
    const result = results[0]
    return result ? { address: result.formatted_address, city: result.address_components.find(c => c.types.includes("locality"))?.long_name ?? null, latitude, longitude } : null
  }
  if (provider !== "OPENSTREETMAP") return null
  const response = await fetch(`/api/maps/geocode?lat=${latitude}&lng=${longitude}`, { cache: "no-store" })
  if (!response.ok) return null
  const data = await response.json()
  return data.places?.[0] ?? null
}
