const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const domain = loadService("backend/domain/admin-operations-map.ts")

test("map coordinates preserve the equator, reject missing/invalid pins and coarsen provider bases", () => {
  assert.equal(domain.mapCoordinates(0, 36).latitude, 0)
  for (const pair of [[null, 36], [0, undefined], [91, 36], [0, 181], [NaN, 1]]) assert.equal(domain.mapCoordinates(...pair).latitude, null)
  const coarse = domain.mapCoordinates(-1.234567, 36.812345, true)
  assert.equal(coarse.latitude, -1.23)
  assert.equal(coarse.longitude, 36.81)
})

test("clustering retains record counts and radius/bounds maths handles real edge cases", () => {
  const points = [{ id: "a", latitude: 0, longitude: 36 }, { id: "b", latitude: 0, longitude: 36.00001 }, { id: "missing", latitude: null, longitude: null }]
  const clusters = domain.clusterOperationsLocations(points, 10)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].members.length, 2)
  assert.equal(domain.locationDistanceKm(points[0], points[0]), 0)
  assert.ok(domain.locationDistanceKm({latitude:0,longitude:0},{latitude:0,longitude:1}) > 111)
  assert.equal(domain.insideMapBounds({latitude:0,longitude:179},{north:10,south:-10,west:170,east:-170}), true)
  assert.equal(domain.insideMapBounds({latitude:0,longitude:0},{north:10,south:-10,west:170,east:-170}), false)
})

function service(admin, db) {
  return loadService("backend/actions/admin-operations-map.ts", {
    zod: require("zod"), "@/backend/db": { db },
    "@/backend/actions/admin-dashboard": { requireAdmin: async () => admin ? { userId: "admin" } : null },
    "@/backend/domain/admin-operations-map": domain,
  })
}
test("operations map refuses non-admin and malformed cursor requests before querying business records", async () => {
  const db = new Proxy({}, { get() { throw new Error("Unexpected database access") } })
  assert.equal(await service(false, db).getAdminOperationsMap(), null)
  assert.equal(await service(true, db).getAdminOperationsMap({ shops: "x" }), null)
})

test("map payloads contain business records only, exclude deleted owners/staff and paginate each layer independently", async () => {
  const seen = {}
  const user = { id: "owner", name: "Owner", isActive: true, email: "private@example.invalid" }
  const updatedAt = new Date("2026-10-18T08:00:00Z")
  const shops = Array.from({ length: 251 }, (_, i) => ({ id: `shop-${i}`, shopName: `Shop ${i}`, posEnabled: true, latitude: 0, longitude: 36, user, isVerified: true, posProfileKey: "retail", updatedAt, mpesaConsumerSecret: "must-not-return" }))
  shops[0].posStore = { name: "West branch", town: "Nakuru", county: "Nakuru", isActive: false, business: { name: "Example Trading" } }
  const db = {
    shopkeeperProfile: { findMany: async query => { seen.shops = query; return shops }, count: async () => 251 },
    providerProfile: { findMany: async query => { seen.providers = query; return [{ id: "pro", businessName: "Workshop", workAreas: ["Nairobi"], latitude: -1.234567, longitude: 36.812345, workPreference: "ONSITE", verified: true, user, updatedAt, location: "Private street address" }] }, count: async () => 1 },
    distributorLocation: { findMany: async query => { seen.distributors = query; return [] }, count: async () => 0 },
  }
  const result = await service(true, db).getAdminOperationsMap()
  assert.equal(result.locations.length, 251)
  assert.equal(result.next.shops, "shop-249")
  assert.equal(result.next.providers, null)
  assert.equal(result.locations[0].name, "Example Trading - West branch")
  assert.equal(result.locations[0].active, false)
  assert.equal(result.locations[0].directoryQuery, "Example Trading")
  assert.equal(result.locations.find(point => point.kind === "provider").latitude, -1.23)
  assert.equal(seen.shops.where.user.deletedAt, null)
  assert.equal(seen.providers.where.parentBusinessId, null)
  assert.equal(seen.providers.select.location, undefined)
  const payload = JSON.stringify(result)
  for (const value of ["must-not-return", "private@example.invalid", "Private street address"]) assert.equal(payload.includes(value), false)
  let providerQueries = 0
  db.providerProfile.findMany = async () => { providerQueries++; return [] }
  await service(true, db).getAdminOperationsMap(result.next)
  assert.equal(providerQueries, 0)
  assert.equal(seen.shops.cursor.id, "shop-249")
})
