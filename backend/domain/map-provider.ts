export type MapProvider = "GOOGLE" | "OPENSTREETMAP"
export type PublicMapConfig = {
  provider: MapProvider
  googleConfigured: boolean
  osmTileUrl: string
  osmAttribution: string
  osmSearchConfigured: boolean
}
export function readMapProvider(value: unknown): MapProvider {
  return value && typeof value === "object" && "provider" in value && value.provider === "OPENSTREETMAP" ? "OPENSTREETMAP" : "GOOGLE"
}
export function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
}
