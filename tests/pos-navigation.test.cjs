const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")

test("employee navigation follows permissions, including grants outside the role", () => {
  const { canOpenPosPage } = loadService("frontend/lib/pos-navigation.ts")
  assert.equal(canOpenPosPage("/pos/home", []), true)
  assert.equal(canOpenPosPage("/pos/sell", ["product.view"]), false)
  assert.equal(canOpenPosPage("/pos/settings", ["till.sell"]), false)
  assert.equal(canOpenPosPage("/pos/team", ["staff.view"]), true)
  assert.equal(canOpenPosPage("/pos/reports", ["report.stock"]), true)
  assert.equal(canOpenPosPage("/pos/settings", ["settings.store"]), true)
  assert.equal(canOpenPosPage("/pos/unknown", ["settings.business"]), false)
})

test("identity exposes all owner-selected permissions rather than intersecting the role", async () => {
  const permissions = loadService("backend/domain/pos-permissions.ts")
  const { getPosWhoAmI } = loadService("backend/actions/pos-access.ts", {
    "@/backend/domain/pos-permissions": permissions,
    "@/backend/services/pos-access-core": {
      resolvePosActor: async () => ({ role: "CASHIER", can: p => ["till.sell", "report.sales"].includes(p) }),
    },
  })
  const actor = await getPosWhoAmI()
  assert.equal(actor.permissions.includes("report.sales"), true)
  assert.equal(actor.permissions.includes("till.sell"), true)
  assert.equal(actor.permissions.includes("settings.business"), false)
})
