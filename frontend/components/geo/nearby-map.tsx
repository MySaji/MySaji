"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useJsApiLoader, GoogleMap, MarkerF, InfoWindowF, CircleF } from "@react-google-maps/api"
import { useTheme } from "next-themes"
import { MapPin, Star, ShieldCheck, Navigation, Crosshair, Store, Wrench } from "lucide-react"
import {
  MAP_STYLE_LIGHT, MAP_STYLE_DARK, PIN_PATH, PIN_ANCHOR, PIN_LABEL_ORIGIN,
} from "@/frontend/components/geo/map-style"
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID, isGoogleMapsConfigured } from "@/backend/services/google-maps"
import type { FencedProvider, FencedShop, Geofence } from "@/backend/actions/geofence"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

/** The neighbourhood ring, in metres. Matches services/proximity.ts. */
const NEIGHBOURHOOD_METRES = 2000

/** Flattened pin, so the map does not care which collection a thing came
 *  from beyond how to colour it and where it links. */
type Pin = {
  key: string
  kind: "shop" | "provider"
  name: string
  latitude: number
  longitude: number
  distanceKm: number | null
  href: string
  rating: number
  reviewCount: number
  verified: boolean
  subtitle: string | null
}

/** Open shops: amber, matching the storefront accent used on their cards. */
const SHOP_COLOUR = "#f59e0b"
/** Online pros: the same emerald the live dot uses, so a green pin on the
 *  map and a green dot on a card obviously mean the same thing. Previously
 *  these were the same blue as the "you are here" marker, which made a
 *  provider look like the viewer. */
const PROVIDER_COLOUR = "#10b981"
/** The viewer. Blue, and drawn smaller with a ring, so it reads as "me"
 *  rather than as another result. */
const VIEWER_COLOUR = "#2563eb"

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
      distanceKm: s.distanceKm,
      href: `/customer/shops/${s.id}`,
      rating: s.rating,
      reviewCount: s.reviewCount,
      verified: s.isVerified,
      subtitle: s.category,
    })),
  ], [shops, providers])

  // Fit to the results and the viewer, not to the search window.
  //
  // This used to frame the fence, back when the radius was something the
  // customer picked and the circle was worth showing them. Discovery now
  // chooses its own window — currently 50 km — so framing that zoomed out
  // far enough to collapse pins a couple of kilometres apart into one
  // blob. What matters is where the results actually are.
  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    if (!fence) return
    const bounds = new google.maps.LatLngBounds()
    bounds.extend({ lat: fence.latitude, lng: fence.longitude })
    for (const pin of pins) bounds.extend({ lat: pin.latitude, lng: pin.longitude })

    // One result sitting on top of the viewer gives a zero-area box, which
    // fitBounds answers by zooming to maximum. Pad it out to a few hundred
    // metres so a single nearby pin lands at street level instead.
    const span = bounds.toSpan()
    if (span.lat() < 0.004 && span.lng() < 0.004) {
      const pad = 0.004
      bounds.extend({ lat: fence.latitude + pad, lng: fence.longitude + pad })
      bounds.extend({ lat: fence.latitude - pad, lng: fence.longitude - pad })
    }
    map.fitBounds(bounds, 48)
  }, [fence, pins])

  // Night styling follows the app, with `resolvedTheme` rather than
  // `theme` so "system" is answered rather than passed through.
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // Kept so the recentre control can put the customer back in the middle
  // after they have panned away looking at something.
  const mapRef = useRef<google.maps.Map | null>(null)
  const recentre = useCallback(() => {
    if (!mapRef.current || !fence) return
    mapRef.current.panTo({ lat: fence.latitude, lng: fence.longitude })
    mapRef.current.setZoom(14)
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

  const shopCount = pins.filter((p) => p.kind === "shop").length
  const proCount = pins.length - shopCount

  return (
    <div className={"relative " + containerClass}>
      <GoogleMap
        mapContainerClassName="h-full w-full"
        center={centre}
        zoom={12}
        onLoad={onLoad}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          // Google's own zoom buttons are drawn over by the controls below
          // on a phone, and pinch works regardless.
          zoomControl: false,
          clickableIcons: false,
          // The map sits in a scrolling page, so a one-finger drag should
          // scroll the page rather than pan the map.
          gestureHandling: "cooperative",
          styles: isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
        }}
      >
      {/* The neighbourhood, drawn faintly. Gives the distances on the pins
          something to be read against: "2 km" means little until you can
          see how much of the screen it covers. */}
      <CircleF
        center={centre}
        radius={NEIGHBOURHOOD_METRES}
        options={{
          strokeColor: VIEWER_COLOUR,
          strokeOpacity: 0.35,
          strokeWeight: 1,
          fillColor: VIEWER_COLOUR,
          fillOpacity: isDark ? 0.07 : 0.05,
          clickable: false,
        }}
      />

      {/* Where the customer is. Deliberately distinct from the results. */}
      <MarkerF
        position={centre}
        title={t("nearby.youAreHere")}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: VIEWER_COLOUR,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        }}
        zIndex={1}
      />

      {/* Teardrops rather than dots: a pin anchored at its point says
          exactly which spot it means, where a circle centred on the place
          leaves it ambiguous at the zoom levels a street search uses. The
          selected one is drawn larger and above the rest. */}
      {pins.map((pin) => {
        const selected = pin.key === openKey
        return (
          <MarkerF
            key={pin.key}
            position={{ lat: pin.latitude, lng: pin.longitude }}
            title={pin.name}
            onClick={() => setOpenKey(pin.key)}
            icon={{
              path: PIN_PATH,
              scale: selected ? 1.5 : 1.15,
              fillColor: pin.kind === "shop" ? SHOP_COLOUR : PROVIDER_COLOUR,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
              anchor: new google.maps.Point(PIN_ANCHOR.x, PIN_ANCHOR.y),
              labelOrigin: new google.maps.Point(PIN_LABEL_ORIGIN.x, PIN_LABEL_ORIGIN.y),
            }}
            zIndex={selected ? 4 : 2}
          />
        )
      })}

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
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {open.kind === "shop" ? t("nearby.openNow") : t("nearby.online")}
            </p>
            {open.subtitle && <p className="mt-0.5 text-[11px] text-gray-600">{open.subtitle}</p>}
            <p className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
              {open.reviewCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {open.rating.toFixed(1)} ({open.reviewCount})
                </span>
              )}
              {open.distanceKm != null && (
                <span className="font-medium text-blue-700">{t("nearby.distanceAway", { km: open.distanceKm })}</span>
              )}
            </p>
            {/* The reason most people open a map at all. Hands off to the
                phone's own map app, which has their traffic and their saved
                preferences; a route drawn in here would be a worse copy. */}
            <a
              href={"https://www.google.com/maps/dir/?api=1&destination=" + open.latitude + "," + open.longitude}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1.5 text-[11px] font-semibold text-white"
            >
              <Navigation className="h-3 w-3" /> Directions
            </a>
          </div>
        </InfoWindowF>
      )}
      </GoogleMap>

      {/* ---- what the colours mean, and a way back ---------------------
          A legend because two colours of pin with nothing explaining them
          is a puzzle, and recentre because the first thing anyone does on
          a map is pan away from themselves. */}
      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-background/95 px-2.5 py-1.5 shadow-sm backdrop-blur">
          <span className="flex items-center gap-1 text-[10px] font-medium text-foreground">
            <Store className="h-3 w-3" style={{ color: SHOP_COLOUR }} />
            {shopCount} {shopCount === 1 ? "shop" : "shops"}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-foreground">
            <Wrench className="h-3 w-3" style={{ color: PROVIDER_COLOUR }} />
            {proCount} {proCount === 1 ? "pro" : "pros"}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: VIEWER_COLOUR }} />
            you
          </span>
        </div>

        <button
          onClick={recentre}
          aria-label={t("nearby.youAreHere")}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/95 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
