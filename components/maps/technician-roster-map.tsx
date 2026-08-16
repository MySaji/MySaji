"use client"

import { useCallback } from "react"
import { useJsApiLoader, GoogleMap, MarkerF } from "@react-google-maps/api"
import { MapPin } from "lucide-react"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID, isGoogleMapsConfigured } from "@/lib/google-maps"

export type TechnicianPin = {
  providerId: string
  name: string
  latitude: number
  longitude: number
  atCapacity: boolean
}

/** Multi-marker roster map for the Business Portal — every online
 * technician with a known location, color-coded by whether they're at the
 * concurrent-job cap. Falls back to a labeled placeholder when Maps isn't
 * configured or no technician has a location yet, same convention as
 * LiveTrackingMap. */
export function TechnicianRosterMap({ technicians, className }: { technicians: TechnicianPin[]; className?: string }) {
  const configured = isGoogleMapsConfigured()
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  const containerClass = className ?? "h-72 w-full"

  const onMapLoad = useCallback((map: google.maps.Map) => {
    if (technicians.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    for (const tech of technicians) bounds.extend({ lat: tech.latitude, lng: tech.longitude })
    map.fitBounds(bounds, 64)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicians])

  if (!configured || !isLoaded || technicians.length === 0) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-slate-900 text-sm text-white/60 ${containerClass}`}>
        <MapPin className="h-4 w-4" /> {technicians.length === 0 ? "No online technicians with a known location yet" : "Live map unavailable"}
      </div>
    )
  }

  const center = { lat: technicians[0].latitude, lng: technicians[0].longitude }

  return (
    <GoogleMap mapContainerClassName={containerClass} center={center} zoom={12} onLoad={onMapLoad} options={{ disableDefaultUI: true, zoomControl: true }}>
      {technicians.map((tech) => (
        <MarkerF
          key={tech.providerId}
          position={{ lat: tech.latitude, lng: tech.longitude }}
          label={{ text: tech.name.charAt(0).toUpperCase(), color: "#fff", fontSize: "11px", fontWeight: "bold" }}
          title={`${tech.name}${tech.atCapacity ? " (at capacity)" : ""}`}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: tech.atCapacity ? "#f59e0b" : "#10b981",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          }}
        />
      ))}
    </GoogleMap>
  )
}
