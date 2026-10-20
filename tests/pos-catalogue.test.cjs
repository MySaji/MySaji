const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")

function catalogue() {
  const requests = []
  const product = { id: "product", name: "Rice", sku: "RICE", barcode: "123456", unit: "kg", images: [], price: 100, discountPrice: null, inventory: { currentStock: 10, stockOnHand: null }, category: { name: "Food" }, variants: [], fitsWith: [] }
  const db = {
    shopkeeperProfile: { findUnique: async () => ({ id: "my-store", shopName: "Shop", posEnabled: true, posProfileKey: "GROCERY", posTraits: null, posConfig: {} }) },
    product: { findMany: async query => {
      requests.push(query)
      if (query.where.barcode && query.where.barcode !== product.barcode) return []
      return [product]
    } },
    productVariant: { findFirst: async () => null },
  }
  const actions = loadService("backend/actions/pos-sales.ts", {
    "@/backend/domain/pos-receipt-details": loadService("backend/domain/pos-receipt-details.ts"),
    "@/backend/domain/pos-mpesa": loadService("backend/domain/pos-mpesa.ts"),
    "@/backend/services/pos-mpesa-claims": {},
    zod: require("zod"), bcryptjs: {}, crypto: require("node:crypto"),
    "@/backend/services/pos-access-core": { requirePosPermission: async () => ({ ok: true, actor: { businessId: "b", storeId: "s", staffId: null } }) },
    "@/backend/auth": { auth: async () => ({ user: { id: "owner", role: "provider", name: "Owner" } }) },
    "@/backend/db": { db },
    "@/backend/services/pos-tenant": { posShopIdFor: async () => "my-store" },
    "@/backend/services/pos-ledger": {}, "@/backend/services/pos-approval": {},
    "@/backend/domain/pos-pricing": {}, "@/backend/domain/pos-config": { parsePosConfig: () => ({}) },
    "@/backend/actions/pos-mpesa": {}, "@/backend/services/etims-queue-core": {},
    "@/backend/actions/pos-billing-shop": {}, "@/backend/domain/pos-profiles": { effectiveTraits: () => [] },
  })
  return { actions, requests, db }
}

test("sales without an open shift stop before pricing or payment writes", async () => {
  const { actions, requests, db } = catalogue()
  db.posSale = { findUnique: async () => null }
  db.tillSession = { findFirst: async query => {
    assert.equal(query.where.shopkeeperId, "my-store")
    assert.equal(query.where.closedAt, null)
    return null
  } }
  const result = await actions.recordPosSale({ expectedShopId: "my-store", expectedUserId: "owner", idempotencyKey: "shift-test-123456", lines: [{ productId: "product", quantity: "1" }], payments: [{ method: "CASH", amount: 100 }] })
  assert.equal(result.success, false)
  assert.match(result.error, /open a shift/i)
  assert.equal(requests.length, 0)
})

test("catalogue pagination stays scoped to the current store", async () => {
  const { actions, requests } = catalogue()
  await actions.findTillProducts({ query: "", limit: 50, offset: 50 })
  assert.equal(requests[0].where.shopkeeperId, "my-store")
  assert.equal(requests[0].take, 50)
  assert.equal(requests[0].skip, 50)
  assert.equal((await actions.findTillProducts({ query: "", offset: -1 })).length, 0)
  assert.equal(requests.length, 1)
})

test("barcode matches bypass pagination and stay exact", async () => {
  const { actions, requests } = catalogue()
  const matches = await actions.findTillProducts({ query: "123456", offset: 50 })
  assert.equal(matches[0].id, "product")
  assert.equal(requests.length, 1)
  assert.equal(requests[0].where.barcode, "123456")
  assert.equal(requests[0].skip, undefined)
})
