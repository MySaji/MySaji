const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const { discoverCustomerRequests, discoverBoardRequests } = loadService("frontend/lib/request-discovery.ts", {})
const base = { title: "Repair tap", description: "Kitchen leak", categoryName: "Plumbing", location: "Nairobi", createdAt: "2026-10-18T08:00:00Z" }

test("customer discovery combines response-ready status with search and leaves source order intact", () => {
  const items = [{ ...base, id: "open", status: "OPEN", responseCount: 2 }, { ...base, id: "accepted", status: "ACCEPTED", responseCount: 5 }]
  assert.deepEqual(discoverCustomerRequests(items, " KITCHEN ", "REPLIES", "responses").map(item => item.id), ["open"])
  assert.equal(discoverCustomerRequests(items, "absent", "ALL", "newest").length, 0)
  assert.deepEqual(items.map(item => item.id), ["open", "accepted"])
})

test("provider discovery preserves zero distance and budget and puts unknown distances last", () => {
  const items = [{ ...base, id: "unknown", myResponse: null, distanceKm: null, budgetMax: null }, { ...base, id: "near", myResponse: null, distanceKm: 0, budgetMax: 0 }, { ...base, id: "answered", myResponse: { price: 20 }, distanceKm: 1, budgetMax: 100 }]
  assert.deepEqual(discoverBoardRequests(items, "nairobi", "UNANSWERED", "Plumbing", "nearest").map(item => item.id), ["near", "unknown"])
  assert.deepEqual(discoverBoardRequests(items, "", "ALL", "ALL", "budget").map(item => item.id), ["answered", "near", "unknown"])
  assert.equal(discoverBoardRequests(items, "", "ALL", "Cleaning", "newest").length, 0)
  assert.deepEqual(items.map(item => item.id), ["unknown", "near", "answered"])
})
