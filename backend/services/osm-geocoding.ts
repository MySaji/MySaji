import "server-only"
import { validCoordinates } from "@/backend/domain/map-provider"

/** Configure a self-hosted or contracted Nominatim-compatible service.
 * The shared public Nominatim endpoint is deliberately not a default.
 */
export function osmGeocoderUrl(): URL | null {
  try {
    if (!process.env.OSM_GEOCODER_URL) return null
    const url = new URL(process.env.OSM_GEOCODER_URL)
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.hostname === "nominatim.openstreetmap.org" || url.hostname.endsWith(".nominatim.openstreetmap.org")) return null
    return url
  } catch { return null }
}
export async function lookupOsmPlace(input: { query: string } | { latitude: number; longitude: number }) {
  const base = osmGeocoderUrl()
  if (!base) throw new Error("Address search is not configured.")
  const url = new URL(`${base.toString().replace(/\/$/, "")}/${"query" in input ? "search" : "reverse"}`)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("addressdetails", "1")
  if ("query" in input) { url.searchParams.set("q", input.query); url.searchParams.set("limit", "5"); url.searchParams.set("countrycodes", "ke") }
  else { url.searchParams.set("lat", String(input.latitude)); url.searchParams.set("lon", String(input.longitude)) }
  const response = await fetch(url, { headers: { "User-Agent": "MySaji/1.0 (+https://mysaji.com)", ...(process.env.OSM_GEOCODER_API_KEY ? { Authorization: `Bearer ${process.env.OSM_GEOCODER_API_KEY}` } : {}) }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error("Address lookup failed.")
  const result = await response.json()
  const rows = Array.isArray(result) ? result : [result]
  return rows.slice(0,5).flatMap(row => {
    const latitude = Number(row.lat), longitude = Number(row.lon)
    if (!validCoordinates(latitude,longitude) || typeof row.display_name !== "string") return []
    return [{ address: row.display_name.slice(0,1000), city: [row.address?.city,row.address?.town,row.address?.village].find(value => typeof value === "string")?.slice(0,200) ?? null, latitude, longitude }]
  })
}
