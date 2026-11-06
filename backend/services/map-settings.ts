import "server-only"
import { osmGeocoderUrl } from "@/backend/services/osm-geocoding"
import { db } from "@/backend/db"
import { readMapProvider, type PublicMapConfig } from "@/backend/domain/map-provider"

export async function loadMapConfig(): Promise<PublicMapConfig> {
  const setting = await db.platformSetting.findUnique({ where: { key: "maps" }, select: { value: true } })
  return {
    provider: readMapProvider(setting?.value),
    googleConfigured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    osmTileUrl: process.env.OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    osmAttribution: process.env.OSM_TILE_ATTRIBUTION || "",
    osmSearchConfigured: Boolean(osmGeocoderUrl()),
  }
}
