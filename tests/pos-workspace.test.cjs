const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const { filterCatalogue, workspaceTools } = loadService("backend/domain/pos-workspace.ts")
const permissions = loadService("backend/domain/pos-permissions.ts")
const traits = loadService("backend/domain/pos-traits.ts")
const { POS_PROFILES } = loadService("backend/domain/pos-profiles.ts", { "./pos-traits": traits })

test("every business profile receives relevant tools without exposing unauthorized features", () => {
  for (const profile of POS_PROFILES) {
    const tools = workspaceTools(profile.traits, profile.key, permissions.POS_PERMISSIONS)
    assert.ok(tools.length > 0, profile.key)
    for (const tool of tools) {
      assert.ok(!tool.traits || tool.traits.some(trait => profile.traits.includes(trait)), profile.key)
      assert.ok(!tool.profiles || tool.profiles.includes(profile.key), profile.key)
    }
    assert.equal(workspaceTools(profile.traits, profile.key, []).length, 0)
  }
  assert.ok(workspaceTools(["JOB_CARD"], "GENERAL", ["till.sell"]).some(tool => tool.href === "/pos/jobs"))
  assert.ok(!workspaceTools([], "RESTAURANT", ["stock.view"]).some(tool => tool.href === "/pos/floor"))
  assert.ok(!workspaceTools([], "GENERAL", permissions.POS_PERMISSIONS).some(tool => tool.href === "/pos/jobs"))
})

const items = [
  { id: "a", name: "Rice", categoryName: "Food", price: 100, stock: 5, isService: false },
  { id: "b", name: "Beans", categoryName: "Food", price: 150, stock: 0, isService: false },
  { id: "c", name: "Repair", categoryName: null, price: 500, stock: 0, isService: true },
]
test("catalogue combines categories, availability and favourites without treating services as out of stock", () => {
  assert.equal(filterCatalogue(items, null, "available", "default", []).map(item => item.id).join(), "a,c")
  assert.equal(filterCatalogue(items, null, "unavailable", "default", []).map(item => item.id).join(), "b")
  assert.equal(filterCatalogue(items, "Food", "favourites", "default", ["b", "c"]).map(item => item.id).join(), "b")
  assert.equal(filterCatalogue(items, "Uncategorized", "services", "default", []).map(item => item.id).join(), "c")
})
test("catalogue sorting leaves the source order intact", () => {
  assert.equal(filterCatalogue(items, null, "all", "price-high", []).map(item => item.id).join(), "c,b,a")
  assert.equal(filterCatalogue(items, null, "all", "name", []).map(item => item.id).join(), "b,c,a")
  assert.equal(items.map(item => item.id).join(), "a,b,c")
})
