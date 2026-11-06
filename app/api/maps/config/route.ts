import { loadMapConfig } from "@/backend/services/map-settings"
export const dynamic = "force-dynamic"
export async function GET() {
  try { return Response.json(await loadMapConfig(), { headers: { "Cache-Control": "no-store" } }) }
  catch { return Response.json({ error: "Map settings are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }) }
}
