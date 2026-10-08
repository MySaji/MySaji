"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { MapPin, Star, ShieldCheck, Store, Loader2, Map as MapIcon, List, ChevronRight } from "lucide-react"
import { useGeofence } from "@/lib/hooks/useGeofence"
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS_KM } from "@/lib/geo"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { NearbyMap } from "@/components/geo/nearby-map"
import { PresenceBadge } from "@/components/geo/online-dot"
import { isGoogleMapsConfigured } from "@/lib/google-maps"
import type { FencedProvider, FencedShop } from "@/lib/actions/geofence"

/**
 * The customer home page's "Near you" row.
 *
 * Deliberately shows only what is actually available right now: pros whose
 * device is currently checking in, and shops inside their trading hours.
 * Someone scanning their home page wants help they can get today, and a
 * list padded with offline people and shut shops makes them read every
 * card to find the one that is open. Nothing is lost — the See all links
 * and the browse pages still show everyone, offline and closed included.
 *
 * Both rows come from ONE geofence pull, so the second costs no extra
 * query. The first pull sends no centre, so the server fills one in from
 * the request's IP geolocation and this renders before the browser has
 * been asked for permission.
 */
export function NearYouSection() {
  const { t } = useLocalization()
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [asMap, setAsMap] = useState(false)

  const { data, isLoading, hasPreciseCentre } = useGeofence({
    radiusKm,
    kinds: ["shops", "providers"],
    // Over-fetch, because most of what comes back is filtered out below:
    // a radius holding twenty pros may have two of them online.
    limit: 40,
  })

  // No location at all — permission denied, no saved address, no usable
  // edge geolocation. The rest of the home page is unaffected.
  if (!isLoading && !data?.fence) return null

  // The filter this section exists for. Applied here rather than in the
  // query because the same pull also feeds the map, where a closed shop is
  // still a landmark worth seeing.
  const providers = (data?.providers ?? []).filter((p) => p.isOnline)
  const shops = (data?.shops ?? []).filter((s) => s.isOpen)
  const nothing = !isLoading && providers.length === 0 && shops.length === 0

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <MapPin className="h-4 w-4 text-primary" />
        <h2 className="text-base font-bold text-foreground">{t("nearby.sectionTitle")}</h2>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {/* Says plainly how good the position is. An IP guess can be tens
            of kilometres out, and presenting that as a precise fix would
            make the distances below look wrong rather than approximate. */}
        <span className="text-[11px] text-muted-foreground">
          {hasPreciseCentre ? t("nearby.precise") : t("nearby.approximate")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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

        {isGoogleMapsConfigured() && (
          <div className="ml-auto flex items-center gap-1 rounded-full border border-border p-0.5">
            <ToggleButton active={!asMap} onClick={() => setAsMap(false)} icon={<List className="h-3 w-3" />} label={t("nearby.showList")} />
            <ToggleButton active={asMap} onClick={() => setAsMap(true)} icon={<MapIcon className="h-3 w-3" />} label={t("nearby.showMap")} />
          </div>
        )}
      </div>

      {asMap ? (
        // The map keeps the unfiltered set: hiding closed shops would make
        // the area look emptier than it is.
        <NearbyMap
          shops={data?.shops ?? []}
          providers={data?.providers ?? []}
          fence={data?.fence ?? null}
          className="h-[380px] w-full overflow-hidden rounded-xl border border-border"
        />
      ) : nothing ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Store className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t("nearby.noneAvailable", { km: radiusKm })}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{t("nearby.noneAvailableHint")}</p>
          <Link
            href="/customer/find-specialists"
            className="mt-3 inline-block rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {t("nearby.browseAll")}
          </Link>
        </div>
      ) : (
        <>
          {providers.length > 0 && (
            <Row title={t("nearby.prosTitle")} href="/customer/find-specialists" seeAll={t("nearby.viewAllPros")}>
              {providers.map((p) => <ProviderCard key={p.providerId} provider={p} />)}
            </Row>
          )}
          {shops.length > 0 && (
            <Row title={t("nearby.shopsTitle")} href="/customer/shops" seeAll={t("nearby.viewAllShops")}>
              {shops.map((s) => <ShopCard key={s.id} shop={s} />)}
            </Row>
          )}
        </>
      )}
    </section>
  )
}

function ToggleButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function Row({
  title, href, seeAll, children,
}: { title: string; href: string; seeAll: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <Link href={href} className="flex flex-shrink-0 items-center text-[11px] font-medium text-primary hover:underline">
          {seeAll}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      {/* One column on the narrowest phones so a card never has to squeeze
          a name, a trade, a rating and a distance into half of 320px. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

function ProviderCard({ provider }: { provider: FencedProvider }) {
  const { t, formatMoney } = useLocalization()
  const profileHref = provider.slug
    ? `/p/${provider.slug}`
    : `/customer/find-specialists?provider=${provider.providerId}`

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-muted">
          <Image src={provider.avatar || "/placeholder.svg"} alt={provider.name} fill sizes="44px" className="object-cover" />
        </div>
        {/* min-w-0 plus truncate on each line is what stops a long name or
            a large currency value widening the column and introducing
            horizontal page scroll. */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {provider.name}
            {provider.verified && <ShieldCheck className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-emerald-600" />}
          </p>
          {/* Everyone in this row is online by construction, so the badge
              has no offline wording to fall back to. */}
          <PresenceBadge online labels={{ on: t("nearby.online"), off: t("nearby.online") }} className="mt-0.5" />
          {provider.categoryName && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{provider.categoryName}</p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {provider.reviewCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {provider.rating.toFixed(1)}
              </span>
            )}
            {provider.distanceKm != null && (
              <span className="flex items-center gap-0.5 font-medium text-primary">
                <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                {t("nearby.distanceAway", { km: provider.distanceKm })}
              </span>
            )}
          </div>
          {provider.hourlyRate != null && provider.hourlyRate > 0 && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-foreground">{formatMoney(provider.hourlyRate)}</p>
          )}
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Link
          href={profileHref}
          className="truncate rounded-lg border border-border px-2 py-1.5 text-center text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
        >
          {t("nearby.viewProfile")}
        </Link>
        <Link
          href={`/customer/find-now?q=${encodeURIComponent(provider.categoryName ?? "")}`}
          className="truncate rounded-lg bg-primary px-2 py-1.5 text-center text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("nearby.requestService")}
        </Link>
      </div>
    </div>
  )
}

function ShopCard({ shop }: { shop: FencedShop }) {
  const { t } = useLocalization()

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
          <Image src={shop.image || "/placeholder.svg"} alt={shop.name} fill sizes="44px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {shop.name}
            {shop.isVerified && <ShieldCheck className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-emerald-600" />}
          </p>
          {/* Open comes from the shop's own configured trading hours, never
              from whether the shopkeeper is logged in. */}
          <PresenceBadge online labels={{ on: t("nearby.openNow"), off: t("nearby.openNow") }} className="mt-0.5" />
          {shop.category && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{shop.category}</p>}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {shop.reviewCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {shop.rating.toFixed(1)}
              </span>
            )}
            {shop.distanceKm != null && (
              <span className="flex items-center gap-0.5 font-medium text-primary">
                <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                {t("nearby.distanceAway", { km: shop.distanceKm })}
              </span>
            )}
          </div>
        </div>
      </div>

      <Link
        href={`/customer/shops/${shop.id}`}
        className="mt-2.5 truncate rounded-lg bg-primary px-2 py-1.5 text-center text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("nearby.viewShop")}
      </Link>
    </div>
  )
}
