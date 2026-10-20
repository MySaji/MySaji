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
  const [paused, setPaused] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getActiveBanners(placement).then((b) => {
      if (cancelled) return
      setIndex(0)
      setBanners(b)
      setIsLoaded(true)
    }).catch(() => { if (!cancelled) { setBanners([]); setIsLoaded(true) } })
    return () => { cancelled = true }
  }, [placement])

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduceMotion(media.matches)
    update(); media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (banners.length < 2 || paused || reduceMotion) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % banners.length), AUTO_ADVANCE_MS)
    return () => clearInterval(timer)
  }, [banners.length, paused, reduceMotion])

  const goTo = (i: number) => setIndex(banners.length ? (i + banners.length) % banners.length : 0)

  return { banners, index, isLoaded, goTo, paused, setPaused }
}
