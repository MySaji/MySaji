/**
 * Searching outward from where somebody is standing.
 *
 * WHY NOT ONE RADIUS
 *
 * A flat ten kilometres answers the wrong question. Somebody looking for a
 * fundi wants the one in their estate, because that is who can be there in
 * twenty minutes and who they will see again; a plumber ten kilometres away
 * across Nairobi traffic is a different proposition entirely and should not
 * be shown as though it were the same thing.
 *
 * But a hard two kilometres is worse, because most of the time it returns
 * nothing and the customer concludes the app is empty.
 *
 * So the search steps outward: the neighbourhood first, then the area, then
 * the city. The caller is told WHICH step answered, so the screen can say
 * "nobody in your area, these are about 8 km away" instead of silently
 * handing over distant results as if they were local. That sentence is the
 * whole point of this module: a customer who knows the nearest option is far
 * makes a different and better decision than one who is not told.
 */

/** The neighbourhood: an estate, a ward, a walk. */
export const NEIGHBOURHOOD_KM = 2

/**
 * How far each step reaches.
 *
 * Deliberately few and wide apart. Stepping 2, 3, 4, 5 would mean four
 * queries to learn what one at 5 would have told us, and the difference
 * between 3 and 4 kilometres is not a difference a customer acts on.
 */
export const PROXIMITY_STEPS_KM = [2, 5, 15, 50] as const

export type ProximityBand = "NEIGHBOURHOOD" | "NEARBY" | "WIDER" | "FAR" | "NONE"

export type ProximitySearch<T> = {
  results: T[]
  /** The radius that actually produced these. */
  radiusKm: number
  band: ProximityBand
  /** True where the search had to look past the neighbourhood to find any. */
  widened: boolean
  /** Nothing at any distance tried. */
  empty: boolean
  /**
   * What to tell the customer, in a sentence. Null when the results are
   * local and need no explaining.
   */
  message: string | null
}

export function bandFor(radiusKm: number): ProximityBand {
  if (radiusKm <= 2) return "NEIGHBOURHOOD"
  if (radiusKm <= 5) return "NEARBY"
  if (radiusKm <= 15) return "WIDER"
  return "FAR"
}

/**
 * Run `fetch` at each radius until something comes back.
 *
 * `fetch` is given a radius and returns whatever it finds there. Nothing
 * here knows or cares what is being searched for, which is why the same
 * function serves shops, providers and products.
 *
 * `minResults` exists because one lonely result in the neighbourhood is
 * often worse than five a little further out: a caller showing a row of
 * cards can ask for enough to fill it before it settles.
 */
export async function searchOutward<T>(
  fetch: (radiusKm: number) => Promise<T[]>,
  options: {
    steps?: readonly number[]
    minResults?: number
    noun?: string
    /**
     * How far one result is, where the caller can say.
     *
     * This decides whether the customer is told the search had to widen,
     * and it must: the loop steps out to FILL a row, so a shop 800 m away
     * can perfectly well be sitting at the top of a list the loop gathered
     * at 50 km. Judging "widened" by the radius the loop stopped at would
     * then tell somebody there was nothing within 2 km while a shop in
     * their own street was the first thing on their screen, which is the
     * exact dishonesty this module exists to prevent.
     */
    distanceOf?: (item: T) => number | null | undefined
  } = {},
): Promise<ProximitySearch<T>> {
  const steps = options.steps ?? PROXIMITY_STEPS_KM
  const minResults = Math.max(1, options.minResults ?? 1)
  const noun = options.noun ?? "anyone"

  let best: { results: T[]; radiusKm: number } | null = null

  for (const radiusKm of steps) {
    const results = await fetch(radiusKm)
    if (results.length === 0) continue

    // Enough to be worth stopping at, or the widest we were willing to go.
    best = { results, radiusKm }
    if (results.length >= minResults || radiusKm === steps[steps.length - 1]) break
  }

  if (!best) {
    const widest = steps[steps.length - 1]
    return {
      results: [],
      radiusKm: widest,
      band: "NONE",
      widened: true,
      empty: true,
      message:
        "There is no " + noun + " within " + widest + " km of you right now. Try again later, or " +
        "search by name instead of by distance.",
    }
  }

  // How far the CLOSEST one actually is, which is what the customer sees at
  // the top of the list and the only honest basis for what to tell them.
  const distances = options.distanceOf
    ? best.results.map(options.distanceOf).filter((d): d is number => typeof d === "number" && Number.isFinite(d))
    : []
  const nearest = distances.length > 0 ? Math.min(...distances) : null

  const widened = nearest != null ? nearest > NEIGHBOURHOOD_KM : best.radiusKm > NEIGHBOURHOOD_KM
  const band = nearest != null ? bandFor(nearest) : bandFor(best.radiusKm)

  return {
    results: best.results,
    radiusKm: best.radiusKm,
    band,
    widened,
    empty: false,
    message: widened
      ? "Nothing within " + NEIGHBOURHOOD_KM + " km of you. The closest is " +
        (describeDistance(nearest) ?? "about " + best.radiusKm + " km away") + "."
      : null,
  }
}

/** How far away one thing is, said the way a person would say it. */
export function describeDistance(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null
  if (km < 0.1) return "right here"
  if (km < 1) return Math.round(km * 1000) + " m away"
  if (km < 10) return km.toFixed(1) + " km away"
  return Math.round(km) + " km away"
}

/**
 * A link that opens the phone's own map app with directions.
 *
 * Google Maps' universal URL, which Android opens in Maps, iOS offers to
 * open in Maps or the browser, and a desktop opens in a tab. Deliberately
 * not an embedded route: a customer walking to a shop wants the map they
 * already know, with their own saved preferences and live traffic, not a
 * worse copy inside this app.
 */
export function directionsUrl(
  to: { latitude: number; longitude: number },
  label?: string | null,
): string {
  const dest = to.latitude + "," + to.longitude
  const q = label ? "&destination_place_id=" : ""
  void q
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest)
}
