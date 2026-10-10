"use server"

import { headers } from "next/headers"
import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { toCoordinates, type Coordinates } from "@/backend/domain/geo"

/** How a resolved origin was obtained, mirroring the LocationSource enum
 *  plus the "we have nothing" case callers must still render for. */
export type OriginSource = "GPS" | "ADDRESS" | "IP" | "STORED"

export type LocationOrigin = Coordinates & {
  source: OriginSource
  /** Rough radius of uncertainty, so the UI can say "approximate" honestly
   *  rather than presenting a city-level guess as a precise fix. */
  accuracyKm: number
}

/** A GPS fix older than this is no longer "where you are now", so a saved
 *  address outranks it. Long enough to survive a normal browsing session. */
const GPS_FRESHNESS_MS = 6 * 60 * 60 * 1000

const ACCURACY_KM: Record<OriginSource, number> = {
  GPS: 0.05,
  ADDRESS: 0.1,
  IP: 25,
  STORED: 25,
}

/**
 * Vercel's edge geolocation for the current request.
 *
 * This is the piece that makes proximity work on the very first page after
 * login: the headers are already on the request, so it costs no round trip,
 * no database read and no permission prompt. It is only accurate to city
 * level (and is simply absent in local development, or behind a VPN), which
 * is why it ranks below a real fix and is always labelled approximate.
 */
async function ipOrigin(): Promise<LocationOrigin | null> {
  const h = await headers()
  const lat = Number(h.get("x-vercel-ip-latitude"))
  const lng = Number(h.get("x-vercel-ip-longitude"))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  // 0,0 is the Atlantic null island — what some edges send when they have no
  // idea, and a value that would silently drag every result set to Africa's
  // west coast.
  if (lat === 0 && lng === 0) return null
  return { latitude: lat, longitude: lng, source: "IP", accuracyKm: ACCURACY_KM.IP }
}

/**
 * Where to measure "near me" from, for whoever is making this request.
 *
 * Tries hardest-evidence first and never blocks on any of it:
 *
 *   1. a recent browser GPS fix the user already granted (metres, and it is
 *      where they are *now*, which is the question being asked)
 *   2. the default address they saved themselves (precise, but it is where
 *      they live rather than where they are)
 *   3. this request's IP geolocation (instant, city level)
 *   4. whatever position we last stored, however old (a stale city beats no
 *      results at all)
 *
 * Returns null only for a signed-out visitor with no IP headers — in local
 * development, essentially. Callers must still render an unfiltered list in
 * that case rather than an empty one.
 */
export async function resolveLocationOrigin(): Promise<LocationOrigin | null> {
  const session = await auth()

  if (!session?.user?.id) return ipOrigin()

  // One round trip for both candidates. Fetching the address only when the
  // stored fix turns out to be stale would read less data but would cost a
  // second *sequential* round trip, and round trips — not rows — are what
  // this page's latency is made of: a trivial query against the database
  // costs milliseconds in-region but is the single largest term in the
  // budget, and the whole point of this feature is to resolve before the
  // first paint.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      lastKnownLatitude: true,
      lastKnownLongitude: true,
      locationSource: true,
      lastLocationUpdatedAt: true,
      addresses: {
        where: { latitude: { not: null }, longitude: { not: null } },
        orderBy: { isDefault: "desc" },
        take: 1,
        select: { latitude: true, longitude: true },
      },
    },
  })

  const stored = toCoordinates(user?.lastKnownLatitude, user?.lastKnownLongitude)
  const storedAge = user?.lastLocationUpdatedAt
    ? Date.now() - user.lastLocationUpdatedAt.getTime()
    : Infinity

  // 1. A fresh GPS fix wins outright.
  if (stored && user?.locationSource === "GPS" && storedAge < GPS_FRESHNESS_MS) {
    return { ...stored, source: "GPS", accuracyKm: ACCURACY_KM.GPS }
  }

  // 2. The address the user picked for themselves.
  const address = user?.addresses[0]
  const addressCoords = toCoordinates(address?.latitude, address?.longitude)
  if (addressCoords) return { ...addressCoords, source: "ADDRESS", accuracyKm: ACCURACY_KM.ADDRESS }

  // 3. This request's edge geolocation.
  const ip = await ipOrigin()
  if (ip) return ip

  // 4. Anything we have ever stored, however stale.
  if (stored) return { ...stored, source: "STORED", accuracyKm: ACCURACY_KM.STORED }

  return null
}

/** Back-compat alias for the browse-page filters, which only ever needed the
 *  bare coordinates. */
export async function getMyLocationOrigin(): Promise<Coordinates | null> {
  const origin = await resolveLocationOrigin()
  return origin ? { latitude: origin.latitude, longitude: origin.longitude } : null
}

const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

/**
 * Stores a precise browser GPS fix against the account.
 *
 * Called by components/geo/location-bootstrap.tsx once the browser grants
 * the permission, so that every later request — including the first render
 * of the next session — starts from a real fix instead of an IP guess.
 * Silently does nothing for a signed-out visitor: there is nowhere to put it,
 * and that page is already working off the IP origin.
 */
export async function updateMyLocation(input: unknown): Promise<{ success: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false }

  const parsed = updateLocationSchema.safeParse(input)
  if (!parsed.success) return { success: false }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      lastKnownLatitude: parsed.data.latitude,
      lastKnownLongitude: parsed.data.longitude,
      locationSource: "GPS",
      lastLocationUpdatedAt: new Date(),
    },
  })

  return { success: true }
}
