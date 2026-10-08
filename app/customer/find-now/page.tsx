"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft, MapPin, Search, Star, ShieldCheck, Store, Loader2, Radio, RefreshCw, Megaphone,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useGeofence } from "@/lib/hooks/useGeofence"
import { describeTerms, matchScore } from "@/lib/match-description"
import { useLocalization } from "@/lib/hooks/useLocalization"

/**
 * The radius this screen works in. Fixed rather than adjustable on purpose:
 * this is the "someone near me, now" path, and handing the customer a radius
 * control here would turn an instant answer back into the browsing they came
 * here to skip. The Near You section on the home page is where ranges are
 * explored.
 */
const BROADCAST_RADIUS_KM = 5

/** How often the background loop re-pulls. Fast enough that a provider
 *  coming online appears while the customer is still reading the screen,
 *  slow enough not to hammer the database from an idle tab (SWR pauses
 *  polling when the tab is hidden). */
const LOOP_INTERVAL_MS = 10_000

export default function FindNowPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <FindNowContent />
    </Suspense>
  )
}

function FindNowContent() {
  const { t, formatMoney } = useLocalization()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [description, setDescription] = useState(searchParams.get("q") ?? "")
  // What the results are actually ranked against. Separate from the input so
  // the list does not reshuffle under the customer on every keystroke.
  const [query, setQuery] = useState(searchParams.get("q") ?? "")

  const { data, isLoading, hasPreciseCentre, updatedAt, refresh } = useGeofence({
    radiusKm: BROADCAST_RADIUS_KM,
    kinds: ["shops", "providers"],
    // Pull the whole fence rather than a page of it: ranking happens below,
    // and a relevant provider must not be cut off by a distance-ordered
    // limit before the description is ever considered.
    limit: 50,
    refreshIntervalMs: LOOP_INTERVAL_MS,
    // Follow the customer. This is the one screen where they are plausibly
    // walking or driving toward help, and a 5 km circle anchored to where
    // they opened the page goes stale fastest here. The hook only
    // re-centres after 500 m of real movement, so this does not thrash.
    follow: true,
  })

  const terms = useMemo(() => describeTerms(query), [query])

  /** Everything inside the fence, best answer first. */
  const ranked = useMemo(() => {
    const providers = (data?.providers ?? []).map((p) => ({
      kind: "provider" as const,
      key: `p:${p.providerId}`,
      name: p.name,
      avatar: p.avatar,
      href: p.slug ? `/p/${p.slug}` : `/customer/find-specialists?provider=${p.providerId}`,
      subtitle: p.categoryName,
      rating: p.rating,
      reviewCount: p.reviewCount,
      price: p.hourlyRate,
      verified: p.verified,
      isOnline: p.isOnline,
      distanceKm: p.distanceKm,
      positionIsLive: p.positionIsLive,
      score: matchScore(terms, [p.name, p.categoryName]),
    }))
    const shops = (data?.shops ?? []).map((s) => ({
      kind: "shop" as const,
      key: `s:${s.id}`,
      name: s.name,
      avatar: s.image,
      href: `/customer/shops/${s.id}`,
      subtitle: s.category,
      rating: s.rating,
      reviewCount: s.reviewCount,
      price: null as number | null,
      verified: s.isVerified,
      isOnline: false,
      distanceKm: s.distanceKm,
      positionIsLive: false,
      score: matchScore(terms, [s.name, s.category]),
    }))

    return [...providers, ...shops].sort((a, b) => {
      // What the customer described comes first; then whoever is actually
      // online to answer; then nearest. Distance alone would bury the one
      // plumber behind five hardware shops.
      if (b.score !== a.score) return b.score - a.score
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    })
  }, [data, terms])

  const matched = ranked.filter((r) => r.score > 0)
  const others = ranked.filter((r) => r.score === 0)
  const onlineCount = ranked.filter((r) => r.isOnline).length
  const noFence = !isLoading && !data?.fence

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-xl p-2 transition-colors hover:bg-muted lg:hidden">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Radio className="h-4 w-4 text-primary" />
            {t("findNow.title")}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {t("findNow.subtitle", { km: BROADCAST_RADIUS_KM })}
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setQuery(description.trim()) }}
        className="mb-4 flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("findNow.placeholder")}
            className="h-11 rounded-xl pl-9"
          />
        </div>
        <Button type="submit" className="h-11 rounded-xl px-5 font-semibold">
          {t("findNow.cta")}
        </Button>
      </form>

      {/* The loop, stated plainly. A screen that silently refreshes is
          unnerving; one that says it is watching is reassuring. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {t("findNow.live")}
        </span>
        <span>{t("findNow.watching", { count: ranked.length, online: onlineCount })}</span>
        <span>{hasPreciseCentre ? t("nearby.precise") : t("nearby.approximate")}</span>
        {updatedAt && <span>{t("findNow.updatedAt", { time: updatedAt.toLocaleTimeString() })}</span>}
        <button
          type="button"
          onClick={refresh}
          className="ml-auto flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <RefreshCw className="h-3 w-3" />
          {t("findNow.refresh")}
        </button>
      </div>

      {isLoading && ranked.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : noFence ? (
        <Card className="p-8 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t("findNow.noLocation")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("nearby.noOrigin")}</p>
        </Card>
      ) : ranked.length === 0 ? (
        <Card className="p-8 text-center">
          <Store className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t("findNow.emptyTitle", { km: BROADCAST_RADIUS_KM })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("findNow.emptyBody")}</p>
          <BroadcastFallback description={description} />
        </Card>
      ) : (
        <div className="space-y-5">
          {matched.length > 0 && (
            <Section title={t("findNow.matchesTitle", { count: matched.length })} rows={matched} formatMoney={formatMoney} t={t} />
          )}
          {others.length > 0 && (
            <Section
              title={terms.length > 0 ? t("findNow.alsoNearbyTitle") : t("findNow.allNearbyTitle")}
              rows={others}
              formatMoney={formatMoney}
              t={t}
            />
          )}

          {/* Nobody matched the words they typed: the request board reaches
              people who are not online right now, which this screen cannot. */}
          {terms.length > 0 && matched.length === 0 && (
            <Card className="p-5 text-center">
              <p className="text-sm font-medium text-foreground">{t("findNow.noMatchTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("findNow.noMatchBody")}</p>
              <BroadcastFallback description={description} />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

/** Escape hatch to the existing request board, which reaches providers who
 *  are not online right now — the one thing a live radius cannot do. */
function BroadcastFallback({ description }: { description: string }) {
  const { t } = useLocalization()
  return (
    <Link
      href={`/customer/requests${description.trim() ? `?describe=${encodeURIComponent(description.trim())}` : ""}`}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
    >
      <Megaphone className="h-3.5 w-3.5" />
      {t("findNow.postInstead")}
    </Link>
  )
}

type Row = {
  kind: "provider" | "shop"
  key: string
  name: string
  avatar: string | null
  href: string
  subtitle: string | null
  rating: number
  reviewCount: number
  price: number | null
  verified: boolean
  isOnline: boolean
  distanceKm: number | null
  /** Distance came from where they started work today, not a profile
   *  address. Worth distinguishing: one is current, the other may be old. */
  positionIsLive: boolean
  score: number
}

function Section({
  title, rows, formatMoney, t,
}: {
  title: string
  rows: Row[]
  formatMoney: (n: number) => string
  t: (k: never, p?: Record<string, string | number>) => string
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <Link
            key={r.key}
            href={r.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md"
          >
            <div className={`relative h-12 w-12 flex-shrink-0 overflow-hidden bg-muted ${r.kind === "shop" ? "rounded-lg" : "rounded-full"}`}>
              <Image src={r.avatar || "/placeholder.svg"} alt={r.name} fill sizes="48px" className="object-cover" />
              {r.isOnline && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {r.name}
                {r.verified && <ShieldCheck className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-emerald-600" />}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                {r.subtitle && <span className="truncate">{r.subtitle}</span>}
                {r.reviewCount > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {r.rating.toFixed(1)}
                  </span>
                )}
                {r.price != null && r.price > 0 && <span className="font-medium text-foreground">{formatMoney(r.price)}</span>}
              </p>
              <p className="mt-0.5 flex items-center gap-2 text-[11px]">
                {r.distanceKm != null && (
                  <span className="flex items-center gap-0.5 font-medium text-primary">
                    <MapPin className="h-2.5 w-2.5" />
                    {t("nearby.distanceAway" as never, { km: r.distanceKm })}
                  </span>
                )}
                {r.isOnline && <span className="font-medium text-emerald-600">{t("nearby.online" as never)}</span>}
                {r.positionIsLive && (
                  <span className="text-muted-foreground">{t("findNow.fromCurrentArea" as never)}</span>
                )}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
