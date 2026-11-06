"use client"

import { usePlatformGoogleMaps } from "@/frontend/lib/maps-provider"
import { OsmMap } from "@/frontend/components/maps/osm-map"

import { GoogleMap, MarkerF } from "@react-google-maps/api"
import { MapPin } from "lucide-react"

/** A single-marker map preview — used for shop locations and job
 * destinations. Falls back to a clearly-labeled placeholder when Maps isn't
 * configured or there's no real coordinate to show, rather than rendering
 * nothing or a fake pin. */
export function StaticLocationMap({
  latitude, longitude, label, className,
}: { latitude: number | null; longitude: number | null; label?: string; className?: string }) {
  const { isLoaded, mapConfig, osm } = usePlatformGoogleMaps()
  const configured = osm || Boolean(mapConfig?.googleConfigured)

  const containerClass = className ?? "h-40 w-full rounded-xl"

  if (latitude == null || longitude == null) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground ${containerClass}`}>
        <MapPin className="h-4 w-4" /> No location set
      </div>
    )
  }

  if (osm) return <OsmMap className={containerClass} staticPreview center={{ latitude, longitude }} zoom={15} pins={[{ id: "location", latitude, longitude, label: label ?? "Location" }]} />

  if (!configured || !isLoaded) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground ${containerClass}`}>
        <MapPin className="h-4 w-4" /> Map unavailable
      </div>
    )
  }

  const center = { lat: latitude, lng: longitude }
  return (
    // gestureHandling: "none" keeps this a true static preview — this map
    // routinely sits inside a scrollable dialog (e.g. the provider job
    // details modal), and a draggable/zoomable map there captures touch
    // scroll gestures instead of letting them reach the dialog's own
    // scroll container.
    <GoogleMap mapContainerClassName={containerClass} center={center} zoom={15} options={{ disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false }}>
      <MarkerF position={center} title={label} />
    </GoogleMap>
  )
}
