import { auth } from "@/backend/auth"
import { loadMapConfig } from "@/backend/services/map-settings"
import { lookupOsmPlace } from "@/backend/services/osm-geocoding"
import { validCoordinates } from "@/backend/domain/map-provider"
import { checkRateLimit } from "@/backend/services/rate-limit"
export const dynamic = "force-dynamic"
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } })
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return json({ error: "Sign in to search addresses." },401)
  const params = new URL(request.url).searchParams
  const query = params.get("q")?.trim()
  const lat = params.get("lat"), lng = params.get("lng")
  if (query ? query.length < 3 || query.length > 200 : !lat?.trim() || !lng?.trim() || !validCoordinates(Number(lat),Number(lng))) return json({error:"Enter a place name or valid coordinates."},400)
  try {
    const config = await loadMapConfig()
    if (config.provider !== "OPENSTREETMAP" || !config.osmSearchConfigured) return json({error:"Address lookup is unavailable. Enter the address and choose a map pin."},503)
    const rate = await checkRateLimit(session.user.id,"map.geocode",30,60_000)
    if (!rate.allowed) return json({error:"Too many searches. Please wait a minute."},429)
    return json({places:await lookupOsmPlace(query ? {query} : {latitude:Number(lat),longitude:Number(lng)})})
  } catch { return json({error:"Address lookup failed. You can enter the address manually and select a pin."},503) }
}
