"use client"

import { usePlatformGoogleMaps } from "@/frontend/lib/maps-provider"
import { OsmMap } from "@/frontend/components/maps/osm-map"

import { useCallback } from "react"
import { GoogleMap, MarkerF, PolylineF } from "@react-google-maps/api"
import { MapPin } from "lucide-react"

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
  const { isLoaded, mapConfig, osm } = usePlatformGoogleMaps()
  const configured = osm || Boolean(mapConfig?.googleConfigured)

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
  }, [hasProvider, hasDestination, providerLat, providerLng, destinationLat, destinationLng])

  if (osm && (hasProvider || hasDestination)) {
    const pins = [...(hasProvider ? [{ id:"provider",latitude:providerLat!,longitude:providerLng!,label:"Provider",color:"#10b981" }] : []), ...(hasDestination ? [{ id:"destination",latitude:destinationLat!,longitude:destinationLng!,label:"Destination",color:"#ff7900" }] : [])]
    return <OsmMap className={containerClass} pins={pins} line={pins} zoom={13} />
  }

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
