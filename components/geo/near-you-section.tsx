"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { MapPin, Star, ShieldCheck, Store, Loader2, Map as MapIcon, List } from "lucide-react"
import { useGeofence } from "@/lib/hooks/useGeofence"
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS_KM } from "@/lib/geo"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { NearbyMap } from "@/components/geo/nearby-map"
import { isGoogleMapsConfigured } from "@/lib/google-maps"

/**
 * The home page's "Near you" row.
 *
 * One geofence pull backs the whole section — shops and pros arrive in a
 * single request rather than one per lane (see queryGeofence). The first
 * pull sends no centre at all, so the server fills one in from the
 * request's IP geolocation and this renders real nearby results before the
 * browser has been asked for permission; when a device fix does arrive the
 * hook re-centres and the list re-sorts underneath.
 *
 * Renders nothing at all when there is no fence to query (a visitor whose
 * location we genuinely cannot guess) rather than showing an empty shell.
 */
export function NearYouSection() {
  const { t } = useLocalization()
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  // List stays the default: it works without a Maps key, reads fine on a
  // phone, and is what someone scanning a feed actually wants. The map is
  // for the question a list answers badly — "which direction is all this".
  const [asMap, setAsMap] = useState(false)
  const { data, isLoading, hasPreciseCentre } = useGeofence({
    radiusKm,
    // Open requests are other people's jobs — not something a customer
    // browsing their own home page wants in this row.
    kinds: ["shops", "providers"],
    limit: 8,
  })

  // No fence could be resolved: no IP headers, no saved address, no stored
  // fix. Nothing honest to show, so show nothing.
  if (!isLoading && !data?.fence) return null

  const shops = data?.shops ?? []
  const providers = data?.providers ?? []
  const isEmpty = !isLoading && shops.length === 0 && providers.length === 0

  // Merged and sorted across both kinds rather than rendered as a block of
  // pros followed by a block of shops. Each kind arrives already sorted, so
  // rendering them in sequence produced "2.2, 3.4, 4.5, 2.2, 3.4, 4.5" —
  // correct, but it reads as though the ordering is broken. A row called
  // "Near you" should be nearest-first across everything in it.
  const items: ({ kind: "provider" } & typeof providers[number] | { kind: "shop" } & typeof shops[number])[] = [
    ...providers.map((p) => ({ kind: "provider" as const, ...p })),
    ...shops.map((s) => ({ kind: "shop" as const, ...s })),
  ].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <MapPin className="h-4 w-4 text-primary" />
        <h2 className="text-base font-bold text-foreground">{t("nearby.sectionTitle")}</h2>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {/* Says plainly how good the position is. An IP guess can be tens of
            kilometres out, and presenting that as a precise fix would make
            the distances below look wrong rather than approximate. */}
        <span className="text-[11px] text-muted-foreground">
          {hasPreciseCentre ? t("nearby.precise") : t("nearby.approximate")}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {RADIUS_OPTIONS_KM.map((km) => (
          <button
            key={km}
            type="button"
            onClick={() => setRadiusKm(km)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              radiusKm === km
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-transparent text-muted-foreground hover:border-primary/50"
            }`}
          >
            {km} km
          </button>
        ))}

        {/* Only offered when a map could actually render; without a Maps key
            the toggle would lead to a placeholder. */}
        {isGoogleMapsConfigured() && (
          <div className="ml-auto flex items-center gap-1 rounded-full border border-border p-0.5">
            <button
              type="button"
              onClick={() => setAsMap(false)}
              aria-pressed={!asMap}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !asMap ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3 w-3" />
              {t("nearby.showList")}
            </button>
            <button
              type="button"
              onClick={() => setAsMap(true)}
              aria-pressed={asMap}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                asMap ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapIcon className="h-3 w-3" />
              {t("nearby.showMap")}
            </button>
          </div>
        )}
      </div>

      {asMap ? (
        // Same payload the list renders, so the pins and the cards can
        // never disagree.
        <NearbyMap
          shops={shops}
          providers={providers}
          fence={data?.fence ?? null}
          className="h-[380px] w-full overflow-hidden rounded-xl border border-border"
        />
      ) : isEmpty ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Store className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t("nearby.sectionEmpty", { km: radiusKm })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("nearby.sectionEmptyHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) =>
            item.kind === "provider" ? (
              <Link
                key={`p:${item.providerId}`}
                href={item.slug ? `/p/${item.slug}` : `/customer/find-specialists?provider=${item.providerId}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                    <Image src={item.avatar || "/placeholder.svg"} alt={item.name} fill sizes="40px" className="object-cover" />
                    {item.isOnline && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-bold leading-tight text-foreground">
                      {item.name}
                      {item.verified && <ShieldCheck className="ml-1 inline h-3 w-3 align-[-1px] text-emerald-600" />}
                    </p>
                    {item.categoryName && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.categoryName}</p>
                    )}
                  </div>
                </div>
                <DistanceLine km={item.distanceKm} />
              </Link>
            ) : (
              <Link
                key={`s:${item.id}`}
                href={`/customer/shops/${item.id}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image src={item.image || "/placeholder.svg"} alt={item.name} fill sizes="40px" className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-bold leading-tight text-foreground">
                      {item.name}
                      {item.isVerified && <ShieldCheck className="ml-1 inline h-3 w-3 align-[-1px] text-emerald-600" />}
                    </p>
                    <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                      {item.reviewCount > 0 ? item.rating.toFixed(1) : "—"}
                      {item.category ? ` · ${item.category}` : ""}
                    </span>
                  </div>
                </div>
                <DistanceLine km={item.distanceKm} />
              </Link>
            ),
          )}
        </div>
      )}
    </section>
  )
}

/** The distance is the reason this row is ordered the way it is, so every
 *  card states it rather than leaving the ordering unexplained. */
function DistanceLine({ km }: { km: number | null }) {
  const { t } = useLocalization()
  if (km == null) return null
  return (
    <p className="mt-2 flex items-center gap-0.5 text-[10px] font-medium text-primary">
      <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
      {t("nearby.distanceAway", { km })}
    </p>
  )
}
