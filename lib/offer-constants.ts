export type OfferActionType = "BOOK" | "HIRE" | "BUY" | "QUOTE" | "REQUEST" | "RENT"
export type OfferStatus = "DRAFT" | "UNDER_REVIEW" | "LIVE"
export type OfferPricingModel = "FIXED" | "STARTING_FROM" | "PER_UNIT" | "BULK" | "QUOTE" | "INSPECTION"
export type OfferAvailabilityStatus = "IN_STOCK" | "ON_REQUEST" | "BY_APPOINTMENT" | "UNAVAILABLE"
export type OfferFulfilmentMethod = "DELIVERY" | "PICKUP" | "PROVIDER_SITE_VISIT" | "SHIPPING" | "REMOTE"
export type OfferDocument = { name: string; url: string }

// Which existing browse surface an offer belongs alongside — a BUY offer is
// a product for sale, RENT is neither a service nor a product sale, and
// everything else (BOOK/HIRE/QUOTE/REQUEST) is a service being offered.
export const OFFER_KIND: Record<OfferActionType, "product" | "service" | "rental"> = {
  BUY: "product",
  RENT: "rental",
  BOOK: "service",
  HIRE: "service",
  QUOTE: "service",
  REQUEST: "service",
}

/**
 * Where a customer tapping an offer card should land.
 *
 * RENT is the reason this exists. A rental is a date-range RentalBooking with
 * a deposit and availability windows, and it has its own screen for that —
 * but every offer list linked to /customer/offers/[id] regardless of action
 * type, so rentals arrived at the generic offer page and were handed a
 * "send the provider a message" box instead of a booking form. Anything that
 * links to an offer must go through this, so the rule lives in one place
 * rather than being re-derived per list.
 */
export function offerHref(actionType: OfferActionType, offerId: string): string {
  return actionType === "RENT" ? `/customer/rentals/${offerId}` : `/customer/offers/${offerId}`
}

export const OFFER_ACTION_LABEL: Record<OfferActionType, string> = {
  BOOK: "Book",
  HIRE: "Hire",
  BUY: "Buy",
  QUOTE: "Get Quote",
  REQUEST: "Send Request",
  RENT: "Rent",
}

// Action types that need a firm price up front and route straight into the
// existing single-Job/payment pipeline; QUOTE/REQUEST instead open a
// conversation with the provider — no price is required. RENT is
// deliberately NOT included here even though it needs a real price too —
// it routes into the separate date-range RentalBooking flow (see
// lib/actions/rentals.ts), not the generic single-Job pipeline this list
// gates. See publishOffer's own price check for RENT's price requirement.
export const PRICED_OFFER_ACTION_TYPES: OfferActionType[] = ["BOOK", "HIRE", "BUY"]

export const OFFER_PRICING_MODELS: OfferPricingModel[] = ["FIXED", "STARTING_FROM", "PER_UNIT", "BULK", "QUOTE", "INSPECTION"]

export const OFFER_PRICING_LABEL: Record<OfferPricingModel, string> = {
  FIXED: "Fixed price",
  STARTING_FROM: "Starting from",
  PER_UNIT: "Price per unit",
  BULK: "Bulk pricing",
  QUOTE: "Request a quote",
  INSPECTION: "Price on inspection",
}

// The two pricing models where a firm number is never expected — publishOffer
// skips the "needs a price > 0" check for these even when actionType is one
// of PRICED_OFFER_ACTION_TYPES, since "Request a quote" / "Price on
// inspection" are legitimately priceless by design, not an incomplete draft.
export const PRICELESS_PRICING_MODELS: OfferPricingModel[] = ["QUOTE", "INSPECTION"]

export const OFFER_AVAILABILITY_STATUSES: OfferAvailabilityStatus[] = ["IN_STOCK", "ON_REQUEST", "BY_APPOINTMENT", "UNAVAILABLE"]

export const OFFER_AVAILABILITY_LABEL: Record<OfferAvailabilityStatus, string> = {
  IN_STOCK: "In stock & ready to deliver",
  ON_REQUEST: "Available on request",
  BY_APPOINTMENT: "Available by appointment",
  UNAVAILABLE: "Temporarily unavailable",
}

export const OFFER_FULFILMENT_METHODS: OfferFulfilmentMethod[] = ["DELIVERY", "PICKUP", "PROVIDER_SITE_VISIT", "SHIPPING", "REMOTE"]

export const OFFER_FULFILMENT_LABEL: Record<OfferFulfilmentMethod, string> = {
  DELIVERY: "Delivery to customer",
  PICKUP: "Customer pickup",
  PROVIDER_SITE_VISIT: "Provider comes to site",
  SHIPPING: "Shipping",
  REMOTE: "Online / Remote",
}
