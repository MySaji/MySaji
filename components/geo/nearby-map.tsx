"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useJsApiLoader, GoogleMap, MarkerF, CircleF, InfoWindowF } from "@react-google-maps/api"
import { MapPin, Star, ShieldCheck } from "lucide-react"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID, isGoogleMapsConfigured } from "@/lib/google-maps"
import type { FencedProvider, FencedShop, Geofence } from "@/lib/actions/geofence"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { formatDistance } from "@/lib/geo"

/** Flattened pin, so the map does not care which collection a thing came
 *  from beyond how to colour it and where it links. */
type Pin = {
  key: string
  kind: "shop" | "provider"
  name: string
  latitude: number
  longitude: number
  distanceKm: number | null
  /** Pin is a coarsened neighbourhood position rather than a real address. */
  approximate: boolean
  href: string
  rating: number
  reviewCount: number
  verified: boolean
  subtitle: string | null
}

const SHOP_COLOUR = "#f59e0b"
const PROVIDER_COLOUR = "#2563eb"

/**
 * The nearby results, drawn as a map instead of a list.
 *
 * Reads the same geofence payload the list does — no second query, no
 * second source of truth — so the pins and the cards can never disagree.
 * The fence itself is drawn as a circle, which is what makes the radius
 * legible: a list of distances tells you how far things are, a circle tells
 * you what you are excluding.
 *
 * Degrades the way every other optional integration in this codebase does:
 * with no Maps key there is no map, and the caller keeps its list.
 */
export function NearbyMap({
  shops, providers, fence, className,
}: {
  shops: FencedShop[]
  providers: FencedProvider[]
  fence: Geofence | null
  className?: string
}) {
  const { t } = useLocalization()
  const configured = isGoogleMapsConfigured()
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  })
  const [openKey, setOpenKey] = useState<string | null>(null)

  const pins = useMemo<Pin[]>(() => [
    ...providers.map((p) => ({
      key: `p:${p.providerId}`,
      kind: "provider" as const,
      name: p.name,
      // Coarsened server-side: a provider pin shows the neighbourhood, not
      // an address. The distance on the card is the exact figure.
      latitude: p.approxLatitude,
      longitude: p.approxLongitude,
      approximate: true,
      distanceKm: p.distanceKm,
      href: p.slug ? `/p/${p.slug}` : `/customer/find-specialists?provider=${p.providerId}`,
      rating: p.rating,
      reviewCount: p.reviewCount,
      verified: p.verified,
      subtitle: p.categoryName,
    })),
    ...shops.map((s) => ({
      key: `s:${s.id}`,
      kind: "shop" as const,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      approximate: false,
      distanceKm: s.distanceKm,
      href: `/customer/shops/${s.id}`,
      rating: s.rating,
      reviewCount: s.reviewCount,
      verified: s.isVerified,
      subtitle: s.category,
    })),
  ], [shops, providers])

  // Fit to the fence rather than to the pins: the circle is the thing the
  // customer chose, and framing to the pins alone would silently zoom in on
  // a cluster and hide how much of the radius is empty.
  const onLoad = useCallback((map: google.maps.Map) => {
    if (!fence) return
    const bounds = new google.maps.LatLngBounds()
    // A degree of latitude is ~111.32 km everywhere, which is close enough
    // to frame a circle; longitude is handled by fitBounds squaring it off.
    const pad = fence.radiusKm / 111.32
    bounds.extend({ lat: fence.latitude + pad, lng: fence.longitude + pad })
    bounds.extend({ lat: fence.latitude - pad, lng: fence.longitude - pad })
    map.fitBounds(bounds, 24)
  }, [fence])

  const containerClass = className ?? "h-[420px] w-full rounded-xl"

  if (!configured || !isLoaded || !fence) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground ${containerClass}`}>
        <MapPin className="h-4 w-4" />
        {t("nearby.mapUnavailable")}
      </div>
    )
  }

  const centre = { lat: fence.latitude, lng: fence.longitude }
  const open = pins.find((p) => p.key === openKey) ?? null

  return (
    <GoogleMap
      mapContainerClassName={containerClass}
      center={centre}
      zoom={12}
      onLoad={onLoad}
      options={{
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        // The map sits in a scrolling page, so a one-finger drag should
        // scroll the page rather than pan the map.
        gestureHandling: "cooperative",
      }}
    >
      {/* The fence. Drawn under the pins so it never swallows a click. */}
      <CircleF
        center={centre}
        radius={fence.radiusKm * 1000}
        options={{
          strokeColor: "#2563eb", strokeOpacity: 0.5, strokeWeight: 1,
          fillColor: "#2563eb", fillOpacity: 0.06, clickable: false,
        }}
      />

      {/* Where the customer is. Deliberately distinct from the results. */}
      <MarkerF
        position={centre}
        title={t("nearby.youAreHere")}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        }}
        zIndex={1}
      />

      {pins.map((pin) => (
        <MarkerF
          key={pin.key}
          position={{ lat: pin.latitude, lng: pin.longitude }}
          title={pin.name}
          onClick={() => setOpenKey(pin.key)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: pin.kind === "shop" ? SHOP_COLOUR : PROVIDER_COLOUR,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          }}
          zIndex={2}
        />
      ))}

      {open && (
        <InfoWindowF
          position={{ lat: open.latitude, lng: open.longitude }}
          onCloseClick={() => setOpenKey(null)}
        >
          {/* Google styles this container itself, so the palette is forced
              light here rather than inheriting the app's theme tokens. */}
          <div className="min-w-[160px] max-w-[220px] text-gray-900">
            <Link href={open.href} className="text-sm font-semibold hover:underline">
              {open.name}
              {open.verified && <ShieldCheck className="ml-1 inline h-3 w-3 align-[-1px] text-emerald-600" />}
            </Link>
            {open.subtitle && <p className="mt-0.5 text-[11px] text-gray-600">{open.subtitle}</p>}
            <p className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
              {open.reviewCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {open.rating.toFixed(1)} ({open.reviewCount})
                </span>
              )}
              {open.distanceKm != null && (
                <span className="font-medium text-blue-700">{t("nearby.distanceAway", { km: formatDistance(open.distanceKm) ?? "" })}</span>
              )}
            </p>
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  )
}
