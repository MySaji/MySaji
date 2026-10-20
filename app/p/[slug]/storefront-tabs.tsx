"use client"

import { useEffect, useMemo, useState } from "react"
import { BadgeCheck, ChevronLeft, ChevronRight, GraduationCap, Play, Star, Trophy, X } from "lucide-react"
import { OfferCard, OfferCardGrid } from "@/frontend/components/offers/offer-card"
import type { StorefrontData, StorefrontOffer } from "@/backend/actions/storefront"
import { offerHref } from "@/backend/domain/offer-constants"

/**
 * Storefront tabs. Only tabs with content are rendered, so a translator with
 * no products never sees an empty Products tab and a plumber with no portfolio
 * never sees an empty Portfolio one.
 */

type Data = NonNullable<StorefrontData>

export default function StorefrontTabs({ data }: { data: Data }) {
  const tabs = useMemo(() => {
    const all = [
      { id: "services", label: "Services", count: data.services.length },
      { id: "products", label: "Products", count: data.products.length },
      { id: "rentals", label: "Rentals", count: data.rentals.length },
      { id: "portfolio", label: "Portfolio", count: data.portfolio.length },
      { id: "reviews", label: "Reviews", count: data.reviews.length },
      {
        id: "credentials",
        label: "Credentials",
        count: data.credentials.length + data.education.length + data.awards.length,
      },
    ]
    return all.filter((t) => t.count > 0)
  }, [data])

  const [active, setActive] = useState(tabs[0]?.id ?? "")

  if (tabs.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border dark:border-gray-700 text-center text-gray-500">
        This provider hasn&apos;t published anything yet.
      </div>
    )
  }

  return (
    <div>
      {/* Bleeds to the screen edge on mobile so a half-cut tab reads as
          "scroll me" rather than as a clipped layout. */}
      <div role="tablist" aria-label="Provider listings" className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b px-4 scrollbar-hide dark:border-gray-700 sm:mx-0 sm:px-0">
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:px-4 ${
                selected
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-gray-400">{tab.count}</span>
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === "services" && <OfferGrid offers={data.services} />}
        {active === "products" && <OfferGrid offers={data.products} />}
        {active === "rentals" && <OfferGrid offers={data.rentals} />}
        {active === "portfolio" && <Portfolio items={data.portfolio} />}
        {active === "reviews" && <Reviews reviews={data.reviews} />}
        {active === "credentials" && <Credentials data={data} />}
      </div>
    </div>
  )
}

function OfferGrid({ offers }: { offers: StorefrontOffer[] }) {
  return (
    <OfferCardGrid>
      {offers.map((offer) => (
        <OfferCard
          key={offer.id}
          data={{
            id: offer.id,
            href: offerHref(offer.actionType, offer.id),
            title: offer.title,
            subtitle: offer.description,
            image: offer.image,
            // No provider line: every card here belongs to the provider whose
            // name is already in the header above, so the offer title takes
            // the headline slot instead of repeating it on every card.
            price: offer.price,
            priceIsFrom: offer.pricingModel === "STARTING_FROM",
            priceSuffix: offer.unitLabel ? ` / ${offer.unitLabel}` : null,
            actionType: offer.actionType,
          }}
        />
      ))}
    </OfferCardGrid>
  )
}

/**
 * The provider's work samples.
 *
 * Every tile opens full-screen: the grid thumbnail is far too small to judge a
 * finished job by, and a sample that has a video was previously showing only
 * its cover photo — the video never rendered anywhere on the public profile at
 * all. Two columns from the smallest phone up, because one giant tile per row
 * turns four samples into a lot of scrolling.
 */
function Portfolio({ items }: { items: Data["portfolio"] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const open = openIndex === null ? null : items[openIndex] ?? null

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="group overflow-hidden rounded-xl border bg-white text-left transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-gray-700 dark:bg-gray-800"
          >
            <span className="relative block aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-900">
              {/* Images use the configured unoptimized rendering policy */}
              <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              {item.videoUrl && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                  <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" /> Video
                </span>
              )}
            </span>
            <span className="block p-3">
              <span className="block text-sm font-semibold leading-snug">{item.title}</span>
              {item.description && (
                <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{item.description}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {open && (
        <PortfolioLightbox
          item={open}
          hasPrev={openIndex! > 0}
          hasNext={openIndex! < items.length - 1}
          onPrev={() => setOpenIndex((i) => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setOpenIndex((i) => Math.min(items.length - 1, (i ?? 0) + 1))}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  )
}

/**
 * Full-screen viewer for one sample. Plain fixed overlay rather than a dialog
 * component because this page is server-rendered for search engines and has no
 * dialog provider mounted.
 */
function PortfolioLightbox({
  item, hasPrev, hasNext, onPrev, onNext, onClose,
}: {
  item: Data["portfolio"][number]
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}) {
  // Escape closes, arrows page — a gallery that traps you until you find the
  // small X is worse than no gallery.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && hasPrev) onPrev()
      if (e.key === "ArrowRight" && hasNext) onNext()
    }
    document.addEventListener("keydown", onKey)
    // Stop the page behind scrolling under the overlay on touch devices.
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [hasPrev, hasNext, onPrev, onNext, onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onClick={onClose}
    >
      <div className="flex flex-shrink-0 items-center justify-between gap-3 p-4 text-white">
        <p className="min-w-0 truncate text-sm font-semibold">{item.title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Clicks inside the media area must not fall through to the backdrop. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        {item.videoUrl ? (
          <video src={item.videoUrl} poster={item.imageUrl} controls autoPlay playsInline className="max-h-full w-full max-w-3xl rounded-xl" />
        ) : (
          /* Images use the configured unoptimized rendering policy */
          <img src={item.imageUrl} alt={item.title} className="max-h-full w-full max-w-3xl rounded-xl object-contain" />
        )}
      </div>

      <div className="flex-shrink-0 p-4 text-white" onClick={(e) => e.stopPropagation()}>
        {item.description && (
          <p className="mx-auto mb-3 max-w-3xl whitespace-pre-line text-xs leading-relaxed text-white/80">{item.description}</p>
        )}
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-4 py-2 text-xs font-medium disabled:opacity-30 enabled:hover:bg-white/20"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-4 py-2 text-xs font-medium disabled:opacity-30 enabled:hover:bg-white/20"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function Reviews({ reviews }: { reviews: Data["reviews"] }) {
  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border dark:border-gray-700">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{review.authorName}</span>
            <span className="inline-flex items-center gap-0.5" aria-label={`${review.rating} out of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  aria-hidden="true"
                  className={`w-3.5 h-3.5 ${i < review.rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`}
                />
              ))}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{review.comment}</p>
          <time dateTime={review.createdAt} className="mt-2 block text-xs text-gray-400">
            {new Date(review.createdAt).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}
          </time>
        </li>
      ))}
    </ul>
  )
}

function Credentials({ data }: { data: Data }) {
  return (
    <div className="space-y-4">
      {data.credentials.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border dark:border-gray-700">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <BadgeCheck className="w-4 h-4 text-blue-600" aria-hidden="true" /> Verified credentials
          </h3>
          <ul className="space-y-2">
            {data.credentials.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="text-gray-500">{c.issuer}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.education.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border dark:border-gray-700">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4" aria-hidden="true" /> Education
          </h3>
          <ul className="space-y-2">
            {data.education.map((e, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{e.qualification || e.institution}</span>
                {e.qualification && e.institution && <span className="text-gray-500"> · {e.institution}</span>}
                {e.year && <span className="text-gray-400"> · {e.year}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.awards.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border dark:border-gray-700">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4" aria-hidden="true" /> Awards
          </h3>
          <ul className="space-y-2">
            {data.awards.map((a, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{a.title}</span>
                {a.issuer && <span className="text-gray-500"> · {a.issuer}</span>}
                {a.year && <span className="text-gray-400"> · {a.year}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
