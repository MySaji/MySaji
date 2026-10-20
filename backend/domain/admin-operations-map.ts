export type OperationsLocation = {
  id: string
  recordId: string
  userId: string
  kind: "pos" | "shop" | "provider" | "distributor"
  name: string
  ownerName: string
  area: string | null
  latitude: number | null
  longitude: number | null
  approximate: boolean
  active: boolean
  verified: boolean
  detail: string | null
  directoryQuery?: string
  updatedAt: string
}
export type MapBounds = { north: number; south: number; east: number; west: number }

export function mapCoordinates(latitude: unknown, longitude: unknown, approximate = false) {
  if (latitude == null || longitude == null) return { latitude: null, longitude: null }
  const lat = Number(latitude), lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { latitude: null, longitude: null }
  return { latitude: approximate ? Math.round(lat * 100) / 100 : lat, longitude: approximate ? Math.round(lng * 100) / 100 : lng }
}

export function locationDistanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = Math.PI / 180
  const dlat = (b.latitude - a.latitude) * radians, dlng = (b.longitude - a.longitude) * radians
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dlng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}

export function insideMapBounds(point: OperationsLocation, bounds: MapBounds) {
  if (point.latitude == null || point.longitude == null) return false
  const longitudeInside = bounds.west <= bounds.east ? point.longitude >= bounds.west && point.longitude <= bounds.east : point.longitude >= bounds.west || point.longitude <= bounds.east
  return point.latitude <= bounds.north && point.latitude >= bounds.south && longitudeInside
}

/** Screen-sized Mercator buckets keep thousands of HTML pins manageable.
 * Counts represent loaded business records, never inferred people or devices. */
export function clusterOperationsLocations(locations: OperationsLocation[], zoom: number) {
  const size = 256 * 2 ** Math.min(Math.max(zoom, 1), 20)
  const buckets = new Map<string, OperationsLocation[]>()
  for (const location of locations) {
    if (location.latitude == null || location.longitude == null) continue
    const sin = Math.sin(Math.max(-85, Math.min(85, location.latitude)) * Math.PI / 180)
    const x = ((location.longitude + 180) / 360) * size
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size
    const key = `${Math.floor(x / 64)}:${Math.floor(y / 64)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(location)
    else buckets.set(key, [location])
  }
  return [...buckets].map(([key, members]) => ({ key, members, latitude: members.reduce((sum, p) => sum + p.latitude!, 0) / members.length, longitude: members.reduce((sum, p) => sum + p.longitude!, 0) / members.length }))
}
