// Radius-search maths shared by every "near me" query. Deliberately split
// from lib/google-maps.ts: that module is about the Google Maps JS SDK (it
// reads NEXT_PUBLIC_* and is imported by client components), whereas this
// one is pure arithmetic with no key and no SDK, so server actions can use
// it without pulling the loader config along.

import { distanceKm } from "@/lib/google-maps"

/** Radius choices offered in the customer-facing filters. Kept here rather
 *  than in each page so the shops and specialists filters cannot drift. */
export const RADIUS_OPTIONS_KM = [2, 5, 10, 25, 50] as const

/** What a "near me" filter starts at when the customer turns it on without
 *  picking a distance. 10 km covers most of a Kenyan town without being so
 *  tight that a half-populated database returns nothing. */
export const DEFAULT_RADIUS_KM = 10

export type Coordinates = { latitude: number; longitude: number }

/**
 * The window a proximity-first feed searches in one pass.
 *
 * Deliberately generous. The home feed's job is "show me people near me",
 * not "show me people within exactly N km" — a tight box would leave a
 * customer in a thinly-covered county staring at an empty dashboard, and
 * widening in steps would cost a database round trip per step, which is the
 * one thing this must not do. So: one wide indexed box, sort by true
 * distance, take the best few, and top up from the nationwide list only if
 * that still came up short.
 */
export const PROXIMITY_SEARCH_KM = 200

/** Prisma `where` fragment restricting to the proximity window, or undefined
 *  when there is no origin and the caller should not filter at all. */
export function proximityWhere(origin: Coordinates | null) {
  if (!origin) return undefined
  return boundingBoxWhere(boundingBox(origin.latitude, origin.longitude, PROXIMITY_SEARCH_KM))
}

/** Mean km per degree of latitude. Longitude shrinks towards the poles, so
 *  it gets divided by cos(lat) below. */
const KM_PER_DEGREE_LAT = 111.32

export type BoundingBox = { minLat: number; maxLat: number; minLng: number; maxLng: number }

/**
 * The smallest lat/lng rectangle containing every point within `radiusKm`
 * of the origin.
 *
 * This exists for one reason: a radius search must narrow in SQL before any
 * exact distance runs. Postgres cannot index a haversine expression, but it
 * can index plain latitude/longitude columns (see @@index on
 * shopkeeper_profiles / provider_profiles), so callers filter on this box
 * server-side and then refine with `withinRadius` below. Fetching every row
 * and measuring in JS would be wrong here regardless of correctness: this
 * app's functions run in iad1 against a database in eu-central-1, where
 * every extra row crossing the wire is paid for twice.
 *
 * The box is an over-approximation — its corners sit up to ~41% further out
 * than the radius — which is exactly why the refine step is not optional.
 */
export function boundingBox(latitude: number, longitude: number, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT
  // cos() collapses to 0 at the poles, which would make lngDelta infinite.
  // Clamping to the cosine of 89.9° caps the box at the whole longitude
  // range instead of producing NaN bounds Prisma would reject.
  const cosLat = Math.max(Math.cos((latitude * Math.PI) / 180), Math.cos((89.9 * Math.PI) / 180))
  const lngDelta = radiusKm / (KM_PER_DEGREE_LAT * cosLat)

  return {
    minLat: Math.max(latitude - latDelta, -90),
    maxLat: Math.min(latitude + latDelta, 90),
    // Not wrapped at the antimeridian: a wrapping box needs an OR'd pair of
    // ranges rather than one, and SAJI is a Kenya-focused marketplace whose
    // listings are nowhere near ±180°. Clamped rather than wrapped so the
    // bounds stay valid if one ever is.
    minLng: Math.max(longitude - lngDelta, -180),
    maxLng: Math.min(longitude + lngDelta, 180),
  }
}

/** Prisma `where` fragment for a bounding-box prefilter. Also excludes rows
 *  with no coordinates at all, which is the common case while shopkeepers
 *  and providers are still filling their locations in. */
export function boundingBoxWhere(box: BoundingBox) {
  return {
    latitude: { gte: box.minLat, lte: box.maxLat, not: null },
    longitude: { gte: box.minLng, lte: box.maxLng, not: null },
  }
}

/** True when the point really is inside the circle, not merely inside the
 *  bounding box. Always run this after a `boundingBoxWhere` prefilter. */
export function withinRadius(origin: Coordinates, point: Coordinates, radiusKm: number): boolean {
  return distanceKm(origin.latitude, origin.longitude, point.latitude, point.longitude) <= radiusKm
}

/** Decimal(9,6) columns arrive from Prisma as Decimal objects, and are null
 *  on every row nobody has located yet. Returns null unless both halves are
 *  present so callers get one check instead of two. */
export function toCoordinates(
  latitude: { toString(): string } | null | undefined,
  longitude: { toString(): string } | null | undefined,
): Coordinates | null {
  if (latitude == null || longitude == null) return null
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { latitude: lat, longitude: lng }
}

/** First present coordinate half out of several candidates, as a number.
 *  Exists because the obvious `Number(a ?? b) || null` silently turns a
 *  legitimate 0 into null — and 0 is a real latitude a few hundred km north
 *  of Nairobi, so the equator would have read as "unlocated". */
export function firstCoordinate(
  ...candidates: ({ toString(): string } | null | undefined)[]
): number | null {
  for (const candidate of candidates) {
    if (candidate == null) continue
    const value = Number(candidate)
    if (Number.isFinite(value)) return value
  }
  return null
}

/** Straight-line km between two known points, unrounded. The Coordinates
 *  -shaped sibling of distanceKm, for callers that already have objects and
 *  want a raw figure to compare against a threshold. */
export function distanceKmBetween(a: Coordinates, b: Coordinates): number {
  return distanceKm(a.latitude, a.longitude, b.latitude, b.longitude)
}

/** Straight-line km from the origin, rounded to one decimal — the precision
 *  the UI actually renders ("2.4 km"). Null when the target is unlocated, so
 *  a card can omit the distance line rather than claim 0 km. */
export function distanceFrom(origin: Coordinates | null, point: Coordinates | null): number | null {
  if (!origin || !point) return null
  const km = distanceKm(origin.latitude, origin.longitude, point.latitude, point.longitude)
  return Math.round(km * 10) / 10
}

/** Sorts nearest-first, keeping unlocated rows last rather than treating a
 *  missing distance as 0 and floating them to the top. Sorts in place and
 *  returns the same array, matching Array.prototype.sort. */
export function sortByDistance<T extends { distanceKm: number | null }>(rows: T[]): T[] {
  return rows.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
}
