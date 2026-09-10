"use client"

import { useEffect, useState, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import Link from "next/link"
import NextImage from "next/image"
import {
  Plus, Store, Clock, Users, ChevronRight, MapPin, Loader2, Star, BadgeCheck,
  Wallet, Eye, MessageSquare, CheckCircle2, TrendingUp, Package, ClipboardList,
} from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { useProviderWorkspace } from "@/lib/hooks/useProviderWorkspace"
import { useProCapabilities } from "@/lib/hooks/useProCapabilities"
import { getProDashboardOverview } from "@/lib/actions/provider-pro-dashboard"
import { resolveShopHoursForToday, shopHoursRows, isShopCurrentlyOpen } from "@/lib/format"
import { getProviderDashboardData } from "@/lib/actions/provider-dashboard"
import { getOpenOpportunities, type OpportunityItem } from "@/lib/actions/opportunities"
import { getMyProducts, getMyProductOrders } from "@/lib/actions/provider-products"
import { getProviderAvailability, getMyOnlineStatus, setOnlineStatus, type WeeklySchedule } from "@/lib/actions/provider-availability"
import { getMySubscriptionStatus } from "@/lib/actions/provider-subscription"
import { getProviderClients } from "@/lib/actions/provider-clients"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/lib/swr-utils"
import type { TranslationKey } from "@/lib/i18n"

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

const DAY_SHORT_KEY: Record<(typeof DAY_ORDER)[number], TranslationKey> = {
  monday: "provider.availability.shortMon",
  tuesday: "provider.availability.shortTue",
  wednesday: "provider.availability.shortWed",
  thursday: "provider.availability.shortThu",
  friday: "provider.availability.shortFri",
  saturday: "provider.availability.shortSat",
  sunday: "provider.availability.shortSun",
}

/** "17:30" -> "5:30 PM". Returns the input untouched if it isn't a real
 * HH:MM, so a malformed stored value shows as-is rather than as "NaN". */
function formatTime12h(hhmm: string): string {
  const [rawH, rawM] = (hhmm || "").split(":")
  const h = Number(rawH)
  const m = Number(rawM)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

function dayValue(schedule: WeeklySchedule | undefined, day: (typeof DAY_ORDER)[number], t: Translate): string {
  const d = schedule?.[day]
  if (!d?.enabled || !d.start || !d.end) return t("provider.home.closedLabel")
  return `${formatTime12h(d.start)} – ${formatTime12h(d.end)}`
}

/** Collapses runs of consecutive days that share the same hours into a
 * single "Mon – Sat" row, the way opening-hours signage actually reads,
 * instead of printing seven near-identical lines. */
function groupedHours(schedule: WeeklySchedule | undefined, t: Translate): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  let i = 0
  while (i < DAY_ORDER.length) {
    const value = dayValue(schedule, DAY_ORDER[i], t)
    let j = i
    while (j + 1 < DAY_ORDER.length && dayValue(schedule, DAY_ORDER[j + 1], t) === value) j++
    const label =
      i === j
        ? t(DAY_SHORT_KEY[DAY_ORDER[i]])
        : `${t(DAY_SHORT_KEY[DAY_ORDER[i]])} – ${t(DAY_SHORT_KEY[DAY_ORDER[j]])}`
    rows.push({ label, value })
    i = j + 1
  }
  return rows
}

/** Today's real open/closed state from the same weekly schedule the
 * Availability page edits. JS getDay() is Sunday-first; DAY_ORDER is
 * Monday-first, hence the shift. */
function openState(schedule: WeeklySchedule | undefined): { isOpen: boolean; closesAt: string | null } {
  const now = new Date()
  const today = DAY_ORDER[(now.getDay() + 6) % 7]
  const d = schedule?.[today]
  if (!d?.enabled || !d.start || !d.end) return { isOpen: false, closesAt: null }
  const [sh, sm] = d.start.split(":").map(Number)
  const [eh, em] = d.end.split(":").map(Number)
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return { isOpen: false, closesAt: null }
  const mins = now.getHours() * 60 + now.getMinutes()
  const isOpen = mins >= sh * 60 + sm && mins < eh * 60 + em
  return { isOpen, closesAt: isOpen ? formatTime12h(d.end) : null }
}

const NEW_OPPORTUNITY_WINDOW_MS = 24 * 60 * 60 * 1000

/** getOpenOpportunities already scopes rows to this provider's own
 * category, so every one of them is a category match and there is no real
 * relevance score to show. Recency is something the data actually
 * supports, so "New" means posted in the last 24 hours. */
function isNewOpportunity(createdAt: string): boolean {
  const posted = new Date(createdAt).getTime()
  return Number.isFinite(posted) && Date.now() - posted < NEW_OPPORTUNITY_WINDOW_MS
}

// --- Building blocks -----------------------------------------------------

function SectionHeader({ title, action, href }: { title: string; action?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
      {action && href && (
        <Link href={href} className="flex-shrink-0 text-xs font-semibold text-primary hover:underline">
          {action}
        </Link>
      )}
    </div>
  )
}

function StatTile({
  label,
  value,
  caption,
  href,
  icon: Icon,
}: {
  label: string
  value: string
  caption: string
  href: string
  icon?: ComponentType<{ className?: string }>
}) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md"
    >
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="mt-1 flex items-center gap-1 text-xl font-bold text-foreground">
        {Icon && <Icon className="h-4 w-4 flex-shrink-0 fill-amber-400 text-amber-400" />}
        {value}
      </span>
      <span className="mt-0.5 truncate text-[10px] font-medium text-primary">{caption}</span>
    </Link>
  )
}

// --- Page ----------------------------------------------------------------

export default function ProviderHomePage() {
  const { t, formatMoney } = useLocalization()
  const router = useRouter()
  const { type: workspaceType, isLoading: isWorkspaceLoading } = useProviderWorkspace()
  const { moduleKeys, isLoading: isModulesLoading } = useProCapabilities()

  // Adaptive UI Workspaces: /provider is the shared login landing route for
  // every provider account type (ROLE_HOME_PATH has no DB context to pick a
  // different one at login time), so this page itself routes onward —
  // Business Manager and Field Technician each have their own dedicated
  // home; only a Solo Pro actually stays here.
  useEffect(() => {
    if (isWorkspaceLoading) return
    if (workspaceType === "business_owner") router.replace("/provider/business/dashboard")
    else if (workspaceType === "field_technician") router.replace("/provider/field")
  }, [workspaceType, isWorkspaceLoading, router])

  const { data: pro } = useSWR("pro-overview", () => withTimeout(getProDashboardOverview(), DASHBOARD_FETCH_TIMEOUT_MS))
  const { data: dashboard } = useSWR("provider-dashboard", () => withTimeout(getProviderDashboardData(), DASHBOARD_FETCH_TIMEOUT_MS))
  const { data: opportunities } = useSWR("open-opportunities", () => withTimeout(getOpenOpportunities(), DASHBOARD_FETCH_TIMEOUT_MS))
  const { data: products } = useSWR("my-products", () => withTimeout(getMyProducts(), DASHBOARD_FETCH_TIMEOUT_MS))
  const { data: productOrders } = useSWR("my-product-orders", () => withTimeout(getMyProductOrders(), DASHBOARD_FETCH_TIMEOUT_MS))
  const { data: availability } = useSWR("provider-availability", () => withTimeout(getProviderAvailability(), DASHBOARD_FETCH_TIMEOUT_MS))
  const { data: subscription } = useSWR("my-subscription", () => withTimeout(getMySubscriptionStatus(), DASHBOARD_FETCH_TIMEOUT_MS))
  const { data: clients } = useSWR("provider-clients", () => withTimeout(getProviderClients(), DASHBOARD_FETCH_TIMEOUT_MS))
  const { data: onlineStatus, mutate: mutateOnline } = useSWR(
    "my-online-status", () => withTimeout(getMyOnlineStatus(), DASHBOARD_FETCH_TIMEOUT_MS),
  )

  const [isTogglingOnline, setIsTogglingOnline] = useState(false)

  const isOnline = onlineStatus?.isOnline ?? false

  const toggleOnline = async () => {
    setIsTogglingOnline(true)
    // Optimistic: flip locally, then reconcile against what the server
    // actually stored rather than assuming the write landed.
    await mutateOnline(
      async () => {
        await setOnlineStatus({ isOnline: !isOnline })
        return getMyOnlineStatus()
      },
      { optimisticData: onlineStatus ? { ...onlineStatus, isOnline: !isOnline } : undefined, revalidate: false },
    ).catch(() => {})
    setIsTogglingOnline(false)
  }

  if (isWorkspaceLoading || workspaceType !== "solo") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const schedule = availability?.weeklySchedule
  const providerHours = openState(schedule)

  // The merchant half, when this account runs a shop — carried on the same
  // overview fetch as everything else on this screen.
  const shop = pro?.shop ?? null

  // A shop can keep three sets of hours — Mon-Sat, Sunday, public holidays —
  // while a provider works to a per-day availability schedule. Both feed the
  // same card, so whichever describes this account is what it shows. The
  // open/closed line uses whichever pair applies today; holiday hours are
  // displayed but never decide it, since nothing here knows the calendar.
  const shopHours = (() => {
    if (!shop) return null
    const { openingTime, closingTime } = resolveShopHoursForToday(shop)
    const rows = shopHoursRows(shop, {
      weekday: t("provider.home.hoursWeekday"),
      sunday: t("provider.home.hoursSunday"),
      holiday: t("provider.home.hoursHoliday"),
      closed: t("provider.home.closedLabel"),
    })
    if (!rows.length) return null
    const isOpen = isShopCurrentlyOpen(openingTime, closingTime)
    return {
      isOpen,
      closesAt: isOpen && closingTime ? formatTime12h(closingTime) : null,
      rows,
    }
  })()

  const { isOpen: shopOpen, closesAt } = shopHours ?? providerHours
  const hourRows = shopHours ? shopHours.rows : groupedHours(schedule, t)

  const offerProducts = (products ?? []).filter((p) => p.status === "LIVE")
  const sellingItems = shop
    ? shop.products
    : offerProducts.map((p) => ({ key: p.offerId, title: p.title, image: p.image, price: p.price, inStock: true }))
  const productCount = shop ? shop.productCount : offerProducts.length
  const newOrders = shop ? shop.newOrders : (productOrders ?? []).filter((o) => o.status === "PENDING").length
  const activeOffers = (pro?.offers ?? []).filter((o) => o.status === "LIVE").length

  const repeatClients = (clients ?? []).filter((c) => c.totalJobs > 1).length
  const repeatPct = (clients ?? []).length > 0 ? Math.round((repeatClients / (clients ?? []).length) * 100) : 0

  const shopName = shop?.shopName || pro?.businessName || pro?.name || t("provider.home.myShopFallbackName")
  const shopLogo = shop ? shop.logo : pro?.avatar ?? null
  const shopVerified = shop ? shop.isVerified : Boolean(pro?.isVerified)
  const shopCategory = shop ? shop.categoryName : pro?.categoryName ?? null

  // Quick actions follow what this account actually does. Creating an offer is
  // universal and always leads; the rest are drawn from the account's own
  // modules in preference order and trimmed to four, so a tutor is offered
  // Sessions and Availability rather than "Manage Shop" — a page that would
  // have nothing behind it. An account whose modules haven't loaded yet keeps
  // the previous four, so this never flashes a shorter row on a cold start.
  const candidateActions: { key: string; module: string | null; icon: ComponentType<{ className?: string }>; title: string; sub: string; href: string }[] = [
    { key: "offer", module: null, icon: Plus, title: t("provider.home.createOffer"), sub: t("provider.home.createOfferSub"), href: "/provider/offers/new" },
    { key: "shop", module: "shop", icon: Store, title: t("provider.home.manageShop"), sub: t("provider.home.manageShopSub"), href: "/provider/shop" },
    { key: "rentals", module: "rentals", icon: Package, title: t("provider.home.manageRentals"), sub: t("provider.home.manageRentalsSub"), href: "/provider/rentals" },
    { key: "availability", module: "availability", icon: Clock, title: t("provider.home.availabilityTitle"), sub: t("provider.home.availabilitySub"), href: "/provider/availability" },
    { key: "quotes", module: "quotes", icon: ClipboardList, title: t("provider.home.manageQuotes"), sub: t("provider.home.manageQuotesSub"), href: "/provider/quotes" },
    { key: "team", module: null, icon: Users, title: t("provider.home.manageTeam"), sub: t("provider.home.manageTeamSub"), href: "/provider/team" },
  ]

  const quickActions = (
    isModulesLoading
      ? candidateActions.filter((a) => ["offer", "shop", "availability", "team"].includes(a.key))
      : candidateActions.filter((a) => a.module === null || moduleKeys.has(a.module))
  ).slice(0, 4)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-6 pt-4 lg:max-w-6xl">
        {/* Status + this week's numbers */}
        <section className="rounded-2xl bg-[#0B2E20] p-4 text-white sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Availability */}
            <div className="sm:w-44">
              <button
                type="button"
                onClick={toggleOnline}
                disabled={isTogglingOnline}
                className="flex items-center gap-2 text-sm font-semibold disabled:opacity-60"
                aria-pressed={isOnline}
              >
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${isOnline ? "bg-emerald-400" : "bg-white/40"}`} />
                {isOnline ? t("provider.home.available") : t("provider.home.offline")}
                {isTogglingOnline && <Loader2 className="h-3 w-3 animate-spin" />}
              </button>
              <p className="mt-1 text-[11px] text-white/60">
                {isOnline ? t("provider.home.visibleToCustomers") : t("provider.home.hiddenFromCustomers")}
              </p>
            </div>

            {/* This week */}
            <div className="flex-1 border-white/10 sm:border-l sm:pl-5">
              <p className="mb-2 text-[11px] text-white/60">{t("provider.home.thisWeek")}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="flex items-center gap-1 text-lg font-bold leading-none">
                    <Eye className="h-3.5 w-3.5 text-white/60" />
                    {(pro?.profileViews ?? 0).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[10px] text-white/60">
                    {t("provider.home.viewsLabel")} · {t("provider.home.viewsCaption")}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-lg font-bold leading-none">
                    <MessageSquare className="h-3.5 w-3.5 text-white/60" />
                    {pro?.requests.value ?? 0}
                  </p>
                  <p className="mt-1 text-[10px] text-white/60">{t("provider.home.requestsLabel")}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-lg font-bold leading-none">
                    <CheckCircle2 className="h-3.5 w-3.5 text-white/60" />
                    {pro?.bookings.value ?? 0}
                  </p>
                  <p className="mt-1 text-[10px] text-white/60">{t("provider.home.completedLabel")}</p>
                </div>
              </div>
            </div>

            {/* Earnings */}
            <Link
              href="/provider/wallet"
              className="group flex items-center justify-between gap-3 border-white/10 sm:block sm:w-44 sm:border-l sm:pl-5"
            >
              <div>
                <p className="text-[11px] text-white/60">
                  {t("provider.home.earningsLabel")} · {t("provider.home.thisWeek")}
                </p>
                <p className="mt-1 text-xl font-bold leading-none">{formatMoney(pro?.earnings.value ?? 0)}</p>
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-white/70 group-hover:text-white">
                  {t("provider.home.viewWallet")} <ChevronRight className="h-3 w-3" />
                </p>
              </div>
              <Wallet className="h-5 w-5 flex-shrink-0 text-white/50 sm:hidden" />
            </Link>
          </div>
        </section>

        {/* Primary actions */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickActions.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              className="rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <a.icon className="h-4 w-4 flex-shrink-0 text-primary" />
                <span className="truncate text-sm font-bold text-foreground">{a.title}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground">{a.sub}</p>
            </Link>
          ))}
        </section>

        {/* New opportunities */}
        <section>
          <SectionHeader title={t("provider.home.newOpportunities")} action={t("provider.dashboard.viewAll")} href="/provider/opportunities" />
          {(opportunities ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center">
              <p className="text-xs text-muted-foreground">{t("provider.home.noOpportunities")}</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3">
              {(opportunities ?? []).slice(0, 6).map((o: OpportunityItem) => (
                <div
                  key={o.id}
                  className="flex w-64 flex-shrink-0 flex-col rounded-xl border border-border bg-card p-3 sm:w-auto"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    {isNewOpportunity(o.createdAt) && (
                      <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                        {t("provider.home.newBadge")}
                      </span>
                    )}
                    {o.categoryName && (
                      <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {o.categoryName}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs font-bold leading-tight text-foreground">{o.description}</p>
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{o.location}</span>
                  </p>
                  {o.preferredTime && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{o.preferredTime}</span>
                    </p>
                  )}
                  <Link
                    href="/provider/opportunities"
                    className="mt-3 sm:mt-auto rounded-lg bg-muted py-2 text-center text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/70"
                  >
                    {t("provider.home.viewRespond")}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* My shop */}
        <section>
          <SectionHeader
            title={t("provider.home.myShop")}
            action={t("provider.home.manageShop")}
            href={shop ? "/shopkeeper" : "/provider/shop"}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
              {/* ProviderProfile has no shop-logo column, so this is the
                  provider's own profile image — the only real picture the
                  shop has — falling back to a store glyph when unset. */}
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                {shopLogo ? (
                  <NextImage src={shopLogo} alt={shopName} fill sizes="64px" className="object-cover" />
                ) : (
                  <Store className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground" />
                )}
              </div>

              <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <h3 className="truncate text-sm font-bold text-foreground">{shopName}</h3>
                {shopVerified && (
                  <span className="mt-0.5 inline-flex flex-shrink-0 items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <BadgeCheck className="h-3 w-3" /> {t("provider.home.verifiedBadge")}
                  </span>
                )}
              </div>
              {shopCategory && <p className="mt-1 truncate text-[11px] text-muted-foreground">{shopCategory}</p>}
              <p className="mt-2 flex items-center gap-1.5 text-[11px]">
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${shopOpen ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                <span className={shopOpen ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
                  {shopOpen ? t("provider.home.openNow") : t("provider.home.closedNow")}
                </span>
                {shopOpen && closesAt && (
                  <span className="truncate text-muted-foreground">· {t("provider.home.closesAt", { time: closesAt })}</span>
                )}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("provider.home.productsCount", { count: productCount })} ·{" "}
                {t("provider.home.newOrdersCount", { count: newOrders })}
              </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-bold text-foreground">{t("provider.home.openingHours")}</p>
              <dl className="mt-2 space-y-1">
                {hourRows.map((row) => (
                  // The label is the part allowed to wrap: Swahili's
                  // "Jumatatu - Jumamosi" is long enough to overflow this card
                  // at 320px, while the time itself must stay on one line to
                  // stay readable. `truncate` alone did nothing here — a flex
                  // child needs min-w-0 before it will shrink at all.
                  <div key={row.label} className="flex items-start justify-between gap-3 text-[11px]">
                    <dt className="min-w-0 text-muted-foreground">{row.label}</dt>
                    <dd className="shrink-0 whitespace-nowrap font-medium text-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <Link href={shopHours ? "/shopkeeper/settings" : "/provider/availability"} className="mt-2 inline-flex text-[11px] font-semibold text-primary hover:underline">
                {t("provider.home.editHours")}
              </Link>
            </div>
          </div>
        </section>

        {/* What I'm selling */}
        <section>
          <SectionHeader
            title={t("provider.home.whatImSelling")}
            action={t("provider.home.manageProducts")}
            href={shop ? "/shopkeeper/products" : "/provider/shop"}
          />
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-5">
            {sellingItems.slice(0, 4).map((p) => (
              <Link
                key={p.key}
                href={shop ? "/shopkeeper/products" : "/provider/shop"}
                className="flex w-40 flex-shrink-0 items-center gap-2.5 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-md sm:w-auto"
              >
                <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                  {p.image ? (
                    <NextImage src={p.image} alt={p.title} fill sizes="44px" className="object-cover" />
                  ) : (
                    <Package className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[11px] font-bold leading-tight text-foreground">{p.title}</p>
                  {p.price != null && <p className="mt-0.5 text-[10px] text-muted-foreground">{formatMoney(p.price)}</p>}
                  <span
                    className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      p.inStock
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.inStock ? t("provider.home.inStock") : t("provider.home.outOfStock")}
                  </span>
                </div>
              </Link>
            ))}

            <Link
              href={shop ? "/shopkeeper/products" : "/provider/offers/new"}
              className="flex w-40 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-card p-3 text-center transition-colors hover:border-primary/50 sm:w-auto"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span className="text-[11px] font-semibold text-foreground">{t("provider.home.addProduct")}</span>
            </Link>
          </div>
        </section>

        {/* My activity */}
        <section>
          <SectionHeader title={t("provider.home.myActivity")} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              label={t("provider.home.activeOffers")}
              value={String(activeOffers)}
              caption={t("provider.dashboard.viewAll")}
              href="/provider/offers"
            />
            <StatTile
              label={t("provider.home.newRequests")}
              value={String(pro?.requests.value ?? 0)}
              caption={t("provider.home.respondNow")}
              href="/provider/requests"
            />
            <StatTile
              label={t("provider.dashboard.statActiveJobs")}
              value={String(dashboard?.activeJobs ?? 0)}
              caption={t("provider.home.inProgressLabel")}
              href="/provider/jobs"
            />
            <StatTile
              label={t("provider.home.completedJobs")}
              value={String(dashboard?.completedJobs ?? 0)}
              caption={t("provider.home.viewsCaption")}
              href="/provider/jobs"
            />
            <StatTile
              label={t("provider.home.reviewsLabel")}
              value={(pro?.rating ?? 0).toFixed(1)}
              caption={`(${pro?.reviewCount ?? 0})`}
              href="/provider/profile/ratings"
              icon={Star}
            />
            <StatTile
              label={t("provider.home.repeatCustomers")}
              value={`${repeatPct}%`}
              caption={t("provider.home.viewsCaption")}
              href="/provider/clients"
            />
          </div>
        </section>

        {/* Boost */}
        <section className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/60 dark:bg-violet-950/20">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-violet-950/60">
            <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-foreground">{t("provider.home.boostTitle")}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("provider.home.boostDesc")}</p>
          </div>
          <Link
            href={subscription?.isPro ? "/provider/offers" : "/provider/pro"}
            className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
          >
            {t("provider.home.promoteOffers")} <ChevronRight className="h-3 w-3" />
          </Link>
        </section>
      </div>
    </div>
  )
}
