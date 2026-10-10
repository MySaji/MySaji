// Real integration, env-gated like every other paid third-party API in this
// project (Anthropic, M-Pesa, Stripe, PayPal) — fully live when a key is
// set, honestly degraded (plain text, no map) when it isn't.
export function isGoogleMapsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
}

// Module-level constant so every component passes the exact same array
// reference to useJsApiLoader — @react-google-maps/api warns/reloads the
// script if this identity changes between renders.
export const GOOGLE_MAPS_LIBRARIES: "places"[] = ["places"]

export const GOOGLE_MAPS_LOADER_ID = "saji-google-maps"

/** Real haversine distance in km — no API call needed, works even without a
 * Maps key, so "how far is the provider" stays real either way. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Straight-line distance / a plausible average urban travel speed — labeled
// as an estimate everywhere it's shown, not presented as a real routed ETA
// (that would need the paid Distance Matrix/Directions API on top of Maps).
const AVERAGE_URBAN_SPEED_KMH = 25

export function estimateTravelMinutes(km: number): number {
  return Math.max(1, Math.round((km / AVERAGE_URBAN_SPEED_KMH) * 60))
}
