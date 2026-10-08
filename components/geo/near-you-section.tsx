"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { MapPin, Star, ShieldCheck, Store, Loader2, Map as MapIcon, List, ChevronRight } from "lucide-react"
import { useGeofence } from "@/lib/hooks/useGeofence"
import { AUTO_DISCOVERY_RADIUS_KM } from "@/lib/geo"
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
 * query, and the online/open predicate runs in SQL so the row limit
 * counts results that will actually be shown. The first pull sends no
 * centre, so the server fills one in from the request's IP geolocation
 * and this renders before the browser has been asked for permission.
 */
export function NearYouSection() {
  const { t } = useLocalization()
  const [asMap, setAsMap] = useState(false)

  const { data, isLoading, hasPreciseCentre } = useGeofence({
    // No radius control. The customer did not come to their home page to
    // tune a search; they came to see who is around. One generous window
    // is searched and the nearest available results come back ordered, so
    // the answer adapts to how dense their area happens to be — dense
    // areas fill the row from a few streets, sparse ones reach further —
    // without anyone picking a number. Each card states its own distance,
    // which is the honest version of what a radius chip was implying.
    radiusKm: AUTO_DISCOVERY_RADIUS_KM,
    kinds: ["shops", "providers"],
    // Filtered in SQL, so this counts pros and shops that will actually
    // be shown rather than rows about to be discarded.
    availableOnly: true,
    limit: 8,
  })

  // No location at all — permission denied, no saved address, no usable
  // edge geolocation. The rest of the home page is unaffected.
  if (!isLoading && !data?.fence) return null

  const providers = data?.providers ?? []
  const shops = data?.shops ?? []
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
        <span className="order-last w-full truncate text-[11px] text-muted-foreground sm:order-none sm:w-auto">
          {hasPreciseCentre ? t("nearby.precise") : t("nearby.approximate")}
        </span>

        {isGoogleMapsConfigured() && (
          <div className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-full border border-border p-0.5">
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
          <p className="text-sm font-medium text-foreground">{t("nearby.noneAvailableAuto")}</p>
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
      {/* Horizontal strip on a phone, grid at sm+ — the same shape the
          other browse rows on this page use, so these read as part of the
          system rather than a third style. The negative margin lets the
          strip bleed to the screen edge so a half-visible next card
          signals that it scrolls. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {children}
      </div>
    </div>
  )
}

function ProviderCard({ provider }: { provider: FencedProvider }) {
  const { t, formatMoney } = useLocalization()
  const profileHref = provider.slug
    ? `/p/${provider.slug}`
    : `/customer/find-specialists?provider=${provider.providerId}`

  return (
    <div className="flex w-[82%] max-w-[300px] flex-shrink-0 snap-start flex-col rounded-xl border border-border bg-card p-3 sm:w-auto sm:max-w-none">
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
    <div className="flex w-[82%] max-w-[300px] flex-shrink-0 snap-start flex-col rounded-xl border border-border bg-card p-3 sm:w-auto sm:max-w-none">
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
