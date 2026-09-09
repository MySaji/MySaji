"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { OfferCard, type OfferCardData } from "@/components/offers/offer-card"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { PublicOfferListItem } from "@/lib/actions/offers"
import { offerHref } from "@/lib/offer-constants"

// Same wrapper classes the marketplace's other curated rows already use
// (Trending Products, Popular Services): a horizontal-scroll strip on
// mobile that becomes a static grid at sm+.
const CARD_ROW_CLASS =
  "flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 sm:gap-4"

function toOfferCardData(o: PublicOfferListItem): OfferCardData {
  const isRental = o.actionType === "RENT"
  return {
    id: o.offerId,
    href: offerHref(o.actionType, o.offerId),
    title: o.title,
    image: o.image,
    providerName: o.providerName,
    providerAvatar: o.providerAvatar,
    verified: o.verified,
    rating: o.rating,
    reviewCount: o.reviewCount,
    location: o.location,
    // Same badge convention as app/customer/services/more/page.tsx's offer
    // cards, so a customer sees the same "Saji Pro" language wherever an
    // offer shows up.
    tags: [isRental ? "Rental" : "Saji Pro Offer", o.categoryName].filter((tag): tag is string => Boolean(tag)),
    price: o.price,
    priceIsFrom: isRental,
    priceSuffix: isRental ? "/day" : null,
    actionType: o.actionType,
  }
}

/** A titled, "See all"-linked row of provider-created Offers — the same
 * shape as the marketplace's other curated preview rows (Trending Products,
 * Popular Services), reused here so Offers show up next to the regular
 * catalog instead of living only on the /services/more unified search. */
export function OfferFeedRow({
  title,
  seeAllHref,
  offers,
  icon,
}: {
  title: string
  seeAllHref: string
  offers: PublicOfferListItem[]
  icon?: ReactNode
}) {
  const { t } = useLocalization()
  if (offers.length === 0) return null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground sm:text-base">
          {icon}
          {title}
        </h2>
        <Link href={seeAllHref} className="flex items-center gap-0.5 text-xs font-medium text-primary">
          {t("customer.services.viewAll")} <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className={CARD_ROW_CLASS}>
        {offers.map((o) => (
          <div key={o.offerId} className="w-40 flex-shrink-0 sm:w-auto">
            <OfferCard data={toOfferCardData(o)} />
          </div>
        ))}
      </div>
    </div>
  )
}
