"use client"

import { useJsApiLoader, GoogleMap, MarkerF } from "@react-google-maps/api"
import { MapPin } from "lucide-react"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID, isGoogleMapsConfigured } from "@/lib/google-maps"

/** A single-marker map preview — used for shop locations and job
 * destinations. Falls back to a clearly-labeled placeholder when Maps isn't
 * configured or there's no real coordinate to show, rather than rendering
 * nothing or a fake pin. */
export function StaticLocationMap({
  latitude, longitude, label, className,
}: { latitude: number | null; longitude: number | null; label?: string; className?: string }) {
  const configured = isGoogleMapsConfigured()
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  const containerClass = className ?? "h-40 w-full rounded-xl"

  if (latitude == null || longitude == null) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground ${containerClass}`}>
        <MapPin className="h-4 w-4" /> No location set
      </div>
    )
  }

  if (!configured || !isLoaded) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground ${containerClass}`}>
        <MapPin className="h-4 w-4" /> Map unavailable
      </div>
    )
  }

  const center = { lat: latitude, lng: longitude }
  return (
    <GoogleMap mapContainerClassName={containerClass} center={center} zoom={15} options={{ disableDefaultUI: true, zoomControl: true }}>
      <MarkerF position={center} title={label} />
    </GoogleMap>
  )
}
