"use client"

import Image from "next/image"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useActiveBanners } from "@/frontend/lib/hooks/useActiveBanners"

/** Admin-curated promotional carousel — real campaign content managed at
 * /admin/banners, not derived from product/order data. Renders nothing at
 * all (not even a skeleton) when there are no active banners for this
 * placement, so an empty campaign calendar never leaves a broken-looking
 * empty shell on the page. */
export function HeroBannerCarousel({ placement }: { placement: "HOME_HERO" | "SERVICES_TOP" }) {
  const { banners, index, isLoaded, goTo } = useActiveBanners(placement)

  if (!isLoaded || banners.length === 0) return null

  const banner = banners[index]

  const content = (
    <div className="relative aspect-[16/9] sm:aspect-[2.4/1] w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-muted">
      <Image src={banner.imageUrl} alt={banner.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 1200px" priority={index === 0} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <h3 className="text-white font-bold text-base sm:text-xl text-balance">{banner.title}</h3>
        {banner.subtitle && <p className="text-white/85 text-[11px] sm:text-xs mt-1 max-w-md text-balance">{banner.subtitle}</p>}
      </div>
    </div>
  )

  return (
    <div className="relative group">
      {banner.linkUrl ? <Link href={banner.linkUrl}>{content}</Link> : content}

      {banners.length > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            aria-label="Previous banner"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity sm:flex hidden"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            aria-label="Next banner"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity sm:flex hidden"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                onClick={() => goTo(i)}
                aria-label={`Go to banner ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
