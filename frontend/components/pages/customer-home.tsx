"use client"

import { useEffect, useRef, useState, type ComponentType } from "react"
import useSWR from "swr"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuthContext } from "@/frontend/lib/auth-context"
import {
  Search, Mic, MicOff, ChevronRight, Heart, Star, Wrench, ShoppingCart,
  House, Car, GraduationCap, MapPin, SquarePen, Flame, Package, Clock,
  CheckCircle2, AlertCircle, Calendar, ShieldCheck, Radio,
} from "lucide-react"
import { Input } from "@/frontend/components/ui/input"
import { getRecommendedShops, type HomeFeaturedShop } from "@/backend/actions/home"
import { getCustomerJobs, type CustomerJob } from "@/backend/actions/jobs"
import { getRecentOrders, type CustomerOrder } from "@/backend/actions/orders"
import { getPopularOpenRequests, type PopularRequestItem } from "@/backend/actions/requests"
import { getLiveOffers, type PublicOfferListItem } from "@/backend/actions/offers"
import { getWishlistIds, getWishlistedProviders, toggleWishlist, type WishlistedProvider, type WishlistTargetKind } from "@/backend/actions/wishlist"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { NearYouSection } from "@/frontend/components/geo/near-you-section"
import { RequestPhotoButton } from "@/frontend/components/customer/request-photo-button"
import { ProviderStoryRing } from "@/frontend/components/provider-story-ring"
import { getOnlineProviders, type OnlineProviderCard } from "@/backend/actions/specialists"
import { getActiveProviderStories } from "@/backend/actions/provider-stories"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/frontend/lib/swr-utils"
import type { TranslationKey } from "@/backend/domain/i18n"
import { offerHref } from "@/backend/domain/offer-constants"

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

function greetingForHour(hour: number, t: Translate): string {
  if (hour < 12) return t("customer.home.goodMorning")
  if (hour < 17) return t("customer.home.goodAfternoon")
  return t("customer.home.goodEvening")
}

// --- Small shared pieces -------------------------------------------------

function SectionHeader({ title, sub, href }: { title: string; sub?: string; href?: string }) {
  const { t } = useLocalization()
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-bold text-foreground">
        {title}
        {sub && <span className="font-normal text-muted-foreground"> – {sub}</span>}
      </h2>
      {href && (
        <Link href={href} className="flex-shrink-0 text-xs font-semibold text-primary hover:underline">
          {t("customer.home.viewAll")}
        </Link>
      )}
    </div>
  )
}

function RatingLine({ rating, reviewCount, meta }: { rating: number; reviewCount: number; meta?: string | null }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" />
      <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
      <span>({reviewCount})</span>
      {meta && (
        <>
          <span>·</span>
          <span className="truncate">{meta}</span>
        </>
      )}
    </div>
  )
}

function SaveHeart({ saved, onToggle }: { saved: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        onToggle()
      }}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 shadow-sm dark:bg-gray-900/90"
    >
      <Heart className={`h-3.5 w-3.5 ${saved ? "fill-red-500 text-red-500" : "text-gray-600 dark:text-gray-300"}`} />
    </button>
  )
}

/** Horizontal card strip on mobile, a grid at sm+. Shared by all three
 * browse sections so they read as one system rather than three styles. */
const CARD_ROW_CLASS =
  "flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"

// --- Search --------------------------------------------------------------

// Web Speech API's SpeechRecognition isn't in the standard TS DOM lib types,
// and only ships (as the vendor-prefixed webkitSpeechRecognition) in
// Chromium/Safari — Firefox has no implementation at all. Feature-detected
// at mount so the mic simply doesn't render rather than throwing in an
// unsupported browser.
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

/** Shared browser speech-recognition wrapper. Both the search bar and the
 * "Solve a problem" card capture speech the same way and only differ in
 * what they do with the transcript, so the recognizer lifecycle lives here
 * once rather than being duplicated per call site. */
function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null)
  }, [])

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  const toggle = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    const rec = new Ctor()
    rec.lang = "en-US"
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript as string | undefined
      if (transcript) onTranscript(transcript)
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)

    recognitionRef.current = rec
    setIsListening(true)
    rec.start()
  }

  return { supported, isListening, toggle }
}

function HomeSearch() {
  const { t } = useLocalization()
  const router = useRouter()
  const [query, setQuery] = useState("")

  const submitSearch = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    router.push(`/customer/search?q=${encodeURIComponent(trimmed)}`)
  }

  const voice = useVoiceInput((transcript) => {
    setQuery(transcript)
    submitSearch(transcript)
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submitSearch(query)
      }}
      className="relative"
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={voice.isListening ? "Listening…" : t("customer.home.searchAnything")}
        aria-label={t("customer.home.searchAnything")}
        className={`h-12 w-full rounded-xl border border-border bg-card pl-11 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary ${voice.supported ? "pr-20" : "pr-12"}`}
      />
      {/* Camera and mic share the right edge, so the input's padding has to
          account for both — a fixed pr-12 left the camera sitting on the text. */}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-3">
        {voice.supported && (
          <button
            type="button"
            onClick={voice.toggle}
            aria-label={voice.isListening ? "Stop voice search" : "Search by voice"}
            className={`transition-colors ${voice.isListening ? "animate-pulse text-red-500" : "text-muted-foreground hover:text-foreground"}`}
          >
            {voice.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <RequestPhotoButton
          label={t("customer.home.photoSearchLabel")}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        />
      </div>
    </form>
  )
}

// --- Your activity -------------------------------------------------------

function useJobStatusStyle(t: Translate): Record<string, { label: string; className: string; icon: ComponentType<{ className?: string }> }> {
  return {
    PENDING: { label: t("customer.orders.statusPending"), className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
    PENDING_PAYMENT: { label: t("customer.jobs.awaitingPayment"), className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: AlertCircle },
    ACCEPTED: { label: t("customer.jobs.statusScheduled"), className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Calendar },
    IN_PROGRESS: { label: t("customer.home.statusInProgress"), className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Clock },
    COMPLETED: { label: t("customer.jobs.statusCompleted"), className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2 },
    CANCELLED: { label: t("customer.orders.statusCancelled"), className: "bg-muted text-muted-foreground", icon: AlertCircle },
    DISPUTED: { label: t("customer.home.statusDisputed"), className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle },
  }
}

function ActivityRow({
  icon: Icon,
  iconClass,
  title,
  subtitle,
  href,
}: {
  icon: ComponentType<{ className?: string }>
  iconClass: string
  title: string
  subtitle: string
  href: string
}) {
  const { t } = useLocalization()
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Link
        href={href}
        className="flex-shrink-0 rounded-lg bg-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/70"
      >
        {t("customer.home.trackButton")}
      </Link>
    </div>
  )
}

function YourActivitySection({ jobs, orders }: { jobs: CustomerJob[]; orders: CustomerOrder[] }) {
  const { t } = useLocalization()
  const JOB_STATUS_STYLE = useJobStatusStyle(t)

  // Only what's still in flight belongs under "Your activity" — a finished
  // or cancelled job is history, and that lives on /customer/jobs.
  const liveJobs = jobs.filter((j) => !["COMPLETED", "CANCELLED"].includes(j.status)).slice(0, 2)
  const liveOrder = orders.find((o) => !["DELIVERED", "CANCELLED", "REFUNDED"].includes(o.status))

  return (
    <section>
      <Link href="/customer/jobs" className="group mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-foreground">{t("customer.home.yourActivity")}</h2>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
      </Link>

      {liveJobs.length === 0 && !liveOrder ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground">{t("customer.home.noActivityYet")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {liveJobs.map((job) => {
            const status = JOB_STATUS_STYLE[job.status] ?? JOB_STATUS_STYLE.PENDING
            return (
              <ActivityRow
                key={job.id}
                icon={status.icon}
                iconClass="bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
                title={job.title}
                subtitle={`${status.label} · ${job.providerName}`}
                href="/customer/jobs"
              />
            )
          })}
          {liveOrder && (
            <ActivityRow
              icon={Package}
              iconClass="bg-primary/10 text-primary"
              title={liveOrder.itemSummary}
              subtitle={`${liveOrder.shopName} · #${liveOrder.orderNumber}`}
              href="/customer/orders"
            />
          )}
        </div>
      )}
    </section>
  )
}

// --- Quick actions -------------------------------------------------------

function QuickActionsSection() {
  const { t } = useLocalization()
  const actions: { key: string; icon: ComponentType<{ className?: string }>; label: string; sub: string; href: string; tint: string; fg: string }[] = [
    { key: "shop", icon: ShoppingCart, label: t("customer.home.qaShop"), sub: t("customer.home.qaShopSub"), href: "/customer/shops", tint: "bg-emerald-50 dark:bg-emerald-950/30", fg: "text-emerald-600 dark:text-emerald-400" },
    { key: "solve", icon: Wrench, label: t("customer.home.qaSolve"), sub: t("customer.home.qaSolveSub"), href: "/customer/services", tint: "bg-sky-50 dark:bg-sky-950/30", fg: "text-sky-600 dark:text-sky-400" },
    { key: "space", icon: House, label: t("customer.home.qaSpace"), sub: t("customer.home.qaSpaceSub"), href: "/customer/services?search=house", tint: "bg-orange-50 dark:bg-orange-950/30", fg: "text-orange-500 dark:text-orange-400" },
    { key: "rent", icon: Car, label: t("customer.home.qaRent"), sub: t("customer.home.qaRentSub"), href: "/customer/services/more?type=rental", tint: "bg-violet-50 dark:bg-violet-950/30", fg: "text-violet-600 dark:text-violet-400" },
    { key: "learn", icon: GraduationCap, label: t("customer.home.qaLearn"), sub: t("customer.home.qaLearnSub"), href: "/customer/services?search=tutor", tint: "bg-teal-50 dark:bg-teal-950/30", fg: "text-teal-700 dark:text-teal-400" },
    { key: "nearby", icon: MapPin, label: t("customer.home.qaNearby"), sub: t("customer.home.qaNearbySub"), href: "/customer/find-specialists", tint: "bg-rose-50 dark:bg-rose-950/30", fg: "text-rose-500 dark:text-rose-400" },
  ]

  return (
    <section>
      <SectionHeader title={t("customer.home.quickActionsTitle")} href="/customer/services" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {actions.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className={`${a.tint} flex flex-col items-center gap-1 rounded-xl border border-border/60 p-3 text-center transition-colors hover:border-border`}
          >
            <a.icon className={`h-5 w-5 ${a.fg}`} />
            <span className="text-xs font-bold text-foreground">{a.label}</span>
            <span className="text-[10px] leading-tight text-muted-foreground">{a.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// --- Solve a problem -----------------------------------------------------

function SolveAProblemSection() {
  const { t } = useLocalization()
  const router = useRouter()
  const [described, setDescribed] = useState("")

  /** Straight to the live 5 km view, skipping the browse-and-compose path.
   *  The request board is still one tap away from there, for the case the
   *  radius cannot answer: nobody online nearby who does this work. */
  const findNow = (text: string) => {
    const q = text.trim()
    router.push(`/customer/find-now${q ? `?q=${encodeURIComponent(q)}` : ""}`)
  }

  // Speaking the problem now goes the same way as typing it, rather than
  // landing in the composer — the spoken case is the one most likely to be
  // urgent, so it should reach people fastest.
  const voice = useVoiceInput((transcript) => findNow(transcript))

  return (
    <section className="flex items-center gap-4 rounded-xl border border-border bg-muted/50 p-4 dark:bg-muted/20">
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold text-foreground">{t("customer.home.solveAProblem")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("customer.home.solveProblemDesc")}</p>

        <form
          onSubmit={(e) => { e.preventDefault(); findNow(described) }}
          className="mt-3 flex flex-col gap-2 sm:flex-row"
        >
          <Input
            value={described}
            onChange={(e) => setDescribed(e.target.value)}
            placeholder={t("findNow.placeholder")}
            className="h-9 flex-1 rounded-lg bg-card text-xs"
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Radio className="h-3.5 w-3.5" />
            {t("findNow.cta")}
          </button>
        </form>

        {/* The old path, kept as the secondary option rather than removed:
            posting reaches people who are not online right now, which the
            live radius cannot. */}
        <Link href="/customer/requests" className="mt-2 inline-block text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline">
          {t("customer.home.describeNow")}
        </Link>
      </div>

      {/* The card's own copy promises "speak or take a photo", so both are
          offered here. Where speech recognition is missing the camera still
          stands on its own rather than falling back to decoration. */}
      <div className="flex flex-shrink-0 flex-col gap-2">
        {voice.supported && (
          <button
            type="button"
            onClick={voice.toggle}
            aria-label={voice.isListening ? "Stop describing by voice" : "Describe your problem by voice"}
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-md transition-colors ${
              voice.isListening ? "animate-pulse bg-red-500 text-white" : "bg-card text-foreground hover:bg-card/80"
            }`}
          >
            {voice.isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
        <RequestPhotoButton
          label={t("customer.home.photoProblemLabel")}
          iconClassName="h-5 w-5"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-foreground shadow-md transition-colors hover:bg-card/80 disabled:opacity-60"
        />
      </div>
    </section>
  )
}

// --- Post board ----------------------------------------------------------

function PostBoardSection({ popular }: { popular: PopularRequestItem[] }) {
  const { t } = useLocalization()
  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/60 dark:bg-violet-950/20">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-violet-950/60">
            <SquarePen className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-foreground">{t("customer.home.postBoardTitle")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("customer.home.postBoardDesc")}</p>
            <Link
              href="/customer/requests"
              className="mt-3 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
            >
              {t("customer.home.postRequestButton")}
            </Link>
          </div>
        </div>

        {popular.length > 0 && (
          <Link
            href="/customer/requests"
            className="flex items-center gap-2 sm:w-64 sm:flex-shrink-0 sm:border-l sm:border-violet-200 sm:pl-4 dark:sm:border-violet-900/60"
          >
            <div className="min-w-0 flex-1">
              <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-500">
                <Flame className="h-3 w-3 flex-shrink-0" /> {t("customer.home.popularRequests")}
              </p>
              <ul className="space-y-2">
                {popular.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-foreground">{r.title}</span>
                    <span className="flex-shrink-0 text-muted-foreground">
                      {t("customer.home.responsesCount", { count: r.responseCount })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </Link>
        )}
      </div>
    </section>
  )
}

// --- Shop local ----------------------------------------------------------

function ShopLocalSection({
  shops,
  savedShopIds,
  onToggleSaved,
}: {
  shops: HomeFeaturedShop[]
  savedShopIds: string[]
  onToggleSaved: (shopId: string) => void
}) {
  const { t } = useLocalization()
  if (shops.length === 0) return null

  return (
    <section>
      <SectionHeader title={t("customer.home.shopLocalTitle")} sub={t("customer.home.shopLocalSub")} href="/customer/shops" />
      <div className={CARD_ROW_CLASS}>
        {shops.map((shop) => (
          <Link
            key={shop.id}
            href={`/customer/shops/${shop.id}`}
            className="w-40 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md sm:w-auto"
          >
            <div className="relative h-20 bg-muted">
              <Image src={shop.image || "/placeholder.svg"} alt={shop.name} fill sizes="160px" className="object-cover" />
              <SaveHeart saved={savedShopIds.includes(shop.id)} onToggle={() => onToggleSaved(shop.id)} />
            </div>
            <div className="p-2.5">
              <div className="flex items-start justify-between gap-1">
                <p className="truncate text-xs font-bold leading-tight text-foreground">{shop.name}</p>
                {shop.isOpen && (
                  <span className="flex-shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    {t("customer.home.openBadge")}
                  </span>
                )}
              </div>
              {shop.category && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{shop.category}</p>}
              <div className="mt-1.5">
                <RatingLine
                  rating={shop.rating}
                  reviewCount={shop.reviews}
                  meta={shop.distanceKm != null ? `${shop.distanceKm} km` : shop.hoursLabel}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

// --- Recommended ---------------------------------------------------------

function RecommendedSection({
  offers,
  wishlistIds,
  onToggleWishlist,
}: {
  offers: PublicOfferListItem[]
  wishlistIds: string[]
  onToggleWishlist: (providerId: string) => void
}) {
  const { t, formatMoney } = useLocalization()
  if (offers.length === 0) return null

  return (
    <section>
      <SectionHeader title={t("customer.home.recommendedForYou")} href="/customer/services/more?type=offer" />
      <div className={CARD_ROW_CLASS}>
        {offers.map((offer) => {
          const isRental = offer.actionType === "RENT"
          const isWishlisted = wishlistIds.includes(offer.providerId)
          return (
            <Link
              key={offer.offerId}
              href={offerHref(offer.actionType, offer.offerId)}
              className="w-40 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md sm:w-auto"
            >
              <div className="relative h-20 bg-muted">
                <Image src={offer.image || "/placeholder.svg"} alt={offer.title} fill sizes="160px" className="object-cover" />
                <SaveHeart saved={isWishlisted} onToggle={() => onToggleWishlist(offer.providerId)} />
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-bold leading-tight text-foreground">{offer.title}</p>
                {offer.price != null && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {isRental ? "From " : ""}
                    <span className="font-semibold text-foreground">{formatMoney(offer.price)}</span>
                    {isRental ? "/day" : ""}
                  </p>
                )}
                <div className="mt-1.5">
                  <RatingLine rating={offer.rating} reviewCount={offer.reviewCount} meta={offer.location} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// --- Saved for later -----------------------------------------------------

function SavedForLaterSection({ providers }: { providers: WishlistedProvider[] }) {
  const { t } = useLocalization()
  if (providers.length === 0) return null

  return (
    <section>
      <SectionHeader title={t("customer.home.savedForLater")} href="/customer/favorites" />
      <div className={CARD_ROW_CLASS}>
        {providers.map((p) => (
          <Link
            key={p.id}
            href={`/customer/find-specialists?provider=${p.id}`}
            className="flex w-40 flex-shrink-0 items-center gap-2.5 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-md sm:w-auto"
          >
            <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image src={p.avatar || "/placeholder.svg"} alt={p.name} fill sizes="44px" className="object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Heart className="h-3.5 w-3.5 fill-white text-white" />
              </span>
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-[11px] font-bold leading-tight text-foreground">{p.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{p.bio || `${p.completedJobs} jobs done`}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/**
 * Providers who have switched themselves on right now.
 *
 * Sits at the very bottom of the dashboard on purpose: it is the most
 * time-sensitive strip on the page but also the emptiest — most of the day
 * nobody is online, and an empty band high up would push everything the
 * customer actually came for below the fold. Renders nothing at all when the
 * list is empty rather than an empty-state placeholder.
 */
function AvailableNowSection({ providers }: { providers: OnlineProviderCard[] }) {
  const { t, formatMoney } = useLocalization()
  if (providers.length === 0) return null

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <h2 className="text-base font-bold text-foreground">{t("customer.home.availableNowTitle")}</h2>
        <span className="text-xs text-muted-foreground">{t("customer.home.availableNowCount", { count: providers.length })}</span>
      </div>

      {/* Two per row on the smallest phone, widening with the screen — these
          are people, so each card needs room for a face, a name and a trade
          rather than being squeezed into the narrow scrolling rail the
          product strips above use. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {providers.map((p) => (
          <Link
            key={p.providerId}
            href={p.slug ? `/p/${p.slug}` : `/customer/find-specialists?provider=${p.providerId}`}
            className="group flex flex-col rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-2.5">
              <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                <Image src={p.avatar || "/placeholder.svg"} alt={p.name} fill sizes="44px" className="object-cover" />
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
              </div>
              <div className="min-w-0 flex-1">
                {/* Wraps to two lines rather than truncating: at two cards
                    per phone screen a name has ~85px beside the avatar, which
                    cut most real business names to a few letters. The badge is
                    inline so it follows the last word instead of being pinned
                    away from the name it belongs to. */}
                <p className="line-clamp-2 text-xs font-bold leading-tight text-foreground">
                  {p.name}
                  {p.verified && <ShieldCheck className="ml-1 inline h-3 w-3 align-[-1px] text-emerald-600" />}
                </p>
                {p.categoryName && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{p.categoryName}</p>}
                {/* The row is ordered by this, so showing it is what makes
                    the ordering legible rather than arbitrary. */}
                {p.distanceKm != null && (
                  <p className="mt-0.5 flex items-center gap-0.5 truncate text-[10px] font-medium text-primary">
                    <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                    {t("nearby.distanceAway", { km: p.distanceKm })}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              {/* A rating of 0 from no reviews reads as a bad rating, so a new
                  provider shows their job count instead. */}
              {p.reviewCount > 0 ? (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-foreground">{p.rating.toFixed(1)}</span> ({p.reviewCount})
                </span>
              ) : (
                <span>{t("customer.home.availableNowJobs", { count: p.completedJobs })}</span>
              )}
              {p.hourlyRate != null && p.hourlyRate > 0 && (
                <span className="truncate font-semibold text-foreground">{formatMoney(p.hourlyRate)}</span>
              )}
            </div>

            <span className="mt-2.5 rounded-lg bg-primary py-1.5 text-center text-[11px] font-semibold text-primary-foreground transition-opacity group-hover:opacity-90">
              {t("customer.home.availableNowCta")}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// --- Page ----------------------------------------------------------------

export function CustomerHome() {
  const { t } = useLocalization()
  const { user } = useAuthContext()
  const [greeting] = useState(() => greetingForHour(new Date().getHours(), t))

  // One SWR key per real data source: requests dedupe across components,
  // navigating back to Home renders the last-known data instantly while a
  // fresh fetch happens behind it, and each section paints as soon as its
  // own query lands rather than waiting on the slowest one.
  const { data: recentJobs } = useSWR(
    "customer-jobs", () => withTimeout(getCustomerJobs(), DASHBOARD_FETCH_TIMEOUT_MS),
  )
  const { data: recentOrders } = useSWR(
    "recent-orders", () => withTimeout(getRecentOrders(), DASHBOARD_FETCH_TIMEOUT_MS),
  )
  const { data: featuredShops } = useSWR(
    "recommended-shops", () => withTimeout(getRecommendedShops(), DASHBOARD_FETCH_TIMEOUT_MS),
  )
  const { data: liveOffers } = useSWR(
    // 10 matches what RecommendedSection actually renders below, so the
    // feed never pays to transfer offers it will discard.
    "live-offers", () => withTimeout(getLiveOffers(10), DASHBOARD_FETCH_TIMEOUT_MS),
  )
  const { data: popularRequests } = useSWR(
    "popular-requests", () => withTimeout(getPopularOpenRequests(3), DASHBOARD_FETCH_TIMEOUT_MS),
  )
  const { data: savedProviders } = useSWR(
    "wishlisted-providers", () => withTimeout(getWishlistedProviders(), DASHBOARD_FETCH_TIMEOUT_MS),
  )
  // Providers' before/after statuses, as a row of rings under the search bar.
  // Same SWR key the Community page uses, so the two surfaces dedupe into one
  // request and stay in step. The refresh interval matters here in a way it
  // does not for the other sections: these expire 24h after posting, and the
  // ring should empty itself on a tab left open rather than offering a story
  // that has already gone.
  // Deliberately NOT wrapped in withTimeout like the sections above. This page
  // fires half a dozen actions at once, and against a database in another
  // region the stories call regularly lost that race and was cut off at 25s —
  // leaving the ring permanently empty here while the same action rendered
  // fine on Community, which does not impose a deadline. A ring that appears a
  // beat late is strictly better than one that never appears, and nothing else
  // on the page waits for it. Same SWR key as Community so the two surfaces
  // dedupe into one request.
  const { data: storyGroups } = useSWR(
    "provider-stories", getActiveProviderStories, { refreshInterval: 60_000 },
  )
  // Who is online changes minute to minute, so this refreshes on its own
  // rather than showing whoever happened to be on when the page loaded.
  // Not wrapped in withTimeout for the same reason the stories aren't: this
  // page fires several actions at once and a deadline only turns a slow
  // section into a permanently missing one.
  const { data: onlineProviders } = useSWR(
    "online-providers", () => getOnlineProviders(8), { refreshInterval: 60_000 },
  )

  // Providers and shops are separate wishlist target kinds, so they need
  // their own id sets — a shop and a provider can share neither table nor
  // id space.
  const [wishlistIds, setWishlistIds] = useState<string[]>([])
  const [savedShopIds, setSavedShopIds] = useState<string[]>([])

  useEffect(() => {
    getWishlistIds("PROVIDER").then(setWishlistIds).catch(() => {})
    getWishlistIds("SHOP").then(setSavedShopIds).catch(() => {})
  }, [])

  const makeToggle = (
    targetType: WishlistTargetKind,
    setIds: (updater: (prev: string[]) => string[]) => void,
  ) => async (targetId: string) => {
    const flip = (prev: string[]) =>
      prev.includes(targetId) ? prev.filter((id) => id !== targetId) : [...prev, targetId]
    setIds(flip)
    // Optimistic; flipping twice restores the original set on failure.
    const result = await toggleWishlist({ targetType, targetId })
    if (!result.success) setIds(flip)
  }

  const toggleFavorite = makeToggle("PROVIDER", setWishlistIds)
  const toggleSavedShop = makeToggle("SHOP", setSavedShopIds)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-6 pt-4 lg:max-w-5xl">
        {/* Greeting */}
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {greeting}, {user?.name?.split(" ")[0] || t("customer.home.thereFallback")} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("customer.home.whatDoYouNeed")}</p>
        </div>

        <HomeSearch />

        <ProviderStoryRing groups={storyGroups ?? []} />

        <YourActivitySection jobs={recentJobs ?? []} orders={recentOrders ?? []} />

        <QuickActionsSection />

        {/* Placed high: this is the row that answers "who is near me", and
            it is backed by a single geofence pull rather than a query per
            lane. It renders itself away when no location can be resolved. */}
        <NearYouSection />

        <SolveAProblemSection />

        <PostBoardSection popular={popularRequests ?? []} />

        <ShopLocalSection
          shops={featuredShops ?? []}
          savedShopIds={savedShopIds}
          onToggleSaved={toggleSavedShop}
        />

        <RecommendedSection
          offers={(liveOffers ?? []).slice(0, 10)}
          wishlistIds={wishlistIds}
          onToggleWishlist={toggleFavorite}
        />

        <SavedForLaterSection providers={savedProviders ?? []} />

        <AvailableNowSection providers={onlineProviders ?? []} />
      </div>
    </div>
  )
}
