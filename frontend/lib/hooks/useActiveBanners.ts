"use client"

import { useEffect, useState } from "react"
import { getActiveBanners, type PublicBanner } from "@/backend/actions/banners"

const AUTO_ADVANCE_MS = 6000

/** Shared fetch + auto-advance logic behind the admin-curated banner
 * carousel — used by both the plain HeroBannerCarousel (Services page) and
 * the richer HomeHeroSection (which needs a fallback when there are no
 * active banners, so it can't just render nothing like HeroBannerCarousel
 * does). */
export function useActiveBanners(placement: "HOME_HERO" | "SERVICES_TOP") {
  const [banners, setBanners] = useState<PublicBanner[]>([])
  const [index, setIndex] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    getActiveBanners(placement).then((b) => {
      setBanners(b)
      setIsLoaded(true)
    })
  }, [placement])

  useEffect(() => {
    if (banners.length < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % banners.length), AUTO_ADVANCE_MS)
    return () => clearInterval(timer)
  }, [banners.length])

  const goTo = (i: number) => setIndex((i + banners.length) % banners.length)

  return { banners, index, isLoaded, goTo }
}
