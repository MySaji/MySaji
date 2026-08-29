"use client"

import { useMemo, useState } from "react"
import { BadgeCheck, GraduationCap, Star, Trophy } from "lucide-react"
import { OfferCard, OfferCardGrid } from "@/components/offers/offer-card"
import type { StorefrontData, StorefrontOffer } from "@/lib/actions/storefront"

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
      <div role="tablist" aria-label="Provider listings" className="flex gap-1 overflow-x-auto border-b dark:border-gray-700 mb-4">
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
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition ${
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
            href: `/customer/offers/${offer.id}`,
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

function Portfolio({ items }: { items: Data["portfolio"] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <figure key={item.id} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.title} className="w-full h-44 object-cover" />
          <figcaption className="p-4">
            <h3 className="font-semibold">{item.title}</h3>
            {item.description && <p className="mt-1 text-sm text-gray-500">{item.description}</p>}
          </figcaption>
        </figure>
      ))}
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
