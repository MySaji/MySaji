"use client"

import { useCallback } from "react"
import { useJsApiLoader, GoogleMap, MarkerF, PolylineF } from "@react-google-maps/api"
import { MapPin } from "lucide-react"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID, isGoogleMapsConfigured } from "@/lib/google-maps"

/** Two-marker live map — the provider's last-known real position and the
 * job's real destination, with a line between them. Falls back to a
 * clearly-labeled placeholder when Maps isn't configured or neither
 * coordinate is known yet. */
export function LiveTrackingMap({
  providerLat, providerLng, destinationLat, destinationLng, className,
}: {
  providerLat: number | null
  providerLng: number | null
  destinationLat: number | null
  destinationLng: number | null
  className?: string
}) {
  const configured = isGoogleMapsConfigured()
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  })

  const hasProvider = providerLat != null && providerLng != null
  const hasDestination = destinationLat != null && destinationLng != null
  const containerClass = className ?? "h-64 w-full"

  const onMapLoad = useCallback((map: google.maps.Map) => {
    if (hasProvider && hasDestination) {
      const bounds = new google.maps.LatLngBounds()
      bounds.extend({ lat: providerLat!, lng: providerLng! })
      bounds.extend({ lat: destinationLat!, lng: destinationLng! })
      map.fitBounds(bounds, 64)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProvider, hasDestination, providerLat, providerLng, destinationLat, destinationLng])

  if (!configured || !isLoaded || (!hasProvider && !hasDestination)) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-slate-900 text-sm text-white/60 ${containerClass}`}>
        <MapPin className="h-4 w-4" /> {!hasProvider && !hasDestination ? "Waiting for location data" : "Live map unavailable"}
      </div>
    )
  }

  const center = hasProvider ? { lat: providerLat!, lng: providerLng! } : { lat: destinationLat!, lng: destinationLng! }

  return (
    <GoogleMap mapContainerClassName={containerClass} center={center} zoom={13} onLoad={onMapLoad} options={{ disableDefaultUI: true, zoomControl: true }}>
      {hasProvider && (
        <MarkerF
          position={{ lat: providerLat!, lng: providerLng! }}
          label={{ text: "P", color: "#fff", fontSize: "11px", fontWeight: "bold" }}
          title="Provider"
        />
      )}
      {hasDestination && (
        <MarkerF
          position={{ lat: destinationLat!, lng: destinationLng! }}
          label={{ text: "D", color: "#fff", fontSize: "11px", fontWeight: "bold" }}
          title="Destination"
        />
      )}
      {hasProvider && hasDestination && (
        <PolylineF
          path={[{ lat: providerLat!, lng: providerLng! }, { lat: destinationLat!, lng: destinationLng! }]}
          options={{ strokeColor: "#3b82f6", strokeOpacity: 0.8, strokeWeight: 3, geodesic: true }}
        />
      )}
    </GoogleMap>
  )
}
