import { distanceKmBetween, type Coordinates } from "@/backend/domain/geo"

/**
 * What a seller charges to deliver, and how far they will go.
 *
 * `radiusKm` null means no limit — the behaviour every shop and distributor
 * had before delivery zones existed, and the one they keep until someone
 * sets a radius. `perKm` zero means the flat fee is the whole fee, which is
 * likewise the pre-existing behaviour.
 */
export type DeliveryZone = {
  radiusKm: number | null
  flatFee: number
  perKm: number
}

export type DeliveryQuote =
  | {
      deliverable: true
      /** Flat fee plus any per-kilometre surcharge, rounded to the cent. */
      fee: number
      /** Null when the distance could not be measured. */
      distanceKm: number | null
      /** True when a per-km surcharge was actually applied, so the UI can
       *  explain why the fee is higher than the shop's headline figure. */
      surcharged: boolean
    }
  | {
      deliverable: false
      distanceKm: number
      radiusKm: number
      fee: null
    }

/** Money, to the cent. Avoids 0.1+0.2 artefacts reaching an order total. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Whether a seller will deliver to a destination, and for how much.
 *
 * The important rule is what happens when the distance is unknown — either
 * the seller or the destination has no coordinates. That is still the common
 * case: most addresses in this database were typed as free text and never
 * geocoded. Such an order is **allowed through at the flat fee**, never
 * refused. Refusing on an unmeasurable distance would turn a missing
 * coordinate into a lost sale, and would have broken every checkout that
 * worked the day before this feature shipped.
 *
 * A per-kilometre surcharge is likewise only applied when the distance is
 * genuinely known; there is no honest way to bill for a distance nobody
 * measured.
 */
export function quoteDelivery(
  zone: DeliveryZone,
  sellerLocation: Coordinates | null,
  destination: Coordinates | null,
): DeliveryQuote {
  const flat = Math.max(zone.flatFee, 0)

  if (!sellerLocation || !destination) {
    return { deliverable: true, fee: round2(flat), distanceKm: null, surcharged: false }
  }

  const distanceKm = Math.round(distanceKmBetween(sellerLocation, destination) * 10) / 10

  if (zone.radiusKm != null && distanceKm > zone.radiusKm) {
    return { deliverable: false, distanceKm, radiusKm: zone.radiusKm, fee: null }
  }

  const surcharge = Math.max(zone.perKm, 0) * distanceKm
  return {
    deliverable: true,
    fee: round2(flat + surcharge),
    distanceKm,
    surcharged: surcharge > 0,
  }
}

/** The message a customer sees when a seller will not reach them. Phrased
 *  as the seller's limit rather than the customer's fault, and concrete
 *  about both numbers so the next step is obvious. */
export function outOfRangeMessage(sellerName: string, quote: Extract<DeliveryQuote, { deliverable: false }>): string {
  return (
    `${sellerName} delivers up to ${quote.radiusKm} km, and this address is about ` +
    `${quote.distanceKm} km away. Choose a closer delivery address, or remove their items from your cart.`
  )
}
