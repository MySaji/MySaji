"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { BadgeCheck, GraduationCap, Star, Trophy } from "lucide-react"
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

const ACTION_LABEL: Record<StorefrontOffer["actionType"], string> = {
  BOOK: "Book", HIRE: "Hire", BUY: "Buy", QUOTE: "Get a quote", REQUEST: "Request", RENT: "Rent",
}

function formatPrice(offer: StorefrontOffer): string {
  if (offer.price == null) return "Price on request"
  const amount = new Intl.NumberFormat("en-KE").format(offer.price)
  const prefix = offer.pricingModel === "STARTING_FROM" ? "From " : ""
  const suffix = offer.unitLabel ? ` / ${offer.unitLabel}` : ""
  return `${prefix}${offer.currency} ${amount}${suffix}`
}

function OfferGrid({ offers }: { offers: StorefrontOffer[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {offers.map((offer) => (
        <Link
          key={offer.id}
          href={`/customer/offers/${offer.id}`}
          className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden hover:shadow-md transition"
        >
          {offer.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.image} alt="" className="w-full h-40 object-cover" />
          ) : (
            <div aria-hidden="true" className="w-full h-40 bg-gray-100 dark:bg-gray-700" />
          )}
          <div className="p-4">
            <h3 className="font-semibold line-clamp-1">{offer.title}</h3>
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">{offer.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-medium">{formatPrice(offer)}</span>
              <span className="text-xs font-medium text-blue-600">{ACTION_LABEL[offer.actionType]}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
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
