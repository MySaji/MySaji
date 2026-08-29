"use client"

import Image from "next/image"
import Link from "next/link"
import { CheckCircle, Clock, Heart, MapPin, Star } from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"
import type { OfferActionType } from "@/lib/offer-constants"

/**
 * The universal marketplace card.
 *
 * SAJI shows the same kind of thing in six different places (services
 * catalogue, the mixed feed, a provider's storefront, rentals, products,
 * search) and until now each one drew its own card at its own size. This is
 * the single card those surfaces share, so a plumber's job, a translator's
 * hourly rate and a generator rental all sit in one grid at one size.
 *
 * ## Sizing
 *
 * The design targets two reference widths:
 *
 *   mobile   179px wide card, 179x150 image, 12px radius, 10-12px padding,
 *            2 columns, 8px column gap, 12px screen side padding
 *   desktop  272px wide card, 272x210 image, 14px radius, 14px padding,
 *            4 columns, 16px column gap
 *
 * Those are targets, not fixed sizes, so nothing here is hard-coded to a
 * pixel width. The numbers instead fall out of the grid, exactly:
 *
 *   at 390px (iPhone 14/15): 390 - 24 padding - 8 gap = 358, / 2 = 179px
 *   at 1136px content width: 1136 - 48 gaps          = 1088, / 4 = 272px
 *
 * Between those two the grid steps 2 -> 3 -> 4 columns and the card simply
 * takes whatever width the column gives it. The image keeps its aspect ratio
 * per breakpoint (179/150 on mobile, 272/210 from lg up) rather than a fixed
 * height, which is what keeps the card near its 300-320px / 380px target
 * height without ever forcing it.
 */

export type OfferCardData = {
  id: string
  href: string
  title: string
  /** Falls back to the provider avatar when an offer has no photo of its own. */
  image: string | null
  /**
   * Who is selling. In a marketplace grid this is the headline and the offer
   * title sits under it, because a customer scanning a row of cards is
   * choosing between providers first. Leave it out on a provider's own
   * storefront, where every card would otherwise repeat the page header: the
   * offer title becomes the headline instead and `subtitle` sits under it.
   */
  providerName?: string | null
  providerAvatar?: string | null
  verified?: boolean
  /** Second line when there is no provider name to show. */
  subtitle?: string | null
  /** Omit both to drop the ratings row, e.g. for offers with no reviews yet. */
  rating?: number | null
  reviewCount?: number | null
  location?: string | null
  /** Category / speciality chips. The card shows two and rolls up the rest. */
  tags?: string[]
  price: number | null
  /** Shows a "From" line above the price, for open-ended pricing. */
  priceIsFrom?: boolean
  /** e.g. "/day" for a rental, "/hr" for hourly work. */
  priceSuffix?: string | null
  /** Services only; hidden on mobile, where there is no room for it. */
  responseTime?: string | null
  /** Drives the pill over the image. Omit for no badge. */
  availabilityLabel?: string | null
  actionType?: OfferActionType | null
}

/**
 * The CTA wording per offer type, which is what tells a customer what tapping
 * actually does: buying a drill is not booking a plumber.
 */
const ACTION_KEY: Record<OfferActionType, TranslationKey> = {
  BOOK: "common.bookNow",
  HIRE: "common.hireNow",
  BUY: "common.buyNow",
  RENT: "common.rentNow",
  QUOTE: "common.requestQuote",
  REQUEST: "common.sendRequest",
}

/**
 * The responsive grid these cards belong in. It lives next to the card
 * because the two are a pair: the card's target widths only come out right
 * inside this column and gap arrangement.
 *
 * Wrap it in a max-w-[1136px] container to land on the 272px desktop target.
 * A wider container simply gives wider cards, which is fine.
 */
export function OfferCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4">
      {children}
    </div>
  )
}

export function OfferCard({
  data,
  isFavorite,
  onToggleFavorite,
}: {
  data: OfferCardData
  isFavorite?: boolean
  /** Omit to hide the heart entirely, e.g. on a provider's own storefront. */
  onToggleFavorite?: (id: string) => void
}) {
  const { t, formatMoney } = useLocalization()
  const image = data.image || data.providerAvatar || "/placeholder.svg"
  const hasRating = data.rating != null
  const tags = data.tags?.filter(Boolean) ?? []
  const shownTags = tags.slice(0, 2)
  const overflow = tags.length - shownTags.length

  return (
    <Link
      href={data.href}
      className="group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-lg lg:rounded-[14px]"
    >
      {/* 179x150 on mobile, 272x210 from lg. Ratios rather than heights, so
          the image scales with whatever width the column actually gives it. */}
      <div className="relative aspect-[179/150] w-full bg-muted lg:aspect-[272/210]">
        <Image
          src={image}
          alt=""
          fill
          // Mirrors the grid: half the viewport at 2 columns, a third at 3,
          // and the fixed 272px target once we are at 4.
          sizes="(min-width: 1024px) 272px, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {onToggleFavorite && (
          <button
            type="button"
            aria-label={isFavorite ? t("customer.products.removeFromWishlist") : t("customer.products.addToWishlist")}
            onClick={(e) => {
              // The whole card is a link, so the heart has to stop the
              // navigation this click would otherwise trigger.
              e.preventDefault()
              e.stopPropagation()
              onToggleFavorite(data.id)
            }}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur-sm transition-transform hover:scale-110 dark:bg-black/60 lg:right-2.5 lg:top-2.5 lg:p-2"
          >
            <Heart className={`h-3.5 w-3.5 lg:h-4 lg:w-4 ${isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
          </button>
        )}

        {data.availabilityLabel && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm lg:bottom-2.5 lg:left-2.5 lg:text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            {data.availabilityLabel}
          </span>
        )}
      </div>

      {/* 10px padding on mobile, 14px from lg, per the spec. */}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5 lg:gap-2 lg:p-3.5">
        <div className="flex items-center gap-2">
          {data.providerName && data.providerAvatar && (
            // Dropped on the narrowest cards: at 179px the avatar costs more
            // width than the provider name can spare.
            <span className="relative hidden h-7 w-7 shrink-0 overflow-hidden rounded-full ring-2 ring-background sm:block lg:h-9 lg:w-9">
              <Image src={data.providerAvatar} alt="" fill sizes="36px" className="object-cover" />
            </span>
          )}
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-xs font-semibold text-foreground lg:text-[15px]">
              {data.providerName || data.title}
            </span>
            {data.verified && <CheckCircle className="h-3 w-3 shrink-0 text-blue-500 lg:h-4 lg:w-4" />}
          </span>
        </div>

        {(data.providerName ? data.title : data.subtitle) && (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground lg:line-clamp-1 lg:text-sm">
            {data.providerName ? data.title : data.subtitle}
          </p>
        )}

        {(hasRating || data.location) && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground lg:gap-2 lg:text-xs">
            {hasRating && (
              <span className="flex shrink-0 items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400 lg:h-3.5 lg:w-3.5" />
                <span className="font-semibold text-foreground">{data.rating!.toFixed(1)}</span>
                <span>({data.reviewCount ?? 0})</span>
              </span>
            )}
            {data.location && (
              <>
                {hasRating && <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-border" aria-hidden="true" />}
                <span className="flex min-w-0 items-center gap-0.5">
                  <MapPin className="h-3 w-3 shrink-0 lg:h-3.5 lg:w-3.5" />
                  <span className="truncate">{data.location}</span>
                </span>
              </>
            )}
          </div>
        )}

        {shownTags.length > 0 && (
          // One row only. A second row of chips is what pushes a 179px card
          // past its height budget, so the rest collapse into a "+N" chip.
          <div className="flex gap-1 overflow-hidden lg:gap-1.5">
            {shownTags.map((tag) => (
              <span key={tag} className="truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary lg:rounded-lg lg:px-2 lg:text-[11px]">
                {tag}
              </span>
            ))}
            {overflow > 0 && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:rounded-lg lg:px-2 lg:text-[11px]">
                +{overflow}
              </span>
            )}
          </div>
        )}

        {/* mt-auto pins the price and button to the bottom, so cards in a row
            line their buttons up even when titles wrap to different heights. */}
        <div className="mt-auto pt-1.5 lg:pt-2">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              {data.priceIsFrom && data.price != null && (
                <p className="text-[10px] leading-none text-muted-foreground lg:text-xs">{t("common.fromPrice")}</p>
              )}
              <p className="truncate text-sm font-bold text-primary lg:text-xl">
                {data.price == null ? t("common.requestQuote") : formatMoney(data.price)}
                {data.price != null && data.priceSuffix && (
                  <span className="text-[10px] font-normal text-muted-foreground lg:text-xs">{data.priceSuffix}</span>
                )}
              </p>
            </div>
            {data.responseTime && (
              // No room for this beside a 179px card's price; it returns at lg
              // where the desktop card has a full 272px row to spend.
              <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground lg:flex">
                <Clock className="h-3.5 w-3.5" />
                {data.responseTime}
              </span>
            )}
          </div>

          <span className="mt-2 flex h-9 w-full items-center justify-center rounded-lg bg-primary px-2 text-[11px] font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90 lg:mt-2.5 lg:h-11 lg:rounded-xl lg:text-sm">
            {data.actionType ? t(ACTION_KEY[data.actionType]) : t("common.viewDetails")}
          </span>
        </div>
      </div>
    </Link>
  )
}
