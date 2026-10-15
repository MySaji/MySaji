"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { MapPin, Star, ShieldCheck, Store, Loader2, Map as MapIcon, List, ChevronRight } from "lucide-react"
import { useGeofence } from "@/frontend/lib/hooks/useGeofence"
import { AUTO_DISCOVERY_RADIUS_KM } from "@/backend/domain/geo"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { NearbyMap } from "@/frontend/components/geo/nearby-map"
import { PresenceBadge } from "@/frontend/components/geo/online-dot"
import { isGoogleMapsConfigured } from "@/backend/services/google-maps"
import type { FencedProvider, FencedShop } from "@/backend/actions/geofence"
import {
  getProvidersServingMyArea, type AreaProvidersResult,
} from "@/backend/actions/providers-serving-area"

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
/** An estate, a ward, a walk. Matches services/proximity.ts. */
const NEIGHBOURHOOD_KM = 2

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

  const providers = data?.providers ?? []

  /**
   * Providers who cover this area but have never been located.
   *
   * Most providers on this platform have no coordinates at all: they signed
   * up, said they work in Nairobi, and never typed an address. A radius can
   * never find them, which is why this row showed shops and almost nobody
   * else. Asked for separately, shown separately, and never given a distance
   * we do not have.
   */
  const [areaPros, setAreaPros] = useState<AreaProvidersResult | null>(null)
  useEffect(() => {
    let alive = true
    getProvidersServingMyArea({ excludeIds: providers.map((p) => p.providerId) })
      .then((r) => { if (alive) setAreaPros(r) })
      .catch(() => {})
    return () => { alive = false }
    // Keyed on the located ids so the exclusion list stays correct as the
    // fence resolves, and not on the array itself, which is new every render.
  }, [providers.map((p) => p.providerId).join(",")])
  if (!isLoading && !data?.fence) return null

  const shops = data?.shops ?? []
  const nothing = !isLoading && providers.length === 0 && shops.length === 0

  /**
   * How far the closest thing actually is.
   *
   * One wide window is searched, which is right: it adapts to how dense the
   * area happens to be. But "near you" over a list whose nearest entry is
   * eleven kilometres away is a claim the page should not make, so the
   * nearest distance decides what is said above the row.
   *
   * Judged on the CLOSEST result rather than the window, because the window
   * is wide on purpose and a shop two streets away sitting at the top of it
   * means the customer does have a local option whatever the window was.
   */
  const distances = [...providers, ...shops]
    .map((r) => (r as { distanceKm?: number | null }).distanceKm)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d))
  const nearestKm = distances.length > 0 ? Math.min(...distances) : null
  const beyondWalking = nearestKm != null && nearestKm > NEIGHBOURHOOD_KM

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

      {/* Nothing in the estate. Said before the row rather than leaving the
          customer to work it out from the distance on each card, because
          somebody expecting a shop round the corner should learn otherwise
          in one sentence. */}
      {!isLoading && beyondWalking && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/20">
          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
            Nothing within {NEIGHBOURHOOD_KM} km of you right now. The closest is about{" "}
            {nearestKm != null && nearestKm < 10 ? nearestKm.toFixed(1) : Math.round(nearestKm ?? 0)} km
            away, so expect a wait or a trip.
          </p>
        </div>
      )}

      {asMap ? (
        // Same rows as the list, so a pin on the map and a card in the
        // list always mean the same thing: this pro is online now, or this
        // shop is open now. A provider's position is only ever on the map
        // while they are online — going offline removes the pin, and the
        // position shown is coarsened to about a kilometre either way.
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
          <p className="mx-auto mt-2 max-w-sm text-xs text-muted-foreground">
            Nobody is available around you at the moment. Browsing everyone will show providers
            and shops further out, who can usually still come to you.
          </p>
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
          {/* Below the located ones, and titled so the difference is obvious:
              these are not "600 m away", they are "covers your area". */}
          {areaPros && areaPros.items.length > 0 && (
            <Row
              title={"Also serving " + areaPros.area}
              href="/customer/find-specialists"
              seeAll={t("nearby.viewAllPros")}
            >
              {areaPros.items.map((p) => <AreaProviderCard key={p.id} provider={p} />)}
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

/**
 * A provider matched by the area they cover rather than by distance.
 *
 * Deliberately says what it knows ("covers Nairobi") and nothing it does
 * not. An earlier draft put "nearby" on these and it was simply untrue: the
 * system has no idea where this person is.
 */
function AreaProviderCard({ provider }: { provider: AreaProvidersResult["items"][number] }) {
  return (
    <Link
      href={provider.slug ? "/p/" + provider.slug : "/customer/find-specialists"}
      className="w-[160px] flex-shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative h-20 w-full bg-muted">
        {provider.image ? (
          <Image src={provider.image} alt="" fill sizes="160px" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Store className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate text-xs font-semibold text-foreground">
          {provider.businessName || provider.name}
        </p>
        {provider.categoryName && (
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{provider.categoryName}</p>
        )}
        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">Covers {provider.servesArea}</span>
        </p>
        {provider.reviewCount > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Star className="h-2.5 w-2.5 flex-shrink-0" />
            {provider.rating.toFixed(1)} ({provider.reviewCount})
          </p>
        )}
      </div>
    </Link>
  )
}
