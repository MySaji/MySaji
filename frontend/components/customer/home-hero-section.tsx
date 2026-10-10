"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Search, MapPin, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { useActiveBanners } from "@/frontend/lib/hooks/useActiveBanners"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import type { HomeServiceCategory } from "@/backend/actions/home"

// Real photo, already verified reachable and visually confirmed (electrician
// installing a fixture) when first used on the public landing page hero —
// reused here as the fallback background for whenever no admin HOME_HERO
// banner is currently active, so the hero never shows a bare gradient.
const FALLBACK_HERO_IMAGE = "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&h=900&fit=crop&q=80"

/** The rich, search-embedded hero for the customer home page — wraps the
 * same admin-curated banner data as HeroBannerCarousel (via the shared
 * useActiveBanners hook) but, unlike that component, never renders nothing:
 * falls back to a static gradient + stock photo + generic copy when there's
 * no active campaign, since the search bar and category shortcuts need to
 * always be reachable here. */
export function HomeHeroSection({ categories, location, compact = false }: { categories: HomeServiceCategory[]; location: string | null; compact?: boolean }) {
  const { t } = useLocalization()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const { banners, index, isLoaded, goTo } = useActiveBanners("HOME_HERO")
  const touchStartX = useRef<number | null>(null)

  // Mobile has no visible prev/next arrows (see below), so swipe is the only
  // way to move between banners there — a 40px threshold avoids mistaking a
  // vertical scroll for a horizontal swipe.
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || banners.length <= 1) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(delta) > 40) goTo(delta < 0 ? index + 1 : index - 1)
    touchStartX.current = null
  }

  // compact=true is the home page's promo-banner strip — the search form
  // and category chips are the dedicated HomeSearchBar/HomeCategoryRow
  // elsewhere on the page, so rendering them again here would just be a
  // second, redundant search box. Unlike before, this now always renders
  // (falling back to a real stock image + generic copy when no admin
  // HOME_HERO campaign is active) instead of disappearing entirely — a
  // marketplace home page should always have a real hero banner up top,
  // the same way Jumia's never goes blank between campaigns.

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const query = searchQuery.trim()
    if (!query) return
    router.push(`/customer/search?q=${encodeURIComponent(query)}`)
  }

  const activeBanner = isLoaded && banners.length > 0 ? banners[index] : null

  const heroImage = activeBanner?.imageUrl ?? FALLBACK_HERO_IMAGE
  const heroTitle = activeBanner?.title ?? t("customer.home.heroFallbackTitle")
  const heroSubtitle = activeBanner?.subtitle ?? t("customer.home.heroFallbackSubtitle")
  const popularCategories = categories.slice(0, 5)

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 ${compact ? "h-48 sm:h-64" : ""}`}
    >
      <Image src={heroImage} alt={heroTitle} fill className="object-cover opacity-90" sizes="(max-width: 1024px) 100vw, 900px" priority />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />

      <div className={`relative ${compact ? "flex h-full flex-col justify-center p-5 sm:p-8" : "p-5 sm:p-8 lg:p-10"}`}>
        <h1 className={`line-clamp-2 font-extrabold tracking-tight text-white text-balance max-w-md ${compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl lg:text-4xl xl:text-5xl"}`}>{heroTitle}</h1>
        <p className="mt-2 line-clamp-2 text-xs sm:text-sm text-white/85 max-w-md text-balance">{heroSubtitle}</p>

        {!compact && (
          <form onSubmit={submitSearch} className="mt-5 sm:mt-6 flex flex-col sm:flex-row gap-2 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("customer.home.aiSearchPlaceholder")}
                className="pl-12 h-12 rounded-xl border-0 bg-white text-foreground shadow-lg"
              />
            </div>
            {location && (
              <Link
                href="/customer/saved-addresses"
                className="hidden sm:flex items-center gap-1.5 px-4 h-12 rounded-xl bg-white text-xs text-foreground shadow-lg whitespace-nowrap hover:bg-white/90 transition-colors"
              >
                <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="truncate max-w-[10rem]">{location}</span>
              </Link>
            )}
            <Button type="submit" size="lg" className="h-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg flex-shrink-0">
              <Search className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">{t("common.search")}</span>
            </Button>
          </form>
        )}

        {!compact && popularCategories.length > 0 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-white/70 font-medium flex-shrink-0">{t("customer.home.popularLabel")}</span>
            {popularCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/customer/services?category=${cat.slug}`}
                className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-[11px] font-medium transition-colors backdrop-blur-sm"
              >
                {cat.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {isLoaded && banners.length > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            aria-label="Previous banner"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white items-center justify-center hidden sm:flex"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            aria-label="Next banner"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white items-center justify-center hidden sm:flex"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                onClick={() => goTo(i)}
                aria-label={`Go to banner ${i + 1}`}
                className="flex items-center justify-center p-2 -m-2"
              >
                <span className={`block h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/50"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
